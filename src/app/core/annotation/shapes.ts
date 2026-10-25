// Annotations vectorielles d'une photo ou d'un plan (docs/SPEC.md §5).
// Coordonnées normalisées 0–1 par rapport à l'image ; épaisseurs et tailles en fraction de sa largeur.

export type Point = [number, number];

interface Base {
  id: string;
  color: string;
}

export interface ArrowShape extends Base { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; width: number }
export interface RectShape extends Base { kind: 'rect'; x: number; y: number; w: number; h: number; width: number }
export interface EllipseShape extends Base { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; width: number }
export interface FreeShape extends Base { kind: 'free'; points: Point[]; width: number }
export interface ZoneShape extends Base { kind: 'zone'; points: Point[]; fill: 'hatch' | 'tint' }
export interface TextShape extends Base { kind: 'text'; x: number; y: number; text: string; size: number }
export interface BadgeShape extends Base { kind: 'badge'; x: number; y: number; n: number; size: number; photoId?: string }

export type Shape = ArrowShape | RectShape | EllipseShape | FreeShape | ZoneShape | TextShape | BadgeShape;
export type ShapeKind = Shape['kind'];

/** Épaisseurs proposées (fraction de la largeur de l'image). */
export const STROKE_WIDTHS = { fin: 0.004, moyen: 0.007, epais: 0.012 } as const;
/** Tailles de texte et de pastille. */
export const TEXT_SIZES = { petit: 0.025, moyen: 0.035, grand: 0.05 } as const;

/** Couleurs de départ, à fort contraste. La couleur reste libre (sélecteur). */
export const DEFAULT_COLORS = ['#e00000', '#ffd400', '#00a650', '#0070c0', '#7030a0', '#ffffff', '#000000'];

/** Catégories de la légende du mémo, proposées pour nommer une couleur. */
export const LEGEND_SUGGESTIONS = [
  "Présence d'eau liquide",
  "Présence d'humidité",
  'Présence de végétation',
  'Présence de fissure structurelle',
  'Présence de fissure, de décollement superficiel',
  "Présence de moisissures, champignons, marques d'insectes lignivores",
  'Sondage à réaliser',
  'Témoin de fissure',
];

/** Rectangle englobant (normalisé) d'une forme, pour la sélection et le déplacement. */
export function bounds(s: Shape): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case 'arrow':
      return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
    case 'rect':
      return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
    case 'ellipse':
      return { x: s.cx - s.rx, y: s.cy - s.ry, w: 2 * s.rx, h: 2 * s.ry };
    case 'free':
    case 'zone': {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'text':
      return { x: s.x, y: s.y - s.size, w: s.text.length * s.size * 0.6, h: s.size * 1.2 };
    case 'badge':
      return { x: s.x - s.size, y: s.y - s.size, w: 2 * s.size, h: 2 * s.size };
  }
}

/** Déplace une forme (nouvel objet). */
export function translate(s: Shape, dx: number, dy: number): Shape {
  switch (s.kind) {
    case 'arrow':
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    case 'rect':
      return { ...s, x: s.x + dx, y: s.y + dy };
    case 'ellipse':
      return { ...s, cx: s.cx + dx, cy: s.cy + dy };
    case 'free':
    case 'zone':
      return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy] as Point) };
    case 'text':
    case 'badge':
      return { ...s, x: s.x + dx, y: s.y + dy };
  }
}

/** Forme touchée au point (x, y) normalisé, la plus récente d'abord. `tolerance` en fraction de largeur. */
export function hitTest(shapes: Shape[], x: number, y: number, tolerance = 0.02, aspect = 1): Shape | undefined {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const b = bounds(shapes[i]);
    const ty = tolerance * aspect;
    if (x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - ty && y <= b.y + b.h + ty) return shapes[i];
  }
  return undefined;
}

/** Simplifie un tracé à main levée (Ramer–Douglas–Peucker). */
export function simplify(points: Point[], epsilon = 0.0015): Point[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1e-9;
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= epsilon) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, index + 1), epsilon);
  return [...left.slice(0, -1), ...simplify(points.slice(index), epsilon)];
}

/** Pointe de flèche : les deux extrémités de la tête, en pixels. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): [Point, Point] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
    [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)],
  ];
}

/** Couleurs utilisées dans un ensemble d'annotations (pour imprimer la légende). */
export function usedColors(shapes: Shape[]): string[] {
  return [...new Set(shapes.map((s) => s.color.toLowerCase()))];
}
