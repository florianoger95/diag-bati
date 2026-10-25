import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  ActionRow,
  AnswerPatch,
  AnswerValue,
  MeasureRow,
  OTHER_VALUE,
  URGENCIES,
  URGENCY_LABELS,
  Urgency,
} from '../../../core/model/data';
import { ResolvedItem } from '../../../core/model/template';
import { CompiledLexicon, findTerms, toggleExclusion } from '../../../core/report/lexicon';
import { isOutOfRange } from '../../../core/templates/template-engine';
import { AutoGrowDirective } from '../../../shared/auto-grow.directive';
import { NumberInputComponent } from '../../../shared/number-input.component';
import { MediaRequest, PhotoStripComponent, PhotoView } from '../../../shared/photo-strip.component';
import { ActionsFieldComponent } from './actions-field.component';
import { MeasuresFieldComponent } from './measures-field.component';

export interface FieldState {
  value: AnswerValue;
  other?: string;
  observation: string;
  defect?: { urgency: Urgency };
}

export interface FieldChange {
  patch: AnswerPatch;
  debounce: boolean;
}

/** Rendu d'un item du modèle, quel que soit son type. Ne connaît pas la base : émet des modifications. */
@Component({
  selector: 'app-item-field',
  imports: [AutoGrowDirective, NumberInputComponent, MeasuresFieldComponent, ActionsFieldComponent, PhotoStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './item-field.component.html',
  styleUrl: './item-field.component.scss',
  host: {
    '[class.defect]': '!!state()?.defect',
    '[class.revised]': 'revised()',
    '[class.heading]': "item().type === 'heading'",
    '[attr.id]': "'item-' + item().id",
  },
})
export class ItemFieldComponent {
  readonly item = input.required<ResolvedItem>();
  readonly state = input<FieldState | undefined>();
  readonly readonly = input(false);
  /** Désordre et observation : désactivés pour les champs d'en-tête. */
  readonly allowDefect = input(true);
  /** Photos rattachées à l'item (affichées seulement si withPhotos). */
  readonly photos = input<PhotoView[]>([]);
  readonly withPhotos = input(false);
  /** Lexique actif (annexe importée) : termes détectés affichés sous l'observation. */
  readonly lexicon = input<CompiledLexicon | null>(null);
  /** Mise à jour : réponse modifiée dans cette visite, et sa version reprise (null si elle est nouvelle). */
  readonly revised = input(false);
  readonly original = input<string | null>(null);
  readonly changed = output<FieldChange>();
  readonly revert = output<void>();
  readonly showOriginal = signal(false);
  readonly media = output<MediaRequest>();
  readonly openPhoto = output<string>();

  readonly urgencies = URGENCIES;
  readonly urgencyLabels = URGENCY_LABELS;
  readonly OTHER = OTHER_VALUE;
  readonly showHelp = signal(false);
  readonly defectOpen = signal(false);

  /** Pas de désordre sur les rubriques de synthèse (commentaires, préconisations, mesures). */
  readonly canDefect = computed(() => this.allowDefect() && !this.item().role);
  /** Boutons photo discrets sur les items qui ne sont pas des items photo. */
  readonly compactPhotos = computed(() => this.withPhotos() && this.item().type !== 'photo' && !this.item().role);
  readonly lexiconTerms = computed(() => {
    const lexicon = this.lexicon();
    const text = this.observation();
    if (!lexicon || !text) return [];
    return findTerms(text, lexicon).map((o, index) => ({ index, word: text.slice(o.start, o.end), excluded: o.excluded }));
  });
  readonly value = computed(() => this.state()?.value ?? null);
  readonly observation = computed(() => this.state()?.observation ?? '');
  readonly showObservation = computed(() => {
    const item = this.item();
    return item.type !== 'heading' && item.observation !== false;
  });
  /** Phrases types : vers l'observation, ou vers la valeur pour un item texte sans observation. */
  readonly snippetTarget = computed<'observation' | 'value' | null>(() => {
    const item = this.item();
    if (!item.snippets?.length || item.type === 'actions') return null;
    if (this.showObservation()) return 'observation';
    return item.type === 'text' ? 'value' : null;
  });

  readonly textValue = computed(() => (typeof this.value() === 'string' ? (this.value() as string) : ''));
  readonly numberValue = computed(() => (typeof this.value() === 'number' ? (this.value() as number) : null));
  readonly multiValue = computed(() => (Array.isArray(this.value()) ? (this.value() as string[]) : []));
  readonly measureRows = computed(() => (Array.isArray(this.value()) ? (this.value() as MeasureRow[]) : null));
  readonly actionRows = computed(() => (Array.isArray(this.value()) ? (this.value() as ActionRow[]) : null));
  readonly outOfRange = computed(() => isOutOfRange(this.item(), this.value()));
  readonly rangeText = computed(() => {
    const { min, max, unit } = this.item();
    const u = unit ? ` ${unit}` : '';
    if (min !== undefined && max !== undefined) return `entre ${min}${u} et ${max}${u}`;
    if (min !== undefined) return `au moins ${min}${u}`;
    return `au plus ${max}${u}`;
  });

  protected emit(patch: AnswerPatch, debounce = false): void {
    if (!this.readonly()) this.changed.emit({ patch, debounce });
  }

  // ---- choix ----------------------------------------------------------------

  toggleSingle(v: string | boolean): void {
    this.emit({ value: this.value() === v ? null : v });
  }

  toggleMulti(v: string): void {
    const current = this.multiValue();
    this.emit({ value: current.includes(v) ? current.filter((x) => x !== v) : [...current, v] });
  }

  setOther(text: string): void {
    this.emit({ other: text }, true);
  }

  // ---- saisies --------------------------------------------------------------

  setText(text: string): void {
    this.emit({ value: text }, true);
  }

  setNumber(n: number | null): void {
    this.emit({ value: n }, true);
  }

  setDate(text: string): void {
    this.emit({ value: text || null });
  }

  setObservation(text: string): void {
    this.emit({ observation: text }, true);
  }

  insertSnippet(snippet: string): void {
    const target = this.snippetTarget();
    const current = target === 'value' ? this.textValue() : this.observation();
    const sep = !current.trim() ? '' : /[.!?:]\s*$/.test(current) ? ' ' : '. ';
    const next = `${current.trimEnd()}${sep}${snippet}`;
    if (target === 'value') this.emit({ value: next });
    else this.emit({ observation: next });
  }

  /** Ne pas marquer (ou marquer à nouveau) une occurrence d'un terme du lexique. */
  toggleTerm(index: number): void {
    const lexicon = this.lexicon();
    if (lexicon) this.emit({ observation: toggleExclusion(this.observation(), lexicon, index) });
  }

  // ---- désordre -------------------------------------------------------------

  setDefect(urgency: Urgency | null): void {
    this.emit({ defect: urgency ? { urgency } : null });
    this.defectOpen.set(false);
  }
}
