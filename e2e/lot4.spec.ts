import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { createProject, makeJpeg, openSheet, waitForOfflineReady } from './helpers';

async function docxXml(page: Page): Promise<string> {
  await page.getByRole('button', { name: '📝 Générer le Word (.docx)' }).click();
  const card = page.getByRole('region', { name: 'Rapport docx' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const href = await card.getByRole('link', { name: 'Ouvrir' }).getAttribute('href');
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  return zip.file('word/document.xml')!.async('string');
}

test('mode avion : mise à jour après curage, repère violet, annulation et rapport révisé', async ({ page, context }) => {
  test.setTimeout(120_000);
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();

  await createProject(page, 'PROJET MISE A JOUR');
  await openSheet(page, /Bâtiment 1/);
  await page.locator('#item-couv-tuiles-etat').getByRole('textbox').fill('Tuiles poreuses.');
  await openSheet(page, 'Synthèse et clôture');
  await page.getByRole('button', { name: 'Clôturer la visite' }).click();
  await page.getByRole('link', { name: 'Mise à jour ou sauvegarde →' }).click();

  await page.getByRole('button', { name: '+ Nouvelle mise à jour' }).click();
  await page.getByRole('button', { name: 'Créer la mise à jour' }).click();
  await expect(page.getByText('Mise à jour 1 — suite à curage')).toBeVisible();

  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  const obs = etat.getByRole('textbox');
  await expect(obs).toHaveValue('Tuiles poreuses.');
  await obs.fill('Tuiles poreuses. Le curage révèle un lattis pourri.');
  await expect(etat.getByText('Modifié dans cette mise à jour')).toBeVisible();
  await etat.getByRole('button', { name: 'Voir l’original' }).click();
  await expect(etat.getByText('Avant cette mise à jour :')).toBeVisible();

  // annulation puis nouvelle modification
  await etat.getByRole('button', { name: 'Annuler la modification' }).click();
  await expect(obs).toHaveValue('Tuiles poreuses.');
  await expect(etat.getByText('Modifié dans cette mise à jour')).toHaveCount(0);
  await obs.fill('Tuiles poreuses. Le curage révèle un lattis pourri.');

  await openSheet(page, 'Rapport PDF / Word');
  const xml = await docxXml(page);
  expect(xml).toMatch(/Mise à jour suite à curage le \d{2}\/\d{2}\/\d{4}/);
  // seul l'ajout est en violet
  expect(xml).toMatch(/<w:color w:val="7030A0"\/><\/w:rPr><w:t xml:space="preserve"> Le curage révèle un lattis pourri\.<\/w:t>/);
  expect(xml).toMatch(/<w:t xml:space="preserve">Tuiles poreuses\.<\/w:t>/);

  // la visite initiale est désormais en lecture seule
  await page.getByRole('link', { name: /PROJET MISE A JOUR/ }).click();
  await page.getByRole('link', { name: /Visite initiale/ }).click();
  await expect(page.getByText('Visite antérieure : lecture seule')).toBeVisible();
});

test('mode avion : sauvegarde d’un dossier, suppression, restauration puis copie', async ({ page, context }) => {
  test.setTimeout(120_000);
  await waitForOfflineReady(page);
  const jpeg = await makeJpeg(page, 1600, 1200);
  await context.setOffline(true);
  await page.reload();

  await createProject(page, 'PROJET SAUVEGARDE');
  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('button', { name: 'Mauvais' }).click();
  await etat.getByTestId('photo-library').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(etat.getByRole('button', { name: /^Photo 1/ })).toBeVisible();

  await page.getByRole('link', { name: 'Accueil — dossiers' }).click();
  await expect(page.getByText(/1 dossier non exporté/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '⇪ Exporter' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/PROJET SAUVEGARDE\.diag\.zip$/);
  const path = join(tmpdir(), `diag-${Date.now()}.diag.zip`);
  await file.saveAs(path);
  await expect(page.getByText(/non exporté/)).toHaveCount(0);

  // suppression puis restauration
  await page.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page.getByText('PROJET SAUVEGARDE')).toHaveCount(0);
  await page.getByTestId('import-backup').setInputFiles(path);
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await expect(page.getByRole('heading', { name: /PROJET SAUVEGARDE/ })).toBeVisible();
  await page.getByRole('link', { name: /Visite initiale/ }).click();
  // la position de saisie fait partie de la sauvegarde : retour direct sur la fiche Bâtiment 1
  await expect(page.getByRole('heading', { level: 1, name: 'Bâtiment 1' })).toBeVisible();
  await expect(page.locator('#item-couv-tuiles-etat').getByRole('button', { name: /^Photo 1/ })).toBeVisible();
  await expect(page.locator('#item-couv-tuiles-etat').getByRole('button', { name: 'Mauvais' })).toHaveAttribute('aria-pressed', 'true');

  // seconde restauration : le dossier existe déjà → copie
  await page.getByRole('link', { name: 'Accueil — dossiers' }).click();
  await page.getByTestId('import-backup').setInputFiles(path);
  await page.getByRole('button', { name: 'Restaurer', exact: true }).click();
  await page.getByRole('button', { name: 'Importer une copie' }).click();
  await expect(page.getByRole('heading', { name: /PROJET SAUVEGARDE/ })).toBeVisible();
  await expect(page.getByText(/\(copie\)/)).toBeVisible();
});
