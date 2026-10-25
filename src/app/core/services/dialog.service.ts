import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
}

export interface PromptRequest {
  kind: 'prompt';
  title: string;
  initial: string;
  suggestions: string[];
  confirmLabel: string;
  resolve: (value: string | null) => void;
}

export type DialogRequest = ConfirmRequest | PromptRequest;

/** Boîtes de dialogue tactiles (les dialogues natifs de Safari sont petits et bloquants). */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly current = signal<DialogRequest | null>(null);
  readonly toast = signal<{ message: string; error: boolean } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  confirm(title: string, message: string, options: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.current.set({
        kind: 'confirm', title, message, resolve,
        confirmLabel: options.confirmLabel ?? 'Confirmer',
        danger: options.danger ?? false,
      });
    });
  }

  prompt(title: string, options: { initial?: string; suggestions?: string[]; confirmLabel?: string } = {}): Promise<string | null> {
    return new Promise((resolve) => {
      this.current.set({
        kind: 'prompt', title, resolve,
        initial: options.initial ?? '',
        suggestions: options.suggestions ?? [],
        confirmLabel: options.confirmLabel ?? 'Valider',
      });
    });
  }

  close(result: boolean | string | null): void {
    const request = this.current();
    this.current.set(null);
    if (!request) return;
    if (request.kind === 'confirm') request.resolve(result === true);
    else request.resolve(typeof result === 'string' ? result : null);
  }

  notify(message: string, error = false): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ message, error });
    this.toastTimer = setTimeout(() => this.toast.set(null), error ? 8000 : 3000);
  }
}
