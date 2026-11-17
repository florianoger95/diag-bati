import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { VisitStore } from './visit-store';

/** Ouvre la visite là où on l'avait laissée (sinon sur la première fiche). */
@Component({
  selector: 'app-visit-resume-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="page hint">Reprise de la visite…</p>`,
})
export class VisitResumePage {
  private readonly store = inject(VisitStore);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const visit = this.store.visit();
      const instances = this.store.orderedInstances();
      if (!visit || !instances.length) return;
      const cursor = visit.cursor;
      const resume = !!cursor && instances.some((i) => i.id === cursor.instanceId);
      const target = resume ? cursor!.instanceId : instances[0].id;
      // la question ouverte fait partie de la reprise (lot 6b)
      void this.router.navigate(['/dossiers', visit.projectId, 'v', visit.id, 'i', target], {
        replaceUrl: true, queryParams: resume && cursor!.itemId ? { q: cursor!.itemId } : {},
      });
    });
  }
}
