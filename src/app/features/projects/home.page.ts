import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AppUpdateService } from '../../core/services/app-update.service';
import { BackupService } from '../../core/services/backup.service';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { DiagRepository, ProjectSummary } from '../../core/db/diag-repository';
import { URGENCIES, URGENCY_LABELS, URGENCY_LEVEL, Urgency, VisitStatus } from '../../core/model/data';
import { resolveTemplate, visitOverview, VisitOverview } from '../../core/templates/template-engine';
import { IconComponent } from '../../shared/ui/icon.component';
import { UrgencyMeterComponent } from '../../shared/ui/urgency.component';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { formatBytes, StorageService } from '../../core/services/storage.service';
import { TemplateCatalogService } from '../../core/services/template-catalog.service';

type Tab = VisitStatus;

type ProjectCard = ProjectSummary & { overview: VisitOverview };

const TABS: { id: Tab; label: string }[] = [
  { id: 'draft', label: 'En cours' },
  { id: 'closed', label: 'Terminés' },
  { id: 'exported', label: 'Exportés' },
];

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, DatePipe, IconComponent, UrgencyMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  private readonly data = inject(DataService);
  private readonly dialogs = inject(DialogService);
  readonly storage = inject(StorageService);
  readonly catalog = inject(TemplateCatalogService);

  readonly tabs = TABS;
  private readonly backup = inject(BackupService);
  readonly updates = inject(AppUpdateService);
  private readonly router = inject(Router);
  readonly tab = signal<Tab>('draft');
  readonly showWhy = signal(false);
  readonly exporting = signal<string | null>(null);

  readonly projects = toSignal(from(liveQuery(() => this.loadCards())), { initialValue: null });
  readonly urgencies = URGENCIES;
  readonly urgencyLevel = URGENCY_LEVEL;

  readonly counts = computed(() => {
    const counts: Record<Tab, number> = { draft: 0, closed: 0, exported: 0 };
    for (const s of this.projects() ?? []) counts[s.latestVisit.status]++;
    return counts;
  });

  readonly visible = computed(() => (this.projects() ?? []).filter((s) => s.latestVisit.status === this.tab()));

  readonly unexported = computed(() =>
    (this.projects() ?? []).filter((s) => DiagRepository.needsExport(s.latestVisit)).length,
  );

  readonly storageText = computed(() => {
    const info = this.storage.info();
    if (!info) return null;
    return `${formatBytes(info.usage)} utilisés${info.quota ? ` sur ${formatBytes(info.quota)} disponibles` : ''}`;
  });

  constructor() {
    void this.storage.refresh();
  }

  /** Cartes de l'accueil : dossier, dernière visite et son résumé (réponses, désordres, sondages). */
  private async loadCards(): Promise<ProjectCard[]> {
    const list = await this.data.repo.listProjects();
    return Promise.all(list.map(async (s) => ({
      ...s,
      overview: visitOverview(resolveTemplate(s.project.templateSnapshot), s.latestVisit, await this.data.repo.getAnswers(s.latestVisit.id)),
    })));
  }

  defectLabel(u: Urgency, n: number): string {
    return `${n} ${URGENCY_LABELS[u].toLowerCase()}`;
  }

  percent(c: ProjectCard): number {
    return c.overview.total ? Math.round((100 * c.overview.answered) / c.overview.total) : 0;
  }

  needsExport(s: ProjectSummary): boolean {
    return DiagRepository.needsExport(s.latestVisit);
  }

  visitLabel(s: ProjectSummary): string {
    const v = s.latestVisit;
    const status = v.status === 'draft' ? 'en cours' : v.status === 'closed' ? 'clôturée' : 'exportée';
    return `${v.revision === 0 ? 'Visite initiale' : 'Mise à jour ' + v.revision} ${status}`;
  }

  field(s: ProjectSummary, id: string): string {
    const v = s.project.fields[id];
    return typeof v === 'string' ? v : '';
  }

  visitDate(s: ProjectSummary): string | null {
    const v = s.latestVisit.fields['date-visite'];
    return typeof v === 'string' && v ? v : null;
  }

  async export(s: ProjectSummary): Promise<void> {
    this.exporting.set(s.project.id);
    try {
      await this.backup.exportProject(s.project.id);
    } finally {
      this.exporting.set(null);
    }
  }

  async restore(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const projectId = await this.backup.importFile(file);
    if (projectId) await this.router.navigate(['/dossiers', projectId]);
  }

  async remove(s: ProjectSummary): Promise<void> {
    const name = this.field(s, 'projet') || s.project.reference;
    const ok = await this.dialogs.confirm(
      'Supprimer le dossier ?',
      `« ${name} » (${s.project.reference}) sera effacé de l'iPad avec toutes ses visites, réponses et photos.\n` +
      (DiagRepository.needsExport(s.latestVisit) ? "Il n'a jamais été exporté : il sera définitivement perdu." : ''),
      { confirmLabel: 'Supprimer définitivement', danger: true },
    );
    if (!ok) return;
    await this.data.repo.deleteProject(s.project.id);
    await this.storage.refresh();
    this.dialogs.notify('Dossier supprimé.');
  }
}
