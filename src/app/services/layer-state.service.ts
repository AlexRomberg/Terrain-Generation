import { Service, signal, WritableSignal } from '@angular/core';
import { BaseLayer, FilterLayer } from '../models/layerDefinition';
import { EditableLayer } from '../models/layerParameter';
import { BASE_LAYERS, DEFAULT_FILTER_LAYERS, FILTER_LAYERS, findFilterLayer } from '../models/layerRegistry';
import { PipelineConfig } from '../models/pipelineConfig';

export interface FilterLayerState {
  id: number;
  layer: EditableLayer<FilterLayer>;
  enabled: WritableSignal<boolean>;
  collapsed: WritableSignal<boolean>;
}

@Service()
export class LayerState {
  readonly availableBaseLayers: readonly EditableLayer<BaseLayer>[] = BASE_LAYERS.map(
    (definition) => new EditableLayer(definition),
  );
  readonly selectedBaseLayer = signal(this.availableBaseLayers[0]);

  readonly availableFilterLayers = FILTER_LAYERS;

  private nextFilterId = 0;
  private readonly filterLayerList = signal<readonly FilterLayerState[]>(
    DEFAULT_FILTER_LAYERS.map((definition) => this.createFilterLayer(definition)),
  );
  readonly filterLayers = this.filterLayerList.asReadonly();

  readonly seed = signal(this.generateSeed());

  addFilterLayer(definition: FilterLayer) {
    this.filterLayerList.update((layers) => [...layers, this.createFilterLayer(definition)]);
  }

  removeFilterLayer(id: number) {
    this.filterLayerList.update((layers) => layers.filter((layer) => layer.id !== id));
  }

  moveFilterLayer(id: number, offset: number) {
    this.filterLayerList.update((layers) => {
      const from = layers.findIndex((layer) => layer.id === id);
      const to = from + offset;
      if (from < 0 || to < 0 || to >= layers.length) {
        return layers;
      }
      const reordered = [...layers];
      reordered.splice(to, 0, ...reordered.splice(from, 1));
      return reordered;
    });
  }

  generateSeed() {
    return Math.round(Math.random() * 1000000);
  }

  snapshot(): PipelineConfig {
    const base = this.selectedBaseLayer();
    return {
      seed: this.seed(),
      base: { type: base.definition.type, params: base.values() },
      filters: this.filterLayers().map(({ id, layer, enabled }) => ({
        id,
        type: layer.definition.type,
        params: layer.values(),
        enabled: enabled(),
      })),
    };
  }

  restore(config: PipelineConfig) {
    const base = this.availableBaseLayers.find((layer) => layer.definition.type === config.base.type);
    if (base) {
      base.apply(config.base.params);
      this.selectedBaseLayer.set(base);
    }

    this.filterLayerList.set(
      config.filters.flatMap((filter) => {
        const definition = findFilterLayer(filter.type);
        if (!definition) {
          return [];
        }
        const state = this.createFilterLayer(definition);
        state.layer.apply(filter.params);
        state.enabled.set(filter.enabled);
        return [state];
      }),
    );

    this.seed.set(config.seed);
  }

  private createFilterLayer(definition: FilterLayer): FilterLayerState {
    return {
      id: this.nextFilterId++,
      layer: new EditableLayer(definition),
      enabled: signal(true),
      collapsed: signal(false),
    };
  }
}
