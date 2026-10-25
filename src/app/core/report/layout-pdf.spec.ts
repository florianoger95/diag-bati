import { describe, expect, it } from 'vitest';
import { layoutReport, LayoutOptions, Op, PageLayout } from './layout-pdf';
import { Block, ReportPhoto } from './report-model';

// Mesure factice : chaque caractère fait 0,5 × la taille de police
const measure = (t: string, _style: { bold?: boolean; italic?: boolean }, size: number) => t.length * size * 0.5;

const options: LayoutOptions = {
  pageWidth: 400, pageHeight: 500, margins: { top: 20, right: 20, bottom: 30, left: 20 },
  headerHeight: 40, fontSize: 10, measure,
  imageSize: (id) => (id.startsWith('plan') ? { width: 3000, height: 2000 } : { width: 1600, height: 1200 }),
  colors: { text: '#000000', heading: '#000000', caption: '#44546A', revision: '#7030A0' },
  hasLogo: true, logoSize: { width: 200, height: 100 },
  photoColumns: 2,
};

const p = (t: string): Block => ({ type: 'paragraph', runs: [{ text: t }] });
const photo = (n: number): ReportPhoto => ({ photoId: `ph${n}`, number: n, kind: 'photo', caption: `Légende ${n}`, ref: 'État des tuiles' });
const content = (pages: PageLayout[]) => pages.filter((pg): pg is Extract<PageLayout, { kind: 'content' }> => pg.kind === 'content');
const textOps = (pg: { ops: Op[] }) => pg.ops.filter((o): o is Extract<Op, { op: 'text' }> => o.op === 'text');
const imageOps = (pg: { ops: Op[] }) => pg.ops.filter((o): o is Extract<Op, { op: 'image' }> => o.op === 'image' && o.mode !== 'logo');

describe('layoutReport', () => {
  const contentWidth = 400 - 40;

  it('coupe les lignes à la largeur utile', () => {
    const long = Array.from({ length: 60 }, (_, i) => `mot${i}`).join(' ');
    const [page] = content(layoutReport([p(long)], options));
    const lines = textOps(page);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) expect(line.x + measure(line.text, {}, line.size)).toBeLessThanOrEqual(20 + contentWidth + 0.01);
  });

  it('enchaîne les mises en forme d’un même paragraphe sur une ligne', () => {
    const [page] = content(layoutReport([{ type: 'paragraph', runs: [{ text: 'Label : ', bold: true }, { text: 'valeur' }] }], options));
    const ops = textOps(page);
    expect(ops.map((o) => [o.text, o.bold ?? false])).toEqual([['Label : ', true], ['valeur', false]]);
    expect(ops[1].x).toBeCloseTo(ops[0].x + measure('Label : ', {}, 10));
    expect(ops[1].y).toBe(ops[0].y);
  });

  it('respecte les retours à la ligne et passe à la page suivante quand la page est pleine', () => {
    const pages = content(layoutReport(Array.from({ length: 60 }, (_, i) => p(`Paragraphe ${i}`)), options));
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) for (const op of textOps(page)) expect(op.y).toBeLessThanOrEqual(500 - 30);
    // contenu sous l'en-tête (logo)
    for (const page of pages) for (const op of textOps(page)) expect(op.y).toBeGreaterThan(20 + 40);
  });

  it('saute une page avant une section, sauf en haut de page', () => {
    const pages = content(layoutReport([
      { type: 'heading', level: 1, runs: [{ text: 'A' }], pageBreakBefore: true },
      p('x'),
      { type: 'heading', level: 1, runs: [{ text: 'B' }], pageBreakBefore: true },
    ], options));
    expect(pages.length).toBe(2);
    expect(textOps(pages[0])[0].text).toBe('A');
    expect(textOps(pages[1])[0].text).toBe('B');
  });

  it('ne laisse pas un titre seul en bas de page', () => {
    const filler = Array.from({ length: 27 }, (_, i) => p(`ligne ${i}`));
    const pages = content(layoutReport([...filler, { type: 'heading', level: 2, runs: [{ text: 'TITRE' }] }, p('suite')], options));
    const withTitle = pages.find((pg) => textOps(pg).some((o) => o.text === 'TITRE'))!;
    expect(textOps(withTitle).some((o) => o.text === 'suite')).toBe(true);
  });

  it('dispose les photos en grille de 2 colonnes avec numéro, légende et renvoi', () => {
    const [page] = content(layoutReport([{ type: 'photos', photos: [photo(1), photo(2), photo(3)] }], options));
    const imgs = imageOps(page);
    expect(imgs.map((i) => i.photoId)).toEqual(['ph1', 'ph2', 'ph3']);
    expect(imgs[0].y).toBe(imgs[1].y);
    expect(imgs[1].x).toBeGreaterThan(imgs[0].x + imgs[0].w);
    expect(imgs[2].y).toBeGreaterThan(imgs[0].y + imgs[0].h);
    expect(imgs[0].w / imgs[0].h).toBeCloseTo(1600 / 1200);
    const captions = textOps(page).map((o) => o.text).join(' ');
    expect(captions).toContain('Photo 1');
    expect(captions).toContain('Légende 1');
    expect(captions).toContain('État des tuiles');
  });

  it('garde une photo avec sa légende sur la même page', () => {
    const filler = Array.from({ length: 24 }, (_, i) => p(`ligne ${i}`));
    const pages = content(layoutReport([...filler, { type: 'photos', photos: [photo(1)] }], options));
    const page = pages.find((pg) => imageOps(pg).length)!;
    const img = imageOps(page)[0];
    const caption = textOps(page).find((o) => o.text.includes('Photo 1'))!;
    expect(caption.y).toBeGreaterThan(img.y + img.h);
    expect(caption.y).toBeLessThanOrEqual(500 - 30);
  });

  it('imprime un plan en pleine largeur avec sa légende de couleurs', () => {
    const [page] = content(layoutReport([{
      type: 'plan', photo: { photoId: 'plan1', number: 4, kind: 'plan', caption: 'Plan de couverture' },
      legend: [{ color: '#ff0000', label: 'Fissure structurelle' }],
    }], options));
    const img = imageOps(page)[0];
    expect(img.w).toBeCloseTo(contentWidth);
    expect(img.mode).toBe('plan');
    expect(page.ops.some((o) => o.op === 'rect' && o.fill === '#ff0000')).toBe(true);
    expect(textOps(page).some((o) => o.text.includes('Fissure structurelle'))).toBe(true);
  });

  it('réduit un plan trop haut pour tenir sur la page', () => {
    const tall = { ...options, imageSize: () => ({ width: 1000, height: 4000 }) };
    const [page] = content(layoutReport([{ type: 'plan', photo: { photoId: 'plan2', number: 1, kind: 'plan', caption: '' }, legend: [] }], tall));
    const img = imageOps(page)[0];
    expect(img.y + img.h).toBeLessThanOrEqual(500 - 30);
    expect(img.w / img.h).toBeCloseTo(0.25);
  });

  it('place le logo en en-tête de chaque page de contenu', () => {
    const pages = content(layoutReport(Array.from({ length: 60 }, (_, i) => p(`P${i}`)), options));
    for (const page of pages) expect(page.ops.some((o) => o.op === 'image' && o.photoId === '__logo')).toBe(true);
  });

  it('insère les pages d’annexe à leur place', () => {
    const pages = layoutReport([p('fin'), { type: 'annex', pages: [2, 3] }], options);
    expect(pages.map((pg) => pg.kind)).toEqual(['content', 'annex']);
    expect(pages[1]).toEqual({ kind: 'annex', pages: [2, 3] });
  });
});
