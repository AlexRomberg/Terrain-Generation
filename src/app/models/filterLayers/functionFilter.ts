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
      'sin(x * PI) * cos(y * PI)',
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

  renderResult(source: LayerImage, _seed: number) {
    const elevationField = this.elevationField();
    if (!elevationField) {
      return source;
    }

    const combine = COMBINE_MODES[this.parameters.mode.value()];
    const elevation = source.elevation.map((value, index) => combine(value, elevationField.elevation[index]));
    return new LayerImage('Function Result', source.size, elevation, source.color).asZeroElevation();
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
