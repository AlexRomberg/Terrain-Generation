import Srand, { SrandInstance } from 'seeded-rand';
import { Point } from '../common';
import { channelSize, Classification, ROSGEN_CLASSES, RosgenType } from './classifications';
import { closestPointOnSegment, isInsidePolygon } from './geometry';
import { RiverNode } from './graph';
import { flowFromArea, Hydrology } from './hydrology';

const DEGREES = Math.PI / 180;
const PERPENDICULAR_JUNCTION = 90 * DEGREES;
const EQUAL_FLOW_JUNCTION = 30 * DEGREES;
const JUNCTION_SAMPLES_PER_EDGE = 32;
const MIN_TRIBUTARY_EDGES = 0.1;
const SUBDIVISION_EDGES = 0.125;
const MEANDER_SCALE = 0.25;
const MAX_MEANDER_OFFSET = 0.35;
const MEANDER_RETRIES = 3;
const EPSILON = 1e-6;

export interface PathPoint extends Point {
  z: number;
}

export interface RiverPath {
  cell: number;
  points: PathPoint[];
  flow: number;
  type: RosgenType;
  width: number;
  depth: number;
}

export interface RiverPathSettings {
  edgeLength: number;
  meander: number;
}

interface TrunkSample extends PathPoint {
  arclength: number;
  tangent: Point;
}

interface Piece {
  cell: number;
  points: PathPoint[];
  area: number;
  type: RosgenType;
}

export function buildRiverPaths(
  nodes: RiverNode[],
  hydrology: Hydrology,
  classification: Classification,
  settings: RiverPathSettings,
  seed: number,
): RiverPath[] {
  const rnd = new Srand(seed);
  const crossings = nodes.map((node) => (node.parent >= 0 ? crossingPoint(node, nodes[node.parent], hydrology) : undefined));
  const paths: RiverPath[] = [];

  for (const node of nodes) {
    const polygon = hydrology.cells[node.id].vertices.map((index) => hydrology.vertices[index]);
    for (const piece of cellPieces(node, crossings, hydrology, classification, settings)) {
      const flow = flowFromArea(piece.area);
      const amplitude = Math.min(MAX_MEANDER_OFFSET, settings.meander * ROSGEN_CLASSES[piece.type].meander * MEANDER_SCALE);
      paths.push({
        cell: piece.cell,
        points: meander(piece.points, amplitude, SUBDIVISION_EDGES * settings.edgeLength, polygon, rnd),
        flow,
        type: piece.type,
        ...channelSize(flow, piece.type),
      });
    }
  }

  return paths;
}

function crossingPoint(child: RiverNode, parent: RiverNode, hydrology: Hydrology): PathPoint {
  const middle = { x: (child.x + parent.x) / 2, y: (child.y + parent.y) / 2 };
  const z = (child.z + parent.z) / 2;
  const edge = hydrology.cells[child.id].edges.find((candidate) => candidate.kind === 'river' && candidate.neighbour === parent.id);
  if (!edge) {
    return { ...middle, z };
  }
  return { ...closestPointOnSegment(middle, hydrology.vertices[edge.from], hydrology.vertices[edge.to]), z };
}

function cellPieces(
  node: RiverNode,
  crossings: (PathPoint | undefined)[],
  hydrology: Hydrology,
  classification: Classification,
  settings: RiverPathSettings,
): Piece[] {
  const isMouth = node.parent < 0;
  const center: PathPoint = { x: node.x, y: node.y, z: node.z };
  const outlet = crossings[node.id] ?? center;
  const ownType = classification.type[node.id];

  if (node.children.length === 0) {
    return isMouth ? [] : [{ cell: node.id, points: [center, outlet], area: hydrology.drainageArea[node.id], type: ownType }];
  }

  const entries = node.children.map((child) => ({ child, point: crossings[child]! }));
  const main = entries.reduce((best, entry) =>
    hydrology.drainageArea[entry.child] > hydrology.drainageArea[best.child] ? entry : best,
  );
  const trunk = isMouth ? [main.point, outlet] : [main.point, center, outlet];
  const lengths = cumulativeLengths(trunk);
  const total = lengths[lengths.length - 1];
  const samples = sampleTrunk(trunk, lengths, settings.edgeLength);

  const tributaries = entries
    .filter((entry) => entry !== main)
    .map((entry) => ({ ...entry, along: nearestSample(samples, entry.point).arclength }))
    .sort((a, b) => a.along - b.along);

  const pieces: Piece[] = [];
  const junctions: { arclength: number; area: number }[] = [];
  let trunkArea = hydrology.drainageArea[main.child];
  let lastJunction = 0;

  for (const tributary of tributaries) {
    const tributaryArea = hydrology.drainageArea[tributary.child];
    const ratio = Math.min(1, flowFromArea(tributaryArea) / flowFromArea(trunkArea));
    const angle = PERPENDICULAR_JUNCTION - (PERPENDICULAR_JUNCTION - EQUAL_FLOW_JUNCTION) * ratio;
    const junction = findJunction(samples, tributary.point, angle, lastJunction, MIN_TRIBUTARY_EDGES * settings.edgeLength);

    junctions.push({ arclength: junction.arclength, area: tributaryArea });
    pieces.push({
      cell: node.id,
      points: [tributary.point, pointAt(trunk, lengths, junction.arclength)],
      area: tributaryArea,
      type: classification.type[tributary.child],
    });
    trunkArea += tributaryArea;
    lastJunction = junction.arclength;
  }

  const nodeArclength = isMouth ? Math.max(lastJunction, total / 2) : lengths[1];
  const splits = [...new Set([0, ...junctions.map((junction) => junction.arclength), nodeArclength, total])]
    .filter((arclength) => arclength >= 0 && arclength <= total)
    .sort((a, b) => a - b);

  for (let i = 0; i + 1 < splits.length; i++) {
    const [from, to] = [splits[i], splits[i + 1]];
    if (to - from < EPSILON) {
      continue;
    }
    const pastNode = from >= nodeArclength - EPSILON;
    const joined = junctions.filter((junction) => junction.arclength <= from + EPSILON);
    const area =
      hydrology.drainageArea[main.child] +
      joined.reduce((sum, junction) => sum + junction.area, 0) +
      (pastNode ? hydrology.cellArea[node.id] : 0);
    pieces.push({
      cell: node.id,
      points: slice(trunk, lengths, from, to),
      area,
      type: pastNode ? ownType : classification.type[main.child],
    });
  }

  return pieces;
}

function cumulativeLengths(points: PathPoint[]) {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return lengths;
}

function pointAt(points: PathPoint[], lengths: number[], arclength: number): PathPoint {
  for (let i = 1; i < points.length; i++) {
    if (arclength <= lengths[i] || i === points.length - 1) {
      const span = lengths[i] - lengths[i - 1];
      const t = span > 0 ? Math.min(1, Math.max(0, (arclength - lengths[i - 1]) / span)) : 0;
      const a = points[i - 1];
      const b = points[i];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return points[0];
}

function slice(points: PathPoint[], lengths: number[], from: number, to: number) {
  const inner = points.filter((_, i) => lengths[i] > from + EPSILON && lengths[i] < to - EPSILON);
  return [pointAt(points, lengths, from), ...inner, pointAt(points, lengths, to)];
}

function sampleTrunk(points: PathPoint[], lengths: number[], edgeLength: number): TrunkSample[] {
  const total = lengths[lengths.length - 1];
  const count = Math.max(2, Math.ceil((total / edgeLength) * JUNCTION_SAMPLES_PER_EDGE));
  const samples: TrunkSample[] = [];
  for (let i = 0; i <= count; i++) {
    const arclength = (i / count) * total;
    const segment = Math.max(1, lengths.findIndex((length) => length >= arclength - EPSILON));
    const a = points[segment - 1];
    const b = points[segment];
    const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    samples.push({ ...pointAt(points, lengths, arclength), arclength, tangent: { x: (b.x - a.x) / span, y: (b.y - a.y) / span } });
  }
  return samples;
}

function nearestSample(samples: TrunkSample[], point: Point) {
  return samples.reduce((best, sample) =>
    (sample.x - point.x) ** 2 + (sample.y - point.y) ** 2 < (best.x - point.x) ** 2 + (best.y - point.y) ** 2 ? sample : best,
  );
}

function findJunction(samples: TrunkSample[], entry: PathPoint, angle: number, after: number, minDistance: number) {
  let best: TrunkSample | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    if (sample.arclength <= after + EPSILON || sample.z >= entry.z) {
      continue;
    }
    const dx = sample.x - entry.x;
    const dy = sample.y - entry.y;
    const distance = Math.hypot(dx, dy);
    if (distance < minDistance) {
      continue;
    }
    const meeting = Math.acos(Math.min(1, Math.max(-1, (dx * sample.tangent.x + dy * sample.tangent.y) / distance)));
    const error = Math.abs(meeting - angle);
    if (error < bestError) {
      best = sample;
      bestError = error;
    }
  }
  return best ?? samples[samples.length - 1];
}

function meander(points: PathPoint[], amplitude: number, maxSegment: number, polygon: Point[], rnd: SrandInstance) {
  const result: PathPoint[] = [points[0]];
  const subdivide = (a: PathPoint, b: PathPoint) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length <= maxSegment) {
      result.push(b);
      return;
    }

    let offset = (rnd.random() * 2 - 1) * amplitude * length;
    let middle: PathPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    for (let attempt = 0; attempt <= MEANDER_RETRIES; attempt++) {
      const candidate = { ...middle, x: middle.x - (dy / length) * offset, y: middle.y + (dx / length) * offset };
      if (isInsidePolygon(candidate, polygon)) {
        middle = candidate;
        break;
      }
      offset /= 2;
    }

    subdivide(a, middle);
    subdivide(middle, b);
  };

  for (let i = 1; i < points.length; i++) {
    subdivide(points[i - 1], points[i]);
  }
  return result;
}
