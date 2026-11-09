export interface LayerImage {
  label: string;
  size: number;
  elevation: Float32Array;
  color?: Uint8ClampedArray;
}

export function layerImage(
  label: string,
  size: number,
  elevation: Float32Array,
  color?: Uint8ClampedArray,
): LayerImage {
  return color ? { label, size, elevation, color } : { label, size, elevation };
}

export function zeroElevation(image: LayerImage): LayerImage {
  const { elevation } = image;
  let min = Infinity;
  for (const value of elevation) {
    min = Math.min(min, value);
  }
  return { ...image, elevation: elevation.map((value) => value - min) };
}

export function buffersOf(images: readonly LayerImage[]) {
  const buffers = new Set<ArrayBufferLike>();
  for (const { elevation, color } of images) {
    buffers.add(elevation.buffer);
    if (color) {
      buffers.add(color.buffer);
    }
  }
  return buffers;
}

export function byteSize(images: readonly LayerImage[]) {
  let bytes = 0;
  for (const buffer of buffersOf(images)) {
    bytes += buffer.byteLength;
  }
  return bytes;
}
