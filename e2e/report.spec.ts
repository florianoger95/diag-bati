import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { createProject, makeJpeg, openSheet, waitForOfflineReady } from './helpers';

/** Récupère le fichier généré (URL blob:) côté Node. */
async function fetchResult(page: Page, format: 'pdf' | 'docx'): Promise<Buffer> {
  const card = page.getByRole('region', { name: `Rapport ${format}` });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const href = await card.getByRole('link', { name: 'Ouvrir' }).getAttribute('href');
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  return Buffer.from(base64, 'base64');
}

test('mode avion : réglages du cabinet, lexique à la saisie, rapport PDF et Word', async ({ page, context }) => {
  test.setTimeout(120_000);
  const annex = await PDFDocument.create();
  for (let i = 1; i <= 2; i++) annex.addPage([595, 842]).drawText(`ANNEXE - LEXIQUE ${i}`, { x: 60, y: 760, size: 18 });
  const annexPdf = Buffer.from(await annex.save());
  const font = readFileSync(join(process.cwd(), 'public', 'fonts', 'Overlock-Regular.ttf'));

  await waitForOfflineReady(page);
  const jpeg = await makeJpeg(page, 1600, 1200);
  await context.setOffline(true);
  await page.reload();

  // Réglages : cabinet, logo, police, annexe
  await page.getByRole('link', { name: 'Réglages' }).click();
  await page.getByLabel('Nom du cabinet').fill('Cabinet Test');
  await page.getByLabel('Coordonnées (une ligne par information)').fill('1 rue du Test\ncontact@test.fr');
  await page.getByTestId('import-logo').setInputFiles({ name: 'logo.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.getByAltText('Logo du cabinet')).toBeVisible();
  await page.getByTestId('import-font').setInputFiles({ name: 'MAIAN.TTF', mimeType: 'font/ttf', buffer: font });
  await expect(page.getByText('✓ Overlock')).toBeVisible();
  await page.getByTestId('import-annex').setInputFiles({ name: 'annexe.pdf', mimeType: 'application/pdf', buffer: annexPdf });
  await expect(page.getByText('✓ annexe.pdf')).toBeVisible();
  await page.waitForTimeout(500);

  // Saisie
  await page.getByRole('link', { name: '← Dossiers' }).click();
  await createProject(page, 'PROJET RAPPORT');
  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('button', { name: 'Mauvais' }).click();
  await etat.getByRole('textbox').fill('Chevrons attaqués près des souches du tilleul.');
  // lexique : « souches » d'arbre à ne pas marquer
  await expect(etat.getByRole('button', { name: /^Chevrons : marqué/ })).toBeVisible();
  await etat.getByRole('button', { name: /^souches : marqué/ }).click();
  await expect(etat.getByRole('button', { name: /^souches : non marqué/ })).toBeVisible();
  await etat.getByRole('button', { name: /Désordre/ }).click();
  await etat.getByRole('button', { name: 'Court terme' }).click();
  await etat.getByTestId('photo-library').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(etat.getByRole('button', { name: /^Photo 1/ })).toBeVisible();
  const preco = page.locator('#item-preconisations');
  await preco.getByRole('button', { name: '+ Ajouter' }).click();
  await preco.getByRole('textbox').fill('Reprendre le chéneau');

  // PDF
  await openSheet(page, 'Rapport PDF / Word');
  await page.getByRole('button', { name: '📄 Générer le PDF' }).click();
  const pdf = await PDFDocument.load(await fetchResult(page, 'pdf'));
  expect(pdf.getTitle()).toMatch(/PROJET RAPPORT$/);
  expect(pdf.getPageCount()).toBeGreaterThanOrEqual(5); // garde, couverture, synthèse, travaux, annexe ×2

  // Word
  await page.getByRole('button', { name: '📝 Générer le Word (.docx)' }).click();
  const zip = await JSZip.loadAsync(await fetchResult(page, 'docx'));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('PROJET RAPPORT');
  expect(xml).toContain('Chevrons* attaqués près des souches du tilleul.');
  expect(xml).toContain('Désordre (court terme)');
  expect(xml).toContain('Reprendre le chéneau* (moyen terme)');
  expect(xml).toContain('Photo 1');
});
