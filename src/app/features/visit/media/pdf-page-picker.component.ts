import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PdfChoice } from '../visit-store';

/** Choix de la page à importer dans un PDF de plusieurs pages. */
@Component({
  selector: 'app-pdf-page-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="choice().choose(null)"></div>
    <div class="dialog card" role="dialog" aria-modal="true" aria-label="Choisir la page du plan">
      <h2>Quelle page importer ?</h2>
      <p class="hint">{{ choice().pageCount }} pages dans ce PDF.</p>
      <ul class="pages">
        @for (i of pages(); track i) {
          <li>
            <button class="page" type="button" (click)="choice().choose(i)" [attr.aria-label]="'Page ' + (i + 1)">
              @if (choice().thumbs[i]; as url) { <img [src]="url" alt="" /> } @else { <span class="hint">…</span> }
              <span class="num">Page {{ i + 1 }}</span>
            </button>
          </li>
        }
      </ul>
      <div class="row end">
        <button class="btn" type="button" (click)="choice().choose(null)">Annuler</button>
      </div>
    </div>
  `,
  styles: `
    .backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / .5); }
    .dialog {
      position: fixed; z-index: 51; left: 50%; top: 6vh; transform: translateX(-50%);
      width: min(900px, calc(100vw - 24px)); max-height: 88vh; overflow-y: auto;
    }
    .pages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .page {
      width: 100%; min-height: 150px; padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 6px;
      border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface); cursor: pointer;
    }
    .page img { max-width: 100%; max-height: 180px; background: #fff; }
    .num { font-weight: 700; }
    .end { justify-content: flex-end; margin-top: 12px; }
  `,
})
export class PdfPagePickerComponent {
  readonly choice = input.required<PdfChoice>();
  pages(): number[] {
    return Array.from({ length: this.choice().pageCount }, (_, i) => i);
  }
}
