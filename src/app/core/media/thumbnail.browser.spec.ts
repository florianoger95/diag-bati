import { describe, expect, it } from 'vitest';
import { blankSketch } from './image-compress';
import { annotatedThumb } from './thumbnail';

async function pixel(blob: Blob, x: number, y: number): Promise<number[]> {
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
  bitmap.close();
  return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

describe('annotatedThumb', () => {
  it('dessine les annotations d’un croquis sur sa vignette blanche', async () => {
    const sketch = await blankSketch();
    const thumb = await annotatedThumb(sketch.thumb, [
      { id: 'r', kind: 'rect', x: 0.1, y: 0.1, w: 0.8, h: 0.8, color: '#ff0000', width: 0.02 },
    ]);
    const bitmap = await createImageBitmap(thumb);
    expect([bitmap.width, bitmap.height]).toEqual([320, 226]);
    bitmap.close();
    const [r, g, b] = await pixel(thumb, 32, 113); // bord gauche du rectangle (x = 0,1)
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
    const centre = await pixel(thumb, 160, 113);
    expect(centre.every((v) => v > 240)).toBe(true);
  });
});
