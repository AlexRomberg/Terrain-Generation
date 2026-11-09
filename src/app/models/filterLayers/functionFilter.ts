import { computed } from '@angular/core';
import { SIZE } from '../baseLayer';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { SelectParameter, TextParameter } from '../layerParameter';

type ElevationFunction = (x: number, y: number) => number;

const MATH_NAMES = Object.getOwnPropertyNames(Math).join(', ');

const COMBINE_MODES = {
  add: (elevation: number, value: number) => elevation + value,
  average: (elevation: number, value: number) => (elevation + value) / 2,
};

export class FunctionFilter implements FilterLayer {
  name = 'Function';
  parameters = {
    expression: new TextParameter(
      'f(x, y) =',
      '(1 - x) * 2',
      validateExpression,
    ),
    mode: new SelectParameter<keyof typeof COMBINE_MODES>('Apply as', 'add', [
      { value: 'add', label: 'Add' },
      { value: 'average', label: 'Average' },
    ]),
  };

  private elevationField = computed(() => {
    const expression = this.parameters.expression.value();
    try {
      return new LayerImage(`f(x, y) = ${expression}`, SIZE, sampleElevation(compileExpression(expression)));
    } catch {
      return undefined;
    }
  });

  renderLayers(_source: LayerImage, _seed: number) {
    const elevationField = this.elevationField();
    return elevationField ? [elevationField] : [];
  }

  private cachedResult?: { source: LayerImage; elevationField: LayerImage; mode: string; image: LayerImage };

  renderResult(source: LayerImage, _seed: number) {
    const elevationField = this.elevationField();
    if (!elevationField) {
      return source;
    }

    const mode = this.parameters.mode.value();
    const cached = this.cachedResult;
    if (cached?.source === source && cached.elevationField === elevationField && cached.mode === mode) {
      return cached.image;
    }

    const combine = COMBINE_MODES[mode];
    const elevation = source.elevation.map((value, index) => combine(value, elevationField.elevation[index]));
    const image = new LayerImage('Function Result', source.size, elevation, source.color);
    this.cachedResult = { source, elevationField, mode, image };
    return image;
  }
}

function compileExpression(expression: string) {
  const elevationAt = new Function('x', 'y', `const { ${MATH_NAMES} } = Math; return (${expression});`) as ElevationFunction;
  if (typeof elevationAt(0, 0) !== 'number') {
    throw new Error('The function has to return a number');
  }
  return elevationAt;
}

function validateExpression(expression: string) {
  try {
    compileExpression(expression);
    return undefined;
  } catch (error) {
    return String(error);
  }
}

function sampleElevation(elevationAt: ElevationFunction) {
  const elevation = new Float32Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row++) {
    const y = (row / (SIZE - 1)) * 2 - 1;
    for (let col = 0; col < SIZE; col++) {
      const x = (col / (SIZE - 1)) * 2 - 1;
      const value = elevationAt(x, y);
      elevation[row * SIZE + col] = Number.isFinite(value) ? value : 0;
    }
  }
  return elevation;
}
