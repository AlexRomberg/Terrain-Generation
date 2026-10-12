import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';

export class ColorFilter implements FilterLayer {
  name = 'Color Filter';
  parameters = {};

  renderLayers(_source: LayerImage, _seed: number): LayerImage[] {
    throw new Error('Method not implemented.');
  }

  renderResult(source: LayerImage, _seed: number): LayerImage {
    const color = new Float32Array([...source.elevation].flatMap((elevation) => [Math.min(elevation / 2 + 0.5, 1), 1, Math.min(elevation / 2 + 0.5, 1)]));
    return new LayerImage('Color Filter Result', source.width, source.height, source.elevation, color);
  }
}
