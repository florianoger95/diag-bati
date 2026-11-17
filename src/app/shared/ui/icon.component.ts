import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { IconName, ICONS } from './icons';

/**
 * Icône au trait du design system 3DE, dessinée en ligne (hors ligne, sans sprite).
 * Décorative : le bouton qui la contient porte le libellé (ou un `aria-label` s'il n'a que l'icône).
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `<svg class="i" [class.i-sm]="size() === 'sm'" [class.i-lg]="size() === 'lg'" viewBox="0 0 24 24"
                  aria-hidden="true" focusable="false" [innerHTML]="svg()"></svg>`,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<IconName>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  // tracés constants du design system : aucun contenu externe
  readonly svg = computed(() => this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]));
}
