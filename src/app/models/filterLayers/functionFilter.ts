import {
  FilterLayer,
  ParameterValues,
  ProgressReporter,
  RenderContext,
  selectParam,
  textParam,
} from '../layerDefinition';
import { LayerImage, layerImage } from '../layerImage';
import { SIZE } from '../terrain';

type ElevationFunction = (x: number, y: number) => number;

const MATH_NAMES = Object.getOwnPropertyNames(Math).join(', ');

const COMBINE_MODES = {
  add: (elevation: number, value: number) => elevation + value,
  average: (elevation: number, value: number) => (elevation + value) / 2,
};

type CombineMode = keyof typeof COMBINE_MODES;

const parameters = {
  expression: textParam('f(x, y) =', '(1 - x) * 2', (expression) => FunctionFilter.validateExpression(expression)),
  mode: selectParam<CombineMode>('Apply as', 'add', [
    { value: 'add', label: 'Add' },
    { value: 'average', label: 'Average' },
  ]),
};

type FunctionParams = ParameterValues<typeof parameters>;

export class FunctionFilter implements FilterLayer<typeof parameters> {
  readonly role = 'filter';
  readonly type = 'function';
  readonly name = 'Function';
  readonly parameters = parameters;

  render(source: LayerImage, { expression, mode }: FunctionParams, { report }: RenderContext) {
    const field = this.elevationField(expression, report);
    if (!field) {
      return source;
    }

    const combine = COMBINE_MODES[mode];
    const elevation = source.elevation.map((value, index) => combine(value, field.elevation[index]));
    return layerImage('Function Result', source.size, elevation, source.color);
  }

  renderLayers(_source: LayerImage, { expression }: FunctionParams, { report }: RenderContext) {
    const field = this.elevationField(expression, report);
    return field ? [field] : [];
  }

  private elevationField(expression: string, report: ProgressReporter) {
    try {
      return layerImage(`f(x, y) = ${expression}`, SIZE, this.sampleElevation(FunctionFilter.compileExpression(expression), report));
    } catch {
      return undefined;
    }
  }

  private static compileExpression(expression: string) {
    const elevationAt = new Function('x', 'y', `const { ${MATH_NAMES} } = Math; return (${expression});`) as ElevationFunction;
    if (typeof elevationAt(0, 0) !== 'number') {
      throw new Error('The function has to return a number');
    }
    return elevationAt;
  }

  static validateExpression(expression: string) {
    try {
      FunctionFilter.compileExpression(expression);
      return undefined;
    } catch (error) {
      return String(error);
    }
  }

  private sampleElevation(elevationAt: ElevationFunction, report: ProgressReporter) {
    const elevation = new Float32Array(SIZE * SIZE);
    for (let row = 0; row < SIZE; row++) {
      if ((row & 63) === 0) {
        report(row / SIZE);
      }
      const y = (row / (SIZE - 1)) * 2 - 1;
      for (let col = 0; col < SIZE; col++) {
        const x = (col / (SIZE - 1)) * 2 - 1;
        const value = elevationAt(x, y);
        elevation[row * SIZE + col] = Number.isFinite(value) ? value : 0;
      }
    }
    return elevation;
  }
}
