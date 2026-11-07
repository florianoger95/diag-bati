import { degrees, PDFDocument, rgb } from 'pdf-lib';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { beforeAll, describe, expect, it } from 'vitest';
import { configurePdfWorker, openPdf } from './pdf-plan';
import { normalizeRotation, transformRaster, transformVector } from './plan-transform';

beforeAll(() => configurePdfWorker(workerUrl));

/** Image 400 × 200 avec un carré rouge en haut à gauche. */
async function marked(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 200);
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 100, 100);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
}

/** Plan PDF 842 × 595 avec un carré rouge en haut à gauche. */
async function markedPdf(rotation = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  page.drawRectangle({ x: 0, y: 595 - 200, width: 200, height: 200, color: rgb(1, 0, 0) });
  if (rotation) page.setRotation(degrees(rotation));
  return doc.save();
}

async function redAt(blob: Blob, fx: number, fy: number): Promise<boolean> {
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bitmap, Math.floor(fx * bitmap.width), Math.floor(fy * bitmap.height), 1, 1, 0, 0, 1, 1);
  bitmap.close();
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return r > 200 && g < 80 && b < 80;
}

/** Rendu d'un PDF d'une page (comme à l'import). */
async function render(pdf: Uint8Array) {
  const handle = await openPdf(new Blob([pdf.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
  try {
    return await handle.importPage(0, 800);
  } finally {
    await handle.close();
  }
}

describe('transformRaster', () => {
  it('pivote d’un quart de tour à droite : le coin haut-gauche passe en haut à droite', async () => {
    const out = await transformRaster(await marked(), { rotate: 90 });
    expect([out.width, out.height]).toEqual([200, 400]);
    expect(await redAt(out.image, 0.9, 0.1)).toBe(true);
    expect(await redAt(out.image, 0.1, 0.1)).toBe(false);
  });

  it('pivote d’un quart de tour à gauche et d’un demi-tour', async () => {
    const left = await transformRaster(await marked(), { rotate: 270 });
    expect(await redAt(left.image, 0.1, 0.9)).toBe(true);
    const half = await transformRaster(await marked(), { rotate: 180 });
    expect([half.width, half.height]).toEqual([400, 200]);
    expect(await redAt(half.image, 0.95, 0.9)).toBe(true);
  });

  it('recadre la zone choisie', async () => {
    const out = await transformRaster(await marked(), { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    expect([out.width, out.height]).toEqual([200, 100]);
    expect(await redAt(out.image, 0.25, 0.5)).toBe(true);
    expect(await redAt(out.image, 0.75, 0.5)).toBe(false);
  });
});

describe('transformVector', () => {
  it('pivote la page vectorielle comme l’image', async () => {
    const out = await PDFDocument.load(await transformVector(await markedPdf(), { rotate: 90 }));
    expect(out.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    const page = await render(await out.save());
    expect(await redAt(page.image, 0.9, 0.1)).toBe(true);
  });

  it('recadre la page vectorielle comme l’image', async () => {
    const bytes = await transformVector(await markedPdf(), { crop: { x: 0, y: 0, w: 0.5, h: 0.5 } });
    const out = await PDFDocument.load(bytes);
    expect(out.getPage(0).getSize()).toEqual({ width: 421, height: 297.5 });
    const page = await render(bytes);
    expect(await redAt(page.image, 0.2, 0.3)).toBe(true);
    expect(await redAt(page.image, 0.8, 0.8)).toBe(false);
  });

  it('remet à plat une page qui porte une rotation (/Rotate)', async () => {
    const rotated = await markedPdf(90);
    const flat = await PDFDocument.load(await normalizeRotation(rotated));
    expect(flat.getPage(0).getRotation().angle).toBe(0);
    expect(flat.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    // même apparence qu'à l'écran (pdf.js applique /Rotate)
    const before = await render(rotated);
    const after = await render(await flat.save());
    expect(await redAt(after.image, 0.9, 0.1)).toBe(await redAt(before.image, 0.9, 0.1));
    expect(await redAt(after.image, 0.9, 0.1)).toBe(true);
  });
});
