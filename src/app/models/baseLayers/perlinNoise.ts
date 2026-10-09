import { BaseLayer } from '../baseLayer';
import { LayerImage } from '../layerImage';
import { LayerParameter } from '../layerParameter';

export class PerlinNoise implements BaseLayer {
  name = 'Perlin Noise';
  parameters: LayerParameter[] = [
    new LayerParameter('Frequency', 1, 0.1, 10, 0.1),
    new LayerParameter('Persistence', 0.5, 0, 1, 0.01),
    new LayerParameter('Octaves', 4, 1, 8, 1),
  ];

  renderLayers(_seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(_seed: number): LayerImage {
    throw new Error('Method not implemented.');
  }
}
