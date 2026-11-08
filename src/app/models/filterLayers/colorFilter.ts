import { FilterLayer, numberParam, ParameterValues, RenderContext } from '../layerDefinition';
import { LayerImage, layerImage } from '../layerImage';

const WATER_COLOR = [26, 51, 153];
const GRASS_COLOR = [51, 77, 0];
const FOREST_COLOR = [26, 77, 26];
const ROCK_COLOR = [153, 128, 128];
const SNOW_COLOR = [255, 255, 255];

const parameters = {
  water: numberParam('Water Threshold', 0.1, 0, 1, 0.01),
  grass: numberParam('Grass Threshold', 0.11, 0, 1, 0.01),
  forest: numberParam('Forest Threshold', 0.55, 0, 1, 0.01),
  rock: numberParam('Rock Threshold', 0.75, 0, 1, 0.01),
};

type ColorParams = ParameterValues<typeof parameters>;

export class ColorFilter implements FilterLayer<typeof parameters> {
  readonly role = 'filter';
  readonly type = 'linear-color';
  readonly name = 'Linear Color Filter';
  readonly parameters = parameters;

  render(source: LayerImage, params: ColorParams, { report }: RenderContext) {
    const max = source.elevation.reduce((a, b) => Math.max(a, b), -Infinity);
    const { water, grass, forest, rock } = params;
    const colorRanges = [
      { min: Number.NEGATIVE_INFINITY, max: water, color: () => WATER_COLOR },
      { min: water, max: grass, color: () => GRASS_COLOR },
      { min: grass, max: forest, color: (elevation: number) => this.lerp(GRASS_COLOR, FOREST_COLOR, elevation) },
      { min: forest, max: rock, color: (elevation: number) => this.lerp(FOREST_COLOR, ROCK_COLOR, elevation) },
      { min: rock, max: 1, color: (elevation: number) => this.lerp(ROCK_COLOR, SNOW_COLOR, elevation) },
    ];

    const pixelCount = source.elevation.length;
    const color = new Uint8ClampedArray(pixelCount * 3);
    source.elevation.forEach((elevation, index) => {
      if ((index & 0x3ffff) === 0) {
        report(index / pixelCount);
      }
      const relativeElevation = elevation / max;
      const range = colorRanges.find((range) => relativeElevation >= range.min && relativeElevation <= range.max);
      color.set(range ? range.color((relativeElevation - range.min) / (range.max - range.min)) : [0, 0, 0], index * 3);
    });

    return layerImage(
      'Color Filter Result',
      source.size,
      source.elevation.map((e) => Math.max(water * max, e)),
      color,
    );
  }

  renderLayers(source: LayerImage, params: ColorParams, context: RenderContext) {
    return [this.render(source, params, context)];
  }

  private lerp(colorA: number[], colorB: number[], t: number) {
    return colorA.map((a, i) => a + (colorB[i] - a) * t);
  }
}
