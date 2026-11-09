import Srand from 'seeded-rand';
import { BaseLayer, numberParam, ParameterValues, RenderContext } from '../layerDefinition';
import { layerImage } from '../layerImage';
import { ELEVATION_TO_MAP_HEIGHT, SIZE } from '../terrain';

const HASH_X = 0.3183099;
const HASH_Y = 0.3678794;

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
          noise += this.gradientNoise(x * octaveFrequency, y * octaveFrequency) * octaveAmplitude;
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

  private gradientNoise(x: number, y: number) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const fracX = x - cellX;
    const fracY = y - cellY;
    const blendX = fracX * fracX * fracX * (fracX * (fracX * 6 - 15) + 10);
    const blendY = fracY * fracY * fracY * (fracY * (fracY * 6 - 15) + 10);

    const a = this.cornerValue(cellX, cellY, fracX, fracY);
    const b = this.cornerValue(cellX + 1, cellY, fracX - 1, fracY);
    const c = this.cornerValue(cellX, cellY + 1, fracX, fracY - 1);
    const d = this.cornerValue(cellX + 1, cellY + 1, fracX - 1, fracY - 1);

    return a + blendX * (b - a) + blendY * (c - a) + blendX * blendY * (a - b - c + d);
  }

  private cornerValue(cellX: number, cellY: number, offsetX: number, offsetY: number) {
    const hashX = cellX * HASH_X + HASH_Y;
    const hashY = cellY * HASH_Y + HASH_X;
    const seed = this.fract(hashX * hashY * (hashX + hashY));
    const gradientX = -1 + 2 * this.fract(16 * HASH_X * seed);
    const gradientY = -1 + 2 * this.fract(16 * HASH_Y * seed);
    return gradientX * offsetX + gradientY * offsetY;
  }

  private fract(value: number) {
    return value - Math.floor(value);
  }
}
