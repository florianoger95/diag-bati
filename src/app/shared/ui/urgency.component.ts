import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { URGENCY_LABELS, URGENCY_LEVEL, Urgency } from '../../core/model/data';
import { IconComponent } from './icon.component';

/** Jauge de 4 barres d'une urgence (plus il y a de barres pleines, plus c'est urgent). */
@Component({
  selector: 'app-urgency-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'urg-meter', 'aria-hidden': 'true' },
  template: `<i></i><i></i><i></i><i></i>`,
})
export class UrgencyMeterComponent {}

/**
 * Pastille de désordre : icône, jauge, libellé et couleur de l'urgence (jamais la couleur seule).
 * `solid` : pastille pleine (synthèse).
 */
@Component({
  selector: 'app-urgency',
  imports: [IconComponent, UrgencyMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<app-icon name="alert" size="sm" /><app-urgency-meter />{{ prefix() }}{{ label() }}`,
  styles: `:host { display: inline-flex; }`,
})
export class UrgencyComponent {
  readonly urgency = input.required<Urgency>();
  readonly solid = input(false);
  /** Texte avant le libellé (ex. « Désordre · »). */
  readonly prefix = input('');
  readonly label = computed(() => URGENCY_LABELS[this.urgency()]);
  readonly classes = computed(() => `urg urg--${URGENCY_LEVEL[this.urgency()]}${this.solid() ? ' is-solid' : ''}`);
}
