import { expect, Locator, Page } from '@playwright/test';
import JSZip from 'jszip';

/** Génère le rapport Word depuis la page Rapport et renvoie son `document.xml`. */
export async function docxXml(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Générer le Word (.docx)' }).click();
  const card = page.getByRole('region', { name: 'Rapport docx' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const href = await card.getByRole('link', { name: 'Ouvrir' }).getAttribute('href');
  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url!)).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, href);
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  return zip.file('word/document.xml')!.async('string');
}

/** Attend que le service worker contrôle la page (app disponible hors ligne). */
export async function waitForOfflineReady(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // comme sur l'iPad : attendre « Prête hors ligne » avant de passer en mode avion
  await expect(page.getByTestId('offline-ready')).toBeVisible({ timeout: 30_000 });
}

/** Ouvre une fiche ou une page de la visite depuis le plan de visite (sélecteur de fiche de la barre). */
export async function openSheet(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: /^Fiches de la visite/ }).click();
  await page.getByRole('navigation', { name: 'Fiches de la visite' }).getByRole('link', { name }).click();
}

export async function addInstance(page: Page, button: string, label: string): Promise<void> {
  await page.getByRole('button', { name: /^Fiches de la visite/ }).click();
  await page.getByRole('button', { name: button }).click();
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
}

/** Liste des questions de la fiche ; en portrait, elle s'ouvre en tiroir. */
export async function showQuestions(page: Page): Promise<Locator> {
  const list = page.getByRole('navigation', { name: 'Questions de la fiche' });
  if (!(await list.isVisible())) await page.getByRole('button', { name: /^Questions/ }).click();
  await expect(list).toBeVisible();
  return list;
}

/** Ouvre une question de la fiche dans le panneau de détail (les rubriques de pied : « Synthèse de la fiche »). */
export async function openItem(page: Page, itemId: string): Promise<Locator> {
  const list = await showQuestions(page);
  const row = list.locator(`[data-q="${itemId}"]`);
  if (await row.count()) await row.click();
  else await list.getByRole('link', { name: /Synthèse de la fiche/ }).click();
  const item = page.locator(`#item-${itemId}`);
  await expect(item).toBeVisible();
  return item;
}

/** Barre d'actions du panneau de détail : elle agit sur l'observation sélectionnée. */
export function actionBar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Actions sur la question' });
}

/** Pose (ou change) le désordre de l'observation sélectionnée. */
export async function setDefect(page: Page, urgency: string): Promise<void> {
  await actionBar(page).getByRole('button', { name: /^(Désordre|Immédiat|Court terme|Moyen terme|À surveiller)$/ }).click();
  await page.getByRole('group', { name: 'Urgence du désordre' }).getByRole('button', { name: urgency }).click();
}

/** Ajoute des photos depuis la photothèque à la question ouverte. */
export async function addPhotos(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[] | { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  await page.getByTestId('photo-library').setInputFiles(files);
}

/** Action du menu « … » de la barre de visite. */
export async function sheetMenu(page: Page, action: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Plus d’actions' }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: action }).click();
}

export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Nouveau dossier' }).click();
  await page.locator('#item-projet input').fill(name);
  await page.locator('#item-adresse input').fill('12 rue des Lilas 00000 VILLE-TEST');
  await page.getByRole('button', { name: 'Créer et commencer la visite' }).click();
  await expect(page.getByRole('heading', { name: 'Conditions de visite' })).toBeVisible();
}

/** Photo JPEG de test (4000 × 3000) fabriquée par le navigateur lui-même. */
export async function makeJpeg(page: Page, width = 4000, height = 3000): Promise<Buffer> {
  const base64 = await page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#8a9aa8';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#5a3a2a';
    ctx.fillRect(width * 0.3, height * 0.3, width * 0.4, height * 0.4);
    const url = canvas.toDataURL('image/jpeg', 0.9);
    canvas.width = canvas.height = 0;
    return url.split(',')[1];
  }, { width, height });
  return Buffer.from(base64, 'base64');
}

/** Trace un glisser au doigt/à la souris sur le canvas d'annotation (coordonnées relatives 0–1). */
export async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const canvas = page.locator('.annotator canvas');
  const box = (await canvas.boundingBox())!;
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const;
  await page.mouse.move(...at(from));
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    await page.mouse.move(...at([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]));
  }
  await page.mouse.up();
}
