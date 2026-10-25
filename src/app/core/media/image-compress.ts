// Redimensionnement et compression immédiats des photos (docs/SPEC.md §5).
// Une image à la fois ; les canvas sont vidés et les bitmaps fermés après usage (mémoire de l'iPad).

export interface CompressOptions {
  maxLongSide: number;
  quality: number;
  thumbSize: number;
}

export const PHOTO_OPTIONS: CompressOptions = { maxLongSide: 1600, quality: 0.8, thumbSize: 320 };
export const PLAN_OPTIONS: CompressOptions = { maxLongSide: 2400, quality: 0.9, thumbSize: 320 };

export interface CompressedImage {
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export function fitSize(width: number, height: number, maxLongSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxLongSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

async function decode(source: Blob): Promise<{ drawable: Drawable; width: number; height: number; release: () => void }> {
  try {
    // l'orientation EXIF est appliquée par défaut (photos prises en portrait)
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    return { drawable: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Ce fichier n'est pas une image lisible.");
    }
    return {
      drawable: img, width: img.naturalWidth, height: img.naturalHeight,
      release: () => {
        URL.revokeObjectURL(url);
        img.src = '';
      },
    };
  }
}

/** Dessine dans un canvas temporaire et l'encode en JPEG, puis libère le canvas. */
export async function canvasToJpeg(
  width: number,
  height: number,
  quality: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible (mémoire insuffisante ?).');
    ctx.fillStyle = '#ffffff'; // fond blanc : le JPEG n'a pas de transparence
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    draw(ctx);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage JPEG impossible.'))), 'image/jpeg', quality),
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Réduit une image (côté long ≤ maxLongSide) en JPEG, avec sa vignette. L'original n'est pas conservé. */
export async function compressImage(source: Blob, options: CompressOptions): Promise<CompressedImage> {
  const decoded = await decode(source);
  try {
    const size = fitSize(decoded.width, decoded.height, options.maxLongSide);
    const thumbSize = fitSize(decoded.width, decoded.height, options.thumbSize);
    const image = await canvasToJpeg(size.width, size.height, options.quality, (ctx) =>
      ctx.drawImage(decoded.drawable, 0, 0, size.width, size.height),
    );
    const thumb = await canvasToJpeg(thumbSize.width, thumbSize.height, 0.7, (ctx) =>
      ctx.drawImage(decoded.drawable, 0, 0, thumbSize.width, thumbSize.height),
    );
    return { image, thumb, ...size };
  } finally {
    decoded.release();
  }
}

/** Fond de croquis : page blanche A4 paysage. */
export async function blankSketch(): Promise<CompressedImage> {
  const width = 2400;
  const height = 1697;
  const image = await canvasToJpeg(width, height, 0.9, () => undefined);
  const thumb = await canvasToJpeg(320, 226, 0.7, () => undefined);
  return { image, thumb, width, height };
}
