import { LayerImage } from "./layerImage"
import { LayerProvider } from "./layerProvider"

export const SIZE = 2049;
export const TERRAIN_SIZE = 2;
export const ELEVATION_SCALE = 0.1;
export const ELEVATION_TO_MAP_HEIGHT = ELEVATION_SCALE / TERRAIN_SIZE;
export interface BaseLayer extends LayerProvider {
  renderLayers(seed: number): LayerImage[]
  renderResult(seed: number): LayerImage
}
