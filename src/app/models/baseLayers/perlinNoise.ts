import { BaseLayer, DEPTH, WIDTH } from '../baseLayer';
import { LayerImage } from '../layerImage';
import { LayerParameter } from '../layerParameter';
import Srand from 'seeded-rand';
import { Vector2 } from 'three';

export class PerlinNoise implements BaseLayer {
  name = 'Perlin Noise';
  parameters = {
    frequency: new LayerParameter('Frequency', 20, 1, 100, 1),
    persistence: new LayerParameter('Persistence', 0.5, 0, 1, 0.01),
    octaves: new LayerParameter('Octaves', 4, 1, 8, 1),
  };

  renderLayers(_seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }
  renderResult(seed: number): LayerImage {
    let data = new Float32Array(WIDTH*DEPTH);

    const vectors = this.generateVectors(seed, this.parameters.frequency.value());

    for (let i = 0; i < DEPTH; i++) {
      for (let j = 0; j < WIDTH; j++) {
        data[i * WIDTH + j] = this.perlin(i, j, vectors, this.parameters.frequency.value());
      }
    }

    return new LayerImage('Perlin', WIDTH, DEPTH, data);
  }

  perlin(x: number, y: number, vectors: Array<Vector2>, frequency: number): number {
    const cellSize = WIDTH/frequency;

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

    return this.lerp(v, this.lerp(u, tlul, trur), this.lerp(u, blll, brlr));
  }

  generateVectors(seed: number, frequency: number): Array<Vector2> {
    const gridSize = (frequency + 1) ** 2;

    let vectors: Array<Vector2> = [];

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
