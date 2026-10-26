import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { NumberParameter } from '../layerParameter';

export class ColorFilter implements FilterLayer {
  name = 'Linear Color Filter';
  parameters = {
    water: new NumberParameter('Water Threshold', 0.1, 0, 1, 0.01),
    grass: new NumberParameter('Grass Threshold', 0.25, 0, 1, 0.01),
    forest: new NumberParameter('Forest Threshold', 0.55, 0, 1, 0.01),
    rock: new NumberParameter('Rock Threshold', 0.75, 0, 1, 0.01),
  };

  renderLayers(source: LayerImage, _seed: number): LayerImage[] {
    const max = source.elevation.reduce((a, b) => Math.max(a, b), -Infinity);

    const waterColor = [26, 51, 153];
    const grassColor = [51, 77, 0];
    const forestColor = [26, 77, 26];
    const rockColor = [153, 128, 128];
    const snowColor = [255, 255, 255];

    const waterThreshold = this.parameters.water.value();
    const grassThreshold = this.parameters.grass.value();
    const forestThreshold = this.parameters.forest.value();
    const rockThreshold = this.parameters.rock.value();
    const colorRanges = [
      { min: 0, max: waterThreshold, color: () => waterColor },
      { min: waterThreshold, max: grassThreshold, color: (elevation: number) => this.lerp(waterColor, grassColor, elevation) },
      { min: grassThreshold, max: forestThreshold, color: (elevation: number) => this.lerp(grassColor, forestColor, elevation) },
      { min: forestThreshold, max: rockThreshold, color: (elevation: number) => this.lerp(forestColor, rockColor, elevation) },
      { min: rockThreshold, max: 1, color: (elevation: number) => this.lerp(rockColor, snowColor, elevation) },
    ];

    const color = new Uint8ClampedArray(source.elevation.length * 3);
    source.elevation.forEach((elevation, index) => {
      const relativeElevation = elevation / max;

      const range = colorRanges.find((range) => relativeElevation >= range.min && relativeElevation <= range.max)
      color.set(range ? range.color((relativeElevation - range.min) / (range.max - range.min)) : [0, 0, 0], index * 3);
    });
    return [new LayerImage('Color Filter Result', source.width, source.height, source.elevation, color)];
  }

  renderResult(source: LayerImage, seed: number): LayerImage {
    const [result] = this.renderLayers(source, seed);
    return result;
  }

  private lerp(colorA: number[], colorB: number[], t: number) {
    return colorA.map((a, i) => a + (colorB[i] - a) * t);
  }
}
