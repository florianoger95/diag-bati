// Mise en page du rapport PDF (fonction pure) : blocs → pages d'opérations de dessin.
// Repère : origine en haut à gauche, unités en points. La mesure du texte est injectée
// (polices réelles dans l'app, mesure factice dans les tests).
import { LegendEntry } from '../model/data';
import { Block, ParagraphStyle, ReportPhoto, Run } from './report-model';

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
}

export interface LayoutOptions {
  pageWidth: number;
  pageHeight: number;
  margins: { top: number; right: number; bottom: number; left: number };
  /** Hauteur réservée au logo en haut de page. */
  headerHeight: number;
  fontSize: number;
  measure: (text: string, style: TextStyle, size: number) => number;
  imageSize: (photoId: string) => { width: number; height: number };
  colors: { text: string; heading: string; caption: string; revision: string };
  hasLogo: boolean;
  logoSize?: { width: number; height: number };
  photoColumns: number;
}

export type Op =
  | { op: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; italic?: boolean; underline?: boolean; color: string }
  | { op: 'image'; x: number; y: number; w: number; h: number; photoId: string; mode: 'photo' | 'plan' | 'logo' }
  | { op: 'rect'; x: number; y: number; w: number; h: number; fill: string };

export type PageLayout = { kind: 'content'; ops: Op[] } | { kind: 'annex'; pages: 'all' | number[] };

const LINE = 1.35;
const GAP = 10;

interface Segment extends TextStyle {
  text: string;
  underline?: boolean;
  color: string;
}

class Layout {
  readonly pages: PageLayout[] = [];
  private ops: Op[] = [];
  private y = 0;
  private fresh = true;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;

  constructor(private readonly o: LayoutOptions) {
    this.top = o.margins.top + (o.hasLogo ? o.headerHeight : 0);
    this.bottom = o.pageHeight - o.margins.bottom;
    this.left = o.margins.left;
    this.width = o.pageWidth - o.margins.left - o.margins.right;
  }

  get contentHeight(): number {
    return this.bottom - this.top;
  }

  get remaining(): number {
    return this.bottom - this.y;
  }

  get atTop(): boolean {
    return this.fresh;
  }

  newPage(): void {
    this.ops = [];
    this.pages.push({ kind: 'content', ops: this.ops });
    this.y = this.top;
    this.fresh = true;
    if (this.o.hasLogo) {
      const logo = this.o.logoSize ?? { width: 1, height: 1 };
      const h = this.o.headerHeight * 0.75;
      const w = Math.min(this.width / 2, (h * logo.width) / logo.height);
      this.ops.push({ op: 'image', x: this.left, y: this.o.margins.top, w, h: (w * logo.height) / logo.width, photoId: '__logo', mode: 'logo' });
    }
  }

  ensure(height: number): void {
    if (!this.pages.length || this.pages.at(-1)!.kind !== 'content') this.newPage();
    else if (height > this.remaining && !this.fresh) this.newPage();
  }

  push(op: Op): void {
    this.ops.push(op);
    this.fresh = false;
  }

  advance(dy: number): void {
    this.y += dy;
    if (dy > 0 && !this.fresh) return;
    this.fresh = this.fresh && dy <= 0;
  }

  cursor(): number {
    return this.y;
  }

  setCursor(y: number): void {
    this.y = y;
  }

  annex(pages: 'all' | number[]): void {
    this.pages.push({ kind: 'annex', pages });
  }

  // ---- texte ----------------------------------------------------------------------

  /** Découpe des segments en lignes de largeur max. */
  wrap(segments: Segment[], size: number, maxWidth: number): Segment[][] {
    const lines: Segment[][] = [];
    let line: Segment[] = [];
    let width = 0;
    const measure = (s: Segment) => this.o.measure(s.text, s, size);
    const append = (s: Segment) => {
      const last = line.at(-1);
      if (last && last.bold === s.bold && last.italic === s.italic && last.underline === s.underline && last.color === s.color) {
        last.text += s.text;
      } else {
        line.push({ ...s });
      }
      width += measure(s);
    };
    const flush = () => {
      const last = line.at(-1);
      if (last) last.text = last.text.replace(/\s+$/, '');
      lines.push(line.filter((s) => s.text));
      line = [];
      width = 0;
    };
    for (const seg of segments) {
      for (const part of seg.text.split(/(\n|\s+)/)) {
        if (!part) continue;
        if (part === '\n') {
          flush();
          continue;
        }
        const token = { ...seg, text: part };
        if (/^\s+$/.test(part)) {
          if (line.length) append({ ...token, text: ' ' });
          continue;
        }
        let w = measure(token);
        if (width + w > maxWidth && line.length) {
          flush();
        }
        // mot plus long que la ligne : coupé
        while (w > maxWidth) {
          let n = part.length;
          let piece = token.text;
          while (n > 1 && this.o.measure(piece.slice(0, n), token, size) > maxWidth - width) n--;
          append({ ...token, text: piece.slice(0, n) });
          flush();
          token.text = piece.slice(n);
          piece = token.text;
          w = measure(token);
        }
        if (token.text) append(token);
      }
    }
    if (line.length) flush();
    return lines.length ? lines : [[]];
  }

  /** Écrit des lignes à partir du curseur, avec saut de page entre les lignes si besoin. */
  writeLines(lines: Segment[][], size: number, x: number, maxWidth: number, align: 'left' | 'center' | 'right' = 'left', bullet = false): void {
    const lh = size * LINE;
    lines.forEach((line, index) => {
      this.ensure(lh);
      const lineWidth = line.reduce((sum, s) => sum + this.o.measure(s.text, s, size), 0);
      let cx = align === 'center' ? x + (maxWidth - lineWidth) / 2 : align === 'right' ? x + maxWidth - lineWidth : x;
      const baseline = this.y + size;
      if (bullet && index === 0) {
        this.push({ op: 'text', x: x - 10, y: baseline, text: '•', size, color: this.o.colors.text });
      }
      for (const s of line) {
        this.push({ op: 'text', x: cx, y: baseline, text: s.text, size, bold: s.bold, italic: s.italic, underline: s.underline, color: s.color });
        cx += this.o.measure(s.text, s, size);
      }
      this.y += lh;
    });
  }
}

function segments(runs: Run[], base: Partial<Segment>, colors: LayoutOptions['colors']): Segment[] {
  return runs.map((r) => ({
    text: r.text,
    bold: r.bold ?? base.bold,
    italic: r.italic ?? base.italic,
    underline: r.underline ?? base.underline,
    color: r.revised ? colors.revision : r.color ?? base.color ?? colors.text,
  }));
}

function styleOf(style: ParagraphStyle | undefined, o: LayoutOptions): { size: number; base: Partial<Segment> } {
  switch (style) {
    case 'caption':
      return { size: o.fontSize - 1.5, base: { italic: true, color: o.colors.caption } };
    case 'firm':
      return { size: o.fontSize - 1.5, base: {} };
    case 'note':
      return { size: o.fontSize - 0.5, base: {} };
    default:
      return { size: o.fontSize, base: {} };
  }
}

function headingStyle(level: 0 | 1 | 2 | 3, o: LayoutOptions): { size: number; base: Partial<Segment> } {
  const color = o.colors.heading;
  switch (level) {
    case 0: return { size: o.fontSize + 6, base: { bold: true, underline: true, color } };
    case 1: return { size: o.fontSize + 3, base: { bold: true, italic: true, underline: true, color } };
    case 2: return { size: o.fontSize + 1, base: { bold: true, underline: true, color } };
    default: return { size: o.fontSize, base: { bold: true, color } };
  }
}

function photoCaption(p: ReportPhoto): string {
  const kind = p.kind === 'photo' ? 'Photo' : p.kind === 'plan' ? 'Plan' : 'Croquis';
  return `${kind} ${p.number}${p.caption ? ` — ${p.caption}` : ''}`;
}

function layoutPhotos(l: Layout, photos: ReportPhoto[], o: LayoutOptions): void {
  const cols = Math.max(1, o.photoColumns);
  const cellW = (l.width - GAP * (cols - 1)) / cols;
  const capSize = o.fontSize - 1.5;
  const capLH = capSize * LINE;
  for (let i = 0; i < photos.length; i += cols) {
    const row = photos.slice(i, i + cols).map((p) => {
      const size = o.imageSize(p.photoId);
      let w = cellW;
      let h = (cellW * size.height) / size.width;
      const maxH = l.contentHeight * 0.45;
      if (h > maxH) {
        h = maxH;
        w = (h * size.width) / size.height;
      }
      const captionSegs: Segment[] = [{ text: photoCaption(p), italic: true, color: o.colors.caption }];
      if (p.ref) captionSegs.push({ text: `\n(${p.ref})`, italic: true, color: o.colors.caption });
      const lines = l.wrap(captionSegs, capSize, cellW);
      return { p, w, h, lines, height: h + 4 + lines.length * capLH };
    });
    const rowH = Math.max(...row.map((c) => c.height));
    l.ensure(rowH + GAP);
    const top = l.cursor();
    row.forEach((cell, col) => {
      const x = l.left + col * (cellW + GAP);
      l.push({ op: 'image', x: x + (cellW - cell.w) / 2, y: top, w: cell.w, h: cell.h, photoId: cell.p.photoId, mode: 'photo' });
      l.setCursor(top + cell.h + 4);
      l.writeLines(cell.lines, capSize, x, cellW, 'center');
    });
    l.setCursor(top + rowH + GAP);
  }
}

function layoutPlan(l: Layout, photo: ReportPhoto, legend: LegendEntry[], o: LayoutOptions): void {
  const size = o.imageSize(photo.photoId);
  const capSize = o.fontSize - 1.5;
  const capLH = capSize * LINE;
  const captionLines = l.wrap([{ text: photoCaption(photo), italic: true, color: o.colors.caption }], capSize, l.width);
  const legendLines = legend.map((e) => l.wrap([{ text: e.label, color: o.colors.text }], capSize, l.width - 16));
  const textH = 4 + captionLines.length * capLH + legendLines.reduce((s, ls) => s + ls.length * capLH, 0) + GAP;
  let w = l.width;
  let h = (w * size.height) / size.width;
  if (h + textH > l.contentHeight) {
    h = l.contentHeight - textH;
    w = (h * size.width) / size.height;
  }
  l.ensure(h + textH);
  const top = l.cursor();
  l.push({ op: 'image', x: l.left + (l.width - w) / 2, y: top, w, h, photoId: photo.photoId, mode: 'plan' });
  l.setCursor(top + h + 4);
  l.writeLines(captionLines, capSize, l.left, l.width, 'center');
  legend.forEach((entry, i) => {
    const y = l.cursor();
    l.push({ op: 'rect', x: l.left, y: y + capSize * 0.2, w: capSize * 0.9, h: capSize * 0.9, fill: entry.color });
    l.writeLines(legendLines[i], capSize, l.left + 16, l.width - 16);
  });
  l.advance(GAP);
}

export function layoutReport(blocks: Block[], o: LayoutOptions): PageLayout[] {
  const l = new Layout(o);
  blocks.forEach((block, index) => {
    switch (block.type) {
      case 'pageBreak':
        if (!l.atTop) l.newPage();
        break;
      case 'spacer':
        l.ensure(0);
        if (!l.atTop) l.setCursor(Math.min(l.bottom, l.cursor() + block.lines * o.fontSize * LINE));
        break;
      case 'heading': {
        const { size, base } = headingStyle(block.level, o);
        l.ensure(0);
        if (block.pageBreakBefore && !l.atTop) l.newPage();
        if (!l.atTop) l.setCursor(l.cursor() + o.fontSize * 0.9);
        const lines = l.wrap(segments(block.runs, base, o.colors), size, l.width);
        // garder le titre avec au moins deux lignes de ce qui suit
        const next = blocks[index + 1];
        const keep = next?.type === 'photos' || next?.type === 'plan' ? l.contentHeight * 0.3 : 2 * o.fontSize * LINE;
        if (lines.length * size * LINE + keep > l.remaining && !l.atTop) l.newPage();
        l.writeLines(lines, size, l.left, l.width, block.align ?? (block.level === 0 ? 'center' : 'left'));
        l.setCursor(l.cursor() + o.fontSize * 0.35);
        break;
      }
      case 'paragraph': {
        const { size, base } = styleOf(block.style, o);
        const indent = (block.indent ?? 0) + (block.bullet ? 14 : 0);
        const lines = l.wrap(segments(block.runs, base, o.colors), size, l.width - indent);
        l.writeLines(lines, size, l.left + indent, l.width - indent, block.align ?? 'left', block.bullet);
        l.setCursor(l.cursor() + size * 0.4);
        break;
      }
      case 'photos':
        layoutPhotos(l, block.photos, o);
        break;
      case 'plan':
        layoutPlan(l, block.photo, block.legend, o);
        break;
      case 'annex':
        l.annex(block.pages);
        break;
    }
  });
  if (!l.pages.length) l.newPage();
  return l.pages;
}
