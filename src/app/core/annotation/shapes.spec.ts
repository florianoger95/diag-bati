import { describe, expect, it } from 'vitest';
import { AnnotationHistory } from './history';
import { arrowHead, bounds, hitTest, Point, Shape, simplify, translate, usedColors } from './shapes';

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
