import { expect, test } from '@playwright/test';
import { createProject, docxXml, drag, makeJpeg, openSheet, waitForOfflineReady } from './helpers';

test('mode avion : deux observations sur un item, chacune avec son désordre', async ({ page, context }) => {
  test.setTimeout(120_000);
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();
  await createProject(page, 'PROJET LOT 5C OBS');

  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('textbox', { name: /^Observations/ }).fill('Tuiles poreuses en partie courante.');
  await etat.getByRole('button', { name: '+ Observation' }).click();
  const second = etat.getByRole('textbox', { name: /^Observation 2/ });
  await expect(second).toBeFocused();
  await second.fill('Rive gauche : lattis pourri.');
  const group2 = etat.getByRole('group', { name: 'Observation 2' });
  await group2.getByRole('button', { name: /Désordre/ }).click();
  await group2.getByRole('button', { name: 'Immédiat' }).click();
  await expect(group2.getByText('Désordre · Immédiat')).toBeVisible();
  // la première observation reste sans désordre
  await expect(etat.getByRole('group', { name: 'Observation', exact: true }).getByText(/Désordre ·/)).toHaveCount(0);

  await openSheet(page, 'Synthèse et clôture');
  await expect(page.getByText('Rive gauche : lattis pourri.')).toBeVisible();

  await openSheet(page, 'Rapport PDF / Word');
  const xml = await docxXml(page);
  expect(xml).toContain('Rive gauche : lattis pourri.');
  expect(xml).toContain('— Désordre (immédiat)');

  // retirer la seconde observation
  await openSheet(page, /Bâtiment 1/);
  await etat.getByRole('button', { name: 'Retirer l’observation 2' }).click();
  await page.getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(etat.getByRole('textbox', { name: /^Observation 2/ })).toHaveCount(0);
});

test('mode avion : photo d’une pièce située sur le plan de son niveau', async ({ page, context }) => {
  test.setTimeout(120_000);
  await waitForOfflineReady(page);
  const jpeg = await makeJpeg(page, 1600, 1200);
  await context.setOffline(true);
  await page.reload();
  await createProject(page, 'PROJET LOT 5C PLAN');

  // deux plans de niveaux
  await openSheet(page, /généralités/);
  const niveaux = page.locator('#item-gen-plans-niveaux');
  await niveaux.getByTestId('plan-image').setInputFiles({ name: 'rdc.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(niveaux.getByRole('button', { name: /^Plan 1/ })).toBeVisible();
  await niveaux.getByTestId('plan-image').setInputFiles({ name: 'r1.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(niveaux.getByRole('button', { name: /^Plan 2/ })).toBeVisible();

  // photo dans une pièce
  await openSheet(page, /Pièce 1/);
  const item = page.locator('#item-pie-fen-nature');
  await item.getByTestId('photo-library').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(item.getByRole('button', { name: /^Photo 1/ })).toBeVisible();

  // plusieurs niveaux : le plan se choisit sur la fiche
  await item.getByRole('button', { name: '📍 Situer la photo 1' }).click();
  await expect(page.getByText('Choisissez d’abord le plan de référence en haut de la fiche.')).toBeVisible();
  const select = page.getByLabel('Plan de référence de la fiche');
  await select.selectOption({ label: await select.locator('option').nth(2).innerText() });
  await item.getByRole('button', { name: '📍 Situer la photo 1' }).click();

  await expect(page.getByText(/Photo 1 : touchez l'endroit de la prise de vue/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Annotation 2' })).toBeVisible(); // plan du R+1
  await drag(page, [0.4, 0.5], [0.7, 0.5]);

  // retour à la pièce : photo marquée située, plus de bouton
  await expect(page.getByRole('heading', { level: 1, name: 'Pièce 1' })).toBeVisible();
  await expect(item.getByRole('button', { name: /^Photo 1.*située sur le plan/ })).toBeVisible();
  await expect(item.getByRole('button', { name: /Situer la photo/ })).toHaveCount(0);

  // la pastille fléchée est sur le plan du R+1
  await openSheet(page, /généralités/);
  await niveaux.getByRole('button', { name: /^Plan 2/ }).click();
  await expect(page.locator('.annotator canvas')).toHaveAttribute('aria-label', 'Annotations : 1');
});
