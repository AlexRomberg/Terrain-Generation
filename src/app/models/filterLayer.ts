import { LayerImage } from "./layerImage";
import { LayerProvider } from "./layerProvider";

export interface FilterLayer extends LayerProvider {

  renderLayers(seed: number): LayerImage[];
  renderResult(seed: number): LayerImage;

}
