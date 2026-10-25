export class LayerImage {
  label: string;
  width: number;
  height: number;
  elevation: Float32Array
  color?: Uint8ClampedArray

  constructor(label: string, width: number, height: number, elevation: Float32Array, color?: Uint8ClampedArray) {
    this.label = label;
    this.width = width;
    this.height = height;
    this.elevation = elevation;
    this.color = color;
  }

  asZeroElevation() {
    const minElevation = this.elevation.reduce((min, value) => Math.min(min, value), Infinity);
    const newElevation = new Float32Array(this.elevation.length).fill(0).map((_, index) => this.elevation[index] - minElevation);
    return new LayerImage(this.label, this.width, this.height, newElevation, this.color);
  }
}