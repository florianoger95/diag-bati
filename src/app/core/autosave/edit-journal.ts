import { AnswerPatch } from '../model/data';

const PREFIX = 'diag-journal|';

/**
 * Journal d'écriture anticipée dans localStorage (écriture synchrone, survit à l'arrêt de Safari).
 * Il ne contient que les modifications de moins de 300 ms pas encore enregistrées dans IndexedDB :
 * ce n'est pas un stockage des données, juste une protection contre la perte des dernières frappes.
 */
export class EditJournal {
  constructor(
    private readonly visitId: string,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'> | null = safeLocalStorage(),
  ) {}

  set(key: string, patch: AnswerPatch): void {
    try {
      this.storage?.setItem(`${PREFIX}${this.visitId}|${key}`, JSON.stringify(patch));
    } catch {
      // stockage plein ou indisponible : l'écriture IndexedDB normale reste en place
    }
  }

  delete(key: string): void {
    this.storage?.removeItem(`${PREFIX}${this.visitId}|${key}`);
  }

  /** Modifications restées en attente lors d'une précédente session, par clé instanceId|itemId. */
  pending(): Map<string, AnswerPatch> {
    const result = new Map<string, AnswerPatch>();
    if (!this.storage) return result;
    const prefix = `${PREFIX}${this.visitId}|`;
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    for (const fullKey of keys) {
      try {
        result.set(fullKey.slice(prefix.length), JSON.parse(this.storage.getItem(fullKey) ?? '{}'));
      } catch {
        this.storage.removeItem(fullKey);
      }
    }
    return result;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
