import { expect, test } from '@playwright/test';
import { addInstance, createProject, docxXml, makeJpeg, openSheet, waitForOfflineReady } from './helpers';

test('mode avion : numéros des photos dans l’ordre du rapport, repère « À sonder » repris puis levé', async ({ page, context }) => {
  test.setTimeout(150_000);
  await waitForOfflineReady(page);
  const jpeg = await makeJpeg(page, 1600, 1200);
  await context.setOffline(true);
  await page.reload();
  await createProject(page, 'PROJET LOT 5B');

  // photo prise d'abord dans le bâtiment B, puis dans le bâtiment 1 qui le précède dans le rapport
  await addInstance(page, '+ Bâtiment', 'Bâtiment B');
  let etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByTestId('photo-library').setInputFiles({ name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(etat.getByRole('button', { name: /^Photo 1/ })).toBeVisible();
  await openSheet(page, /Bâtiment 1/);
  await etat.getByTestId('photo-library').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(etat.getByRole('button', { name: /^Photo 1/ })).toBeVisible();
  await openSheet(page, /Bâtiment B/);
  await expect(etat.getByRole('button', { name: /^Photo 2/ })).toBeVisible();
  // le bâtiment B passe en premier : renumérotation
  await page.getByRole('button', { name: 'Monter dans la liste' }).click();
  await expect(etat.getByRole('button', { name: /^Photo 1/ })).toBeVisible();

  // repère « À sonder », cumulable avec un désordre
  await etat.getByRole('textbox').fill('Lattis à vérifier sous les tuiles.');
  const probe = etat.getByRole('button', { name: '🔍 À sonder' });
  await probe.click();
  await expect(probe).toHaveAttribute('aria-pressed', 'true');
  await etat.getByRole('button', { name: /Désordre/ }).click();
  await etat.getByRole('button', { name: 'Moyen terme' }).click();
  await expect(etat.getByText('Désordre · Moyen terme')).toBeVisible();
  await expect(probe).toHaveAttribute('aria-pressed', 'true');

  // filtre de la fiche
  await page.getByRole('button', { name: '🔍 À sonder seulement' }).click();
  await expect(page.locator('#item-couv-type')).toHaveCount(0);
  await expect(etat).toBeVisible();
  await page.getByRole('button', { name: '🔍 À sonder seulement' }).click();
  await expect(page.locator('#item-couv-type')).toHaveCount(1);

  await openSheet(page, 'Synthèse et clôture');
  const sondages = page.getByRole('region', { name: /Sondages à réaliser/ });
  await expect(sondages.getByText('Bâtiment B — État des tuiles')).toBeVisible();

  await openSheet(page, 'Rapport PDF / Word');
  const xml = await docxXml(page);
  expect(xml).toContain('SONDAGES À RÉALISER');
  expect(xml).toContain(' — À sonder');
  // le bâtiment B est imprimé en premier : sa photo porte le n° 1
  const [iB, i1, p1] = [xml.indexOf('BÂTIMENT B'), xml.indexOf('BÂTIMENT 1'), xml.indexOf('>Photo 1<')];
  expect(iB).toBeGreaterThan(0);
  expect(iB).toBeLessThan(i1);
  expect(p1).toBeGreaterThan(iB);
  expect(p1).toBeLessThan(i1);

  // mise à jour : le repère est repris, puis levé
  await openSheet(page, 'Synthèse et clôture');
  await page.getByRole('button', { name: 'Clôturer la visite' }).click();
  await page.getByRole('link', { name: 'Mise à jour ou sauvegarde →' }).click();
  await page.getByRole('button', { name: '+ Nouvelle mise à jour' }).click();
  await page.getByRole('button', { name: 'Créer la mise à jour' }).click();
  await expect(page.getByText('Mise à jour 1 — suite à curage')).toBeVisible();
  await openSheet(page, /Bâtiment B/);
  etat = page.locator('#item-couv-tuiles-etat');
  await expect(etat.getByRole('button', { name: '🔍 À sonder' })).toHaveAttribute('aria-pressed', 'true');
  await etat.getByRole('button', { name: '🔍 À sonder' }).click();
  await expect(etat.getByText('Était à sonder')).toBeVisible();
  await page.getByRole('button', { name: '🔍 À sonder seulement' }).click();
  await expect(etat).toBeVisible();

  await openSheet(page, 'Synthèse et clôture');
  await expect(page.getByRole('region', { name: /Sondages à réaliser/ }).getByText('Levé')).toBeVisible();
});
