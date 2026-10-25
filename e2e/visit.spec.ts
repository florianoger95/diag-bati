import { expect, test } from '@playwright/test';
import { addInstance, createProject, openSheet, waitForOfflineReady } from './helpers';

test('mode avion : création, saisie, désordre, ajout de bâtiment et clôture', async ({ page, context }) => {
  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dossiers' })).toBeVisible();

  await createProject(page, 'PROJET MAISON DES TILLEULS');
  await page.locator('#item-temperature-ext input').fill('21,6');

  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('button', { name: 'Mauvais' }).click();
  await etat.getByRole('textbox').fill('Mousse en quantité au droit de la souche.');
  await etat.getByRole('button', { name: /Désordre/ }).click();
  await etat.getByRole('button', { name: 'Court terme' }).click();
  await expect(etat.getByText('Désordre · Court terme')).toBeVisible();

  const preco = page.locator('#item-preconisations');
  await preco.getByRole('button', { name: '+ Ajouter' }).click();
  await preco.getByRole('textbox').fill('Démousser la couverture');

  await addInstance(page, '+ Bâtiment', 'Bâtiment B');
  await expect(page.getByRole('heading', { level: 1, name: 'Bâtiment B' })).toBeVisible();

  await openSheet(page, 'Synthèse et clôture');
  await expect(page.getByText('Bâtiment 1 — État des tuiles')).toBeVisible();
  await expect(page.getByText('Démousser la couverture')).toBeVisible();
  await page.getByRole('button', { name: 'Clôturer la visite' }).click();
  await expect(page.getByRole('button', { name: 'Rouvrir la visite' })).toBeVisible();

  await page.getByRole('link', { name: 'Accueil — dossiers' }).click();
  await page.getByRole('tab', { name: /Terminés/ }).click();
  await expect(page.getByText('PROJET MAISON DES TILLEULS')).toBeVisible();
});

test('fermer Safari en pleine saisie puis rouvrir restitue l’état exact', async ({ page, context }) => {
  await page.goto('./');
  await createProject(page, 'PROJET REPRISE');
  await openSheet(page, /Façade 1/);
  await expect(page.getByRole('heading', { level: 1, name: 'Façade 1' })).toBeVisible();
  const url = page.url();

  const pente = page.locator('#item-fac-appuis-pente');
  await pente.getByRole('textbox').fill('4');
  await expect(pente.getByText(/Hors norme/)).toBeVisible();
  const obs = page.locator('#item-fac-appuis').getByRole('textbox');
  await obs.fill('Absence de rejingots et de larmiers');
  // Fermeture brutale juste après la frappe (avant la fin du délai d'enregistrement)
  await page.close({ runBeforeUnload: false });

  const reopened = await context.newPage();
  await reopened.goto('./');
  await expect(reopened).toHaveURL(url);
  await expect(reopened.locator('#item-fac-appuis').getByRole('textbox')).toHaveValue('Absence de rejingots et de larmiers');
  await expect(reopened.locator('#item-fac-appuis-pente').getByRole('textbox')).toHaveValue('4');
});
