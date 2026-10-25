import {
  Answer,
  AnswerPatch,
  Project,
  SectionInstance,
  Visit,
  VisitCursor,
} from '../model/data';
import { ChecklistTemplate } from '../model/template';
import { DiagDb } from './diag-db';

export interface RepositoryDeps {
  now: () => number;
  uuid: () => string;
}

export const defaultDeps: RepositoryDeps = {
  now: () => Date.now(),
  uuid: () => crypto.randomUUID(),
};

export class ReadOnlyVisitError extends Error {
  constructor() {
    super('Cette visite est clôturée : rouvrez-la pour la modifier.');
    this.name = 'ReadOnlyVisitError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} introuvable.`);
    this.name = 'NotFoundError';
  }
}

export interface ProjectSummary {
  project: Project;
  latestVisit: Visit;
}

const pad = (n: number, size: number) => String(n).padStart(size, '0');

/** Seul point d'écriture dans la base : les composants n'accèdent jamais à Dexie directement. */
export class DiagRepository {
  constructor(
    readonly db: DiagDb,
    private readonly deps: RepositoryDeps = defaultDeps,
  ) {}

  static needsExport(visit: Visit): boolean {
    return visit.exportedAt === undefined || visit.updatedAt > visit.exportedAt;
  }

  // ---- dossiers -------------------------------------------------------------

  async createProject(
    template: ChecklistTemplate,
    fields: Record<string, unknown>,
  ): Promise<{ project: Project; visit: Visit }> {
    const now = this.deps.now();
    const snapshot = structuredClone(template);
    return this.db.transaction('rw', this.db.projects, this.db.visits, this.db.settings, async () => {
      const project: Project = {
        id: this.deps.uuid(),
        reference: await this.nextReference(now),
        fields: { ...fields },
        templateId: template.templateId,
        templateVersion: template.version,
        templateSnapshot: snapshot,
        legend: [],
        createdAt: now,
        updatedAt: now,
      };
      const visit: Visit = {
        id: this.deps.uuid(),
        projectId: project.id,
        revision: 0,
        fields: {},
        instances: this.initialInstances(snapshot),
        conclusion: '',
        status: 'draft',
        cursor: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.db.projects.add(project);
      await this.db.visits.add(visit);
      return { project, visit };
    });
  }

  private initialInstances(template: ChecklistTemplate): SectionInstance[] {
    const instances: SectionInstance[] = [];
    template.sections.forEach((section) => {
      if (!section.repeatable) {
        instances.push({ id: section.id, sectionId: section.id, label: section.label, order: 0 });
        return;
      }
      for (let k = 1; k <= (section.repeatable.min ?? 0); k++) {
        instances.push({
          id: this.deps.uuid(), sectionId: section.id, label: `${section.repeatable.noun} ${k}`, order: k - 1,
        });
      }
    });
    return instances;
  }

  /** Référence AAAA-MM-NNN, numérotée dans l'année. */
  private async nextReference(now: number): Promise<string> {
    const d = new Date(now);
    const year = d.getFullYear();
    const key = `refCounter:${year}`;
    const current = ((await this.db.settings.get(key))?.value as number | undefined) ?? 0;
    await this.db.settings.put({ key, value: current + 1 });
    return `${year}-${pad(d.getMonth() + 1, 2)}-${pad(current + 1, 3)}`;
  }

  getProject(id: string): Promise<Project | undefined> {
    return this.db.projects.get(id);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const projects = await this.db.projects.orderBy('updatedAt').reverse().toArray();
    const visits = await this.db.visits.toArray();
    const latest = new Map<string, Visit>();
    for (const v of visits) {
      const current = latest.get(v.projectId);
      if (!current || v.revision > current.revision) latest.set(v.projectId, v);
    }
    return projects
      .filter((p) => latest.has(p.id))
      .map((project) => ({ project, latestVisit: latest.get(project.id)! }));
  }

  async updateProjectFields(projectId: string, patch: Record<string, unknown>): Promise<void> {
    await this.db.transaction('rw', this.db.projects, async () => {
      const project = await this.db.projects.get(projectId);
      if (!project) throw new NotFoundError('Dossier');
      await this.db.projects.update(projectId, {
        fields: { ...project.fields, ...patch },
        updatedAt: this.deps.now(),
      });
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const { db } = this;
    await db.transaction('rw', [db.projects, db.visits, db.answers, db.photos, db.blobs], async () => {
      const visitIds = await db.visits.where('projectId').equals(projectId).primaryKeys();
      await db.answers.where('visitId').anyOf(visitIds).delete();
      await db.visits.bulkDelete(visitIds);
      const photos = await db.photos.where('projectId').equals(projectId).toArray();
      await db.photos.bulkDelete(photos.map((p) => p.id));
      for (const blobId of new Set(photos.map((p) => p.blobId))) {
        if ((await db.photos.where('blobId').equals(blobId).count()) === 0) await db.blobs.delete(blobId);
      }
      await db.projects.delete(projectId);
    });
  }

  // ---- visites --------------------------------------------------------------

  getVisit(id: string): Promise<Visit | undefined> {
    return this.db.visits.get(id);
  }

  getVisitsOfProject(projectId: string): Promise<Visit[]> {
    return this.db.visits.where('projectId').equals(projectId).sortBy('revision');
  }

  /** Charge une visite modifiable, applique la modification et date le changement (visite + dossier). */
  private async mutateVisit<T>(
    visitId: string,
    mutate: (visit: Visit) => Promise<T> | T,
    options: { allowReadOnly?: boolean } = {},
  ): Promise<T> {
    const { db } = this;
    return db.transaction('rw', [db.visits, db.projects, db.answers], async () => {
      const visit = await db.visits.get(visitId);
      if (!visit) throw new NotFoundError('Visite');
      if (!options.allowReadOnly && visit.status !== 'draft') throw new ReadOnlyVisitError();
      const result = await mutate(visit);
      const now = this.deps.now();
      visit.updatedAt = now;
      await db.visits.put(visit);
      await db.projects.update(visit.projectId, { updatedAt: now });
      return result;
    });
  }

  updateVisitFields(visitId: string, patch: Record<string, unknown>): Promise<void> {
    return this.mutateVisit(visitId, (visit) => {
      visit.fields = { ...visit.fields, ...patch };
    });
  }

  setConclusion(visitId: string, conclusion: string): Promise<void> {
    return this.mutateVisit(visitId, (visit) => {
      visit.conclusion = conclusion;
    });
  }

  /** Le curseur est une préférence de navigation : il ne date pas la visite. */
  async setCursor(visitId: string, cursor: VisitCursor): Promise<void> {
    await this.db.visits.update(visitId, { cursor });
  }

  closeVisit(visitId: string): Promise<void> {
    return this.mutateVisit(visitId, (visit) => {
      visit.status = 'closed';
      visit.closedAt = this.deps.now();
    });
  }

  reopenVisit(visitId: string): Promise<void> {
    return this.mutateVisit(
      visitId,
      async (visit) => {
        const newer = await this.db.visits
          .where('projectId').equals(visit.projectId)
          .filter((v) => v.revision > visit.revision)
          .count();
        if (newer > 0) throw new Error('Une mise à jour plus récente existe : cette visite reste en lecture seule.');
        visit.status = 'draft';
      },
      { allowReadOnly: true },
    );
  }

  /** Marque la visite comme exportée (Lot 4 : appelé après une sauvegarde réussie). */
  async markExported(visitId: string): Promise<void> {
    const now = this.deps.now();
    await this.db.visits.update(visitId, { status: 'exported', exportedAt: now, updatedAt: now });
  }

  // ---- instances ------------------------------------------------------------

  private sectionOf(visit: Visit, sectionId: string, project: Project) {
    const section = project.templateSnapshot.sections.find((s) => s.id === sectionId);
    if (!section) throw new NotFoundError('Section');
    return section;
  }

  private async projectOf(visit: Visit): Promise<Project> {
    const project = await this.db.projects.get(visit.projectId);
    if (!project) throw new NotFoundError('Dossier');
    return project;
  }

  addInstance(visitId: string, sectionId: string, label: string): Promise<SectionInstance> {
    return this.mutateVisit(visitId, async (visit) => {
      const section = this.sectionOf(visit, sectionId, await this.projectOf(visit));
      if (!section.repeatable) throw new Error(`La section « ${section.label} » n'est pas répétable.`);
      const siblings = visit.instances.filter((i) => i.sectionId === sectionId);
      const instance: SectionInstance = {
        id: this.deps.uuid(),
        sectionId,
        label: label.trim() || `${section.repeatable.noun} ${siblings.length + 1}`,
        order: siblings.reduce((max, i) => Math.max(max, i.order + 1), 0),
      };
      visit.instances.push(instance);
      return instance;
    });
  }

  renameInstance(visitId: string, instanceId: string, label: string): Promise<void> {
    return this.mutateVisit(visitId, (visit) => {
      const instance = visit.instances.find((i) => i.id === instanceId);
      if (!instance) throw new NotFoundError('Instance');
      if (label.trim()) instance.label = label.trim();
    });
  }

  /** Déplace une instance d'un cran (delta = -1 vers le haut, +1 vers le bas) dans sa section. */
  moveInstance(visitId: string, instanceId: string, delta: -1 | 1): Promise<void> {
    return this.mutateVisit(visitId, (visit) => {
      const instance = visit.instances.find((i) => i.id === instanceId);
      if (!instance) throw new NotFoundError('Instance');
      const siblings = visit.instances
        .filter((i) => i.sectionId === instance.sectionId)
        .sort((a, b) => a.order - b.order);
      const from = siblings.indexOf(instance);
      const to = from + delta;
      if (to < 0 || to >= siblings.length) return;
      siblings.splice(from, 1);
      siblings.splice(to, 0, instance);
      siblings.forEach((s, i) => (s.order = i));
    });
  }

  duplicateInstance(visitId: string, instanceId: string, label: string): Promise<SectionInstance> {
    return this.mutateVisit(visitId, async (visit) => {
      const source = visit.instances.find((i) => i.id === instanceId);
      if (!source) throw new NotFoundError('Instance');
      const siblings = visit.instances.filter((i) => i.sectionId === source.sectionId);
      const copy: SectionInstance = {
        id: this.deps.uuid(),
        sectionId: source.sectionId,
        label: label.trim() || `${source.label} (copie)`,
        order: siblings.reduce((max, i) => Math.max(max, i.order + 1), 0),
      };
      visit.instances.push(copy);
      const now = this.deps.now();
      const answers = await this.db.answers.where('[visitId+instanceId]').equals([visitId, instanceId]).toArray();
      await this.db.answers.bulkAdd(answers.map((a) => ({
        ...structuredClone(a), instanceId: copy.id, changedInRevision: visit.revision, updatedAt: now,
      })));
      return copy;
    });
  }

  async countPhotos(projectId: string, instanceId: string): Promise<number> {
    return this.db.photos
      .where('projectId').equals(projectId)
      .filter((p) => p.instanceId === instanceId && p.removedInRevision === undefined)
      .count();
  }

  deleteInstance(visitId: string, instanceId: string): Promise<void> {
    const { db } = this;
    return db.transaction('rw', [db.visits, db.projects, db.answers, db.photos, db.blobs], () =>
      this.mutateVisit(visitId, async (visit) => {
        const instance = visit.instances.find((i) => i.id === instanceId);
        if (!instance) throw new NotFoundError('Instance');
        const section = this.sectionOf(visit, instance.sectionId, await this.projectOf(visit));
        if (!section.repeatable) throw new Error(`La section « ${section.label} » ne peut pas être supprimée.`);
        visit.instances = visit.instances.filter((i) => i.id !== instanceId);
        await db.answers.where('[visitId+instanceId]').equals([visitId, instanceId]).delete();
        // Photos : supprimées si ajoutées dans cette révision, sinon masquées à partir d'elle.
        const photos = await db.photos
          .where('projectId').equals(visit.projectId)
          .filter((p) => p.instanceId === instanceId && p.removedInRevision === undefined)
          .toArray();
        for (const photo of photos) {
          if (photo.addedInRevision === visit.revision) {
            await db.photos.delete(photo.id);
            if ((await db.photos.where('blobId').equals(photo.blobId).count()) === 0) await db.blobs.delete(photo.blobId);
          } else {
            await db.photos.update(photo.id, { removedInRevision: visit.revision });
          }
        }
      }),
    );
  }

  // ---- réponses -------------------------------------------------------------

  getAnswers(visitId: string): Promise<Answer[]> {
    return this.db.answers.where('visitId').equals(visitId).toArray();
  }

  /** Crée ou complète une réponse. `defect: null` retire le désordre. */
  saveAnswer(visitId: string, instanceId: string, itemId: string, patch: AnswerPatch): Promise<Answer> {
    return this.mutateVisit(visitId, async (visit) => {
      const existing = await this.db.answers.get([visitId, instanceId, itemId]);
      const next: Answer = existing ?? {
        visitId, instanceId, itemId, value: null, observation: '', changedInRevision: visit.revision, updatedAt: 0,
      };
      if ('value' in patch) next.value = patch.value ?? null;
      if ('other' in patch) next.other = patch.other;
      if ('observation' in patch) next.observation = patch.observation ?? '';
      if (patch.defect === null) delete next.defect;
      else if (patch.defect) next.defect = patch.defect;
      next.changedInRevision = visit.revision;
      next.updatedAt = this.deps.now();
      await this.db.answers.put(next);
      return next;
    });
  }
}
