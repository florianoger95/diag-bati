import { PDFDocument, rgb } from 'pdf-lib';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { beforeAll, describe, expect, it } from 'vitest';
import { configurePdfWorker, openPdf } from './pdf-plan';

/** Plan de test : 2 pages A4 paysage, un carré rouge en haut à gauche de la page 2. */
async function makePlan(): Promise<Blob> {
  const doc = await PDFDocument.create();
  doc.addPage([842, 595]).drawText('Page 1', { x: 50, y: 500 });
  const page2 = doc.addPage([842, 595]);
  page2.drawRectangle({ x: 0, y: 595 - 200, width: 200, height: 200, color: rgb(1, 0, 0) });
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

beforeAll(() => configurePdfWorker(workerUrl));

describe('import de plan PDF', () => {
  it('compte les pages et produit des miniatures', async () => {
    const pdf = await openPdf(await makePlan());
    try {
      expect(pdf.pageCount).toBe(2);
      const thumb = await pdf.thumbnail(0, 200);
      const bitmap = await createImageBitmap(thumb);
      expect(bitmap.width).toBe(200);
      bitmap.close();
    } finally {
      await pdf.close();
    }
  });

  it('importe la page choisie : PDF vectoriel d’une page + image de 2400 px', async () => {
    const pdf = await openPdf(await makePlan());
    try {
      const plan = await pdf.importPage(1);
      expect(plan.width).toBe(2400);
      expect(plan.height).toBe(Math.round((2400 * 595) / 842));

      const vector = await PDFDocument.load(await plan.vector!.arrayBuffer());
      expect(vector.getPageCount()).toBe(1);
      expect(vector.getPage(0).getSize()).toEqual({ width: 842, height: 595 });

      // le carré rouge de la page 2 se retrouve en haut à gauche de l'image
      const bitmap = await createImageBitmap(plan.image);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 100, 100, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      expect(r).toBeGreaterThan(200);
      expect(g).toBeLessThan(60);
      expect(b).toBeLessThan(60);
      bitmap.close();
    } finally {
      await pdf.close();
    }
  });

  it('refuse un fichier qui n’est pas un PDF avec un message clair', async () => {
    await expect(openPdf(new Blob(['pas un pdf'], { type: 'application/pdf' }))).rejects.toThrow(/PDF/);
  });
});
