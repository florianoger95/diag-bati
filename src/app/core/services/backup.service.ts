import { inject, Injectable } from '@angular/core';
import { BackupConflictError, exportProject, exportSettings, importBackup, inspectBackup } from '../backup/backup';
import { CabinetService } from './cabinet.service';
import { DataService } from './data.service';
import { DialogService } from './dialog.service';
import { formatBytes, StorageService } from './storage.service';

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Sauvegarde (export) et restauration (import) des dossiers et des réglages. */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly data = inject(DataService);
  private readonly dialogs = inject(DialogService);
  private readonly cabinet = inject(CabinetService);
  private readonly storage = inject(StorageService);

  /** Feuille de partage de l'iPad (Fichiers, AirDrop, Mail), sinon téléchargement. */
  async saveFile(bytes: Uint8Array | Blob, fileName: string, type: string): Promise<SaveOutcome> {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes.buffer as ArrayBuffer], { type });
    const file = new File([blob], fileName, { type });
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return 'cancelled';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'downloaded';
  }

  /** Exporte un dossier complet ; il est noté « exporté » si la sauvegarde a bien été partagée ou enregistrée. */
  async exportProject(projectId: string): Promise<boolean> {
    try {
      const backup = await exportProject(this.data.repo, projectId);
      const outcome = await this.saveFile(backup.bytes, backup.fileName, 'application/zip');
      if (outcome === 'cancelled') return false;
      for (const visit of await this.data.repo.getVisitsOfProject(projectId)) await this.data.repo.markExported(visit.id);
      this.dialogs.notify(`Sauvegarde enregistrée (${formatBytes(backup.bytes.byteLength)}).`);
      return true;
    } catch (e) {
      this.dialogs.notify(`Export impossible : ${(e as Error).message}`, true);
      return false;
    }
  }

  async exportSettings(): Promise<void> {
    try {
      const backup = await exportSettings(this.data.repo);
      if ((await this.saveFile(backup.bytes, backup.fileName, 'application/zip')) !== 'cancelled') {
        this.dialogs.notify('Réglages sauvegardés.');
      }
    } catch (e) {
      this.dialogs.notify(`Export impossible : ${(e as Error).message}`, true);
    }
  }

  /** Restaure une sauvegarde choisie par l'utilisateur ; renvoie l'id du dossier restauré. */
  async importFile(file: File): Promise<string | null> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const summary = inspectBackup(bytes);
      const date = new Date(summary.exportedAt).toLocaleDateString('fr-FR');
      if (summary.kind === 'settings') {
        const ok = await this.dialogs.confirm('Restaurer les réglages ?',
          `Sauvegarde du ${date} : cabinet, logo, police et annexe remplaceront ceux de cet iPad.`, { confirmLabel: 'Restaurer' });
        if (!ok) return null;
        await importBackup(this.data.repo, bytes);
        await this.cabinet.reload();
        this.dialogs.notify('Réglages restaurés.');
        return null;
      }
      const ok = await this.dialogs.confirm('Restaurer ce dossier ?',
        `${summary.reference} ${summary.name ?? ''}\n${summary.visits} visite(s), ${summary.photos} image(s) — sauvegarde du ${date}.`,
        { confirmLabel: 'Restaurer' });
      if (!ok) return null;
      let result;
      try {
        result = await importBackup(this.data.repo, bytes);
      } catch (e) {
        if (!(e instanceof BackupConflictError)) throw e;
        const choice = await this.dialogs.choose('Ce dossier existe déjà',
          `Le dossier ${e.reference} est déjà sur cet iPad. Le remplacer par la sauvegarde efface ses modifications locales.`,
          [{ id: 'copy', label: 'Importer une copie' }, { id: 'replace', label: 'Remplacer', danger: true, primary: true }]);
        if (!choice) return null;
        result = await importBackup(this.data.repo, bytes, choice as 'copy' | 'replace');
      }
      void this.storage.refresh();
      this.dialogs.notify('Dossier restauré.');
      return result.projectId;
    } catch (e) {
      const quota = (e as Error)?.name === 'QuotaExceededError';
      this.dialogs.notify(quota ? "L'iPad n'a plus assez d'espace pour restaurer ce dossier." : (e as Error).message, true);
      return null;
    }
  }
}
