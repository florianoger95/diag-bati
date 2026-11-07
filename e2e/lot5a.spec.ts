import { expect, test } from '@playwright/test';
import { createProject, drag, makeJpeg, openSheet, waitForOfflineReady } from './helpers';

test('mode avion : plan en image pivoté et recadré, nouveaux outils, légende lisible, définitions des urgences', async ({ page, context }) => {
  test.setTimeout(120_000);
  await waitForOfflineReady(page);
  const jpeg = await makeJpeg(page, 1600, 1200);
  await context.setOffline(true);
  await page.reload();
  await createProject(page, 'PROJET LOT 5A');

  // définitions des urgences au moment de poser un désordre
  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('button', { name: /Désordre/ }).click();
  await expect(etat.getByText(/Immédiat : action dans les prochaines semaines · Court terme : à prévoir dans le cadre des travaux/)).toBeVisible();
  await etat.getByRole('button', { name: 'Court terme' }).click();

  // plan importé en image (photothèque / Fichiers)
  await openSheet(page, 'Plans et croquis');
  await page.getByTestId('plan-image').setInputFiles({ name: 'plan.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByRole('button', { name: /^Plan 1/ }).click();
  const canvas = page.locator('.annotator canvas');
  await expect(page.getByRole('group', { name: 'Ajuster le plan' })).toBeVisible();

  // légende lisible : texte foncé sur fond clair
  const color = await page.getByLabel("Légende de l'image").evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe('rgb(255, 255, 255)');

  // pivoter : le plan paysage devient portrait
  const before = (await canvas.boundingBox())!;
  expect(before.width).toBeGreaterThan(before.height);
  await page.getByRole('button', { name: '⟳ Pivoter à droite' }).click();
  await expect.poll(async () => { const b = (await canvas.boundingBox())!; return b.height > b.width; }).toBe(true);

  // recadrer : on garde la moitié haute
  await page.getByRole('button', { name: /Recadrer/ }).click();
  await drag(page, [0, 0], [1, 0.5]);
  await page.getByRole('button', { name: 'Appliquer le recadrage' }).click();
  await expect.poll(async () => { const b = (await canvas.boundingBox())!; return b.width > b.height; }).toBe(true);

  // nouveaux outils
  await page.getByRole('button', { name: 'Trait droit' }).click();
  await drag(page, [0.1, 0.2], [0.9, 0.2]);
  await page.getByRole('button', { name: 'Annuler' }).last().click(); // pas de nom de légende pour cette couleur
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 1');
  // une fois annoté, le plan ne s'ajuste plus
  await expect(page.getByRole('group', { name: 'Ajuster le plan' })).toHaveCount(0);

  const box = (await canvas.boundingBox())!;
  await page.getByRole('button', { name: 'Tampon', exact: true }).click();
  await page.getByRole('button', { name: 'À SONDER' }).click();
  await page.mouse.click(box.x + 0.5 * box.width, box.y + 0.6 * box.height);
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 2');

  await page.getByRole('button', { name: 'Sélectionner / déplacer' }).click();
  await page.mouse.click(box.x + 0.5 * box.width, box.y + 0.6 * box.height);
  await page.getByRole('button', { name: '⧉ Dupliquer' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 3');

  await page.getByRole('button', { name: 'Pastille numérotée' }).click();
  await page.getByRole('button', { name: 'A-B-C' }).click();
  await expect(page.getByRole('option', { name: 'Suivant (A)' })).toBeAttached();
  await page.mouse.click(box.x + 0.2 * box.width, box.y + 0.8 * box.height);
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 4');
  await expect(page.getByRole('option', { name: 'Suivant (B)' })).toBeAttached();
});
