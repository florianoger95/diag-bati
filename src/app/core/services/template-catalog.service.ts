import { Injectable, signal } from '@angular/core';
import { ChecklistTemplate } from '../model/template';
import { validateTemplate } from '../templates/template-validator';

export interface CatalogError {
  file: string;
  errors: string[];
}

/** Charge les modèles JSON livrés avec l'app (précachés par le service worker). */
@Injectable({ providedIn: 'root' })
export class TemplateCatalogService {
  readonly templates = signal<ChecklistTemplate[]>([]);
  readonly errors = signal<CatalogError[]>([]);
  readonly loaded = signal(false);
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
    this.templates.set(templates);
    this.errors.set(errors);
    this.loaded.set(true);
  }
}
