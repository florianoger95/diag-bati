import { describe, expect, it } from 'vitest';
import { sampleTemplate } from '../testing/fixtures';
import { Answer, Visit } from '../model/data';
import { resolveTemplate, sectionItems } from './template-engine';
import { answerSummary, defectsByInstance, questionList, questionMarks, sheetTitle } from './question-list';

function answer(instanceId: string, itemId: string, partial: Partial<Answer>): Answer {
  return {
    visitId: 'v1', instanceId, itemId, value: null, observation: '',
    changedInRevision: 0, updatedAt: 0, ...partial,
  };
}

const template = resolveTemplate(sampleTemplate());
const item = (sectionId: string, id: string) => sectionItems(template, sectionId).find((i) => i.id === id)!;

describe('sheetTitle', () => {
  it('nomme une fiche répétable par sa section courte et son libellé', () => {
    const section = template.sections.find((s) => s.id === 'couverture')!;
    expect(sheetTitle(section, { label: 'Bâtiment 1' })).toBe('Couverture · Bâtiment 1');
  });

  it('nomme une fiche unique par sa section, sans « Diagnostic »', () => {
    expect(sheetTitle(template.sections[0], { label: 'Généralités' })).toBe('Généralités');
    expect(sheetTitle({ ...template.sections[0], label: 'Diagnostic environnement et mitoyenneté' }, { label: 'x' }))
      .toBe('Environnement et mitoyenneté');
  });
});

describe('questionList', () => {
  it('numérote les questions, garde les rubriques comme intertitres et met à part le pied de section', () => {
    const list = questionList(sectionItems(template, 'couverture'));
    expect(list.rows.map((r) => (r.kind === 'heading' ? `# ${r.item.label}` : `${r.number}. ${r.item.id}`))).toEqual([
      '# Tuiles', '1. couv-type', '2. couv-etat', '3. couv-patho', '4. couv-gouttiere',
    ]);
    expect(list.questions.map((q) => q.id)).toEqual(['couv-type', 'couv-etat', 'couv-patho', 'couv-gouttiere']);
    expect(list.footer.map((i) => i.id)).toEqual(['commentaires', 'preconisations', 'securite']);
  });

  it('section sans pied : pas de synthèse de fiche', () => {
    expect(questionList(sectionItems(template, 'generalites')).footer).toEqual([]);
  });
});

describe('answerSummary', () => {
  it('résume la réponse et le nombre d’observations', () => {
    const etat = item('couverture', 'couv-etat');
    expect(answerSummary(etat, answer('i', 'couv-etat', {
      value: 'mauvais', observation: 'Tuiles poreuses', extra: [{ id: 'o2', text: 'Rive gauche' }],
    }), 0)).toBe('Mauvais · 2 observations');
    expect(answerSummary(etat, answer('i', 'couv-etat', { value: 'bon', observation: 'RAS' }), 0)).toBe('Bon');
    expect(answerSummary(etat, answer('i', 'couv-etat', { observation: 'Tuiles poreuses' }), 0)).toBe('1 observation');
  });

  it('liste plusieurs choix', () => {
    const patho = item('couverture', 'couv-patho');
    expect(answerSummary(patho, answer('i', 'couv-patho', { value: ['mousse', 'cassees'] }), 0)).toBe('Mousse, Cassées');
  });

  it('compte les photos d’un item photo, et les plans d’un item plan', () => {
    const plan = item('generalites', 'gen-plan');
    expect(answerSummary(plan, undefined, 2)).toBe('2 plans');
    expect(answerSummary({ ...plan, photoKind: 'photo' }, undefined, 1)).toBe('1 photo');
  });

  it('chaîne vide quand rien n’est saisi (affiché « Non renseigné »)', () => {
    expect(answerSummary(item('couverture', 'couv-etat'), undefined, 0)).toBe('');
    expect(answerSummary(item('couverture', 'couv-etat'), answer('i', 'couv-etat', { observation: '  ' }), 3)).toBe('');
  });
});

describe('questionMarks', () => {
  it('compte les désordres et les repères « À sonder » de toutes les observations, avec l’urgence la plus forte', () => {
    expect(questionMarks(answer('i', 'x', {
      observation: 'a', defect: { urgency: 'medium' }, probe: true,
      extra: [{ id: 'o2', text: 'b', defect: { urgency: 'short' } }, { id: 'o3', text: 'c', probe: true }],
    }))).toEqual({ defects: 2, worst: 'short', probes: 2 });
    expect(questionMarks(undefined)).toEqual({ defects: 0, worst: null, probes: 0 });
  });
});

describe('defectsByInstance', () => {
  it('compte les désordres de chaque fiche', () => {
    const visit: Visit = {
      id: 'v1', projectId: 'p1', revision: 0, fields: {}, conclusion: '', status: 'draft', cursor: null, createdAt: 0, updatedAt: 0,
      instances: [
        { id: 'gen', sectionId: 'generalites', label: 'Généralités', order: 0 },
        { id: 'b1', sectionId: 'couverture', label: 'Bâtiment 1', order: 0 },
        { id: 'b2', sectionId: 'couverture', label: 'Bâtiment 2', order: 1 },
      ],
    };
    const answers = [
      answer('b1', 'couv-etat', { observation: 'a', defect: { urgency: 'short' }, extra: [{ id: 'o2', text: 'b', defect: { urgency: 'monitor' } }] }),
      answer('b2', 'couv-patho', { observation: 'c', defect: { urgency: 'immediate' } }),
    ];
    expect(defectsByInstance(template, visit, answers)).toEqual(new Map([['b1', 2], ['b2', 1]]));
  });
});
