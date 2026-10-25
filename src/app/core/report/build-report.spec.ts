import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Answer, Photo, Project, Visit } from '../model/data';
import { sampleTemplate } from '../testing/fixtures';
import { resolveTemplate } from '../templates/template-engine';
import { buildReport, formatAnswer, ReportInput } from './build-report';
import { compileLexicon, Lexicon } from './lexicon';
import { Block, ReportConfig } from './report-model';

const config: ReportConfig = JSON.parse(readFileSync(join(process.cwd(), 'public', 'config', 'report.config.json'), 'utf-8'));
const template = sampleTemplate();
const resolved = resolveTemplate(template);
const item = (id: string) => [...resolved.visitFields, ...resolved.sections.flatMap((s) => s.items)].find((i) => i.id === id)!;

function answer(instanceId: string, itemId: string, partial: Partial<Answer>): Answer {
  return { visitId: 'v1', instanceId, itemId, value: null, observation: '', changedInRevision: 0, updatedAt: 0, ...partial };
}

function photo(partial: Partial<Photo>): Photo {
  return {
    id: 'p', projectId: 'p1', blobId: 'b', instanceId: null, itemId: null, kind: 'photo', number: 1, caption: '',
    order: 0, annotations: [], addedInRevision: 0, createdAt: 0, updatedAt: 0, ...partial,
  };
}

const project: Project = {
  id: 'p1', reference: '2026-10-001', fields: { projet: 'PROJET MAISON DES TILLEULS', adresse: '12 rue des Lilas' },
  templateId: template.templateId, templateVersion: template.version, templateSnapshot: template,
  legend: [{ color: '#ff0000', label: 'Fissure structurelle' }, { color: '#0000ff', label: 'Eau' }],
  createdAt: 0, updatedAt: 0,
};

const visit: Visit = {
  id: 'v1', projectId: 'p1', revision: 0,
  fields: { 'date-visite': '2026-09-17T13:30', temperature: 21.6 },
  instances: [
    { id: 'generalites', sectionId: 'generalites', label: 'Généralités', order: 0 },
    { id: 'bat-a', sectionId: 'couverture', label: 'Bâtiment A', order: 0 },
    { id: 'bat-b', sectionId: 'couverture', label: 'Bâtiment B', order: 1 },
    { id: 'nord', sectionId: 'facades', label: 'Façade nord', order: 0 },
  ],
  conclusion: 'Fissures importantes - Les causes envisagées sont multiples.\n\nVégétation à contenir.',
  status: 'closed', cursor: null, createdAt: 0, updatedAt: 0,
};

const answers: Answer[] = [
  answer('generalites', 'gen-temps', { value: 'Couvert et sec' }),
  answer('bat-a', 'couv-type', { value: '2-pans' }),
  answer('bat-a', 'couv-etat', { value: 'mauvais', observation: 'Tuiles poreuses sous les chevrons', defect: { urgency: 'short' } }),
  answer('bat-a', 'commentaires', { value: 'Chéneau encombré.' }),
  answer('bat-a', 'preconisations', { value: [
    { id: 'a1', text: 'Démousser la couverture', urgency: 'medium' },
    { id: 'a2', text: 'Reprendre le chéneau', urgency: 'short' },
  ] }),
  answer('bat-a', 'securite', { value: [{ id: 's1', text: 'Surveiller la marquise', urgency: 'immediate' }] }),
  answer('nord', 'fac-pente', { value: 4 }),
];

const photos: Photo[] = [
  photo({ id: 'ph1', number: 1, instanceId: 'bat-a', itemId: 'couv-etat', caption: 'Souche' }),
  photo({ id: 'ph2', number: 2, instanceId: 'bat-a', itemId: 'couv-etat', order: 1 }),
  photo({ id: 'plan1', number: 3, instanceId: 'generalites', itemId: 'gen-plan', kind: 'plan', caption: 'Plan de masse',
    annotations: [{ id: 's', kind: 'rect', x: 0, y: 0, w: 0.1, h: 0.1, color: '#FF0000', width: 0.005 }] }),
];

const lexicon: Lexicon = {
  version: '1', note: '* Mots définis en annexe', groups: [{ id: 'charpente', label: 'Charpente', annexPages: [2] }],
  terms: [{ id: 'chevron', group: 'charpente', forms: ['chevron', 'chevrons'] }, { id: 'chenau', group: 'charpente', forms: ['chéneau'] }],
};

function input(partial: Partial<ReportInput> = {}): ReportInput {
  return {
    project, visit, template: resolved, answers, photos, config,
    lexicon: compileLexicon(lexicon), hasAnnex: true,
    firm: { name: 'Cabinet Test', lines: ['1 rue du Test', 'contact@test.fr'] },
    reportDate: '2026-10-01', ...partial,
  };
}

const plain = (b: Block) => ('runs' in b ? b.runs.map((r) => r.text).join('') : '');
const texts = (blocks: Block[]) => blocks.map(plain).filter(Boolean);

describe('formatAnswer', () => {
  it('met en forme chaque type de réponse', () => {
    expect(formatAnswer(item('couv-gouttiere'), answer('x', 'x', { value: true }))).toBe('Oui');
    expect(formatAnswer(item('couv-etat'), answer('x', 'x', { value: 'mauvais' }))).toBe('Mauvais');
    expect(formatAnswer(item('couv-type'), answer('x', 'x', { value: '__autre', other: 'Mansart' }))).toBe('Mansart');
    expect(formatAnswer(item('couv-patho'), answer('x', 'x', { value: ['mousse', 'cassees'], other: 'lichens' })))
      .toBe('Mousse, Cassées, lichens');
    expect(formatAnswer(item('fac-pente'), answer('x', 'x', { value: 10.5 }))).toBe('10,5 %');
    expect(formatAnswer(item('fac-date'), answer('x', 'x', { value: '2026-10-05' }))).toBe('05/10/2026');
    expect(formatAnswer(item('date-visite'), answer('x', 'x', { value: '2026-09-17T13:30' }))).toBe('17/09/2026 à 13h30');
    expect(formatAnswer(item('fac-humidite'), answer('x', 'x', { value: [
      { id: '0', point: '0 m', values: [7.5] }, { id: '1', point: '1 m', values: [6.5] }, { id: '2', point: '2 m', values: [null] },
    ] }))).toBe('0 m : 7,5 % – 1 m : 6,5 %');
  });
});

describe('buildReport', () => {
  const model = buildReport(input());
  const all = texts(model.blocks);

  it('suit l’ordre des blocs de la configuration', () => {
    const headings = model.blocks.filter((b) => b.type === 'heading' && b.level <= 1).map(plain);
    expect(headings).toEqual([
      "ÉTAT ET DIAGNOSTIC DE L'EXISTANT", 'GÉNÉRALITÉS', 'DIAGNOSTIC COUVERTURE', 'DIAGNOSTIC FAÇADES',
      'CONCLUSION', 'SYNTHÈSE DES DÉSORDRES', 'RÉCAPITULATIF DES TRAVAUX ET ÉCHÉANCES',
    ]);
    const reordered = buildReport(input({ config: { ...config, blocks: ['cover', 'defects', 'body'] } }));
    const h = reordered.blocks.filter((b) => b.type === 'heading' && b.level === 1).map(plain);
    expect(h[0]).toBe('SYNTHÈSE DES DÉSORDRES');
    expect(h).not.toContain('CONCLUSION');
  });

  it('construit la page de garde : cabinet, projet, titre, date, conditions', () => {
    expect(all).toContain('Cabinet Test');
    const projet = model.blocks.find((b) => plain(b) === 'PROJET MAISON DES TILLEULS');
    expect(projet).toMatchObject({ align: 'right' });
    expect(all).toContain('Date et heure de visite : 17/09/2026 à 13h30');
    expect(all).toContain('Température extérieure : 21,6 °C');
  });

  it('rédige les items : « - Libellé : valeur. Observation. » avec désordre et renvoi photos', () => {
    const line = all.find((t) => t.startsWith('- État des tuiles'))!;
    expect(line).toBe('- État des tuiles : Mauvais. Tuiles poreuses sous les chevrons* — Désordre (court terme) — photos 1, 2');
    const p = model.blocks.find((b) => plain(b) === line) as Extract<Block, { type: 'paragraph' }>;
    expect(p.runs.some((r) => r.color === config.colors.defect && r.text.includes('Désordre'))).toBe(true);
  });

  it('titre chaque instance des sections répétables et omet les instances vides', () => {
    expect(all).toContain('BÂTIMENT A');
    expect(all).not.toContain('BÂTIMENT B');
    expect(all).toContain('FAÇADE NORD');
  });

  it('n’imprime un sous-titre que s’il est suivi de contenu', () => {
    expect(all).toContain('Tuiles'); // suivi de « Types de couverture »
    const onlyComment = buildReport(input({ answers: [answer('bat-a', 'commentaires', { value: 'RAS' })], photos: [] }));
    expect(texts(onlyComment.blocks)).not.toContain('Tuiles');
    expect(texts(onlyComment.blocks)).toContain('BÂTIMENT A');
  });

  it('place la grille de photos après les items, avec légende et renvoi', () => {
    const grid = model.blocks.find((b) => b.type === 'photos') as Extract<Block, { type: 'photos' }>;
    expect(grid.photos.map((p) => [p.number, p.caption, p.ref])).toEqual([
      [1, 'Souche', 'État des tuiles'],
      [2, '', 'État des tuiles'],
    ]);
  });

  it('imprime les plans en pleine largeur avec la légende des seules couleurs utilisées', () => {
    const plan = model.blocks.find((b) => b.type === 'plan') as Extract<Block, { type: 'plan' }>;
    expect(plan.photo.number).toBe(3);
    expect(plan.legend).toEqual([{ color: '#ff0000', label: 'Fissure structurelle' }]);
  });

  it('rédige commentaires et préconisations avec leur échéance', () => {
    expect(all).toContain('Commentaires :');
    expect(all).toContain('Chéneau* encombré.');
    expect(all).toContain('Démousser la couverture (moyen terme)');
  });

  it('met en gras l’entrée des paragraphes de conclusion', () => {
    const p = model.blocks.find((b) => plain(b).startsWith('Fissures importantes')) as Extract<Block, { type: 'paragraph' }>;
    expect(p.runs[0]).toMatchObject({ text: 'Fissures importantes -', bold: true });
    expect(all).toContain('Végétation à contenir.');
  });

  it('synthétise les désordres et les travaux par échéance, sécurité en premier', () => {
    const iDefects = all.indexOf('SYNTHÈSE DES DÉSORDRES');
    expect(all[iDefects + 1]).toBe('Court terme');
    expect(all[iDefects + 2]).toContain('Bâtiment A — État des tuiles : Tuiles poreuses');
    const iWorks = all.indexOf('RÉCAPITULATIF DES TRAVAUX ET ÉCHÉANCES');
    expect(all.slice(iWorks + 1, iWorks + 7)).toEqual([
      'Mesures de sécurité à court terme', 'Surveiller la marquise (immédiat) — Bâtiment A',
      'Court terme', 'Reprendre le chéneau* — Bâtiment A',
      'Moyen terme', 'Démousser la couverture — Bâtiment A',
    ]);
    const none = buildReport(input({ answers: [] }));
    expect(texts(none.blocks)).toContain('Aucun désordre relevé.');
  });

  it('lexique : astérisques, note de couverture et annexe ; rien sans annexe importée', () => {
    expect(model.lexiconTerms).toEqual(['chevron', 'chenau']);
    expect(all).toContain('* Mots définis en annexe');
    expect(model.blocks.at(-1)).toEqual({ type: 'annex', pages: 'all' });
    const used = buildReport(input({ config: { ...config, lexicon: { mark: 'every', annex: 'used' } } }));
    expect(used.blocks.at(-1)).toEqual({ type: 'annex', pages: [2] });
    const noAnnex = buildReport(input({ hasAnnex: false }));
    expect(texts(noAnnex.blocks).join(' ')).not.toContain('*');
    expect(noAnnex.blocks.some((b) => b.type === 'annex')).toBe(false);
  });

  it('liste les photos à préparer et nomme le fichier', () => {
    expect(model.photoIds.sort()).toEqual(['ph1', 'ph2', 'plan1']);
    expect(model.fileBaseName).toBe('2026-10-001 PROJET MAISON DES TILLEULS');
  });
});
