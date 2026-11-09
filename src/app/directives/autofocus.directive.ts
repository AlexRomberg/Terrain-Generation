import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

@Directive({
  selector: 'input[appAutofocus]',
})
export class Autofocus {
  constructor() {
    const input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
    afterNextRender(() =>
      // HACK (ARO): Wait for ngModel to fill in data and afterwards select the input
      queueMicrotask(() => {
        input.focus();
        input.select();
      }),
    );
  }
}
