import { describe, expect, it } from 'vitest';
import { AnnotationHistory } from './history';
import {
  arrowHead, bounds, duplicate, hitTest, linkedNumbersKey, locatedPhotoIds, locatePhoto, nextBadge, Point, Shape, simplify, translate, usedColors, withPhotoNumbers,
} from './shapes';

const rect: Shape = { id: 'r', kind: 'rect', x: 0.1, y: 0.2, w: 0.3, h: 0.1, color: '#E00000', width: 0.005 };
const badge: Shape = { id: 'b', kind: 'badge', x: 0.8, y: 0.8, n: 3, size: 0.03, color: '#0070c0' };

describe('géométrie des formes', () => {
  it('calcule le rectangle englobant, y compris tracé vers la gauche', () => {
    expect(bounds(rect)).toEqual({ x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
    const reversed: Shape = { ...rect, x: 0.4, w: -0.3 } as Shape;
    expect(bounds(reversed).x).toBeCloseTo(0.1);
    const arrow: Shape = { id: 'a', kind: 'arrow', x1: 0.5, y1: 0.5, x2: 0.2, y2: 0.1, color: '#000', width: 0.005 };
    expect(bounds(arrow)).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.4 });
  });

  it('déplace une forme sans modifier l’original', () => {
    const moved = translate(rect, 0.1, -0.1);
    expect(moved).toMatchObject({ x: 0.2, y: 0.1 });
    expect(rect).toMatchObject({ x: 0.1, y: 0.2 });
    const free: Shape = { id: 'f', kind: 'free', points: [[0, 0], [0.1, 0.1]], color: '#000', width: 0.004 };
    expect((translate(free, 0.5, 0.5) as { points: Point[] }).points).toEqual([[0.5, 0.5], [0.6, 0.6]]);
  });

  it('trouve la forme touchée, la plus récente d’abord', () => {
    const over: Shape = { ...rect, id: 'r2' };
    expect(hitTest([rect, over], 0.2, 0.25)?.id).toBe('r2');
    expect(hitTest([rect, badge], 0.8, 0.8)?.id).toBe('b');
    expect(hitTest([rect, badge], 0.6, 0.6)).toBeUndefined();
  });

  it('simplifie un tracé à main levée en gardant les angles', () => {
    const line: Point[] = Array.from({ length: 50 }, (_, i) => [i / 100, 0.2] as Point);
    expect(simplify(line)).toEqual([[0, 0.2], [0.49, 0.2]]);
    const corner: Point[] = [[0, 0], [0.25, 0], [0.5, 0], [0.5, 0.25], [0.5, 0.5]];
    expect(simplify(corner)).toEqual([[0, 0], [0.5, 0], [0.5, 0.5]]);
  });

  it('place la pointe de flèche de part et d’autre de l’extrémité', () => {
    const [left, right] = arrowHead(0, 0, 100, 0, 20);
    expect(left[0]).toBeLessThan(100);
    expect(right[0]).toBeLessThan(100);
    expect(Math.sign(left[1])).toBe(-Math.sign(right[1]));
  });

  it('liste les couleurs utilisées sans doublon, en minuscules', () => {
    expect(usedColors([rect, badge, { ...rect, id: 'x', color: '#e00000' }])).toEqual(['#e00000', '#0070c0']);
  });
});

describe('trait, tampon, lettres, duplication', () => {
  const line: Shape = { id: 'l', kind: 'line', x1: 0.2, y1: 0.6, x2: 0.5, y2: 0.1, color: '#000', width: 0.004 };
  const stamp: Shape = { id: 's', kind: 'stamp', x: 0.5, y: 0.5, text: 'À SONDER', size: 0.03, color: '#e00000' };

  it('calcule le cadre et déplace un trait et un tampon', () => {
    expect(bounds(line)).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.5 });
    const moved = translate(line, 0.1, 0.1) as Extract<Shape, { kind: 'line' }>;
    expect([moved.x1, moved.y1, moved.x2, moved.y2].map((v) => +v.toFixed(6))).toEqual([0.3, 0.7, 0.6, 0.2]);
    const b = bounds(stamp);
    expect(b.x).toBeLessThan(0.5);
    expect(b.x + b.w).toBeGreaterThan(0.5);
    expect(translate(stamp, 0.1, 0)).toMatchObject({ x: 0.6, y: 0.5 });
    expect(hitTest([stamp], 0.5, 0.5)?.id).toBe('s');
  });

  it('propose le repère suivant : numéro ou lettre', () => {
    const shapes: Shape[] = [
      { id: 'a', kind: 'badge', x: 0, y: 0, n: 1, size: 0.03, color: '#000' },
      { id: 'b', kind: 'badge', x: 0, y: 0, n: 2, size: 0.03, color: '#000' },
      { id: 'c', kind: 'badge', x: 0, y: 0, n: 0, label: 'A', size: 0.03, color: '#000' },
      { id: 'd', kind: 'badge', x: 0, y: 0, n: 7, size: 0.03, color: '#000', photoId: 'p7' },
    ];
    expect(nextBadge(shapes, 'number')).toEqual({ n: 3 });
    expect(nextBadge(shapes, 'letter')).toEqual({ n: 0, label: 'B' });
    const az = Array.from({ length: 26 }, (_, i): Shape => ({ id: `x${i}`, kind: 'badge', x: 0, y: 0, n: 0, label: String.fromCharCode(65 + i), size: 0.03, color: '#000' }));
    expect(nextBadge(az, 'letter')).toEqual({ n: 0, label: 'AA' });
  });

  it('duplique une forme, décalée, avec un nouvel identifiant', () => {
    const copy = duplicate(line, 'l2');
    expect(copy).toMatchObject({ id: 'l2', kind: 'line', x1: 0.23, y1: 0.63 });
    expect(line.id).toBe('l');
  });

  it('situe une photo : la pastille reliée remplace la localisation précédente', () => {
    const shapes: Shape[] = [
      line,
      { id: 'old', kind: 'badge', x: 0.1, y: 0.1, n: 3, size: 0.03, color: '#000', photoId: 'p3' },
      { id: 'autre', kind: 'badge', x: 0.2, y: 0.2, n: 4, size: 0.03, color: '#000', photoId: 'p4' },
    ];
    const badge: Shape = { id: 'new', kind: 'badge', x: 0.5, y: 0.5, n: 3, size: 0.03, color: '#e00000', photoId: 'p3', dir: Math.PI / 2 };
    const out = locatePhoto(shapes, badge);
    expect(out.map((s) => s.id)).toEqual(['l', 'autre', 'new']);
    expect(locatedPhotoIds([{ annotations: out }, { annotations: [line] }])).toEqual(new Set(['p4', 'p3']));
  });

  it('les pastilles reliées à une photo prennent son numéro courant', () => {
    const shapes: Shape[] = [
      line,
      { id: 'a', kind: 'badge', x: 0, y: 0, n: 1, size: 0.03, color: '#000' },
      { id: 'd', kind: 'badge', x: 0, y: 0, n: 7, size: 0.03, color: '#000', photoId: 'p7' },
      { id: 'e', kind: 'badge', x: 0, y: 0, n: 9, size: 0.03, color: '#000', photoId: 'disparue' },
    ];
    const out = withPhotoNumbers(shapes, new Map([['p7', 2]]));
    expect(out.map((s) => (s.kind === 'badge' ? s.n : s.kind))).toEqual(['line', 1, 2, 9]);
    expect((shapes[2] as Extract<Shape, { kind: 'badge' }>).n).toBe(7); // original intact
    expect(linkedNumbersKey(shapes, new Map([['p7', 2]]))).toBe('p7:2,disparue:');
    // rien à changer : même tableau
    const plain = [line];
    expect(withPhotoNumbers(plain, new Map())).toBe(plain);
  });
});

describe('AnnotationHistory', () => {
  it('annule et rétablit', () => {
    const h = new AnnotationHistory([]);
    h.apply([rect]);
    h.apply([rect, badge]);
    expect(h.undo()).toEqual([rect]);
    expect(h.undo()).toEqual([]);
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toEqual([rect]);
    expect(h.canRedo).toBe(true);
  });

  it('une nouvelle action efface les rétablissements possibles', () => {
    const h = new AnnotationHistory([]);
    h.apply([rect]);
    h.undo();
    h.apply([badge]);
    expect(h.canRedo).toBe(false);
    expect(h.current).toEqual([badge]);
  });

  it('limite l’historique à 100 étapes', () => {
    const h = new AnnotationHistory([]);
    for (let i = 0; i < 150; i++) h.apply([{ ...rect, id: `r${i}` }]);
    let undos = 0;
    while (h.canUndo) {
      h.undo();
      undos++;
    }
    expect(undos).toBe(100);
  });
});
