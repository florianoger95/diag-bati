import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MediaRequest, PhotoStripComponent } from '../../../shared/photo-strip.component';
import { VisitStore } from '../visit-store';

/** Plans et croquis : import d'un PDF, photo d'un plan papier, croquis sur fond blanc. */
@Component({
  selector: 'app-plans-page',
  imports: [PhotoStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <h1>Plans et croquis</h1>
      <section class="card stack">
        <h2>Plans de la visite</h2>
        <p class="hint">
          Importez une page d'un plan PDF (logiciel de dessin), photographiez un plan papier ou dessinez un croquis.
          Les plans rattachés à une fiche (plan de couverture…) s'ajoutent depuis la fiche.
        </p>
        <app-photo-strip [photos]="general()" mode="plan" [readonly]="store.readOnly()"
                         (add)="add($event)" (open)="open($event)" />
      </section>
      @if (attached().length) {
        <section class="card stack">
          <h2>Plans des fiches</h2>
          @for (p of attached(); track p.id) {
            <div class="row attached">
              <app-photo-strip [photos]="[store.toView(p)]" [readonly]="true" (open)="open($event)" />
              <span>{{ store.photoLocation(p) }}</span>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `.attached { align-items: center; }`,
})
export class PlansPage {
  readonly store = inject(VisitStore);
  private readonly router = inject(Router);

  readonly general = computed(() =>
    this.store.photos().filter((p) => p.kind !== 'photo' && !p.instanceId && !p.itemId).map((p) => this.store.toView(p)),
  );
  readonly attached = computed(() => this.store.photos().filter((p) => p.kind !== 'photo' && (p.instanceId || p.itemId)));

  async add(request: MediaRequest): Promise<void> {
    const created = await this.store.handleMedia(request, { instanceId: null, itemId: null });
    if (created) this.open(created.id);
  }

  open(photoId: string): void {
    void this.router.navigate(this.store.link('photos', photoId));
  }
}
