import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnswerValue } from '../../core/model/data';
import { FieldChange, ItemFieldComponent } from './fields/item-field.component';
import { VisitStore } from './visit-store';

/** Page de garde : informations du projet et conditions de la visite. */
@Component({
  selector: 'app-conditions-page',
  imports: [RouterLink, ItemFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.template(); as t) {
      <div class="page stack">
        <h1>Conditions de visite</h1>
        @for (item of t.visitFields; track item.id) {
          <app-item-field [item]="item" [state]="{ value: visitValue(item.id), observation: '' }" [allowDefect]="false"
                          [readonly]="store.readOnly()" (changed)="setVisit(item.id, $event)" />
        }
        <h2 class="sub">Projet</h2>
        @for (item of t.projectFields; track item.id) {
          <app-item-field [item]="item" [state]="{ value: projectValue(item.id), observation: '' }" [allowDefect]="false"
                          [readonly]="store.readOnly()" (changed)="setProject(item.id, $event)" />
        }
        @if (first(); as f) {
          <div class="row">
            <span class="spacer"></span>
            <a class="btn btn-primary" [routerLink]="store.link('i', f.id)">Commencer : {{ f.label }} →</a>
          </div>
        }
      </div>
    }
  `,
  styles: `.sub { margin-top: 16px; }`,
})
export class ConditionsPage {
  readonly store = inject(VisitStore);
  readonly first = computed(() => this.store.orderedInstances()[0]);
  readonly base = computed(() => {
    const v = this.store.visit();
    return v ? ['/dossiers', v.projectId, 'v', v.id] : [];
  });

  visitValue(id: string): AnswerValue {
    return (this.store.visit()?.fields[id] as AnswerValue) ?? null;
  }

  projectValue(id: string): AnswerValue {
    return (this.store.project()?.fields[id] as AnswerValue) ?? null;
  }

  setVisit(id: string, change: FieldChange): void {
    if ('value' in change.patch) void this.store.setVisitField(id, change.patch.value ?? null);
  }

  setProject(id: string, change: FieldChange): void {
    if ('value' in change.patch) void this.store.setProjectField(id, change.patch.value ?? null);
  }
}
