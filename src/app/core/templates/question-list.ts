import { Answer, observationsOf, URGENCIES, Urgency, Visit } from '../model/data';
import { ResolvedItem, ResolvedSection, ResolvedTemplate } from '../model/template';
import { formatAnswer } from '../report/build-report';
import { collectDefects, hasValue } from './template-engine';

/** Titre court d'une fiche pour la barre de visite : « Couverture · Bâtiment 1 », « Environnement et mitoyenneté ». */
export function sheetTitle(section: Pick<ResolvedSection, 'label' | 'repeatable'>, instance: { label: string }): string {
  const short = section.label.replace(/^Diagnostic\s+/i, '');
  const name = short.charAt(0).toUpperCase() + short.slice(1);
  return section.repeatable ? `${name} · ${instance.label}` : name;
}

export type QuestionRow =
  | { kind: 'heading'; item: ResolvedItem }
  | { kind: 'question'; item: ResolvedItem; number: number };

export interface QuestionList {
  /** Questions et intertitres, dans l'ordre de la fiche (sans le pied de section). */
  rows: QuestionRow[];
  /** Questions seules, numérotées dans cet ordre (1 = première). */
  questions: ResolvedItem[];
  /** Rubriques de pied (commentaires, préconisations…) : « Synthèse de la fiche ». */
  footer: ResolvedItem[];
}

/** Colonne des questions d'une fiche : les rubriques `heading` deviennent des intertitres. */
export function questionList(items: ResolvedItem[]): QuestionList {
  const rows: QuestionRow[] = [];
  const questions: ResolvedItem[] = [];
  const footer: ResolvedItem[] = [];
  for (const item of items) {
    if (item.fromFooter) footer.push(item);
    else if (item.type === 'heading') rows.push({ kind: 'heading', item });
    else {
      questions.push(item);
      rows.push({ kind: 'question', item, number: questions.length });
    }
  }
  return { rows, questions, footer };
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Réponse résumée sur une ligne de la liste : « Mauvais · 2 observations », « 2 photos ».
 * Chaîne vide quand rien n'est saisi (la liste affiche « Non renseigné »).
 */
export function answerSummary(item: ResolvedItem, answer: Answer | undefined, photoCount: number): string {
  if (item.type === 'photo') {
    return photoCount ? plural(photoCount, item.photoKind === 'plan' ? 'plan' : 'photo') : '';
  }
  const value = answer && hasValue(item, answer) ? formatAnswer(item, answer) : '';
  const notes = observationsOf(answer).filter((o) => o.text.trim()).length;
  if (!notes) return value;
  if (!value) return plural(notes, 'observation');
  return notes > 1 ? `${value} · ${plural(notes, 'observation')}` : value;
}

export interface QuestionMarks {
  defects: number;
  /** Urgence la plus forte parmi les désordres (null : aucun). */
  worst: Urgency | null;
  probes: number;
}

/** Désordres et repères « À sonder » de toutes les observations d'une réponse. */
export function questionMarks(answer: Answer | undefined): QuestionMarks {
  const entries = observationsOf(answer);
  const urgencies = entries.flatMap((o) => (o.defect ? [o.defect.urgency] : []));
  return {
    defects: urgencies.length,
    worst: URGENCIES.find((u) => urgencies.includes(u)) ?? null,
    probes: entries.filter((o) => o.probe).length,
  };
}

/** Nombre de désordres de chaque fiche (fiches sans désordre absentes). */
export function defectsByInstance(template: ResolvedTemplate, visit: Visit, answers: Answer[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of collectDefects(template, visit, answers)) counts.set(d.instanceId, (counts.get(d.instanceId) ?? 0) + 1);
  return counts;
}
