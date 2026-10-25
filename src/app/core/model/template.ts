// Description d'un modèle de fiches (rules-as-data). Voir docs/SPEC.md §3.

export type ItemType =
  | 'heading'
  | 'boolean'
  | 'enum'
  | 'multi'
  | 'text'
  | 'number'
  | 'measures'
  | 'actions'
  | 'date'
  | 'datetime'
  | 'photo';

export const ITEM_TYPES: readonly ItemType[] = [
  'heading', 'boolean', 'enum', 'multi', 'text', 'number',
  'measures', 'actions', 'date', 'datetime', 'photo',
];

export type ItemRole = 'comment' | 'recommendation' | 'safety' | 'maintenance';

export interface EnumOption {
  value: string;
  label: string;
  /** Style visuel uniquement (jamais de désordre automatique). */
  warn?: boolean;
}

export interface MeasuresConfig {
  /** Points fixes (« 0 m », « 1 m »…). Absent = lignes libres. */
  points?: string[];
  columns: { label: string; unit?: string }[];
}

export interface Item {
  id: string;
  label: string;
  type: ItemType;
  required: boolean;
  helpText?: string;
  snippets?: string[];
  role?: ItemRole;
  /** Liste d'options, ou nom d'un optionSet du modèle. */
  options?: EnumOption[] | string;
  allowOther?: boolean;
  unit?: string;
  min?: number;
  max?: number;
  measures?: MeasuresConfig;
  history?: boolean;
  photoKind?: 'photo' | 'plan';
  /** Champ observation affiché (défaut : true sauf heading). */
  observation?: boolean;
  multiline?: boolean;
}

export interface Section {
  id: string;
  label: string;
  helpText?: string;
  repeatable?: { noun: string; suggestions?: string[]; min?: number };
  /** Ajouter le sectionFooter du modèle (défaut : true). */
  footer?: boolean;
  items: Item[];
}

export interface ChecklistTemplate {
  $schema?: string;
  templateId: string;
  version: string;
  label: string;
  description?: string;
  optionSets?: Record<string, EnumOption[]>;
  projectFields: Item[];
  visitFields: Item[];
  sectionFooter?: Item[];
  sections: Section[];
}

/** Item dont les options sont résolues (plus de référence à un optionSet). */
export interface ResolvedItem extends Omit<Item, 'options'> {
  options?: EnumOption[];
  /** Vrai pour les items issus du sectionFooter. */
  fromFooter?: boolean;
}

export interface ResolvedSection extends Omit<Section, 'items'> {
  items: ResolvedItem[];
}

export interface ResolvedTemplate extends Omit<ChecklistTemplate, 'projectFields' | 'visitFields' | 'sectionFooter' | 'sections' | 'optionSets'> {
  projectFields: ResolvedItem[];
  visitFields: ResolvedItem[];
  sections: ResolvedSection[];
}
