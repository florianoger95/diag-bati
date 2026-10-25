import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';

export function parseDecimal(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatDecimal(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? String(n).replace('.', ',') : '';
}

/** Saisie d'un nombre décimal à la française (virgule), avec unité. */
@Component({
  selector: 'app-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="wrap" [class.invalid]="invalid()" [class.warn]="warn()">
      <input class="input" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done"
             [attr.aria-label]="label()" [value]="text()" [readOnly]="readonly()"
             (focus)="focused = true" (blur)="onBlur()" (input)="onInput($any($event.target).value)" />
      @if (unit()) { <span class="unit">{{ unit() }}</span> }
    </span>
  `,
  styles: `
    .wrap { display: inline-flex; align-items: center; gap: 8px; }
    .input { width: 9ch; text-align: right; }
    .unit { font-weight: 600; color: var(--muted); }
    .invalid .input { border-color: var(--danger); }
    .warn .input { border-color: #c98a00; background: var(--warn-soft); }
  `,
})
export class NumberInputComponent {
  readonly value = input<number | null>(null);
  readonly unit = input<string | undefined>();
  readonly label = input<string>('');
  readonly readonly = input(false);
  readonly warn = input(false);
  readonly valueChange = output<number | null>();

  readonly text = signal('');
  readonly invalid = signal(false);
  protected focused = false;

  constructor() {
    effect(() => {
      const v = this.value();
      if (!this.focused) this.text.set(formatDecimal(v));
    });
  }

  onInput(raw: string): void {
    this.text.set(raw);
    const n = parseDecimal(raw);
    this.invalid.set(raw.trim() !== '' && n === null);
    if (n !== null || raw.trim() === '') this.valueChange.emit(n);
  }

  onBlur(): void {
    this.focused = false;
    if (!this.invalid()) this.text.set(formatDecimal(this.value()));
  }
}
