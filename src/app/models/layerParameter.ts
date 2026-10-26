import { computed, signal, WritableSignal } from '@angular/core';

export class NumberParameter {
  readonly type = 'number';
  value: WritableSignal<number>;

  constructor(public label: string, initialValue = 0, public min = 0, public max = 1, public step = 0.01) {
    this.value = signal(initialValue);
  }
}

export class TextParameter {
  readonly type = 'text';
  value: WritableSignal<string>;
  readonly error = computed(() => this.validate(this.value()));

  constructor(
    public label: string,
    initialValue = '',
    private validate: (value: string) => string | undefined = () => undefined,
  ) {
    this.value = signal(initialValue);
  }
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export class SelectParameter<T extends string = string> {
  readonly type = 'select';
  value: WritableSignal<T>;

  constructor(public label: string, initialValue: T, public options: readonly SelectOption<T>[]) {
    this.value = signal(initialValue);
  }
}

export type LayerParameter = NumberParameter | TextParameter | SelectParameter;
