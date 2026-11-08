import Srand, { SrandInstance } from 'seeded-rand';
import { drawLine, drawPixel } from '../drawing';
import {
  BaseLayer,
  numberParam,
  ParameterValues,
  ProgressReporter,
  RenderContext,
  scaleReport,
} from '../layerDefinition';
import { layerImage } from '../layerImage';
import { SIZE } from '../terrain';

type Phase = 'Diamond' | 'Square';
type Color = [number, number, number];
type Points = Float64Array[];

interface PhaseRecord {
  phase: Phase;
  pass: number;
  step: number;
}

const VISUALIZED_PASSES = 4;
const NEW_POINT_COLOR: Color = [255, 0, 0];
const EARLIER_POINT_COLOR: Color = [0, 120, 255];
const LINE_WIDTH = 6;
const NEW_POINT_WIDTH = 32;
const EARLIER_POINT_WIDTH = 24;
const DIAMOND_NEIGHBOURS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const SQUARE_NEIGHBOURS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const LAYER_PROGRESS_SHARE = 0.6;

const parameters = {
  cornerTL: numberParam('Top Left Corner', 1, -1, 1, 0.1),
  cornerTR: numberParam('Top Right Corner', -1, -1, 1, 0.1),
  cornerBL: numberParam('Bottom Left Corner', 0, -1, 1, 0.1),
  cornerBR: numberParam('Bottom Right Corner', 1, -1, 1, 0.1),
  scale: numberParam('Scale', 1, 0, 10, 0.1),
  smoothness: numberParam('Smoothness', 1, 0, 2, 0.1),
};

type DiamondSquareParams = ParameterValues<typeof parameters>;

export class DiamondSquare implements BaseLayer<typeof parameters> {
  readonly role = 'base';
  readonly type = 'diamond-square';
  readonly name = 'Diamond Square';
  readonly parameters = parameters;

  render(params: DiamondSquareParams, { seed, report }: RenderContext) {
    return this.resultImage(this.runDiamondSquare(params, seed, report));
  }

  renderLayers(params: DiamondSquareParams, { seed, report }: RenderContext) {
    const phases: PhaseRecord[] = [];
    const points = this.runDiamondSquare(params, seed, scaleReport(report, 0, LAYER_PROGRESS_SHARE), (phase, pass, step) => {
      if (pass <= VISUALIZED_PASSES) {
        phases.push({ phase, pass, step });
      }
    });
    const result = this.resultImage(points);
    const min = result.elevation.reduce((a, b) => Math.min(a, b), Infinity);
    const max = result.elevation.reduce((a, b) => Math.max(a, b), -Infinity);
    const reportPhase = scaleReport(report, LAYER_PROGRESS_SHARE, 1);

    const images = phases.map((record, index) => {
      reportPhase(index / phases.length);
      return this.renderPhase(points, record, result.elevation, min, max);
    });

    return [...images, result];
  }

  private resultImage(points: Points) {
    const elevation = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        elevation[y * SIZE + x] = points[x][y];
      }
    }
    return layerImage('Diamond Square', SIZE, elevation);
  }

  private renderPhase(points: Points, { phase, pass, step }: PhaseRecord, elevation: Float32Array, min: number, max: number) {
    const image = layerImage(`Pass ${pass}: ${phase}`, SIZE, elevation, new Uint8ClampedArray(SIZE * SIZE * 3));
    const distance = Math.floor(step / 2);
    const neighbours = phase === 'Diamond' ? DIAMOND_NEIGHBOURS : SQUARE_NEIGHBOURS;
    const visitNewPoints = (visit: (x: number, y: number) => void) =>
      phase === 'Diamond' ? this.forEachDiamondPoint(step, visit) : this.forEachSquarePoint(step, visit);

    this.fillNearestHeights(points, image.color!, phase, step, min, max);

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

  private fillNearestHeights(points: Points, color: Uint8ClampedArray, phase: Phase, step: number, min: number, max: number) {
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

        const gray = ((points[nearestX][nearestY] - min) / range) * 255;
        const index = (y * SIZE + x) * 3;
        color[index] = gray;
        color[index + 1] = gray;
        color[index + 2] = gray;
      }
    }
  }

  private runDiamondSquare(
    params: DiamondSquareParams,
    seed: number,
    report: ProgressReporter,
    onPhase?: (phase: Phase, pass: number, step: number) => void,
  ): Points {
    const rnd = new Srand(seed);
    const points: Points = Array.from({ length: SIZE }, () => new Float64Array(SIZE));
    const total = SIZE * SIZE;
    let visited = 0;
    const tick = () => {
      if ((++visited & 0xffff) === 0) {
        report(visited / total);
      }
    };

    points[0][0] = params.cornerTL;
    points[0][SIZE - 1] = params.cornerBL;
    points[SIZE - 1][0] = params.cornerTR;
    points[SIZE - 1][SIZE - 1] = params.cornerBR;

    let step = SIZE - 1;
    let scale = params.scale;
    let pass = 1;

    while (step > 1) {
      const currentStep = step;
      const currentScale = scale;

      //Diamond
      this.forEachDiamondPoint(currentStep, (x, y) => {
        this.diamondStep(points, currentStep, currentScale, x, y, rnd);
        tick();
      });
      onPhase?.('Diamond', pass, currentStep);

      //Square
      this.forEachSquarePoint(currentStep, (x, y) => {
        this.squareStep(points, currentStep, currentScale, x, y, rnd);
        tick();
      });
      onPhase?.('Square', pass, currentStep);

      //Update step & scale
      step = Math.floor(step / 2);
      scale *= Math.pow(2, -params.smoothness);
      pass++;
    }

    return points;
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

  private diamondStep(points: Points, step: number, scale: number, x: number, y: number, rnd: SrandInstance) {
    const distance = Math.floor(step / 2);

    const corners = [
      points[x - distance]?.[y - distance],
      points[x - distance]?.[y + distance],
      points[x + distance]?.[y - distance],
      points[x + distance]?.[y + distance],
    ];

    points[x][y] = this.averageOf(corners) + (rnd.random() * 2 - 1) * scale;
  }

  private squareStep(points: Points, step: number, scale: number, x: number, y: number, rnd: SrandInstance) {
    const distance = Math.floor(step / 2);

    const corners = [
      points[x]?.[y - distance],
      points[x]?.[y + distance],
      points[x - distance]?.[y],
      points[x + distance]?.[y],
    ];

    points[x][y] = this.averageOf(corners) + (rnd.random() * 2 - 1) * scale;
  }

  private averageOf(values: (number | undefined)[]) {
    const valid = values.filter((value) => value !== undefined);
    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }
}
