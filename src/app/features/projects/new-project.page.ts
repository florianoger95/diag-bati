import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AnswerValue } from '../../core/model/data';
import { ChecklistTemplate } from '../../core/model/template';
import { DataService } from '../../core/services/data.service';
import { DialogService } from '../../core/services/dialog.service';
import { TemplateCatalogService } from '../../core/services/template-catalog.service';
import { resolveTemplate } from '../../core/templates/template-engine';
import { FieldChange, ItemFieldComponent } from '../visit/fields/item-field.component';

/** Date et heure locales au format d'un input datetime-local. */
export function localDateTime(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

@Component({
  selector: 'app-new-project-page',
  imports: [RouterLink, ItemFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page stack">
      <div class="row">
        <a class="btn btn-ghost" routerLink="/">← Dossiers</a>
      </div>
      <h1>Nouveau dossier</h1>

      <section class="stack" aria-labelledby="choix-modele">
        <h2 id="choix-modele">Modèle de fiches</h2>
        @if (!catalog.loaded()) { <p class="hint">Chargement des modèles…</p> }
        <div class="templates">
          @for (t of catalog.templates(); track t.templateId) {
            <button class="card template" type="button" [attr.aria-pressed]="selected()?.templateId === t.templateId"
                    (click)="select(t)">
              <strong>{{ t.label }}</strong>
              @if (t.description) { <span class="hint">{{ t.description }}</span> }
              <span class="hint">Version {{ t.version }} · {{ t.sections.length }} fiches</span>
            </button>
          }
        </div>
      </section>

      @if (resolved(); as r) {
        <section class="stack" aria-labelledby="champs-projet">
          <h2 id="champs-projet">Le projet</h2>
          @for (item of r.projectFields; track item.id) {
            <app-item-field [item]="item" [state]="{ value: fields()[item.id] ?? null, observation: '' }"
                            [allowDefect]="false" (changed)="setField(item.id, $event)" />
          }
        </section>
        <div class="row">
          <span class="spacer"></span>
          <button class="btn btn-primary" type="button" [disabled]="!canCreate() || busy()" (click)="create()">
            Créer et commencer la visite
          </button>
        </div>
        @if (!canCreate()) { <p class="hint right">Renseignez les champs marqués d'un astérisque.</p> }
      }
    </div>
  `,
  styles: `
    .templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .template { display: flex; flex-direction: column; gap: 6px; text-align: left; cursor: pointer; min-height: 120px; font: inherit; }
    .template[aria-pressed='true'] { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
    .right { text-align: right; }
  `,
})
export class NewProjectPage {
  readonly catalog = inject(TemplateCatalogService);
  private readonly data = inject(DataService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly selected = signal<ChecklistTemplate | null>(null);
  readonly fields = signal<Record<string, AnswerValue>>({});
  readonly busy = signal(false);
  readonly resolved = computed(() => {
    const t = this.selected();
    return t ? resolveTemplate(t) : null;
  });
  readonly canCreate = computed(() => {
    const r = this.resolved();
    if (!r) return false;
    return r.projectFields.every((f) => {
      if (!f.required) return true;
      const v = this.fields()[f.id];
      return typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined;
    });
  });

  constructor() {
    void this.catalog.load().then(() => {
      const templates = this.catalog.templates();
      if (templates.length === 1 || (templates.length && !this.selected())) this.select(templates[0]);
    });
  }

  select(t: ChecklistTemplate): void {
    this.selected.set(t);
  }

  setField(id: string, change: FieldChange): void {
    if ('value' in change.patch) this.fields.update((f) => ({ ...f, [id]: change.patch.value ?? null }));
  }

  async create(): Promise<void> {
    const template = this.selected();
    if (!template || !this.canCreate()) return;
    this.busy.set(true);
    try {
      const { project, visit } = await this.data.repo.createProject(template, this.fields());
      if (template.visitFields.some((f) => f.id === 'date-visite' && f.type === 'datetime')) {
        await this.data.repo.updateVisitFields(visit.id, { 'date-visite': localDateTime() });
      }
      await this.router.navigate(['/dossiers', project.id, 'v', visit.id, 'conditions']);
    } catch (e) {
      this.dialogs.notify(`Création impossible : ${(e as Error).message}`, true);
    } finally {
      this.busy.set(false);
    }
  }
}
