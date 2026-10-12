import { LayerImage } from "./layerImage"
import { LayerProvider } from "./layerProvider"

export const WIDTH = 1000;
export const DEPTH = 1000;
export interface BaseLayer extends LayerProvider {
  renderLayers(seed: number): LayerImage[]
  renderResult(seed: number): LayerImage
}
