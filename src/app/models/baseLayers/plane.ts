import { BaseLayer } from '../layerDefinition';
import { layerImage } from '../layerImage';
import { SIZE } from '../terrain';

const parameters = {};

export class Plane implements BaseLayer<typeof parameters> {
  readonly role = 'base';
  readonly type = 'plane';
  readonly name = 'Plane';
  readonly parameters = parameters;

  render() {
    return layerImage('Plane', SIZE, new Float32Array(SIZE * SIZE));
  }

  renderLayers() {
    return [this.render()];
  }
}
