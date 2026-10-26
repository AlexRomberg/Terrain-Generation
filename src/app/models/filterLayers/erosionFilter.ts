import { Vector2 } from 'three';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { drawVector, drawVoronoi } from '../drawing';
import Srand from 'seeded-rand';
import { calculateVoronoi, VoronoiResult } from '../common';
import { NumberParameter } from '../layerParameter';

const GRID_EXTENT = 2;
const ARROWS_PER_SIDE = 10;
const ARROW_FILL = 0.8;

export class ErosionFilter implements FilterLayer {
  name = 'Stateless Erosion';
  parameters = {
    cellCount: new NumberParameter('Cell Count', 100, 10, 1000, 10),
  };

  private cachedSource?: LayerImage;
  private cachedParams = '';
  private cachedLayers: LayerImage[] = [];
  private voronoiParams = '';
  private voronoiResult?: { result: VoronoiResult; color: Uint8ClampedArray };

  renderLayers(source: LayerImage, seed: number) {
    const cellCount = this.parameters.cellCount.value();
    const params = `${seed};${cellCount}`;
    if (source === this.cachedSource && params === this.cachedParams) {
      return this.cachedLayers;
    }

    const gradients = computeGradients(source);
    const voronoi = this.getVoronoi(source.size, seed, cellCount);

    const elevation = source.elevation.slice();
    for (let i = 0; i < elevation.length; i++) {
      const center = voronoi.result.points[voronoi.result.lookup[i]];
      elevation[i] += displacePoint(i % source.size, Math.floor(i / source.size), center.x, center.y, new Vector2(gradients[i * 2], gradients[i * 2 + 1]));
    }

    this.cachedSource = source;
    this.cachedParams = params;
    this.cachedLayers = [
      drawGradients(source, gradients),
      new LayerImage('Voronoi', source.size, elevation, voronoi.color),
    ];
    return this.cachedLayers;
  }

  renderResult(source: LayerImage, seed: number) {
    return this.renderLayers(source, seed).at(-1)!;
  }

  private getVoronoi(size: number, seed: number, cellCount: number) {
    const params = `${size};${seed};${cellCount}`;
    if (this.voronoiResult && params === this.voronoiParams) {
      return this.voronoiResult;
    }

    const rnd = new Srand(seed);
    const randomPoints = new Array(cellCount).fill({ x: 0, y: 0 }).map(() => ({ x: Math.round(rnd.random() * size), y: Math.round(rnd.random() * size) }));
    const result = calculateVoronoi(randomPoints, size);
    const image = new LayerImage('Voronoi', size, new Float32Array(size * size), new Uint8ClampedArray(size * size * 3).fill(255));
    drawVoronoi(image, result);

    this.voronoiResult = { result, color: image.color! };
    this.voronoiParams = params;
    return this.voronoiResult;
  }
}

function computeGradients(source: LayerImage) {
  const { size, elevation } = source;
  const cellSize = GRID_EXTENT / (size - 1);
  const gradients = new Float32Array(size * size * 2);

  for (let y = 0; y < size; y++) {
    const up = y > 0 ? y - 1 : y;
    const down = y < size - 1 ? y + 1 : y;
    const spanY = (down - up) * cellSize;

    for (let x = 0; x < size; x++) {
      const left = x > 0 ? x - 1 : x;
      const right = x < size - 1 ? x + 1 : x;
      const spanX = (right - left) * cellSize;

      const index = (x + y * size) * 2;
      gradients[index] = (elevation[right + y * size] - elevation[left + y * size]) / spanX;
      gradients[index + 1] = (elevation[x + down * size] - elevation[x + up * size]) / spanY;
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

function displacePoint(x: number, y: number, centerX: number, centerY: number, gradient: Vector2) {
  const normalizedGradient = gradient.clone().normalize();
  const center = new Vector2(centerX, centerY);
  const point = new Vector2(x, y);
  const displacement = center.add(normalizedGradient).sub(point);

  return Math.sin(displacement.y / 10) / 10;
}
