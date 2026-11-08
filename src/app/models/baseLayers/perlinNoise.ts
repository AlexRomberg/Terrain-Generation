import Srand from 'seeded-rand';
import { Vector2 } from 'three';
import { BaseLayer, numberParam, ParameterValues, ProgressReporter, RenderContext } from '../layerDefinition';
import { LayerImage, layerImage } from '../layerImage';
import { SIZE } from '../terrain';

const parameters = {
  frequency: numberParam('Frequency', 6, 1, 100, 1),
  amplitude: numberParam('Amplitude', 1.5, 0, 10, 0.1),
  lacunarity: numberParam('Lacunarity', 2, 0, 5, 1),
  persistence: numberParam('Persistence', 0.5, 0, 1, 0.01),
  octaves: numberParam('Octaves', 8, 1, 8, 1),
};

type PerlinParams = ParameterValues<typeof parameters>;

export class PerlinNoise implements BaseLayer<typeof parameters> {
  readonly role = 'base';
  readonly type = 'perlin-noise';
  readonly name = 'Layered Perlin Noise';
  readonly parameters = parameters;

  render(params: PerlinParams, context: RenderContext) {
    const layers = this.renderLayers(params, context);
    const elevation = new Float32Array(SIZE * SIZE);

    for (let i = 0; i < SIZE * SIZE; i++) {
      let sum = 0;
      for (const layer of layers) {
        sum += layer.elevation[i];
      }
      elevation[i] = sum;
    }

    return layerImage('Layered Perlin', SIZE, elevation);
  }

  renderLayers(params: PerlinParams, { seed, report }: RenderContext) {
    let frequency = params.frequency;
    let amplitude = params.amplitude;
    const layers: LayerImage[] = [];

    for (let i = 0; i < params.octaves; i++) {
      const octave = i;
      const reportOctave = (fraction: number) => report((octave + fraction) / params.octaves);
      layers.push(this.generatePerlinLayer(seed, frequency, amplitude, octave, reportOctave));
      frequency *= params.lacunarity;
      amplitude *= params.persistence;
    }

    return layers;
  }

  private generatePerlinLayer(
    seed: number,
    frequency: number,
    amplitude: number,
    octave: number,
    report: ProgressReporter,
  ): LayerImage {
    const data = new Float32Array(SIZE * SIZE);
    const vectors = this.generateVectors(seed, frequency);

    for (let y = 0; y < SIZE; y++) {
      if ((y & 63) === 0) {
        report(y / SIZE);
      }
      for (let x = 0; x < SIZE; x++) {
        data[y * SIZE + x] = this.perlin(x, y, vectors, frequency, amplitude);
      }
    }

    return layerImage(`Octave ${octave + 1}`, SIZE, data);
  }

  private perlin(x: number, y: number, vectors: Vector2[], frequency: number, amplitude: number): number {
    const cellSize = SIZE / frequency;

    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);

    const x0 = cx * cellSize;
    const y0 = cy * cellSize;
    const x1 = (cx + 1) * cellSize;
    const y1 = (cy + 1) * cellSize;

    const xf = (x - x0) / (x1 - x0);
    const yf = (y - y0) / (y1 - y0);

    const tl = new Vector2(xf, yf);
    const tr = new Vector2(xf - 1, yf);
    const bl = new Vector2(xf, yf - 1);
    const br = new Vector2(xf - 1, yf - 1);

    const ul = vectors[(frequency + 1) * cy + cx];
    const ur = vectors[(frequency + 1) * cy + cx + 1];
    const ll = vectors[(frequency + 1) * (cy + 1) + cx];
    const lr = vectors[(frequency + 1) * (cy + 1) + cx + 1];

    const tlul = tl.dot(ul);
    const trur = tr.dot(ur);
    const blll = bl.dot(ll);
    const brlr = br.dot(lr);

    const u = this.fade(xf);
    const v = this.fade(yf);

    return (this.lerp(v, this.lerp(u, tlul, trur), this.lerp(u, blll, brlr)) + 1) * amplitude;
  }

  private generateVectors(seed: number, frequency: number): Vector2[] {
    const gridSize = (frequency + 1) ** 2;
    const vectors: Vector2[] = [];
    const rnd = new Srand(seed);

    for (let i = 0; i < gridSize; i++) {
      const angle = rnd.random() * Math.PI * 2;
      vectors[i] = new Vector2(Math.cos(angle), Math.sin(angle));
    }

    return vectors;
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
}
