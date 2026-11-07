import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Photo } from '../../core/model/data';
import { ResolvedItem } from '../../core/model/template';
import { formatAnswer } from '../../core/report/build-report';
import { isProbeRelated } from '../../core/templates/template-engine';
import { CabinetService } from '../../core/services/cabinet.service';
import { DialogService } from '../../core/services/dialog.service';
import { MediaRequest } from '../../shared/photo-strip.component';
import { FieldChange, ItemFieldComponent } from './fields/item-field.component';
import { VisitStore } from './visit-store';

@Component({
  selector: 'app-instance-page',
  imports: [RouterLink, ItemFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './instance.page.html',
  styleUrl: './instance.page.scss',
})
export class InstancePage {
  readonly instanceId = input.required<string>();
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);

  private readonly cabinet = inject(CabinetService);
  /** Lexique actif seulement si l'annexe est importée (sinon pas d'astérisques au rapport). */
  readonly lexicon = computed(() => (this.cabinet.annex() ? this.cabinet.lexicon() : null));
  readonly onlyChanged = signal(false);
  readonly onlyProbes = signal(false);
  /** La fiche a des items à sonder (ou qui l'étaient dans la visite précédente). */
  readonly hasProbes = computed(() => this.store.instanceAnswers(this.instanceId()).some(isProbeRelated));
  readonly instance = computed(() => this.store.instance(this.instanceId()));
  readonly section = computed(() => {
    const i = this.instance();
    return i ? this.store.section(i.sectionId) : undefined;
  });
  readonly items = computed<ResolvedItem[]>(() => this.section()?.items ?? []);
  readonly base = computed(() => {
    const v = this.store.visit();
    return v ? ['/dossiers', v.projectId, 'v', v.id] : [];
  });
  readonly position = computed(() => {
    const list = this.store.orderedInstances();
    const index = list.findIndex((i) => i.id === this.instanceId());
    return { prev: list[index - 1], next: list[index + 1], index, count: list.length };
  });
  readonly siblings = computed(() => this.store.orderedInstances().filter((i) => i.sectionId === this.instance()?.sectionId));

  private scrollTimer?: ReturnType<typeof setTimeout>;
  private readonly onScroll = () => {
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => this.store.saveCursor({ instanceId: this.instanceId(), scrollY: Math.round(window.scrollY) }), 400);
  };

  constructor() {
    // Restaure la position de défilement si on revient sur la fiche du curseur, sinon haut de page.
    effect(() => {
      const id = this.instanceId();
      const ready = !!this.instance();
      if (!ready) return;
      untracked(() => {
        // lien depuis la synthèse : on va directement à l'item visé
        const fragment = this.route.snapshot.fragment;
        if (fragment) {
          afterNextRender(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }), { injector: this.injector });
          return;
        }
        const cursor = this.store.visit()?.cursor;
        const y = cursor?.instanceId === id ? cursor.scrollY : 0;
        afterNextRender(() => window.scrollTo({ top: y }), { injector: this.injector });
        this.store.saveCursor({ instanceId: id, scrollY: y });
      });
    });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('scroll', this.onScroll);
      clearTimeout(this.scrollTimer);
    });
  }

  state(item: ResolvedItem) {
    return this.store.answer(this.instanceId(), item.id);
  }

  /** Item masqué par les filtres « Modifiés » et « À sonder ». */
  hidden(item: ResolvedItem): boolean {
    const answer = this.state(item);
    if (this.onlyChanged() && !this.store.isChangedHere(answer)) return true;
    return this.onlyProbes() && this.hasProbes() && !isProbeRelated(answer);
  }

  /** Version reprise de la visite précédente, en clair (null : réponse nouvelle). */
  original(item: ResolvedItem): string | null {
    const inherited = this.state(item)?.inherited;
    if (!inherited) return null;
    return [formatAnswer(item, inherited), inherited.observation.trim(), ...(inherited.extra ?? []).map((e) => e.text.trim())]
      .filter(Boolean).join(' — ');
  }

  // ---- plan de référence et localisation des photos ----------------------------

  readonly reference = computed(() => this.store.referencePlan(this.instanceId()));
  readonly hasReference = computed(() => this.store.hasReferenceConfig(this.instanceId()));

  planLabel(photo: Photo): string {
    const kind = photo.kind === 'plan' ? 'Plan' : 'Croquis';
    return `${kind} ${this.store.number(photo)}${photo.caption ? ` — ${photo.caption}` : ` — ${this.store.photoLocation(photo)}`}`;
  }

  choosePlan(photoId: string): void {
    void this.store.setReferencePlan(this.instanceId(), photoId || null);
  }

  /** Dernière photo de l'item pas encore située sur un plan. */
  toLocate(item: ResolvedItem): Photo | undefined {
    if (!this.hasReference() || this.store.readOnly()) return undefined;
    const located = this.store.locatedIds();
    return this.store.photosOf(this.instanceId(), item.id).filter((p) => p.kind === 'photo' && !located.has(p.id)).at(-1);
  }

  locateView(item: ResolvedItem): { number: number } | null {
    const p = this.toLocate(item);
    return p ? { number: this.store.number(p) } : null;
  }

  /** Ouvre le plan de référence en mode localisation de la photo. */
  async locatePhoto(photoId: string): Promise<void> {
    const target = this.store.locateTarget(this.instanceId());
    if ('plan' in target) {
      await this.router.navigate(this.store.link('photos', target.plan.id), { queryParams: { locate: photoId } });
      return;
    }
    this.dialogs.notify(target.message, true);
    if (target.choose) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  locateItem(item: ResolvedItem): void {
    const p = this.toLocate(item);
    if (p) void this.locatePhoto(p.id);
  }

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

  async rename(): Promise<void> {
    const instance = this.instance();
    const section = this.section();
    if (!instance || !section?.repeatable) return;
    const label = await this.dialogs.prompt('Renommer', {
      initial: instance.label, suggestions: section.repeatable.suggestions ?? [], confirmLabel: 'Renommer',
    });
    if (label) await this.store.renameInstance(instance.id, label);
  }

  async duplicate(): Promise<void> {
    const instance = this.instance();
    const section = this.section();
    if (!instance || !section?.repeatable) return;
    const label = await this.dialogs.prompt(`Dupliquer « ${instance.label} » (réponses copiées, sans les photos)`, {
      suggestions: section.repeatable.suggestions ?? [], confirmLabel: 'Dupliquer',
    });
    if (!label) return;
    const copy = await this.store.duplicateInstance(instance.id, label);
    if (copy) await this.router.navigate([...this.base(), 'i', copy.id]);
  }

  move(delta: -1 | 1): void {
    void this.store.moveInstance(this.instanceId(), delta);
  }

  async remove(): Promise<void> {
    const instance = this.instance();
    if (!instance) return;
    const photos = await this.store.countPhotos(instance.id);
    const ok = await this.dialogs.confirm(
      `Supprimer « ${instance.label} » ?`,
      `Toutes les réponses de cette fiche${photos ? ` et ses ${photos} photo(s)` : ''} seront supprimées.`,
      { confirmLabel: 'Supprimer', danger: true },
    );
    if (!ok) return;
    const { prev, next } = this.position();
    await this.store.deleteInstance(instance.id);
    const target = prev ?? next;
    await this.router.navigate(target ? [...this.base(), 'i', target.id] : [...this.base(), 'conditions']);
  }
}
