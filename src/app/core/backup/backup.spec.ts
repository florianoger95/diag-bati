import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiagDb } from '../db/diag-db';
import { DiagRepository } from '../db/diag-repository';
import { sampleTemplate } from '../testing/fixtures';
import { BackupConflictError, exportProject, exportSettings, importBackup, inspectBackup } from './backup';

let source: DiagRepository;
let target: DiagRepository;

beforeEach(() => {
  source = new DiagRepository(new DiagDb(`src-${Math.random()}`));
  target = new DiagRepository(new DiagDb(`dst-${Math.random()}`));
});

afterEach(async () => {
  await source.db.delete();
  await target.db.delete();
});

/** Dossier avec visite initiale clôturée, mise à jour, photo et plan vectoriel. */
async function fullProject(repo: DiagRepository) {
  const { project, visit } = await repo.createProject(sampleTemplate(), { projet: 'PROJET SAUVEGARDE', adresse: '12 rue des Lilas' });
  const bat = await repo.addInstance(visit.id, 'couverture', 'Bâtiment A');
  await repo.saveAnswer(visit.id, bat.id, 'couv-etat', { value: 'mauvais', observation: 'Tuiles poreuses.', defect: { urgency: 'short' } });
  const photo = await repo.addPhoto(visit.id, {
    instanceId: bat.id, itemId: 'couv-etat', kind: 'photo', caption: 'Souche',
    image: new Blob(['IMAGE-JPEG'], { type: 'image/jpeg' }), thumb: new Blob(['THUMB'], { type: 'image/jpeg' }), width: 1600, height: 1200,
  });
  await repo.updatePhoto(visit.id, photo.id, { annotations: [{ id: 'r', kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#ff0000', width: 0.005 }] });
  await repo.addPhoto(visit.id, {
    instanceId: null, itemId: null, kind: 'plan',
    image: new Blob(['PLAN-JPEG'], { type: 'image/jpeg' }), thumb: new Blob(['T']), vector: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    width: 2400, height: 1697,
  });
  await repo.setLegend(project.id, [{ color: '#ff0000', label: 'Fissure structurelle' }]);
  await repo.closeVisit(visit.id);
  const rev = await repo.createRevision(project.id, 'suite à curage');
  await repo.saveAnswer(rev.id, bat.id, 'couv-etat', { observation: 'Tuiles poreuses. Lattis pourri.' });
  return { project, visit, rev, bat };
}

describe('sauvegarde d’un dossier', () => {
  it('exporte puis restaure à l’identique sur un iPad vierge (révisions, photos, plans, légende)', async () => {
    const { project, visit, rev, bat } = await fullProject(source);
    const backup = await exportProject(source, project.id);
    expect(backup.fileName).toMatch(/^\d{4}-\d{2}-\d{3} PROJET SAUVEGARDE\.diag\.zip$/);

    const summary = inspectBackup(backup.bytes);
    expect(summary).toMatchObject({ kind: 'project', reference: project.reference, name: 'PROJET SAUVEGARDE', visits: 2, photos: 2 });

    const result = await importBackup(target, backup.bytes);
    expect(result.projectId).toBe(project.id);
    expect((await target.getProject(project.id))?.legend).toEqual([{ color: '#ff0000', label: 'Fissure structurelle' }]);
    expect((await target.getVisitsOfProject(project.id)).map((v) => [v.revision, v.status, v.reason ?? ''])).toEqual([
      [0, 'closed', ''], [1, 'draft', 'suite à curage'],
    ]);
    const answers = await target.getAnswers(rev.id);
    const etat = answers.find((a) => a.instanceId === bat.id && a.itemId === 'couv-etat')!;
    expect(etat).toMatchObject({ observation: 'Tuiles poreuses. Lattis pourri.', changedInRevision: 1, defect: { urgency: 'short' } });
    expect(etat.inherited?.observation).toBe('Tuiles poreuses.');
    const photos = await target.getVisiblePhotos(visit.id);
    expect(photos.map((p) => [p.number, p.kind, p.caption, p.annotations.length])).toEqual([[1, 'photo', 'Souche', 1], [2, 'plan', '', 0]]);
    const plan = await target.getBlob(photos[1].blobId);
    expect(await plan?.image.text()).toBe('PLAN-JPEG');
    expect(await plan?.vector?.text()).toBe('%PDF-1.7');
    expect(plan?.vector?.type).toBe('application/pdf');
    expect(plan?.width).toBe(2400);
  });

  it('demande quoi faire si le dossier existe déjà : remplacer ou importer une copie', async () => {
    const { project, visit } = await fullProject(source);
    const backup = await exportProject(source, project.id);
    await importBackup(target, backup.bytes);
    await expect(importBackup(target, backup.bytes)).rejects.toBeInstanceOf(BackupConflictError);

    const copy = await importBackup(target, backup.bytes, 'copy');
    expect(copy.projectId).not.toBe(project.id);
    const copied = (await target.getProject(copy.projectId))!;
    expect(copied.reference).toBe(`${project.reference} (copie)`);
    const copyVisits = await target.getVisitsOfProject(copy.projectId);
    expect(copyVisits.every((v) => v.id !== visit.id)).toBe(true);
    const copyPhotos = await target.getVisiblePhotos(copyVisits[0].id);
    expect(await (await target.getBlob(copyPhotos[0].blobId))?.image.text()).toBe('IMAGE-JPEG');
    expect((await target.listProjects()).length).toBe(2);

    // remplacer : les modifications locales disparaissent
    await target.updateProjectFields(project.id, { projet: 'MODIFIÉ' });
    await importBackup(target, backup.bytes, 'replace');
    expect((await target.getProject(project.id))?.fields['projet']).toBe('PROJET SAUVEGARDE');
    expect((await target.listProjects()).length).toBe(2);
  });

  it('fonctionne quand les Blob sont refusés (navigation privée), à l’export comme à l’import', async () => {
    source.binaryMode = 'buffer';
    target.binaryMode = 'buffer';
    const { project, visit } = await fullProject(source);
    await importBackup(target, (await exportProject(source, project.id)).bytes);
    const [photo] = await target.getVisiblePhotos(visit.id);
    expect(await (await target.getBlob(photo.blobId))?.image.text()).toBe('IMAGE-JPEG');
  });

  it('refuse proprement un fichier qui n’est pas une sauvegarde', async () => {
    await expect(importBackup(target, strToU8('pas un zip'))).rejects.toThrow(/sauvegarde/);
    const other = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'autre' })) });
    await expect(importBackup(target, other)).rejects.toThrow(/sauvegarde/);
    const future = zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'diag-bati', version: 99, kind: 'project' })) });
    await expect(importBackup(target, future)).rejects.toThrow(/version/);
  });
});

describe('sauvegarde des réglages', () => {
  it('exporte et restaure cabinet, logo, police et annexe', async () => {
    await source.setFirm({ name: 'Cabinet', lines: ['1 rue du Test'] });
    await source.setAsset('logo', new Blob(['PNG'], { type: 'image/png' }), { name: 'logo.png', width: 300, height: 120 });
    await source.setAsset('font', new Blob(['TTF'], { type: 'font/ttf' }), { name: 'MAIAN.TTF', family: 'Maiandra GD' });
    const backup = await exportSettings(source);
    expect(inspectBackup(backup.bytes)).toMatchObject({ kind: 'settings' });
    await importBackup(target, backup.bytes);
    expect(await target.getFirm()).toEqual({ name: 'Cabinet', lines: ['1 rue du Test'] });
    const logo = await target.getAsset('logo');
    expect(logo).toMatchObject({ name: 'logo.png', width: 300 });
    expect(await logo?.blob.text()).toBe('PNG');
    expect((await target.getAsset('font'))?.family).toBe('Maiandra GD');
    expect(await target.getAsset('annex')).toBeUndefined();
  });
});
