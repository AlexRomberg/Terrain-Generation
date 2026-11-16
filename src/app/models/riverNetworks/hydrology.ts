import { calculateVoronoi, calculateVoronoiTopology, Point, VoronoiResult } from '../common';
import { Domain } from './domain';
import { RiverNode } from './graph';
import { SlopeMap } from './slopeMaps';

const FLOW_COEFFICIENT = 0.42;
const FLOW_EXPONENT = 0.69;
const SQUARE_METERS_PER_SQUARE_KILOMETER = 1e6;
const BORDER_TOLERANCE = 2;

export type CrestEdgeKind = 'ridge' | 'river' | 'border';

export interface CrestVertex extends Point {
  z: number;
  cells: number[];
  border: boolean;
}

export interface CrestEdge {
  from: number;
  to: number;
  kind: CrestEdgeKind;
  neighbour: number;
}

export interface Cell {
  node: number;
  vertices: number[];
  edges: CrestEdge[];
}

export interface Hydrology {
  voronoi: VoronoiResult;
  cellArea: Float64Array;
  drainageArea: Float64Array;
  flow: Float64Array;
  vertices: CrestVertex[];
  cells: Cell[];
}

export interface HydrologySettings {
  metersPerPixel: number;
  terrainSlope: SlopeMap;
}

export function computeHydrology(domain: Domain, nodes: RiverNode[], settings: HydrologySettings): Hydrology {
  const voronoi = calculateVoronoi(nodes, domain.size);
  const topology = calculateVoronoiTopology(voronoi, domain.size, domain.land);
  const pixelArea = settings.metersPerPixel * settings.metersPerPixel;

  const cellArea = Float64Array.from(topology.area, (pixels) => pixels * pixelArea);
  const drainageArea = new Float64Array(nodes.length);
  const flow = new Float64Array(nodes.length);
  for (let id = nodes.length - 1; id >= 0; id--) {
    drainageArea[id] = cellArea[id];
    for (const child of nodes[id].children) {
      drainageArea[id] += drainageArea[child];
    }
    flow[id] = flowFromArea(drainageArea[id]);
  }

  const crestHeight = ({ x, y, cells }: { x: number; y: number; cells: number[] }) => {
    const nearest = Math.min(...cells.map((cell) => Math.hypot(x - voronoi.points[cell].x, y - voronoi.points[cell].y)));
    const highest = Math.max(...cells.map((cell) => nodes[cell].z));
    return highest + settings.terrainSlope(x, y) * nearest * settings.metersPerPixel;
  };
  const vertices: CrestVertex[] = topology.vertices.map(({ x, y, cells }) => ({
    x,
    y,
    cells,
    border: false,
    z: crestHeight({ x, y, cells }),
  }));
  for (const vertex of borderVertices(voronoi, domain.size)) {
    vertices.push({ ...vertex, border: true, z: crestHeight(vertex) });
  }

  return { voronoi, cellArea, drainageArea, flow, vertices, cells: buildCells(nodes, voronoi, vertices) };
}

export function flowFromArea(squareMeters: number) {
  return FLOW_COEFFICIENT * Math.pow(squareMeters / SQUARE_METERS_PER_SQUARE_KILOMETER, FLOW_EXPONENT);
}

function borderVertices(voronoi: VoronoiResult, size: number) {
  const { lookup, points } = voronoi;
  const last = size - 1;
  const result: { x: number; y: number; cells: number[] }[] = [];
  const sides: { at: (t: number) => Point; horizontal: boolean; fixed: number }[] = [
    { at: (t) => ({ x: t, y: 0 }), horizontal: true, fixed: 0 },
    { at: (t) => ({ x: t, y: last }), horizontal: true, fixed: last },
    { at: (t) => ({ x: 0, y: t }), horizontal: false, fixed: 0 },
    { at: (t) => ({ x: last, y: t }), horizontal: false, fixed: last },
  ];

  for (const side of sides) {
    const cellAt = (t: number) => {
      const point = side.at(t);
      return lookup[point.x + point.y * size];
    };
    for (let t = 0; t < last; t++) {
      const a = cellAt(t);
      const b = cellAt(t + 1);
      if (a === b) {
        continue;
      }
      const along = bisectorOnBorder(points[a], points[b], side.horizontal, side.fixed);
      const position = along !== undefined && Math.abs(along - (t + 0.5)) <= BORDER_TOLERANCE ? along : t + 0.5;
      result.push({ ...side.at(position), cells: [Math.min(a, b), Math.max(a, b)] });
    }
  }

  for (const corner of [
    { x: 0, y: 0 },
    { x: last, y: 0 },
    { x: 0, y: last },
    { x: last, y: last },
  ]) {
    result.push({ ...corner, cells: [lookup[corner.x + corner.y * size]] });
  }

  return result;
}

function bisectorOnBorder(a: Point, b: Point, horizontal: boolean, fixed: number) {
  const [aAlong, aAcross, bAlong, bAcross] = horizontal ? [a.x, a.y, b.x, b.y] : [a.y, a.x, b.y, b.x];
  const denominator = 2 * (bAlong - aAlong);
  if (denominator === 0) {
    return undefined;
  }
  const aDistance = aAlong * aAlong + (aAcross - fixed) ** 2;
  const bDistance = bAlong * bAlong + (bAcross - fixed) ** 2;
  return (bDistance - aDistance) / denominator;
}

function buildCells(nodes: RiverNode[], voronoi: VoronoiResult, vertices: CrestVertex[]): Cell[] {
  const cellVertices: number[][] = nodes.map(() => []);
  vertices.forEach((vertex, index) => {
    for (const cell of vertex.cells) {
      cellVertices[cell].push(index);
    }
  });

  return nodes.map((node, cell) => {
    const site = voronoi.points[cell];
    const ring = cellVertices[cell].sort(
      (a, b) =>
        Math.atan2(vertices[a].y - site.y, vertices[a].x - site.x) -
        Math.atan2(vertices[b].y - site.y, vertices[b].x - site.x),
    );

    const edges: CrestEdge[] = [];
    if (ring.length >= 2) {
      ring.forEach((from, i) => {
        const to = ring[(i + 1) % ring.length];
        const neighbour = vertices[from].cells.find((other) => other !== cell && vertices[to].cells.includes(other));
        if (neighbour === undefined) {
          edges.push({ from, to, kind: 'border', neighbour: -1 });
          return;
        }
        const isRiver = nodes[neighbour].parent === cell || node.parent === neighbour;
        edges.push({ from, to, kind: isRiver ? 'river' : 'ridge', neighbour });
      });
    }

    return { node: cell, vertices: ring, edges };
  });
}
