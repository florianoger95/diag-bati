import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AssetKey } from '../../core/db/diag-repository';
import { BackupService } from '../../core/services/backup.service';
import { CabinetService } from '../../core/services/cabinet.service';
import { TemplateCatalogService } from '../../core/services/template-catalog.service';
import { DialogService } from '../../core/services/dialog.service';
import { formatBytes, StorageService } from '../../core/services/storage.service';
import { AutoGrowDirective } from '../../shared/auto-grow.directive';

/** Réglages : identité du cabinet et fichiers importés sur l'iPad (jamais publiés sur le site). */
@Component({
  selector: 'app-settings-page',
  imports: [RouterLink, DatePipe, AutoGrowDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styles: `
    .preview { max-height: 80px; max-width: 280px; background: #fff; border: 1px solid var(--surface-2); padding: 4px; }
    .file { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .ok { color: var(--ok); font-weight: 700; }
    .missing { color: var(--warn); font-weight: 700; }
    details { font-size: 16px; }
    .templates { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  `,
})
export class SettingsPage {
  readonly cabinet = inject(CabinetService);
  readonly storage = inject(StorageService);
  readonly catalog = inject(TemplateCatalogService);
  readonly backup = inject(BackupService);
  private readonly dialogs = inject(DialogService);

  readonly name = signal('');
  readonly lines = signal('');
  readonly busy = signal<AssetKey | null>(null);
  readonly logoUrl = signal<string | null>(null);
  readonly formatBytes = formatBytes;
  readonly storageText = computed(() => {
    const info = this.storage.info();
    return info ? `${formatBytes(info.usage)} utilisés sur ${formatBytes(info.quota)}` : null;
  });
  private saveTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.cabinet.load().then(() => {
      const firm = this.cabinet.firm();
      this.name.set(firm.name);
      this.lines.set(firm.lines.join('\n'));
    });
    void this.storage.refresh();
    effect((onCleanup) => {
      const logo = this.cabinet.logo();
      const url = logo ? URL.createObjectURL(logo.blob) : null;
      this.logoUrl.set(url);
      onCleanup(() => url && URL.revokeObjectURL(url));
    });
  }

  onFirm(name: string, lines: string): void {
    this.name.set(name);
    this.lines.set(lines);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.cabinet.setFirm({
      name: name.trim(), lines: lines.split('\n').map((l) => l.trim()).filter(Boolean),
    }), 400);
  }

  async pick(event: Event, key: AssetKey): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set(key);
    try {
      if (key === 'logo') await this.cabinet.importLogo(file);
      else if (key === 'font') await this.cabinet.importFont(file);
      else await this.cabinet.importAnnex(file);
      this.dialogs.notify('Fichier importé.');
      void this.storage.refresh();
    } catch (e) {
      this.dialogs.notify((e as Error).message, true);
    } finally {
      this.busy.set(null);
    }
  }

  async importTemplate(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.dialogs.notify(`Modèle importé : ${await this.catalog.importTemplate(file)}.`);
    } catch (e) {
      this.dialogs.notify((e as Error).message, true);
    }
  }

  async removeTemplate(templateId: string, label: string): Promise<void> {
    if (await this.dialogs.confirm(`Retirer « ${label} » ?`, 'Le modèle livré avec l’app (s’il existe) reprendra sa place.', { confirmLabel: 'Retirer', danger: true })) {
      await this.catalog.removeCustom(templateId);
    }
  }

  async restore(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await this.backup.importFile(file);
    const firm = this.cabinet.firm();
    this.name.set(firm.name);
    this.lines.set(firm.lines.join('\n'));
  }

  async remove(key: AssetKey, label: string): Promise<void> {
    if (!(await this.dialogs.confirm(`Retirer ${label} ?`, 'Le fichier sera supprimé de l’iPad.', { confirmLabel: 'Retirer', danger: true }))) return;
    await this.cabinet.remove(key);
  }
}
