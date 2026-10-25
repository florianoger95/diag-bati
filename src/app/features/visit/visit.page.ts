import { ChangeDetectionStrategy, Component, effect, HostListener, inject, input, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { DialogService } from '../../core/services/dialog.service';
import { PdfPagePickerComponent } from './media/pdf-page-picker.component';
import { NavSection, VisitStore } from './visit-store';

/** Mise en page d'une visite : navigation par fiches (tiroir en portrait, colonne en paysage). */
@Component({
  selector: 'app-visit-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PdfPagePickerComponent],
  providers: [VisitStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit.page.html',
  styleUrl: './visit.page.scss',
})
export class VisitPage {
  readonly projectId = input.required<string>();
  readonly visitId = input.required<string>();
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly drawerOpen = signal(false);
  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url },
  );

  constructor() {
    effect(() => void this.store.load(this.projectId(), this.visitId()));
    // fermer le tiroir après chaque navigation
    effect(() => {
      this.url();
      this.drawerOpen.set(false);
    });
  }

  @HostListener('document:keydown.escape')
  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  base(): string[] {
    return ['/dossiers', this.projectId(), 'v', this.visitId()];
  }

  async addInstance(nav: NavSection): Promise<void> {
    const repeatable = nav.section.repeatable!;
    const used = new Set(nav.instances.map((i) => i.label));
    const label = await this.dialogs.prompt(`Ajouter : ${repeatable.noun.toLowerCase()}`, {
      suggestions: (repeatable.suggestions ?? []).filter((s) => !used.has(s)),
      confirmLabel: 'Ajouter',
    });
    if (!label) return;
    const instance = await this.store.addInstance(nav.section.id, label);
    if (instance) await this.router.navigate([...this.base(), 'i', instance.id]);
  }
}
