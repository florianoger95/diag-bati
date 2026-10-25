import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface PhotoView {
  id: string;
  number: number;
  caption: string;
  kind: 'photo' | 'plan' | 'sketch';
  url?: string;
  annotated: boolean;
}

export type MediaSource = 'camera' | 'library' | 'pdf' | 'plan-photo' | 'sketch';

export interface MediaRequest {
  source: MediaSource;
  files?: File[];
}

/** Vignettes numérotées + boutons d'ajout (appareil photo, photothèque, plan PDF, croquis). */
@Component({
  selector: 'app-photo-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showThumbs() && photos().length) {
      <ul class="thumbs" aria-label="Photos">
        @for (p of photos(); track p.id) {
          <li>
            <button class="thumb" type="button" (click)="open.emit(p.id)"
                    [attr.aria-label]="label(p) + (p.caption ? ' — ' + p.caption : '')">
              @if (p.url) { <img [src]="p.url" alt="" loading="lazy" /> }
              <span class="num">{{ p.number }}</span>
              @if (p.annotated) { <span class="mark" aria-hidden="true">✎</span> }
              @if (p.caption) { <span class="caption">{{ p.caption }}</span> }
            </button>
          </li>
        }
      </ul>
    }
    @if (!readonly() && showActions()) {
      <div class="actions">
        @if (mode() === 'plan') {
          <button class="btn btn-small" type="button" (click)="pdf.click()">📄 Plan PDF</button>
          <button class="btn btn-small" type="button" (click)="planCam.click()">📷 Photo d'un plan</button>
          <button class="btn btn-small" type="button" (click)="add.emit({ source: 'sketch' })">✏️ Croquis</button>
        } @else {
          <button class="btn btn-small" type="button" (click)="cam.click()"
                  [attr.aria-label]="mode() === 'compact' ? 'Prendre une photo' : null">📷{{ mode() === 'compact' ? '' : ' Appareil photo' }}</button>
          <button class="btn btn-small" type="button" (click)="lib.click()"
                  [attr.aria-label]="mode() === 'compact' ? 'Ajouter depuis la photothèque' : null">🖼{{ mode() === 'compact' ? '' : ' Photothèque' }}</button>
        }
      </div>
      <input #cam type="file" accept="image/*" capture="environment" hidden (change)="pick($event, 'camera')" />
      <input #lib type="file" accept="image/*" multiple hidden (change)="pick($event, 'library')" data-testid="photo-library" />
      <input #planCam type="file" accept="image/*" capture="environment" hidden (change)="pick($event, 'plan-photo')" />
      <input #pdf type="file" accept="application/pdf" hidden (change)="pick($event, 'pdf')" data-testid="plan-pdf" />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .thumbs { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .thumb {
      position: relative; display: block; width: 112px; height: 112px; padding: 0; overflow: hidden;
      border: 2px solid var(--border); border-radius: var(--radius); background: var(--surface); cursor: pointer;
    }
    .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .num, .mark {
      position: absolute; top: 4px; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px;
      background: var(--primary); color: #fff;
    }
    .num { left: 4px; }
    .mark { right: 4px; background: #c98a00; color: #000; }
    .caption {
      position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 6px; font-size: 13px; line-height: 1.3;
      background: rgb(0 0 0 / .65); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  `,
})
export class PhotoStripComponent {
  readonly photos = input<PhotoView[]>([]);
  readonly mode = input<'photo' | 'plan' | 'compact'>('photo');
  readonly readonly = input(false);
  readonly showThumbs = input(true);
  readonly showActions = input(true);
  readonly add = output<MediaRequest>();
  readonly open = output<string>();

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
