import { arrowHead, bounds, Point, Shape } from './shapes';

export interface RenderOptions {
  selectedId?: string | null;
}

const FONT = '-apple-system, "Helvetica Neue", Arial, sans-serif';

/**
 * Dessine les annotations sur un canvas de `width` × `height` pixels (l'image entière).
 * Même rendu à l'écran, pour les vignettes et pour l'aplatissement du rapport.
 */
export function renderShapes(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Shape[],
  width: number,
  height: number,
  options: RenderOptions = {},
): void {
  const px = (x: number) => x * width;
  const py = (y: number) => y * height;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    switch (s.kind) {
      case 'arrow': {
        const lw = Math.max(1, s.width * width);
        const [x1, y1, x2, y2] = [px(s.x1), py(s.y1), px(s.x2), py(s.y2)];
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const [a, b] = arrowHead(x1, y1, x2, y2, Math.max(lw * 4.5, 10));
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(x2, y2);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        break;
      }
      case 'rect':
        ctx.lineWidth = Math.max(1, s.width * width);
        ctx.strokeRect(px(s.x), py(s.y), s.w * width, s.h * height);
        break;
      case 'ellipse':
        ctx.lineWidth = Math.max(1, s.width * width);
        ctx.beginPath();
        ctx.ellipse(px(s.cx), py(s.cy), Math.abs(s.rx * width), Math.abs(s.ry * height), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'free':
        ctx.lineWidth = Math.max(1, s.width * width);
        smoothPath(ctx, s.points.map(([x, y]) => [px(x), py(y)] as Point));
        ctx.stroke();
        break;
      case 'zone':
        drawZone(ctx, s.points.map(([x, y]) => [px(x), py(y)] as Point), s.fill, width);
        break;
      case 'text': {
        const size = Math.max(8, s.size * width);
        ctx.font = `700 ${size}px ${FONT}`;
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = Math.max(2, size / 6);
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(s.text, px(s.x), py(s.y));
        ctx.fillText(s.text, px(s.x), py(s.y));
        break;
      }
      case 'badge': {
        const r = Math.max(6, s.size * width);
        const [cx, cy] = [px(s.x), py(s.y)];
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, r / 7);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 ${r * (s.n > 99 ? 0.8 : 1.1)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.n), cx, cy + r * 0.05);
        ctx.textAlign = 'start';
        break;
      }
    }
  }
  const selected = options.selectedId ? shapes.find((s) => s.id === options.selectedId) : undefined;
  if (selected) drawSelection(ctx, selected, width, height);
  ctx.restore();
}

/** Tracé lissé (courbes passant par les milieux). */
function smoothPath(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  if (points.length === 0) return;
  ctx.moveTo(points[0][0], points[0][1]);
  if (points.length < 3) {
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    if (points.length === 1) ctx.lineTo(points[0][0] + 0.1, points[0][1]);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    ctx.quadraticCurveTo(points[i][0], points[i][1], mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function drawZone(ctx: CanvasRenderingContext2D, points: Point[], fill: 'hatch' | 'tint', width: number): void {
  if (points.length < 2) return;
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
  };
  ctx.save();
  if (fill === 'tint') {
    outline();
    ctx.globalAlpha = 0.3;
    ctx.fill();
  } else {
    outline();
    ctx.clip();
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const step = Math.max(6, width * 0.012);
    ctx.lineWidth = Math.max(1, width * 0.002);
    ctx.beginPath();
    for (let d = minX - (maxY - minY); d < maxX; d += step) {
      ctx.moveTo(d, maxY);
      ctx.lineTo(d + (maxY - minY), minY);
    }
    ctx.stroke();
  }
  ctx.restore();
  outline();
  ctx.lineWidth = Math.max(1, width * 0.003);
  ctx.stroke();
}

function drawSelection(ctx: CanvasRenderingContext2D, shape: Shape, width: number, height: number): void {
  const b = bounds(shape);
  const pad = Math.max(8, width * 0.012);
  ctx.save();
  ctx.setLineDash([pad, pad * 0.6]);
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.strokeStyle = '#ff9e1b';
  ctx.strokeRect(b.x * width - pad, b.y * height - pad, b.w * width + 2 * pad, b.h * height + 2 * pad);
  ctx.restore();
}
