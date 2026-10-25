import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ActionRow, URGENCIES, URGENCY_LABELS, Urgency } from '../../../core/model/data';
import { AutoGrowDirective } from '../../../shared/auto-grow.directive';

/** Liste de préconisations / mesures, chacune avec son échéance. */
@Component({
  selector: 'app-actions-field',
  imports: [AutoGrowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (row of value() ?? []; track row.id; let i = $index) {
      <div class="action">
        <textarea class="input" rows="1" [appAutoGrow]="row.text" [value]="row.text" [readOnly]="readonly()"
                  placeholder="Décrire la mesure…" [attr.aria-label]="label() + ' ' + (i + 1)"
                  (input)="update(i, { text: $any($event.target).value }, true)"></textarea>
        <div class="row urgency">
          <span class="hint">Échéance :</span>
          <div class="choices" role="group" [attr.aria-label]="'Échéance de la mesure ' + (i + 1)">
            @for (u of urgencies; track u) {
              <button class="choice" type="button" [attr.aria-pressed]="row.urgency === u" [disabled]="readonly()"
                      [class.warn]="u === 'immediate'" (click)="update(i, { urgency: u })">{{ labels[u] }}</button>
            }
          </div>
          @if (!readonly()) {
            <button class="btn btn-ghost btn-small" type="button" (click)="remove(i)"
                    [attr.aria-label]="'Supprimer la mesure ' + (i + 1)">Supprimer</button>
          }
        </div>
      </div>
    }
    @if (!readonly()) {
      <div class="row">
        <button class="btn btn-small" type="button" (click)="add('')">+ Ajouter</button>
        @for (s of snippets(); track s) {
          <button class="choice chip snippet" type="button" (click)="add(s)">+ {{ s }}</button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .action { display: flex; flex-direction: column; gap: 8px; padding-left: 12px; border-left: 4px solid var(--surface-2); }
    .urgency { gap: 8px; }
    .snippet { font-size: 15px; min-height: 40px; }
  `,
})
export class ActionsFieldComponent {
  readonly value = input<ActionRow[] | null>(null);
  readonly label = input('');
  readonly snippets = input<string[]>([]);
  readonly readonly = input(false);
  readonly valueChange = output<{ rows: ActionRow[]; debounce: boolean }>();

  readonly urgencies = URGENCIES;
  readonly labels = URGENCY_LABELS;

  private emit(rows: ActionRow[], debounce = false): void {
    this.valueChange.emit({ rows, debounce });
  }

  add(text: string, urgency: Urgency = 'medium'): void {
    this.emit([...(this.value() ?? []), { id: crypto.randomUUID(), text, urgency }]);
  }

  update(index: number, patch: Partial<ActionRow>, debounce = false): void {
    this.emit((this.value() ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)), debounce);
  }

  remove(index: number): void {
    this.emit((this.value() ?? []).filter((_, i) => i !== index));
  }
}
