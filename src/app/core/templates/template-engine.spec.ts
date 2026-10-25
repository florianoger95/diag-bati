import { describe, expect, it } from 'vitest';
import { sampleTemplate } from '../testing/fixtures';
import { Answer, Visit } from '../model/data';
import { ChecklistTemplate } from '../model/template';
import { validateTemplate } from './template-validator';
import {
  collectActions,
  collectDefects,
  instanceProgress,
  isAnswered,
  isOutOfRange,
  missingRequired,
  resolveTemplate,
  sectionItems,
} from './template-engine';

function answer(instanceId: string, itemId: string, partial: Partial<Answer>): Answer {
  return {
    visitId: 'v1', instanceId, itemId, value: null, observation: '',
    changedInRevision: 0, updatedAt: 0, ...partial,
  };
}

function visitWith(instances: Visit['instances']): Visit {
  return {
    id: 'v1', projectId: 'p1', revision: 0, fields: {}, instances, conclusion: '',
    status: 'draft', cursor: null, createdAt: 0, updatedAt: 0,
  };
}

describe('validateTemplate', () => {
  it('accepte un modèle correct', () => {
    const result = validateTemplate(sampleTemplate());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('refuse un objet qui n’est pas un modèle', () => {
    expect(validateTemplate(null).ok).toBe(false);
    expect(validateTemplate({ templateId: 'x' }).ok).toBe(false);
  });

  it('signale les identifiants d’items en double, y compris avec le pied de section', () => {
    const t = sampleTemplate();
    t.sections[1].items.push({ id: 'couv-etat', label: 'Doublon', type: 'text', required: false });
    t.sections[2].items.push({ id: 'commentaires', label: 'Conflit pied', type: 'text', required: false });
    const result = validateTemplate(t);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('couv-etat');
    expect(result.errors.join('\n')).toContain('commentaires');
  });

  it('signale les sections en double, les types inconnus et les optionSets absents', () => {
    const t = sampleTemplate() as ChecklistTemplate;
    t.sections.push({ ...t.sections[0], items: [] });
    (t.sections[1].items[1] as { type: string }).type = 'radio';
    t.sections[1].items[2].options = 'inexistant';
    const errors = validateTemplate(t).errors.join('\n');
    expect(errors).toContain('generalites');
    expect(errors).toContain('radio');
    expect(errors).toContain('inexistant');
  });

  it('exige des options pour enum/multi et une config pour measures', () => {
    const t = sampleTemplate();
    t.sections[1].items[3].options = [];
    delete t.sections[2].items[1].measures;
    const errors = validateTemplate(t).errors.join('\n');
    expect(errors).toContain('couv-patho');
    expect(errors).toContain('fac-humidite');
  });

  it('vérifie le format de templateId et de version', () => {
    const t = sampleTemplate();
    t.templateId = 'Mon Modèle';
    t.version = 'v1';
    const errors = validateTemplate(t).errors.join('\n');
    expect(errors).toContain('templateId');
    expect(errors).toContain('version');
  });
});

describe('resolveTemplate', () => {
  const resolved = resolveTemplate(sampleTemplate());

  it('remplace les références d’optionSet par les options', () => {
    const etat = resolved.sections[1].items.find((i) => i.id === 'couv-etat')!;
    expect(etat.options?.map((o) => o.value)).toEqual(['bon', 'moyen', 'mauvais']);
  });

  it('ajoute le pied de section sauf si footer: false', () => {
    expect(resolved.sections[0].items.map((i) => i.id)).toEqual(['gen-temps', 'gen-plan']);
    const couv = resolved.sections[1].items;
    expect(couv.slice(-3).map((i) => i.id)).toEqual(['commentaires', 'preconisations', 'securite']);
    expect(couv.slice(-3).every((i) => i.fromFooter)).toBe(true);
  });

  it('n’altère pas le modèle d’origine', () => {
    const t = sampleTemplate();
    resolveTemplate(t);
    expect(t.sections[1].items[2].options).toBe('etat');
  });

  it('sectionItems renvoie les items d’une section par son id', () => {
    expect(sectionItems(resolved, 'facades').map((i) => i.id)).toContain('fac-pente');
    expect(sectionItems(resolved, 'inconnue')).toEqual([]);
  });
});

describe('isAnswered', () => {
  const resolved = resolveTemplate(sampleTemplate());
  const item = (id: string) => resolved.sections.flatMap((s) => s.items).find((i) => i.id === id)!;

  it('ne compte jamais un heading', () => {
    expect(isAnswered(item('couv-titre'), answer('c', 'couv-titre', { observation: 'x' }))).toBe(false);
  });

  it('gère chaque type de valeur', () => {
    expect(isAnswered(item('couv-gouttiere'), answer('c', 'x', { value: false }))).toBe(true);
    expect(isAnswered(item('couv-gouttiere'), answer('c', 'x', { value: null }))).toBe(false);
    expect(isAnswered(item('couv-etat'), answer('c', 'x', { value: 'bon' }))).toBe(true);
    expect(isAnswered(item('couv-type'), answer('c', 'x', { value: '__autre', other: '' }))).toBe(false);
    expect(isAnswered(item('couv-type'), answer('c', 'x', { value: '__autre', other: 'Mansart' }))).toBe(true);
    expect(isAnswered(item('couv-patho'), answer('c', 'x', { value: [] }))).toBe(false);
    expect(isAnswered(item('couv-patho'), answer('c', 'x', { value: ['mousse'] }))).toBe(true);
    expect(isAnswered(item('gen-temps'), answer('g', 'x', { value: '   ' }))).toBe(false);
    expect(isAnswered(item('fac-pente'), answer('f', 'x', { value: 0 }))).toBe(true);
    expect(isAnswered(item('fac-humidite'), answer('f', 'x', {
      value: [{ id: 'r', point: '0 m', values: [null] }],
    }))).toBe(false);
    expect(isAnswered(item('fac-humidite'), answer('f', 'x', {
      value: [{ id: 'r', point: '0 m', values: [7.5] }],
    }))).toBe(true);
    expect(isAnswered(item('preconisations'), answer('c', 'x', {
      value: [{ id: 'a', text: 'Nettoyer le chéneau', urgency: 'short' }],
    }))).toBe(true);
  });

  it('considère une observation seule comme une réponse', () => {
    expect(isAnswered(item('couv-etat'), answer('c', 'x', { observation: 'Non visible' }))).toBe(true);
  });

  it('renvoie faux sans réponse', () => {
    expect(isAnswered(item('couv-etat'), undefined)).toBe(false);
  });
});

describe('progression, obligatoires, désordres, actions', () => {
  const resolved = resolveTemplate(sampleTemplate());
  const visit = visitWith([
    { id: 'generalites', sectionId: 'generalites', label: 'Généralités', order: 0 },
    { id: 'bat-a', sectionId: 'couverture', label: 'Bâtiment A', order: 1 },
    { id: 'nord', sectionId: 'facades', label: 'Nord', order: 2 },
  ]);
  const answers = [
    answer('bat-a', 'couv-type', { value: '2-pans' }),
    answer('bat-a', 'couv-etat', { value: 'mauvais', observation: 'Tuiles poreuses', defect: { urgency: 'short' } }),
    answer('bat-a', 'preconisations', { value: [
      { id: 'a1', text: 'Démousser', urgency: 'medium' },
      { id: 'a2', text: '   ', urgency: 'short' },
    ] }),
    answer('bat-a', 'securite', { value: [{ id: 's1', text: 'Étayer', urgency: 'immediate' }] }),
    answer('nord', 'fac-pente', { value: 4, defect: { urgency: 'monitor' } }),
  ];

  it('calcule la progression d’une instance (headings et photos exclus)', () => {
    const p = instanceProgress(sectionItems(resolved, 'couverture'), answers.filter((a) => a.instanceId === 'bat-a'));
    // type, etat, patho, gouttiere, commentaires, preconisations, securite = 7 ; 4 répondus
    expect(p).toEqual({ answered: 4, total: 7 });
  });

  it('liste les obligatoires manquants par instance', () => {
    const missing = missingRequired(resolved, visit, answers);
    expect(missing.map((m) => `${m.instanceId}/${m.itemId}`)).toEqual(['generalites/gen-temps']);
  });

  it('collecte les désordres triés par urgence', () => {
    const defects = collectDefects(resolved, visit, answers);
    expect(defects.map((d) => [d.instanceLabel, d.itemLabel, d.urgency])).toEqual([
      ['Bâtiment A', 'État des tuiles', 'short'],
      ['Nord', "Pente de l'appui", 'monitor'],
    ]);
    expect(defects[0].observation).toBe('Tuiles poreuses');
  });

  it('collecte les actions par rôle en ignorant les lignes vides', () => {
    expect(collectActions(resolved, visit, answers, 'recommendation').map((a) => a.text)).toEqual(['Démousser']);
    expect(collectActions(resolved, visit, answers).map((a) => a.text)).toEqual(['Étayer', 'Démousser']);
  });

  it('isOutOfRange signale une valeur hors bornes', () => {
    const pente = sectionItems(resolved, 'facades').find((i) => i.id === 'fac-pente')!;
    expect(isOutOfRange(pente, 4)).toBe(true);
    expect(isOutOfRange(pente, 11)).toBe(false);
    expect(isOutOfRange(pente, null)).toBe(false);
  });
});
