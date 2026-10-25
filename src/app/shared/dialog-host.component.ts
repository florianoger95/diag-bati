import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DialogService } from '../core/services/dialog.service';

@Component({
  selector: 'app-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dialogs.current(); as request) {
      <div class="backdrop" (click)="dialogs.close(null)"></div>
      <div class="dialog card" role="dialog" aria-modal="true" [attr.aria-label]="request.title">
        <h2>{{ request.title }}</h2>
        @if (request.kind === 'confirm') {
          <p class="message">{{ request.message }}</p>
          <div class="row actions">
            <button class="btn" type="button" (click)="dialogs.close(false)">Annuler</button>
            <button class="btn btn-primary" type="button" [class.btn-danger]="request.danger"
                    (click)="dialogs.close(true)">{{ request.confirmLabel }}</button>
          </div>
        } @else {
          <form (submit)="$event.preventDefault(); dialogs.close(value())">
            @if (request.suggestions.length) {
              <div class="choices suggestions">
                @for (s of request.suggestions; track s) {
                  <button class="choice chip" type="button" [attr.aria-pressed]="value() === s"
                          (click)="value.set(s)">{{ s }}</button>
                }
              </div>
            }
            <input #field class="input" type="text" [value]="value()" (input)="value.set(field.value)"
                   autocomplete="off" enterkeyhint="done" />
            <div class="row actions">
              <button class="btn" type="button" (click)="dialogs.close(null)">Annuler</button>
              <button class="btn btn-primary" type="submit" [disabled]="!value().trim()">{{ request.confirmLabel }}</button>
            </div>
          </form>
        }
      </div>
    }
    @if (dialogs.toast(); as toast) {
      <div class="toast" role="status" [class.error]="toast.error" (click)="dialogs.toast.set(null)">{{ toast.message }}</div>
    }
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .45); z-index: 50; }
    .dialog {
      position: fixed; z-index: 51; left: 50%; top: 18%; transform: translateX(-50%);
      width: min(560px, calc(100vw - 32px)); box-shadow: 0 12px 40px rgb(0 0 0 / .3);
    }
    .message { white-space: pre-line; }
    .actions { justify-content: flex-end; margin-top: 16px; }
    .suggestions { margin-bottom: 12px; }
    .toast {
      position: fixed; z-index: 60; left: 50%; transform: translateX(-50%);
      bottom: calc(24px + var(--safe-bottom)); max-width: calc(100vw - 32px);
      padding: 14px 20px; border-radius: var(--radius); background: var(--text); color: #fff; font-weight: 600;
    }
    .toast.error { background: var(--danger); }
  `,
})
export class DialogHostComponent {
  readonly dialogs = inject(DialogService);
  readonly value = signal('');
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    effect(() => {
      const request = this.dialogs.current();
      if (request?.kind === 'prompt') this.value.set(request.initial);
    });
    effect(() => {
      const field = this.field();
      if (field) setTimeout(() => field.nativeElement.focus(), 50);
    });
  }
}
