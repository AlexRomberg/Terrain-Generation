import { LayerImage } from "./layerImage";
import { LayerProvider } from "./layerProvider";

export interface FilterLayer extends LayerProvider {

  renderLayers(source: LayerImage, seed: number): LayerImage[];
  renderResult(source: LayerImage, seed: number): LayerImage;

}
