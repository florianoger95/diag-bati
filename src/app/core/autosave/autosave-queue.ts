/**
 * File d'écritures par clé : fusionne les modifications d'une même clé, retarde les frappes
 * (debounce) et écrit dans l'ordre. `flush()` est appelé quand Safari passe en arrière-plan.
 */
export class AutosaveQueue<P extends object> {
  onPendingChange?: (pending: number) => void;
  onError?: (error: unknown) => void;
  /**
   * Journal synchrone (localStorage) des modifications pas encore écrites : si Safari est tué
   * pendant le délai, elles sont rejouées à la réouverture.
   */
  journal?: { set: (key: string, patch: P) => void; delete: (key: string) => void };

  private readonly waiting = new Map<string, P>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly write: (key: string, patch: P) => Promise<void>,
    private readonly delayMs = 300,
  ) {}

  get pending(): number {
    return this.waiting.size;
  }

  push(key: string, patch: P, options: { debounce?: boolean } = {}): void {
    const merged = { ...(this.waiting.get(key) ?? ({} as P)), ...patch };
    this.waiting.set(key, merged);
    this.journal?.set(key, merged);
    this.notify();
    clearTimeout(this.timers.get(key));
    if (options.debounce) {
      this.timers.set(key, setTimeout(() => this.schedule(key), this.delayMs));
    } else {
      this.timers.delete(key);
      this.schedule(key);
    }
  }

  /** Écrit immédiatement tout ce qui attend. */
  flush(): Promise<void> {
    for (const key of [...this.waiting.keys()]) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
      this.schedule(key);
    }
    return this.idle();
  }

  /** Résolue quand les écritures programmées sont terminées. */
  idle(): Promise<void> {
    return this.chain;
  }

  private schedule(key: string): void {
    this.chain = this.chain.then(async () => {
      const patch = this.waiting.get(key);
      if (!patch) return;
      this.waiting.delete(key);
      try {
        await this.write(key, patch);
        if (!this.waiting.has(key)) this.journal?.delete(key);
      } catch (error) {
        // on remet la modification (sans écraser une plus récente) pour un prochain essai
        this.waiting.set(key, { ...patch, ...(this.waiting.get(key) ?? ({} as P)) });
        this.onError?.(error);
      } finally {
        this.notify();
      }
    });
  }

  private notify(): void {
    this.onPendingChange?.(this.waiting.size);
  }
}
