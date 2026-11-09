import { computed, signal, WritableSignal } from '@angular/core';
import {
  Layer,
  normalizeParams,
  NumberSpec,
  ParameterSpec,
  ParameterValueMap,
  SelectOption,
  SelectSpec,
  TextSpec,
} from './layerDefinition';

export class NumberParameter {
  readonly type = 'number';
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: WritableSignal<number>;

  constructor(spec: NumberSpec) {
    this.label = spec.label;
    this.min = spec.min;
    this.max = spec.max;
    this.step = spec.step;
    this.value = signal(spec.initial);
  }
}

export class TextParameter {
  readonly type = 'text';
  readonly label: string;
  readonly value: WritableSignal<string>;
  readonly error = computed(() => this.spec.validate?.(this.value()));

  constructor(private readonly spec: TextSpec) {
    this.label = spec.label;
    this.value = signal(spec.initial);
  }
}

export class SelectParameter {
  readonly type = 'select';
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly value: WritableSignal<string>;

  constructor(spec: SelectSpec) {
    this.label = spec.label;
    this.options = spec.options;
    this.value = signal(spec.initial);
  }
}

export type LayerParameter = NumberParameter | TextParameter | SelectParameter;

function createParameter(spec: ParameterSpec): LayerParameter {
  switch (spec.kind) {
    case 'number':
      return new NumberParameter(spec);
    case 'text':
      return new TextParameter(spec);
    case 'select':
      return new SelectParameter(spec);
  }
}

export class EditableLayer<D extends Layer = Layer> {
  readonly parameters: Record<string, LayerParameter>;

  constructor(readonly definition: D) {
    this.parameters = Object.fromEntries(
      Object.entries(definition.parameters).map(([key, spec]) => [key, createParameter(spec)]),
    );
  }

  get name() {
    return this.definition.name;
  }

  values(): ParameterValueMap {
    return Object.fromEntries(
      Object.entries(this.parameters).map(([key, parameter]) => [key, parameter.value()]),
    );
  }

  apply(params: ParameterValueMap) {
    const values = normalizeParams(this.definition.parameters, params);
    for (const [key, parameter] of Object.entries(this.parameters)) {
      (parameter.value as WritableSignal<number | string>).set(values[key]);
    }
  }
}
