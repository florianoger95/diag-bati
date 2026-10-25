import { afterRenderEffect, Directive, ElementRef, HostListener, inject, input } from '@angular/core';

/** Ajuste la hauteur d'un textarea à son contenu (longues observations dictées). */
@Directive({ selector: 'textarea[appAutoGrow]' })
export class AutoGrowDirective {
  /** Valeur liée : sert seulement à redimensionner quand elle change. */
  readonly appAutoGrow = input<unknown>();
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      this.appAutoGrow();
      this.resize();
    });
  }

  @HostListener('input')
  resize(): void {
    this.el.style.height = 'auto';
    this.el.style.height = `${this.el.scrollHeight + 4}px`;
  }
}
