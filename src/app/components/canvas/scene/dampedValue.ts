import { MathUtils } from 'three';

const ANIMATION_STEPS = 8;
const PRECISION = 0.001;

export class DampedValue {
  target: number;

  constructor(public value: number) {
    this.target = value;
  }

  step(delta: number) {
    if (this.value === this.target) {
      return false;
    }
    const next = MathUtils.damp(this.value, this.target, ANIMATION_STEPS, delta);
    this.value = Math.abs(this.target - next) < PRECISION ? this.target : next;
    return true;
  }
}
