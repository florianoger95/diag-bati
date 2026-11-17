import { afterRenderEffect, DestroyRef, Directive, ElementRef, HostListener, inject, input } from '@angular/core';

/** Ajuste la hauteur d'un textarea à son contenu (longues observations dictées). */
@Directive({ selector: 'textarea[appAutoGrow]' })
export class AutoGrowDirective {
  /** Valeur liée : sert seulement à redimensionner quand elle change. */
  readonly appAutoGrow = input<unknown>();
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef).nativeElement;
  private width = 0;

  constructor() {
    afterRenderEffect(() => {
      this.appAutoGrow();
      this.resize();
    });
    // la largeur change aussi (repères posés à côté, rotation de l'iPad) : le texte se replie autrement
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        const width = this.el.clientWidth;
        if (width && width !== this.width) {
          this.width = width;
          this.resize();
        }
      });
      observer.observe(this.el);
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
  }

  @HostListener('input')
  resize(): void {
    this.el.style.height = 'auto';
    this.el.style.height = `${this.el.scrollHeight + 4}px`;
  }
}
