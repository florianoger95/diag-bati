import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './ui/icon.component';

export interface PhotoView {
  id: string;
  number: number;
  caption: string;
  kind: 'photo' | 'plan' | 'sketch';
  url?: string;
  annotated: boolean;
  /** Photo située sur un plan. */
  located?: boolean;
}

export type MediaSource = 'camera' | 'library' | 'pdf' | 'plan-photo' | 'sketch';

export interface MediaRequest {
  source: MediaSource;
  files?: File[];
}

/** Vignettes numérotées + boutons d'ajout (appareil photo, photothèque, plan PDF, croquis). */
@Component({
  selector: 'app-photo-strip',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showThumbs() && photos().length) {
      <ul class="thumbs" aria-label="Photos">
        @for (p of photos(); track p.id) {
          <li>
            <button class="thumb" type="button" (click)="touch(p)"
                    [attr.aria-pressed]="selectable() && p.kind === 'photo' ? selected() === p.id : null"
                    [attr.aria-label]="label(p) + (p.caption ? ' — ' + p.caption : '') + (p.located ? ' (située sur le plan)' : '')">
              @if (p.url) { <img [src]="p.url" alt="" loading="lazy" /> }
              <span class="thumb-num">{{ p.number }}</span>
              @if (p.annotated) { <span class="thumb-flag is-annotated" aria-hidden="true"><app-icon name="pen" size="sm" /></span> }
              @if (p.located) { <span class="thumb-flag is-located" title="Située sur le plan"><app-icon name="pin" size="sm" /></span> }
              @if (p.caption) { <span class="caption">{{ p.caption }}</span> }
            </button>
          </li>
        }
      </ul>
    }
    @if (!readonly() && showActions()) {
      <div class="actions">
        @if (mode() === 'plan') {
          <button class="btn btn-small" type="button" (click)="pdf.click()"><app-icon name="doc" size="sm" />Plan PDF</button>
          <button class="btn btn-small" type="button" (click)="planImage.click()"><app-icon name="image" size="sm" />Image du plan</button>
          <button class="btn btn-small" type="button" (click)="planCam.click()"><app-icon name="camera" size="sm" />Photo d'un plan</button>
          <button class="btn btn-small" type="button" (click)="add.emit({ source: 'sketch' })"><app-icon name="pen" size="sm" />Croquis</button>
        } @else {
          <button class="btn btn-small" type="button" (click)="cam.click()"
                  [attr.aria-label]="mode() === 'compact' ? 'Prendre une photo' : null"><app-icon name="camera" />{{ mode() === 'compact' ? '' : 'Appareil photo' }}</button>
          <button class="btn btn-small" type="button" (click)="lib.click()"
                  [attr.aria-label]="mode() === 'compact' ? 'Ajouter depuis la photothèque' : null"><app-icon name="image" />{{ mode() === 'compact' ? '' : 'Photothèque' }}</button>
        }
      </div>
      <input #cam type="file" accept="image/*" capture="environment" hidden (change)="pick($event, 'camera')" />
      <input #lib type="file" accept="image/*" multiple hidden (change)="pick($event, 'library')" data-testid="photo-library" />
      <input #planCam type="file" accept="image/*" capture="environment" hidden (change)="pick($event, 'plan-photo')" />
      <input #planImage type="file" accept="image/*" hidden (change)="pick($event, 'plan-photo')" data-testid="plan-image" />
      <input #pdf type="file" accept="application/pdf" hidden (change)="pick($event, 'pdf')" data-testid="plan-pdf" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .thumbs { list-style: none; margin: 0; padding: 0; gap: var(--s-2); }
    .thumb { display: block; width: 120px; height: 96px; box-shadow: inset 0 0 0 1px var(--border-soft); }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .caption {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 6px; font-size: 13px; line-height: 1.3;
      background: rgb(25 28 31 / .75); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .thumb:has(.caption) .thumb-flag { bottom: 26px; }
    .thumb[aria-pressed='true'] { outline: 4px solid var(--brand); outline-offset: 3px; }
    .thumbs { padding: 4px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  `,
})
export class PhotoStripComponent {
  readonly photos = input<PhotoView[]>([]);
  readonly mode = input<'photo' | 'plan' | 'compact'>('photo');
  readonly readonly = input(false);
  readonly showThumbs = input(true);
  readonly showActions = input(true);
  /** Toucher une photo la sélectionne (« Situer photo n »), la toucher à nouveau l'ouvre. Plans et croquis s'ouvrent directement. */
  readonly selectable = input(false);
  readonly selected = input<string | null>(null);
  readonly add = output<MediaRequest>();
  readonly open = output<string>();
  readonly selectPhoto = output<string>();

  touch(p: PhotoView): void {
    if (this.selectable() && p.kind === 'photo' && this.selected() !== p.id) this.selectPhoto.emit(p.id);
    else this.open.emit(p.id);
  }

  label(p: PhotoView): string {
    return `${p.kind === 'photo' ? 'Photo' : p.kind === 'plan' ? 'Plan' : 'Croquis'} ${p.number}`;
  }

  pick(event: Event, source: MediaSource): void {
    const el = event.target as HTMLInputElement;
    const files = [...(el.files ?? [])];
    el.value = ''; // permet de reprendre la même photo
    if (files.length) this.add.emit({ source, files });
  }
}
