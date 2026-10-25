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
      const cursor = visit.cursor?.instanceId;
      const target = instances.some((i) => i.id === cursor) ? cursor! : instances[0].id;
      void this.router.navigate(['/dossiers', visit.projectId, 'v', visit.id, 'i', target], { replaceUrl: true });
    });
  }
}
