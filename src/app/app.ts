import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, first, map } from 'rxjs';
import { AppUpdateService } from './core/services/app-update.service';
import { CabinetService } from './core/services/cabinet.service';
import { DataService } from './core/services/data.service';
import { StorageService } from './core/services/storage.service';
import { TemplateCatalogService } from './core/services/template-catalog.service';
import { DialogHostComponent } from './shared/dialog-host.component';
import { IconComponent } from './shared/ui/icon.component';

const LAST_ROUTE = 'lastRoute';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DialogHostComponent, IconComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly data = inject(DataService);
  private readonly storage = inject(StorageService);
  readonly updates = inject(AppUpdateService);
  private readonly url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map((e) => e.urlAfterRedirects)),
    { initialValue: '/' },
  );
  /** En visite, la barre de visite remplace l'en-tête de l'app (lot 6b). */
  readonly inVisit = computed(() => /^\/dossiers\/[^/]+\/v\//.test(this.url()));

  constructor() {
    void inject(TemplateCatalogService).load();
    void inject(CabinetService).load();
  }

  ngOnInit(): void {
    this.updates.start();
    void this.storage.requestPersistence().then(() => this.storage.refresh());
    this.restoreLastRoute();
  }

  /**
   * Safari relance la PWA sur sa page d'accueil : on revient à l'écran où l'on était
   * (reprise exacte après fermeture), puis on mémorise chaque navigation.
   */
  private restoreLastRoute(): void {
    const navigations = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd));
    navigations.pipe(first()).subscribe(async (initial) => {
      const last = await this.data.getSetting<string>(LAST_ROUTE);
      if (initial.urlAfterRedirects === '/' && last && last !== '/') {
        await this.router.navigateByUrl(last, { replaceUrl: true });
      }
      navigations.subscribe((e) => void this.data.setSetting(LAST_ROUTE, e.urlAfterRedirects));
    });
  }
}
