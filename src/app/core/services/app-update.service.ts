import { inject, Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** Signale une nouvelle version de l'app. Le rechargement n'a lieu que sur action de l'utilisateur. */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly sw = inject(SwUpdate);
  readonly updateReady = signal(false);
  readonly broken = signal(false);

  start(): void {
    if (!this.sw.isEnabled) return;
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
