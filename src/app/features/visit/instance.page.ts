import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, HostListener, inject, Injector, input, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Photo, URGENCIES, URGENCY_LABELS, URGENCY_LEGEND, URGENCY_LEVEL, Urgency } from '../../core/model/data';
import { ResolvedItem } from '../../core/model/template';
import { formatAnswer } from '../../core/report/build-report';
import { answerSummary, questionList, questionMarks } from '../../core/templates/question-list';
import { isProbeRelated } from '../../core/templates/template-engine';
import { CabinetService } from '../../core/services/cabinet.service';
import { DialogService } from '../../core/services/dialog.service';
import { MediaRequest, MediaSource } from '../../shared/photo-strip.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { UrgencyMeterComponent } from '../../shared/ui/urgency.component';
import { FieldChange, ItemFieldComponent } from './fields/item-field.component';
import { VisitStore } from './visit-store';

/** Valeur de `?q=` qui ouvre la synthèse de la fiche (rubriques de pied). */
export const SYNTHESIS_Q = '_synthese';

/** Fiche de visite (lot 6b) : liste des questions à gauche (tiroir en portrait), une question à la fois à droite. */
@Component({
  selector: 'app-instance-page',
  imports: [RouterLink, ItemFieldComponent, IconComponent, UrgencyMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './instance.page.html',
  styleUrl: './instance.page.scss',
})
export class InstancePage {
  readonly instanceId = input.required<string>();
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly cabinet = inject(CabinetService);

  readonly synthesisQ = SYNTHESIS_Q;
  readonly urgencies = URGENCIES;
  readonly urgencyLabels = URGENCY_LABELS;
  readonly urgencyLevel = URGENCY_LEVEL;
  readonly urgencyLegend = URGENCY_LEGEND;

  /** Lexique actif seulement si l'annexe est importée (sinon pas d'astérisques au rapport). */
  readonly lexicon = computed(() => (this.cabinet.annex() ? this.cabinet.lexicon() : null));
  readonly instance = computed(() => this.store.instance(this.instanceId()));
  readonly section = computed(() => {
    const i = this.instance();
    return i ? this.store.section(i.sectionId) : undefined;
  });
  readonly list = computed(() => questionList(this.section()?.items ?? []));
  readonly sheetLabel = computed(() => (this.section()?.repeatable ? this.instance()?.label : this.section()?.label) ?? '');

  // ---- question ouverte (?q=) ---------------------------------------------------
  private readonly q = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('q'))), { initialValue: null });
  /** Synthèse de la fiche : demandée, ou une rubrique de pied visée (liens de la synthèse de visite). */
  readonly isSynthesis = computed(() => {
    const q = this.q();
    const footer = this.list().footer;
    return footer.length > 0 && (q === SYNTHESIS_Q || footer.some((i) => i.id === q));
  });
  readonly current = computed<ResolvedItem | null>(() => {
    if (this.isSynthesis()) return null;
    const questions = this.list().questions;
    const q = this.q();
    const cursor = this.store.visit()?.cursor;
    const wanted = q ?? (cursor?.instanceId === this.instanceId() ? cursor.itemId : undefined);
    return questions.find((i) => i.id === wanted) ?? questions[0] ?? null;
  });
  readonly index = computed(() => {
    const c = this.current();
    return c ? this.list().questions.indexOf(c) : this.list().questions.length;
  });

  // ---- filtres ------------------------------------------------------------------
  readonly filtering = computed(() => this.store.onlyChanged() || this.store.onlyProbes());
  readonly filtersOpen = signal(false);
  readonly filterLabel = computed(() =>
    [this.store.onlyChanged() ? 'Modifiés' : '', this.store.onlyProbes() ? 'À sonder' : ''].filter(Boolean).join(', '));
  readonly hasChangedFilter = computed(() => (this.store.visit()?.revision ?? 0) > 0);
  readonly hasProbes = computed(() => this.store.instanceAnswers(this.instanceId()).some(isProbeRelated));
  readonly visibleCount = computed(() => this.list().questions.filter((i) => this.matches(i)).length);

  /** Question retenue par les filtres actifs. */
  matches(item: ResolvedItem): boolean {
    const answer = this.store.answer(this.instanceId(), item.id);
    if (this.store.onlyChanged() && !this.store.isChangedHere(answer)) return false;
    return !this.store.onlyProbes() || isProbeRelated(answer);
  }

  clearFilters(): void {
    this.store.onlyChanged.set(false);
    this.store.onlyProbes.set(false);
  }

  // ---- lignes de la liste ----------------------------------------------------------
  summary(item: ResolvedItem): string {
    return answerSummary(item, this.store.answer(this.instanceId(), item.id), this.store.photosOf(this.instanceId(), item.id).length);
  }

  marks(item: ResolvedItem) {
    return questionMarks(this.store.answer(this.instanceId(), item.id));
  }

  thumbs(item: ResolvedItem) {
    return this.store.photoViews(this.instanceId(), item.id).filter((p) => p.url).slice(0, 3);
  }

  revisedRow(item: ResolvedItem): boolean {
    return this.store.isChangedHere(this.store.answer(this.instanceId(), item.id));
  }

  footerHint = computed(() => this.list().footer.map((i) => i.label).join(', ').toLowerCase().replace(/^./, (c) => c.toUpperCase()));

  // ---- fiche précédente / suivante -----------------------------------------------
  readonly position = computed(() => {
    const list = this.store.orderedInstances();
    const index = list.findIndex((i) => i.id === this.instanceId());
    return { prev: list[index - 1], next: list[index + 1] };
  });

  // ---- plan de référence -----------------------------------------------------------
  readonly reference = computed(() => this.store.referencePlan(this.instanceId()));
  readonly hasReference = computed(() => this.store.hasReferenceConfig(this.instanceId()));
  /** Le plan de référence reste à choisir : son sélecteur est en tête de la liste. */
  readonly mustChoosePlan = computed(() => this.hasReference() && !this.reference().plan && this.reference().candidates.length > 1);

  planLabel(photo: Photo): string {
    const kind = photo.kind === 'plan' ? 'Plan' : 'Croquis';
    return `${kind} ${this.store.number(photo)}${photo.caption ? ` — ${photo.caption}` : ` — ${this.store.photoLocation(photo)}`}`;
  }

  choosePlan(photoId: string): void {
    void this.store.setReferencePlan(this.instanceId(), photoId || null);
    this.store.questionsOpen.set(false);
  }

  // ---- panneau de détail -----------------------------------------------------------
  readonly field = viewChild(ItemFieldComponent);
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');
  readonly pickerOpen = signal(false);

  state(item: ResolvedItem) {
    return this.store.answer(this.instanceId(), item.id);
  }

  /** Version reprise de la visite précédente, en clair (null : réponse nouvelle). */
  original(item: ResolvedItem): string | null {
    const inherited = this.state(item)?.inherited;
    if (!inherited) return null;
    return [formatAnswer(item, inherited), inherited.observation.trim(), ...(inherited.extra ?? []).map((e) => e.text.trim())]
      .filter(Boolean).join(' — ');
  }

  /** Ouvre une question (ou la synthèse de la fiche) ; l'adresse garde la question ouverte. */
  go(q: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q }, replaceUrl: true });
  }

  step(delta: -1 | 1): void {
    const questions = this.list().questions;
    if (this.isSynthesis()) {
      if (delta < 0 && questions.length) this.go(questions.at(-1)!.id);
      return;
    }
    const next = questions[this.index() + delta];
    if (next) this.go(next.id);
    else if (delta > 0 && this.list().footer.length) this.go(SYNTHESIS_Q);
  }

  /** Libellé des grands boutons question précédente / suivante (portrait). */
  readonly neighbours = computed(() => {
    const questions = this.list().questions;
    const synthesis = this.list().footer.length ? 'Synthèse de la fiche' : null;
    if (this.isSynthesis()) return { prev: questions.at(-1)?.label ?? null, next: null };
    const i = this.index();
    return { prev: questions[i - 1]?.label ?? null, next: questions[i + 1]?.label ?? synthesis };
  });

  // ---- barre d'actions (agit sur l'observation sélectionnée) ---------------------------
  readonly selected = computed(() => this.field()?.selectedEntry() ?? null);
  readonly canDefect = computed(() => !this.store.readOnly() && !!this.field()?.canDefect() && !!this.field()?.showObservation());
  readonly canProbe = computed(() => !this.store.readOnly() && !!this.field()?.canProbe());
  readonly canAddObservation = computed(() => !this.store.readOnly() && !!this.field()?.canAddObservation());
  readonly canPhoto = computed(() => {
    const item = this.current();
    return !this.store.readOnly() && !!item && !item.role && !(item.type === 'photo' && item.photoKind === 'plan');
  });
  readonly defectLevel = computed(() => {
    const u = this.selected()?.defect?.urgency;
    return u ? URGENCY_LEVEL[u] : null;
  });

  /** Photo à situer : la vignette sélectionnée, sinon la dernière photo pas encore située. */
  readonly toLocate = computed<Photo | null>(() => {
    const item = this.current();
    if (!item || !this.hasReference() || this.store.readOnly()) return null;
    const photos = this.store.photosOf(this.instanceId(), item.id).filter((p) => p.kind === 'photo');
    const chosen = photos.find((p) => p.id === this.field()?.selectedPhoto());
    if (chosen) return chosen;
    const located = this.store.locatedIds();
    return photos.filter((p) => !located.has(p.id)).at(-1) ?? null;
  });

  togglePicker(): void {
    this.pickerOpen.set(!this.pickerOpen());
  }

  setDefect(urgency: Urgency | null): void {
    const field = this.field();
    const entry = this.selected();
    if (field && entry) field.setEntryDefect(entry.id, urgency);
    this.pickerOpen.set(false);
  }

  toggleProbe(): void {
    const field = this.field();
    const entry = this.selected();
    if (field && entry) field.toggleEntryProbe(entry.id);
  }

  addObservation(): void {
    this.field()?.addObservation();
  }

  pick(event: Event, source: MediaSource): void {
    const el = event.target as HTMLInputElement;
    const files = [...(el.files ?? [])];
    el.value = '';
    const item = this.current();
    if (files.length && item) void this.onMedia(item, { source, files });
  }

  @HostListener('document:keydown.escape')
  closePicker(): void {
    this.pickerOpen.set(false);
  }

  constructor() {
    // chaque question ouverte : curseur de reprise, tiroir refermé, détail en haut
    effect(() => {
      const item = this.current();
      const synthesis = this.isSynthesis();
      const id = this.instanceId();
      const count = this.list().questions.length;
      const index = this.index();
      if (!this.instance()) return;
      untracked(() => {
        this.store.questionPos.set(item ? { index, count } : null);
        this.store.questionsOpen.set(false);
        this.pickerOpen.set(false);
        this.store.saveCursor({ instanceId: id, scrollY: 0, ...(item ? { itemId: item.id } : synthesis ? { itemId: SYNTHESIS_Q } : {}) });
        afterNextRender(() => this.body()?.nativeElement.scrollTo({ top: 0 }), { injector: this.injector });
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.store.questionPos.set(null);
      this.store.questionsOpen.set(false);
    });
  }

  // ---- saisie et médias --------------------------------------------------------------

  onChange(item: ResolvedItem, change: FieldChange): void {
    this.store.setAnswer(this.instanceId(), item.id, change.patch, { debounce: change.debounce });
  }

  async onMedia(item: ResolvedItem, request: MediaRequest): Promise<void> {
    const created = await this.store.handleMedia(request, { instanceId: this.instanceId(), itemId: item.id });
    if (created) await this.openPhoto(created.id);
  }

  openPhoto(photoId: string): Promise<boolean> {
    return this.router.navigate(this.store.link('photos', photoId));
  }

  /** Ouvre le plan de référence en mode localisation de la photo. */
  async locate(): Promise<void> {
    const photo = this.toLocate();
    if (!photo) return;
    const target = this.store.locateTarget(this.instanceId());
    if ('plan' in target) {
      await this.router.navigate(this.store.link('photos', target.plan.id), { queryParams: { locate: photo.id } });
      return;
    }
    this.dialogs.notify(target.message, true);
    if (target.choose) this.store.questionsOpen.set(true);
  }
}
