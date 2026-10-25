import * as THREE from 'three';
import { LayerImage } from '../../../models/layerImage';

const RESOLUTION = 4;

type PixelWriter = (pixels: Uint8Array, target: number, source: number) => void;

export class LayerTextures {
  private readonly pixelCache = new WeakMap<Float32Array | Uint8ClampedArray, Uint8Array>();

  constructor(private readonly anisotropy: number) { }

  create(image: LayerImage) {
    const texture = new THREE.DataTexture(
      this.pixelsOf(image),
      image.width / RESOLUTION,
      image.height / RESOLUTION,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = this.anisotropy;
    texture.needsUpdate = true;
    return texture;
  }

  private pixelsOf(image: LayerImage) {
    const key = image.color ?? image.elevation;
    const pixels = this.pixelCache.get(key) ?? renderPixels(image);
    this.pixelCache.set(key, pixels);
    return pixels;
  }
}

function renderPixels(image: LayerImage) {
  const width = image.width / RESOLUTION;
  const height = image.height / RESOLUTION;
  const pixels = new Uint8Array(width * height * 4);
  const write = image.color ? colorWriter(image.color) : grayscaleWriter(image.elevation);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const source = row * RESOLUTION * image.width + col * RESOLUTION;
      const target = ((height - 1 - row) * width + col) * 4;
      write(pixels, target, source);
      pixels[target + 3] = 255;
    }
  }

  return pixels;
}

function colorWriter(color: Uint8ClampedArray): PixelWriter {
  return (pixels, target, source) => {
    pixels[target] = color[source * 3];
    pixels[target + 1] = color[source * 3 + 1];
    pixels[target + 2] = color[source * 3 + 2];
  };
}

function grayscaleWriter(elevation: Float32Array): PixelWriter {
  const min = elevation.reduce((a, b) => Math.min(a, b), Infinity);
  const max = elevation.reduce((a, b) => Math.max(a, b), -Infinity);
  const range = max - min || 1;
  return (pixels, target, source) => {
    const value = ((elevation[source] - min) / range) * 255;
    pixels.fill(value, target, target + 3);
  };
}
