import { Injectable, signal } from '@angular/core';

export interface StorageInfo {
  usage: number;
  quota: number;
}

/** Espace utilisé et persistance du stockage (Safari peut purger un site non persistant). */
@Injectable({ providedIn: 'root' })
export class StorageService {
  readonly info = signal<StorageInfo | null>(null);
  /** null = API indisponible. */
  readonly persisted = signal<boolean | null>(null);

  async refresh(): Promise<void> {
    const storage = navigator.storage;
    if (!storage) return;
    try {
      const estimate = await storage.estimate();
      this.info.set({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 });
      this.persisted.set(storage.persisted ? await storage.persisted() : null);
    } catch {
      this.info.set(null);
    }
  }

  /** Demande le stockage persistant. Sur iPadOS l'accord est automatique pour une PWA installée et utilisée. */
  async requestPersistence(): Promise<boolean | null> {
    const storage = navigator.storage;
    if (!storage?.persist) return null;
    try {
      const granted = await storage.persist();
      this.persisted.set(granted);
      return granted;
    } catch {
      return null;
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} Go`;
}
