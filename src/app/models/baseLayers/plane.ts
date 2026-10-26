import { BaseLayer, DEPTH, WIDTH } from '../baseLayer';
import { LayerImage } from '../layerImage';

export class Plane implements BaseLayer {
  name = 'Plane';
  parameters = {};

  renderLayers(_seed: number) {
    return [new LayerImage('Plane', WIDTH, DEPTH, new Float32Array(WIDTH * DEPTH).fill(0))];
  }
  renderResult(seed: number) {
    return this.renderLayers(seed)[0];
  }

}
