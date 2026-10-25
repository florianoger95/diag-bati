import { PDFDocument, rgb } from 'pdf-lib';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { beforeAll, describe, expect, it } from 'vitest';
import { configurePdfWorker } from '../media/pdf-plan';
import { annotationOverlay, flattenImage } from './report-images';
import { PdfAssets, PdfImage, renderPdf } from './render-pdf';
import { Block, ReportConfig, ReportModel } from './report-model';

const fonts: Record<string, Uint8Array> = {};
async function font(name: string) {
  fonts[name] ??= new Uint8Array(await (await fetch(`/fonts/${name}.ttf`)).arrayBuffer());
  return fonts[name];
}

const config = {
  page: { size: 'A4', marginsMm: [18, 20, 18, 20] }, title: 'ÉTAT', font: { family: 'Maiandra GD', size: 10.5 },
  colors: { text: '#000000', heading: '#000000', revision: '#7030A0', defect: '#C00000', accent: '#1F4E79', caption: '#44546A' },
  blocks: [], sectionPageBreak: true, revisionHighlight: 'all',
  photos: { columns: 2, maxLongSide: 1200, jpegQuality: 0.72, planMaxLongSide: 2000 },
  emptyInstance: 'omit', lexicon: { mark: 'every', annex: 'all' },
  headings: { conclusion: '', defects: '', works: '', safety: '', maintenance: '', lexicon: '' }, footer: '{page} / {pages}',
} as ReportConfig;

/** Photo de test texturée (bruit) pour un poids réaliste. */
async function texturedJpeg(width: number, height: number, quality: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(width, height);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 90 + ((i / 4) % width) / width * 100 + Math.random() * 40;
    data.data[i] = v;
    data.data[i + 1] = v * 0.9;
    data.data[i + 2] = v * 0.8;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', quality));
  canvas.width = canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

async function textOf(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' '));
  }
  await doc.destroy();
  return pages;
}

async function assets(partial: Partial<PdfAssets> = {}): Promise<PdfAssets> {
  return {
    fonts: { regular: await font('Overlock-Regular'), bold: await font('Overlock-Bold'), italic: await font('Overlock-Italic'), boldItalic: await font('Overlock-BoldItalic') },
    imageSize: () => ({ width: 1200, height: 900 }),
    loadImage: async (): Promise<PdfImage> => ({ kind: 'jpeg', bytes: await texturedJpeg(240, 180, 0.7) }),
    ...partial,
  };
}

const model = (blocks: Block[]): ReportModel => ({ blocks, photoIds: [], lexiconTerms: [], fileBaseName: '2026-10-001 PROJET TEST' });
const para = (t: string): Block => ({ type: 'paragraph', runs: [{ text: t }] });

beforeAll(() => configurePdfWorker(workerUrl));

describe('renderPdf', () => {
  it('produit un PDF lisible : titre, texte accentué, pagination « n / N »', async () => {
    const blocks: Block[] = [
      { type: 'heading', level: 0, runs: [{ text: "ÉTAT ET DIAGNOSTIC DE L'EXISTANT" }] },
      { type: 'paragraph', runs: [{ text: 'Température : ', bold: true, italic: true }, { text: '21,6 °C — façade nord, chéneau* œil-de-bœuf' }] },
      { type: 'heading', level: 1, runs: [{ text: 'DIAGNOSTIC COUVERTURE' }], pageBreakBefore: true },
      para('Tuiles poreuses.'),
    ];
    const bytes = await renderPdf(model(blocks), config, await assets());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe('2026-10-001 PROJET TEST');
    const [p1, p2] = await textOf(bytes);
    expect(p1).toContain("ÉTAT ET DIAGNOSTIC DE L'EXISTANT");
    expect(p1).toContain('chéneau*');
    expect(p1).toContain('1 / 2');
    expect(p2).toContain('2 / 2');
  });

  it('fonctionne avec une police importée en un seul style (gras et italique simulés)', async () => {
    const bytes = await renderPdf(model([{ type: 'paragraph', runs: [{ text: 'Gras ', bold: true }, { text: 'italique', italic: true }] }]),
      config, await assets({ fonts: { regular: await font('Overlock-Regular') } }));
    expect((await textOf(bytes))[0]).toContain('Gras italique');
  });

  it('insère le logo et les photos, et fusionne les pages d’annexe demandées', async () => {
    const annex = await PDFDocument.create();
    for (let i = 1; i <= 3; i++) annex.addPage([595, 842]).drawText(`ANNEXE PAGE ${i}`, { x: 50, y: 700, size: 20 });
    const logo = await texturedJpeg(300, 120, 0.8);
    const bytes = await renderPdf(model([
      para('Corps'),
      { type: 'photos', photos: [{ photoId: 'a', number: 1, kind: 'photo', caption: 'Souche', ref: 'État' }] },
      { type: 'annex', pages: [2] },
    ]), config, await assets({ annex: await annex.save(), logo: { bytes: logo, type: 'jpg', width: 300, height: 120 } }));
    const texts = await textOf(bytes);
    expect(texts.length).toBe(2);
    expect(texts[0]).toContain('Photo 1 — Souche');
    expect(texts[1]).toContain('ANNEXE PAGE 2');
    expect(texts[1]).toContain('2 / 2');
  });

  it('pose un plan vectoriel avec son calque d’annotations', async () => {
    const plan = await PDFDocument.create();
    plan.addPage([842, 595]).drawRectangle({ x: 100, y: 100, width: 400, height: 300, borderColor: rgb(0, 0, 0), borderWidth: 4 });
    plan.getPage(0).drawText('RDC', { x: 120, y: 420, size: 24 });
    const overlay = await annotationOverlay([{ id: 'z', kind: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: '#ff0000', width: 0.01 }], 842, 595);
    const bytes = await renderPdf(model([{ type: 'plan', photo: { photoId: 'p', number: 2, kind: 'plan', caption: 'Plan RDC' }, legend: [{ color: '#ff0000', label: 'Fissure' }] }]),
      config, await assets({ imageSize: () => ({ width: 842, height: 595 }), loadImage: async () => ({ kind: 'pdf', bytes: await plan.save(), overlay }) }));
    const text = (await textOf(bytes))[0];
    expect(text).toContain('RDC'); // texte vectoriel du plan conservé
    expect(text).toContain('Plan 2 — Plan RDC');
    expect(text).toContain('Fissure');
  });

  it('30 photos donnent un PDF de moins de 15 Mo', async () => {
    const photo = await texturedJpeg(1200, 900, 0.72);
    const photos = Array.from({ length: 30 }, (_, i) => ({ photoId: `p${i}`, number: i + 1, kind: 'photo' as const, caption: `Photo ${i}` }));
    const bytes = await renderPdf(model([{ type: 'photos', photos }]), config,
      await assets({ loadImage: async () => ({ kind: 'jpeg', bytes: photo }) }));
    expect(bytes.byteLength).toBeLessThan(15 * 1024 * 1024);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(4);
  });
});

describe('images du rapport', () => {
  it('aplatit une photo et ses annotations au format demandé', async () => {
    const source = new Blob([await texturedJpeg(1600, 1200, 0.8)], { type: 'image/jpeg' });
    const flat = await flattenImage(source, [{ id: 'r', kind: 'rect', x: 0.1, y: 0.1, w: 0.5, h: 0.5, color: '#ff0000', width: 0.02 }], 1200, 0.72);
    expect([flat.width, flat.height]).toEqual([1200, 900]);
    const bitmap = await createImageBitmap(new Blob([flat.bytes], { type: 'image/jpeg' }));
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 120, 300, 1, 1, 0, 0, 1, 1);
    const [r, g] = ctx.getImageData(0, 0, 1, 1).data;
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(90);
    bitmap.close();
  });
});
