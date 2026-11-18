import { devices, expect, test } from '@playwright/test';
import { actionBar, createProject, openItem, openSheet, setDefect, sheetMenu, showQuestions, waitForOfflineReady } from './helpers';

test.describe('paysage', () => {
  test.use({ viewport: devices['iPad Pro 11 landscape'].viewport });

  test('mode avion : visite en liste + détail, barre d’actions, plan de visite et adresse de la question', async ({ page, context }) => {
    test.setTimeout(120_000);
    await waitForOfflineReady(page);
    await context.setOffline(true);
    await page.reload();
    await createProject(page, 'PROJET LOT 6B');

    // une seule barre en visite : sélecteur de fiche, outils, état d'enregistrement
    await openSheet(page, /Bâtiment 1/);
    await expect(page.locator('header.appbar')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Fiches de la visite/ })).toContainText('Couverture · Bâtiment 1');
    await expect(page.getByRole('link', { name: 'Synthèse', exact: true })).toBeVisible();
    await expect(page.getByRole('status').getByText('Enregistré')).toBeVisible();

    // liste des questions à gauche, une question à la fois à droite
    const list = await showQuestions(page);
    await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(page.getByText(/^Question 1 sur \d+$/)).toBeVisible();

    const etat = await openItem(page, 'couv-tuiles-etat');
    await expect(page).toHaveURL(/[?&]q=couv-tuiles-etat/);
    await expect(page.getByRole('heading', { level: 2, name: 'État des tuiles' })).toBeVisible();
    await etat.getByRole('button', { name: 'Mauvais' }).click();
    await etat.getByRole('textbox', { name: /^Observations/ }).fill('Tuiles poreuses en partie courante.');

    // la barre d'actions agit sur l'observation sélectionnée
    await actionBar(page).getByRole('button', { name: 'Observation', exact: true }).click();
    const second = etat.getByRole('group', { name: 'Observation 2' });
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await second.getByRole('textbox').fill('Rive gauche : lattis pourri.');
    await setDefect(page, 'Court terme');
    await expect(second.getByText('Désordre · Court terme')).toBeVisible();
    await expect(actionBar(page).getByRole('button', { name: 'Court terme', exact: true })).toBeVisible();
    await expect(etat.getByRole('group', { name: 'Observation', exact: true }).getByText(/Désordre ·/)).toHaveCount(0);
    // une action sans objet reste lisible mais désactivée
    await expect(actionBar(page).getByRole('button', { name: /^Situer/ })).toBeDisabled();

    // la ligne résume la réponse et compte le désordre
    const row = list.locator('[data-q="couv-tuiles-etat"]');
    await expect(row).toContainText('Mauvais · 2 observations');
    await expect(row.getByLabel('1 désordre')).toBeVisible();

    // question suivante, puis rechargement : la même question est rouverte
    await page.getByRole('button', { name: 'Question suivante' }).click();
    await expect(page).toHaveURL(/[?&]q=couv-tuiles-pathologies/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 2, name: 'Pathologies des tuiles' })).toBeVisible();

    // synthèse de la fiche : les rubriques de pied ensemble
    await (await showQuestions(page)).getByRole('link', { name: /Synthèse de la fiche/ }).click();
    await expect(page.locator('#item-commentaires')).toBeVisible();
    await expect(page.locator('#item-preconisations')).toBeVisible();
    await expect(actionBar(page)).toHaveCount(0);

    // plan de visite : désordres par fiche, ajout sur l'en-tête de section, outils
    await page.getByRole('button', { name: /^Fiches de la visite/ }).click();
    const plan = page.getByRole('navigation', { name: 'Fiches de la visite' });
    await expect(plan.getByRole('link', { name: /Bâtiment 1/ })).toContainText('1');
    await expect(plan.getByRole('button', { name: '+ Bâtiment' })).toBeVisible();
    await expect(plan.getByRole('link', { name: 'Rapport PDF / Word' })).toBeVisible();
    await plan.getByRole('link', { name: /Façade 1/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Façade 1' })).toBeVisible();

    // menu « … » : actions de la fiche
    await page.getByRole('button', { name: 'Plus d’actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Renommer la fiche' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Réglages' })).toBeVisible();
    await page.keyboard.press('Escape');

    // lien de la synthèse : rouvre la question du désordre
    await page.getByRole('link', { name: 'Synthèse', exact: true }).click();
    await page.getByRole('link', { name: /Rive gauche : lattis pourri/ }).click();
    await expect(page).toHaveURL(/[?&]q=couv-tuiles-etat/);
    await expect(page.getByRole('heading', { level: 2, name: 'État des tuiles' })).toBeVisible();

    // filtre « À sonder » : la tête de liste l'indique et propose « Tout »
    const probe = actionBar(page).getByRole('button', { name: 'À sonder', exact: true });
    await probe.click();
    await expect(probe).toHaveAttribute('aria-pressed', 'true');
    const questions = await showQuestions(page);
    await questions.getByRole('button', { name: 'Filtrer' }).click();
    await questions.getByRole('button', { name: 'À sonder seulement' }).click();
    await expect(questions).toContainText(/À sonder · 1 sur \d+/);
    await expect(questions.locator('[data-q]')).toHaveCount(1);
    await questions.getByRole('button', { name: 'Tout' }).click();
    await expect.poll(() => questions.locator('[data-q]').count()).toBeGreaterThan(10);

    await sheetMenu(page, 'Réglages');
    await expect(page.getByRole('heading', { name: 'Réglages', exact: true })).toBeVisible();
  });
});

test('portrait : liste en tiroir, choix de l’urgence au-dessus de la barre, question suivante nommée', async ({ page }) => {
  await page.goto('./');
  await createProject(page, 'PROJET LOT 6B PORTRAIT');
  await openSheet(page, /Bâtiment 1/);

  // la liste n'est pas affichée : « Questions n/N » l'ouvre en tiroir
  const list = page.getByRole('navigation', { name: 'Questions de la fiche' });
  await expect(list).toBeHidden();
  await page.getByRole('button', { name: /^Questions 1\/\d+$/ }).click();
  await expect(list).toBeVisible();
  await list.locator('[data-q="couv-tuiles-etat"]').click();
  await expect(list).toBeHidden();
  await expect(page.getByRole('heading', { level: 2, name: 'État des tuiles' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Questions 5\/\d+$/ })).toBeVisible();

  // choix de l'urgence : définitions, puis l'étiquette sur l'observation
  await page.locator('#item-couv-tuiles-etat').getByRole('textbox').fill('Tuiles poreuses.');
  await actionBar(page).getByRole('button', { name: 'Désordre' }).click();
  const picker = page.getByRole('group', { name: 'Urgence du désordre' });
  await expect(picker.getByText(/Immédiat : action dans les prochaines semaines/)).toBeVisible();
  await picker.getByRole('button', { name: 'Immédiat' }).click();
  await expect(picker).toBeHidden();
  await expect(page.locator('#item-couv-tuiles-etat').getByText('Désordre · Immédiat')).toBeVisible();

  // question suivante : grand bouton nommé par la question visée
  await page.getByRole('button', { name: 'Question suivante : Pathologies des tuiles' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Pathologies des tuiles' })).toBeVisible();
  await page.getByRole('button', { name: 'Question précédente : État des tuiles' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'État des tuiles' })).toBeVisible();

  // les outils passent par « … »
  await expect(page.getByRole('link', { name: 'Synthèse', exact: true })).toBeHidden();
  await sheetMenu(page, 'Synthèse et clôture');
  await expect(page.getByRole('navigation', { name: 'Rubriques de la synthèse' })).toBeVisible();
});
