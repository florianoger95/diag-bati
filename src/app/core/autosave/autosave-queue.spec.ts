import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveQueue } from './autosave-queue';

interface Patch { value?: string; observation?: string }

let writes: { key: string; patch: Patch }[];
let queue: AutosaveQueue<Patch>;
let failNext: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  writes = [];
  failNext = false;
  queue = new AutosaveQueue<Patch>(async (key, patch) => {
    if (failNext) {
      failNext = false;
      throw new Error('QuotaExceededError');
    }
    writes.push({ key, patch });
  }, 300);
});

afterEach(() => vi.useRealTimers());

describe('AutosaveQueue', () => {
  it('écrit immédiatement une modification sans délai', async () => {
    queue.push('a', { value: 'bon' });
    await queue.idle();
    expect(writes).toEqual([{ key: 'a', patch: { value: 'bon' } }]);
  });

  it('regroupe les frappes rapprochées en une seule écriture', async () => {
    queue.push('a', { observation: 'F' }, { debounce: true });
    vi.advanceTimersByTime(100);
    queue.push('a', { observation: 'Fi' }, { debounce: true });
    vi.advanceTimersByTime(100);
    queue.push('a', { observation: 'Fis' }, { debounce: true });
    expect(writes).toEqual([]);
    vi.advanceTimersByTime(300);
    await queue.idle();
    expect(writes).toEqual([{ key: 'a', patch: { observation: 'Fis' } }]);
  });

  it('fusionne les champs d’une même clé', async () => {
    queue.push('a', { observation: 'texte' }, { debounce: true });
    queue.push('a', { value: 'mauvais' });
    await queue.idle();
    expect(writes).toEqual([{ key: 'a', patch: { observation: 'texte', value: 'mauvais' } }]);
  });

  it('flush écrit tout de suite ce qui attend (fermeture de Safari)', async () => {
    queue.push('a', { observation: 'en cours' }, { debounce: true });
    queue.push('b', { observation: 'autre' }, { debounce: true });
    await queue.flush();
    expect(writes.map((w) => w.key).sort()).toEqual(['a', 'b']);
  });

  it('expose le nombre d’écritures en attente', async () => {
    const counts: number[] = [];
    queue.onPendingChange = (n) => counts.push(n);
    queue.push('a', { value: 'x' }, { debounce: true });
    expect(queue.pending).toBe(1);
    await queue.flush();
    expect(queue.pending).toBe(0);
    expect(counts.at(-1)).toBe(0);
  });

  it('écrit dans l’ordre et ne perd pas une modification arrivée pendant une écriture', async () => {
    queue.push('a', { value: '1' });
    queue.push('a', { value: '2' });
    await queue.idle();
    expect(writes.at(-1)).toEqual({ key: 'a', patch: { value: '2' } });
  });

  it('tient un journal synchrone des modifications en attente, vidé après écriture', async () => {
    const journal = new Map<string, Patch>();
    queue.journal = { set: (k, p) => journal.set(k, p), delete: (k) => journal.delete(k) };
    queue.push('a', { observation: 'Abs' }, { debounce: true });
    queue.push('a', { value: 'mauvais' }, { debounce: true });
    // écrit avant toute écriture asynchrone : survit à un arrêt brutal de Safari
    expect(journal.get('a')).toEqual({ observation: 'Abs', value: 'mauvais' });
    await queue.flush();
    expect(journal.has('a')).toBe(false);
  });

  it('signale une erreur d’écriture et garde la modification pour réessayer', async () => {
    const errors: unknown[] = [];
    queue.onError = (e) => errors.push(e);
    failNext = true;
    queue.push('a', { value: 'x' });
    await queue.idle();
    expect(errors).toHaveLength(1);
    expect(queue.pending).toBe(1);
    await queue.flush();
    expect(writes).toEqual([{ key: 'a', patch: { value: 'x' } }]);
    expect(queue.pending).toBe(0);
  });
});
