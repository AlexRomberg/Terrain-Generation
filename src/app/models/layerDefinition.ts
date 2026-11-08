import { LayerImage } from './layerImage';

export interface NumberSpec {
  kind: 'number';
  label: string;
  initial: number;
  min: number;
  max: number;
  step: number;
}

export interface TextSpec {
  kind: 'text';
  label: string;
  initial: string;
  validate?: (value: string) => string | undefined;
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectSpec<T extends string = string> {
  kind: 'select';
  label: string;
  initial: T;
  options: readonly SelectOption<T>[];
}

export type ParameterSpec = NumberSpec | TextSpec | SelectSpec;
export type ParameterSpecs = Record<string, ParameterSpec>;
export type ParameterValue = number | string;
export type ParameterValueMap = Record<string, ParameterValue>;

type ValueOf<S> = S extends NumberSpec ? number : S extends SelectSpec<infer T> ? T : string;
export type ParameterValues<P extends ParameterSpecs> = { [K in keyof P]: ValueOf<P[K]> };

export function numberParam(label: string, initial: number, min: number, max: number, step: number): NumberSpec {
  return { kind: 'number', label, initial, min, max, step };
}

export function textParam(label: string, initial: string, validate?: TextSpec['validate']): TextSpec {
  return { kind: 'text', label, initial, validate };
}

export function selectParam<T extends string>(label: string, initial: T, options: readonly SelectOption<T>[]): SelectSpec<T> {
  return { kind: 'select', label, initial, options };
}

export type ProgressReporter = (fraction: number) => void;

export interface RenderContext {
  seed: number;
  report: ProgressReporter;
}

export function scaleReport(report: ProgressReporter, from: number, to: number): ProgressReporter {
  return (fraction) => report(from + (to - from) * fraction);
}

export interface BaseLayer<P extends ParameterSpecs = ParameterSpecs> {
  readonly role: 'base';
  readonly type: string;
  readonly name: string;
  readonly parameters: P;
  render(params: ParameterValues<P>, context: RenderContext): LayerImage;
  renderLayers(params: ParameterValues<P>, context: RenderContext): LayerImage[];
}

export interface FilterLayer<P extends ParameterSpecs = ParameterSpecs> {
  readonly role: 'filter';
  readonly type: string;
  readonly name: string;
  readonly parameters: P;
  render(source: LayerImage, params: ParameterValues<P>, context: RenderContext): LayerImage;
  renderLayers(source: LayerImage, params: ParameterValues<P>, context: RenderContext): LayerImage[];
}

export type Layer = BaseLayer | FilterLayer;

export function normalizeParams(specs: ParameterSpecs, params: Partial<ParameterValueMap> = {}): ParameterValueMap {
  return Object.fromEntries(
    Object.entries(specs).map(([key, spec]) => [key, validValue(spec, params[key])]),
  );
}

function validValue(spec: ParameterSpec, value: ParameterValue | undefined): ParameterValue {
  switch (spec.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : spec.initial;
    case 'text':
      return typeof value === 'string' ? value : spec.initial;
    case 'select':
      return spec.options.some((option) => option.value === value) ? (value as string) : spec.initial;
  }
}
