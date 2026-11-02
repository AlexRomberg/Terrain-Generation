import { BaseLayer, SIZE } from '../baseLayer';
import { LayerImage } from '../layerImage';

export class Plane implements BaseLayer {
  name = 'Plane';
  parameters = {};

  private readonly image = new LayerImage('Plane', SIZE, new Float32Array(SIZE * SIZE));

  renderLayers(_seed: number) {
    return [this.image];
  }
  renderResult(seed: number) {
    return this.renderLayers(seed)[0];
  }

}
