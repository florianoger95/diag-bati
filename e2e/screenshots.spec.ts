import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices, expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { addInstance, createProject, drag, makeJpeg, openSheet } from './helpers';

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

test('rapport d’exemple (PDF et Word) pour relecture', async ({ page }) => {
  test.setTimeout(180_000);
  const dir = process.env['SCREENSHOTS']!;
  await page.goto('./');
  const jpeg = await makeJpeg(page, 1600, 1200);
  const plan = await PDFDocument.create();
  const p = plan.addPage([842, 595]);
  p.drawRectangle({ x: 120, y: 80, width: 600, height: 420, borderColor: rgb(0, 0, 0), borderWidth: 6 });
  p.drawLine({ start: { x: 420, y: 80 }, end: { x: 420, y: 500 }, thickness: 3 });
  p.drawText('BATIMENT A', { x: 200, y: 300, size: 22 });
  p.drawText('BATIMENT B', { x: 500, y: 300, size: 22 });

  await page.getByRole('link', { name: 'Réglages' }).click();
  await page.getByLabel('Nom du cabinet').fill('Cabinet d’exemple — maîtrise d’œuvre');
  await page.getByLabel('Coordonnées (une ligne par information)').fill('1 rue du Test 00000 VILLE\ncontact@exemple.fr\n01 02 03 04 05');
  await page.getByTestId('import-logo').setInputFiles({ name: 'logo.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page, 600, 240) });
  await page.waitForTimeout(500);
  await page.getByRole('link', { name: '← Dossiers' }).click();

  await createProject(page, 'PROJET MAISON DES TILLEULS');
  await page.locator('#item-temperature-ext input').fill('21,6');
  await page.locator('#item-hygrometrie-ext input').fill('44');
  await page.locator('#item-temps input').fill('Couvert et sec');

  await openSheet(page, /Bâtiment 1/);
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.locator('#item-couv-plan-types').getByTestId('plan-pdf').setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await plan.save()) });
  await page.getByRole('dialog', { name: /Annotation/ }).waitFor();
  await page.getByRole('button', { name: 'Zone' }).click();
  const box = (await page.locator('.annotator canvas').boundingBox())!;
  for (const [x, y] of [[0.15, 0.16], [0.5, 0.16], [0.5, 0.84], [0.15, 0.84]]) await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
  await page.getByRole('button', { name: 'Terminer la zone' }).click();
  await page.getByRole('button', { name: 'Présence de fissure structurelle' }).click();
  await page.getByRole('button', { name: 'Ajouter à la légende' }).click();
  await page.getByLabel("Légende de l'image").fill('Plan de couverture avec repérage des désordres');
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '← Retour' }).click();

  await page.locator('#item-couv-type').getByRole('button', { name: '2 pans' }).click();
  await page.locator('#item-couv-nature').getByRole('button', { name: 'Tuile mécanique' }).click();
  const etat = page.locator('#item-couv-tuiles-etat');
  await etat.getByRole('button', { name: 'Moyen' }).click();
  await etat.getByRole('textbox').fill('Débords de toit avec abouts de pannes et chevrons exposés. Début de déformation du lambris en sous-face, certainement dû à la pénétration de la végétation dans les interstices.');
  await etat.getByRole('button', { name: /Désordre/ }).click();
  await etat.getByRole('button', { name: 'Court terme' }).click();
  await etat.getByTestId('photo-library').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg },
    { name: 'c.jpg', mimeType: 'image/jpeg', buffer: jpeg },
  ]);
  await expect(etat.getByRole('button', { name: /^Photo 4/ })).toBeVisible();
  await page.locator('#item-couv-gouttieres-etat').getByRole('button', { name: 'Bon' }).click();
  await page.locator('#item-couv-gouttieres-etat').getByRole('textbox').fill('Les gouttières zinc, repiquées sur du PVC, sont en bon état. Pas de trace de fuite.');
  await page.locator('#item-commentaires textarea').fill('Le chéneau entre les 2 bâtiments est encombré : nettoyage et surveillance lors des prochaines pluies.');
  const preco = page.locator('#item-preconisations');
  await preco.getByRole('button', { name: '+ Ajouter' }).click();
  await preco.getByRole('textbox').last().fill('Démousser la couverture du bâtiment B et le solin de la souche');
  await preco.getByRole('button', { name: '+ Ajouter' }).click();
  await preco.getByRole('textbox').last().fill('Reprendre la descente d’eau pluviale côté ouest');
  await preco.getByRole('button', { name: 'Court terme' }).last().click();
  await page.locator('#item-entretien').getByRole('button', { name: '+ Démousser la toiture périodiquement' }).click();

  await addInstance(page, '+ Façade', 'Façade nord');
  await openSheet(page, /Façade 1/);
  const appuis = page.locator('#item-fac-appuis');
  await appuis.getByRole('button', { name: 'Mauvais' }).click();
  await appuis.getByRole('textbox').fill('Absence de rejingots et de larmiers, pente de 4 % pour l’appui du RDC. Présence d’épaufrures, les fers sont à nu.');
  await page.locator('#item-fac-appuis-pente').getByRole('textbox').fill('4');
  const temoins = page.locator('#item-fac-humidite-releves');
  const inputs = temoins.getByRole('textbox');
  await inputs.nth(0).fill('7,5');
  await inputs.nth(1).fill('6,5');
  await inputs.nth(2).fill('3,8');
  await page.locator('#item-securite').getByRole('button', { name: '+ Ajouter' }).click();
  await page.locator('#item-securite').getByRole('textbox').fill('Surveillance du jambage fragile de la marquise');
  await page.locator('#item-securite').getByRole('button', { name: 'Immédiat' }).click();

  await openSheet(page, 'Conclusion');
  await page.getByLabel('Conclusion').fill('Fissures importantes - Les causes envisagées des fissures sont multiples.\n\nVégétation - Limiter la végétation en pied de murs.');
  await page.waitForTimeout(600);

  await openSheet(page, 'Rapport PDF / Word');
  for (const format of ['pdf', 'docx'] as const) {
    await page.getByRole('button', { name: format === 'pdf' ? '📄 Générer le PDF' : '📝 Générer le Word (.docx)' }).click();
    const card = page.getByRole('region', { name: `Rapport ${format}` });
    await card.waitFor({ timeout: 60_000 });
    const href = await card.getByRole('link', { name: 'Ouvrir' }).getAttribute('href');
    const base64 = await page.evaluate(async (url) => {
      const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, href);
    writeFileSync(join(dir, `rapport.${format}`), Buffer.from(base64, 'base64'));
  }
  expect(readFileSync(join(dir, 'rapport.pdf')).subarray(0, 4).toString()).toBe('%PDF');
});
