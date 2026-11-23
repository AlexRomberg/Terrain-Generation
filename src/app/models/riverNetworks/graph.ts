import Srand, { SrandInstance } from 'seeded-rand';
import { Point } from '../common';
import { ProgressReporter } from '../layerDefinition';
import { SpatialGrid } from '../spatialGrid';
import { Domain } from './domain';
import { distanceToSegment, segmentDistance } from './geometry';
import { SlopeMap } from './slopeMaps';

const DEGREES = Math.PI / 180;
const CHILD_ATTEMPTS = 8;
const CONTINUATION_SPREAD = 30 * DEGREES;
const SYMMETRIC_MIN = 25 * DEGREES;
const SYMMETRIC_MAX = 45 * DEGREES;
const ASYMMETRIC_MAIN_SPREAD = 10 * DEGREES;
const ASYMMETRIC_MINOR_MIN = 60 * DEGREES;
const ASYMMETRIC_MINOR_MAX = 90 * DEGREES;
const FILLING_MAX_CHILDREN = 5;
const FILLING_SPREAD = 75 * DEGREES;
const CLEARANCE_GROWTH_PER_PRIORITY = 0.25;
const LIPSCHITZ_RADIUS_EDGES = 2;
const MAX_ITERATIONS = 50000;
const PROGRESS_INTERVAL = 32;

export interface RiverNode extends Point {
  id: number;
  z: number;
  priority: number;
  strahler: number;
  parent: number;
  children: number[];
  tree: number;
  direction: Point;
}

export interface GrowthSettings {
  edgeLength: number;
  metersPerPixel: number;
  zeta: number;
  pContinue: number;
  pSymmetric: number;
  pAsymmetric: number;
  borderMargin: number;
  clearance: number;
  kappa: number;
  maxPriority: number;
  riverSlope: SlopeMap;
}

interface Edge {
  from: number;
  to: number;
  priority: number;
}

interface ChildSpec {
  priority: number;
  minAngle: number;
  maxAngle: number;
}

interface Probabilities {
  continuation: number;
  symmetric: number;
}

class NetworkGrowth {
  readonly nodes: RiverNode[] = [];
  private readonly candidates: number[] = [];
  private readonly nodeGrid: SpatialGrid<number>;
  private readonly edgeGrid: SpatialGrid<Edge>;
  private readonly edgeQueryRadius: number;
  private readonly probabilities: Probabilities;

  constructor(
    private readonly domain: Domain,
    private readonly settings: GrowthSettings,
    private readonly rnd: SrandInstance,
  ) {
    this.nodeGrid = new SpatialGrid(domain.size, settings.edgeLength);
    this.edgeGrid = new SpatialGrid(domain.size, settings.edgeLength);
    this.edgeQueryRadius = settings.clearance * clearanceFactor(settings.maxPriority) + settings.edgeLength;
    this.probabilities = normalizedProbabilities(settings);

    domain.mouths.forEach((mouth, tree) => {
      const node = this.addNode(mouth.x, mouth.y, 0, mouth.priority, -1, tree, mouth.inward);
      this.candidates.push(node.id);
    });
  }

  run(report: ProgressReporter) {
    const expectedNodes = (this.domain.size / this.settings.edgeLength) ** 2;

    for (let iteration = 0; this.candidates.length > 0 && iteration < MAX_ITERATIONS; iteration++) {
      const node = this.nodes[this.takeCandidate()];
      for (const spec of this.expansion(node)) {
        const child = this.placeChild(node, spec);
        if (child) {
          this.candidates.push(child.id);
        }
      }
      if (iteration % PROGRESS_INTERVAL === 0) {
        report(Math.min(0.95, this.nodes.length / expectedNodes));
      }
    }

    computeStrahler(this.nodes);
    return this.nodes;
  }

  private takeCandidate() {
    let zMin = Number.POSITIVE_INFINITY;
    for (const id of this.candidates) {
      zMin = Math.min(zMin, this.nodes[id].z);
    }

    let best = -1;
    for (let i = 0; i < this.candidates.length; i++) {
      const node = this.nodes[this.candidates[i]];
      if (node.z > zMin + this.settings.zeta) {
        continue;
      }
      const current = best < 0 ? undefined : this.nodes[this.candidates[best]];
      if (
        !current ||
        node.priority > current.priority ||
        (node.priority === current.priority && (node.z < current.z || (node.z === current.z && node.id < current.id)))
      ) {
        best = i;
      }
    }

    const id = this.candidates[best];
    this.candidates[best] = this.candidates[this.candidates.length - 1];
    this.candidates.pop();
    return id;
  }

  private expansion(node: RiverNode): ChildSpec[] {
    const priority = node.priority;
    if (node.parent < 0) {
      return [{ priority, minAngle: 0, maxAngle: 0 }];
    }

    if (priority <= 1) {
      const count = 1 + Math.floor(this.rnd.random() * FILLING_MAX_CHILDREN);
      const sector = (2 * FILLING_SPREAD) / count;
      return Array.from({ length: count }, (_, i) => ({
        priority: 1,
        minAngle: -FILLING_SPREAD + i * sector,
        maxAngle: -FILLING_SPREAD + (i + 1) * sector,
      }));
    }

    const roll = this.rnd.random();
    if (roll < this.probabilities.continuation) {
      return [{ priority, minAngle: -CONTINUATION_SPREAD, maxAngle: CONTINUATION_SPREAD }];
    }
    if (roll < this.probabilities.continuation + this.probabilities.symmetric) {
      return [
        { priority: priority - 1, minAngle: SYMMETRIC_MIN, maxAngle: SYMMETRIC_MAX },
        { priority: priority - 1, minAngle: -SYMMETRIC_MAX, maxAngle: -SYMMETRIC_MIN },
      ];
    }

    const side = this.rnd.random() < 0.5 ? 1 : -1;
    const minorPriority = 1 + Math.floor(this.rnd.random() * (priority - 1));
    const minorAngles = [side * ASYMMETRIC_MINOR_MIN, side * ASYMMETRIC_MINOR_MAX].sort((a, b) => a - b);
    return [
      { priority, minAngle: -ASYMMETRIC_MAIN_SPREAD, maxAngle: ASYMMETRIC_MAIN_SPREAD },
      { priority: minorPriority, minAngle: minorAngles[0], maxAngle: minorAngles[1] },
    ];
  }

  private placeChild(node: RiverNode, spec: ChildSpec) {
    const attempts = spec.minAngle === spec.maxAngle ? 1 : CHILD_ATTEMPTS;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const angle = spec.minAngle + this.rnd.random() * (spec.maxAngle - spec.minAngle);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const direction = {
        x: node.direction.x * cos - node.direction.y * sin,
        y: node.direction.x * sin + node.direction.y * cos,
      };
      const x = node.x + direction.x * this.settings.edgeLength;
      const y = node.y + direction.y * this.settings.edgeLength;
      const z = node.z + this.settings.riverSlope(x, y) * this.settings.edgeLength * this.settings.metersPerPixel;

      if (this.isValid(node, { x, y }, z, spec.priority)) {
        return this.addNode(x, y, z, spec.priority, node.id, node.tree, direction);
      }
    }
    return undefined;
  }

  private isValid(parent: RiverNode, point: Point, z: number, priority: number) {
    const { size, land, coastDistance } = this.domain;
    const pixelX = Math.round(point.x);
    const pixelY = Math.round(point.y);
    if (pixelX < 0 || pixelY < 0 || pixelX >= size || pixelY >= size) {
      return false;
    }
    const pixel = pixelX + pixelY * size;
    if (!land[pixel] || coastDistance[pixel] <= this.settings.borderMargin) {
      return false;
    }

    const middleX = (parent.x + point.x) / 2;
    const middleY = (parent.y + point.y) / 2;
    const collides = this.edgeGrid.someNear(middleX, middleY, this.edgeQueryRadius, (edge) => {
      const from = this.nodes[edge.from];
      const to = this.nodes[edge.to];
      const isLocal = [edge.from, edge.to].some((id) => id === parent.id || id === parent.parent);
      if (isLocal) {
        return distanceToSegment(point, from, to) < this.settings.clearance;
      }
      const required = this.settings.clearance * clearanceFactor(Math.max(priority, edge.priority));
      return segmentDistance(parent, point, from, to) < required;
    });
    if (collides) {
      return false;
    }

    const lipschitzRadius = LIPSCHITZ_RADIUS_EDGES * this.settings.edgeLength;
    const tooSteep = this.nodeGrid.someNear(point.x, point.y, lipschitzRadius, (id) => {
      if (id === parent.id) {
        return false;
      }
      const other = this.nodes[id];
      const distance = Math.hypot(other.x - point.x, other.y - point.y);
      return (
        distance <= lipschitzRadius &&
        Math.abs(z - other.z) >= this.settings.kappa * distance * this.settings.metersPerPixel
      );
    });
    return !tooSteep;
  }

  private addNode(x: number, y: number, z: number, priority: number, parent: number, tree: number, direction: Point) {
    const node: RiverNode = { id: this.nodes.length, x, y, z, priority, strahler: 1, parent, children: [], tree, direction };
    this.nodes.push(node);
    this.nodeGrid.insert(x, y, node.id);

    if (parent >= 0) {
      const from = this.nodes[parent];
      from.children.push(node.id);
      this.edgeGrid.insert((from.x + x) / 2, (from.y + y) / 2, { from: parent, to: node.id, priority });
    }
    return node;
  }
}

export function growRiverNetwork(domain: Domain, settings: GrowthSettings, seed: number, report: ProgressReporter) {
  return new NetworkGrowth(domain, settings, new Srand(seed)).run(report);
}

function computeStrahler(nodes: RiverNode[]) {
  for (let id = nodes.length - 1; id >= 0; id--) {
    const node = nodes[id];
    let highest = 0;
    let count = 0;
    for (const child of node.children) {
      const order = nodes[child].strahler;
      if (order > highest) {
        highest = order;
        count = 1;
      } else if (order === highest) {
        count++;
      }
    }
    node.strahler = highest === 0 ? 1 : count >= 2 ? highest + 1 : highest;
  }
}

function clearanceFactor(priority: number) {
  return 1 + CLEARANCE_GROWTH_PER_PRIORITY * (priority - 1);
}

function normalizedProbabilities({ pContinue, pSymmetric, pAsymmetric }: GrowthSettings): Probabilities {
  const total = pContinue + pSymmetric + pAsymmetric;
  if (total <= 0) {
    return { continuation: 1, symmetric: 0 };
  }
  return { continuation: pContinue / total, symmetric: pSymmetric / total };
}
