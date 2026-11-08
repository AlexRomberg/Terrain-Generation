import { Service, signal, WritableSignal } from '@angular/core';
import { BaseLayer } from '../models/baseLayer';
import { FilterLayer } from '../models/filterLayer';
import { PerlinNoise } from '../models/baseLayers/perlinNoise';
import { ColorFilter } from '../models/filterLayers/colorFilter';
import { FunctionFilter } from '../models/filterLayers/functionFilter';
import { Plane } from '../models/baseLayers/plane';
import { DiamondSquare } from '../models/baseLayers/diamondSquare';
import { ErosionFilter } from '../models/filterLayers/erosionFilter';
import { FractalNoise } from '../models/baseLayers/fractalNoise';

export interface FilterLayerState {
  id: number;
  layer: FilterLayer;
  enabled: WritableSignal<boolean>;
  collapsed: WritableSignal<boolean>;
}

export interface FilterLayerType {
  name: string;
  create: () => FilterLayer;
}

function filterLayerType(create: () => FilterLayer): FilterLayerType {
  return { name: create().name, create };
}

@Service()
export class LayerState {
  readonly availableBaseLayers: readonly BaseLayer[] = [
    new FractalNoise(),
    new Plane(),
    new PerlinNoise(),
    new DiamondSquare()
  ];
  readonly selectedBaseLayer = signal<BaseLayer>(this.availableBaseLayers[0]);

  readonly availableFilterLayers: readonly FilterLayerType[] = [
    filterLayerType(() => new FunctionFilter()),
    filterLayerType(() => new ErosionFilter()),
    filterLayerType(() => new ColorFilter()),
  ];

  private nextFilterId = 0;
  private readonly filterLayerList = signal<readonly FilterLayerState[]>([
    this.createFilterLayer(new ErosionFilter()),
  ]);
  readonly filterLayers = this.filterLayerList.asReadonly();

  addFilterLayer(type: FilterLayerType) {
    this.filterLayerList.update((layers) => [...layers, this.createFilterLayer(type.create())]);
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

  private createFilterLayer(layer: FilterLayer): FilterLayerState {
    return { id: this.nextFilterId++, layer, enabled: signal(true), collapsed: signal(false) };
  }

  generateSeed() {
    return Math.round(Math.random() * 1000000);
  }

  readonly seed = signal(this.generateSeed());
}
