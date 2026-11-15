import { Point } from '../common';



export function signedArea(polygon: readonly Point[]) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

export function rasterizePolygon(polygon: readonly Point[], size: number) {
  const mask = new Uint8Array(size * size);
  const crossings: number[] = [];

  for (let y = 0; y < size; y++) {
    crossings.length = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    crossings.sort((p, q) => p - q);

    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i]));
      const to = Math.min(size - 1, Math.floor(crossings[i + 1]));
      if (from <= to) {
        mask.fill(1, from + y * size, to + 1 + y * size);
      }
    }
  }

  return mask;
}

export function signedDistance(mask: Uint8Array, size: number) {
  const toOutside = distanceTo(mask, size, 0);
  const toInside = distanceTo(mask, size, 1);
  const result = new Float32Array(size * size);
  for (let i = 0; i < result.length; i++) {
    result[i] = mask[i] ? toOutside[i] - 0.5 : 0.5 - toInside[i];
  }
  return result;
}

function distanceTo(mask: Uint8Array, size: number, target: number) {
  const grid = new Float64Array(size * size);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = mask[i] === target ? 0 : Number.POSITIVE_INFINITY;
  }

  const f = new Float64Array(size);
  const d = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      f[y] = grid[x + y * size];
    }
    distanceTransform1d(f, d, v, z, size);
    for (let y = 0; y < size; y++) {
      grid[x + y * size] = d[y];
    }
  }

  for (let y = 0; y < size; y++) {
    const row = y * size;
    f.set(grid.subarray(row, row + size));
    distanceTransform1d(f, d, v, z, size);
    grid.set(d, row);
  }

  const distance = new Float32Array(size * size);
  for (let i = 0; i < distance.length; i++) {
    distance[i] = Math.sqrt(grid[i]);
  }
  return distance;
}

function distanceTransform1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  v[0] = 0;
  z[0] = Number.NEGATIVE_INFINITY;
  z[1] = Number.POSITIVE_INFINITY;

  for (let q = 1, k = 0; q < n; q++) {
    let s: number;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Number.POSITIVE_INFINITY;
  }

  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) {
      k++;
    }
    const r = v[k];
    d[q] = (q - r) * (q - r) + f[r];
  }
}

export function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  if (segmentsIntersect(a, b, c, d)) {
    return 0;
  }
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  return abc * abd < 0 && cda * cdb < 0;
}

function orientation(a: Point, b: Point, c: Point) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function isInsidePolygon(p: Point, polygon: readonly Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}
