import {
  FilterLayer,
  numberParam,
  ParameterValues,
  ProgressReporter,
  RenderContext,
  scaleReport,
  selectParam,
} from '../layerDefinition';
import { LayerImage, layerImage } from '../layerImage';
import { downsample, upsampleBilinear } from '../hydraulicErosion/resample';
import { createState, EdgeMode, RainMode, runSimulation, settle } from '../hydraulicErosion/simulation';
import { ELEVATION_TO_MAP_HEIGHT, TERRAIN_SIZE } from '../terrain';

type Resolution = '257' | '513' | '1025' | '2049';

const SIMULATION_SHARE = 0.9;

const parameters = {
  resolution: selectParam<Resolution>('Simulation Resolution', '513', [
    { value: '257', label: '257' },
    { value: '513', label: '513' },
    { value: '1025', label: '1025' },
    { value: '2049', label: '2049' },
  ]),
  steps: numberParam('Time Steps', 2000, 100, 10000, 100),
  capacity: numberParam('Sediment Capacity (Kc)', 5, 0, 20, 0.1),
  deposition: numberParam('Deposition (Kd)', 0.1, 0, 1, 0.01),
  softness: numberParam('Soil Softness (Ks)', 0.3, 0, 1, 0.01),
  rainAmount: numberParam('Rain Amount (× altitude)', 0.001, 0, 0.01, 0.0005),
  rainInterval: numberParam('Rain Interval (steps)', 65, 1, 500, 1),
  rainMode: selectParam<RainMode>('Rain', 'altitude', [
    { value: 'altitude', label: 'Altitude' },
    { value: 'uniform', label: 'Uniform' },
  ]),
  evaporation: numberParam('Evaporation (per step)', 0, 0, 0.1, 0.001),
  edges: selectParam<EdgeMode>('Map Edges', 'drain', [
    { value: 'drain', label: 'Drain' },
    { value: 'closed', label: 'Closed' },
  ]),
  talusAngle: numberParam('Talus Angle (°)', 35, 0, 89, 1),
  thermalRate: numberParam('Thermal Rate (ct)', 0, 0, 0.5, 0.001),
};

type HydraulicSettings = ParameterValues<typeof parameters>;

export class HydraulicErosion implements FilterLayer<typeof parameters> {
  readonly role = 'filter';
  readonly type = 'hydraulic-erosion';
  readonly name = 'Hydraulic Erosion';
  readonly parameters = parameters;

  render(source: LayerImage, settings: HydraulicSettings, { report }: RenderContext) {
    return this.erode(source, settings, report).result;
  }

  renderLayers(source: LayerImage, settings: HydraulicSettings, { report }: RenderContext) {
    const { size } = source;
    const { water, sediment, delta, result } = this.erode(source, settings, report);
    const n = Math.round(Math.sqrt(water.length));
    const toElevation = (field: Float32Array) => field.map((value) => value / ELEVATION_TO_MAP_HEIGHT);

    return [
      layerImage('Water', size, toElevation(upsampleBilinear(water, n, size))),
      layerImage('Sediment', size, toElevation(upsampleBilinear(sediment, n, size))),
      layerImage('Erosion Delta', size, toElevation(delta)),
      result,
    ];
  }

  private erode(source: LayerImage, settings: HydraulicSettings, report: ProgressReporter) {
    const { size, elevation } = source;
    const n = Math.min(Number(settings.resolution), size);
    const a = downsample(elevation, size, n).map((value) => value * ELEVATION_TO_MAP_HEIGHT);
    const initial = a.slice();
    const state = createState(a, n);

    runSimulation(state, settings, TERRAIN_SIZE / (n - 1), scaleReport(report, 0, SIMULATION_SHARE));
    const water = state.w.slice();
    const sediment = state.s.slice();
    settle(state);

    const delta = upsampleBilinear(state.a.map((value, i) => value - initial[i]), n, size);
    const eroded = elevation.map((value, i) => value + delta[i] / ELEVATION_TO_MAP_HEIGHT);
    report(1);

    return { water, sediment, delta, result: layerImage('Hydraulic Erosion', size, eroded, source.color) };
  }
}
