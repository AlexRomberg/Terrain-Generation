import { BaseLayer, DEPTH, WIDTH } from '../baseLayer';
import { LayerImage } from '../layerImage';
import { LayerParameter } from '../layerParameter';
import Srand from 'seeded-rand';
import { Vector2 } from 'three';

export class PerlinNoise implements BaseLayer {
  name = 'Layered Perlin Noise';
  parameters = {
    frequency: new LayerParameter('Frequency', 6, 1, 100, 1),
    amplitude: new LayerParameter('Amplitude', 1.5, 0, 10, 0.1),
    lacunarity: new LayerParameter('Lacunarity', 2, 0, 5, 1),
    persistence: new LayerParameter('Persistence', 0.5, 0, 1, 0.01),
    octaves: new LayerParameter('Octaves', 8, 1, 8, 1)
  };
  combinedLayers: LayerImage = new LayerImage("Layered Perlin", WIDTH, DEPTH, new Float32Array())
  layerImages: LayerImage[] = [];
  params = "";

  renderLayers(seed: number): LayerImage[] {
    const currentParams =
      seed +
      this.parameters.frequency.value() +
      ';' +
      this.parameters.amplitude.value() +
      ';' +
      this.parameters.lacunarity.value() +
      ';' +
      this.parameters.persistence.value() +
      ';' +
      this.parameters.octaves.value();

    if (currentParams != this.params) {

      let frequency = this.parameters.frequency.value();
      let amplitude = this.parameters.amplitude.value();

      this.layerImages = [];
      for (let i = 0; i < this.parameters.octaves.value(); i++) {
        this.layerImages[i] = this.generatePerlinLayer(seed, frequency, amplitude, i);
        frequency *= this.parameters.lacunarity.value();
        amplitude *= this.parameters.persistence.value();
      }

      this.params = currentParams;
      return this.layerImages;
    }

    return this.layerImages;
  }

  renderResult(seed: number): LayerImage {
    const currentParams =
      seed +
      this.parameters.frequency.value() +
      ';' +
      this.parameters.amplitude.value() +
      ';' +
      this.parameters.lacunarity.value() +
      ';' +
      this.parameters.persistence.value() +
      ';' +
      this.parameters.octaves.value();

    if (currentParams != this.params) {
      const layers = this.renderLayers(seed);
      const resultData = new Float32Array(WIDTH * DEPTH);

      for (let i = 0; i < WIDTH * DEPTH; i++) {
        let elevation = 0;
        for (let j = 0; j < this.parameters.octaves.value(); j++) {
          elevation += layers[j].elevation[i];
        }
        resultData[i] = elevation;
      }

      this.combinedLayers.elevation = resultData;
      return this.combinedLayers;
    }

    return this.combinedLayers;
  }

  generatePerlinLayer(seed: number, frequency: number, amplitude: number, octave: number): LayerImage {
    const data = new Float32Array(WIDTH * DEPTH);

    const vectors = this.generateVectors(seed, frequency);

    for (let i = 0; i < DEPTH; i++) {
      for (let j = 0; j < WIDTH; j++) {
        data[i * WIDTH + j] = this.perlin(i, j, vectors, frequency, amplitude);
      }
    }

    return new LayerImage(`Octave ${octave + 1}`, WIDTH, DEPTH, data);
  }

  perlin(x: number, y: number, vectors: Vector2[], frequency: number, amplitude: number): number {
    const cellSize = WIDTH / frequency;

    const cx = Math.floor(x / cellSize);
    const cy = Math.floor(y / cellSize);

    const x0 = cx * cellSize;
    const y0 = cy * cellSize;
    const x1 = (cx + 1) * cellSize;
    const y1 = (cy + 1) * cellSize;

    //Relative positions of the points coordinates
    const xf = (x - x0) / (x1 - x0);
    const yf = (y - y0) / (y1 - y0);

    //Vectors from corner of square to point
    const tl = new Vector2(xf, yf);
    const tr = new Vector2(xf - 1, yf);
    const bl = new Vector2(xf, yf - 1);
    const br = new Vector2(xf - 1, yf - 1);

    //Random vectors at corners of square
    const ul = vectors[(frequency + 1) * cy + cx];
    const ur = vectors[(frequency + 1) * cy + cx + 1];
    const ll = vectors[(frequency + 1) * (cy + 1) + cx];
    const lr = vectors[(frequency + 1) * (cy + 1) + cx + 1];

    //Dot products
    const tlul = tl.dot(ul);
    const trur = tr.dot(ur);
    const blll = bl.dot(ll);
    const brlr = br.dot(lr);

    const u = this.fade(xf);
    const v = this.fade(yf);

    return (this.lerp(v, this.lerp(u, tlul, trur), this.lerp(u, blll, brlr)) + 1) * amplitude;
  }

  generateVectors(seed: number, frequency: number): Vector2[] {
    const gridSize = (frequency + 1) ** 2;

    const vectors: Vector2[] = [];

    const rnd = new Srand(seed);

    for (let i = 0; i < gridSize; i++) {
      const angle = rnd.random() * Math.PI * 2;
      vectors[i] = new Vector2(Math.cos(angle), Math.sin(angle));
    }

    return vectors;
  }

  lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
}
