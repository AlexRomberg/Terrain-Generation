import * as THREE from 'three';
import { DampedValue } from './dampedValue';

export class StackItem<T extends THREE.Object3D = THREE.Object3D> {
  readonly y: DampedValue;
  private visible: boolean;

  constructor(
    readonly object: T,
    y: number,
    visible: boolean,
  ) {
    this.y = new DampedValue(y);
    this.visible = visible;
    object.position.y = y;
    object.visible = visible;
  }

  get isVisible() {
    return this.visible && this.object.visible;
  }

  get isHidden() {
    return !this.visible && !this.object.visible;
  }

  moveTo(y: number, visible: boolean) {
    this.y.target = y;
    this.visible = visible;
  }

  step(delta: number) {
    const moved = this.y.step(delta);
    const visible = this.visible || (moved && this.object.visible);
    const toggled = visible !== this.object.visible;
    this.object.position.y = this.y.value;
    this.object.visible = visible;
    return moved || toggled;
  }
}
