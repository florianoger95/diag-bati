import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, Injector, input, output, signal } from '@angular/core';
import { DialogService } from '../../../core/services/dialog.service';
import {
  ActionRow,
  AnswerPatch,
  AnswerValue,
  MAIN_OBSERVATION,
  MeasureRow,
  ObservationEntry,
  observationsOf,
  OTHER_VALUE,
  URGENCIES,
  URGENCY_LABELS,
  URGENCY_LEGEND,
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
  probe?: true;
  extra?: ObservationEntry[];
  inherited?: { probe?: true; extra?: ObservationEntry[] };
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
    '[class.defect]': 'hasDefect()',
    '[class.probe]': 'probe()',
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
  /** Dernière photo de l'item à situer sur le plan de référence (null : rien à situer). */
  readonly locate = input<{ number: number } | null>(null);
  readonly locateRequest = output<void>();
  private readonly dialogs = inject(DialogService);
  private readonly injector = inject(Injector);

  readonly urgencies = URGENCIES;
  readonly urgencyLabels = URGENCY_LABELS;
  readonly urgencyLegend = URGENCY_LEGEND;
  readonly OTHER = OTHER_VALUE;
  readonly showHelp = signal(false);
  /** Observation dont le choix d'urgence est ouvert. */
  readonly defectOpen = signal<string | null>(null);
  /** Observation qui reçoit les phrases types (dernier focus). */
  readonly activeObs = signal(MAIN_OBSERVATION);

  /** Pas de désordre sur les rubriques de synthèse (commentaires, préconisations, mesures). */
  readonly canDefect = computed(() => this.allowDefect() && !this.item().role);
  /** Repère « À sonder » : sur l'observation, hors rubriques de synthèse. */
  readonly canProbe = computed(() => this.canDefect() && this.showObservation());
  readonly canAddObservation = computed(() => this.canDefect() && this.showObservation());
  /** Toutes les observations : la première, puis les suivantes. */
  readonly entries = computed(() => observationsOf(this.state() ?? { observation: '' }));
  readonly probe = computed(() => this.entries().some((o) => o.probe));
  readonly hasDefect = computed(() => this.entries().some((o) => o.defect));
  /** Boutons photo discrets sur les items qui ne sont pas des items photo. */
  readonly compactPhotos = computed(() => this.withPhotos() && this.item().type !== 'photo' && !this.item().role);
  /** Termes du lexique de chaque observation. */
  private readonly terms = computed(() => {
    const lexicon = this.lexicon();
    const map = new Map<string, { index: number; word: string; excluded: boolean }[]>();
    if (!lexicon) return map;
    for (const o of this.entries()) {
      if (o.text) map.set(o.id, findTerms(o.text, lexicon).map((t, index) => ({ index, word: o.text.slice(t.start, t.end), excluded: t.excluded })));
    }
    return map;
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

  insertSnippet(snippet: string): void {
    const target = this.snippetTarget();
    const entry = this.entries().find((o) => o.id === this.activeObs()) ?? this.entries()[0];
    const current = target === 'value' ? this.textValue() : entry?.text ?? '';
    const sep = !current.trim() ? '' : /[.!?:]\s*$/.test(current) ? ' ' : '. ';
    const next = `${current.trimEnd()}${sep}${snippet}`;
    if (target === 'value') this.emit({ value: next });
    else this.setEntryText(entry?.id ?? MAIN_OBSERVATION, next, false);
  }

  // ---- observations (chacune avec son désordre et son repère « À sonder ») ------

  obsLabel(i: number): string {
    return i ? `Observation ${i + 1}` : 'Observation';
  }

  termsOf(id: string) {
    return this.terms().get(id) ?? [];
  }

  /** Mise à jour : le repère de la visite précédente a été levé sur cette observation. */
  probeDone(o: ObservationEntry): boolean {
    if (o.probe) return false;
    const inherited = this.state()?.inherited;
    return o.id === MAIN_OBSERVATION ? !!inherited?.probe : !!inherited?.extra?.find((e) => e.id === o.id)?.probe;
  }

  /** Modifie une observation : la première par les champs de la réponse, les suivantes par la liste `extra`. */
  private patchEntry(id: string, change: { text?: string; defect?: { urgency: Urgency } | null; probe?: boolean }, debounce = false): void {
    if (id === MAIN_OBSERVATION) {
      this.emit({
        ...('text' in change ? { observation: change.text } : {}),
        ...('defect' in change ? { defect: change.defect } : {}),
        ...('probe' in change ? { probe: change.probe } : {}),
      }, debounce);
      return;
    }
    const extra = (this.state()?.extra ?? []).map((e) => {
      if (e.id !== id) return e;
      const next: ObservationEntry = { ...e };
      if (change.text !== undefined) next.text = change.text;
      if (change.defect === null) delete next.defect;
      else if (change.defect) next.defect = change.defect;
      if (change.probe === true) next.probe = true;
      else if (change.probe === false) delete next.probe;
      return next;
    });
    this.emit({ extra }, debounce);
  }

  setEntryText(id: string, text: string, debounce = true): void {
    this.patchEntry(id, { text }, debounce);
  }

  setEntryDefect(id: string, urgency: Urgency | null): void {
    this.patchEntry(id, { defect: urgency ? { urgency } : null });
    this.defectOpen.set(null);
  }

  toggleEntryProbe(id: string): void {
    this.patchEntry(id, { probe: !this.entries().find((o) => o.id === id)?.probe });
  }

  /** Ne pas marquer (ou marquer à nouveau) une occurrence d'un terme du lexique. */
  toggleTerm(id: string, index: number): void {
    const lexicon = this.lexicon();
    const entry = this.entries().find((o) => o.id === id);
    if (lexicon && entry) this.setEntryText(id, toggleExclusion(entry.text, lexicon, index), false);
  }

  addObservation(): void {
    const id = crypto.randomUUID();
    this.emit({ extra: [...(this.state()?.extra ?? []), { id, text: '' }] });
    this.activeObs.set(id);
    afterNextRender(() => document.getElementById(`obs-${this.item().id}-${id}`)?.focus(), { injector: this.injector });
  }

  async removeObservation(id: string): Promise<void> {
    const entry = this.entries().find((o) => o.id === id);
    if (!entry) return;
    if (entry.text.trim() || entry.defect || entry.probe) {
      const ok = await this.dialogs.confirm('Retirer cette observation ?', entry.text.trim() || 'Son désordre et son repère seront retirés.',
        { confirmLabel: 'Retirer', danger: true });
      if (!ok) return;
    }
    this.emit({ extra: (this.state()?.extra ?? []).filter((e) => e.id !== id) });
    if (this.activeObs() === id) this.activeObs.set(MAIN_OBSERVATION);
  }
}
