import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DocxAssets, renderDocx } from './render-docx';
import { Block, ReportConfig, ReportModel } from './report-model';

// JPEG 1×1 valide
const JPEG = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////' +
  '2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AP//Z',
), (c) => c.charCodeAt(0));

const config = {
  page: { size: 'A4', marginsMm: [18, 20, 18, 20] }, title: 'ÉTAT', font: { family: 'Maiandra GD', size: 10.5 },
  colors: { text: '#000000', heading: '#000000', revision: '#7030A0', defect: '#C00000', accent: '#1F4E79', caption: '#44546A' },
  blocks: [], sectionPageBreak: true, revisionHighlight: 'all',
  photos: { columns: 2, maxLongSide: 1200, jpegQuality: 0.72, planMaxLongSide: 2000 },
  emptyInstance: 'omit', lexicon: { mark: 'every', annex: 'all' },
  headings: { conclusion: '', defects: '', works: '', safety: '', maintenance: '', lexicon: '' }, footer: '{page} / {pages}',
} as ReportConfig;

const assets = (partial: Partial<DocxAssets> = {}): DocxAssets => ({
  imageSize: () => ({ width: 1200, height: 900 }),
  loadRaster: async () => ({ bytes: JPEG, width: 1200, height: 900 }),
  ...partial,
});

const blocks: Block[] = [
  { type: 'heading', level: 0, runs: [{ text: "ÉTAT ET DIAGNOSTIC DE L'EXISTANT" }], align: 'center' },
  { type: 'paragraph', runs: [{ text: 'PROJET TEST', bold: true }], align: 'right' },
  { type: 'heading', level: 1, runs: [{ text: 'DIAGNOSTIC COUVERTURE' }], pageBreakBefore: true },
  { type: 'paragraph', runs: [{ text: '- État des tuiles : Mauvais. ' }, { text: 'Désordre (court terme)', bold: true, color: '#C00000' }] },
  { type: 'paragraph', runs: [{ text: 'Démousser' }], bullet: true },
  { type: 'paragraph', runs: [{ text: 'Ajouté après curage', revised: true }] },
  { type: 'photos', photos: [
    { photoId: 'a', number: 1, kind: 'photo', caption: 'Souche', ref: 'État des tuiles' },
    { photoId: 'b', number: 2, kind: 'photo', caption: '' },
    { photoId: 'c', number: 3, kind: 'photo', caption: '' },
  ] },
  { type: 'plan', photo: { photoId: 'p', number: 4, kind: 'plan', caption: 'Plan RDC' }, legend: [{ color: '#ff0000', label: 'Fissure structurelle' }] },
  { type: 'annex', pages: 'all' },
];
const model: ReportModel = { blocks, photoIds: ['a', 'b', 'c', 'p'], lexiconTerms: [], fileBaseName: 'Test' };

async function unzip(blob: Blob) {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('renderDocx', () => {
  it('produit un document Word valide avec le texte, les styles et la police', async () => {
    const zip = await unzip(await renderDocx(model, config, assets()));
    const doc = await zip.file('word/document.xml')!.async('string');
    expect(doc).toContain('ÉTAT ET DIAGNOSTIC DE L&apos;EXISTANT');
    // jamais deux styles sur un même paragraphe (Word signalerait un fichier endommagé)
    expect(doc).not.toMatch(/<w:pStyle [^>]*\/><w:pStyle/);
    expect(doc).toContain('Désordre (court terme)');
    expect(doc).toContain('C00000');
    expect(doc).toContain('7030A0'); // passage révisé en violet
    expect(doc).toContain('Photo 1 — Souche');
    expect(doc).toContain('(État des tuiles)');
    expect(doc).toContain('Fissure structurelle');
    expect(doc).toMatch(/<w:pageBreakBefore\/>/);
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(styles).toContain('Maiandra GD');
    expect(styles).toContain('w:styleId="Corps"');
  });

  it('met les photos dans un tableau sans bordure de 2 colonnes et le plan en pleine largeur', async () => {
    const zip = await unzip(await renderDocx(model, config, assets()));
    const doc = await zip.file('word/document.xml')!.async('string');
    expect((doc.match(/<w:tbl>/g) ?? []).length).toBe(1);
    expect((doc.match(/<w:tr>|<w:tr /g) ?? []).length).toBe(2); // 3 photos → 2 lignes
    expect((doc.match(/<a:blip /g) ?? []).length).toBe(4); // 3 photos + 1 plan
  });

  it('ajoute le logo en en-tête, la pagination en pied de page et les pages d’annexe en images', async () => {
    const zip = await unzip(await renderDocx(model, config, assets({
      logo: { bytes: JPEG, type: 'jpg', width: 300, height: 120 },
      annexPages: async () => [{ bytes: JPEG, width: 1240, height: 1754 }, { bytes: JPEG, width: 1240, height: 1754 }],
    })));
    const header = Object.keys(zip.files).find((f) => /word\/header\d*\.xml/.test(f))!;
    expect(await zip.file(header)!.async('string')).toContain('<a:blip');
    const footer = Object.keys(zip.files).find((f) => /word\/footer\d*\.xml/.test(f))!;
    const footerXml = await zip.file(footer)!.async('string');
    expect(footerXml).toContain('PAGE');
    expect(footerXml).toContain('NUMPAGES');
    const doc = await zip.file('word/document.xml')!.async('string');
    expect((doc.match(/<a:blip /g) ?? []).length).toBe(4 + 2); // photos, plan, 2 pages d'annexe
  });
});
