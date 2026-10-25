import { describe, expect, it } from 'vitest';
import { diffWords } from './text-diff';

const show = (before: string, after: string) =>
  diffWords(before, after).map((s) => (s.added ? `[${s.text}]` : s.text)).join('');

describe('diffWords', () => {
  it('ne marque rien sur un texte identique', () => {
    expect(diffWords('Tuiles poreuses.', 'Tuiles poreuses.')).toEqual([{ text: 'Tuiles poreuses.', added: false }]);
  });

  it('marque la phrase ajoutée à la fin', () => {
    expect(show('Tuiles poreuses.', 'Tuiles poreuses. Le curage révèle un lattis pourri.'))
      .toBe('Tuiles poreuses.[ Le curage révèle un lattis pourri.]');
  });

  it('marque seulement le mot remplacé', () => {
    expect(show('Fissure de 2 mm sous la fenêtre.', 'Fissure de 5 mm sous la fenêtre.'))
      .toBe('Fissure de [5] mm sous la fenêtre.');
  });

  it('marque tout un texte nouveau', () => {
    expect(diffWords('', 'Nouveau constat.')).toEqual([{ text: 'Nouveau constat.', added: true }]);
  });

  it('ne fait pas apparaître le texte supprimé', () => {
    expect(show('Tuiles poreuses et cassées.', 'Tuiles cassées.')).toBe('Tuiles cassées.');
  });

  it('reste rapide sur un très long texte', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `mot${i}`).join(' ');
    const segments = diffWords(long, `${long} fin`);
    expect(segments.at(-1)).toEqual({ text: ' fin', added: true });
  });
});
