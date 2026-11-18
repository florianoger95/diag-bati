import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { URGENCIES, URGENCY_LABELS, URGENCY_LEGEND, Urgency } from '../../core/model/data';
import { DialogService } from '../../core/services/dialog.service';
import { ActionRef, collectActions, collectDefects, collectProbes, missingRequired } from '../../core/templates/template-engine';
import { IconComponent } from '../../shared/ui/icon.component';
import { UrgencyComponent } from '../../shared/ui/urgency.component';
import { VisitStore } from './visit-store';

export type RubricId = 'desordres' | 'sondages' | 'securite' | 'travaux' | 'entretien' | 'manquants';

interface Rubric { id: RubricId; title: string; summary: string; empty?: boolean; warn?: boolean }

/** Synthèse avant clôture, en liste + détail : rubriques à gauche (`?r=`), détail à droite. */
@Component({
  selector: 'app-synthese-page',
  imports: [RouterLink, IconComponent, UrgencyComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './synthese.page.html',
  styleUrl: './synthese.page.scss',
})
export class SynthesePage {
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  readonly labels = URGENCY_LABELS;
  readonly urgencyLegend = URGENCY_LEGEND;

  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);

  private readonly answers = computed(() => [...this.store.answers().values()]);

  readonly missing = computed(() => {
    const t = this.store.template();
    const v = this.store.visit();
    if (!t || !v) return [];
    const missingFields = t.visitFields
      .filter((f) => f.required && !v.fields[f.id])
      .map((f) => ({ itemId: f.id, itemLabel: f.label, instanceId: null as string | null, instanceLabel: 'Conditions de visite' }));
    return [...missingFields, ...missingRequired(t, v, this.answers(), this.store.photos())];
  });

  readonly defects = computed(() => {
    const t = this.store.template();
    const v = this.store.visit();
    return t && v ? collectDefects(t, v, this.answers()) : [];
  });

  /** Repères « À sonder » ; en mise à jour, ceux de la visite précédente levés depuis. */
  readonly probes = computed(() => {
    const t = this.store.template();
    const v = this.store.visit();
    return t && v ? collectProbes(t, v, this.answers()) : [];
  });
  readonly probesLeft = computed(() => this.probes().filter((p) => !p.done).length);

  private actions(role:'safety' | 'recommendation' | 'maintenance') {
    const t = this.store.template();
    const v = this.store.visit();
    return t && v ? collectActions(t, v, this.answers(), role) : [];
  }

  readonly safety = computed(() => this.actions('safety'));
  readonly maintenance = computed(() => this.actions('maintenance'));
  /** Récapitulatif des travaux : préconisations groupées par échéance. */
  readonly works = computed(() => {
    const all = this.actions('recommendation');
    return URGENCIES
      .map((u) => ({ urgency: u as Urgency, items: all.filter((a) => a.urgency === u) }))
      .filter((g) => g.items.length);
  });

  readonly worksCount = computed(() => this.works().reduce((n, g) => n + g.items.length, 0));

  /** Désordres groupés par urgence : les quatre niveaux, même vides. */
  readonly defectGroups = computed(() => {
    const all = this.defects();
    return URGENCIES.map((u) => ({ urgency: u as Urgency, items: all.filter((d) => d.urgency === u) }));
  });

  readonly rubrics = computed<Rubric[]>(() => {
    const defects = this.defects().length;
    const parts = this.defectGroups().filter((g) => g.items.length)
      .map((g) => `${g.items.length} ${this.labels[g.urgency].toLowerCase()}`).join(', ');
    const probes = this.probes();
    const done = probes.length - this.probesLeft();
    const safety = this.safety().length;
    const works = this.worksCount();
    const missing = this.missing().length;
    const list: Rubric[] = [
      { id: 'desordres', title: 'Désordres', summary: defects ? `${defects} · ${parts}` : 'Aucun', empty: !defects },
    ];
    if (probes.length) {
      list.push({ id: 'sondages', title: 'Sondages à réaliser',
        summary: `${this.probesLeft()}${done ? ` · ${done} levé${done > 1 ? 's' : ''}` : ''}` });
    }
    list.push(
      { id: 'securite', title: 'Mesures de sécurité à court terme', summary: safety ? String(safety) : 'Aucune', empty: !safety },
      { id: 'travaux', title: 'Travaux et échéances', summary: works ? `${works} préconisation${works > 1 ? 's' : ''}` : 'Aucune préconisation', empty: !works },
    );
    if (this.maintenance().length) list.push({ id: 'entretien', title: "Mesures d'entretien", summary: String(this.maintenance().length) });
    list.push({ id: 'manquants', title: 'Réponses obligatoires',
      summary: missing ? `${missing} manquante${missing > 1 ? 's' : ''}` : 'Tout est renseigné', warn: missing > 0 });
    return list;
  });

  /** Rubrique ouverte : `?r=`, sinon les désordres. */
  readonly current = computed<RubricId>(() => {
    const r = this.params()?.get('r');
    return this.rubrics().some((x) => x.id === r) ? (r as RubricId) : 'desordres';
  });

  readonly base = computed(() => {
    const v = this.store.visit();
    return v ? ['/dossiers', v.projectId, 'v', v.id] : [];
  });

  link(ref: { instanceId: string | null }): string[] {
    return ref.instanceId ? [...this.base(), 'i', ref.instanceId] : [...this.base(), 'conditions'];
  }

  /** La question visée s'ouvre dans le panneau de détail de la fiche (lot 6b). */
  query(ref: { instanceId: string | null; itemId: string }): Record<string, string> {
    return ref.instanceId ? { q: ref.itemId } : {};
  }

  trackAction(a: ActionRef): string {
    return `${a.instanceId}|${a.itemId}|${a.id}`;
  }

  async close(): Promise<void> {
    const missing = this.missing().length;
    if (missing) {
      const ok = await this.dialogs.confirm(
        'Clôturer malgré les oublis ?',
        `${missing} réponse(s) obligatoire(s) manquent. Vous pourrez rouvrir la visite plus tard.`,
        { confirmLabel: 'Clôturer quand même' },
      );
      if (!ok) return;
    }
    await this.store.close();
    this.dialogs.notify('Visite clôturée.');
  }

  async reopen(): Promise<void> {
    await this.store.reopen();
    this.dialogs.notify('Visite rouverte.');
  }
}
