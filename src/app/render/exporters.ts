import { BufferAttribute, BufferGeometry, Mesh } from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { LayerImage } from '../models/layerImage';
import { ELEVATION_SCALE, TERRAIN_SIZE } from '../models/terrain';
import { encodePng } from './png';

export type ExportFormat = 'stl' | 'obj' | 'heightmap' | 'colormap';

const MODEL_WIDTH_MM = 100;
const MODEL_SCALE = MODEL_WIDTH_MM / TERRAIN_SIZE;
const BASE_THICKNESS = 0.03 * MODEL_SCALE;

interface TerrainMesh {
  positions: Float32Array;
  colors?: Float32Array;
  indices: Uint32Array;
}

function triangleCount(resolution: number) {
  const segments = resolution - 1;
  return 2 * segments * segments + 12 * segments;
}

function vertexCount(resolution: number) {
  return resolution * resolution + 4 * (resolution - 1) + 1;
}

export async function exportTerrain(image: LayerImage, format: ExportFormat) {
  switch (format) {
    case 'stl':
      return encodeStl(buildMesh(image, false));
    case 'obj':
      return encodeObj(buildMesh(image, true));
    case 'heightmap':
      return encodeHeightmap(image);
    case 'colormap':
      return encodeColormap(image);
  }
}

function buildMesh(image: LayerImage, withColor: boolean): TerrainMesh {
  const { size: resolution, elevation, color } = image;
  const segments = resolution - 1;
  const surfaceCount = resolution * resolution;
  const perimeter = perimeterOf(resolution);
  const center = surfaceCount + perimeter.length;
  const positions = new Float32Array(vertexCount(resolution) * 3);
  const colors = withColor && color ? new Float32Array(vertexCount(resolution) * 3) : undefined;
  const sourceIndex = (i: number, j: number) => j * resolution + i;
  const coordinate = (index: number) => (index / segments - 0.5) * MODEL_WIDTH_MM;

  for (let j = 0; j < resolution; j++) {
    for (let i = 0; i < resolution; i++) {
      const vertex = j * resolution + i;
      const source = sourceIndex(i, j);
      positions.set(
        [coordinate(i), BASE_THICKNESS + elevation[source] * ELEVATION_SCALE * MODEL_SCALE, coordinate(j)],
        vertex * 3,
      );
      if (colors && color) {
        colors.set([color[source * 3] / 255, color[source * 3 + 1] / 255, color[source * 3 + 2] / 255], vertex * 3);
      }
    }
  }

  perimeter.forEach((top, k) => {
    const vertex = surfaceCount + k;
    positions.set([positions[top * 3], 0, positions[top * 3 + 2]], vertex * 3);
    colors?.set(colors.subarray(top * 3, top * 3 + 3), vertex * 3);
  });
  colors?.fill(0.5, center * 3, center * 3 + 3);

  const indices = new Uint32Array(triangleCount(resolution) * 3);
  let cursor = 0;
  const addTriangle = (a: number, b: number, c: number, expected: [number, number, number]) => {
    const flip = dot(normalOf(positions, a, b, c), expected) < 0;
    indices.set(flip ? [a, c, b] : [a, b, c], cursor);
    cursor += 3;
  };

  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * resolution + i;
      const b = a + 1;
      const c = a + resolution;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], cursor);
      cursor += 6;
    }
  }

  perimeter.forEach((top, k) => {
    const next = (k + 1) % perimeter.length;
    const nextTop = perimeter[next];
    const bottom = surfaceCount + k;
    const nextBottom = surfaceCount + next;
    const outward: [number, number, number] = [
      positions[top * 3] + positions[nextTop * 3],
      0,
      positions[top * 3 + 2] + positions[nextTop * 3 + 2],
    ];
    addTriangle(top, nextTop, nextBottom, outward);
    addTriangle(top, nextBottom, bottom, outward);
    addTriangle(center, bottom, nextBottom, [0, -1, 0]);
  });

  return { positions, colors, indices };
}

function perimeterOf(resolution: number) {
  const last = resolution - 1;
  const perimeter: number[] = [];
  for (let i = 0; i < last; i++) perimeter.push(i);
  for (let j = 0; j < last; j++) perimeter.push(j * resolution + last);
  for (let i = last; i > 0; i--) perimeter.push(last * resolution + i);
  for (let j = last; j > 0; j--) perimeter.push(j * resolution);
  return perimeter;
}

function normalOf(positions: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const ux = positions[b * 3] - positions[a * 3];
  const uy = positions[b * 3 + 1] - positions[a * 3 + 1];
  const uz = positions[b * 3 + 2] - positions[a * 3 + 2];
  const vx = positions[c * 3] - positions[a * 3];
  const vy = positions[c * 3 + 1] - positions[a * 3 + 1];
  const vz = positions[c * 3 + 2] - positions[a * 3 + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function encodeStl({ positions, indices }: TerrainMesh) {
  const geometry = new BufferGeometry()
    .setAttribute('position', new BufferAttribute(positions, 3))
    .setIndex(new BufferAttribute(indices, 1))
    .rotateX(Math.PI / 2);
  const stl = new STLExporter().parse(new Mesh(geometry), { binary: true });
  return new Blob([stl], { type: 'model/stl' });
}

function encodeObj({ positions, colors, indices }: TerrainMesh) {
  const parts: string[] = ['# Terrain-Simulator export, Y-up, millimetres\no terrain\n'];
  const vertices = positions.length / 3;
  const triangles = indices.length / 3;
  let lines: string[] = [];
  const flush = () => {
    parts.push(lines.join('\n') + '\n');
    lines = [];
  };

  for (let v = 0; v < vertices; v++) {
    const position = `v ${fixed(positions[v * 3])} ${fixed(positions[v * 3 + 1])} ${fixed(positions[v * 3 + 2])}`;
    lines.push(
      colors
        ? `${position} ${fixed(colors[v * 3])} ${fixed(colors[v * 3 + 1])} ${fixed(colors[v * 3 + 2])}`
        : position,
    );
    if (lines.length === 0x10000) {
      flush();
    }
  }
  flush();

  for (let t = 0; t < triangles; t++) {
    lines.push(`f ${indices[t * 3] + 1} ${indices[t * 3 + 1] + 1} ${indices[t * 3 + 2] + 1}`);
    if (lines.length === 0x10000) {
      flush();
    }
  }
  flush();

  return new Blob(parts, { type: 'model/obj' });
}

function fixed(value: number) {
  return Number(value.toFixed(4)).toString();
}

function encodeHeightmap({ size, elevation }: LayerImage) {
  let min = Infinity;
  let max = -Infinity;
  for (const value of elevation) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const range = max - min || 1;

  return encodePng({
    width: size,
    height: size,
    bitDepth: 16,
    writeRow: (row, target) => {
      for (let col = 0; col < size; col++) {
        const value = Math.round(((elevation[row * size + col] - min) / range) * 65535);
        target[col * 2] = value >> 8;
        target[col * 2 + 1] = value & 0xff;
      }
    },
  });
}

function encodeColormap({ size, color }: LayerImage) {
  if (!color) {
    throw new Error('This terrain has no color layer');
  }
  const pixels = new ImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    pixels.data.set(color.subarray(i * 3, i * 3 + 3), i * 4);
    pixels.data[i * 4 + 3] = 255;
  }
  const canvas = new OffscreenCanvas(size, size);
  canvas.getContext('2d')?.putImageData(pixels, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}
