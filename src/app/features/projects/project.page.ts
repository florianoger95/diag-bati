import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DiagRepository } from '../../core/db/diag-repository';
import { Project, Visit } from '../../core/model/data';
import { BackupService } from '../../core/services/backup.service';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { resolveTemplate } from '../../core/templates/template-engine';
import { FieldChange, ItemFieldComponent } from '../visit/fields/item-field.component';
import { localDateTime } from './new-project.page';

const STATUS_LABELS: Record<Visit['status'], string> = {
  draft: 'En cours',
  closed: 'Clôturée',
  exported: 'Exportée',
};

const REASONS = ['suite à curage', 'suite aux sondages', 'suite aux travaux', 'après de fortes pluies', 'relevé des témoins de fissure'];

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
            <a class="card visit" [routerLink]="['v', v.id]" [class.current]="v.id === latest()?.id">
              <strong>{{ v.revision === 0 ? 'Visite initiale' : 'Mise à jour ' + v.revision }}</strong>
              @if (v.reason) { <span class="reason">{{ v.reason }}</span> }
              <span class="badge" [class.badge-ok]="v.status !== 'draft'">{{ statusLabels[v.status] }}</span>
              @if (v.id !== latest()?.id) { <span class="badge">Lecture seule</span> }
              <span class="hint">
                @if (v.fields['date-visite']) { {{ $any(v.fields['date-visite']) | date: 'dd/MM/yyyy à HH:mm' }} · }
                {{ v.instances.length }} fiches
                @if (v.exportedAt) { · sauvegardée le {{ v.exportedAt | date: 'dd/MM/yyyy' }} }
              </span>
            </a>
          }
          <div class="row">
            <button class="btn btn-primary" type="button" [disabled]="!canUpdate()" (click)="newRevision()">+ Nouvelle mise à jour</button>
            <button class="btn" type="button" [disabled]="exporting()" (click)="export()">
              {{ exporting() ? 'Préparation…' : '⇪ Exporter une sauvegarde' }}
            </button>
          </div>
          @if (!canUpdate()) {
            <p class="hint">Clôturez la dernière visite (page « Synthèse et clôture ») pour créer une mise à jour.</p>
          }
          @if (needsExport()) {
            <p class="banner banner-warn">Ce dossier a des modifications non sauvegardées : exportez-le pour le mettre à l'abri.</p>
          }
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
    .visit.current { border-color: var(--primary); }
    .reason { color: var(--revision); font-weight: 600; }
  `,
})
export class ProjectPage {
  readonly projectId = input.required<string>();
  private readonly data = inject(DataService);
  private readonly dialogs = inject(DialogService);
  private readonly backup = inject(BackupService);
  private readonly router = inject(Router);

  readonly statusLabels = STATUS_LABELS;
  readonly project = signal<Project | null>(null);
  readonly visits = signal<Visit[]>([]);
  readonly missing = signal(false);
  readonly exporting = signal(false);
  readonly latest = computed(() => this.visits().at(-1));
  readonly canUpdate = computed(() => !!this.latest() && this.latest()!.status !== 'draft');
  readonly needsExport = computed(() => this.visits().some((v) => DiagRepository.needsExport(v)));
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

  async newRevision(): Promise<void> {
    const p = this.project();
    if (!p) return;
    const reason = await this.dialogs.prompt('Nouvelle mise à jour : motif', {
      suggestions: REASONS, initial: 'suite à curage', confirmLabel: 'Créer la mise à jour',
    });
    if (reason === null) return;
    try {
      const visit = await this.data.repo.createRevision(p.id, reason);
      const template = p.templateSnapshot;
      if (template.visitFields.some((f) => f.id === 'date-visite' && f.type === 'datetime')) {
        await this.data.repo.updateVisitFields(visit.id, { 'date-visite': localDateTime() });
      }
      await this.router.navigate(['/dossiers', p.id, 'v', visit.id, 'conditions']);
    } catch (e) {
      this.dialogs.notify((e as Error).message, true);
    }
  }

  async export(): Promise<void> {
    const p = this.project();
    if (!p) return;
    this.exporting.set(true);
    try {
      if (await this.backup.exportProject(p.id)) await this.load(p.id);
    } finally {
      this.exporting.set(false);
    }
  }
}
