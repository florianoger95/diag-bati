import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Project, Visit } from '../../core/model/data';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { resolveTemplate } from '../../core/templates/template-engine';
import { FieldChange, ItemFieldComponent } from '../visit/fields/item-field.component';

const STATUS_LABELS: Record<Visit['status'], string> = {
  draft: 'En cours',
  closed: 'Clôturée',
  exported: 'Exportée',
};

@Component({
  selector: 'app-project-page',
  imports: [RouterLink, DatePipe, ItemFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <a class="btn btn-ghost back" routerLink="/">← Dossiers</a>
      @if (project(); as p) {
        <h1>{{ p.fields['projet'] || 'Dossier' }} <span class="hint ref">{{ p.reference }}</span></h1>
        <p class="hint">Modèle : {{ p.templateSnapshot.label }} (v{{ p.templateVersion }})</p>

        <section class="stack">
          <h2>Visites</h2>
          @for (v of visits(); track v.id) {
            <a class="card visit" [routerLink]="['v', v.id]">
              <strong>{{ v.revision === 0 ? 'Visite initiale' : 'Mise à jour ' + v.revision }}</strong>
              <span class="badge" [class.badge-ok]="v.status !== 'draft'">{{ statusLabels[v.status] }}</span>
              <span class="hint">
                @if (v.fields['date-visite']) { {{ $any(v.fields['date-visite']) | date: 'dd/MM/yyyy à HH:mm' }} · }
                {{ v.instances.length }} fiches
              </span>
            </a>
          }
          <button class="btn" type="button" disabled>+ Nouvelle mise à jour (Lot 4)</button>
        </section>

        <section class="stack">
          <h2>Informations du projet</h2>
          @for (item of fieldsDef(); track item.id) {
            <app-item-field [item]="item" [state]="{ value: $any(p.fields[item.id] ?? null), observation: '' }"
                            [allowDefect]="false" (changed)="setField(item.id, $event)" />
          }
        </section>
      } @else if (missing()) {
        <p>Ce dossier n'existe plus sur cet iPad.</p>
      }
    </div>
  `,
  styles: `
    .back { align-self: flex-start; }
    .ref { font-size: 18px; font-weight: 600; }
    .visit { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; color: inherit; text-decoration: none; min-height: 64px; }
  `,
})
export class ProjectPage {
  readonly projectId = input.required<string>();
  private readonly data = inject(DataService);
  private readonly dialogs = inject(DialogService);

  readonly statusLabels = STATUS_LABELS;
  readonly project = signal<Project | null>(null);
  readonly visits = signal<Visit[]>([]);
  readonly missing = signal(false);
  readonly fieldsDef = computed(() => {
    const p = this.project();
    return p ? resolveTemplate(p.templateSnapshot).projectFields : [];
  });

  constructor() {
    effect(() => void this.load(this.projectId()));
  }

  private async load(id: string): Promise<void> {
    const project = await this.data.repo.getProject(id);
    this.missing.set(!project);
    this.project.set(project ?? null);
    this.visits.set(project ? await this.data.repo.getVisitsOfProject(id) : []);
  }

  async setField(id: string, change: FieldChange): Promise<void> {
    const p = this.project();
    if (!p || !('value' in change.patch)) return;
    const value = change.patch.value ?? null;
    this.project.set({ ...p, fields: { ...p.fields, [id]: value } });
    await this.data.repo.updateProjectFields(p.id, { [id]: value }).catch((e) => this.dialogs.notify(e.message, true));
  }
}
