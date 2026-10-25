import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { DiagRepository, ProjectSummary } from '../../core/db/diag-repository';
import { VisitStatus } from '../../core/model/data';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { formatBytes, StorageService } from '../../core/services/storage.service';
import { TemplateCatalogService } from '../../core/services/template-catalog.service';

type Tab = VisitStatus;

const TABS: { id: Tab; label: string }[] = [
  { id: 'draft', label: 'En cours' },
  { id: 'closed', label: 'Terminés' },
  { id: 'exported', label: 'Exportés' },
];

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, DatePipe],
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
  readonly tab = signal<Tab>('draft');
  readonly showWhy = signal(false);

  readonly projects = toSignal(from(liveQuery(() => this.data.repo.listProjects())), { initialValue: null });

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

  field(s: ProjectSummary, id: string): string {
    const v = s.project.fields[id];
    return typeof v === 'string' ? v : '';
  }

  visitDate(s: ProjectSummary): string | null {
    const v = s.latestVisit.fields['date-visite'];
    return typeof v === 'string' && v ? v : null;
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
