import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { AutosaveQueue } from '../../core/autosave/autosave-queue';
import { EditJournal } from '../../core/autosave/edit-journal';
import { ReadOnlyVisitError } from '../../core/db/diag-repository';
import { Answer, AnswerPatch, Project, SectionInstance, Visit, VisitCursor } from '../../core/model/data';
import { ResolvedItem, ResolvedSection, ResolvedTemplate } from '../../core/model/template';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { answerKey, instanceProgress, Progress, resolveTemplate, sectionItems } from '../../core/templates/template-engine';

export interface NavInstance extends SectionInstance {
  progress: Progress;
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
