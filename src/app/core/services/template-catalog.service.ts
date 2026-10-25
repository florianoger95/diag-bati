import { inject, Injectable, signal } from '@angular/core';
import { ChecklistTemplate } from '../model/template';
import { validateTemplate } from '../templates/template-validator';
import { DataService } from './data.service';

export interface CatalogError {
  file: string;
  errors: string[];
}

const CUSTOM_KEY = 'templates:custom';

/**
 * Modèles de fiches : ceux livrés avec l'app (précachés), plus ceux importés sur l'iPad
 * (un modèle importé remplace le modèle livré de même identifiant).
 */
@Injectable({ providedIn: 'root' })
export class TemplateCatalogService {
  private readonly data = inject(DataService);
  readonly templates = signal<ChecklistTemplate[]>([]);
  readonly errors = signal<CatalogError[]>([]);
  readonly loaded = signal(false);
  /** Identifiants des modèles importés sur cet iPad. */
  readonly customIds = signal<Set<string>>(new Set());
  private shipped: ChecklistTemplate[] = [];
  private loading?: Promise<void>;

  load(): Promise<void> {
    this.loading ??= this.doLoad();
    return this.loading;
  }

  private async fetchJson(file: string): Promise<unknown> {
    const response = await fetch(new URL(`templates/${file}`, document.baseURI));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  private async doLoad(): Promise<void> {
    const errors: CatalogError[] = [];
    const templates: ChecklistTemplate[] = [];
    try {
      const index = (await this.fetchJson('index.json')) as { templates?: string[] };
      for (const file of index.templates ?? []) {
        try {
          const result = validateTemplate(await this.fetchJson(file));
          if (result.ok && result.template) templates.push(result.template);
          else errors.push({ file, errors: result.errors });
        } catch (e) {
          errors.push({ file, errors: [`Lecture impossible : ${(e as Error).message}`] });
        }
      }
    } catch (e) {
      errors.push({ file: 'index.json', errors: [`Lecture impossible : ${(e as Error).message}`] });
    }
    this.shipped = templates;
    this.errors.set(errors);
    await this.merge();
    this.loaded.set(true);
  }

  private async custom(): Promise<ChecklistTemplate[]> {
    return (await this.data.getSetting<ChecklistTemplate[]>(CUSTOM_KEY)) ?? [];
  }

  private async merge(): Promise<void> {
    const custom = await this.custom();
    const ids = new Set(custom.map((t) => t.templateId));
    this.customIds.set(ids);
    this.templates.set([...this.shipped.filter((t) => !ids.has(t.templateId)), ...custom]);
  }

  /** Importe un modèle JSON (vérifié) ; renvoie le libellé du modèle. */
  async importTemplate(file: File): Promise<string> {
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      throw new Error("Ce fichier n'est pas un JSON valide.");
    }
    const result = validateTemplate(json);
    if (!result.ok || !result.template) {
      throw new Error(`Modèle refusé : ${result.errors.slice(0, 3).join(' ; ')}${result.errors.length > 3 ? '…' : ''}`);
    }
    const template = result.template;
    const custom = (await this.custom()).filter((t) => t.templateId !== template.templateId);
    await this.data.setSetting(CUSTOM_KEY, [...custom, template]);
    await this.merge();
    return `${template.label} (v${template.version})`;
  }

  async removeCustom(templateId: string): Promise<void> {
    await this.data.setSetting(CUSTOM_KEY, (await this.custom()).filter((t) => t.templateId !== templateId));
    await this.merge();
  }
}
