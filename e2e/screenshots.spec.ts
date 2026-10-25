import { devices, test } from '@playwright/test';
import { createProject, drag, makeJpeg, openSheet } from './helpers';

// Captures d'écran de contrôle visuel (non lancées par défaut : SCREENSHOTS=1 npx playwright test screenshots).
test.skip(!process.env['SCREENSHOTS'], 'captures à la demande');
test.use({ ...devices['iPad Pro 11 landscape'] });

test('annotateur et fiche avec photos', async ({ page }) => {
  const dir = process.env['SCREENSHOTS']!;
  await page.goto('./');
  const jpeg = await makeJpeg(page);
  await createProject(page, 'PROJET CAPTURES');
  await openSheet(page, /Bâtiment 1/);
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('button', { name: 'Moyen' }).click();
  await etat.getByTestId('photo-library').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  ]);
  await etat.getByRole('button', { name: /^Photo 2/ }).waitFor();
  await etat.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${dir}/fiche-photos.png` });

  await etat.getByRole('button', { name: /^Photo 1/ }).click();
  await page.getByRole('button', { name: 'Rectangle' }).click();
  await drag(page, [0.3, 0.3], [0.7, 0.7]);
  await page.getByRole('button', { name: 'Présence de fissure structurelle' }).click();
  await page.getByRole('button', { name: 'Ajouter à la légende' }).click();
  await page.getByRole('button', { name: 'Flèche' }).click();
  await drag(page, [0.1, 0.85], [0.28, 0.6]);
  await page.getByRole('button', { name: 'Pastille numérotée' }).click();
  const box = (await page.locator('.annotator canvas').boundingBox())!;
  await page.mouse.click(box.x + 0.75 * box.width, box.y + 0.25 * box.height);
  await page.getByRole('button', { name: 'Zone' }).click();
  for (const [x, y] of [[0.05, 0.05], [0.25, 0.05], [0.25, 0.25], [0.05, 0.25]]) {
    await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
  }
  await page.getByRole('button', { name: 'Terminer la zone' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/annotateur.png` });
});
