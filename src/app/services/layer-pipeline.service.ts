import { computed, inject, Service } from '@angular/core';
import { BaseLayer } from '../models/baseLayer';
import { FilterLayer } from '../models/filterLayer';
import { LayerImage } from '../models/layerImage';
import { LayerState } from './layer-state.service';

export interface LayerStep {
  id: string;
  name: string;
  result: LayerImage;
  renderLayers: () => LayerImage[];
}

@Service()
export class LayerPipeline {
  private state = inject(LayerState);

  readonly steps = computed(() => {
    const seed = this.state.seed();
    const steps = [this.baseStep(this.state.selectedBaseLayer(), seed)];
    for (const filter of this.state.filterLayers) {
      if (filter.enabled()) {
        steps.push(this.filterStep(filter.layer, steps[steps.length - 1].result, seed));
      }
    }
    return steps;
  });

  readonly result = computed(() => {
    const steps = this.steps();
    return steps[steps.length - 1].result;
  });

  private baseStep(layer: BaseLayer, seed: number): LayerStep {
    return {
      id: `base:${layer.name}`,
      name: layer.name,
      result: layer.renderResult(seed).asZeroElevation(),
      renderLayers: () => layer.renderLayers(seed),
    };
  }

  private filterStep(layer: FilterLayer, source: LayerImage, seed: number): LayerStep {
    return {
      id: `filter:${layer.name}`,
      name: layer.name,
      result: layer.renderResult(source, seed),
      renderLayers: () => layer.renderLayers(source, seed),
    };
  }
}
