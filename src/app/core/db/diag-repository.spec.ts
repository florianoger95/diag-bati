import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleTemplate } from '../testing/fixtures';
import { DiagDb } from './diag-db';
import { DiagRepository, ReadOnlyVisitError } from './diag-repository';

let db: DiagDb;
let repo: DiagRepository;
let clock: number;
let seq: number;

beforeEach(async () => {
  db = new DiagDb(`test-${Math.random()}`);
  clock = Date.UTC(2026, 9, 25, 10, 0);
  seq = 0;
  repo = new DiagRepository(db, { now: () => clock, uuid: () => `id-${++seq}` });
});

afterEach(async () => {
  await db.delete();
});

async function newProject() {
  return repo.createProject(sampleTemplate(), { projet: 'Maison des Tilleuls', adresse: '12 rue des Lilas' });
}

describe('création de dossier', () => {
  it('crée le dossier, sa copie du modèle et la visite initiale', async () => {
    const { project, visit } = await newProject();
    expect(project.reference).toBe('2026-10-001');
    expect(project.templateSnapshot.templateId).toBe('test-diag');
    expect(project.fields['projet']).toBe('Maison des Tilleuls');
    expect(visit.projectId).toBe(project.id);
    expect(visit.revision).toBe(0);
    expect(visit.status).toBe('draft');
    expect(await db.projects.count()).toBe(1);
    expect(await db.visits.count()).toBe(1);
  });

  it('copie le modèle : le modifier ensuite ne change pas le dossier', async () => {
    const template = sampleTemplate();
    const { project } = await repo.createProject(template, {});
    template.label = 'Modifié';
    expect((await repo.getProject(project.id))!.templateSnapshot.label).toBe('Diagnostic de test');
  });

  it('crée une instance par section non répétable et le minimum des répétables', async () => {
    const { visit } = await newProject();
    expect(visit.instances.map((i) => [i.sectionId, i.label])).toEqual([
      ['generalites', 'Généralités'],
      ['facades', 'Façade 1'],
    ]);
    expect(visit.instances[0].id).toBe('generalites');
  });

  it('incrémente la référence dans l’année et repart à 1 l’année suivante', async () => {
    await newProject();
    expect((await newProject()).project.reference).toBe('2026-10-002');
    clock = Date.UTC(2027, 0, 3);
    expect((await newProject()).project.reference).toBe('2027-01-001');
  });
});

describe('instances', () => {
  it('ajoute une instance à la fin de sa section', async () => {
    const { visit } = await newProject();
    const a = await repo.addInstance(visit.id, 'couverture', 'Bâtiment A');
    const b = await repo.addInstance(visit.id, 'couverture', 'Bâtiment B');
    const v = (await repo.getVisit(visit.id))!;
    const couv = v.instances.filter((i) => i.sectionId === 'couverture').sort((x, y) => x.order - y.order);
    expect(couv.map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it('refuse d’ajouter une instance à une section non répétable', async () => {
    const { visit } = await newProject();
    await expect(repo.addInstance(visit.id, 'generalites', 'Bis')).rejects.toThrow();
  });

  it('renomme et réordonne une instance', async () => {
    const { visit } = await newProject();
    const a = await repo.addInstance(visit.id, 'couverture', 'A');
    const b = await repo.addInstance(visit.id, 'couverture', 'B');
    await repo.renameInstance(visit.id, a.id, 'Bâtiment A');
    await repo.moveInstance(visit.id, b.id, -1);
    const v = (await repo.getVisit(visit.id))!;
    const couv = v.instances.filter((i) => i.sectionId === 'couverture').sort((x, y) => x.order - y.order);
    expect(couv.map((i) => i.label)).toEqual(['B', 'Bâtiment A']);
  });

  it('duplique une instance avec ses réponses', async () => {
    const { visit } = await newProject();
    const a = await repo.addInstance(visit.id, 'couverture', 'Cuisine');
    await repo.saveAnswer(visit.id, a.id, 'couv-etat', { value: 'bon', observation: 'RAS' });
    const copy = await repo.duplicateInstance(visit.id, a.id, 'Salle de bain');
    const answers = await repo.getAnswers(visit.id);
    const copied = answers.find((x) => x.instanceId === copy.id && x.itemId === 'couv-etat');
    expect(copied?.value).toBe('bon');
    expect(copied?.observation).toBe('RAS');
  });

  it('supprime une instance et ses réponses, sans toucher aux autres', async () => {
    const { visit } = await newProject();
    const a = await repo.addInstance(visit.id, 'couverture', 'A');
    const b = await repo.addInstance(visit.id, 'couverture', 'B');
    await repo.saveAnswer(visit.id, a.id, 'couv-etat', { value: 'bon' });
    await repo.saveAnswer(visit.id, b.id, 'couv-etat', { value: 'moyen' });
    await repo.deleteInstance(visit.id, a.id);
    const v = (await repo.getVisit(visit.id))!;
    expect(v.instances.some((i) => i.id === a.id)).toBe(false);
    const answers = await repo.getAnswers(visit.id);
    expect(answers.map((x) => x.instanceId)).toEqual([b.id]);
  });

  it('refuse de supprimer une instance non répétable', async () => {
    const { visit } = await newProject();
    await expect(repo.deleteInstance(visit.id, 'generalites')).rejects.toThrow();
  });
});

describe('réponses', () => {
  it('crée puis complète une réponse (upsert partiel)', async () => {
    const { visit } = await newProject();
    await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'Couvert' });
    clock += 1000;
    const saved = await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { observation: 'Sec' });
    expect(saved.value).toBe('Couvert');
    expect(saved.observation).toBe('Sec');
    expect(saved.changedInRevision).toBe(0);
    expect(saved.updatedAt).toBe(clock);
    expect(await db.answers.count()).toBe(1);
  });

  it('pose et retire un désordre', async () => {
    const { visit } = await newProject();
    await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { defect: { urgency: 'immediate' } });
    let a = await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'x' });
    expect(a.defect).toEqual({ urgency: 'immediate' });
    a = await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { defect: null });
    expect(a.defect).toBeUndefined();
  });

  it('met à jour la date de modification de la visite et du dossier', async () => {
    const { project, visit } = await newProject();
    clock += 5000;
    await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'Pluie' });
    expect((await repo.getVisit(visit.id))!.updatedAt).toBe(clock);
    expect((await repo.getProject(project.id))!.updatedAt).toBe(clock);
  });

  it('refuse toute modification d’une visite clôturée', async () => {
    const { visit } = await newProject();
    await repo.closeVisit(visit.id);
    await expect(repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'x' }))
      .rejects.toBeInstanceOf(ReadOnlyVisitError);
    await expect(repo.addInstance(visit.id, 'couverture', 'A')).rejects.toBeInstanceOf(ReadOnlyVisitError);
  });

  it('rouvre une visite clôturée', async () => {
    const { visit } = await newProject();
    await repo.closeVisit(visit.id);
    await repo.reopenVisit(visit.id);
    await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'x' });
    expect((await repo.getVisit(visit.id))!.status).toBe('draft');
  });
});

describe('champs, curseur, conclusion', () => {
  it('met à jour les champs projet et visite par fusion', async () => {
    const { project, visit } = await newProject();
    await repo.updateProjectFields(project.id, { adresse: '14 rue des Lilas' });
    await repo.updateVisitFields(visit.id, { temperature: 21.6 });
    const p = (await repo.getProject(project.id))!;
    expect(p.fields).toEqual({ projet: 'Maison des Tilleuls', adresse: '14 rue des Lilas' });
    expect((await repo.getVisit(visit.id))!.fields['temperature']).toBe(21.6);
  });

  it('enregistre le curseur même sur une visite clôturée', async () => {
    const { visit } = await newProject();
    await repo.closeVisit(visit.id);
    await repo.setCursor(visit.id, { instanceId: 'facades', scrollY: 420 });
    expect((await repo.getVisit(visit.id))!.cursor).toEqual({ instanceId: 'facades', scrollY: 420 });
  });

  it('enregistre la conclusion', async () => {
    const { visit } = await newProject();
    await repo.setConclusion(visit.id, 'Fissures importantes');
    expect((await repo.getVisit(visit.id))!.conclusion).toBe('Fissures importantes');
  });
});

describe('liste et suppression', () => {
  it('liste les dossiers avec leur dernière visite, du plus récent au plus ancien', async () => {
    const first = await newProject();
    clock += 1000;
    const second = await newProject();
    clock += 1000;
    await repo.saveAnswer(first.visit.id, 'generalites', 'gen-temps', { value: 'x' });
    const list = await repo.listProjects();
    expect(list.map((s) => s.project.id)).toEqual([first.project.id, second.project.id]);
    expect(list[0].latestVisit.id).toBe(first.visit.id);
  });

  it('indique si une visite doit être exportée', async () => {
    const { visit } = await newProject();
    expect(DiagRepository.needsExport((await repo.getVisit(visit.id))!)).toBe(true);
    await repo.markExported(visit.id);
    const exported = (await repo.getVisit(visit.id))!;
    expect(exported.status).toBe('exported');
    expect(DiagRepository.needsExport(exported)).toBe(false);
  });

  it('supprime un dossier et tout son contenu en une transaction', async () => {
    const { project, visit } = await newProject();
    const keep = await newProject();
    await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'x' });
    await repo.saveAnswer(keep.visit.id, 'generalites', 'gen-temps', { value: 'y' });
    await db.blobs.add({ id: 'b1', image: new Blob(['a']), thumb: new Blob(['b']), width: 1, height: 1, byteSize: 2 });
    await db.photos.add({
      id: 'ph1', projectId: project.id, blobId: 'b1', instanceId: 'generalites', itemId: 'gen-plan', kind: 'plan',
      number: 1, caption: '', order: 0, annotations: [], addedInRevision: 0, createdAt: 0, updatedAt: 0,
    });
    await repo.deleteProject(project.id);
    expect(await db.projects.count()).toBe(1);
    expect(await db.visits.where('projectId').equals(project.id).count()).toBe(0);
    expect((await db.answers.toArray()).map((a) => a.visitId)).toEqual([keep.visit.id]);
    expect(await db.photos.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });
});
