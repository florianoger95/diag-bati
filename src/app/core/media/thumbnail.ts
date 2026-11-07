import { renderShapes } from '../annotation/render-shapes';
import { Shape } from '../annotation/shapes';
import { canvasToJpeg } from './image-compress';

/** Vignette avec ses annotations (croquis, plans et photos annotés reconnaissables dans les fiches). */
export async function annotatedThumb(thumb: Blob, shapes: readonly Shape[]): Promise<Blob> {
  const bitmap = await createImageBitmap(thumb);
  try {
    return await canvasToJpeg(bitmap.width, bitmap.height, 0.8, (ctx) => {
      ctx.drawImage(bitmap, 0, 0);
      renderShapes(ctx, shapes, bitmap.width, bitmap.height);
    });
  } finally {
    bitmap.close();
  }
}
