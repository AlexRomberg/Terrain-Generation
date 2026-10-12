import { Service, signal, WritableSignal } from '@angular/core';
import { BaseLayer } from '../models/baseLayer';
import { FilterLayer } from '../models/filterLayer';
import { PerlinNoise } from '../models/baseLayers/perlinNoise';
import { ColorFilter } from '../models/filterLayers/colorFilter';

export interface FilterLayerState {
  layer: FilterLayer;
  enabled: WritableSignal<boolean>;
}

@Service()
export class LayerState {
  readonly availableBaseLayers: readonly BaseLayer[] = [new PerlinNoise()];
  readonly selectedBaseLayer = signal<BaseLayer>(this.availableBaseLayers[0]);

  readonly filterLayers: readonly FilterLayerState[] = [
    { layer: new ColorFilter(), enabled: signal(false) },
  ];

  generateSeed() {
    return Math.round(Math.random() * 1000000);
  }

  readonly seed = signal(this.generateSeed());
}
