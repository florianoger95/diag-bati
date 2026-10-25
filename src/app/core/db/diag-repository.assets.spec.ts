import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DiagDb } from './diag-db';
import { DiagRepository } from './diag-repository';

let db: DiagDb;
let repo: DiagRepository;

beforeEach(() => {
  db = new DiagDb(`assets-${Math.random()}`);
  repo = new DiagRepository(db);
});

afterEach(async () => {
  await db.delete();
});

describe('fichiers du cabinet (logo, police, annexe)', () => {
  it('enregistre, relit et remplace un fichier avec ses métadonnées', async () => {
    await repo.setAsset('logo', new Blob(['png'], { type: 'image/png' }), { name: 'logo.png', width: 300, height: 120 });
    let logo = await repo.getAsset('logo');
    expect(logo?.name).toBe('logo.png');
    expect(logo?.width).toBe(300);
    expect(logo?.blob.type).toBe('image/png');
    expect(await logo?.blob.text()).toBe('png');
    await repo.setAsset('logo', new Blob(['v2'], { type: 'image/jpeg' }), { name: 'logo2.jpg' });
    logo = await repo.getAsset('logo');
    expect(await logo?.blob.text()).toBe('v2');
  });

  it('fonctionne aussi quand les Blob sont refusés (navigation privée)', async () => {
    repo.binaryMode = 'buffer';
    await repo.setAsset('font', new Blob(['ttf'], { type: 'font/ttf' }), { name: 'MAIAN.TTF', family: 'Maiandra GD' });
    const font = await repo.getAsset('font');
    expect(font?.blob).toBeInstanceOf(Blob);
    expect(await font?.blob.text()).toBe('ttf');
    expect(font?.family).toBe('Maiandra GD');
  });

  it('supprime un fichier', async () => {
    await repo.setAsset('annex', new Blob(['%PDF']), { name: 'annexe.pdf', pages: 5 });
    await repo.deleteAsset('annex');
    expect(await repo.getAsset('annex')).toBeUndefined();
  });

  it('enregistre l’identité du cabinet', async () => {
    await repo.setFirm({ name: 'Cabinet', lines: ['1 rue du Test'] });
    expect(await repo.getFirm()).toEqual({ name: 'Cabinet', lines: ['1 rue du Test'] });
  });
});
