import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CabinetService } from '../../core/services/cabinet.service';
import { DialogService } from '../../core/services/dialog.service';
import { formatBytes } from '../../core/services/storage.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { VisitStore } from '../visit/visit-store';
import { GeneratedReport, generateReport } from './generate-report';

interface Result extends GeneratedReport {
  url: string;
  format: 'pdf' | 'docx';
  seconds: number;
}

/** Génération et partage du rapport PDF / Word, hors ligne. */
@Component({
  selector: 'app-report-page',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report.page.html',
  styles: `
    .check-list .what { flex: 1; }
    .check-list li.ok .i { color: var(--ok); }
    .check-list li.warn .i { color: var(--warn); }
    .generate .btn { min-height: var(--target-lg); padding: 0 28px; }
    .bar { height: 12px; border-radius: 6px; background: var(--surface-2); overflow: hidden; }
    .bar span { display: block; height: 100%; background: var(--primary); transition: width .2s; }
    .result { box-shadow: var(--shadow-card), inset 4px 0 0 var(--brand); }
  `,
})
export class ReportPage {
  readonly store = inject(VisitStore);
  readonly cabinet = inject(CabinetService);
  private readonly dialogs = inject(DialogService);

  readonly busy = signal<'pdf' | 'docx' | null>(null);
  readonly step = signal<{ label: string; done: number; total: number } | null>(null);
  readonly results = signal<Result[]>([]);
  readonly formatBytes = formatBytes;
  readonly canShare = typeof navigator.share === 'function';

  readonly photoCount = computed(() => this.store.photos().length);
  readonly ready = computed(() => !!this.cabinet.config());

  constructor() {
    void this.cabinet.load();
    inject(DestroyRef).onDestroy(() => this.results().forEach((r) => URL.revokeObjectURL(r.url)));
  }

  async generate(format: 'pdf' | 'docx'): Promise<void> {
    const project = this.store.project();
    const visit = this.store.visit();
    const template = this.store.template();
    const config = this.cabinet.config();
    if (!project || !visit || !template || !config || this.busy()) return;
    this.busy.set(format);
    const started = performance.now();
    try {
      await this.store.flush();
      const report = await generateReport(format, {
        project, visit, template, config,
        answers: [...this.store.answers().values()],
        photos: this.store.photos(),
        getBlob: (id) => this.store.getBlob(id),
        lexicon: this.cabinet.lexicon(),
        firm: this.cabinet.firm(),
        logo: this.cabinet.logo(), font: this.cabinet.font(), annex: this.cabinet.annex(),
        history: await this.store.history(),
        onProgress: (label, done, total) => this.step.set({ label, done, total }),
      });
      const result: Result = {
        ...report, format, url: URL.createObjectURL(report.blob),
        seconds: Math.round((performance.now() - started) / 100) / 10,
      };
      this.results.update((list) => {
        list.filter((r) => r.format === format).forEach((r) => URL.revokeObjectURL(r.url));
        return [result, ...list.filter((r) => r.format !== format)];
      });
    } catch (e) {
      const quota = (e as Error)?.name === 'QuotaExceededError' || /memory|mémoire/i.test((e as Error)?.message ?? '');
      this.dialogs.notify(quota ? 'Mémoire insuffisante pour générer le rapport : fermez les autres apps et réessayez.' : `Génération impossible : ${(e as Error).message}`, true);
    } finally {
      this.busy.set(null);
      this.step.set(null);
    }
  }

  async share(result: Result): Promise<void> {
    const file = new File([result.blob], result.fileName, { type: result.blob.type });
    try {
      if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('partage de fichiers indisponible');
      await navigator.share({ files: [file], title: result.fileName });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      this.dialogs.notify('Partage indisponible : utilisez « Ouvrir / enregistrer ».', true);
    }
  }

  percent(): number {
    const s = this.step();
    return s && s.total ? Math.round((100 * s.done) / s.total) : 0;
  }
}
