import { Service, signal, WritableSignal } from '@angular/core';
import { BaseLayer } from '../models/baseLayer';
import { FilterLayer } from '../models/filterLayer';
import { PerlinNoise } from '../models/baseLayers/perlinNoise';
import { ColorFilter } from '../models/filterLayers/colorFilter';
import { FunctionFilter } from '../models/filterLayers/functionFilter';
import { Plane } from '../models/baseLayers/plane';

export interface FilterLayerState {
  layer: FilterLayer;
  enabled: WritableSignal<boolean>;
}

@Service()
export class LayerState {
  readonly availableBaseLayers: readonly BaseLayer[] = [new PerlinNoise(), new Plane()];
  readonly selectedBaseLayer = signal<BaseLayer>(this.availableBaseLayers[0]);

  readonly filterLayers: readonly FilterLayerState[] = [
    { layer: new FunctionFilter(), enabled: signal(false) },
    { layer: new ColorFilter(), enabled: signal(true) },
  ];

  generateSeed() {
    return Math.round(Math.random() * 1000000);
  }

  readonly seed = signal(this.generateSeed());
}
