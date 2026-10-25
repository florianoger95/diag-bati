import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MeasureRow } from '../../../core/model/data';
import { MeasuresConfig } from '../../../core/model/template';
import { NumberInputComponent } from '../../../shared/number-input.component';

/** Tableau de relevés : points fixes (0 m / 1 m / 2 m) ou lignes libres (témoins, fissures). */
@Component({
  selector: 'app-measures-field',
  imports: [NumberInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table" role="table" [attr.aria-label]="label()">
      @for (row of rows(); track row.id; let i = $index) {
        <div class="line" role="row">
          @if (fixed()) {
            <span class="point" role="rowheader">{{ row.point }}</span>
          } @else {
            <input class="input point-input" type="text" placeholder="Repère (ex. Témoin 1)" [value]="row.point"
                   [readOnly]="readonly()" (input)="update(i, { point: $any($event.target).value }, true)"
                   [attr.aria-label]="'Repère du relevé ' + (i + 1)" />
          }
          @for (col of config().columns; track $index; let c = $index) {
            <label class="cell">
              <span class="col">{{ col.label }}</span>
              <app-number-input [value]="row.values[c] ?? null" [unit]="col.unit" [readonly]="readonly()"
                                [label]="col.label + ' — ' + (row.point || 'relevé ' + (i + 1))"
                                (valueChange)="setValue(i, c, $event)" />
            </label>
          }
          @if (!fixed() && !readonly()) {
            <button class="btn btn-ghost btn-small" type="button" (click)="remove(i)"
                    [attr.aria-label]="'Supprimer le relevé ' + (i + 1)">✕</button>
          }
        </div>
      }
    </div>
    @if (!fixed() && !readonly()) {
      <button class="btn btn-small" type="button" (click)="add()">+ Ajouter un relevé</button>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .table { display: flex; flex-direction: column; gap: 8px; width: 100%; }
    .line { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .point { min-width: 7ch; font-weight: 700; }
    .point-input { width: 16ch; }
    .cell { display: inline-flex; align-items: center; gap: 8px; }
    .col { color: var(--muted); font-size: 16px; }
  `,
})
export class MeasuresFieldComponent {
  readonly config = input.required<MeasuresConfig>();
  readonly value = input<MeasureRow[] | null>(null);
  readonly label = input('');
  readonly readonly = input(false);
  readonly valueChange = output<{ rows: MeasureRow[]; debounce: boolean }>();

  readonly fixed = computed(() => !!this.config().points?.length);

  /** Lignes affichées : pour des points fixes, toujours une ligne par point. */
  readonly rows = computed<MeasureRow[]>(() => {
    const stored = this.value() ?? [];
    const points = this.config().points;
    if (!points?.length) return stored;
    return points.map((point) => stored.find((r) => r.point === point) ?? { id: point, point, values: [] });
  });

  private emit(rows: MeasureRow[], debounce = false): void {
    this.valueChange.emit({ rows, debounce });
  }

  setValue(index: number, column: number, n: number | null): void {
    const rows = this.rows().map((r) => ({ ...r, values: [...r.values] }));
    const values = rows[index].values;
    while (values.length < this.config().columns.length) values.push(null);
    values[column] = n;
    this.emit(rows, true);
  }

  update(index: number, patch: Partial<MeasureRow>, debounce = false): void {
    this.emit(this.rows().map((r, i) => (i === index ? { ...r, ...patch } : r)), debounce);
  }

  add(): void {
    const rows = this.rows();
    this.emit([...rows, { id: crypto.randomUUID(), point: '', values: this.config().columns.map(() => null) }]);
  }

  remove(index: number): void {
    this.emit(this.rows().filter((_, i) => i !== index));
  }
}
