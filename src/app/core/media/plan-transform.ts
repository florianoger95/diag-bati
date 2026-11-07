// Pivoter / recadrer un plan à l'import, avant toute annotation : l'image (annotation, Word)
// et la page PDF vectorielle (rapport PDF) subissent exactement la même transformation.
import { degrees, PDFDocument } from 'pdf-lib';
import { canvasToJpeg, CompressedImage, fitSize } from './image-compress';

export type Rotation = 90 | 180 | 270;
/** Rotation dans le sens horaire, ou recadrage (coordonnées 0–1 de l'image affichée). */
export type PlanTransform = { rotate: Rotation } | { crop: { x: number; y: number; w: number; h: number } };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export async function transformRaster(image: Blob, t: PlanTransform, quality = 0.9): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(image);
  try {
    const W = bitmap.width;
    const H = bitmap.height;
    let width: number;
    let height: number;
    let draw: (ctx: CanvasRenderingContext2D) => void;
    if ('rotate' in t) {
      const quarter = t.rotate !== 180;
      width = quarter ? H : W;
      height = quarter ? W : H;
      draw = (ctx) => {
        ctx.translate(width / 2, height / 2);
        ctx.rotate((t.rotate * Math.PI) / 180);
        ctx.drawImage(bitmap, -W / 2, -H / 2);
      };
    } else {
      const sx = Math.round(clamp01(t.crop.x) * W);
      const sy = Math.round(clamp01(t.crop.y) * H);
      width = Math.max(1, Math.round(clamp01(t.crop.w) * W));
      height = Math.max(1, Math.round(clamp01(t.crop.h) * H));
      draw = (ctx) => ctx.drawImage(bitmap, sx, sy, width, height, 0, 0, width, height);
    }
    const out = await canvasToJpeg(width, height, quality, draw);
    const ts = fitSize(width, height, 320);
    const thumbBitmap = await createImageBitmap(out);
    const thumb = await canvasToJpeg(ts.width, ts.height, 0.7, (ctx) => ctx.drawImage(thumbBitmap, 0, 0, ts.width, ts.height));
    thumbBitmap.close();
    return { image: out, thumb, width, height };
  } finally {
    bitmap.close();
  }
}

/** Même transformation sur une page PDF (vectorielle) ; renvoie un nouveau PDF d'une page. */
export async function transformVector(pdf: Uint8Array, t: PlanTransform): Promise<Uint8Array> {
  const source = await PDFDocument.load(pdf);
  const page = source.getPage(0);
  const { width: W, height: H } = page.getSize();
  const out = await PDFDocument.create();
  if ('rotate' in t) {
    const embedded = await out.embedPage(page);
    const quarter = t.rotate !== 180;
    const target = out.addPage(quarter ? [H, W] : [W, H]);
    // rotation pdf-lib : sens trigonométrique autour du point (x, y)
    if (t.rotate === 90) target.drawPage(embedded, { x: 0, y: W, rotate: degrees(-90) });
    else if (t.rotate === 180) target.drawPage(embedded, { x: W, y: H, rotate: degrees(180) });
    else target.drawPage(embedded, { x: H, y: 0, rotate: degrees(90) });
  } else {
    const { x, y, w, h } = t.crop;
    const box = { left: clamp01(x) * W, right: clamp01(x + w) * W, top: (1 - clamp01(y)) * H, bottom: (1 - clamp01(y + h)) * H };
    const embedded = await out.embedPage(page, box);
    out.addPage([box.right - box.left, box.top - box.bottom]).drawPage(embedded, { x: 0, y: 0 });
  }
  return out.save();
}

/**
 * Une page qui porte /Rotate s'affiche tournée (pdf.js) mais serait posée à plat dans le rapport :
 * on applique la rotation au contenu pour que les deux coïncident.
 */
export async function normalizeRotation(pdf: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  if (!angle) return pdf;
  page.setRotation(degrees(0));
  return transformVector(await doc.save(), { rotate: angle as Rotation });
}
