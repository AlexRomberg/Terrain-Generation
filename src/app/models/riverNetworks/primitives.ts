import Srand, { SrandInstance } from 'seeded-rand';
import { Point } from '../common';
import { ProgressReporter } from '../layerDefinition';
import { gradientNoise } from '../noise';
import { SpatialGrid } from '../spatialGrid';
import { profileDepth, ROSGEN_CLASSES } from './classifications';
import { closestPointOnSegment } from './geometry';
import { RiverNode } from './graph';
import { Hydrology } from './hydrology';
import { PathPoint, RiverPath } from './riverPaths';

const SATURATION_SPACING = 0.75;
const MIN_SPACING_PIXELS = 4;
const RADIUS_PER_SPACING = 1.5;
const ATTEMPTS_PER_PRIMITIVE = 30;
const COVERAGE_RATIO = 0.95;
const NEAREST_SEARCH_GROWTH = 2;
const CARVE_RADIUS_PER_HALF_WIDTH = 3;
const MIN_CARVE_RADIUS_PIXELS = 1.5;
const MIN_BUCKET_PIXELS = 4;
const NOISE_WAVELENGTH_EDGES = 0.5;
const NOISE_OCTAVES = 3;
const NOISE_GAIN = 0.5;
const NOISE_OFFSET_RANGE = 1000;
const PROGRESS_ROWS = 64;

export interface TerrainPrimitive extends Point {
  cell: number;
  radius: number;
  z: number;
  amplitude: number;
}

export interface PrimitiveSettings {
  size: number;
  metersPerPixel: number;
  primitivesPerCell: number;
  roughness: number;
  smoothing: number;
}

interface Segment {
  a: PathPoint;
  b: PathPoint;
}

export function createTerrainPrimitives(
  nodes: RiverNode[],
  hydrology: Hydrology,
  paths: RiverPath[],
  settings: PrimitiveSettings,
  seed: number,
): TerrainPrimitive[] {
  const rnd = new Srand(seed);
  const riversByCell: Segment[][] = nodes.map(() => []);
  for (const path of paths) {
    for (let i = 1; i < path.points.length; i++) {
      riversByCell[path.cell].push({ a: path.points[i - 1], b: path.points[i] });
    }
  }

  const primitives: TerrainPrimitive[] = [];
  for (const node of nodes) {
    const cell = hydrology.cells[node.id];
    const ridges: Segment[] = cell.edges
      .filter((edge) => edge.kind === 'ridge')
      .map((edge) => ({ a: hydrology.vertices[edge.from], b: hydrology.vertices[edge.to] }));
    const crests = ridges.length > 0 ? ridges : cell.vertices.map((index) => ({ a: hydrology.vertices[index], b: hydrology.vertices[index] }));
    const rivers = riversByCell[node.id].length > 0 ? riversByCell[node.id] : [{ a: node, b: node }];

    for (const center of sampleCell(node.id, hydrology, settings, rnd)) {
      const river = nearestOnSegments(center.point, rivers);
      const crest = nearestOnSegments(center.point, crests);
      const total = river.distance + crest.distance;
      const z = total > 0 ? (river.z * crest.distance + crest.z * river.distance) / total : river.z;
      const relief = Math.max(0, crest.z - river.z);
      primitives.push({
        ...center.point,
        cell: node.id,
        radius: center.radius,
        z,
        amplitude: total > 0 ? settings.roughness * (river.distance / total) * relief : 0,
      });
    }
  }

  ensureCoverage(primitives, settings.size);
  return primitives;
}

function ensureCoverage(primitives: TerrainPrimitive[], size: number) {
  if (primitives.length === 0) {
    return;
  }
  let reach = primitives.reduce((largest, primitive) => Math.max(largest, primitive.radius), 0);
  const grid = new SpatialGrid<TerrainPrimitive>(size, reach);
  primitives.forEach((primitive) => grid.insert(primitive.x, primitive.y, primitive));
  const limitSquared = COVERAGE_RATIO * COVERAGE_RATIO;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const covered = grid.someNear(x, y, reach, (primitive) => {
        const dx = primitive.x - x;
        const dy = primitive.y - y;
        return dx * dx + dy * dy < limitSquared * primitive.radius * primitive.radius;
      });
      if (covered) {
        continue;
      }

      let nearest: TerrainPrimitive | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let search = reach; !nearest; search *= NEAREST_SEARCH_GROWTH) {
        grid.forEachNear(x, y, search, (primitive) => {
          const distance = Math.hypot(primitive.x - x, primitive.y - y);
          if (distance < nearestDistance) {
            nearest = primitive;
            nearestDistance = distance;
          }
        });
      }
      nearest!.radius = nearestDistance / COVERAGE_RATIO;
      reach = Math.max(reach, nearest!.radius);
    }
  }
}

function sampleCell(cell: number, hydrology: Hydrology, settings: PrimitiveSettings, rnd: SrandInstance) {
  const { lookup } = hydrology.voronoi;
  const { size, primitivesPerCell: count } = settings;
  const polygon = hydrology.cells[cell].vertices.map((index) => hydrology.vertices[index]);
  const pixels = hydrology.cellArea[cell] / (settings.metersPerPixel * settings.metersPerPixel);
  if (polygon.length === 0 || pixels <= 0) {
    return [];
  }

  const spacing = Math.max(MIN_SPACING_PIXELS, SATURATION_SPACING * Math.sqrt(pixels / count));
  const radius = RADIUS_PER_SPACING * settings.smoothing * spacing;
  const minX = Math.max(0, Math.min(...polygon.map((p) => p.x)));
  const maxX = Math.min(size - 1, Math.max(...polygon.map((p) => p.x)));
  const minY = Math.max(0, Math.min(...polygon.map((p) => p.y)));
  const maxY = Math.min(size - 1, Math.max(...polygon.map((p) => p.y)));

  const accepted: Point[] = [];
  for (let attempt = 0; attempt < count * ATTEMPTS_PER_PRIMITIVE && accepted.length < count; attempt++) {
    const point = { x: minX + rnd.random() * (maxX - minX), y: minY + rnd.random() * (maxY - minY) };
    if (lookup[Math.round(point.x) + Math.round(point.y) * size] !== cell) {
      continue;
    }
    if (accepted.every((other) => (other.x - point.x) ** 2 + (other.y - point.y) ** 2 >= spacing * spacing)) {
      accepted.push(point);
    }
  }

  return accepted.map((point) => ({ point, radius }));
}

function nearestOnSegments(point: Point, segments: Segment[]) {
  let best = { distance: Number.POSITIVE_INFINITY, z: 0 };
  for (const { a, b } of segments) {
    const closest = closestPointOnSegment(point, a, b);
    const distance = Math.hypot(closest.x - point.x, closest.y - point.y);
    if (distance < best.distance) {
      const span = Math.hypot(b.x - a.x, b.y - a.y);
      const t = span > 0 ? Math.hypot(closest.x - a.x, closest.y - a.y) / span : 0;
      best = { distance, z: a.z + (b.z - a.z) * t };
    }
  }
  return best;
}

export interface EvaluationSettings {
  size: number;
  metersPerPixel: number;
  edgeLength: number;
  keepLayers: boolean;
}

export interface TerrainEvaluation {
  height: Float32Array;
  terrain?: Float32Array;
  riverWeight?: Float32Array;
}

interface DiskGrid {
  bucketSize: number;
  bucketsPerSide: number;
  start: Uint32Array;
  items: Uint32Array;
}

export function evaluateTerrain(
  primitives: TerrainPrimitive[],
  paths: RiverPath[],
  settings: EvaluationSettings,
  seed: number,
  report: ProgressReporter,
): TerrainEvaluation {
  const { size, metersPerPixel } = settings;
  const radii = primitives.map((primitive) => primitive.radius).sort((a, b) => a - b);
  const bucketSize = Math.max(MIN_BUCKET_PIXELS, radii[Math.floor(radii.length / 2)] ?? MIN_BUCKET_PIXELS);

  const terrainX = Float64Array.from(primitives, (primitive) => primitive.x);
  const terrainY = Float64Array.from(primitives, (primitive) => primitive.y);
  const terrainReach = Float64Array.from(primitives, (primitive) => primitive.radius);
  const terrainZ = Float64Array.from(primitives, (primitive) => primitive.z);
  const terrainAmplitude = Float64Array.from(primitives, (primitive) => primitive.amplitude);
  const terrainGrid = buildDiskGrid(terrainX, terrainY, terrainReach, size, bucketSize);

  const segments = paths.flatMap((path) =>
    path.points.slice(1).map((b, i) => {
      const a = path.points[i];
      const halfWidth = path.width / 2 / metersPerPixel;
      return { a, b, halfWidth, depth: path.depth, profile: ROSGEN_CLASSES[path.type].profile, radius: Math.max(MIN_CARVE_RADIUS_PIXELS, CARVE_RADIUS_PER_HALF_WIDTH * halfWidth) };
    }),
  );
  const riverGrid = buildDiskGrid(
    Float64Array.from(segments, ({ a, b }) => (a.x + b.x) / 2),
    Float64Array.from(segments, ({ a, b }) => (a.y + b.y) / 2),
    Float64Array.from(segments, ({ a, b, radius }) => Math.hypot(b.x - a.x, b.y - a.y) / 2 + radius),
    size,
    bucketSize,
  );

  const noise = createRoughnessNoise(settings.edgeLength, seed);
  const height = new Float32Array(size * size);
  const terrain = settings.keepLayers ? new Float32Array(size * size) : undefined;
  const riverWeight = settings.keepLayers ? new Float32Array(size * size) : undefined;

  for (let y = 0; y < size; y++) {
    if (y % PROGRESS_ROWS === 0) {
      report(y / size);
    }
    const bucketY = Math.min(terrainGrid.bucketsPerSide - 1, Math.floor(y / bucketSize));
    for (let x = 0; x < size; x++) {
      const bucket = Math.min(terrainGrid.bucketsPerSide - 1, Math.floor(x / bucketSize)) + bucketY * terrainGrid.bucketsPerSide;

      let weightSum = 0;
      let heightSum = 0;
      let amplitudeSum = 0;
      for (let k = terrainGrid.start[bucket]; k < terrainGrid.start[bucket + 1]; k++) {
        const i = terrainGrid.items[k];
        const dx = x - terrainX[i];
        const dy = y - terrainY[i];
        const ratio = (dx * dx + dy * dy) / (terrainReach[i] * terrainReach[i]);
        if (ratio >= 1) {
          continue;
        }
        const weight = (1 - ratio) * (1 - ratio);
        weightSum += weight;
        heightSum += weight * terrainZ[i];
        amplitudeSum += weight * terrainAmplitude[i];
      }
      const terrainHeight = weightSum > 0 ? (heightSum + amplitudeSum * noise(x, y)) / weightSum : 0;

      let riverWeightSum = 0;
      let riverHeightSum = 0;
      let riverWeightMax = 0;
      for (let k = riverGrid.start[bucket]; k < riverGrid.start[bucket + 1]; k++) {
        const segment = segments[riverGrid.items[k]];
        const { a, b } = segment;
        const sx = b.x - a.x;
        const sy = b.y - a.y;
        const lengthSquared = sx * sx + sy * sy;
        const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((x - a.x) * sx + (y - a.y) * sy) / lengthSquared)) : 0;
        const px = x - (a.x + t * sx);
        const py = y - (a.y + t * sy);
        const ratio = (px * px + py * py) / (segment.radius * segment.radius);
        if (ratio >= 1) {
          continue;
        }
        const weight = (1 - ratio) * (1 - ratio);
        const length = Math.sqrt(lengthSquared) || 1;
        const across = (sx * py - sy * px) / length / Math.max(segment.halfWidth, Number.EPSILON);
        const bed = Math.abs(across) < 1 ? segment.depth * profileDepth(segment.profile, across) : 0;
        riverWeightSum += weight;
        riverHeightSum += weight * (a.z + (b.z - a.z) * t - bed);
        riverWeightMax = Math.max(riverWeightMax, weight);
      }

      const index = x + y * size;
      const riverHeight = riverWeightSum > 0 ? riverHeightSum / riverWeightSum : terrainHeight;
      height[index] = (1 - riverWeightMax) * terrainHeight + riverWeightMax * riverHeight;
      if (terrain && riverWeight) {
        terrain[index] = terrainHeight;
        riverWeight[index] = riverWeightMax;
      }
    }
  }

  return { height, terrain, riverWeight };
}

function buildDiskGrid(xs: Float64Array, ys: Float64Array, reach: Float64Array, size: number, bucketSize: number): DiskGrid {
  const bucketsPerSide = Math.max(1, Math.ceil(size / bucketSize));
  const bucketOf = (coordinate: number) => Math.min(bucketsPerSide - 1, Math.max(0, Math.floor(coordinate / bucketSize)));
  const visit = (i: number, action: (bucket: number) => void) => {
    const fromX = bucketOf(xs[i] - reach[i]);
    const toX = bucketOf(xs[i] + reach[i]);
    const fromY = bucketOf(ys[i] - reach[i]);
    const toY = bucketOf(ys[i] + reach[i]);
    for (let by = fromY; by <= toY; by++) {
      for (let bx = fromX; bx <= toX; bx++) {
        action(bx + by * bucketsPerSide);
      }
    }
  };

  const start = new Uint32Array(bucketsPerSide * bucketsPerSide + 1);
  for (let i = 0; i < xs.length; i++) {
    visit(i, (bucket) => start[bucket + 1]++);
  }
  for (let bucket = 0; bucket < bucketsPerSide * bucketsPerSide; bucket++) {
    start[bucket + 1] += start[bucket];
  }
  const items = new Uint32Array(start[start.length - 1]);
  const next = start.slice(0, -1);
  for (let i = 0; i < xs.length; i++) {
    visit(i, (bucket) => {
      items[next[bucket]++] = i;
    });
  }
  return { bucketSize, bucketsPerSide, start, items };
}

function createRoughnessNoise(edgeLength: number, seed: number) {
  const rnd = new Srand(seed);
  const offsetX = rnd.random() * NOISE_OFFSET_RANGE;
  const offsetY = rnd.random() * NOISE_OFFSET_RANGE;
  const baseFrequency = 1 / (NOISE_WAVELENGTH_EDGES * edgeLength);
  let normalization = 0;
  for (let octave = 0, amplitude = 1; octave < NOISE_OCTAVES; octave++, amplitude *= NOISE_GAIN) {
    normalization += amplitude;
  }

  return (x: number, y: number) => {
    let value = 0;
    let frequency = baseFrequency;
    let amplitude = 1;
    for (let octave = 0; octave < NOISE_OCTAVES; octave++) {
      value += gradientNoise(offsetX + x * frequency, offsetY + y * frequency) * amplitude;
      frequency *= 2;
      amplitude *= NOISE_GAIN;
    }
    return value / normalization;
  };
}
