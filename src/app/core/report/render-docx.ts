// Rendu DOCX (bibliothèque docx) du modèle de rapport, pour finir le rapport dans Word (docs/SPEC.md §6).
// Les styles portent des noms proches du modèle Word du cabinet (Corps, Lgende…) ; la police est
// référencée par son nom (Maiandra GD), Word l'affiche si elle est installée.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  IStylesOptions,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ParagraphChild,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import { Block, ParagraphStyle, ReportConfig, ReportModel, ReportPhoto, Run } from './report-model';

export interface RasterImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface DocxAssets {
  imageSize(photoId: string): { width: number; height: number };
  /** Image aplatie (JPEG), une à la fois. */
  loadRaster(photoId: string): Promise<RasterImage>;
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg'; width: number; height: number };
  /** Pages de l'annexe lexique converties en images. */
  annexPages?: (pages: 'all' | number[]) => Promise<RasterImage[]>;
  onProgress?(done: number, total: number): void;
}

const TWIP_PER_MM = 56.7;
/** Largeur utile en pixels (96 dpi) pour une page A4. */
const contentPx = (config: ReportConfig) => ((210 - config.page.marginsMm[1] - config.page.marginsMm[3]) / 25.4) * 96;

const hex = (c: string) => c.replace('#', '').toUpperCase();
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };

const STYLE_IDS: Record<ParagraphStyle | 'h0' | 'h1' | 'h2' | 'h3', string> = {
  body: 'Corps', caption: 'Lgende', firm: 'Cabinet', note: 'Note', label: 'Corps',
  h0: 'TitreRapport', h1: 'TitreSection', h2: 'TitreInstance', h3: 'SousTitre',
};

function styles(config: ReportConfig): IStylesOptions {
  const font = config.font.family;
  const size = Math.round(config.font.size * 2);
  const color = hex(config.colors.text);
  const style = (id: string, name: string, run: object, paragraph: object = {}) => ({
    id, name, basedOn: 'Normal', next: 'Corps', quickFormat: true, run: { font, color, ...run }, paragraph,
  });
  return {
    default: { document: { run: { font, size, color } } },
    paragraphStyles: [
      style('Corps', 'Corps', { size }, { spacing: { after: 100, line: 276 } }),
      style('Lgende', 'Lgende', { size: size - 3, italics: true, color: hex(config.colors.caption) }, { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
      style('Cabinet', 'Cabinet', { size: size - 3 }, { spacing: { after: 0 } }),
      style('Note', 'Note', { size: size - 1, bold: true, italics: true }),
      style('TitreRapport', 'Titre rapport', { size: size + 12, bold: true, underline: { type: UnderlineType.SINGLE } }, { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 120 } }),
      style('TitreSection', 'Titre section', { size: size + 6, bold: true, italics: true, underline: { type: UnderlineType.SINGLE }, color: hex(config.colors.heading) }, { spacing: { before: 240, after: 120 }, keepNext: true }),
      style('TitreInstance', 'Titre instance', { size: size + 2, bold: true, underline: { type: UnderlineType.SINGLE } }, { spacing: { before: 200, after: 80 }, keepNext: true }),
      style('SousTitre', 'Sous-titre', { size, bold: true }, { spacing: { before: 120, after: 60 }, keepNext: true }),
    ],
  };
}

function runs(list: Run[], config: ReportConfig): TextRun[] {
  return list.map((r) => {
    const color = r.revised ? config.colors.revision : r.color;
    return new TextRun({
      text: r.text.replace(/⁠/g, ''),
      bold: r.bold, italics: r.italic,
      underline: r.underline ? { type: UnderlineType.SINGLE } : undefined,
      color: color ? hex(color) : undefined,
    });
  });
}

const align = (a?: 'left' | 'center' | 'right') =>
  a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : undefined;

function photoCaption(p: ReportPhoto): string {
  const kind = p.kind === 'photo' ? 'Photo' : p.kind === 'plan' ? 'Plan' : 'Croquis';
  return `${kind} ${p.number}${p.caption ? ` — ${p.caption}` : ''}`;
}

function image(raster: RasterImage, maxWidth: number, maxHeight: number): ImageRun {
  let width = maxWidth;
  let height = (width * raster.height) / raster.width;
  if (height > maxHeight) {
    height = maxHeight;
    width = (height * raster.width) / raster.height;
  }
  return new ImageRun({ type: 'jpg', data: raster.bytes, transformation: { width: Math.round(width), height: Math.round(height) } });
}

export async function renderDocx(model: ReportModel, config: ReportConfig, assets: DocxAssets): Promise<Blob> {
  const width = contentPx(config);
  const pageHeightPx = ((297 - config.page.marginsMm[0] - config.page.marginsMm[2]) / 25.4) * 96;
  const children: (Paragraph | Table)[] = [];
  const total = model.blocks.reduce((n, b) => n + (b.type === 'photos' ? b.photos.length : b.type === 'plan' ? 1 : 0), 0);
  let done = 0;
  const load = async (id: string) => {
    const raster = await assets.loadRaster(id);
    assets.onProgress?.(++done, total);
    return raster;
  };

  for (const block of model.blocks) {
    switch (block.type) {
      case 'heading':
        children.push(new Paragraph({
          style: STYLE_IDS[`h${block.level}`], children: runs(block.runs, config),
          alignment: align(block.align), pageBreakBefore: block.pageBreakBefore,
        }));
        break;
      case 'paragraph':
        children.push(new Paragraph({
          // une puce porte déjà le style « ListParagraph » : pas de second style (Word refuserait le fichier)
          ...(block.bullet ? { bullet: { level: 0 } } : { style: STYLE_IDS[block.style ?? 'body'] }),
          children: runs(block.runs, config), alignment: align(block.align),
          ...(block.indent ? { indent: { left: block.indent * 20 } } : {}),
        }));
        break;
      case 'spacer':
        for (let i = 0; i < block.lines; i++) children.push(new Paragraph({ style: 'Corps' }));
        break;
      case 'pageBreak':
        children.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case 'photos': {
        const cols = Math.max(1, config.photos.columns);
        const cellWidth = width / cols - 12;
        const rows: TableRow[] = [];
        for (let i = 0; i < block.photos.length; i += cols) {
          const cells: TableCell[] = [];
          for (let c = 0; c < cols; c++) {
            const p = block.photos[i + c];
            const content: Paragraph[] = [];
            if (p) {
              content.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [image(await load(p.photoId), cellWidth, pageHeightPx * 0.42)] }));
              content.push(new Paragraph({ style: 'Lgende', children: [new TextRun(photoCaption(p))] }));
              if (p.ref) content.push(new Paragraph({ style: 'Lgende', children: [new TextRun(`(${p.ref})`)] }));
            } else {
              content.push(new Paragraph({}));
            }
            cells.push(new TableCell({ children: content, borders: NO_BORDERS, width: { size: 100 / cols, type: WidthType.PERCENTAGE } }));
          }
          rows.push(new TableRow({ children: cells, cantSplit: true }));
        }
        children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...NO_BORDERS, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER } }));
        children.push(new Paragraph({ style: 'Corps' }));
        break;
      }
      case 'plan': {
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER, keepNext: true,
          children: [image(await load(block.photo.photoId), width, pageHeightPx * 0.8)],
        }));
        children.push(new Paragraph({ style: 'Lgende', keepNext: block.legend.length > 0, children: [new TextRun(photoCaption(block.photo))] }));
        for (const entry of block.legend) {
          children.push(new Paragraph({
            style: 'Corps', children: [new TextRun({ text: '■ ', color: hex(entry.color) }), new TextRun(entry.label)] as ParagraphChild[],
          }));
        }
        break;
      }
      case 'annex': {
        const pages = (await assets.annexPages?.(block.pages)) ?? [];
        for (const page of pages) {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, pageBreakBefore: true, children: [image(page, width, pageHeightPx)] }));
        }
        break;
      }
    }
  }

  const [top, right, bottom, left] = config.page.marginsMm.map((m) => Math.round(m * TWIP_PER_MM));
  const header = assets.logo
    ? new Header({
      children: [new Paragraph({
        children: [new ImageRun({
          type: assets.logo.type, data: assets.logo.bytes,
          transformation: { width: Math.round((48 * assets.logo.width) / assets.logo.height), height: 48 },
        })],
      })],
    })
    : undefined;
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT] }), new TextRun(' / '), new TextRun({ children: [PageNumber.TOTAL_PAGES] })],
    })],
  });

  const doc = new Document({
    creator: 'Diag bâti',
    title: model.fileBaseName,
    styles: styles(config),
    sections: [{
      properties: { page: { margin: { top, right, bottom, left } } },
      headers: header ? { default: header } : undefined,
      footers: { default: footer },
      children,
    }],
  });
  return Packer.toBlob(doc);
}
