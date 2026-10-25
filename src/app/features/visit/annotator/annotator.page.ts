import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AnnotationHistory } from '../../../core/annotation/history';
import { renderShapes } from '../../../core/annotation/render-shapes';
import {
  DEFAULT_COLORS,
  hitTest,
  LEGEND_SUGGESTIONS,
  Point,
  Shape,
  ShapeKind,
  simplify,
  STROKE_WIDTHS,
  TEXT_SIZES,
  translate,
} from '../../../core/annotation/shapes';
import { Photo } from '../../../core/model/data';
import { DialogService } from '../../../core/services/dialog.service';
import { VisitStore } from '../visit-store';

export type Tool = 'select' | ShapeKind;

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'select', label: 'Sélectionner / déplacer', icon: '☝' },
  { id: 'arrow', label: 'Flèche', icon: '↗' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯' },
  { id: 'free', label: 'Trait libre', icon: '✎' },
  { id: 'zone', label: 'Zone', icon: '▨' },
  { id: 'text', label: 'Texte', icon: 'T' },
  { id: 'badge', label: 'Pastille numérotée', icon: '①' },
];

const MIN_SIZE = 0.01;
const SAVE_DELAY = 500;

/** Annotation plein écran d'une photo, d'un plan ou d'un croquis — au doigt. */
@Component({
  selector: 'app-annotator-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './annotator.page.html',
  styleUrl: './annotator.page.scss',
})
export class AnnotatorPage {
  readonly photoId = input.required<string>();
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly tools = TOOLS;
  readonly strokeWidths = Object.entries(STROKE_WIDTHS) as [string, number][];
  readonly textSizes = Object.entries(TEXT_SIZES) as [string, number][];

  readonly photo = computed<Photo | undefined>(() => this.store.photo(this.photoId()));
  readonly readonly = computed(() => this.store.readOnly());
  readonly location = computed(() => {
    const p = this.photo();
    return p ? this.store.photoLocation(p) : '';
  });

  readonly imageUrl = signal<string | null>(null);
  readonly natural = signal<{ w: number; h: number } | null>(null);
  readonly frame = signal<{ w: number; h: number }>({ w: 0, h: 0 });
  readonly scale = signal(1);
  readonly pan = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  readonly tool = signal<Tool>('arrow');
  readonly color = signal(DEFAULT_COLORS[0]);
  readonly strokeWidth = signal<number>(STROKE_WIDTHS.moyen);
  readonly textSize = signal<number>(TEXT_SIZES.moyen);
  readonly zoneFill = signal<'hatch' | 'tint'>('hatch');
  /** Pastille : 'auto' (numéro suivant) ou id d'une photo de la visite. */
  readonly badgeTarget = signal<string>('auto');

  readonly shapes = signal<Shape[]>([]);
  readonly draft = signal<Shape | null>(null);
  readonly zonePoints = signal<Point[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly caption = signal('');

  readonly palette = computed(() => {
    const legend = this.store.project()?.legend ?? [];
    const colors = [...legend.map((l) => l.color), ...DEFAULT_COLORS];
    return [...new Set(colors.map((c) => c.toLowerCase()))];
  });
  readonly legendLabel = computed(() => {
    const legend = this.store.project()?.legend ?? [];
    return (color: string) => legend.find((l) => l.color.toLowerCase() === color.toLowerCase())?.label;
  });
  readonly usedLegend = computed(() => {
    const legend = this.store.project()?.legend ?? [];
    const used = new Set(this.shapes().map((s) => s.color.toLowerCase()));
    return legend.filter((l) => used.has(l.color.toLowerCase()));
  });
  readonly otherPhotos = computed(() => this.store.photos().filter((p) => p.id !== this.photoId() && p.kind === 'photo'));
  readonly nextBadge = computed(() =>
    this.shapes().reduce((max, s) => (s.kind === 'badge' && !s.photoId ? Math.max(max, s.n) : max), 0) + 1,
  );
  readonly frameTransform = computed(() => {
    const { x, y } = this.pan();
    return `translate(${x}px, ${y}px) scale(${this.scale()})`;
  });

  private readonly stage = viewChild<ElementRef<HTMLDivElement>>('stage');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private history = new AnnotationHistory([]);
  private loadedId: string | null = null;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private captionTimer?: ReturnType<typeof setTimeout>;
  private pendingSave = false;
  private readonly skippedColors = new Set<string>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: { dist: number; mid: { x: number; y: number }; scale: number; pan: { x: number; y: number } } | null = null;
  private drag: { start: Point; original: Shape[]; moved: boolean } | null = null;
  private freePoints: Point[] = [];
  private start: Point | null = null;
  private frameRequest = 0;
  private resizeObserver?: ResizeObserver;

  constructor() {
    // chargement de la photo (et rechargement si son id change après copie à l'écriture)
    effect(() => {
      const photo = this.photo();
      if (!photo || photo.id === this.loadedId) return;
      untracked(() => void this.load(photo));
    });
    // redessin dès que l'état change
    effect(() => {
      this.shapes();
      this.draft();
      this.zonePoints();
      this.selectedId();
      this.frame();
      untracked(() => this.requestRender());
    });
    afterNextRender(() => {
      const stage = this.stage()?.nativeElement;
      if (!stage) return;
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(stage);
    });
    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      cancelAnimationFrame(this.frameRequest);
      void this.flush();
      const url = this.imageUrl();
      if (url) URL.revokeObjectURL(url);
    });
  }

  private async load(photo: Photo): Promise<void> {
    this.loadedId = photo.id;
    this.history = new AnnotationHistory(photo.annotations);
    this.shapes.set(photo.annotations);
    this.caption.set(photo.caption);
    this.syncHistory();
    const blob = await this.store.getBlob(photo.blobId);
    if (!blob) return;
    const previous = this.imageUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.natural.set({ w: blob.width, h: blob.height });
    this.imageUrl.set(URL.createObjectURL(blob.image));
    if (photo.kind !== 'photo' && !photo.annotations.length) this.tool.set('free');
    this.fit();
  }

  // ---- mise à l'échelle -------------------------------------------------------

  fit(): void {
    const stage = this.stage()?.nativeElement;
    const natural = this.natural();
    if (!stage || !natural) return;
    const availW = stage.clientWidth - 16;
    const availH = stage.clientHeight - 16;
    const ratio = Math.min(availW / natural.w, availH / natural.h);
    this.frame.set({ w: Math.max(1, Math.floor(natural.w * ratio)), h: Math.max(1, Math.floor(natural.h * ratio)) });
    this.scale.set(1);
    this.pan.set({ x: 0, y: 0 });
  }

  zoom(factor: number): void {
    this.scale.update((s) => Math.min(4, Math.max(1, s * factor)));
    if (this.scale() === 1) this.pan.set({ x: 0, y: 0 });
  }

  // ---- rendu ------------------------------------------------------------------

  private requestRender(): void {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = requestAnimationFrame(() => this.render());
  }

  private render(): void {
    const canvas = this.canvas()?.nativeElement;
    const { w, h } = this.frame();
    if (!canvas || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const draft = this.draft();
    renderShapes(ctx, draft ? [...this.shapes(), draft] : this.shapes(), w, h, { selectedId: this.selectedId() });
    const zone = this.zonePoints();
    if (zone.length) {
      ctx.save();
      ctx.strokeStyle = this.color();
      ctx.fillStyle = this.color();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      zone.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
      ctx.stroke();
      for (const [x, y] of zone) {
        ctx.beginPath();
        ctx.arc(x * w, y * h, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ---- gestes ------------------------------------------------------------------

  private normalized(e: PointerEvent): Point {
    const rect = this.canvas()!.nativeElement.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1.02, Math.max(-0.02, v));
    return [clamp((e.clientX - rect.left) / rect.width), clamp((e.clientY - rect.top) / rect.height)];
  }

  onPointerDown(e: PointerEvent): void {
    if (!this.canvas()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      // deux doigts : zoom / déplacement, on abandonne le tracé en cours
      this.cancelDraft();
      const [a, b] = [...this.pointers.values()];
      this.gesture = {
        dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale: this.scale(), pan: this.pan(),
      };
      return;
    }
    if (this.pointers.size > 2 || this.readonly()) return;
    this.begin(this.normalized(e));
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.gesture && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.scale.set(Math.min(4, Math.max(1, this.gesture.scale * (dist / (this.gesture.dist || 1)))));
      this.pan.set({ x: this.gesture.pan.x + mid.x - this.gesture.mid.x, y: this.gesture.pan.y + mid.y - this.gesture.mid.y });
      return;
    }
    if (this.pointers.size === 1 && !this.gesture && !this.readonly()) this.move(this.normalized(e));
  }

  onPointerUp(e: PointerEvent): void {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.gesture) {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    if (this.pointers.size === 0 && !this.readonly()) this.end(this.normalized(e));
  }

  private cancelDraft(): void {
    this.draft.set(null);
    this.start = null;
    this.freePoints = [];
    if (this.drag) {
      this.shapes.set(this.drag.original);
      this.drag = null;
    }
  }

  private begin(p: Point): void {
    const tool = this.tool();
    switch (tool) {
      case 'select': {
        const aspect = this.frame().w / (this.frame().h || 1);
        const hit = hitTest(this.shapes(), p[0], p[1], 0.025 / this.scale(), aspect);
        this.selectedId.set(hit?.id ?? null);
        this.drag = hit ? { start: p, original: this.shapes(), moved: false } : null;
        return;
      }
      case 'free':
        this.freePoints = [p];
        this.draft.set({ id: 'draft', kind: 'free', points: [p], color: this.color(), width: this.strokeWidth() });
        return;
      case 'zone':
        this.addZonePoint(p);
        return;
      case 'text':
        void this.addText(p);
        return;
      case 'badge':
        this.addBadge(p);
        return;
      default:
        this.start = p;
    }
  }

  private move(p: Point): void {
    const tool = this.tool();
    if (tool === 'select' && this.drag) {
      const [dx, dy] = [p[0] - this.drag.start[0], p[1] - this.drag.start[1]];
      this.drag.moved = this.drag.moved || Math.hypot(dx, dy) > 0.003;
      const id = this.selectedId();
      this.shapes.set(this.drag.original.map((s) => (s.id === id ? translate(s, dx, dy) : s)));
      return;
    }
    if (tool === 'free' && this.freePoints.length) {
      this.freePoints.push(p);
      this.draft.set({ id: 'draft', kind: 'free', points: [...this.freePoints], color: this.color(), width: this.strokeWidth() });
      return;
    }
    if (this.start) this.draft.set(this.shapeFromDrag(tool, this.start, p));
  }

  private end(p: Point): void {
    const tool = this.tool();
    if (tool === 'select') {
      if (this.drag?.moved) {
        const next = this.shapes();
        this.shapes.set(this.drag.original);
        this.commit(next);
      }
      this.drag = null;
      return;
    }
    if (tool === 'free' && this.freePoints.length) {
      const points = simplify(this.freePoints);
      this.freePoints = [];
      this.draft.set(null);
      if (points.length > 1) this.commit([...this.shapes(), { id: crypto.randomUUID(), kind: 'free', points, color: this.color(), width: this.strokeWidth() }]);
      return;
    }
    if (!this.start) return;
    const shape = this.shapeFromDrag(tool, this.start, p);
    this.start = null;
    this.draft.set(null);
    if (shape && this.bigEnough(shape)) {
      this.commit([...this.shapes(), { ...shape, id: crypto.randomUUID() }]);
    }
  }

  private bigEnough(s: Shape): boolean {
    switch (s.kind) {
      case 'arrow': return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > MIN_SIZE;
      case 'rect': return Math.abs(s.w) > MIN_SIZE && Math.abs(s.h) > MIN_SIZE;
      case 'ellipse': return s.rx > MIN_SIZE / 2 && s.ry > MIN_SIZE / 2;
      default: return true;
    }
  }

  private shapeFromDrag(tool: Tool, a: Point, b: Point): Shape | null {
    const base = { id: 'draft', color: this.color(), width: this.strokeWidth() };
    switch (tool) {
      case 'arrow':
        return { ...base, kind: 'arrow', x1: a[0], y1: a[1], x2: b[0], y2: b[1] };
      case 'rect':
        return { ...base, kind: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
      case 'ellipse':
        return { ...base, kind: 'ellipse', cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: Math.abs(b[0] - a[0]) / 2, ry: Math.abs(b[1] - a[1]) / 2 };
      default:
        return null;
    }
  }

  // ---- outils à poser ----------------------------------------------------------

  private addZonePoint(p: Point): void {
    const points = this.zonePoints();
    const first = points[0];
    if (points.length >= 3 && first && Math.hypot(first[0] - p[0], first[1] - p[1]) < 0.03 / this.scale()) {
      this.finishZone();
      return;
    }
    this.zonePoints.set([...points, p]);
  }

  finishZone(): void {
    const points = this.zonePoints();
    this.zonePoints.set([]);
    if (points.length >= 3) {
      this.commit([...this.shapes(), { id: crypto.randomUUID(), kind: 'zone', points, color: this.color(), fill: this.zoneFill() }]);
    }
  }

  cancelZone(): void {
    this.zonePoints.set([]);
  }

  private async addText(p: Point): Promise<void> {
    const text = await this.dialogs.prompt('Texte de l’annotation', { confirmLabel: 'Ajouter' });
    if (!text?.trim()) return;
    this.commit([...this.shapes(), { id: crypto.randomUUID(), kind: 'text', x: p[0], y: p[1], text: text.trim(), size: this.textSize(), color: this.color() }]);
  }

  private addBadge(p: Point): void {
    const target = this.badgeTarget();
    const linked = target !== 'auto' ? this.store.photo(target) : undefined;
    const badge: Shape = {
      id: crypto.randomUUID(), kind: 'badge', x: p[0], y: p[1], size: this.textSize() * 0.75, color: this.color(),
      n: linked?.number ?? this.nextBadge(),
      ...(linked ? { photoId: linked.id } : {}),
    };
    this.commit([...this.shapes(), badge]);
    if (linked) this.badgeTarget.set('auto');
  }

  // ---- historique et enregistrement ----------------------------------------------

  private commit(next: Shape[]): void {
    const added = next.find((s) => !this.shapes().some((o) => o.id === s.id));
    this.shapes.set(this.history.apply(next));
    this.syncHistory();
    this.scheduleSave();
    if (added) void this.maybeNameColor(added.color);
  }

  undo(): void {
    this.selectedId.set(null);
    this.shapes.set(this.history.undo());
    this.syncHistory();
    this.scheduleSave();
  }

  redo(): void {
    this.shapes.set(this.history.redo());
    this.syncHistory();
    this.scheduleSave();
  }

  deleteSelected(): void {
    const id = this.selectedId();
    if (!id) return;
    this.selectedId.set(null);
    this.commit(this.shapes().filter((s) => s.id !== id));
  }

  pickColor(color: string): void {
    this.color.set(color);
    const id = this.selectedId();
    if (id) this.commit(this.shapes().map((s) => (s.id === id ? { ...s, color } : s)));
  }

  setTool(tool: Tool): void {
    if (this.zonePoints().length && tool !== 'zone') this.finishZone();
    this.tool.set(tool);
    if (tool !== 'select') this.selectedId.set(null);
  }

  private syncHistory(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  private scheduleSave(): void {
    this.pendingSave = true;
    this.store.pendingWrites.update((n) => n + 1);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  private async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (!this.pendingSave) return;
    this.pendingSave = false;
    const updated = await this.store.updatePhoto(this.photoId(), { annotations: this.shapes() });
    this.store.pendingWrites.update((n) => Math.max(0, n - 1));
    // copie à l'écriture (photo d'une visite précédente) : nouvel identifiant
    if (updated && updated.id !== this.photoId()) {
      this.loadedId = updated.id;
      await this.router.navigate(this.store.link('photos', updated.id), { replaceUrl: true });
    }
  }

  /** Première utilisation d'une couleur dans le dossier : proposer de la nommer pour la légende. */
  private async maybeNameColor(color: string): Promise<void> {
    const key = color.toLowerCase();
    if (this.legendLabel()(key) || this.skippedColors.has(key)) return;
    this.skippedColors.add(key);
    const used = new Set((this.store.project()?.legend ?? []).map((l) => l.label));
    const label = await this.dialogs.prompt('Nommer cette couleur pour la légende du plan ?', {
      suggestions: LEGEND_SUGGESTIONS.filter((s) => !used.has(s)), confirmLabel: 'Ajouter à la légende',
    });
    if (label?.trim()) {
      await this.store.setLegend([...(this.store.project()?.legend ?? []), { color: key, label: label.trim() }]);
    }
  }

  async renameColor(): Promise<void> {
    const key = this.color().toLowerCase();
    const label = await this.dialogs.prompt('Libellé de la couleur dans la légende', {
      initial: this.legendLabel()(key) ?? '', suggestions: LEGEND_SUGGESTIONS, confirmLabel: 'Enregistrer',
    });
    if (!label?.trim()) return;
    const legend = (this.store.project()?.legend ?? []).filter((l) => l.color.toLowerCase() !== key);
    await this.store.setLegend([...legend, { color: key, label: label.trim() }]);
  }

  onCaption(text: string): void {
    this.caption.set(text);
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => void this.store.updatePhoto(this.photoId(), { caption: text }), SAVE_DELAY);
  }

  // ---- navigation ------------------------------------------------------------------

  async close(): Promise<void> {
    await this.flush();
    const photo = this.photo();
    if (photo?.instanceId) {
      await this.router.navigate(this.store.link('i', photo.instanceId), { fragment: photo.itemId ? `item-${photo.itemId}` : undefined });
    } else if (photo?.itemId) {
      await this.router.navigate(this.store.link('conclusion'));
    } else {
      await this.router.navigate(this.store.link(photo?.kind === 'photo' ? 'photos' : 'plans'));
    }
  }

  async remove(): Promise<void> {
    const photo = this.photo();
    if (!photo) return;
    const ok = await this.dialogs.confirm(`Supprimer ${photo.kind === 'photo' ? 'la photo' : 'le plan'} n° ${photo.number} ?`,
      'L’image et ses annotations seront supprimées.', { confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    this.pendingSave = false;
    const target = { ...photo };
    await this.store.deletePhoto(photo.id);
    this.loadedId = null;
    if (target.instanceId) await this.router.navigate(this.store.link('i', target.instanceId));
    else await this.router.navigate(this.store.link(target.kind === 'photo' ? 'photos' : 'plans'));
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedId()) {
      this.deleteSelected();
    } else if (e.key === 'Enter' && this.zonePoints().length) {
      this.finishZone();
    }
  }
}
