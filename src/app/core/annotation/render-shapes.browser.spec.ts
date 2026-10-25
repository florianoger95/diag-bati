import { describe, expect, it } from 'vitest';
import { renderShapes } from './render-shapes';
import { Shape } from './shapes';

function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  return ctx;
}

function pixel(ctx: CanvasRenderingContext2D, x: number, y: number): [number, number, number] {
  const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return [d[0], d[1], d[2]];
}

const isRed = ([r, g, b]: number[]) => r > 180 && g < 80 && b < 80;
const isWhite = ([r, g, b]: number[]) => r > 240 && g > 240 && b > 240;

describe('renderShapes', () => {
  it('trace un rectangle : contour coloré, intérieur vide', () => {
    const ctx = canvas(200, 100);
    const shape: Shape = { id: 'r', kind: 'rect', x: 0.25, y: 0.2, w: 0.5, h: 0.6, color: '#ff0000', width: 0.02 };
    renderShapes(ctx, [shape], 200, 100);
    expect(isRed(pixel(ctx, 50, 50))).toBe(true); // bord gauche (x = 0,25 × 200)
    expect(isWhite(pixel(ctx, 100, 50))).toBe(true); // centre
  });

  it('dessine aux mêmes positions relatives quelle que soit la taille (écran ou PDF)', () => {
    const shape: Shape = { id: 'r', kind: 'rect', x: 0.25, y: 0.2, w: 0.5, h: 0.6, color: '#ff0000', width: 0.02 };
    const big = canvas(800, 400);
    renderShapes(big, [shape], 800, 400);
    expect(isRed(pixel(big, 200, 200))).toBe(true);
    expect(isWhite(pixel(big, 400, 200))).toBe(true);
  });

  it('trace une flèche avec sa pointe', () => {
    const ctx = canvas(200, 200);
    const shape: Shape = { id: 'a', kind: 'arrow', x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5, color: '#ff0000', width: 0.02 };
    renderShapes(ctx, [shape], 200, 200);
    expect(isRed(pixel(ctx, 100, 100))).toBe(true);
    // branche haute de la pointe : de (163,8 ; 92,2) vers l'extrémité (180 ; 100)
    expect(isRed(pixel(ctx, 166, 93))).toBe(true);
    expect(isWhite(pixel(ctx, 100, 85))).toBe(true);
  });

  it('remplit une zone teintée en transparence et une zone hachurée par des traits', () => {
    const tint = canvas(100, 100);
    const zone: Shape = { id: 'z', kind: 'zone', points: [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], color: '#ff0000', fill: 'tint' };
    renderShapes(tint, [zone], 100, 100);
    const [r, g] = pixel(tint, 50, 50);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(80); // rouge clair : transparence
    expect(g).toBeLessThan(230);

    const hatch = canvas(100, 100);
    renderShapes(hatch, [{ ...zone, fill: 'hatch' } as Shape], 100, 100);
    let red = 0;
    let white = 0;
    for (let x = 20; x < 80; x++) {
      const p = pixel(hatch, x, 50);
      if (isRed(p)) red++;
      else if (isWhite(p)) white++;
    }
    expect(red).toBeGreaterThan(3);
    expect(white).toBeGreaterThan(10);
    // rien hors de la zone
    expect(isWhite(pixel(hatch, 3, 3))).toBe(true);
  });

  it('dessine une pastille pleine avec son numéro en blanc', () => {
    const ctx = canvas(200, 200);
    const shape: Shape = { id: 'b', kind: 'badge', x: 0.5, y: 0.5, n: 7, size: 0.1, color: '#ff0000' };
    renderShapes(ctx, [shape], 200, 200);
    expect(isRed(pixel(ctx, 100 - 15, 100 - 5))).toBe(true);
    let whiteInside = 0;
    for (let x = 92; x < 108; x++) for (let y = 92; y < 108; y++) if (isWhite(pixel(ctx, x, y))) whiteInside++;
    expect(whiteInside).toBeGreaterThan(5);
  });

  it('écrit un texte avec un liseré blanc lisible sur photo sombre', () => {
    const ctx = canvas(300, 100);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 300, 100);
    const shape: Shape = { id: 't', kind: 'text', x: 0.05, y: 0.7, text: 'Fissure', size: 0.12, color: '#ff0000' };
    renderShapes(ctx, [shape], 300, 100);
    let red = 0;
    let white = 0;
    for (let x = 10; x < 150; x++) for (let y = 30; y < 75; y++) {
      const p = pixel(ctx, x, y);
      if (isRed(p)) red++;
      if (isWhite(p)) white++;
    }
    expect(red).toBeGreaterThan(50);
    expect(white).toBeGreaterThan(20);
  });

  it('met en évidence la forme sélectionnée', () => {
    const ctx = canvas(200, 100);
    const shape: Shape = { id: 'r', kind: 'rect', x: 0.25, y: 0.25, w: 0.5, h: 0.5, color: '#000000', width: 0.01 };
    renderShapes(ctx, [shape], 200, 100, { selectedId: 'r' });
    // cadre de sélection pointillé à 8 px autour du rectangle (bord haut : y = 25 − 8)
    let colored = 0;
    for (let x = 30; x < 170; x++) {
      const [r, g, b] = pixel(ctx, x, 17);
      if (!(r > 240 && g > 240 && b > 240)) colored++;
    }
    expect(colored).toBeGreaterThan(20);
  });
});
