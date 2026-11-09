import Srand from 'seeded-rand';
import { FilterLayer, numberParam, ParameterValues, RenderContext } from '../layerDefinition';
import { layerImage, LayerImage } from '../layerImage';

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

const parameters = {
  water: numberParam('Water Threshold', 0.2, 0, 1, 0.01),
  grass: numberParam('Grass Threshold', 0.25, 0, 1, 0.01),
  forest: numberParam('Forest Threshold', 0.55, 0, 1, 0.01),
  rock: numberParam('Rock Threshold', 0.75, 0, 1, 0.01),
  treeSize: numberParam('Tree Size', 6, 2, 20, 1),
  treeHeight: numberParam('Tree Height', 0.01, 0, 0.05, 0.001),
};

type ColorSettings = ParameterValues<typeof parameters>;

export class ColorFilter implements FilterLayer<typeof parameters> {
  readonly role = 'filter';
  readonly type = 'linear-color';
  readonly name = 'Linear Color Filter';
  readonly parameters = parameters;

  render(source: LayerImage, settings: ColorSettings, { seed, report }: RenderContext) {
    const canopy = ColorFilter.generateCanopy(source.size, settings.treeSize, seed);
    report(0.8);
    return this.colorize(source, settings, canopy);
  }

  renderLayers(source: LayerImage, settings: ColorSettings, { seed, report }: RenderContext) {
    const canopy = ColorFilter.generateCanopy(source.size, settings.treeSize, seed);
    report(0.8);
    return [
      layerImage('Forest Canopy', source.size, canopy),
      this.colorize(source, settings, canopy),
    ];
  }

  private colorize(source: LayerImage, settings: ColorSettings, canopy: Float32Array) {
    const { size } = source;
    let min = Infinity;
    let max = -Infinity;
    for (const value of source.elevation) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const range = max - min || 1;

    const {
      water: waterThreshold,
      grass: grassThreshold,
      forest: forestThreshold,
      rock: rockThreshold,
    } = settings;
    const waterLevel = min + waterThreshold * range;
    const treeHeight = settings.treeHeight * range;

    const elevation = new Float32Array(source.elevation);
    const color = new Uint8ClampedArray(source.elevation.length * 3);

    for (let i = 0; i < source.elevation.length; i++) {
      const relative = (source.elevation[i] - min) / range;
      const target = i * 3;

      if (relative < waterThreshold) {
        elevation[i] = waterLevel;
        ColorFilter.writeLerp(
          color,
          target,
          SHALLOW_WATER,
          DEEP_WATER,
          1 - relative / waterThreshold,
        );
        continue;
      }

      if (relative < grassThreshold) {
        ColorFilter.writeLerp(
          color,
          target,
          SHALLOW_WATER,
          GRASS,
          ColorFilter.progress(relative, waterThreshold, grassThreshold),
        );
      } else if (relative < forestThreshold) {
        ColorFilter.writeLerp(
          color,
          target,
          GRASS,
          FOREST,
          ColorFilter.progress(relative, grassThreshold, forestThreshold),
        );
      } else if (relative < rockThreshold) {
        ColorFilter.writeLerp(
          color,
          target,
          FOREST,
          ROCK,
          ColorFilter.progress(relative, forestThreshold, rockThreshold),
        );
      } else {
        ColorFilter.writeLerp(
          color,
          target,
          ROCK,
          SNOW,
          ColorFilter.progress(relative, rockThreshold, 1),
        );
      }

      const forestMask =
        ColorFilter.smoothstep(grassThreshold, grassThreshold + FOREST_FADE, relative) *
        (1 - ColorFilter.smoothstep(forestThreshold - FOREST_FADE, forestThreshold, relative));
      if (forestMask > 0) {
        const crown = canopy[i];
        elevation[i] += forestMask * crown * treeHeight;
        const shade = 1 - forestMask * CANOPY_SHADE * (1 - crown);
        color[target] *= shade;
        color[target + 1] *= shade;
        color[target + 2] *= shade;
      }
    }

    return layerImage('Color Filter Result', size, elevation, color);
  }

  private static generateCanopy(size: number, treeSize: number, seed: number) {
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

  private static writeLerp(
    target: Uint8ClampedArray,
    offset: number,
    from: RGB,
    to: RGB,
    t: number,
  ) {
    target[offset] = from[0] + (to[0] - from[0]) * t;
    target[offset + 1] = from[1] + (to[1] - from[1]) * t;
    target[offset + 2] = from[2] + (to[2] - from[2]) * t;
  }

  private static progress(value: number, from: number, to: number) {
    return to > from ? (value - from) / (to - from) : 0;
  }

  private static smoothstep(edge0: number, edge1: number, x: number) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }
}
