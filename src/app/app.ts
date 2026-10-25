import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, first } from 'rxjs';
import { AppUpdateService } from './core/services/app-update.service';
import { CabinetService } from './core/services/cabinet.service';
import { DataService } from './core/services/data.service';
import { StorageService } from './core/services/storage.service';
import { TemplateCatalogService } from './core/services/template-catalog.service';
import { DialogHostComponent } from './shared/dialog-host.component';

const LAST_ROUTE = 'lastRoute';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, DialogHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private readonly data = inject(DataService);
  private readonly storage = inject(StorageService);
  readonly updates = inject(AppUpdateService);

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
