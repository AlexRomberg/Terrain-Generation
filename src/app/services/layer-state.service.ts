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
  layer: FilterLayer;
  enabled: WritableSignal<boolean>;
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

  readonly filterLayers: readonly FilterLayerState[] = [
    { layer: new FunctionFilter(), enabled: signal(false) },
    { layer: new ErosionFilter(), enabled: signal(true) },
    { layer: new ColorFilter(), enabled: signal(false) },
  ];

  generateSeed() {
    return Math.round(Math.random() * 1000000);
  }

  readonly seed = signal(this.generateSeed());
}
