import Srand from 'seeded-rand';
import { BaseLayer, ELEVATION_TO_MAP_HEIGHT, SIZE } from '../baseLayer';
import { LayerImage } from '../layerImage';
import { NumberParameter } from '../layerParameter';

const HASH_X = 0.3183099;
const HASH_Y = 0.3678794;

export class FractalNoise implements BaseLayer {
  name = 'Fractal Noise';
  parameters = {
    frequency: new NumberParameter('Frequency', 3, 0.5, 20, 0.5),
    amplitude: new NumberParameter('Amplitude', 0.125, 0, 1, 0.005),
    octaves: new NumberParameter('Octaves', 3, 1, 8, 1),
    lacunarity: new NumberParameter('Lacunarity', 2, 1, 4, 0.1),
    gain: new NumberParameter('Gain', 0.1, 0, 1, 0.01),
  };

  private cachedParams = '';
  private cachedImage?: LayerImage;

  renderLayers(seed: number) {
    return [this.renderResult(seed)];
  }

  renderResult(seed: number) {
    const frequency = this.parameters.frequency.value();
    const amplitude = this.parameters.amplitude.value();
    const octaves = this.parameters.octaves.value();
    const lacunarity = this.parameters.lacunarity.value();
    const gain = this.parameters.gain.value();
    const params = `${frequency};${amplitude};${octaves};${lacunarity};${gain};${seed}`;
    if (this.cachedImage && params === this.cachedParams) {
      return this.cachedImage;
    }

    const rnd = new Srand(seed);
    const offsetX = rnd.random() * 1000;
    const offsetY = rnd.random() * 1000;
    const elevation = new Float32Array(SIZE * SIZE);

    for (let row = 0; row < SIZE; row++) {
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

    this.cachedParams = params;
    this.cachedImage = new LayerImage('Fractal Noise', SIZE, elevation);
    return this.cachedImage;
  }
}

function gradientNoise(x: number, y: number) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fracX = x - cellX;
  const fracY = y - cellY;
  const blendX = fracX * fracX * fracX * (fracX * (fracX * 6 - 15) + 10);
  const blendY = fracY * fracY * fracY * (fracY * (fracY * 6 - 15) + 10);

  const a = cornerValue(cellX, cellY, fracX, fracY);
  const b = cornerValue(cellX + 1, cellY, fracX - 1, fracY);
  const c = cornerValue(cellX, cellY + 1, fracX, fracY - 1);
  const d = cornerValue(cellX + 1, cellY + 1, fracX - 1, fracY - 1);

  return a + blendX * (b - a) + blendY * (c - a) + blendX * blendY * (a - b - c + d);
}

function cornerValue(cellX: number, cellY: number, offsetX: number, offsetY: number) {
  const hashX = cellX * HASH_X + HASH_Y;
  const hashY = cellY * HASH_Y + HASH_X;
  const seed = fract(hashX * hashY * (hashX + hashY));
  const gradientX = -1 + 2 * fract(16 * HASH_X * seed);
  const gradientY = -1 + 2 * fract(16 * HASH_Y * seed);
  return gradientX * offsetX + gradientY * offsetY;
}

function fract(value: number) {
  return value - Math.floor(value);
}
