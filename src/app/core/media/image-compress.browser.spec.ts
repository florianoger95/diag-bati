import { describe, expect, it } from 'vitest';
import { blankSketch, compressImage, PHOTO_OPTIONS, PLAN_OPTIONS } from './image-compress';

/** Image de test (PNG), avec du bruit pour qu'elle pèse lourd comme une vraie photo. */
async function makeImage(width: number, height: number, noisy = false): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#c33');
  gradient.addColorStop(1, '#36c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  if (noisy) {
    const data = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < data.data.length; i += 4) data.data[i + 1] = Math.random() * 255;
    ctx.putImageData(data, 0, 0);
  }
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  canvas.width = canvas.height = 0;
  return blob;
}

async function dimensions(blob: Blob): Promise<[number, number]> {
  const bitmap = await createImageBitmap(blob);
  const size: [number, number] = [bitmap.width, bitmap.height];
  bitmap.close();
  return size;
}

describe('compressImage', () => {
  it('réduit une photo paysage à 1600 px en JPEG, avec une vignette de 320 px', async () => {
    const result = await compressImage(await makeImage(4000, 3000), PHOTO_OPTIONS);
    expect(result.image.type).toBe('image/jpeg');
    expect([result.width, result.height]).toEqual([1600, 1200]);
    expect(await dimensions(result.image)).toEqual([1600, 1200]);
    expect(await dimensions(result.thumb)).toEqual([320, 240]);
  });

  it('respecte une photo portrait', async () => {
    const result = await compressImage(await makeImage(3000, 4000), PHOTO_OPTIONS);
    expect([result.width, result.height]).toEqual([1200, 1600]);
  });

  it('n’agrandit pas une petite image', async () => {
    const result = await compressImage(await makeImage(800, 600), PHOTO_OPTIONS);
    expect(await dimensions(result.image)).toEqual([800, 600]);
  });

  it('produit un fichier plus léger que l’original', async () => {
    const source = await makeImage(2400, 1800, true);
    const result = await compressImage(source, PHOTO_OPTIONS);
    expect(result.image.size).toBeLessThan(source.size);
  });

  it('garde les plans à 2400 px', async () => {
    const result = await compressImage(await makeImage(4800, 3400), PLAN_OPTIONS);
    expect(result.width).toBe(2400);
  });

  it('refuse proprement un fichier qui n’est pas une image', async () => {
    await expect(compressImage(new Blob(['pas une image'], { type: 'image/jpeg' }), PHOTO_OPTIONS)).rejects.toThrow(/image/i);
  });
});

describe('blankSketch', () => {
  it('crée un fond blanc A4 paysage de 2400 px', async () => {
    const sketch = await blankSketch();
    expect([sketch.width, sketch.height]).toEqual([2400, 1697]);
    const bitmap = await createImageBitmap(sketch.image);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 1000, 800, 1, 1, 0, 0, 1, 1);
    expect([...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].every((v) => v > 250)).toBe(true);
    bitmap.close();
  });
});
