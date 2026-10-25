import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { URGENCIES, URGENCY_LABELS, Urgency } from '../../core/model/data';
import { DialogService } from '../../core/services/dialog.service';
import { ActionRef, collectActions, collectDefects, missingRequired } from '../../core/templates/template-engine';
import { VisitStore } from './visit-store';

/** Synthèse avant clôture : désordres, mesures de sécurité, récapitulatif des travaux, oublis. */
@Component({
  selector: 'app-synthese-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './synthese.page.html',
  styleUrl: './synthese.page.scss',
})
export class SynthesePage {
  readonly store = inject(VisitStore);
  private readonly dialogs = inject(DialogService);
  readonly labels = URGENCY_LABELS;

  private readonly answers = computed(() => [...this.store.answers().values()]);

  readonly missing = computed(() => {
    const t = this.store.template();
    const v = this.store.visit();
    if (!t || !v) return [];
    const missingFields = t.visitFields
      .filter((f) => f.required && !v.fields[f.id])
      .map((f) => ({ itemId: f.id, itemLabel: f.label, instanceId: null as string | null, instanceLabel: 'Conditions de visite' }));
    return [...missingFields, ...missingRequired(t, v, this.answers())];
  });

  readonly defects = computed(() => {
    const t = this.store.template();
    const v = this.store.visit();
    return t && v ? collectDefects(t, v, this.answers()) : [];
  });

  private actions(role: 'safety' | 'recommendation' | 'maintenance') {
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

  readonly base = computed(() => {
    const v = this.store.visit();
    return v ? ['/dossiers', v.projectId, 'v', v.id] : [];
  });

  link(ref: { instanceId: string | null }): string[] {
    return ref.instanceId ? [...this.base(), 'i', ref.instanceId] : [...this.base(), 'conditions'];
  }

  fragment(ref: { itemId: string }): string {
    return `item-${ref.itemId}`;
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
