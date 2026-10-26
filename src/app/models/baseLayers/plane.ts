import { BaseLayer, SIZE } from '../baseLayer';
import { LayerImage } from '../layerImage';

export class Plane implements BaseLayer {
  name = 'Plane';
  parameters = {};

  renderLayers(_seed: number) {
    return [new LayerImage('Plane', SIZE, new Float32Array(SIZE * SIZE).fill(0))];
  }
  renderResult(seed: number) {
    return this.renderLayers(seed)[0];
  }

}
