import { BaseLayer, SIZE } from '../baseLayer';
import { NumberParameter } from '../layerParameter';
import { LayerImage } from '../layerImage';
import Srand, { SrandInstance } from 'seeded-rand';

export class DiamondSquare implements BaseLayer {
  name = 'Diamond Square';
  parameters = {
    cornerTL: new NumberParameter('Top Left Corner', 1, -1, 1, 0.1),
    cornerTR: new NumberParameter('Top Right Corner', -1, -1, 1, 0.1),
    cornerBL: new NumberParameter('Bottom Left Corner', 0, -1, 1, 0.1),
    cornerBR: new NumberParameter('Bottom Right Corner', 1, -1, 1, 0.1),
    scale: new NumberParameter('Scale', 1, 0, 10, 0.1),
    roughness: new NumberParameter('Roughness', 1, 0, 2, 0.1)
  };
  combinedLayers: LayerImage = new LayerImage('Layered Perlin', SIZE, new Float32Array());
  layerImages: LayerImage[] = [];
  params = '';
  points: number[][] = [];

  renderLayers(_seed: number): LayerImage[] {
    throw new Error('Not implemented');
  }

  renderResult(seed: number): LayerImage {
    const elevation = new Float32Array(SIZE * SIZE);

    this.diamondSquare(seed);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        elevation[y * SIZE + x] = this.points[x][y];
      }
    }
    return new LayerImage('Diamond Square', SIZE, elevation);
  }

  diamondSquare(seed: number) {
    const rnd = new Srand(seed);

    this.points = new Array(SIZE).fill(0).map(() => new Array(SIZE).fill(0));

    this.points[0][0] = this.parameters.cornerTL.value();
    this.points[0][SIZE - 1] = this.parameters.cornerBL.value();
    this.points[SIZE - 1][0] = this.parameters.cornerTR.value();
    this.points[SIZE - 1][SIZE - 1] = this.parameters.cornerBR.value();

    let step = SIZE - 1;
    let scale = this.parameters.scale.value();

    while (step > 1) {
      const halfStep = Math.floor(step / 2);

      //Diamond
      for (let x = halfStep; x < SIZE; x += step) {
        for (let y = halfStep; y < SIZE; y += step) {
          this.diamondStep(step, scale, x, y, rnd);
        }
      }

      //Square
      for (let x = 0; x < SIZE; x += halfStep) {
        for (let y = (x + halfStep) % step; y < SIZE; y += step) {
          this.squareStep(step, scale, x, y, rnd);
        }
      }

      //Update step & scale
      step = Math.floor(step / 2);
      scale *= Math.pow(2, -this.parameters.roughness.value());
    }
  }

  diamondStep(step: number, scale:number, x: number, y: number, rnd: SrandInstance) {
    const distance = Math.floor(step / 2);

    const corners = [
      this.points[x - distance]?.[y - distance],
      this.points[x - distance]?.[y + distance],
      this.points[x + distance]?.[y - distance],
      this.points[x + distance]?.[y + distance]
    ]

    const validCorners = corners.filter((value) => value !== undefined);
    const average = validCorners.reduce((sum, value) => sum + value, 0) / validCorners.length;

    this.points[x][y] = average + (rnd.random() * 2 - 1) * scale;
  }

  squareStep(step: number, scale: number, x: number, y: number, rnd: SrandInstance) {
    const distance = Math.floor(step / 2);

    const corners = [
      this.points[x]?.[y - distance],
      this.points[x]?.[y + distance],
      this.points[x - distance]?.[y],
      this.points[x + distance]?.[y]
    ]

    const validCorners = corners.filter((value) => value !== undefined);
    const average = validCorners.reduce((sum, value) => sum + value, 0) / validCorners.length;

    this.points[x][y] = average + (rnd.random() * 2 - 1) * scale;
  }

}
