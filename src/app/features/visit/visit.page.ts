import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { DialogService } from '../../core/services/dialog.service';
import { sheetTitle } from '../../core/templates/question-list';
import { Photo } from '../../core/model/data';
import { IconComponent } from '../../shared/ui/icon.component';
import { PdfPagePickerComponent } from './media/pdf-page-picker.component';
import { NavInstance, NavSection, VisitStore } from './visit-store';

/** Pages de la visite hors fiches, telles qu'affichées dans le sélecteur. */
const PAGE_TITLES: Record<string, string> = {
  conditions: 'Conditions de visite',
  synthese: 'Synthèse et clôture',
  rapport: 'Rapport PDF / Word',
  conclusion: 'Conclusion',
  plans: 'Plans et croquis',
  photos: 'Photos',
};

/**
 * Mise en page d'une visite (lot 6b) : une seule barre (sélecteur de fiche, outils, état d'enregistrement, menu « … »),
 * le plan de visite en surimpression, et la page ouverte dessous.
 */
@Component({
  selector: 'app-visit-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PdfPagePickerComponent, IconComponent],
  providers: [VisitStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit.page.html',
  styleUrl: './visit.page.scss',
})
export class VisitPage {
  readonly projectId = input.required<string>();
  readonly visitId = input.required<string>();
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly planOpen = signal(false);
  readonly menuOpen = signal(false);
  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );

  /** Fiche ouverte (route `i/:instanceId`), sinon null. */
  readonly instanceId = computed(() => /\/i\/([^/?#]+)/.exec(this.url())?.[1] ?? null);
  readonly instance = computed(() => {
    const id = this.instanceId();
    return id ? this.store.instance(id) : undefined;
  });
  readonly section = computed(() => {
    const i = this.instance();
    return i ? this.store.section(i.sectionId) : undefined;
  });
  /** Page de la visite ouverte (conditions, synthese…), hors fiches. */
  readonly page = computed(() => /\/v\/[^/]+\/([a-z]+)(?:[/?#]|$)/.exec(this.url())?.[1] ?? null);

  readonly title = computed(() => {
    const instance = this.instance();
    const section = this.section();
    if (instance && section) return sheetTitle(section, instance);
    return PAGE_TITLES[this.page() ?? ''] ?? 'Visite';
  });
  readonly progress = computed(() => {
    const id = this.instanceId();
    return this.store.nav().flatMap((n) => n.instances).find((i) => i.id === id)?.progress ?? null;
  });
  readonly visitLabel = computed(() => {
    const v = this.store.visit();
    if (!v) return '';
    return v.revision === 0 ? 'Visite initiale' : `Mise à jour ${v.revision}${v.reason ? ` — ${v.reason}` : ''}`;
  });

  /** Plan de visite : fiches uniques, puis fiches répétables réparties sur deux colonnes. */
  readonly singles = computed(() => this.store.nav().filter((n) => !n.section.repeatable));
  readonly repeatables = computed(() => {
    const groups = this.store.nav().filter((n) => n.section.repeatable);
    const half = Math.ceil(groups.length / 2);
    return [groups.slice(0, half), groups.slice(half)].filter((c) => c.length);
  });

  // ---- plan de référence (menu « … » quand il est déjà choisi) ----------------
  readonly reference = computed(() => {
    const id = this.instanceId();
    return id && this.store.hasReferenceConfig(id) ? this.store.referencePlan(id) : null;
  });

  constructor() {
    effect(() => void this.store.load(this.projectId(), this.visitId()));
    // fermer les surimpressions après chaque navigation
    effect(() => {
      this.url();
      this.planOpen.set(false);
      this.menuOpen.set(false);
    });
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    this.planOpen.set(false);
    this.menuOpen.set(false);
    this.store.questionsOpen.set(false);
  }

  togglePlan(): void {
    this.menuOpen.set(false);
    this.planOpen.set(!this.planOpen());
  }

  toggleMenu(): void {
    this.planOpen.set(false);
    this.menuOpen.set(!this.menuOpen());
  }

  toggleQuestions(): void {
    this.planOpen.set(false);
    this.menuOpen.set(false);
    this.store.questionsOpen.set(!this.store.questionsOpen());
  }

  sectionName(nav: NavSection): string {
    return sheetTitle({ label: nav.section.label }, { label: '' });
  }

  ring(i: NavInstance): string {
    return i.progress.total ? `${Math.round((100 * i.progress.answered) / i.progress.total)}%` : '0%';
  }

  isDone(i: NavInstance): boolean {
    return i.progress.total > 0 && i.progress.answered === i.progress.total;
  }

  /** Filtre de la liste des questions, depuis le plan de visite. */
  setFilter(kind: 'changed' | 'probes'): void {
    if (kind === 'changed') this.store.onlyChanged.set(!this.store.onlyChanged());
    else this.store.onlyProbes.set(!this.store.onlyProbes());
    this.planOpen.set(false);
  }

  async addInstance(nav: NavSection): Promise<void> {
    const repeatable = nav.section.repeatable!;
    const used = new Set(nav.instances.map((i) => i.label));
    this.planOpen.set(false);
    const label = await this.dialogs.prompt(`Ajouter : ${repeatable.noun.toLowerCase()}`, {
      suggestions: (repeatable.suggestions ?? []).filter((s) => !used.has(s)),
      confirmLabel: 'Ajouter',
    });
    if (!label) return;
    const instance = await this.store.addInstance(nav.section.id, label);
    if (instance) await this.router.navigate(this.store.link('i', instance.id));
  }

  // ---- actions de la fiche (menu « … ») ---------------------------------------

  readonly siblings = computed(() => this.store.orderedInstances().filter((i) => i.sectionId === this.instance()?.sectionId));

  async rename(): Promise<void> {
    const instance = this.instance();
    const section = this.section();
    this.menuOpen.set(false);
    if (!instance || !section?.repeatable) return;
    const label = await this.dialogs.prompt('Renommer', {
      initial: instance.label, suggestions: section.repeatable.suggestions ?? [], confirmLabel: 'Renommer',
    });
    if (label) await this.store.renameInstance(instance.id, label);
  }

  async duplicate(): Promise<void> {
    const instance = this.instance();
    const section = this.section();
    this.menuOpen.set(false);
    if (!instance || !section?.repeatable) return;
    const label = await this.dialogs.prompt(`Dupliquer « ${instance.label} » (réponses copiées, sans les photos)`, {
      suggestions: section.repeatable.suggestions ?? [], confirmLabel: 'Dupliquer',
    });
    if (!label) return;
    const copy = await this.store.duplicateInstance(instance.id, label);
    if (copy) await this.router.navigate(this.store.link('i', copy.id));
  }

  move(delta: -1 | 1): void {
    const id = this.instanceId();
    this.menuOpen.set(false);
    if (id) void this.store.moveInstance(id, delta);
  }

  async remove(): Promise<void> {
    const instance = this.instance();
    this.menuOpen.set(false);
    if (!instance) return;
    const photos = await this.store.countPhotos(instance.id);
    const ok = await this.dialogs.confirm(
      `Supprimer « ${instance.label} » ?`,
      `Toutes les réponses de cette fiche${photos ? ` et ses ${photos} photo(s)` : ''} seront supprimées.`,
      { confirmLabel: 'Supprimer', danger: true },
    );
    if (!ok) return;
    const list = this.store.orderedInstances();
    const index = list.findIndex((i) => i.id === instance.id);
    const target = list[index - 1] ?? list[index + 1];
    await this.store.deleteInstance(instance.id);
    await this.router.navigate(target ? this.store.link('i', target.id) : this.store.link('conditions'));
  }

  planLabel(photo: Photo): string {
    const kind = photo.kind === 'plan' ? 'Plan' : 'Croquis';
    return `${kind} ${this.store.number(photo)}${photo.caption ? ` — ${photo.caption}` : ` — ${this.store.photoLocation(photo)}`}`;
  }

  choosePlan(photoId: string): void {
    const id = this.instanceId();
    if (id) void this.store.setReferencePlan(id, photoId || null);
  }
}
