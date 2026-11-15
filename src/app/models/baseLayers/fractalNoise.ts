import Srand from 'seeded-rand';
import { BaseLayer, numberParam, ParameterValues, RenderContext } from '../layerDefinition';
import { layerImage } from '../layerImage';
import { gradientNoise } from '../noise';
import { ELEVATION_TO_MAP_HEIGHT, SIZE } from '../terrain';

const parameters = {
  frequency: numberParam('Frequency', 3, 0.5, 20, 0.5),
  amplitude: numberParam('Amplitude', 0.125, 0, 1, 0.005),
  octaves: numberParam('Octaves', 3, 1, 8, 1),
  lacunarity: numberParam('Lacunarity', 2, 1, 4, 0.1),
  gain: numberParam('Gain', 0.1, 0, 1, 0.01),
};

export class FractalNoise implements BaseLayer<typeof parameters> {
  readonly role = 'base';
  readonly type = 'fractal-noise';
  readonly name = 'Fractal Noise';
  readonly parameters = parameters;

  render(
    { frequency, amplitude, octaves, lacunarity, gain }: ParameterValues<typeof parameters>,
    { seed, report }: RenderContext,
  ) {
    const rnd = new Srand(seed);
    const offsetX = rnd.random() * 1000;
    const offsetY = rnd.random() * 1000;
    const elevation = new Float32Array(SIZE * SIZE);

    for (let row = 0; row < SIZE; row++) {
      if ((row & 63) === 0) {
        report(row / SIZE);
      }
      const y = row / (SIZE - 1) + offsetY;
      for (let col = 0; col < SIZE; col++) {
        const x = col / (SIZE - 1) + offsetX;
        let noise = 0;
        let octaveFrequency = frequency;
        let octaveAmplitude = 1;
        for (let octave = 0; octave < octaves; octave++) {
          noise += gradientNoise(x * octaveFrequency, y * octaveFrequency) * octaveAmplitude;
          octaveAmplitude *= gain;
          octaveFrequency *= lacunarity;
        }

        const mapHeight = noise * amplitude * 0.5 + 0.5;
        elevation[col + row * SIZE] = mapHeight / ELEVATION_TO_MAP_HEIGHT;
      }
    }

    return layerImage('Fractal Noise', SIZE, elevation);
  }

  renderLayers(params: ParameterValues<typeof parameters>, context: RenderContext) {
    return [this.render(params, context)];
  }
}
