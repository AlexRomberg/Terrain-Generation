import { BaseLayer } from "../baseLayer";
import { LayerImage } from "../layerImage";
import { LayerParameter } from "../layerParameter";

export class PerlinNoise implements BaseLayer {
  name = 'Perlin Noise';
  parameters: LayerParameter[] = [
    new LayerParameter('Frequency', 1.0),
    new LayerParameter('Persistence', 1.0),
    new LayerParameter('Octaves', 1.0),
    new LayerParameter('Seed', 1.0)
  ];

  renderLayers(_seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(_seed: number): LayerImage {
    throw new Error('Method not implemented.');
  }
}
