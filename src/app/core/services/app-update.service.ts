import { inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** Signale une nouvelle version de l'app. Le rechargement n'a lieu que sur action de l'utilisateur. */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  readonly updateReady = signal(false);
  readonly broken = signal(false);

  /** null : vérification en cours ; true : tous les fichiers nécessaires sont en cache. */
  readonly offlineReady = signal<boolean | null>(null);

  /** Fichiers indispensables hors ligne (le reste de l'app est précaché avec eux). */
  private static readonly ESSENTIAL = [
    'index.html', 'templates/index.json', 'templates/diagnostic-bati-ancien.json', 'config/report.config.json',
    'config/lexicon.json', 'fonts/Overlock-Regular.ttf', 'pdfjs/pdf.worker.min.mjs',
  ];

  private async checkOffline(attempt = 0): Promise<void> {
    if (typeof caches === 'undefined') return;
    const results = await Promise.all(
      AppUpdateService.ESSENTIAL.map((path) => caches.match(new URL(path, document.baseURI).href).then(Boolean).catch(() => false)),
    );
    const ready = results.every(Boolean);
    this.offlineReady.set(ready || (attempt < 40 ? null : false));
    if (!ready && attempt < 40) setTimeout(() => void this.checkOffline(attempt + 1), 3000);
  }

  start(): void {
    if (!this.sw.isEnabled) return;
    void this.checkOffline();
    this.sw.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));
    this.sw.unrecoverable.subscribe(() => this.broken.set(true));
    if (navigator.onLine) void this.sw.checkForUpdate().catch(() => undefined);
  }

  async apply(): Promise<void> {
    await this.sw.activateUpdate().catch(() => undefined);
    location.reload();
  }
}
