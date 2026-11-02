import { Vector2 } from 'three';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { drawLine, drawVector, drawVoronoi } from '../drawing';
import { NumberParameter } from '../layerParameter';
import { SIZE } from '../baseLayer';
import Srand from 'seeded-rand';
import { calculateVoronoi } from '../common';

const ARROWS_PER_SIDE = 10;
const ARROW_FILL = 0.8;

export class ErosionFilter implements FilterLayer {
  name = 'Stateless Erosion';
  parameters = {
    wavelength: new NumberParameter('Stripe Wavelength', 100, 10, SIZE, 10),
    amplitude: new NumberParameter('Amplitude', 0.05, 0, 1, 0.01),
    gridSize: new NumberParameter('Jitter Grid Size', 40, 1, 50, 1),
  };

  private cachedSource?: LayerImage;
  private cachedParams = '';
  private cachedLayers: LayerImage[] = [];

  renderLayers(source: LayerImage, _seed: number) {
    const wavelength = this.parameters.wavelength.value();
    const amplitude = this.parameters.amplitude.value();
    const gridSize = this.parameters.gridSize.value();
    const params = `${wavelength};${amplitude};${gridSize}`;
    if (source === this.cachedSource && params === this.cachedParams) {
      return this.cachedLayers;
    }

    const gradients = computeGradients(source);
    const { stripes, elevation } = applyStripes(source, gradients, wavelength, amplitude);
    const { image: jitterGrid } = generateVoronoiJitterGrid(gridSize, source.size, 0);

    jitterGrid.elevation.set(elevation); // TEMP

    this.cachedSource = source;
    this.cachedParams = params;
    this.cachedLayers = [
      drawGradients(source, gradients),
      new LayerImage('Stripes', source.size, stripes),
      new LayerImage('Erosion Result', source.size, elevation, source.color),
      jitterGrid,
    ];
    return this.cachedLayers;
  }

  renderResult(source: LayerImage, seed: number) {
    return this.renderLayers(source, seed).at(-1)!;
  }
}

function generateVoronoiJitterGrid(cellsPerSide: number, size: number, seed: number) {
  const rnd = new Srand(seed);
  const points: { x: number; y: number }[] = [];
  const cellSize = size / cellsPerSide;

  for (let i = 0; i < cellsPerSide * cellsPerSide; i++) {
    const x = i % cellsPerSide * cellSize + rnd.random() * cellSize;
    const y = Math.floor(i / cellsPerSide) * cellSize + rnd.random() * cellSize;
    points.push({ x, y });
  }

  const voronoi = calculateVoronoi(points, size);
  const image = new LayerImage('Jitter Grid', size, new Float32Array(size * size).fill(0), new Uint8ClampedArray(size * size * 3));
  drawVoronoi(image, voronoi);
  for (let i = 0; i < cellsPerSide - 1; i++) {
    const cellEdge = (i + 1) * cellSize;
    drawLine(image, 0, cellEdge, size, cellEdge, { strokeWidth: 2, color: [0, 0, 0] });
    drawLine(image, cellEdge, 0, cellEdge, size, { strokeWidth: 2, color: [0, 0, 0] });
  }

  return { image, points };
}

function applyStripes(source: LayerImage, gradients: Float32Array, wavelength: number, amplitude: number) {
  const ERROR_CUTOFF = 1e-10;
  const { size } = source;
  const stripes = new Float32Array(size * size);
  const elevation = source.elevation.slice();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = x + y * size;
      const length = Math.hypot(gradients[index * 2], gradients[index * 2 + 1]);
      if (length < ERROR_CUTOFF) {
        stripes[index] = 1;
      } else {
        const normalizedX = gradients[index * 2] / length;
        const normalizedY = gradients[index * 2 + 1] / length;

        const u = x * -normalizedY + y * normalizedX;
        stripes[index] = Math.cos((2 * Math.PI * u) / wavelength);
      }
      elevation[index] += amplitude * stripes[index];
    }
  }

  return { stripes, elevation };
}

function computeGradients(source: LayerImage) {
  const { size, elevation } = source;
  const gradients = new Float32Array(size * size * 2);

  for (let y = 0; y < size; y++) {
    const up = y > 0 ? y - 1 : y;
    const down = y < size - 1 ? y + 1 : y;

    for (let x = 0; x < size; x++) {
      const left = x > 0 ? x - 1 : x;
      const right = x < size - 1 ? x + 1 : x;

      const index = (x + y * size) * 2;
      gradients[index] = (elevation[right + y * size] - elevation[left + y * size]) / (right - left);
      gradients[index + 1] = (elevation[x + down * size] - elevation[x + up * size]) / (down - up);
    }
  }

  return gradients;
}

function drawGradients(source: LayerImage, gradients: Float32Array) {
  const image = new LayerImage('Gradient', source.size, source.elevation, new Uint8ClampedArray(source.size * source.size * 3).fill(255));
  const spacing = source.size / ARROWS_PER_SIDE;

  const samples: { x: number; y: number; gradient: Vector2 }[] = [];
  for (let column = 0; column < ARROWS_PER_SIDE; column++) {
    for (let row = 0; row < ARROWS_PER_SIDE; row++) {
      const x = Math.floor((column + 0.5) * spacing);
      const y = Math.floor((row + 0.5) * spacing);
      const index = (x + y * source.size) * 2;
      samples.push({ x, y, gradient: new Vector2(gradients[index], gradients[index + 1]) });
    }
  }

  const maxLength = samples.reduce((max, sample) => Math.max(max, sample.gradient.length()), 0);
  if (maxLength === 0) {
    return image;
  }

  const scale = (ARROW_FILL * spacing) / maxLength;
  for (const { x, y, gradient } of samples) {
    if (gradient.lengthSq() === 0) {
      continue;
    }
    const arrow = gradient.clone().multiplyScalar(scale);
    drawVector(image, arrow, x - arrow.x / 2, y - arrow.y / 2, { strokeWidth: 6 });
  }

  return image;
}
