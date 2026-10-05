import { LayerImage } from "./layerImage"
import { LayerProvider } from "./layerProvider"

export interface BaseLayer extends LayerProvider {

  renderLayers(seed: number): LayerImage[]
  renderResult(seed: number): LayerImage

}
