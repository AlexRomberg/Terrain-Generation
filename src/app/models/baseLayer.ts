import { LayerImage } from "./layerImage"
import { LayerProvider } from "./layerProvider"

export const WIDTH = 2000;
export const DEPTH = 2000;
export interface BaseLayer extends LayerProvider {
  renderLayers(seed: number): LayerImage[]
  renderResult(seed: number): LayerImage
}
