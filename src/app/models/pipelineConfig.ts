import { Layer, normalizeParams, ParameterValueMap } from './layerDefinition';
import { BASE_LAYERS, findBaseLayer, findFilterLayer } from './layerRegistry';

export interface LayerConfig {
  type: string;
  params: ParameterValueMap;
}

export interface FilterConfig extends LayerConfig {
  id?: number;
  enabled: boolean;
}

export interface PipelineConfig {
  seed: number;
  base: LayerConfig;
  filters: FilterConfig[];
}

export interface StepSpec {
  id: string;
  key: string;
  name: string;
  type: string;
  params: ParameterValueMap;
  seed: number;
}

export function pipelineSteps(config: PipelineConfig): StepSpec[] {
  const base = findBaseLayer(config.base.type) ?? BASE_LAYERS[0];
  const lineage: unknown[] = [];
  const steps = [createStep(`base:${base.type}`, base, config.base.params, config.seed, lineage)];

  config.filters.forEach((filter, index) => {
    const definition = findFilterLayer(filter.type);
    if (definition && filter.enabled) {
      steps.push(createStep(`filter:${filter.id ?? index}`, definition, filter.params, config.seed, lineage));
    }
  });

  return steps;
}

export function finalKey(steps: readonly StepSpec[]) {
  return steps.at(-1)?.key;
}

function createStep(
  id: string,
  definition: Layer,
  rawParams: ParameterValueMap,
  seed: number,
  lineage: unknown[],
): StepSpec {
  const params = normalizeParams(definition.parameters, rawParams);
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]]);
  lineage.push([definition.type, seed, sortedParams]);
  return { id, key: JSON.stringify(lineage), name: definition.name, type: definition.type, params, seed };
}
