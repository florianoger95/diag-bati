import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AutoGrowDirective } from '../../shared/auto-grow.directive';
import { MediaRequest, PhotoStripComponent } from '../../shared/photo-strip.component';
import { CONCLUSION_ITEM, VisitStore } from './visit-store';

/** Conclusion du diagnostic : texte libre et plans (fissures, sondages recommandés…). */
@Component({
  selector: 'app-conclusion-page',
  imports: [AutoGrowDirective, PhotoStripComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <h1>Conclusion</h1>
      <textarea class="input conclusion" rows="8" [appAutoGrow]="store.visit()?.conclusion"
                [value]="store.visit()?.conclusion ?? ''" [readOnly]="store.readOnly()" aria-label="Conclusion"
                placeholder="Fissures importantes — … Remontées capillaires — … Végétation — …"
                (input)="store.setConclusion($any($event.target).value)"></textarea>
      <section class="card stack">
        <h2>Plans de la conclusion</h2>
        <p class="hint">Fissures murales structurelles, sondages recommandés par niveau…</p>
        <app-photo-strip [photos]="store.photoViews(null, conclusionItem)" mode="plan" [readonly]="store.readOnly()"
                         (add)="add($event)" (open)="open($event)" />
      </section>
    </div>
  `,
  styles: `.conclusion { min-height: 240px; font-size: 18px; }`,
})
export class ConclusionPage {
  readonly store = inject(VisitStore);
  private readonly router = inject(Router);
  readonly conclusionItem = CONCLUSION_ITEM;

  async add(request: MediaRequest): Promise<void> {
    const created = await this.store.handleMedia(request, { instanceId: null, itemId: CONCLUSION_ITEM });
    if (created) this.open(created.id);
  }

  open(photoId: string): void {
    void this.router.navigate(this.store.link('photos', photoId));
  }
}
