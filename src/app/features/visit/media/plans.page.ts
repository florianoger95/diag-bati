import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MediaRequest, PhotoStripComponent } from '../../../shared/photo-strip.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { VisitStore } from '../visit-store';

/** Plans et croquis : import d'un PDF, photo d'un plan papier, croquis sur fond blanc. */
@Component({
  selector: 'app-plans-page',
  imports: [PhotoStripComponent, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <div class="media-head">
        <h1>Plans et croquis</h1>
        <p class="hint">Les photos se situent sur le plan de référence de leur fiche.</p>
      </div>
      <section class="card stack">
        <h2 class="section-title">Plans de la visite</h2>
        <p class="hint">
          Importez une page d'un plan PDF (logiciel de dessin), photographiez un plan papier ou dessinez un croquis.
          Les plans rattachés à une fiche (plan de couverture…) s'ajoutent depuis la fiche.
        </p>
        <app-photo-strip [photos]="general()" mode="plan" [readonly]="store.readOnly()"
                         (add)="add($event)" (open)="open($event)" />
      </section>
      @for (g of attached(); track g.key) {
        <section class="card stack">
          <div class="group-head">
            <h2 class="section-title where">{{ g.label }}</h2>
            @if (g.instanceId) {
              <a class="btn btn-small btn-ghost" [routerLink]="store.link('i', g.instanceId)" [queryParams]="{ q: g.itemId }">Voir la question<app-icon name="right" size="sm" /></a>
            }
          </div>
          <app-photo-strip [photos]="g.views" [readonly]="true" (open)="open($event)" />
        </section>
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
export class PlansPage {
  readonly store = inject(VisitStore);
  private readonly router = inject(Router);

  readonly general = computed(() =>
    this.store.photos().filter((p) => p.kind !== 'photo' && !p.instanceId && !p.itemId).map((p) => this.store.toView(p)),
  );
  /** Plans rattachés aux fiches (et à la conclusion), regroupés par emplacement. */
  readonly attached = computed(() => {
    const map = new Map<string, { key: string; label: string; instanceId: string | null; itemId: string; views: ReturnType<VisitStore['toView']>[] }>();
    const plans = this.store.photos()
      .filter((p) => p.kind !== 'photo' && (p.instanceId || p.itemId))
      .sort((a, b) => this.store.number(a) - this.store.number(b));
    for (const p of plans) {
      const key = `${p.instanceId}|${p.itemId}`;
      const group = map.get(key) ?? { key, label: this.store.photoLocation(p), instanceId: p.instanceId ?? null, itemId: p.itemId ?? '', views: [] };
      group.views.push(this.store.toView(p));
      map.set(key, group);
    }
    return [...map.values()];
  });

  async add(request: MediaRequest): Promise<void> {
    const created = await this.store.handleMedia(request, { instanceId: null, itemId: null });
    if (created) this.open(created.id);
  }

  open(photoId: string): void {
    void this.router.navigate(this.store.link('photos', photoId));
  }
}
