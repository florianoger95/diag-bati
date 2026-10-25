// Rendu PDF (pdf-lib) des pages calculées par layoutReport (docs/SPEC.md §6).
import fontkit from '@pdf-lib/fontkit';
import {
  degrees,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  setLineWidth,
  setStrokingColor,
  setTextRenderingMode,
  TextRenderingMode,
} from 'pdf-lib';
import { layoutReport, Op, TextStyle } from './layout-pdf';
import { ReportConfig, ReportModel } from './report-model';

export type PdfImage =
  | { kind: 'jpeg'; bytes: Uint8Array }
  /** Plan vectoriel (PDF d'une page) et calque PNG optionnel des annotations. */
  | { kind: 'pdf'; bytes: Uint8Array; overlay?: Uint8Array };

export interface PdfAssets {
  /** Si seule la police normale est fournie (Maiandra GD), gras et italique sont simulés. */
  fonts: { regular: Uint8Array; bold?: Uint8Array; italic?: Uint8Array; boldItalic?: Uint8Array };
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg'; width: number; height: number };
  imageSize(photoId: string): { width: number; height: number };
  /** Appelé une image à la fois, dans l'ordre du rapport. */
  loadImage(photoId: string): Promise<PdfImage>;
  annex?: Uint8Array;
  onProgress?(done: number, total: number): void;
}

const MM = 72 / 25.4;
const A4 = { width: 595.28, height: 841.89 };

/** Remplacements des caractères absents de la police. */
const FALLBACK: Record<string, string> = {
  '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '≥': '>=', '≤': '<=', '→': '->',
  '←': '<-', 'œ': 'oe', 'Œ': 'OE', '•': '-', ' ': ' ', ' ': ' ', ' ': ' ', '×': 'x', '≈': '~',
};

function hexColor(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

interface FontVariant {
  font: PDFFont;
  syntheticBold: boolean;
  syntheticItalic: boolean;
}

class Fonts {
  private readonly cache = new Map<string, string>();

  constructor(private readonly variants: Record<'regular' | 'bold' | 'italic' | 'boldItalic', FontVariant>) {}

  static async embed(doc: PDFDocument, f: PdfAssets['fonts']): Promise<Fonts> {
    doc.registerFontkit(fontkit);
    const embed = (bytes: Uint8Array) => doc.embedFont(bytes, { subset: true });
    const regular = await embed(f.regular);
    const bold = f.bold ? await embed(f.bold) : undefined;
    const italic = f.italic ? await embed(f.italic) : undefined;
    const boldItalic = f.boldItalic ? await embed(f.boldItalic) : undefined;
    return new Fonts({
      regular: { font: regular, syntheticBold: false, syntheticItalic: false },
      bold: bold ? { font: bold, syntheticBold: false, syntheticItalic: false } : { font: regular, syntheticBold: true, syntheticItalic: false },
      italic: italic ? { font: italic, syntheticBold: false, syntheticItalic: false } : { font: regular, syntheticBold: false, syntheticItalic: true },
      boldItalic: boldItalic
        ? { font: boldItalic, syntheticBold: false, syntheticItalic: false }
        : bold ? { font: bold, syntheticBold: false, syntheticItalic: true }
          : { font: regular, syntheticBold: true, syntheticItalic: true },
    });
  }

  variant(style: TextStyle): FontVariant {
    return this.variants[style.bold ? (style.italic ? 'boldItalic' : 'bold') : style.italic ? 'italic' : 'regular'];
  }

  /** Remplace les caractères que la police ne sait pas dessiner. */
  sanitize(text: string, variant: FontVariant): string {
    const key = `${variant.font.name}|${text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const glyphs = (variant.font as unknown as { embedder?: { font?: { hasGlyphForCodePoint?: (cp: number) => boolean } } }).embedder?.font;
    let out = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0x2060) continue;
      if (!glyphs?.hasGlyphForCodePoint || glyphs.hasGlyphForCodePoint(cp)) out += ch;
      else out += FALLBACK[ch] ?? '?';
    }
    if (this.cache.size < 5000) this.cache.set(key, out);
    return out;
  }

  measure(text: string, style: TextStyle, size: number): number {
    const v = this.variant(style);
    const width = v.font.widthOfTextAtSize(this.sanitize(text, v), size);
    return v.syntheticBold ? width * 1.03 : width;
  }
}

function drawText(page: PDFPage, op: Extract<Op, { op: 'text' }>, fonts: Fonts): void {
  const v = fonts.variant(op);
  const text = fonts.sanitize(op.text, v);
  if (!text) return;
  const color = hexColor(op.color);
  const y = page.getHeight() - op.y;
  if (v.syntheticBold) {
    page.pushOperators(setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(op.size * 0.035), setStrokingColor(color));
  }
  page.drawText(text, { x: op.x, y, size: op.size, font: v.font, color, ...(v.syntheticItalic ? { xSkew: degrees(12) } : {}) });
  if (v.syntheticBold) page.pushOperators(setTextRenderingMode(TextRenderingMode.Fill));
  if (op.underline) {
    const width = fonts.measure(op.text, op, op.size);
    page.drawLine({ start: { x: op.x, y: y - op.size * 0.13 }, end: { x: op.x + width, y: y - op.size * 0.13 }, thickness: Math.max(0.5, op.size * 0.06), color });
  }
}

export async function renderPdf(model: ReportModel, config: ReportConfig, assets: PdfAssets): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(model.fileBaseName);
  doc.setLanguage('fr-FR');
  doc.setProducer('Diag bâti');
  doc.setCreator('Diag bâti');
  const fonts = await Fonts.embed(doc, assets.fonts);
  const [top, right, bottom, left] = config.page.marginsMm.map((m) => m * MM);

  const pages = layoutReport(model.blocks, {
    pageWidth: A4.width, pageHeight: A4.height, margins: { top, right, bottom, left },
    headerHeight: assets.logo ? 52 : 0, fontSize: config.font.size,
    measure: (t, s, size) => fonts.measure(t, s, size),
    imageSize: (id) => (id === '__logo' && assets.logo ? assets.logo : assets.imageSize(id)),
    colors: config.colors, hasLogo: !!assets.logo, logoSize: assets.logo, photoColumns: config.photos.columns,
  });

  let logo: PDFImage | undefined;
  if (assets.logo) logo = assets.logo.type === 'png' ? await doc.embedPng(assets.logo.bytes) : await doc.embedJpg(assets.logo.bytes);
  const annexDoc = assets.annex && pages.some((p) => p.kind === 'annex') ? await PDFDocument.load(assets.annex) : undefined;

  const totalImages = pages.reduce((n, p) => n + (p.kind === 'content' ? p.ops.filter((o) => o.op === 'image' && o.mode !== 'logo').length : 0), 0);
  let done = 0;
  /** Pages importées (annexe) : reçoivent le logo et la pagination de l'app. */
  const logoOn: PDFPage[] = [];

  for (const layout of pages) {
    if (layout.kind === 'annex') {
      if (!annexDoc) continue;
      const count = annexDoc.getPageCount();
      const indices = (layout.pages === 'all' ? Array.from({ length: count }, (_, i) => i + 1) : layout.pages)
        .map((n) => n - 1).filter((i) => i >= 0 && i < count);
      for (const copied of await doc.copyPages(annexDoc, indices)) logoOn.push(doc.addPage(copied));
      continue;
    }
    const page = doc.addPage([A4.width, A4.height]);
    const H = page.getHeight();
    for (const op of layout.ops) {
      switch (op.op) {
        case 'text':
          drawText(page, op, fonts);
          break;
        case 'rect':
          page.drawRectangle({ x: op.x, y: H - op.y - op.h, width: op.w, height: op.h, color: hexColor(op.fill) });
          break;
        case 'image': {
          const box = { x: op.x, y: H - op.y - op.h, width: op.w, height: op.h };
          if (op.mode === 'logo') {
            if (logo) page.drawImage(logo, box);
            break;
          }
          const image = await assets.loadImage(op.photoId);
          if (image.kind === 'jpeg') {
            page.drawImage(await doc.embedJpg(image.bytes), box);
          } else {
            const [embedded] = await doc.embedPdf(image.bytes, [0]);
            page.drawPage(embedded, box);
            if (image.overlay) page.drawImage(await doc.embedPng(image.overlay), box);
          }
          page.drawRectangle({ ...box, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5 });
          assets.onProgress?.(++done, totalImages);
          break;
        }
      }
    }
  }

  // pagination « n / N » (et logo sur les pages d'annexe)
  const all = doc.getPages();
  const footerFont = fonts.variant({});
  all.forEach((page, i) => {
    const label = config.footer.replace('{page}', String(i + 1)).replace('{pages}', String(all.length));
    const size = config.font.size - 1;
    const width = fonts.measure(label, {}, size);
    page.drawText(fonts.sanitize(label, footerFont), {
      x: (page.getWidth() - width) / 2, y: bottom / 2, size, font: footerFont.font, color: hexColor(config.colors.text),
    });
    if (logo && assets.logo && logoOn.includes(page)) {
      const h = 52 * 0.75;
      const w = Math.min(page.getWidth() / 3, (h * assets.logo.width) / assets.logo.height);
      page.drawImage(logo, { x: left, y: page.getHeight() - top - (w * assets.logo.height) / assets.logo.width, width: w, height: (w * assets.logo.height) / assets.logo.width });
    }
  });

  return doc.save({ useObjectStreams: true });
}
