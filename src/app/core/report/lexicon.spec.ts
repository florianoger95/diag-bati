import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyLexicon,
  compileLexicon,
  findTerms,
  Lexicon,
  LEXICON_EXCLUDE,
  stripExclusions,
  toggleExclusion,
} from './lexicon';

const lexicon: Lexicon = {
  version: '1.0.0',
  note: '* Les mots signalés…',
  groups: [{ id: 'charpente', label: 'Charpente', annexPages: [1] }],
  terms: [
    { id: 'panne', group: 'charpente', forms: ['panne', 'pannes'] },
    { id: 'panne-sabliere', group: 'charpente', forms: ['panne sablière', 'pannes sablières'] },
    { id: 'chenau', group: 'charpente', forms: ['chéneau', 'chêneau', 'chéneaux'] },
    { id: 'chevron', group: 'charpente', forms: ['chevron', 'chevrons'] },
    { id: 'entrait', group: 'charpente', forms: ['entrait', 'entraits'] },
    { id: 'avant-toit', group: 'charpente', forms: ['avant-toit'] },
    { id: 'tableau', group: 'charpente', forms: ['tableau', 'tableaux'], except: ['tableau électrique', 'tableau divisionnaire'] },
  ],
};
const compiled = compileLexicon(lexicon);
const mark = (text: string, mode: 'every' | 'first' = 'every') => applyLexicon(text, compiled, { mode }).text;

describe('applyLexicon', () => {
  it('ajoute un astérisque après chaque terme, casse d’origine conservée', () => {
    expect(mark('Chevrons et pannes en bon état. Les chevrons sont secs.'))
      .toBe('Chevrons* et pannes* en bon état. Les chevrons* sont secs.');
  });

  it('privilégie l’expression la plus longue', () => {
    expect(mark('La panne sablière est attaquée.')).toBe('La panne sablière* est attaquée.');
  });

  it('reconnaît les variantes d’accent listées', () => {
    expect(mark('Le chêneau et le chéneau.')).toBe('Le chêneau* et le chéneau*.');
  });

  it('ne marque pas un terme inclus dans un autre mot', () => {
    expect(mark('Il faudra dépanner la pompe ; panneaux neufs.')).toBe('Il faudra dépanner la pompe ; panneaux neufs.');
  });

  it('gère la ponctuation, les parenthèses et les mots composés', () => {
    expect(mark('(chevrons), avant-toit; entrait.')).toBe('(chevrons*), avant-toit*; entrait*.');
  });

  it('traite les apostrophes droite et typographique de la même façon', () => {
    expect(mark("l'entrait et l’entrait")).toBe("l'entrait* et l’entrait*");
  });

  it('ne double pas un astérisque déjà saisi', () => {
    expect(mark('Les chevrons* sont sains.')).toBe('Les chevrons* sont sains.');
  });

  it('respecte les exceptions du lexique', () => {
    expect(mark('Le tableau électrique et le tableau de la fenêtre.'))
      .toBe('Le tableau électrique et le tableau* de la fenêtre.');
  });

  it('ignore une occurrence exclue par l’utilisateur et retire le marqueur invisible', () => {
    const text = `Retirer les souches. Le chevron${LEXICON_EXCLUDE} gauche et le chevron droit.`;
    expect(mark(text)).toBe('Retirer les souches. Le chevron gauche et le chevron* droit.');
  });

  it('mode « première occurrence » : un seul astérisque par terme dans tout le rapport', () => {
    const state = { mode: 'first' as const, seen: new Set<string>() };
    expect(applyLexicon('Chevrons et chevrons.', compiled, state).text).toBe('Chevrons* et chevrons.');
    expect(applyLexicon('Un chevron.', compiled, state).text).toBe('Un chevron.');
  });

  it('indique les termes marqués (pour la note de couverture et l’annexe)', () => {
    expect(applyLexicon('Le chéneau et les pannes.', compiled, { mode: 'every' }).terms).toEqual(['chenau', 'panne']);
  });
});

describe('findTerms et exclusions', () => {
  it('liste les occurrences avec leur état', () => {
    const text = `chevron, panne${LEXICON_EXCLUDE} sablière`;
    const found = findTerms(text, compiled);
    expect(found.map((f) => [text.slice(f.start, f.end), f.excluded])).toEqual([
      ['chevron', false],
      ['panne', true],
    ]);
  });

  it('bascule l’exclusion d’une occurrence et la retire', () => {
    const text = 'Le chevron et le chevron.';
    const excluded = toggleExclusion(text, compiled, 1);
    expect(excluded).toBe(`Le chevron et le chevron${LEXICON_EXCLUDE}.`);
    expect(toggleExclusion(excluded, compiled, 1)).toBe(text);
  });

  it('retire les marqueurs invisibles pour l’export', () => {
    expect(stripExclusions(`chevron${LEXICON_EXCLUDE} et panne`)).toBe('chevron et panne');
  });
});

describe('lexique livré', () => {
  const shipped = JSON.parse(readFileSync(join(process.cwd(), 'public', 'config', 'lexicon.json'), 'utf-8')) as Lexicon;

  it('a des identifiants uniques, des groupes connus et au moins 60 termes', () => {
    const ids = shipped.terms.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(shipped.groups.map((g) => g.id));
    expect(shipped.terms.every((t) => groups.has(t.group) && t.forms.length > 0)).toBe(true);
    expect(shipped.terms.length).toBeGreaterThanOrEqual(60);
  });

  it('marque les termes du rapport d’exemple', () => {
    const c = compileLexicon(shipped);
    const text = applyLexicon(
      "Débords de toit avec abouts de pannes et chevrons exposés. Le chéneau est encombré. La souche de cheminée. " +
      "Absence de rejingots et de larmiers. Escalier quart tournant bas, limon français et contremarches.",
      c, { mode: 'every' },
    ).text;
    for (const t of ['pannes*', 'chevrons*', 'chéneau*', 'souche*', 'rejingots*', 'larmiers*', 'quart tournant bas*', 'limon français*', 'contremarches*']) {
      expect(text).toContain(t);
    }
  });
});
