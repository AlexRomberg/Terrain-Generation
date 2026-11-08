import { DiamondSquare } from './baseLayers/diamondSquare';
import { FractalNoise } from './baseLayers/fractalNoise';
import { PerlinNoise } from './baseLayers/perlinNoise';
import { Plane } from './baseLayers/plane';
import { ColorFilter } from './filterLayers/colorFilter';
import { ErosionFilter } from './filterLayers/erosionFilter';
import { FunctionFilter } from './filterLayers/functionFilter';
import { BaseLayer, FilterLayer, Layer } from './layerDefinition';

const erosionFilter = new ErosionFilter();

export const BASE_LAYERS: readonly BaseLayer[] = [new FractalNoise(), new Plane(), new PerlinNoise(), new DiamondSquare()];
export const FILTER_LAYERS: readonly FilterLayer[] = [new FunctionFilter(), erosionFilter, new ColorFilter()];
export const DEFAULT_FILTER_LAYERS: readonly FilterLayer[] = [erosionFilter];

const LAYERS = new Map<string, Layer>([...BASE_LAYERS, ...FILTER_LAYERS].map((layer) => [layer.type, layer]));

export function findLayer(type: string) {
  return LAYERS.get(type);
}

export function findBaseLayer(type: string) {
  const layer = LAYERS.get(type);
  return layer?.role === 'base' ? layer : undefined;
}

export function findFilterLayer(type: string) {
  const layer = LAYERS.get(type);
  return layer?.role === 'filter' ? layer : undefined;
}
