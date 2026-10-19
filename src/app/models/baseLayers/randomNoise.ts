import { BaseLayer, DEPTH, WIDTH } from '../baseLayer';
import { LayerImage } from '../layerImage';
import { LayerParameter } from '../layerParameter';

export class PerlinNoise implements BaseLayer {
  name = 'Layered Perlin Noise';
  parameters = {
    frequency: new LayerParameter('Frequency', 20, 1, 100, 1),
    amplitude: new LayerParameter('Amplitude', 1, 0, 10, 0.1),
    lacunarity: new LayerParameter('Lacunarity', 2, 0, 5, 0.1),
    persistence: new LayerParameter('Persistence', 0.5, 0, 1, 0.01),
    octaves: new LayerParameter('Octaves', 4, 1, 8, 1)
  };

  renderLayers(_seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(_seed: number): LayerImage {
    return new LayerImage('Layered Perlin', WIDTH, DEPTH, new Float32Array(WIDTH * DEPTH).fill(0).map(() => Math.random()));
  }

}
