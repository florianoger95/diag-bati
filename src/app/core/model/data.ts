// Données stockées dans IndexedDB. Voir docs/SPEC.md §2.
import { Shape } from '../annotation/shapes';
import { ChecklistTemplate } from './template';

export type Urgency = 'immediate' | 'short' | 'medium' | 'monitor';

export const URGENCIES: readonly Urgency[] = ['immediate', 'short', 'medium', 'monitor'];

export const URGENCY_LABELS: Record<Urgency, string> = {
  immediate: 'Immédiat',
  short: 'Court terme',
  medium: 'Moyen terme',
  monitor: 'À surveiller',
};

export interface MeasureRow {
  id: string;
  point: string;
  values: (number | null)[];
  note?: string;
}

export interface ActionRow {
  id: string;
  text: string;
  urgency: Urgency;
  detail?: string;
}

export type AnswerValue =
  | boolean
  | string
  | string[]
  | number
  | MeasureRow[]
  | ActionRow[]
  | null;

/** Valeur réservée d'une option « Autre : … » (enum avec allowOther). */
export const OTHER_VALUE = '__autre';

export interface LegendEntry {
  color: string;
  label: string;
}

export interface Project {
  id: string;
  reference: string;
  fields: Record<string, unknown>;
  templateId: string;
  templateVersion: string;
  templateSnapshot: ChecklistTemplate;
  legend: LegendEntry[];
  createdAt: number;
  updatedAt: number;
}

export type VisitStatus = 'draft' | 'closed' | 'exported';

export interface SectionInstance {
  id: string;
  sectionId: string;
  label: string;
  order: number;
}

export interface VisitCursor {
  instanceId: string;
  scrollY: number;
}

export interface Visit {
  id: string;
  projectId: string;
  /** 0 = visite initiale, 1..n = mises à jour. */
  revision: number;
  reason?: string;
  fields: Record<string, unknown>;
  instances: SectionInstance[];
  conclusion: string;
  status: VisitStatus;
  cursor: VisitCursor | null;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  exportedAt?: number;
}

export interface Answer {
  visitId: string;
  instanceId: string;
  itemId: string;
  value: AnswerValue;
  other?: string;
  observation: string;
  defect?: { urgency: Urgency };
  changedInRevision: number;
  inherited?: { value: AnswerValue; other?: string; observation: string };
  updatedAt: number;
}

/** Modification partielle d'une réponse. */
export type AnswerPatch = Partial<Pick<Answer, 'value' | 'other' | 'observation'>> & {
  defect?: { urgency: Urgency } | null;
};

export interface Photo {
  id: string;
  projectId: string;
  blobId: string;
  instanceId: string | null;
  itemId: string | null;
  kind: 'photo' | 'plan' | 'sketch';
  number: number;
  caption: string;
  order: number;
  annotations: Shape[];
  addedInRevision: number;
  removedInRevision?: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoredBlob {
  id: string;
  image: Blob;
  thumb: Blob;
  vector?: Blob;
  width: number;
  height: number;
  byteSize: number;
}

export interface Setting {
  key: string;
  value: unknown;
}
