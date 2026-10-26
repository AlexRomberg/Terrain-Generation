import { computed } from '@angular/core';
import { DEPTH, WIDTH } from '../baseLayer';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { SelectParameter, TextParameter } from '../layerParameter';

type HeightFunction = (x: number, z: number) => number;

const MATH_NAMES = Object.getOwnPropertyNames(Math).join(', ');

const COMBINE_MODES = {
  add: (elevation: number, height: number) => elevation + height,
  average: (elevation: number, height: number) => (elevation + height) / 2,
};

export class FunctionFilter implements FilterLayer {
  name = 'Function';
  parameters = {
    expression: new TextParameter(
      'f(x, z) =',
      'sin(x * PI) * cos(z * PI)',
      validateExpression,
    ),
    mode: new SelectParameter<keyof typeof COMBINE_MODES>('Apply as', 'add', [
      { value: 'add', label: 'Add' },
      { value: 'average', label: 'Average' },
    ]),
  };

  private heightField = computed(() => {
    const expression = this.parameters.expression.value();
    try {
      return new LayerImage(`f(x, z) = ${expression}`, WIDTH, DEPTH, sampleHeights(compileExpression(expression)));
    } catch {
      return undefined;
    }
  });

  renderLayers(_source: LayerImage, _seed: number) {
    const heightField = this.heightField();
    return heightField ? [heightField] : [];
  }

  renderResult(source: LayerImage, _seed: number) {
    const heightField = this.heightField();
    if (!heightField) {
      return source;
    }

    const combine = COMBINE_MODES[this.parameters.mode.value()];
    const elevation = source.elevation.map((value, index) => combine(value, heightField.elevation[index]));
    return new LayerImage('Function Result', source.width, source.height, elevation, source.color).asZeroElevation();
  }
}

function compileExpression(expression: string) {
  const heightAt = new Function('x', 'z', `const { ${MATH_NAMES} } = Math; return (${expression});`) as HeightFunction;
  if (typeof heightAt(0, 0) !== 'number') {
    throw new Error('The function has to return a number');
  }
  return heightAt;
}

function validateExpression(expression: string) {
  try {
    compileExpression(expression);
    return undefined;
  } catch (error) {
    return String(error);
  }
}

function sampleHeights(heightAt: HeightFunction) {
  const heights = new Float32Array(WIDTH * DEPTH);
  for (let row = 0; row < DEPTH; row++) {
    const z = (row / (DEPTH - 1)) * 2 - 1;
    for (let col = 0; col < WIDTH; col++) {
      const x = (col / (WIDTH - 1)) * 2 - 1;
      const height = heightAt(x, z);
      heights[row * WIDTH + col] = Number.isFinite(height) ? height : 0;
    }
  }
  return heights;
}
