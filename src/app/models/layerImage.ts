class LayerImage {
  label: string;
  width: number;
  height: number;
  elevation: Float32Array
  color?: Uint8Array

  constructor(label: string, width: number, height: number, elevation: Float32Array, color: Uint8Array) {
    this.label = label;
    this.width = width;
    this.height = height;
    this.elevation = elevation;
    this.color = color;
  }
}
