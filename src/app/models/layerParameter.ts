import { signal, WritableSignal } from '@angular/core';

export class LayerParameter {
  value: WritableSignal<number>;

  constructor(public label: string, initialValue = 0, public min = 0, public max = 1, public step = 0.01) {
    this.value = signal(initialValue);
  }
}
