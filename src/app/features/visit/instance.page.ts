import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, input, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ResolvedItem } from '../../core/model/template';
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
