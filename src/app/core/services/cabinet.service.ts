import { inject, Injectable, signal } from '@angular/core';
import { AssetKey, StoredAsset } from '../db/diag-repository';
import { CompiledLexicon, compileLexicon, Lexicon } from '../report/lexicon';
import { FirmInfo, ReportConfig } from '../report/report-model';
import { DataService } from './data.service';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok) throw new Error(`${path} : HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * Identité du cabinet et fichiers importés sur l'iPad (logo, police, annexe lexique),
 * plus la configuration du rapport et le lexique livrés avec l'app.
 */
@Injectable({ providedIn: 'root' })
export class CabinetService {
  private readonly data = inject(DataService);

  readonly firm = signal<FirmInfo>({ name: '', lines: [] });
  readonly logo = signal<StoredAsset | undefined>(undefined);
  readonly font = signal<StoredAsset | undefined>(undefined);
  readonly annex = signal<StoredAsset | undefined>(undefined);
  readonly config = signal<ReportConfig | null>(null);
  readonly lexicon = signal<CompiledLexicon | null>(null);
  private loading?: Promise<void>;

  load(): Promise<void> {
    this.loading ??= this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    const repo = this.data.repo;
    const [firm, logo, font, annex] = await Promise.all([repo.getFirm(), repo.getAsset('logo'), repo.getAsset('font'), repo.getAsset('annex')]);
    if (firm) this.firm.set(firm);
    this.logo.set(logo);
    this.font.set(font);
    this.annex.set(annex);
    try {
      this.config.set(await fetchJson<ReportConfig>('config/report.config.json'));
      this.lexicon.set(compileLexicon(await fetchJson<Lexicon>('config/lexicon.json')));
    } catch {
      // hors ligne avant la première mise en cache : le rapport l'indiquera
    }
  }

  async setFirm(firm: FirmInfo): Promise<void> {
    this.firm.set(firm);
    await this.data.repo.setFirm(firm);
  }

  /** Logo : converti en PNG s'il n'est ni PNG ni JPEG (HEIC, WebP…). */
  async importLogo(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error("Ce fichier n'est pas une image lisible.");
    });
    try {
      let blob: Blob = file;
      if (!/^image\/(png|jpeg)$/.test(file.type)) {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
        blob = await new Promise<Blob>((r, e) => canvas.toBlob((b) => (b ? r(b) : e(new Error('Conversion impossible.'))), 'image/png'));
        canvas.width = canvas.height = 0;
      }
      await this.save('logo', blob, { name: file.name, width: bitmap.width, height: bitmap.height });
    } finally {
      bitmap.close();
    }
  }

  /** Police TrueType / OpenType : vérifiée avant d'être gardée. */
  async importFont(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { default: fontkit } = await import('@pdf-lib/fontkit');
    let family: string;
    try {
      const font = fontkit.create(bytes as unknown as Parameters<typeof fontkit.create>[0]) as { familyName?: string };
      family = font.familyName ?? file.name;
    } catch {
      throw new Error("Ce fichier n'est pas une police TrueType ou OpenType (.ttf, .otf).");
    }
    await this.save('font', new Blob([bytes], { type: 'font/ttf' }), { name: file.name, family });
  }

  async importAnnex(file: File): Promise<void> {
    const { PDFDocument } = await import('pdf-lib');
    let pages: number;
    try {
      pages = (await PDFDocument.load(await file.arrayBuffer())).getPageCount();
    } catch {
      throw new Error("Ce fichier n'est pas un PDF lisible (ou il est protégé).");
    }
    await this.save('annex', file, { name: file.name, pages });
  }

  async remove(key: AssetKey): Promise<void> {
    await this.data.repo.deleteAsset(key);
    this.signalFor(key).set(undefined);
  }

  private async save(key: AssetKey, blob: Blob, meta: Parameters<DataService['repo']['setAsset']>[2]): Promise<void> {
    await this.data.repo.setAsset(key, blob, meta);
    this.signalFor(key).set(await this.data.repo.getAsset(key));
  }

  private signalFor(key: AssetKey) {
    return key === 'logo' ? this.logo : key === 'font' ? this.font : this.annex;
  }
}
