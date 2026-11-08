import Srand from 'seeded-rand';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { NumberParameter } from '../layerParameter';

type RGB = readonly [number, number, number];

const DEEP_WATER: RGB = [13, 31, 102];
const SHALLOW_WATER: RGB = [51, 102, 179];
const GRASS: RGB = [51, 77, 0];
const FOREST: RGB = [26, 77, 26];
const ROCK: RGB = [153, 128, 128];
const SNOW: RGB = [255, 255, 255];

//Width (in relative elevation) over which the canopy fades in/out at the forest borders.
const FOREST_FADE = 0.03;
// Crown radius relative to the tree grid cell size. (max 1)
const CROWN_RADIUS = 0.5;
// Minimum random height factor of a single tree (max 1).
const MIN_TREE_HEIGHT = 0.7;
// How much darker the gaps between crowns are compared to the crown tops.
const CANOPY_SHADE = 0.4;

export class ColorFilter implements FilterLayer {
  name = 'Linear Color Filter';
  parameters = {
    water: new NumberParameter('Water Threshold', 0.2, 0, 1, 0.01),
    grass: new NumberParameter('Grass Threshold', 0.25, 0, 1, 0.01),
    forest: new NumberParameter('Forest Threshold', 0.55, 0, 1, 0.01),
    rock: new NumberParameter('Rock Threshold', 0.75, 0, 1, 0.01),
    treeSize: new NumberParameter('Tree Size', 6, 2, 20, 1),
    treeHeight: new NumberParameter('Tree Height', 0.01, 0, 0.05, 0.001),
  };

  private canopyCache?: { key: string; canopy: Float32Array };

  renderLayers(source: LayerImage, seed: number): LayerImage[] {
    const { size } = source;
    const canopy = this.canopy(size, this.parameters.treeSize.value(), seed);

    let min = Infinity;
    let max = -Infinity;
    for (const value of source.elevation) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const range = max - min || 1;

    const waterThreshold = this.parameters.water.value();
    const grassThreshold = this.parameters.grass.value();
    const forestThreshold = this.parameters.forest.value();
    const rockThreshold = this.parameters.rock.value();
    const waterLevel = min + waterThreshold * range;
    const treeHeight = this.parameters.treeHeight.value() * range;

    const elevation = new Float32Array(source.elevation);
    const color = new Uint8ClampedArray(source.elevation.length * 3);

    for (let i = 0; i < source.elevation.length; i++) {
      const relative = (source.elevation[i] - min) / range;
      const target = i * 3;

      if (relative < waterThreshold) {
        elevation[i] = waterLevel;
        writeLerp(color, target, SHALLOW_WATER, DEEP_WATER, 1 - relative / waterThreshold);
        continue;
      }

      if (relative < grassThreshold) {
        writeLerp(color, target, SHALLOW_WATER, GRASS, progress(relative, waterThreshold, grassThreshold));
      } else if (relative < forestThreshold) {
        writeLerp(color, target, GRASS, FOREST, progress(relative, grassThreshold, forestThreshold));
      } else if (relative < rockThreshold) {
        writeLerp(color, target, FOREST, ROCK, progress(relative, forestThreshold, rockThreshold));
      } else {
        writeLerp(color, target, ROCK, SNOW, progress(relative, rockThreshold, 1));
      }

      const forestMask =
        smoothstep(grassThreshold, grassThreshold + FOREST_FADE, relative) *
        (1 - smoothstep(forestThreshold - FOREST_FADE, forestThreshold, relative));
      if (forestMask > 0) {
        const crown = canopy[i];
        elevation[i] += forestMask * crown * treeHeight;
        const shade = 1 - forestMask * CANOPY_SHADE * (1 - crown);
        color[target] *= shade;
        color[target + 1] *= shade;
        color[target + 2] *= shade;
      }
    }

    return [
      new LayerImage('Forest Canopy', size, canopy),
      new LayerImage('Color Filter Result', size, elevation, color),
    ];
  }

  renderResult(source: LayerImage, seed: number): LayerImage {
    return this.renderLayers(source, seed).at(-1)!;
  }

  private canopy(size: number, treeSize: number, seed: number) {
    const key = `${size};${treeSize};${seed}`;
    if (this.canopyCache?.key !== key) {
      this.canopyCache = { key, canopy: generateCanopy(size, treeSize, seed) };
    }
    return this.canopyCache.canopy;
  }
}

function generateCanopy(size: number, treeSize: number, seed: number) {
  const cells = Math.ceil(size / treeSize);
  const rnd = new Srand(seed);
  const trees = new Float32Array(cells * cells * 3);
  for (let cell = 0; cell < cells * cells; cell++) {
    const cellX = cell % cells;
    const cellY = Math.floor(cell / cells);
    trees[cell * 3] = (cellX + rnd.random()) * treeSize;
    trees[cell * 3 + 1] = (cellY + rnd.random()) * treeSize;
    trees[cell * 3 + 2] = MIN_TREE_HEIGHT + rnd.random() * (1 - MIN_TREE_HEIGHT);
  }

  const radiusSquared = (CROWN_RADIUS * treeSize) ** 2;
  const canopy = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const cellY = Math.floor(y / treeSize);
    for (let x = 0; x < size; x++) {
      const cellX = Math.floor(x / treeSize);
      let crown = 0;
      for (let ny = Math.max(0, cellY - 1); ny <= Math.min(cells - 1, cellY + 1); ny++) {
        for (let nx = Math.max(0, cellX - 1); nx <= Math.min(cells - 1, cellX + 1); nx++) {
          const tree = (ny * cells + nx) * 3;
          const dx = x - trees[tree];
          const dy = y - trees[tree + 1];
          const dome = 1 - (dx * dx + dy * dy) / radiusSquared;
          if (dome > 0) {
            crown = Math.max(crown, dome * trees[tree + 2]);
          }
        }
      }
      canopy[y * size + x] = crown;
    }
  }
  return canopy;
}

function writeLerp(target: Uint8ClampedArray, offset: number, from: RGB, to: RGB, t: number) {
  target[offset] = from[0] + (to[0] - from[0]) * t;
  target[offset + 1] = from[1] + (to[1] - from[1]) * t;
  target[offset + 2] = from[2] + (to[2] - from[2]) * t;
}

function progress(value: number, from: number, to: number) {
  return to > from ? (value - from) / (to - from) : 0;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
