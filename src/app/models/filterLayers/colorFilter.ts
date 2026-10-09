import { FilterLayer } from "../filterLayer";
import { LayerImage } from "../layerImage";
import { LayerParameter } from "../layerParameter";

export class ColorFilter implements FilterLayer {
  name = 'Color Filter';
  parameters: LayerParameter[] = [
    new LayerParameter('Red', 1.0),
    new LayerParameter('Green', 1.0),
    new LayerParameter('Blue', 1.0)
  ];


  renderLayers(_seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(_seed: number): LayerImage {
    throw new Error('Method not implemented.');
  }
}
