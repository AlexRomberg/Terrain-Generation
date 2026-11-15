import { RiverNode } from './graph';
import { Hydrology } from './hydrology';

export type RosgenType = 'A' | 'B' | 'C' | 'D' | 'E' | 'delta';

export type Profile = readonly (readonly [number, number])[];

export interface RosgenClass {
  widthFactor: number;
  depthFactor: number;
  meander: number;
  profile: Profile;
}

const V_PROFILE: Profile = [[-1, 0], [0, 1], [1, 0]];
const TRAPEZOID_PROFILE: Profile = [[-1, 0], [-0.5, 1], [0.5, 1], [1, 0]];
const ASYMMETRIC_PROFILE: Profile = [[-1, 0], [-0.4, 0.5], [0.5, 1], [1, 0]];
const U_PROFILE: Profile = [[-1, 0], [-0.8, 1], [0.8, 1], [1, 0]];
const FLAT_PROFILE: Profile = [[-1, 0], [-0.9, 1], [0.9, 1], [1, 0]];

export const ROSGEN_CLASSES: Record<RosgenType, RosgenClass> = {
  A: { widthFactor: 0.6, depthFactor: 1.3, meander: 0.1, profile: V_PROFILE },
  B: { widthFactor: 1, depthFactor: 1, meander: 0.3, profile: TRAPEZOID_PROFILE },
  C: { widthFactor: 1.3, depthFactor: 0.8, meander: 1.5, profile: ASYMMETRIC_PROFILE },
  E: { widthFactor: 0.6, depthFactor: 1.4, meander: 2.5, profile: U_PROFILE },
  D: { widthFactor: 2.5, depthFactor: 0.5, meander: 0.2, profile: FLAT_PROFILE },
  delta: { widthFactor: 3, depthFactor: 0.4, meander: 0, profile: FLAT_PROFILE },
};

export function profileDepth(profile: Profile, across: number) {
  const x = Math.min(1, Math.max(-1, across));
  for (let i = 1; i < profile.length; i++) {
    const [toX, toValue] = profile[i];
    if (x <= toX) {
      const [fromX, fromValue] = profile[i - 1];
      return fromValue + ((toValue - fromValue) * (x - fromX)) / (toX - fromX);
    }
  }
  return 0;
}

const STEEP_SLOPE = 0.04;
const MODERATE_SLOPE = 0.02;
const SMALL_FLOW = 3;
const DELTA_MIN_FLOW = 15;
const BRAIDED_DISTANCE_EDGES = 1.5;
const WIDTH_COEFFICIENT = 4;
const WIDTH_EXPONENT = 0.5;
const DEPTH_COEFFICIENT = 0.3;
const DEPTH_EXPONENT = 0.4;

export interface Classification {
  type: RosgenType[];
  slope: Float64Array;
  distanceToMouth: Float64Array;
  width: Float64Array;
  depth: Float64Array;
}

export interface ClassificationSettings {
  edgeLengthMeters: number;
}

export function classifyRivers(nodes: RiverNode[], hydrology: Hydrology, settings: ClassificationSettings): Classification {
  const count = nodes.length;
  const type: RosgenType[] = new Array(count);
  const slope = new Float64Array(count);
  const distanceToMouth = new Float64Array(count);
  const width = new Float64Array(count);
  const depth = new Float64Array(count);
  const braidedDistance = BRAIDED_DISTANCE_EDGES * settings.edgeLengthMeters;

  for (const node of nodes) {
    if (node.parent >= 0) {
      const parent = nodes[node.parent];
      slope[node.id] = (node.z - parent.z) / settings.edgeLengthMeters;
      distanceToMouth[node.id] = distanceToMouth[parent.id] + settings.edgeLengthMeters;
      type[node.id] = edgeType(slope[node.id], distanceToMouth[parent.id] < braidedDistance, hydrology.flow[node.id]);
    }
  }

  for (const node of nodes) {
    if (node.parent >= 0) {
      continue;
    }
    const mainChild = node.children.reduce<number | undefined>(
      (best, child) => (best === undefined || hydrology.flow[child] > hydrology.flow[best] ? child : best),
      undefined,
    );
    slope[node.id] = mainChild === undefined ? 0 : slope[mainChild];
    type[node.id] =
      hydrology.flow[node.id] > DELTA_MIN_FLOW ? 'delta' : edgeType(slope[node.id], true, hydrology.flow[node.id]);
  }

  for (const node of nodes) {
    const size = channelSize(hydrology.flow[node.id], type[node.id]);
    width[node.id] = size.width;
    depth[node.id] = size.depth;
  }

  return { type, slope, distanceToMouth, width, depth };
}

export function channelSize(flow: number, type: RosgenType) {
  const rosgen = ROSGEN_CLASSES[type];
  return {
    width: WIDTH_COEFFICIENT * Math.pow(flow, WIDTH_EXPONENT) * rosgen.widthFactor,
    depth: DEPTH_COEFFICIENT * Math.pow(flow, DEPTH_EXPONENT) * rosgen.depthFactor,
  };
}

function edgeType(slope: number, nearMouth: boolean, flow: number): RosgenType {
  if (nearMouth && slope < STEEP_SLOPE && flow >= SMALL_FLOW) {
    return 'D';
  }
  if (slope > STEEP_SLOPE) {
    return 'A';
  }
  if (slope >= MODERATE_SLOPE) {
    return 'B';
  }
  return flow < SMALL_FLOW ? 'E' : 'C';
}
