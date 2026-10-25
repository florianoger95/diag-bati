import { describe, expect, it } from 'vitest';
import { EditJournal } from './edit-journal';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('EditJournal', () => {
  it('retrouve les modifications en attente de sa visite uniquement', () => {
    const storage = new MemoryStorage();
    new EditJournal('v1', storage).set('fac-1|fac-appuis', { observation: 'Absence de rejingot' });
    new EditJournal('v2', storage).set('x|y', { value: 'bon' });
    const pending = new EditJournal('v1', storage).pending();
    expect([...pending]).toEqual([['fac-1|fac-appuis', { observation: 'Absence de rejingot' }]]);
  });

  it('supprime une entrée et ignore une entrée corrompue', () => {
    const storage = new MemoryStorage();
    const journal = new EditJournal('v1', storage);
    journal.set('a|b', { value: 1 });
    journal.delete('a|b');
    storage.setItem('diag-journal|v1|c|d', '{pas du json');
    expect(journal.pending().size).toBe(0);
    expect(storage.length).toBe(0);
  });

  it('fonctionne sans stockage disponible', () => {
    const journal = new EditJournal('v1', null);
    journal.set('a|b', { value: 1 });
    expect(journal.pending().size).toBe(0);
  });
});
