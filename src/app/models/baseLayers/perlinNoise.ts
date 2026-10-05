import { BaseLayer } from "../baseLayer";
import { LayerImage } from "../layerImage";
import { LayerParameter } from "../layerParameter";

export class PerlinNoise implements BaseLayer {
  renderLayers(seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(seed: number): LayerImage {
    throw new Error('Method not implemented.');
  }
  name: string;
  parameters: LayerParameter[];

  constructor(name: string, parameters: LayerParameter[]) {
    this.name = name;
    this.parameters = parameters;
  }
}
