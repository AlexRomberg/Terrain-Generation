import { Vector2 } from 'three';
import { drawLine, drawPixel, drawRegions, drawVector } from '../drawing';
import { BaseLayer, numberParam, ParameterValues, ProgressReporter, RenderContext, scaleReport } from '../layerDefinition';
import { layerImage } from '../layerImage';
import { Classification, classifyRivers, RosgenType } from '../riverNetworks/classifications';
import { createDomain, Domain } from '../riverNetworks/domain';
import { growRiverNetwork, RiverNode } from '../riverNetworks/graph';
import { computeHydrology, CrestEdgeKind, Hydrology } from '../riverNetworks/hydrology';
import { createTerrainPrimitives, evaluateTerrain, TerrainPrimitive } from '../riverNetworks/primitives';
import { buildRiverPaths, RiverPath } from '../riverNetworks/riverPaths';
import {
  createRiverSlopeMap,
  createTerrainSlopeMap,
  RIVER_SLOPE_MAX,
  RIVER_SLOPE_MIN,
  SlopeMap,
} from '../riverNetworks/slopeMaps';
import { ELEVATION_TO_MAP_HEIGHT, SIZE } from '../terrain';

type RGB = [number, number, number];

const BORDER_GRAY = 110;
const INLAND_GRAY = 225;
const MOUTH_COLOR: RGB = [220, 40, 40];
const MOUTH_BASE_WIDTH = 10;
const MOUTH_WIDTH_PER_PRIORITY = 6;
const INWARD_ARROW_WIDTH = 4;
const MOUTH_SPACING_EDGES = 2;
const CORNER_MARGIN_EDGES = 0.75;
const CLEARANCE_EDGES = 0.75;
const RIVER_SLOPE_SEED_OFFSET = 101;
const GROWTH_SEED_OFFSET = 202;
const TERRAIN_SLOPE_SEED_OFFSET = 303;
const MEANDER_SEED_OFFSET = 404;
const PRIMITIVE_SEED_OFFSET = 505;
const ROUGHNESS_SEED_OFFSET = 606;
const GROWTH_PROGRESS_SHARE = 0.2;
const HYDROLOGY_PROGRESS_SHARE = 0.3;
const CLASSIFICATION_PROGRESS_SHARE = 0.31;
const PATHS_PROGRESS_SHARE = 0.33;
const PRIMITIVES_PROGRESS_SHARE = 0.4;
const EVALUATION_PROGRESS_SHARE = 0.95;
const CARVE_BACKGROUND = 245;
const CARVE_COLOR: RGB = [30, 80, 200];
const PRIMITIVE_DOT_WIDTH = 6;
const PRIMITIVE_RIVER_COLOR: RGB = [70, 120, 210];
const PATH_RIDGE_COLOR: RGB = [215, 215, 215];
const FLAT_GRAY = 250;
const STEEP_GRAY = 180;
const EDGE_BASE_WIDTH = 2;
const EDGE_WIDTH_PER_ORDER = 2;
const TREE_SATURATION = 0.65;
const TREE_LIGHTNESS = 0.45;
const GOLDEN_RATIO = 0.618033988749895;
const WATERSHED_TINT = 0.6;
const CELL_SHADE_VARIATION = 0.08;
const CELL_SHADE_STEPS = 5;
const RIDGE_COLOR: RGB = [60, 60, 60];
const RIDGE_WIDTH = 2;
const CREST_BACKGROUND = 245;
const CREST_EDGE_WIDTH = 6;
const CREST_VERTEX_WIDTH = 12;
const CREST_RIVER_COLOR: RGB = [70, 120, 210];
const CREST_RIVER_WIDTH = 2;
const BORDER_EDGE_COLOR: RGB = [160, 160, 160];
const TYPE_BACKGROUND = 250;
const TYPE_MIN_WIDTH = 2;
const TYPE_WIDTH_RANGE = 14;
const ROSGEN_COLORS: Record<RosgenType, RGB> = {
  A: [200, 40, 40],
  B: [235, 140, 30],
  C: [60, 150, 60],
  E: [20, 160, 170],
  D: [140, 70, 190],
  delta: [30, 50, 140],
};
const ELEVATION_RAMP: readonly (readonly [number, RGB])[] = [
  [0, [40, 90, 160]],
  [0.33, [90, 160, 90]],
  [0.66, [170, 125, 75]],
  [1, [250, 250, 250]],
];

const parameters = {
  domainKm: numberParam('Domain Width (km)', 15, 5, 200, 5),
  mouths: numberParam('River Mouths', 4, 1, 30, 1),
  maxPriority: numberParam('Max Priority', 5, 1, 8, 1),
  edgeLength: numberParam('Edge Length (km)', 2, 0.5, 5, 0.1),
  zeta: numberParam('Elevation Window ζ (m)', 20, 0, 200, 1),
  pContinue: numberParam('P Continue', 0.2, 0, 1, 0.05),
  pSymmetric: numberParam('P Symmetric', 0.1, 0, 1, 0.05),
  pAsymmetric: numberParam('P Asymmetric', 0.7, 0, 1, 0.05),
  riverSlope: numberParam('River Slope', 0.02, 0.001, 0.1, 0.001),
  terrainSlope: numberParam('Terrain Slope λ', 0.15, 0, 0.25, 0.01),
  primitivesPerCell: numberParam('Primitives per Cell', 50, 5, 100, 5),
  meander: numberParam('Meander Strength', 0.5, 0, 1, 0.05),
  roughness: numberParam('Roughness', 0.1, 0, 0.5, 0.01),
  smoothing: numberParam('Bump Smoothing', 1, 1, 4, 0.1),
  carveStrength: numberParam('River Carve Strength', 0, 0, 1, 0.05),
  verticalExaggeration: numberParam('Vertical Exaggeration', 8, 1, 20, 0.5),
};

type RiverNetworkParams = ParameterValues<typeof parameters>;

export class RiverNetwork implements BaseLayer<typeof parameters> {
  readonly role = 'base';
  readonly type = 'river-network';
  readonly name = 'River Network';
  readonly parameters = parameters;

  render(params: RiverNetworkParams, { seed, report }: RenderContext) {
    const { paths, primitives } = this.build(params, seed, report);
    const { height } = this.evaluate(paths, primitives, params, seed, false, report);
    return layerImage('River Network Result', SIZE, this.toElevation(height, params));
  }

  renderLayers(params: RiverNetworkParams, { seed, report }: RenderContext) {
    const { domain, nodes, riverSlope, hydrology, classification, paths, primitives } = this.build(params, seed, report);
    const { height, terrain, riverWeight } = this.evaluate(paths, primitives, params, seed, true, report);
    const result = layerImage('River Network Result', SIZE, this.toElevation(height, params));
    const terrainOnly = layerImage('Terrain Primitives Only', SIZE, this.toElevation(terrain!, params));
    return [
      this.drawDomain(domain, result.elevation, params),
      this.drawGraph(domain, nodes, riverSlope, result.elevation, params),
      this.drawWatersheds(domain, nodes, hydrology, result.elevation),
      this.drawCrests(domain, nodes, hydrology, result.elevation),
      this.drawRosgenTypes(domain, nodes, classification, result.elevation),
      this.drawPaths(domain, hydrology, paths, result.elevation),
      this.drawPrimitives(domain, hydrology, paths, primitives, result.elevation),
      terrainOnly,
      this.drawCarveWeight(riverWeight!, result.elevation),
      result,
    ];
  }

  private build(params: RiverNetworkParams, seed: number, report: ProgressReporter) {
    const domain = this.buildDomain(params, seed);
    const edgeLength = this.kmToPixels(params.edgeLength, params);
    const riverSlope = createRiverSlopeMap(SIZE, params.riverSlope, seed + RIVER_SLOPE_SEED_OFFSET);
    const nodes = growRiverNetwork(
      domain,
      {
        edgeLength,
        metersPerPixel: this.metersPerPixel(params),
        zeta: params.zeta,
        pContinue: params.pContinue,
        pSymmetric: params.pSymmetric,
        pAsymmetric: params.pAsymmetric,
        borderMargin: CORNER_MARGIN_EDGES * edgeLength,
        clearance: CLEARANCE_EDGES * edgeLength,
        kappa: Math.max(params.terrainSlope, RIVER_SLOPE_MAX * params.riverSlope),
        maxPriority: params.maxPriority,
        riverSlope,
      },
      seed + GROWTH_SEED_OFFSET,
      scaleReport(report, 0, GROWTH_PROGRESS_SHARE),
    );
    report(GROWTH_PROGRESS_SHARE);
    const hydrology = computeHydrology(domain, nodes, {
      metersPerPixel: this.metersPerPixel(params),
      terrainSlope: createTerrainSlopeMap(SIZE, params.terrainSlope, seed + TERRAIN_SLOPE_SEED_OFFSET),
    });
    report(HYDROLOGY_PROGRESS_SHARE);
    const classification = classifyRivers(nodes, hydrology, { edgeLengthMeters: params.edgeLength * 1000 });
    report(CLASSIFICATION_PROGRESS_SHARE);
    const paths = buildRiverPaths(
      nodes,
      hydrology,
      classification,
      { edgeLength, meander: params.meander },
      seed + MEANDER_SEED_OFFSET,
    );
    report(PATHS_PROGRESS_SHARE);
    const primitives = createTerrainPrimitives(
      nodes,
      hydrology,
      paths,
      {
        size: SIZE,
        metersPerPixel: this.metersPerPixel(params),
        primitivesPerCell: params.primitivesPerCell,
        roughness: params.roughness,
        smoothing: params.smoothing,
      },
      seed + PRIMITIVE_SEED_OFFSET,
    );
    report(PRIMITIVES_PROGRESS_SHARE);
    return { domain, nodes, riverSlope, hydrology, classification, paths, primitives };
  }

  private buildDomain(params: RiverNetworkParams, seed: number) {
    return createDomain(
      SIZE,
      {
        mouthCount: params.mouths,
        maxPriority: params.maxPriority,
        mouthSpacing: MOUTH_SPACING_EDGES * this.kmToPixels(params.edgeLength, params),
        cornerMargin: CORNER_MARGIN_EDGES * this.kmToPixels(params.edgeLength, params),
      },
      seed,
    );
  }

  private evaluate(
    paths: RiverPath[],
    primitives: TerrainPrimitive[],
    params: RiverNetworkParams,
    seed: number,
    keepLayers: boolean,
    report: ProgressReporter,
  ) {
    const evaluation = evaluateTerrain(
      primitives,
      paths,
      {
        size: SIZE,
        metersPerPixel: this.metersPerPixel(params),
        edgeLength: this.kmToPixels(params.edgeLength, params),
        carveStrength: params.carveStrength,
        keepLayers,
      },
      seed + ROUGHNESS_SEED_OFFSET,
      scaleReport(report, PRIMITIVES_PROGRESS_SHARE, EVALUATION_PROGRESS_SHARE),
    );
    report(EVALUATION_PROGRESS_SHARE);
    return evaluation;
  }

  private drawCarveWeight(riverWeight: Float32Array, elevation: Float32Array) {
    const image = layerImage('River Carve Weight', SIZE, elevation, new Uint8ClampedArray(SIZE * SIZE * 3));
    const color = image.color!;
    for (let i = 0; i < riverWeight.length; i++) {
      const weight = riverWeight[i];
      color[i * 3] = CARVE_BACKGROUND + (CARVE_COLOR[0] - CARVE_BACKGROUND) * weight;
      color[i * 3 + 1] = CARVE_BACKGROUND + (CARVE_COLOR[1] - CARVE_BACKGROUND) * weight;
      color[i * 3 + 2] = CARVE_BACKGROUND + (CARVE_COLOR[2] - CARVE_BACKGROUND) * weight;
    }
    return image;
  }

  private drawDomain(domain: Domain, elevation: Float32Array, params: RiverNetworkParams) {
    const { size, coastDistance, mouths } = domain;
    const image = layerImage('Domain and Mouths', size, elevation, new Uint8ClampedArray(size * size * 3));
    const color = image.color!;

    let maxDistance = 1;
    for (const distance of coastDistance) {
      maxDistance = Math.max(maxDistance, distance);
    }

    for (let i = 0; i < coastDistance.length; i++) {
      const gray = BORDER_GRAY + (INLAND_GRAY - BORDER_GRAY) * (coastDistance[i] / maxDistance);
      color[i * 3] = gray;
      color[i * 3 + 1] = gray;
      color[i * 3 + 2] = gray;
    }

    const arrowLength = this.kmToPixels(params.edgeLength, params);
    for (const mouth of mouths) {
      const arrow = new Vector2(mouth.inward.x * arrowLength, mouth.inward.y * arrowLength);
      drawVector(image, arrow, mouth.x, mouth.y, { color: MOUTH_COLOR, strokeWidth: INWARD_ARROW_WIDTH });
      drawPixel(image, mouth.x, mouth.y, {
        color: MOUTH_COLOR,
        strokeWidth: MOUTH_BASE_WIDTH + MOUTH_WIDTH_PER_PRIORITY * mouth.priority,
      });
    }

    return image;
  }

  private drawGraph(
    domain: Domain,
    nodes: RiverNode[],
    riverSlope: SlopeMap,
    elevation: Float32Array,
    params: RiverNetworkParams,
  ) {
    const { size } = domain;
    const image = layerImage('River Graph (Strahler)', size, elevation, new Uint8ClampedArray(size * size * 3));
    const color = image.color!;
    const lowest = RIVER_SLOPE_MIN * params.riverSlope;
    const range = (RIVER_SLOPE_MAX - RIVER_SLOPE_MIN) * params.riverSlope;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const steepness = (riverSlope(x, y) - lowest) / range;
        color.fill(FLAT_GRAY - (FLAT_GRAY - STEEP_GRAY) * steepness, (x + y * size) * 3, (x + y * size) * 3 + 3);
      }
    }

    this.drawRivers(image, nodes, (node) => this.treeColor(node.tree), (node) => EDGE_BASE_WIDTH + EDGE_WIDTH_PER_ORDER * node.strahler);
    return image;
  }

  private drawWatersheds(domain: Domain, nodes: RiverNode[], hydrology: Hydrology, elevation: Float32Array) {
    const { size } = domain;
    const image = layerImage('Watersheds', size, elevation, new Uint8ClampedArray(size * size * 3));

    drawRegions(image, hydrology.voronoi.lookup, nodes.length, (cell) => {
      const shade = 1 + CELL_SHADE_VARIATION * ((cell % CELL_SHADE_STEPS) / (CELL_SHADE_STEPS - 1) - 0.5);
      return this.treeColor(nodes[cell].tree).map(
        (channel) => (channel + (255 - channel) * WATERSHED_TINT) * shade,
      ) as RGB;
    });
    this.drawCrestEdges(image, hydrology, ['ridge'], () => RIDGE_COLOR, RIDGE_WIDTH);
    this.drawRivers(image, nodes, (node) => this.treeColor(node.tree), (node) => EDGE_BASE_WIDTH + EDGE_WIDTH_PER_ORDER * node.strahler);
    return image;
  }

  private drawCrests(domain: Domain, nodes: RiverNode[], hydrology: Hydrology, elevation: Float32Array) {
    const { size } = domain;
    const image = layerImage('Crest Elevation', size, elevation, new Uint8ClampedArray(size * size * 3).fill(CREST_BACKGROUND));
    const { vertices } = hydrology;
    const highest = this.largest(vertices.map((vertex) => vertex.z), 1);

    this.drawCrestEdges(image, hydrology, ['border'], () => BORDER_EDGE_COLOR, RIDGE_WIDTH);
    this.drawRivers(image, nodes, () => CREST_RIVER_COLOR, () => CREST_RIVER_WIDTH);
    this.drawCrestEdges(
      image,
      hydrology,
      ['ridge'],
      (from, to) => this.elevationColor((vertices[from].z + vertices[to].z) / 2 / highest),
      CREST_EDGE_WIDTH,
    );
    for (const vertex of vertices) {
      drawPixel(image, vertex.x, vertex.y, { color: this.elevationColor(vertex.z / highest), strokeWidth: CREST_VERTEX_WIDTH });
    }
    return image;
  }

  private drawRosgenTypes(domain: Domain, nodes: RiverNode[], classification: Classification, elevation: Float32Array) {
    const { size } = domain;
    const image = layerImage('Rosgen Types and Flow', size, elevation, new Uint8ClampedArray(size * size * 3).fill(TYPE_BACKGROUND));
    const widest = this.largest(classification.width, 0);
    const strokeOf = (node: RiverNode) => TYPE_MIN_WIDTH + (TYPE_WIDTH_RANGE * classification.width[node.id]) / widest;

    const upstreamNodes = nodes.filter((node) => node.parent >= 0).sort((a, b) => strokeOf(a) - strokeOf(b));
    for (const node of upstreamNodes) {
      const parent = nodes[node.parent];
      drawLine(image, parent.x, parent.y, node.x, node.y, {
        color: ROSGEN_COLORS[classification.type[node.id]],
        strokeWidth: strokeOf(node),
      });
    }
    for (const mouth of nodes.filter((node) => node.parent < 0)) {
      drawPixel(image, mouth.x, mouth.y, {
        color: ROSGEN_COLORS[classification.type[mouth.id]],
        strokeWidth: MOUTH_BASE_WIDTH + 2 * strokeOf(mouth),
      });
    }
    return image;
  }

  private drawPaths(domain: Domain, hydrology: Hydrology, paths: RiverPath[], elevation: Float32Array) {
    const { size } = domain;
    const image = layerImage('River Paths', size, elevation, new Uint8ClampedArray(size * size * 3).fill(TYPE_BACKGROUND));
    const widest = this.largest(paths.map((path) => path.width), 0);

    this.drawCrestEdges(image, hydrology, ['ridge'], () => PATH_RIDGE_COLOR, RIDGE_WIDTH);
    for (const path of [...paths].sort((a, b) => a.width - b.width)) {
      const style = { color: ROSGEN_COLORS[path.type], strokeWidth: TYPE_MIN_WIDTH + (TYPE_WIDTH_RANGE * path.width) / widest };
      for (let i = 1; i < path.points.length; i++) {
        const [a, b] = [path.points[i - 1], path.points[i]];
        drawLine(image, a.x, a.y, b.x, b.y, style);
      }
    }
    return image;
  }

  private drawPrimitives(
    domain: Domain,
    hydrology: Hydrology,
    paths: RiverPath[],
    primitives: TerrainPrimitive[],
    elevation: Float32Array,
  ) {
    const { size } = domain;
    const image = layerImage('Terrain Primitives', size, elevation, new Uint8ClampedArray(size * size * 3).fill(TYPE_BACKGROUND));
    const highest = this.largest(hydrology.vertices.map((vertex) => vertex.z), 1);

    this.drawCrestEdges(image, hydrology, ['ridge'], () => PATH_RIDGE_COLOR, RIDGE_WIDTH);
    for (const path of paths) {
      for (let i = 1; i < path.points.length; i++) {
        const [a, b] = [path.points[i - 1], path.points[i]];
        drawLine(image, a.x, a.y, b.x, b.y, { color: PRIMITIVE_RIVER_COLOR, strokeWidth: CREST_RIVER_WIDTH });
      }
    }
    for (const primitive of primitives) {
      drawPixel(image, primitive.x, primitive.y, {
        color: this.elevationColor(primitive.z / highest),
        strokeWidth: PRIMITIVE_DOT_WIDTH,
      });
    }
    return image;
  }

  private drawCrestEdges(
    image: ReturnType<typeof layerImage>,
    hydrology: Hydrology,
    kinds: CrestEdgeKind[],
    colorOf: (from: number, to: number) => RGB,
    strokeWidth: number,
  ) {
    for (const cell of hydrology.cells) {
      for (const edge of cell.edges) {
        if (!kinds.includes(edge.kind) || (edge.neighbour >= 0 && edge.neighbour < cell.node)) {
          continue;
        }
        const from = hydrology.vertices[edge.from];
        const to = hydrology.vertices[edge.to];
        drawLine(image, from.x, from.y, to.x, to.y, { color: colorOf(edge.from, edge.to), strokeWidth });
      }
    }
  }

  private drawRivers(
    image: ReturnType<typeof layerImage>,
    nodes: RiverNode[],
    colorOf: (node: RiverNode) => RGB,
    widthOf: (node: RiverNode) => number,
  ) {
    const upstreamNodes = nodes.filter((node) => node.parent >= 0).sort((a, b) => a.strahler - b.strahler);
    for (const node of upstreamNodes) {
      const parent = nodes[node.parent];
      drawLine(image, parent.x, parent.y, node.x, node.y, { color: colorOf(node), strokeWidth: widthOf(node) });
    }
    for (const mouth of nodes.filter((node) => node.parent < 0)) {
      drawPixel(image, mouth.x, mouth.y, {
        color: colorOf(mouth),
        strokeWidth: MOUTH_BASE_WIDTH + MOUTH_WIDTH_PER_PRIORITY * mouth.priority,
      });
    }
  }

  private elevationColor(fraction: number): RGB {
    const t = Math.min(1, Math.max(0, fraction));
    const upper = ELEVATION_RAMP.findIndex(([stop]) => stop >= t);
    if (upper <= 0) {
      return [...ELEVATION_RAMP[0][1]];
    }
    const [fromStop, fromColor] = ELEVATION_RAMP[upper - 1];
    const [toStop, toColor] = ELEVATION_RAMP[upper];
    const blend = (t - fromStop) / (toStop - fromStop);
    return fromColor.map((channel, i) => channel + (toColor[i] - channel) * blend) as RGB;
  }

  private treeColor(tree: number): RGB {
    const hue = (tree * GOLDEN_RATIO) % 1;
    const chroma = (1 - Math.abs(2 * TREE_LIGHTNESS - 1)) * TREE_SATURATION;
    const sector = hue * 6;
    const second = chroma * (1 - Math.abs((sector % 2) - 1));
    const offset = TREE_LIGHTNESS - chroma / 2;
    const [r, g, b] = [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ][Math.floor(sector) % 6];
    return [(r + offset) * 255, (g + offset) * 255, (b + offset) * 255];
  }

  private largest(values: Iterable<number>, floor: number) {
    let largest = floor;
    for (const value of values) {
      largest = Math.max(largest, value);
    }
    return largest;
  }

  private metersPerPixel(params: RiverNetworkParams) {
    return (params.domainKm * 1000) / (SIZE - 1);
  }

  private kmToPixels(km: number, params: RiverNetworkParams) {
    return (km * 1000) / this.metersPerPixel(params);
  }

  private toElevation(meters: Float32Array, params: RiverNetworkParams) {
    const scale = params.verticalExaggeration / (params.domainKm * 1000) / ELEVATION_TO_MAP_HEIGHT;
    return meters.map((value) => value * scale);
  }
}
