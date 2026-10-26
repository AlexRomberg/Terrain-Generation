import { Vector2 } from 'three';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { drawVector, drawVoronoi } from '../drawing';
import Srand from 'seeded-rand';
import { calculateVoronoi } from '../common';
import { NumberParameter } from '../layerParameter';

const GRID_EXTENT = 2;
const ARROWS_PER_SIDE = 10;
const ARROW_FILL = 0.8;

export class ErosionFilter implements FilterLayer {
  name = 'Stateless Erosion';
  parameters = {
    cellCount: new NumberParameter('Cell Count', 100, 10, 1000, 10),
  };

  renderLayers(source: LayerImage, seed: number) {
    const gradients = computeGradients(source);


    const rnd = new Srand(seed);
    const randomPoints = new Array(this.parameters.cellCount.value()).fill({ x: 0, y: 0 }).map(() => ({ x: Math.round(rnd.random() * source.size), y: Math.round(rnd.random() * source.size) }));

    const voronoiResult = calculateVoronoi(randomPoints, source.size);
    const voronoiLayer = new LayerImage('Voronoi', source.size, source.elevation, new Uint8ClampedArray(source.size * source.size * 3).fill(255));
    drawVoronoi(voronoiLayer, voronoiResult);

    for (let i = 0; i < source.elevation.length; i++) {
      source.elevation[i] += displacePoint(i % source.size, Math.floor(i / source.size), voronoiResult.points[voronoiResult.lookup[i]].x, voronoiResult.points[voronoiResult.lookup[i]].y, new Vector2(gradients[i * 2], gradients[i * 2 + 1]));
    }

    return [drawGradients(source, gradients), voronoiLayer];
  }

  renderResult(source: LayerImage, seed: number) {
    return this.renderLayers(source, seed).at(-1)!;
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
