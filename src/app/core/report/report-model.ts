// Modèle de rapport intermédiaire, commun au PDF et au DOCX (docs/SPEC.md §6).
import { LegendEntry, Photo } from '../model/data';

export type BlockId = 'cover' | 'body' | 'conclusion' | 'defects' | 'works' | 'lexicon';

export interface ReportConfig {
  page: { size: 'A4'; marginsMm: [number, number, number, number] };
  title: string;
  font: { family: string; size: number };
  colors: { text: string; heading: string; revision: string; defect: string; accent: string; caption: string };
  blocks: BlockId[];
  sectionPageBreak: boolean;
  revisionHighlight: 'latest' | 'all';
  photos: { columns: number; maxLongSide: number; jpegQuality: number; planMaxLongSide: number };
  emptyInstance: 'omit' | 'show';
  masterPlanItem?: string;
  lexicon: { mark: 'every' | 'first'; annex: 'all' | 'used' };
  headings: { conclusion: string; defects: string; works: string; safety: string; maintenance: string; lexicon: string };
  footer: string;
}

export interface FirmInfo {
  name: string;
  lines: string[];
}

/** Morceau de texte avec sa mise en forme. */
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Couleur explicite (désordre, légende) ; sinon couleur du texte. */
  color?: string;
  /** Passage modifié lors d'une mise à jour (rendu en violet). */
  revised?: boolean;
}

export type ParagraphStyle = 'body' | 'caption' | 'firm' | 'note' | 'label';

export interface ReportPhoto {
  photoId: string;
  number: number;
  kind: Photo['kind'];
  caption: string;
  /** Renvoi vers l'item concerné. */
  ref?: string;
}

export type Block =
  | { type: 'heading'; level: 0 | 1 | 2 | 3; runs: Run[]; align?: 'left' | 'center' | 'right'; pageBreakBefore?: boolean }
  | { type: 'paragraph'; runs: Run[]; style?: ParagraphStyle; align?: 'left' | 'center' | 'right'; bullet?: boolean; indent?: number }
  | { type: 'photos'; photos: ReportPhoto[] }
  | { type: 'plan'; photo: ReportPhoto; legend: LegendEntry[] }
  | { type: 'spacer'; lines: number }
  | { type: 'pageBreak' }
  | { type: 'annex'; pages: 'all' | number[] };

export interface ReportModel {
  blocks: Block[];
  /** Photos référencées (à préparer pour le rendu). */
  photoIds: string[];
  /** Termes du lexique marqués d'un astérisque. */
  lexiconTerms: string[];
  fileBaseName: string;
}

export const text = (t: string, style: Omit<Run, 'text'> = {}): Run => ({ text: t, ...style });
