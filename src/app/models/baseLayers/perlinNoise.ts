import { BaseLayer, DEPTH, WIDTH } from '../baseLayer';
import { LayerImage } from '../layerImage';
import { LayerParameter } from '../layerParameter';
import Srand from 'seeded-rand';

export class PerlinNoise implements BaseLayer {
  name = 'Perlin Noise';
  parameters: LayerParameter[] = [
    new LayerParameter('Frequency', 1, 0.1, 10, 0.1),
    new LayerParameter('Persistence', 0.5, 0, 1, 0.01),
    new LayerParameter('Octaves', 4, 1, 8, 1),
  ];

  renderLayers(seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(seed: number): LayerImage {
    const size = WIDTH * DEPTH;
    let data = new Float32Array();

    const rnd = new Srand(seed);

    for (let i = 1; i < size; i++) {
      data[i] = rnd.random();
    }

    return new LayerImage('Test', WIDTH, DEPTH, data);
  }
}
