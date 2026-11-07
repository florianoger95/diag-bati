import { ActionRow, Answer, MeasureRow, observationsOf, OTHER_VALUE, URGENCIES, Urgency, Visit } from '../model/data';

export { observationsOf } from '../model/data';
import {
  ChecklistTemplate,
  EnumOption,
  Item,
  ItemRole,
  ResolvedItem,
  ResolvedSection,
  ResolvedTemplate,
} from '../model/template';

/** Remplace les optionSets par leurs options et ajoute le pied de section. Ne modifie pas l'entrée. */
export function resolveTemplate(template: ChecklistTemplate): ResolvedTemplate {
  const sets = template.optionSets ?? {};
  const resolveItem = (item: Item, fromFooter = false): ResolvedItem => {
    const options: EnumOption[] | undefined =
      typeof item.options === 'string' ? sets[item.options] : item.options;
    const resolved: ResolvedItem = { ...item, options: options?.map((o) => ({ ...o })) };
    if (resolved.options === undefined) delete resolved.options;
    if (fromFooter) resolved.fromFooter = true;
    return resolved;
  };
  const footer = template.sectionFooter ?? [];
  const sections: ResolvedSection[] = template.sections.map((section) => ({
    ...section,
    items: [
      ...section.items.map((i) => resolveItem(i)),
      ...(section.footer === false ? [] : footer.map((i) => resolveItem(i, true))),
    ],
  }));
  return {
    templateId: template.templateId,
    version: template.version,
    label: template.label,
    description: template.description,
    projectFields: template.projectFields.map((i) => resolveItem(i)),
    visitFields: template.visitFields.map((i) => resolveItem(i)),
    sections,
  };
}

export function sectionItems(template: ResolvedTemplate, sectionId: string): ResolvedItem[] {
  return template.sections.find((s) => s.id === sectionId)?.items ?? [];
}

/** Une photo est visible dans la révision r si elle y a été ajoutée avant et pas encore retirée. */
export function isPhotoVisible(photo: { addedInRevision: number; removedInRevision?: number }, revision: number): boolean {
  return photo.addedInRevision <= revision && (photo.removedInRevision === undefined || photo.removedInRevision > revision);
}

/**
 * Réponse modifiée par une mise à jour : dans la révision courante (« latest »),
 * ou depuis la visite initiale (« all »).
 */
export function isRevised(answer: Pick<Answer, 'changedInRevision'>, revision: number, mode: 'latest' | 'all'): boolean {
  if (revision === 0) return false;
  return mode === 'latest' ? answer.changedInRevision === revision : answer.changedInRevision > 0;
}

/** Item qui compte dans la progression (les titres et les photos n'en font pas partie). */
export function isCountable(item: ResolvedItem): boolean {
  return item.type !== 'heading' && item.type !== 'photo';
}

export function hasValue(item: ResolvedItem, answer: Pick<Answer, 'value' | 'other'> | undefined): boolean {
  if (!answer) return false;
  const v = answer.value;
  switch (item.type) {
    case 'heading':
    case 'photo':
      return false;
    case 'boolean':
      return typeof v === 'boolean';
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'enum':
      if (v === OTHER_VALUE) return !!answer.other?.trim();
      return typeof v === 'string' && v !== '';
    case 'multi':
      return (Array.isArray(v) && v.length > 0) || !!answer.other?.trim();
    case 'measures':
      return Array.isArray(v) && (v as MeasureRow[]).some((r) => r.values?.some((x) => typeof x === 'number'));
    case 'actions':
      return Array.isArray(v) && (v as ActionRow[]).some((r) => !!r.text?.trim());
    default:
      return typeof v === 'string' && v.trim() !== '';
  }
}

/** Une réponse compte dès qu'elle a une valeur ou une observation. */
export function isAnswered(item: ResolvedItem, answer: Answer | undefined): boolean {
  if (item.type === 'heading' || !answer) return false;
  return hasValue(item, answer) || observationsOf(answer).some((o) => o.text.trim() !== '');
}

export function isOutOfRange(item: Pick<Item, 'min' | 'max'>, value: unknown): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return (item.min !== undefined && value < item.min) || (item.max !== undefined && value > item.max);
}

export interface Progress {
  answered: number;
  total: number;
}

export function instanceProgress(items: ResolvedItem[], answers: Answer[]): Progress {
  const byItem = new Map(answers.map((a) => [a.itemId, a]));
  const countable = items.filter(isCountable);
  return {
    answered: countable.filter((i) => isAnswered(i, byItem.get(i.id))).length,
    total: countable.length,
  };
}

export function answerKey(instanceId: string, itemId: string): string {
  return `${instanceId}|${itemId}`;
}

function indexAnswers(answers: Answer[]): Map<string, Answer> {
  return new Map(answers.map((a) => [answerKey(a.instanceId, a.itemId), a]));
}

function sortedInstances(visit: Visit, template: ResolvedTemplate) {
  const sectionOrder = new Map(template.sections.map((s, i) => [s.id, i]));
  return [...visit.instances].sort(
    (a, b) => (sectionOrder.get(a.sectionId) ?? 0) - (sectionOrder.get(b.sectionId) ?? 0) || a.order - b.order,
  );
}

export interface ItemRef {
  instanceId: string;
  instanceLabel: string;
  sectionId: string;
  itemId: string;
  itemLabel: string;
}

export function missingRequired(
  template: ResolvedTemplate,
  visit: Visit,
  answers: Answer[],
  photos: { instanceId: string | null; itemId: string | null }[] = [],
): ItemRef[] {
  const index = indexAnswers(answers);
  const withPhotos = new Set(photos.map((p) => answerKey(p.instanceId ?? '', p.itemId ?? '')));
  const missing: ItemRef[] = [];
  for (const instance of sortedInstances(visit, template)) {
    for (const item of sectionItems(template, instance.sectionId)) {
      if (!item.required || item.type === 'heading') continue;
      const done = item.type === 'photo'
        ? withPhotos.has(answerKey(instance.id, item.id))
        : isAnswered(item, index.get(answerKey(instance.id, item.id)));
      if (!done) {
        missing.push({
          instanceId: instance.id, instanceLabel: instance.label, sectionId: instance.sectionId,
          itemId: item.id, itemLabel: item.label,
        });
      }
    }
  }
  return missing;
}

const urgencyRank = (u: Urgency) => URGENCIES.indexOf(u);

export interface DefectRef extends ItemRef {
  urgency: Urgency;
  observation: string;
  /** Observation concernée (`main` pour la première). */
  obsId: string;
}

/** Désordres : un par observation qui en porte un. */
export function collectDefects(template: ResolvedTemplate, visit: Visit, answers: Answer[]): DefectRef[] {
  const index = indexAnswers(answers);
  const defects: DefectRef[] = [];
  for (const instance of sortedInstances(visit, template)) {
    for (const item of sectionItems(template, instance.sectionId)) {
      for (const o of observationsOf(index.get(answerKey(instance.id, item.id)))) {
        if (!o.defect) continue;
        defects.push({
          instanceId: instance.id, instanceLabel: instance.label, sectionId: instance.sectionId,
          itemId: item.id, itemLabel: item.label, urgency: o.defect.urgency, observation: o.text, obsId: o.id,
        });
      }
    }
  }
  // tri stable : par urgence, puis ordre de la visite
  return defects.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency));
}

type ProbeSource = Pick<Answer, 'observation' | 'defect' | 'probe' | 'extra' | 'inherited'>;

/** Observations de la réponse qui portent le repère « À sonder », ou le portaient dans la visite précédente. */
export function probeEntries(answer: ProbeSource | undefined): { id: string; text: string; done: boolean }[] {
  if (!answer) return [];
  const before = new Set(answer.inherited
    ? observationsOf({ ...answer.inherited, probe: answer.inherited.probe }).filter((o) => o.probe).map((o) => o.id)
    : []);
  return observationsOf(answer)
    .filter((o) => o.probe || before.has(o.id))
    .map((o) => ({ id: o.id, text: o.text, done: !o.probe }));
}

/** La réponse porte le repère « À sonder », ou le portait dans la visite précédente. */
export function isProbeRelated(answer: ProbeSource | undefined): boolean {
  return probeEntries(answer).length > 0;
}

export interface ProbeRef extends ItemRef {
  observation: string;
  obsId: string;
  /** Repère levé dans cette mise à jour (il était posé dans la visite précédente). */
  done: boolean;
}

/** Repères « À sonder », dans l'ordre de la visite (fiches, items, observations). */
export function collectProbes(template: ResolvedTemplate, visit: Visit, answers: Answer[]): ProbeRef[] {
  const index = indexAnswers(answers);
  const probes: ProbeRef[] = [];
  for (const instance of sortedInstances(visit, template)) {
    for (const item of sectionItems(template, instance.sectionId)) {
      for (const e of probeEntries(index.get(answerKey(instance.id, item.id)))) {
        probes.push({
          instanceId: instance.id, instanceLabel: instance.label, sectionId: instance.sectionId,
          itemId: item.id, itemLabel: item.label, observation: e.text, obsId: e.id, done: e.done,
        });
      }
    }
  }
  return probes;
}

export interface ActionRef extends ItemRef, ActionRow {
  role?: ItemRole;
}

export function collectActions(
  template: ResolvedTemplate, visit: Visit, answers: Answer[], role?: ItemRole,
): ActionRef[] {
  const index = indexAnswers(answers);
  const actions: ActionRef[] = [];
  for (const instance of sortedInstances(visit, template)) {
    for (const item of sectionItems(template, instance.sectionId)) {
      if (item.type !== 'actions' || (role && item.role !== role)) continue;
      const rows = index.get(answerKey(instance.id, item.id))?.value;
      if (!Array.isArray(rows)) continue;
      for (const row of rows as ActionRow[]) {
        if (!row.text?.trim()) continue;
        actions.push({
          ...row, role: item.role,
          instanceId: instance.id, instanceLabel: instance.label, sectionId: instance.sectionId,
          itemId: item.id, itemLabel: item.label,
        });
      }
    }
  }
  return actions.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency));
}
