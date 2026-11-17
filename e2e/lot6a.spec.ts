import { expect, Page, test } from '@playwright/test';
import { actionBar, createProject, openItem, openSheet, setDefect, sheetMenu, waitForOfflineReady } from './helpers';

// mêmes plages que le test unitaire des écrans
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{24FF}\u{25A0}-\u{25FF}\u{27F0}-\u{27FF}]/u;

async function expectNoEmoji(page: Page): Promise<void> {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text.match(EMOJI)?.[0] ?? null).toBeNull();
}

test('mode avion : charte 3DE — polices, monogramme, urgences, cartes de l’accueil', async ({ page, context }) => {
  test.setTimeout(120_000);
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();

  // polices et monogramme embarqués
  const loaded = await page.evaluate(async () => ({
    raleway: (await document.fonts.load('700 20px Raleway')).length,
    openSans: (await document.fonts.load('400 17px "Open Sans"')).length,
  }));
  expect(loaded).toEqual({ raleway: 1, openSans: 1 });
  const logo = page.getByRole('img', { name: '3DE' }).first();
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expectNoEmoji(page);

  await createProject(page, 'PROJET LOT 6A');
  await openSheet(page, /Bâtiment 1/);
  const etat = await openItem(page, 'couv-tuiles-etat');
  await etat.getByRole('button', { name: 'Mauvais' }).click();
  // une réponse choisie n'est plus rouge : le rouge est réservé aux désordres
  const bg = await etat.getByRole('button', { name: 'Mauvais' }).evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(bg).toBe('rgb(6, 107, 94)');
  await etat.getByRole('textbox', { name: /^Observations/ }).fill('Tuiles poreuses.');
  await actionBar(page).getByRole('button', { name: 'À sonder', exact: true }).click();
  await setDefect(page, 'Court terme');
  const badge = etat.locator('.urg', { hasText: 'Court terme' });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveClass(/urg--2/);
  await expectNoEmoji(page);

  await openSheet(page, 'Rapport PDF / Word');
  await expect(page.getByRole('button', { name: 'Générer le PDF' })).toBeVisible();
  await expectNoEmoji(page);

  // carte du dossier sur l'accueil
  await page.getByRole('link', { name: 'Accueil — dossiers' }).click();
  const card = page.getByRole('article', { name: /PROJET LOT 6A/ });
  await expect(card).toContainText(/\d+ \/ \d+ réponses/);
  await expect(card).toContainText('1 court terme');
  await expect(card).toContainText('1 à sonder');
  await expect(card).toContainText('Non exporté');
  await card.getByRole('link', { name: 'Reprendre la visite' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bâtiment 1' })).toBeVisible();

  // en visite, Réglages passe par le menu « … » de la barre de visite
  await sheetMenu(page, 'Réglages');
  await expect(page.getByRole('heading', { name: 'Réglages', exact: true })).toBeVisible();
  await expectNoEmoji(page);
});
