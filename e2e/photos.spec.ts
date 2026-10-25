import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { createProject, drag, makeJpeg, openSheet, waitForOfflineReady } from './helpers';

test('mode avion : photo sur un item, annotation, légende et légende de photo conservées', async ({ page, context }) => {
  await waitForOfflineReady(page);
  const jpeg = await makeJpeg(page);
  await context.setOffline(true);
  await page.reload();

  await createProject(page, 'PROJET PHOTOS');
  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByTestId('photo-library').setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  const thumb = etat.getByRole('button', { name: /^Photo 1/ });
  await expect(thumb).toBeVisible();

  await thumb.click();
  await expect(page.getByRole('dialog', { name: 'Annotation 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await drag(page, [0.3, 0.3], [0.7, 0.7]);
  await expect(page.locator('.annotator canvas')).toHaveAttribute('aria-label', 'Annotations : 1');

  // première utilisation de la couleur : on la nomme pour la légende
  await page.getByRole('button', { name: 'Présence de fissure structurelle' }).click();
  await page.getByRole('button', { name: 'Ajouter à la légende' }).click();
  await expect(page.getByLabel('Légende', { exact: true }).getByText('Présence de fissure structurelle')).toBeVisible();

  await page.getByRole('button', { name: 'Flèche' }).click();
  await drag(page, [0.1, 0.1], [0.3, 0.3]);
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.locator('.annotator canvas')).toHaveAttribute('aria-label', 'Annotations : 1');

  await page.getByLabel("Légende de l'image").fill('Tuiles poreuses côté nord');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '← Retour' }).click();
  await expect(etat.getByRole('button', { name: /Photo 1 — Tuiles poreuses côté nord/ })).toBeVisible();

  // rechargement complet : tout est relu depuis IndexedDB
  await page.reload();
  await page.locator('#item-couv-tuiles-etat').getByRole('button', { name: /^Photo 1/ }).click();
  await expect(page.locator('.annotator canvas')).toHaveAttribute('aria-label', 'Annotations : 1');
  await expect(page.getByLabel("Légende de l'image")).toHaveValue('Tuiles poreuses côté nord');
});

test('mode avion : import de la page 2 d’un plan PDF, puis croquis', async ({ page, context }) => {
  const doc = await PDFDocument.create();
  doc.addPage([842, 595]).drawText('RDC', { x: 60, y: 520, size: 40 });
  doc.addPage([842, 595]).drawRectangle({ x: 100, y: 100, width: 600, height: 380, borderColor: rgb(0, 0, 0), borderWidth: 6 });
  const pdf = Buffer.from(await doc.save());

  await waitForOfflineReady(page);
  await context.setOffline(true);
  await page.reload();
  await createProject(page, 'PROJET PLANS');
  await openSheet(page, 'Plans et croquis');

  await page.getByTestId('plan-pdf').setInputFiles({ name: 'plans.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByRole('dialog', { name: 'Choisir la page du plan' })).toBeVisible();
  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.getByRole('dialog', { name: 'Annotation 1' })).toBeVisible();
  await expect(page.getByText('Plan 1')).toBeVisible();

  await page.getByRole('button', { name: 'Zone' }).click();
  const canvas = page.locator('.annotator canvas');
  const box = (await canvas.boundingBox())!;
  for (const [x, y] of [[0.2, 0.2], [0.5, 0.2], [0.5, 0.5]]) await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
  await page.getByRole('button', { name: 'Terminer la zone' }).click();
  await expect(canvas).toHaveAttribute('aria-label', 'Annotations : 1');
  await page.getByRole('button', { name: 'Annuler' }).last().click(); // ferme la proposition de légende
  await page.getByRole('button', { name: '← Retour' }).click();

  await page.getByRole('button', { name: '✏️ Croquis' }).click();
  await expect(page.getByText('Croquis 2')).toBeVisible();
  await drag(page, [0.2, 0.5], [0.8, 0.5]);
  await expect(page.locator('.annotator canvas')).toHaveAttribute('aria-label', 'Annotations : 1');
});
