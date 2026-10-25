import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { AutosaveQueue } from '../../core/autosave/autosave-queue';
import { EditJournal } from '../../core/autosave/edit-journal';
import { PhotoPatch, ReadOnlyVisitError } from '../../core/db/diag-repository';
import { blankSketch, compressImage, PHOTO_OPTIONS, PLAN_OPTIONS } from '../../core/media/image-compress';
import { ImportedPlan, openPdf, PdfHandle } from '../../core/media/pdf-plan';
import { Answer, AnswerPatch, LegendEntry, Photo, Project, SectionInstance, Visit, VisitCursor } from '../../core/model/data';
import { StorageService } from '../../core/services/storage.service';
import { MediaRequest, PhotoView } from '../../shared/photo-strip.component';
import { ResolvedItem, ResolvedSection, ResolvedTemplate } from '../../core/model/template';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { answerKey, instanceProgress, Progress, resolveTemplate, sectionItems } from '../../core/templates/template-engine';

export interface NavInstance extends SectionInstance {
  progress: Progress;
}

/** Item réservé aux plans de la conclusion (photo rattachée à la visite). */
export const CONCLUSION_ITEM = '__conclusion';

/** Emplacement d'une photo : un item d'une fiche, ou la visite (null / null). */
export interface MediaTarget {
  instanceId: string | null;
  itemId: string | null;
}

export interface PdfChoice {
  pageCount: number;
  thumbs: string[];
  choose: (page: number | null) => void;
}

export interface NavSection {
  section: ResolvedSection;
  instances: NavInstance[];
}

/**
 * État d'une visite ouverte. Les réponses sont gardées en mémoire (source de vérité pour l'écran)
 * et écrites en tâche de fond par l'AutosaveQueue : la base ne renvoie jamais un texte périmé
 * dans un champ en cours de frappe.
 */
@Injectable()
export class VisitStore implements OnDestroy {
  private readonly data = inject(DataService);
  private readonly dialogs = inject(DialogService);
  private readonly repo = this.data.repo;

  readonly project = signal<Project | null>(null);
  readonly visit = signal<Visit | null>(null);
  readonly template = signal<ResolvedTemplate | null>(null);
  readonly answers = signal<Map<string, Answer>>(new Map());
  readonly pendingWrites = signal(0);
  readonly saveError = signal<string | null>(null);
  readonly notFound = signal(false);
  readonly photos = signal<Photo[]>([]);
  /** Nombre de photos / plans en cours de traitement. */
  readonly mediaBusy = signal(0);
  /** Choix de la page d'un PDF de plusieurs pages (affiché par la page de visite). */
  readonly pdfChoice = signal<PdfChoice | null>(null);
  private readonly thumbs = signal<Map<string, string>>(new Map());
  private mediaChain: Promise<void> = Promise.resolve();
  private readonly storage = inject(StorageService);

  readonly readOnly = computed(() => this.visit()?.status !== 'draft');

  readonly orderedInstances = computed<SectionInstance[]>(() => {
    const visit = this.visit();
    const template = this.template();
    if (!visit || !template) return [];
    return template.sections.flatMap((s) =>
      visit.instances.filter((i) => i.sectionId === s.id).sort((a, b) => a.order - b.order),
    );
  });

  readonly nav = computed<NavSection[]>(() => {
    const template = this.template();
    const answers = [...this.answers().values()];
    if (!template) return [];
    return template.sections.map((section) => ({
      section,
      instances: this.orderedInstances()
        .filter((i) => i.sectionId === section.id)
        .map((i) => ({
          ...i,
          progress: instanceProgress(section.items, answers.filter((a) => a.instanceId === i.id)),
        })),
    }));
  });

  readonly totalProgress = computed<Progress>(() =>
    this.nav().flatMap((s) => s.instances).reduce(
      (acc, i) => ({ answered: acc.answered + i.progress.answered, total: acc.total + i.progress.total }),
      { answered: 0, total: 0 },
    ),
  );

  private readonly queue = new AutosaveQueue<AnswerPatch>((key, patch) => {
    const visitId = this.visit()!.id;
    const [instanceId, itemId] = key.split('|');
    return this.repo.saveAnswer(visitId, instanceId, itemId, patch).then(() => undefined);
  });

  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') void this.queue.flush();
  };
  private readonly onPageHide = () => void this.queue.flush();

  constructor() {
    this.queue.onPendingChange = (n) => this.pendingWrites.set(n);
    this.queue.onError = (error) => {
      const message = error instanceof ReadOnlyVisitError
        ? error.message
        : (error as Error)?.name === 'QuotaExceededError'
          ? "L'iPad n'a plus assez d'espace : la dernière modification n'est pas enregistrée."
          : `Enregistrement impossible : ${(error as Error)?.message ?? error}`;
      this.saveError.set(message);
      this.dialogs.notify(message, true);
    };
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPageHide);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
    void this.queue.flush();
    for (const url of this.thumbs().values()) URL.revokeObjectURL(url);
  }

  async load(projectId: string, visitId: string): Promise<void> {
    if (this.visit()?.id === visitId) return;
    await this.queue.flush();
    const journal = new EditJournal(visitId);
    // Rejoue les frappes non enregistrées si Safari a été fermé brutalement
    for (const [key, patch] of journal.pending()) {
      const [instanceId, itemId] = key.split('|');
      await this.repo.saveAnswer(visitId, instanceId, itemId, patch).catch(() => undefined);
      journal.delete(key);
    }
    this.queue.journal = journal;
    const [project, visit, answers] = await Promise.all([
      this.repo.getProject(projectId),
      this.repo.getVisit(visitId),
      this.repo.getAnswers(visitId),
    ]);
    if (!project || !visit || visit.projectId !== projectId) {
      this.notFound.set(true);
      return;
    }
    this.project.set(project);
    this.template.set(resolveTemplate(project.templateSnapshot));
    this.answers.set(new Map(answers.map((a) => [answerKey(a.instanceId, a.itemId), a])));
    this.visit.set(visit);
    await this.loadPhotos();
  }

  private async reloadMeta(): Promise<void> {
    const visit = this.visit();
    if (!visit) return;
    const [project, fresh] = await Promise.all([this.repo.getProject(visit.projectId), this.repo.getVisit(visit.id)]);
    if (project) this.project.set(project);
    if (fresh) this.visit.set(fresh);
  }

  /** Exécute une action structurelle et affiche l'erreur éventuelle. */
  private async run<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      await this.queue.flush();
      const result = await action();
      await this.reloadMeta();
      return result;
    } catch (error) {
      this.dialogs.notify((error as Error).message, true);
      return undefined;
    }
  }

  /** Lien vers une page de la visite : link('i', id), link('synthese')… */
  link(...parts: string[]): string[] {
    const v = this.visit();
    return v ? ['/dossiers', v.projectId, 'v', v.id, ...parts] : ['/'];
  }

  // ---- réponses -------------------------------------------------------------

  answer(instanceId: string, itemId: string): Answer | undefined {
    return this.answers().get(answerKey(instanceId, itemId));
  }

  instanceAnswers(instanceId: string): Answer[] {
    return [...this.answers().values()].filter((a) => a.instanceId === instanceId);
  }

  /** Met à jour l'écran tout de suite et programme l'écriture. `debounce` pour la frappe au clavier. */
  setAnswer(instanceId: string, itemId: string, patch: AnswerPatch, options: { debounce?: boolean } = {}): void {
    const visit = this.visit();
    if (!visit || this.readOnly()) return;
    const key = answerKey(instanceId, itemId);
    const current: Answer = this.answers().get(key) ?? {
      visitId: visit.id, instanceId, itemId, value: null, observation: '',
      changedInRevision: visit.revision, updatedAt: 0,
    };
    const next: Answer = { ...current, updatedAt: Date.now(), changedInRevision: visit.revision };
    if ('value' in patch) next.value = patch.value ?? null;
    if ('other' in patch) next.other = patch.other;
    if ('observation' in patch) next.observation = patch.observation ?? '';
    if (patch.defect === null) delete next.defect;
    else if (patch.defect) next.defect = patch.defect;
    const map = new Map(this.answers());
    map.set(key, next);
    this.answers.set(map);
    this.saveError.set(null);
    this.queue.push(key, patch, options);
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }

  // ---- photos, plans, croquis -----------------------------------------------

  /** Photos visibles dans cette visite, rangées par emplacement « instanceId|itemId ». */
  readonly photosByTarget = computed(() => {
    const map = new Map<string, Photo[]>();
    for (const p of this.photos()) {
      const key = answerKey(p.instanceId ?? '', p.itemId ?? '');
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    for (const list of map.values()) list.sort((a, b) => a.order - b.order || a.number - b.number);
    return map;
  });

  photosOf(instanceId: string | null, itemId: string | null): Photo[] {
    return this.photosByTarget().get(answerKey(instanceId ?? '', itemId ?? '')) ?? [];
  }

  photo(photoId: string): Photo | undefined {
    return this.photos().find((p) => p.id === photoId);
  }

  getBlob(blobId: string) {
    return this.repo.getBlob(blobId);
  }

  thumbUrl(photo: Photo): string | undefined {
    return this.thumbs().get(photo.blobId);
  }

  private async loadPhotos(): Promise<void> {
    const visit = this.visit();
    if (!visit) return;
    this.photos.set(await this.repo.getVisiblePhotos(visit.id));
    await this.loadThumbs();
  }

  /** Crée les URL des vignettes manquantes (les binaires sont lus à la demande). */
  private async loadThumbs(): Promise<void> {
    const map = new Map(this.thumbs());
    let changed = false;
    for (const p of this.photos()) {
      if (map.has(p.blobId)) continue;
      const blob = await this.repo.getBlob(p.blobId);
      if (blob) {
        map.set(p.blobId, URL.createObjectURL(blob.thumb));
        changed = true;
      }
    }
    if (changed) this.thumbs.set(map);
  }

  /** Traitement d'image : une seule opération à la fois (mémoire de l'iPad). */
  private enqueueMedia<T>(task: () => Promise<T>): Promise<T | undefined> {
    this.mediaBusy.update((n) => n + 1);
    const run = this.mediaChain.then(task).catch((error) => {
      const quota = (error as Error)?.name === 'QuotaExceededError';
      this.dialogs.notify(quota ? "L'iPad n'a plus assez d'espace pour enregistrer cette image." : (error as Error).message, true);
      return undefined;
    }).finally(() => {
      this.mediaBusy.update((n) => n - 1);
      void this.storage.refresh();
    });
    this.mediaChain = run.then(() => undefined);
    return run;
  }

  private async savePhoto(target: MediaTarget, kind: Photo['kind'], data: ImportedPlan): Promise<Photo> {
    const photo = await this.repo.addPhoto(this.visit()!.id, { ...target, kind, ...data });
    this.photos.update((list) => [...list, photo]);
    await this.loadThumbs();
    return photo;
  }

  /** Photos prises ou choisies dans la photothèque, compressées une par une. */
  addImages(files: File[], target: MediaTarget, kind: 'photo' | 'plan' = 'photo'): Promise<(Photo | undefined)[]> {
    if (this.readOnly()) return Promise.resolve([]);
    return Promise.all(files.map((file) => this.enqueueMedia(async () => {
      const data = await compressImage(file, kind === 'plan' ? PLAN_OPTIONS : PHOTO_OPTIONS);
      return this.savePhoto(target, kind, data);
    })));
  }

  importPdf(file: File, target: MediaTarget): Promise<Photo | undefined> {
    if (this.readOnly()) return Promise.resolve(undefined);
    return this.enqueueMedia(async () => {
      const pdf = await openPdf(file);
      try {
        const page = pdf.pageCount > 1 ? await this.choosePdfPage(pdf) : 0;
        if (page === null) return undefined;
        return await this.savePhoto(target, 'plan', await pdf.importPage(page));
      } finally {
        await pdf.close();
      }
    });
  }

  addSketch(target: MediaTarget): Promise<Photo | undefined> {
    if (this.readOnly()) return Promise.resolve(undefined);
    return this.enqueueMedia(async () => this.savePhoto(target, 'sketch', await blankSketch()));
  }

  /** Point d'entrée des boutons photo : renvoie le croquis créé (à ouvrir dans l'annotateur). */
  async handleMedia(request: MediaRequest, target: MediaTarget): Promise<Photo | undefined> {
    switch (request.source) {
      case 'camera':
      case 'library':
        await this.addImages(request.files ?? [], target, 'photo');
        return undefined;
      case 'plan-photo':
        await this.addImages(request.files ?? [], target, 'plan');
        return undefined;
      case 'pdf':
        return request.files?.[0] ? this.importPdf(request.files[0], target) : undefined;
      case 'sketch':
        return this.addSketch(target);
    }
  }

  photoViews(instanceId: string | null, itemId: string | null): PhotoView[] {
    return this.photosOf(instanceId, itemId).map((p) => this.toView(p));
  }

  toView(p: Photo): PhotoView {
    return { id: p.id, number: p.number, caption: p.caption, kind: p.kind, url: this.thumbUrl(p), annotated: p.annotations.length > 0 };
  }

  /** Libellé de l'emplacement d'une photo (« Bâtiment A — État des tuiles »). */
  photoLocation(p: Photo): string {
    if (p.itemId === CONCLUSION_ITEM) return 'Conclusion';
    if (!p.instanceId) return 'Visite';
    const instance = this.instance(p.instanceId);
    const item = instance ? this.items(instance.sectionId).find((i) => i.id === p.itemId) : undefined;
    const section = instance ? this.section(instance.sectionId) : undefined;
    const where = section?.repeatable ? instance?.label : section?.label;
    return [where ?? 'Fiche supprimée', item?.label].filter(Boolean).join(' — ');
  }

  /** Affiche les pages du PDF et attend le choix (null si annulé). */
  private choosePdfPage(pdf: PdfHandle): Promise<number | null> {
    return new Promise((resolve) => {
      const urls: string[] = [];
      const done = (page: number | null) => {
        this.pdfChoice.set(null);
        urls.forEach((u) => URL.revokeObjectURL(u));
        resolve(page);
      };
      this.pdfChoice.set({ pageCount: pdf.pageCount, thumbs: [], choose: done });
      // miniatures une à une, affichées au fur et à mesure
      void (async () => {
        for (let i = 0; i < pdf.pageCount && this.pdfChoice(); i++) {
          const url = URL.createObjectURL(await pdf.thumbnail(i, 300));
          urls.push(url);
          this.pdfChoice.update((c) => (c ? { ...c, thumbs: [...c.thumbs, url] } : c));
        }
      })().catch(() => undefined);
    });
  }

  async updatePhoto(photoId: string, patch: PhotoPatch): Promise<Photo | undefined> {
    const visit = this.visit();
    if (!visit || this.readOnly()) return undefined;
    try {
      const updated = await this.repo.updatePhoto(visit.id, photoId, patch);
      this.photos.update((list) => list.map((p) => (p.id === photoId ? updated : p)));
      return updated;
    } catch (error) {
      this.dialogs.notify((error as Error).message, true);
      return undefined;
    }
  }

  async deletePhoto(photoId: string): Promise<void> {
    const visit = this.visit();
    if (!visit) return;
    try {
      await this.repo.deletePhoto(visit.id, photoId);
      this.photos.update((list) => list.filter((p) => p.id !== photoId));
      void this.storage.refresh();
    } catch (error) {
      this.dialogs.notify((error as Error).message, true);
    }
  }

  async setLegend(legend: LegendEntry[]): Promise<void> {
    const project = this.project();
    if (!project) return;
    this.project.set({ ...project, legend });
    await this.repo.setLegend(project.id, legend);
  }

  // ---- champs du dossier et de la visite ------------------------------------

  async setProjectField(id: string, value: unknown): Promise<void> {
    const project = this.project();
    if (!project) return;
    this.project.set({ ...project, fields: { ...project.fields, [id]: value } });
    await this.data.repo.updateProjectFields(project.id, { [id]: value }).catch((e) => this.dialogs.notify(e.message, true));
  }

  async setVisitField(id: string, value: unknown): Promise<void> {
    const visit = this.visit();
    if (!visit || this.readOnly()) return;
    this.visit.set({ ...visit, fields: { ...visit.fields, [id]: value } });
    await this.repo.updateVisitFields(visit.id, { [id]: value }).catch((e) => this.dialogs.notify(e.message, true));
  }

  private conclusionTimer?: ReturnType<typeof setTimeout>;

  /** Conclusion : affichage immédiat, écriture après 400 ms sans frappe. */
  setConclusion(text: string): void {
    const visit = this.visit();
    if (!visit || this.readOnly()) return;
    this.visit.set({ ...visit, conclusion: text });
    this.pendingWrites.update((n) => n + 1);
    clearTimeout(this.conclusionTimer);
    this.conclusionTimer = setTimeout(() => {
      void this.repo.setConclusion(visit.id, text)
        .catch((e) => this.dialogs.notify(e.message, true))
        .finally(() => this.pendingWrites.update((n) => Math.max(0, n - 1)));
    }, 400);
  }

  // ---- instances ------------------------------------------------------------

  items(sectionId: string): ResolvedItem[] {
    const template = this.template();
    return template ? sectionItems(template, sectionId) : [];
  }

  section(sectionId: string): ResolvedSection | undefined {
    return this.template()?.sections.find((s) => s.id === sectionId);
  }

  instance(instanceId: string): SectionInstance | undefined {
    return this.visit()?.instances.find((i) => i.id === instanceId);
  }

  addInstance(sectionId: string, label: string) {
    return this.run(() => this.repo.addInstance(this.visit()!.id, sectionId, label));
  }

  renameInstance(instanceId: string, label: string) {
    return this.run(() => this.repo.renameInstance(this.visit()!.id, instanceId, label));
  }

  moveInstance(instanceId: string, delta: -1 | 1) {
    return this.run(() => this.repo.moveInstance(this.visit()!.id, instanceId, delta));
  }

  async duplicateInstance(instanceId: string, label: string) {
    const copy = await this.run(() => this.repo.duplicateInstance(this.visit()!.id, instanceId, label));
    if (copy) {
      const answers = await this.repo.getAnswers(this.visit()!.id);
      this.answers.set(new Map(answers.map((a) => [answerKey(a.instanceId, a.itemId), a])));
    }
    return copy;
  }

  async deleteInstance(instanceId: string) {
    await this.run(() => this.repo.deleteInstance(this.visit()!.id, instanceId));
    const map = new Map([...this.answers()].filter(([, a]) => a.instanceId !== instanceId));
    this.answers.set(map);
    await this.loadPhotos();
  }

  countPhotos(instanceId: string): Promise<number> {
    return this.repo.countPhotos(this.visit()!.projectId, instanceId);
  }

  // ---- statut et navigation -------------------------------------------------

  close() {
    return this.run(() => this.repo.closeVisit(this.visit()!.id));
  }

  reopen() {
    return this.run(() => this.repo.reopenVisit(this.visit()!.id));
  }

  saveCursor(cursor: VisitCursor): void {
    const visit = this.visit();
    if (!visit) return;
    visit.cursor = cursor; // pas de signal : n'affecte pas l'affichage
    void this.repo.setCursor(visit.id, cursor);
  }
}
