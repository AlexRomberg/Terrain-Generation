import * as THREE from 'three';
import { DEPTH, WIDTH } from '../../../models/baseLayer';
import { LayerImage } from '../../../models/layerImage';
import { COLOR, Theme } from './theme';

export const TERRAIN_SIZE = 2;
const SEGMENTS_X = WIDTH - 1;
const SEGMENTS_Z = DEPTH - 1;
const HEIGHT_SCALE = 0.1;
const SURFACE_OFFSET = 0.03;

export class TerrainBlock {
  readonly object = new THREE.Group();
  height = SURFACE_OFFSET;
  private readonly surface = createSurface();
  private readonly perimeter = buildPerimeter();
  private readonly wallPositions = new THREE.Float32BufferAttribute(
    new Float32Array((this.perimeter.length - 1) * 18),
    3,
  );
  private readonly walls = createWalls(this.wallPositions);
  private readonly bottom = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE).rotateX(Math.PI / 2),
    this.walls.material,
  );

  constructor() {
    this.object.add(this.surface, this.walls, this.bottom);
    this.updateWalls();
  }

  setImage(image: LayerImage) {
    this.updateHeights(image.elevation);
    this.updateColors(image.color);
    this.updateNormals();
    this.updateWalls();
  }

  applyTheme(theme: Theme) {
    this.walls.material.color.set(theme.walls);
  }

  dispose() {
    this.surface.geometry.dispose();
    this.surface.material.dispose();
    this.walls.geometry.dispose();
    this.walls.material.dispose();
    this.bottom.geometry.dispose();
  }

  private updateHeights(elevation: Float32Array) {
    const positions = this.surface.geometry.getAttribute('position');
    let top = 0;
    for (let index = 0; index < elevation.length; index++) {
      const y = elevation[index] * HEIGHT_SCALE;
      positions.setY(index, y);
      top = Math.max(top, y);
    }
    positions.needsUpdate = true;
    this.height = SURFACE_OFFSET + top;
  }

  private updateColors(color?: Uint8ClampedArray) {
    const colors = this.surface.geometry.getAttribute('color');
    if (color) {
      colors.array.set(color);
    } else {
      colors.array.fill(255);
    }
    colors.needsUpdate = true;
  }

  private updateNormals() {
    const heights = this.surface.geometry.getAttribute('position').array;
    const normals = this.surface.geometry.getAttribute('normal');
    const output = normals.array;
    const cellWidth = TERRAIN_SIZE / SEGMENTS_X;
    const cellDepth = TERRAIN_SIZE / SEGMENTS_Z;

    for (let row = 0; row < DEPTH; row++) {
      const up = row > 0 ? row - 1 : row;
      const down = row < SEGMENTS_Z ? row + 1 : row;
      const spanZ = (down - up) * cellDepth;

      for (let col = 0; col < WIDTH; col++) {
        const left = col > 0 ? col - 1 : col;
        const right = col < SEGMENTS_X ? col + 1 : col;
        const spanX = (right - left) * cellWidth;

        const slopeX =
          (heights[(row * WIDTH + right) * 3 + 1] - heights[(row * WIDTH + left) * 3 + 1]) / spanX;
        const slopeZ =
          (heights[(down * WIDTH + col) * 3 + 1] - heights[(up * WIDTH + col) * 3 + 1]) / spanZ;
        const inverseLength = 1 / Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);

        const index = (row * WIDTH + col) * 3;
        output[index] = -slopeX * inverseLength;
        output[index + 1] = inverseLength;
        output[index + 2] = -slopeZ * inverseLength;
      }
    }

    normals.needsUpdate = true;
  }

  private updateWalls() {
    for (let i = 0; i < this.perimeter.length - 1; i++) {
      const fromTop = this.surfacePoint(this.perimeter[i]);
      const toTop = this.surfacePoint(this.perimeter[i + 1]);
      const fromBase = [fromTop[0], 0, fromTop[2]];
      const toBase = [toTop[0], 0, toTop[2]];
      this.wallPositions.array.set(
        [...fromTop, ...toTop, ...fromBase, ...toTop, ...toBase, ...fromBase],
        i * 18,
      );
    }

    this.wallPositions.needsUpdate = true;
    this.walls.geometry.computeVertexNormals();
  }

  private surfacePoint(index: number) {
    const positions = this.surface.geometry.getAttribute('position');
    return [
      positions.getX(index),
      positions.getY(index) + this.surface.position.y,
      positions.getZ(index),
    ];
  }
}

function createSurface() {
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS_X, SEGMENTS_Z).rotateX(
      -Math.PI / 2,
    ),
    new THREE.MeshLambertMaterial({
      color: COLOR.STONE[200],
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
  );
  surface.geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(new Uint8ClampedArray(WIDTH * DEPTH * 3).fill(255), 3, true),
  );
  surface.position.y = SURFACE_OFFSET;
  surface.castShadow = true;
  surface.receiveShadow = true;
  return surface;
}

function createWalls(positions: THREE.BufferAttribute) {
  const walls = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial());
  walls.geometry.setAttribute('position', positions);
  walls.castShadow = true;
  walls.receiveShadow = true;
  return walls;
}

function buildPerimeter() {
  const perimeter: number[] = [];
  for (let x = 0; x < SEGMENTS_X; x++) {
    perimeter.push(x);
  }
  for (let z = 0; z < SEGMENTS_Z; z++) {
    perimeter.push(z * WIDTH + SEGMENTS_X);
  }
  for (let x = SEGMENTS_X; x > 0; x--) {
    perimeter.push(SEGMENTS_Z * WIDTH + x);
  }
  for (let z = SEGMENTS_Z; z > 0; z--) {
    perimeter.push(z * WIDTH);
  }
  perimeter.push(perimeter[0]);
  return perimeter;
}
