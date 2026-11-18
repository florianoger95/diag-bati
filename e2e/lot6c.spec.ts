import { devices, expect, test } from '@playwright/test';
import { actionBar, addPhotos, createProject, drag, makeJpeg, openItem, openSheet, setDefect, waitForOfflineReady } from './helpers';

test.describe('paysage', () => {
  test.use({ viewport: devices['iPad Pro 11 landscape'].viewport });

  test('mode avion : annotateur — outils libellés par famille, couleurs nommées, réglages de l’outil, « … »', async ({ page, context }) => {
    test.setTimeout(120_000);
    await waitForOfflineReady(page);
    const jpeg = await makeJpeg(page, 1600, 1200);
    await context.setOffline(true);
    await page.reload();
    await createProject(page, 'PROJET LOT 6C ANNOT');
    await openSheet(page, /Bâtiment 1/);
    const etat = await openItem(page, 'couv-tuiles-etat');
    await addPhotos(page, { name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
    const thumb = etat.getByRole('button', { name: /^Photo 1/ });
    await thumb.click();
    await thumb.click();
    const dialog = page.getByRole('dialog', { name: 'Annotation 1' });
    await expect(dialog).toBeVisible();

    // outils libellés, groupés par famille ; outil actif marqué
    const tools = dialog.getByRole('toolbar', { name: 'Outils' });
    for (const family of ['Sélection', 'Tracés', 'Formes', 'Repères']) {
      await expect(tools.getByRole('group', { name: family })).toBeVisible();
    }
    await expect(tools.getByRole('group', { name: 'Formes' }).getByRole('button')).toHaveCount(4);
    await expect(tools.getByRole('button', { name: 'Trait libre' })).toContainText('Libre');
    const rect = tools.getByRole('button', { name: 'Rectangle' });
    await rect.click();
    await expect(rect).toHaveAttribute('aria-pressed', 'true');

    // réglages de l'outil actif dans leur zone
    const ctx = dialog.getByRole('group', { name: 'Réglages de l’outil' });
    await expect(ctx.getByText('Épaisseur')).toBeVisible();
    await expect(ctx.getByRole('button', { name: 'Moyen' })).toHaveAttribute('aria-pressed', 'true');
    await tools.getByRole('button', { name: 'Texte' }).click();
    await expect(ctx.getByText('Taille')).toBeVisible();
    await rect.click();

    // couleurs nommées en 48 px, légende de la couleur courante à côté
    const colors = dialog.getByRole('group', { name: 'Couleur' });
    const red = colors.getByRole('button', { name: 'Rouge', exact: true });
    await expect(red).toHaveAttribute('aria-pressed', 'true');
    expect((await red.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await expect(colors.getByRole('button', { name: 'Rouge : nommer la couleur' })).toBeVisible();

    // Annuler / Rétablir à droite, état d'enregistrement visible
    const undo = dialog.getByRole('button', { name: 'Annuler', exact: true });
    const redo = dialog.getByRole('button', { name: 'Rétablir', exact: true });
    await expect(undo).toBeDisabled();
    await drag(page, [0.3, 0.3], [0.6, 0.6]);
    // première utilisation du rouge : le nommer pour la légende
    await page.getByRole('button', { name: 'Présence de fissure structurelle' }).click();
    await page.getByRole('button', { name: 'Ajouter à la légende' }).click();
    await expect(colors.getByRole('button', { name: 'Rouge — Présence de fissure structurelle' })).toBeVisible();
    await expect(colors.getByRole('button', { name: 'Rouge = Présence de fissure structurelle' })).toBeVisible();
    const canvas = page.locator('.annotator canvas');
    await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 1');
    await undo.click();
    await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 0');
    await redo.click();
    await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 1');
    await expect(dialog.getByRole('status').getByText('Enregistré')).toBeVisible();
    const undoBox = (await undo.boundingBox())!;
    expect(undoBox.x).toBeGreaterThan((await tools.getByRole('button', { name: 'Tampon' }).boundingBox())!.x);

    // zoom en surimpression ; « Supprimer » rangé dans « … »
    await expect(dialog.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Supprimer', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Plus d’actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Supprimer la photo' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Supprimer la photo' })).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test('mode avion : synthèse et clôture en liste + détail, désordres groupés par urgence', async ({ page, context }) => {
    test.setTimeout(120_000);
    await waitForOfflineReady(page);
    await context.setOffline(true);
    await page.reload();
    await createProject(page, 'PROJET LOT 6C SYNTHESE');
    await openSheet(page, /Bâtiment 1/);
    const etat = await openItem(page, 'couv-tuiles-etat');
    await etat.getByRole('textbox').fill('Tuiles glissées en rive.');
    await setDefect(page, 'Court terme');
    await actionBar(page).getByRole('button', { name: 'À sonder', exact: true }).click();
    const preco = await openItem(page, 'preconisations');
    await preco.getByRole('button', { name: '+ Ajouter' }).click();
    await preco.getByRole('textbox').last().fill('Remanier la couverture');

    await openSheet(page, 'Synthèse et clôture');
    const nav = page.getByRole('navigation', { name: 'Rubriques de la synthèse' });
    await expect(nav.getByRole('link', { name: /^Désordres/ })).toContainText('1 · 1 court terme');
    await expect(nav.getByRole('link', { name: /^Désordres/ })).toHaveAttribute('aria-current', 'true');
    await expect(nav.getByRole('link', { name: /^Sondages à réaliser/ })).toContainText('1');
    await expect(nav.getByRole('link', { name: /^Mesures de sécurité/ })).toContainText('Aucune');
    await expect(nav.getByRole('link', { name: /^Réponses obligatoires/ })).toBeVisible();

    // détail : désordres groupés par urgence, chaque ligne mène à sa question
    const detail = page.getByRole('region', { name: 'Désordres par urgence' });
    await expect(detail.getByText('Court terme', { exact: true })).toBeVisible();
    await expect(detail.getByText('Immédiat', { exact: true })).toBeVisible(); // niveau vide affiché avec « Aucun »
    const row = detail.getByRole('link', { name: /Bâtiment 1 — État des tuiles/ });
    await expect(row).toContainText('Tuiles glissées en rive.');
    await expect(row).toContainText('Voir');

    await nav.getByRole('link', { name: /^Travaux et échéances/ }).click();
    await expect(page).toHaveURL(/[?&]r=travaux/);
    await expect(page.getByRole('region', { name: 'Travaux et échéances' }).getByText('Remanier la couverture')).toBeVisible();

    // clôture en bas de la liste, avec son effet expliqué
    await expect(nav.getByText('La clôture fige la visite et permet ensuite de créer une mise à jour.')).toBeVisible();
    await nav.getByRole('link', { name: /^Désordres/ }).click();
    await row.click();
    await expect(page).toHaveURL(/[?&]q=couv-tuiles-etat/);
    await expect(page.locator('#item-couv-tuiles-etat')).toBeVisible();
  });
});

test('portrait : « Situer » en deux étapes, vignette visible, Recommencer puis Terminé', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./');
  const jpeg = await makeJpeg(page, 1600, 1200);
  await createProject(page, 'PROJET LOT 6C SITUER');
  await openSheet(page, /Bâtiment 1/);
  const plan = await openItem(page, 'couv-plan-types');
  await plan.getByTestId('plan-image').setInputFiles({ name: 'toit.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(plan.getByRole('button', { name: /^Plan 1/ })).toBeVisible();
  const etat = await openItem(page, 'couv-tuiles-etat');
  await addPhotos(page, { name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(etat.getByRole('button', { name: /^Photo 1/ })).toBeVisible();
  await actionBar(page).getByRole('button', { name: 'Situer photo 1' }).click();

  const banner = page.getByRole('status', { name: 'Situer la photo 1' });
  await expect(banner).toBeVisible();
  await expect(banner.getByText('Touchez l’endroit de la prise de vue')).toBeVisible();
  await expect(banner.getByText('Glissez vers ce que la photo montre')).toBeVisible();
  await expect(page.getByRole('figure', { name: /^Photo 1/ })).toBeVisible(); // la photo à situer reste visible
  await expect(page.getByRole('toolbar', { name: 'Outils' })).toHaveCount(0); // outils de dessin masqués
  const done = page.getByRole('button', { name: 'Terminé' });
  const again = page.getByRole('button', { name: 'Recommencer' });
  await expect(done).toBeDisabled();

  const canvas = page.locator('.annotator canvas');
  await drag(page, [0.3, 0.6], [0.6, 0.4]);
  // enregistré au lever du doigt, mais on reste sur le plan
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 1');
  await expect(banner.getByText('Photo 1 située')).toBeVisible();
  await expect(done).toBeEnabled();

  await again.click();
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 0');
  await expect(done).toBeDisabled();
  await drag(page, [0.5, 0.5], [0.7, 0.5]);
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 1');
  await done.click();

  await expect(page).toHaveURL(/[?&]q=couv-tuiles-etat/);
  await expect(etat.getByRole('button', { name: /^Photo 1.*située sur le plan/ })).toBeVisible();
});
