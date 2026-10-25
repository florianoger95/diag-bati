import { expect, Page } from '@playwright/test';

/** Attend que le service worker contrôle la page (app disponible hors ligne). */
export async function waitForOfflineReady(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** Ouvre une fiche ou une page de la visite (via le tiroir en portrait). */
export async function openSheet(page: Page, name: string | RegExp): Promise<void> {
  const drawer = page.getByRole('button', { name: '☰ Fiches' });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole('navigation', { name: 'Fiches de la visite' }).getByRole('link', { name }).click();
}

export async function addInstance(page: Page, button: string, label: string): Promise<void> {
  const drawer = page.getByRole('button', { name: '☰ Fiches' });
  if (await drawer.isVisible()) await drawer.click();
  await page.getByRole('button', { name: button }).click();
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
}

export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: '+ Nouveau dossier' }).click();
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
