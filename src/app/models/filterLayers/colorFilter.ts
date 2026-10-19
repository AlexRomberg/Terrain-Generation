import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { LayerParameter } from '../layerParameter';

export class ColorFilter implements FilterLayer {
  name = 'Linear Color Filter';
  parameters = {
    water: new LayerParameter('Water Threshold', 0.1, 0, 1, 0.01),
    grass: new LayerParameter('Grass Threshold', 0.25, 0, 1, 0.01),
    forest: new LayerParameter('Forest Threshold', 0.55, 0, 1, 0.01),
    rock: new LayerParameter('Rock Threshold', 0.75, 0, 1, 0.01),
  };

  renderLayers(source: LayerImage, _seed: number): LayerImage[] {
    const colors = [...source.elevation];
    const max = colors.reduce((a, b) => Math.max(a, b), -Infinity);

    const waterColor = [0.1, 0.2, 0.6];
    const grassColor = [0.2, 0.3, 0];
    const forestColor = [0.1, 0.3, 0.1];
    const rockColor = [0.6, 0.5, 0.5];
    const snowColor = [1, 1, 1];

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

    const color = new Float32Array(colors.flatMap((elevation) => {
      const relativeElevation = elevation / max;

      const range = colorRanges.find((range) => relativeElevation >= range.min && relativeElevation < range.max)
      const color = range ? range.color((relativeElevation - range.min) / (range.max - range.min)) : [0, 0, 0];
      return [...color];
    }));
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
