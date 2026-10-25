// Images du rapport : photos aplaties avec leurs annotations, calque d'annotations des plans vectoriels.
// Une image à la fois, canvas libérés après usage (mémoire de l'iPad).
import { renderShapes } from '../annotation/render-shapes';
import { Shape } from '../annotation/shapes';
import { fitSize } from '../media/image-compress';

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage de l’image impossible.'))), type, quality),
  );
}

async function withCanvas<T>(width: number, height: number, use: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => Promise<T>): Promise<T> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponible (mémoire insuffisante ?).');
    return await use(ctx, canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Image + annotations, réduite au côté long demandé, en JPEG. */
export async function flattenImage(
  image: Blob, annotations: readonly Shape[], maxLongSide: number, quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(image);
  try {
    const size = fitSize(bitmap.width, bitmap.height, maxLongSide);
    const blob = await withCanvas(size.width, size.height, async (ctx, canvas) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      renderShapes(ctx, annotations, size.width, size.height);
      return toBlob(canvas, 'image/jpeg', quality);
    });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ...size };
  } finally {
    bitmap.close();
  }
}

/** Calque transparent des annotations (posé sur un plan vectoriel). */
export async function annotationOverlay(annotations: readonly Shape[], width: number, height: number): Promise<Uint8Array> {
  const blob = await withCanvas(width, height, async (ctx, canvas) => {
    renderShapes(ctx, annotations, width, height);
    return toBlob(canvas, 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}
