import { ProgressReporter } from '../layerDefinition';

export type RainMode = 'altitude' | 'uniform';
export type EdgeMode = 'drain' | 'closed';

export interface SimulationSettings {
  steps: number;
  capacity: number;
  deposition: number;
  softness: number;
  rainAmount: number;
  rainInterval: number;
  rainMode: RainMode;
  evaporation: number;
  edges: EdgeMode;
  talusAngle: number;
  thermalRate: number;
}

export interface ErosionState {
  n: number;
  a: Float32Array;
  w: Float32Array;
  s: Float32Array;
  dA: Float32Array;
  dW: Float32Array;
  dS: Float32Array;
  aMin: number;
  aMean: number;
}

const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
const WEIGHT = DX.map((dx, k) => (dx !== 0 && DY[k] !== 0 ? Math.SQRT1_2 : 1));
const DISTANCE = WEIGHT.map((weight) => 1 / weight);
const PROGRESS_STEPS = 16;

export function createState(a: Float32Array, n: number): ErosionState {
  let aMin = Infinity;
  for (const value of a) {
    aMin = Math.min(aMin, value);
  }
  let total = 0;
  for (const value of a) {
    total += value - aMin;
  }
  const cells = n * n;
  return {
    n,
    a,
    w: new Float32Array(cells),
    s: new Float32Array(cells),
    dA: new Float32Array(cells),
    dW: new Float32Array(cells),
    dS: new Float32Array(cells),
    aMin,
    aMean: total / cells,
  };
}

export function runSimulation(state: ErosionState, settings: SimulationSettings, cellSize: number, report: ProgressReporter) {
  const rainInterval = Math.max(1, Math.round(settings.rainInterval));
  for (let step = 0; step < settings.steps; step++) {
    if (step % rainInterval === 0) {
      rain(state, settings);
    }
    flowStep(state, settings);
    applyStep(state, settings);
    if (settings.thermalRate > 0) {
      thermalStep(state, settings, cellSize);
    }
    if (step % PROGRESS_STEPS === 0) {
      report(step / settings.steps);
    }
  }
  report(1);
}

export function rain(state: ErosionState, { rainAmount, rainMode }: SimulationSettings) {
  const { a, w, aMin, aMean } = state;
  if (rainMode === 'uniform') {
    const amount = rainAmount * aMean;
    for (let i = 0; i < w.length; i++) {
      w[i] += amount;
    }
    return;
  }
  for (let i = 0; i < w.length; i++) {
    w[i] += rainAmount * Math.max(0, a[i] - aMin);
  }
}

export function flowStep(state: ErosionState, settings: SimulationSettings) {
  const { n, a, w, s, dA, dW, dS } = state;
  const kc = settings.capacity;
  const kd = settings.deposition;
  const ks = settings.softness;
  const drop = new Float64Array(8);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = x + y * n;
      const surface = a[i] + w[i];
      let sum = 0;
      let maxDrop = 0;
      let lowestBed = a[i];
      for (let k = 0; k < 8; k++) {
        drop[k] = 0;
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) {
          continue;
        }
        const j = nx + ny * n;
        const d = surface - (a[j] + w[j]);
        if (d <= 0) {
          continue;
        }
        drop[k] = d * WEIGHT[k];
        sum += drop[k];
        if (a[j] < lowestBed) {
          lowestBed = a[j];
        }
        if (d > maxDrop) {
          maxDrop = d;
        }
      }

      const out = Math.min(w[i], maxDrop / 2);
      if (out <= 0) {
        const settled = kd * s[i];
        dA[i] += settled;
        dS[i] -= settled;
        continue;
      }

      const capacity = kc * out;
      let carried: number;
      if (s[i] >= capacity) {
        const excess = s[i] - capacity;
        dA[i] += kd * excess;
        dS[i] -= capacity + kd * excess;
        carried = capacity;
      } else {
        const eroded = Math.min(ks * (capacity - s[i]), a[i] - lowestBed);
        dA[i] -= eroded;
        dS[i] -= s[i];
        carried = s[i] + eroded;
      }

      dW[i] -= out;
      for (let k = 0; k < 8; k++) {
        if (drop[k] === 0) {
          continue;
        }
        const j = x + DX[k] + (y + DY[k]) * n;
        const share = drop[k] / sum;
        dW[j] += out * share;
        dS[j] += carried * share;
      }
    }
  }
}

export function applyStep(state: ErosionState, { capacity, evaporation, edges }: SimulationSettings) {
  const { n, a, w, s, dA, dW, dS } = state;
  const keep = 1 - evaporation;
  for (let i = 0; i < a.length; i++) {
    a[i] += dA[i];
    w[i] = Math.max(0, w[i] + dW[i]) * keep;
    s[i] = Math.max(0, s[i] + dS[i]);

    const held = capacity * w[i];
    if (s[i] > held) {
      a[i] += s[i] - held;
      s[i] = held;
    }
  }
  dA.fill(0);
  dW.fill(0);
  dS.fill(0);

  if (edges === 'drain') {
    const last = n - 1;
    for (let t = 0; t < n; t++) {
      for (const i of [t, t + last * n, t * n, last + t * n]) {
        w[i] = 0;
        s[i] = 0;
      }
    }
  }
}

export function thermalStep(state: ErosionState, { talusAngle, thermalRate }: SimulationSettings, cellSize: number) {
  const { n, a, dA } = state;
  const talus = Math.tan((talusAngle * Math.PI) / 180) * cellSize;
  const excess = new Float64Array(8);

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = x + y * n;
      let sum = 0;
      let maxExcess = 0;
      for (let k = 0; k < 8; k++) {
        excess[k] = 0;
        const nx = x + DX[k];
        const ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) {
          continue;
        }
        const e = a[i] - a[nx + ny * n] - talus * DISTANCE[k];
        if (e <= 0) {
          continue;
        }
        excess[k] = e;
        sum += e;
        if (e > maxExcess) {
          maxExcess = e;
        }
      }
      if (sum === 0) {
        continue;
      }

      const moved = thermalRate * maxExcess;
      dA[i] -= moved;
      for (let k = 0; k < 8; k++) {
        if (excess[k] > 0) {
          dA[x + DX[k] + (y + DY[k]) * n] += (moved * excess[k]) / sum;
        }
      }
    }
  }

  for (let i = 0; i < a.length; i++) {
    a[i] += dA[i];
  }
  dA.fill(0);
}

export function settle(state: ErosionState) {
  const { a, w, s } = state;
  for (let i = 0; i < a.length; i++) {
    a[i] += s[i];
  }
  s.fill(0);
  w.fill(0);
}
