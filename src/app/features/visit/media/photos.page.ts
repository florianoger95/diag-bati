import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MediaRequest, PhotoStripComponent } from '../../../shared/photo-strip.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { VisitStore } from '../visit-store';

/** Toutes les photos de la visite, regroupées par emplacement, et l'ajout de photos générales. */
@Component({
  selector: 'app-photos-page',
  imports: [PhotoStripComponent, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <div class="media-head">
        <h1>Photos <span class="badge">{{ count() }}</span></h1>
        <p class="hint">Numérotées dans l'ordre du rapport. Touchez une photo pour l'annoter.</p>
      </div>
      <section class="card stack">
        <h2 class="section-title">Photos générales de la visite</h2>
        <p class="hint">Photos non rattachées à un item : vues d'ensemble, environnement…</p>
        <app-photo-strip [photos]="store.photoViews(null, null)" [readonly]="store.readOnly()"
                         (add)="add($event)" (open)="open($event)" />
      </section>
      @for (g of groups(); track g.key) {
        <section class="card stack">
          <div class="group-head">
            <h2 class="section-title where">{{ g.label }}</h2>
            <a class="btn btn-small btn-ghost" [routerLink]="store.link('i', g.instanceId)" [queryParams]="{ q: g.itemId }">Voir la question<app-icon name="right" size="sm" /></a>
          </div>
          <app-photo-strip [photos]="g.views" [readonly]="true" (open)="open($event)" />
        </section>
      }
      @if (count() === 0) {
        <p class="hint">Les photos prises depuis les fiches apparaîtront ici.</p>
      }
    </div>
  `,
  styles: `
    .media-head h1 { margin: 0; }
    .media-head .hint { margin: 4px 0 0; }
    .group-head { display: flex; align-items: center; gap: 12px; }
    .group-head .where { flex: 1; min-width: 0; margin: 0; }
    .section-title { margin-top: 0; }
  `,
})
export class PhotosPage {
  readonly store = inject(VisitStore);
  private readonly router = inject(Router);

  readonly count = computed(() => this.store.photos().filter((p) => p.kind === 'photo').length);

  /** Photos rattachées à des items, dans l'ordre du rapport (celui de leurs numéros). */
  readonly groups = computed(() => {
    const map = new Map<string, { key: string; label: string; instanceId: string; itemId: string; views: ReturnType<VisitStore['toView']>[] }>();
    const photos = this.store.photos()
      .filter((p) => p.kind === 'photo' && p.instanceId)
      .sort((a, b) => this.store.number(a) - this.store.number(b));
    for (const p of photos) {
      const key = `${p.instanceId}|${p.itemId}`;
      const group = map.get(key) ?? { key, label: this.store.photoLocation(p), instanceId: p.instanceId!, itemId: p.itemId ?? '', views: [] };
      group.views.push(this.store.toView(p));
      map.set(key, group);
    }
    return [...map.values()];
  });

  async add(request: MediaRequest): Promise<void> {
    await this.store.handleMedia(request, { instanceId: null, itemId: null });
  }

  open(photoId: string): void {
    void this.router.navigate(this.store.link('photos', photoId));
  }
}
