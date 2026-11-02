export class LayerImage {
  label: string;
  size: number;
  elevation: Float32Array
  color?: Uint8ClampedArray

  constructor(label: string, size: number, elevation: Float32Array, color?: Uint8ClampedArray) {
    this.label = label;
    this.size = size;
    this.elevation = elevation;
    this.color = color;
  }

  private zeroed?: { elevation: Float32Array; color?: Uint8ClampedArray; image: LayerImage };

  asZeroElevation() {
    if (this.zeroed?.elevation !== this.elevation || this.zeroed.color !== this.color) {
      const minElevation = this.elevation.reduce((min, value) => Math.min(min, value), Infinity);
      const newElevation = this.elevation.map((value) => value - minElevation);
      this.zeroed = {
        elevation: this.elevation,
        color: this.color,
        image: new LayerImage(this.label, this.size, newElevation, this.color),
      };
    }
    return this.zeroed.image;
  }
}