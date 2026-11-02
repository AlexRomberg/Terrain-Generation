import { BaseLayer, SIZE } from '../baseLayer';
import { NumberParameter } from '../layerParameter';
import { LayerImage } from '../layerImage';
import { drawLine, drawPixel } from '../drawing';
import Srand, { SrandInstance } from 'seeded-rand';

type Phase = 'Diamond' | 'Square';
type Color = [number, number, number];

const VISUALIZED_PASSES = 4;
const NEW_POINT_COLOR: Color = [255, 0, 0];
const EARLIER_POINT_COLOR: Color = [0, 120, 255];
const LINE_WIDTH = 6;
const NEW_POINT_WIDTH = 32;
const EARLIER_POINT_WIDTH = 24;
const DIAMOND_NEIGHBOURS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const SQUARE_NEIGHBOURS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export class DiamondSquare implements BaseLayer {
  name = 'Diamond Square';
  parameters = {
    cornerTL: new NumberParameter('Top Left Corner', 1, -1, 1, 0.1),
    cornerTR: new NumberParameter('Top Right Corner', -1, -1, 1, 0.1),
    cornerBL: new NumberParameter('Bottom Left Corner', 0, -1, 1, 0.1),
    cornerBR: new NumberParameter('Bottom Right Corner', 1, -1, 1, 0.1),
    scale: new NumberParameter('Scale', 1, 0, 10, 0.1),
    smoothness: new NumberParameter('Smoothness', 1, 0, 2, 0.1)
  };
  combinedLayers: LayerImage = new LayerImage('Diamond Square', SIZE, new Float32Array());
  layerImages: LayerImage[] = [];
  params = '';
  layerParams = '';
  points: number[][] = [];

  renderLayers(seed: number): LayerImage[] {
    const params = this.currentParams(seed);
    if (params === this.layerParams) {
      return this.layerImages;
    }

    const result = this.renderResult(seed);
    const min = result.elevation.reduce((a, b) => Math.min(a, b), Infinity);
    const max = result.elevation.reduce((a, b) => Math.max(a, b), -Infinity);
    const images: LayerImage[] = [];

    this.diamondSquare(seed, (phase, pass, step) => {
      if (pass <= VISUALIZED_PASSES) {
        images.push(this.renderPhase(phase, pass, step, result.elevation, min, max));
      }
    });

    this.layerImages = [...images, result];
    this.layerParams = params;
    return this.layerImages;
  }

  renderResult(seed: number): LayerImage {
    const params = this.currentParams(seed);
    if (params === this.params) {
      return this.combinedLayers;
    }

    const elevation = new Float32Array(SIZE * SIZE);

    this.diamondSquare(seed);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        elevation[y * SIZE + x] = this.points[x][y];
      }
    }

    this.combinedLayers = new LayerImage('Diamond Square', SIZE, elevation);
    this.params = params;
    return this.combinedLayers;
  }

  private currentParams(seed: number) {
    const { cornerTL, cornerTR, cornerBL, cornerBR, scale, smoothness } = this.parameters;
    return [seed, cornerTL.value(), cornerTR.value(), cornerBL.value(), cornerBR.value(), scale.value(), smoothness.value()].join(';');
  }

  private renderPhase(phase: Phase, pass: number, step: number, elevation: Float32Array, min: number, max: number) {
    const image = new LayerImage(`Pass ${pass}: ${phase}`, SIZE, elevation, new Uint8ClampedArray(SIZE * SIZE * 3));
    const distance = Math.floor(step / 2);
    const neighbours = phase === 'Diamond' ? DIAMOND_NEIGHBOURS : SQUARE_NEIGHBOURS;
    const visitNewPoints = (visit: (x: number, y: number) => void) =>
      phase === 'Diamond' ? this.forEachDiamondPoint(step, visit) : this.forEachSquarePoint(step, visit);

    this.fillNearestHeights(image, phase, step, min, max);

    visitNewPoints((x, y) => {
      for (const [dx, dy] of neighbours) {
        const neighbourX = x + dx * distance;
        const neighbourY = y + dy * distance;
        if (neighbourX < 0 || neighbourX >= SIZE || neighbourY < 0 || neighbourY >= SIZE) {
          continue;
        }
        drawLine(image, x, y, neighbourX, neighbourY, { color: NEW_POINT_COLOR, strokeWidth: LINE_WIDTH });
        drawPixel(image, neighbourX, neighbourY, { color: EARLIER_POINT_COLOR, strokeWidth: EARLIER_POINT_WIDTH });
      }
    });
    visitNewPoints((x, y) => drawPixel(image, x, y, { color: NEW_POINT_COLOR, strokeWidth: NEW_POINT_WIDTH }));

    return image;
  }

  private fillNearestHeights(image: LayerImage, phase: Phase, step: number, min: number, max: number) {
    const color = image.color!;
    const halfStep = Math.floor(step / 2);
    const spacing = phase === 'Square' ? halfStep : step;
    const range = max - min || 1;

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let nearestX = Math.round(x / spacing) * spacing;
        let nearestY = Math.round(y / spacing) * spacing;

        //After the diamond phase, the centers of the squares are computed as well
        if (phase === 'Diamond') {
          const centerX = Math.min(Math.floor(x / step) * step + halfStep, SIZE - 1 - halfStep);
          const centerY = Math.min(Math.floor(y / step) * step + halfStep, SIZE - 1 - halfStep);
          if ((x - centerX) ** 2 + (y - centerY) ** 2 < (x - nearestX) ** 2 + (y - nearestY) ** 2) {
            nearestX = centerX;
            nearestY = centerY;
          }
        }

        const gray = ((this.points[nearestX][nearestY] - min) / range) * 255;
        const index = (y * SIZE + x) * 3;
        color[index] = gray;
        color[index + 1] = gray;
        color[index + 2] = gray;
      }
    }
  }

  diamondSquare(seed: number, onPhase?: (phase: Phase, pass: number, step: number) => void) {
    const rnd = new Srand(seed);

    this.points = new Array(SIZE).fill(0).map(() => new Array(SIZE).fill(0));

    this.points[0][0] = this.parameters.cornerTL.value();
    this.points[0][SIZE - 1] = this.parameters.cornerBL.value();
    this.points[SIZE - 1][0] = this.parameters.cornerTR.value();
    this.points[SIZE - 1][SIZE - 1] = this.parameters.cornerBR.value();

    let step = SIZE - 1;
    let scale = this.parameters.scale.value();
    let pass = 1;

    while (step > 1) {
      //Diamond
      this.forEachDiamondPoint(step, (x, y) => this.diamondStep(step, scale, x, y, rnd));
      onPhase?.('Diamond', pass, step);

      //Square
      this.forEachSquarePoint(step, (x, y) => this.squareStep(step, scale, x, y, rnd));
      onPhase?.('Square', pass, step);

      //Update step & scale
      step = Math.floor(step / 2);
      scale *= Math.pow(2, -this.parameters.smoothness.value());
      pass++;
    }
  }

  private forEachDiamondPoint(step: number, visit: (x: number, y: number) => void) {
    const halfStep = Math.floor(step / 2);
    for (let x = halfStep; x < SIZE; x += step) {
      for (let y = halfStep; y < SIZE; y += step) {
        visit(x, y);
      }
    }
  }

  private forEachSquarePoint(step: number, visit: (x: number, y: number) => void) {
    const halfStep = Math.floor(step / 2);
    for (let x = 0; x < SIZE; x += halfStep) {
      for (let y = (x + halfStep) % step; y < SIZE; y += step) {
        visit(x, y);
      }
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
