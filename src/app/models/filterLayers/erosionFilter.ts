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
    const randomPoints = new Array(this.parameters.cellCount.value()).fill({ x: 0, z: 0 }).map(() => ({ x: Math.round(rnd.random() * source.width), z: Math.round(rnd.random() * source.height) }));

    const voronoiResult = calculateVoronoi(randomPoints, source.width, source.height);
    const voronoiLayer = new LayerImage('Voronoi', source.width, source.height, source.elevation, new Uint8ClampedArray(source.width * source.height * 3).fill(255));
    drawVoronoi(voronoiLayer, voronoiResult);

    for (let i = 0; i < source.elevation.length; i++) {
      source.elevation[i] += displacePoint(i % source.width, Math.floor(i / source.width), voronoiResult.points[voronoiResult.lookup[i]].x, voronoiResult.points[voronoiResult.lookup[i]].z, new Vector2(gradients[i * 2], gradients[i * 2 + 1]));
    }

    return [drawGradients(source, gradients), voronoiLayer];
  }

  renderResult(source: LayerImage, seed: number) {
    return this.renderLayers(source, seed).at(-1)!;
  }
}

function computeGradients(source: LayerImage) {
  const { width, height, elevation } = source;
  const cellWidth = GRID_EXTENT / (width - 1);
  const cellDepth = GRID_EXTENT / (height - 1);
  const gradients = new Float32Array(width * height * 2);

  for (let z = 0; z < height; z++) {
    const up = z > 0 ? z - 1 : z;
    const down = z < height - 1 ? z + 1 : z;
    const spanZ = (down - up) * cellDepth;

    for (let x = 0; x < width; x++) {
      const left = x > 0 ? x - 1 : x;
      const right = x < width - 1 ? x + 1 : x;
      const spanX = (right - left) * cellWidth;

      const index = (x + z * width) * 2;
      gradients[index] = (elevation[right + z * width] - elevation[left + z * width]) / spanX;
      gradients[index + 1] = (elevation[x + down * width] - elevation[x + up * width]) / spanZ;
    }
  }

  return gradients;
}

function drawGradients(source: LayerImage, gradients: Float32Array) {
  const image = new LayerImage('Gradient', source.width, source.height, source.elevation, new Uint8ClampedArray(source.width * source.height * 3).fill(255));
  const spacingX = source.width / ARROWS_PER_SIDE;
  const spacingZ = source.height / ARROWS_PER_SIDE;

  const samples: { x: number; z: number; gradient: Vector2 }[] = [];
  for (let column = 0; column < ARROWS_PER_SIDE; column++) {
    for (let row = 0; row < ARROWS_PER_SIDE; row++) {
      const x = Math.floor((column + 0.5) * spacingX);
      const z = Math.floor((row + 0.5) * spacingZ);
      const index = (x + z * source.width) * 2;
      samples.push({ x, z, gradient: new Vector2(gradients[index], gradients[index + 1]) });
    }
  }

  const maxLength = samples.reduce((max, sample) => Math.max(max, sample.gradient.length()), 0);
  if (maxLength === 0) {
    return image;
  }

  const scale = (ARROW_FILL * Math.min(spacingX, spacingZ)) / maxLength;
  for (const { x, z, gradient } of samples) {
    if (gradient.lengthSq() === 0) {
      continue;
    }
    const arrow = gradient.clone().multiplyScalar(scale);
    drawVector(image, arrow, x - arrow.x / 2, z - arrow.y / 2, { strokeWidth: 6 });
  }

  return image;
}

function displacePoint(x: number, z: number, centerX: number, centerZ: number, gradient: Vector2) {
  const normalizedGradient = gradient.clone().normalize();
  const center = new Vector2(centerX, centerZ);
  const point = new Vector2(x, z);
  const displacement = center.add(normalizedGradient).sub(point);

  return Math.sin(displacement.y / 10) / 10;
}
