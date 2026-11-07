import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MediaRequest, PhotoStripComponent } from '../../../shared/photo-strip.component';
import { VisitStore } from '../visit-store';

/** Toutes les photos de la visite, regroupées par emplacement, et l'ajout de photos générales. */
@Component({
  selector: 'app-photos-page',
  imports: [PhotoStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <h1>Photos <span class="badge">{{ count() }}</span></h1>
      <section class="card stack">
        <h2>Photos générales de la visite</h2>
        <p class="hint">Photos non rattachées à un item : vues d'ensemble, environnement…</p>
        <app-photo-strip [photos]="store.photoViews(null, null)" [readonly]="store.readOnly()"
                         (add)="add($event)" (open)="open($event)" />
      </section>
      @for (g of groups(); track g.key) {
        <section class="card stack">
          <h2 class="where">{{ g.label }}</h2>
          <app-photo-strip [photos]="g.views" [readonly]="true" (open)="open($event)" />
        </section>
      }
      @if (count() === 0) {
        <p class="hint">Les photos prises depuis les fiches apparaîtront ici.</p>
      }
    </div>
  `,
  styles: `.where { font-size: 19px; }`,
})
export class PhotosPage {
  readonly store = inject(VisitStore);
  private readonly router = inject(Router);

  readonly count = computed(() => this.store.photos().filter((p) => p.kind === 'photo').length);

  /** Photos rattachées à des items, dans l'ordre du rapport (celui de leurs numéros). */
  readonly groups = computed(() => {
    const map = new Map<string, { key: string; label: string; views: ReturnType<VisitStore['toView']>[] }>();
    const photos = this.store.photos()
      .filter((p) => p.kind === 'photo' && p.instanceId)
      .sort((a, b) => this.store.number(a) - this.store.number(b));
    for (const p of photos) {
      const key = `${p.instanceId}|${p.itemId}`;
      const group = map.get(key) ?? { key, label: this.store.photoLocation(p), views: [] };
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
