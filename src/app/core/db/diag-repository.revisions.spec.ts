import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sampleTemplate } from '../testing/fixtures';
import { isRevised } from '../templates/template-engine';
import { DiagDb } from './diag-db';
import { DiagRepository, ReadOnlyVisitError } from './diag-repository';

let db: DiagDb;
let repo: DiagRepository;
let seq: number;
let clock: number;

beforeEach(() => {
  db = new DiagDb(`rev-${Math.random()}`);
  seq = 0;
  clock = 1_000;
  repo = new DiagRepository(db, { now: () => ++clock, uuid: () => `id-${++seq}` });
});

afterEach(async () => {
  await db.delete();
});

async function initialVisit() {
  const { project, visit } = await repo.createProject(sampleTemplate(), { projet: 'Test' });
  const bat = await repo.addInstance(visit.id, 'couverture', 'Bâtiment A');
  await repo.saveAnswer(visit.id, bat.id, 'couv-etat', { value: 'moyen', observation: 'Tuiles poreuses.' });
  await repo.saveAnswer(visit.id, 'generalites', 'gen-temps', { value: 'Couvert' });
  await repo.setConclusion(visit.id, 'Conclusion initiale');
  await repo.updateVisitFields(visit.id, { 'date-visite': '2026-09-17T13:30' });
  return { project, visit, bat };
}

describe('mises à jour successives', () => {
  it('refuse une mise à jour tant que la dernière visite n’est pas clôturée', async () => {
    const { project } = await initialVisit();
    await expect(repo.createRevision(project.id, 'suite à curage')).rejects.toThrow(/clôtur/i);
  });

  it('crée la révision 1 : instances, réponses et conclusion reprises, anciennes visites en lecture seule', async () => {
    const { project, visit, bat } = await initialVisit();
    await repo.closeVisit(visit.id);
    const rev = await repo.createRevision(project.id, 'suite à curage');
    expect(rev).toMatchObject({ revision: 1, reason: 'suite à curage', status: 'draft', conclusion: 'Conclusion initiale', fields: {} });
    expect(rev.instances.map((i) => i.id)).toEqual((await repo.getVisit(visit.id))!.instances.map((i) => i.id));
    const answers = await repo.getAnswers(rev.id);
    const etat = answers.find((a) => a.itemId === 'couv-etat')!;
    expect(etat).toMatchObject({ visitId: rev.id, instanceId: bat.id, value: 'moyen', observation: 'Tuiles poreuses.', changedInRevision: 0 });
    expect(etat.inherited).toEqual({ value: 'moyen', observation: 'Tuiles poreuses.', changedInRevision: 0 });
    expect(etat.baseline).toEqual({ value: 'moyen', observation: 'Tuiles poreuses.' });
    // la visite initiale ne bouge plus
    await expect(repo.reopenVisit(visit.id)).rejects.toThrow();
    await expect(repo.saveAnswer(visit.id, bat.id, 'couv-etat', { value: 'bon' })).rejects.toBeInstanceOf(ReadOnlyVisitError);
    expect((await repo.getVisitsOfProject(project.id)).map((v) => v.revision)).toEqual([0, 1]);
  });

  it('date la modification dans la révision et permet de l’annuler', async () => {
    const { project, visit, bat } = await initialVisit();
    await repo.closeVisit(visit.id);
    const rev = await repo.createRevision(project.id, 'suite à curage');
    const changed = await repo.saveAnswer(rev.id, bat.id, 'couv-etat', { observation: 'Tuiles poreuses. Curage : lattis pourri.' });
    expect(changed.changedInRevision).toBe(1);
    expect(isRevised(changed, 1, 'latest')).toBe(true);
    const reverted = await repo.revertAnswer(rev.id, bat.id, 'couv-etat');
    expect(reverted).toMatchObject({ observation: 'Tuiles poreuses.', changedInRevision: 0 });
    expect(isRevised(reverted, 1, 'all')).toBe(false);
  });

  it('enchaîne une deuxième mise à jour en gardant l’état de la visite initiale', async () => {
    const { project, visit, bat } = await initialVisit();
    await repo.closeVisit(visit.id);
    const rev1 = await repo.createRevision(project.id, 'suite à curage');
    await repo.saveAnswer(rev1.id, bat.id, 'couv-etat', { value: 'mauvais' });
    await repo.saveAnswer(rev1.id, bat.id, 'couv-type', { value: '2-pans' }); // nouvelle réponse
    await repo.closeVisit(rev1.id);
    const rev2 = await repo.createRevision(project.id, 'suite aux sondages');
    expect(rev2.revision).toBe(2);
    const answers = await repo.getAnswers(rev2.id);
    const etat = answers.find((a) => a.itemId === 'couv-etat')!;
    expect(etat.inherited).toMatchObject({ value: 'mauvais', changedInRevision: 1 });
    expect(etat.baseline).toMatchObject({ value: 'moyen' });
    expect(isRevised(etat, 2, 'all')).toBe(true);
    expect(isRevised(etat, 2, 'latest')).toBe(false);
    const type = answers.find((a) => a.itemId === 'couv-type')!;
    expect(type.baseline).toBeUndefined();
    expect(type.changedInRevision).toBe(1);
  });

  it('les photos restent visibles dans la mise à jour', async () => {
    const { project, visit, bat } = await initialVisit();
    await repo.addPhoto(visit.id, {
      instanceId: bat.id, itemId: 'couv-etat', kind: 'photo',
      image: new Blob(['i']), thumb: new Blob(['t']), width: 10, height: 10,
    });
    await repo.closeVisit(visit.id);
    const rev = await repo.createRevision(project.id, '');
    expect((await repo.getVisiblePhotos(rev.id)).length).toBe(1);
  });

  it('marque l’export sans figer une visite en cours', async () => {
    const { visit } = await initialVisit();
    await repo.markExported(visit.id);
    let v = (await repo.getVisit(visit.id))!;
    expect(v.status).toBe('draft');
    expect(DiagRepository.needsExport(v)).toBe(false);
    await repo.closeVisit(visit.id);
    await repo.markExported(visit.id);
    v = (await repo.getVisit(visit.id))!;
    expect(v.status).toBe('exported');
  });
});
