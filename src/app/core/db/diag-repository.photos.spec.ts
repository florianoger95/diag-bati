import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Visit } from '../model/data';
import { sampleTemplate } from '../testing/fixtures';
import { isPhotoVisible } from '../templates/template-engine';
import { DiagDb } from './diag-db';
import { DiagRepository, NewPhoto, ReadOnlyVisitError } from './diag-repository';

let db: DiagDb;
let repo: DiagRepository;
let seq: number;

beforeEach(() => {
  db = new DiagDb(`photos-${Math.random()}`);
  seq = 0;
  repo = new DiagRepository(db, { now: () => 1_000 + seq, uuid: () => `id-${++seq}` });
});

afterEach(async () => {
  await db.delete();
});

function photo(partial: Partial<NewPhoto> = {}): NewPhoto {
  return {
    instanceId: 'generalites', itemId: 'gen-plan', kind: 'photo',
    image: new Blob(['image'], { type: 'image/jpeg' }), thumb: new Blob(['t'], { type: 'image/jpeg' }),
    width: 1600, height: 1200, ...partial,
  };
}

async function setup() {
  return repo.createProject(sampleTemplate(), { projet: 'Test' });
}

/** Simule une mise à jour (révision 1) — la création complète arrive au Lot 4. */
async function addRevision(base: Visit): Promise<Visit> {
  const rev: Visit = { ...base, id: 'rev1', revision: 1, status: 'draft' };
  await db.visits.update(base.id, { status: 'closed' });
  await db.visits.add(rev);
  return rev;
}

describe('isPhotoVisible', () => {
  it('applique la fenêtre de révisions [ajout, retrait[', () => {
    const p = { addedInRevision: 1, removedInRevision: 3 };
    expect([0, 1, 2, 3, 4].map((r) => isPhotoVisible(p, r))).toEqual([false, true, true, false, false]);
    expect(isPhotoVisible({ addedInRevision: 0 }, 5)).toBe(true);
  });
});

describe('photos', () => {
  it('ajoute une photo avec son binaire et un numéro croissant dans le dossier', async () => {
    const { visit } = await setup();
    const a = await repo.addPhoto(visit.id, photo());
    const b = await repo.addPhoto(visit.id, photo({ instanceId: null, itemId: null }));
    expect([a.number, b.number]).toEqual([1, 2]);
    expect(a.addedInRevision).toBe(0);
    expect(a.annotations).toEqual([]);
    const blob = await repo.getBlob(a.blobId);
    expect(blob?.width).toBe(1600);
    expect(blob?.byteSize).toBe(6);
  });

  it('ordonne les photos d’un même item', async () => {
    const { visit } = await setup();
    const a = await repo.addPhoto(visit.id, photo());
    const b = await repo.addPhoto(visit.id, photo());
    const other = await repo.addPhoto(visit.id, photo({ itemId: 'gen-temps' }));
    expect([a.order, b.order, other.order]).toEqual([0, 1, 0]);
  });

  it('liste les photos visibles de la visite par numéro', async () => {
    const { visit } = await setup();
    await repo.addPhoto(visit.id, photo());
    await repo.addPhoto(visit.id, photo());
    expect((await repo.getVisiblePhotos(visit.id)).map((p) => p.number)).toEqual([1, 2]);
  });

  it('met à jour légende et annotations en place dans la même révision', async () => {
    const { visit } = await setup();
    const p = await repo.addPhoto(visit.id, photo());
    const shapes = [{ id: 's1', kind: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2, color: '#f00', width: 0.005 }];
    const updated = await repo.updatePhoto(visit.id, p.id, { caption: 'Souche', annotations: shapes });
    expect(updated.id).toBe(p.id);
    expect((await db.photos.get(p.id))?.caption).toBe('Souche');
    expect(await db.photos.count()).toBe(1);
  });

  it('copie à l’écriture une photo d’une révision antérieure (même binaire, même numéro)', async () => {
    const { visit } = await setup();
    const p = await repo.addPhoto(visit.id, photo({ caption: 'avant' }));
    const rev = await addRevision(visit);
    const copy = await repo.updatePhoto(rev.id, p.id, { caption: 'après curage' });
    expect(copy.id).not.toBe(p.id);
    expect(copy.blobId).toBe(p.blobId);
    expect(copy.number).toBe(p.number);
    expect(copy.addedInRevision).toBe(1);
    expect((await db.photos.get(p.id))?.removedInRevision).toBe(1);
    expect((await repo.getVisiblePhotos(visit.id)).map((x) => x.caption)).toEqual(['avant']);
    expect((await repo.getVisiblePhotos(rev.id)).map((x) => x.caption)).toEqual(['après curage']);
    expect(await db.blobs.count()).toBe(1);
  });

  it('supprime définitivement une photo de la révision courante et son binaire orphelin', async () => {
    const { visit } = await setup();
    const p = await repo.addPhoto(visit.id, photo());
    await repo.deletePhoto(visit.id, p.id);
    expect(await db.photos.count()).toBe(0);
    expect(await db.blobs.count()).toBe(0);
  });

  it('masque seulement une photo d’une révision antérieure', async () => {
    const { visit } = await setup();
    const p = await repo.addPhoto(visit.id, photo());
    const rev = await addRevision(visit);
    await repo.deletePhoto(rev.id, p.id);
    expect(await repo.getVisiblePhotos(rev.id)).toEqual([]);
    expect((await repo.getVisiblePhotos(visit.id)).length).toBe(1);
    expect(await db.blobs.count()).toBe(1);
  });

  it('refuse les modifications sur une visite clôturée', async () => {
    const { visit } = await setup();
    const p = await repo.addPhoto(visit.id, photo());
    await repo.closeVisit(visit.id);
    await expect(repo.addPhoto(visit.id, photo())).rejects.toBeInstanceOf(ReadOnlyVisitError);
    await expect(repo.updatePhoto(visit.id, p.id, { caption: 'x' })).rejects.toBeInstanceOf(ReadOnlyVisitError);
    await expect(repo.deletePhoto(visit.id, p.id)).rejects.toBeInstanceOf(ReadOnlyVisitError);
  });

  it('stocke les binaires en ArrayBuffer quand le navigateur refuse les Blob (navigation privée)', async () => {
    repo.binaryMode = 'buffer';
    const { visit } = await setup();
    const p = await repo.addPhoto(visit.id, photo({ vector: new Blob(['%PDF'], { type: 'application/pdf' }) }));
    const raw = await db.blobs.get(p.blobId);
    expect(raw?.image).not.toBeInstanceOf(Blob);
    expect((raw?.image as unknown as { data: ArrayBuffer }).data.byteLength).toBe(5);
    const read = await repo.getBlob(p.blobId);
    expect(read?.image).toBeInstanceOf(Blob);
    expect(read?.image.type).toBe('image/jpeg');
    expect(await read?.image.text()).toBe('image');
    expect(await read?.vector?.text()).toBe('%PDF');
  });

  it('enregistre la légende des couleurs du dossier', async () => {
    const { project } = await setup();
    await repo.setLegend(project.id, [{ color: '#0070c0', label: "Présence d'eau liquide" }]);
    expect((await repo.getProject(project.id))?.legend).toEqual([{ color: '#0070c0', label: "Présence d'eau liquide" }]);
  });
});
