import Srand from 'seeded-rand';
import { gradientNoise } from '../noise';

const SLOPE_FREQUENCY = 3;
const SLOPE_OCTAVES = 2;
const SLOPE_GAIN = 0.5;
const NOISE_OFFSET_RANGE = 1000;
export const RIVER_SLOPE_MIN = 0.25;
export const RIVER_SLOPE_MAX = 1.75;

export type SlopeMap = (x: number, y: number) => number;

export function createRiverSlopeMap(size: number, mean: number, seed: number): SlopeMap {
  const noise = createNoiseField(size, seed);
  return (x, y) => mean * (RIVER_SLOPE_MIN + (RIVER_SLOPE_MAX - RIVER_SLOPE_MIN) * noise(x, y));
}

export function createTerrainSlopeMap(size: number, max: number, seed: number): SlopeMap {
  const noise = createNoiseField(size, seed);
  return (x, y) => max * noise(x, y);
}

function createNoiseField(size: number, seed: number) {
  const rnd = new Srand(seed);
  const offsetX = rnd.random() * NOISE_OFFSET_RANGE;
  const offsetY = rnd.random() * NOISE_OFFSET_RANGE;
  const baseFrequency = SLOPE_FREQUENCY / (size - 1);

  let normalization = 0;
  for (let octave = 0, amplitude = 1; octave < SLOPE_OCTAVES; octave++, amplitude *= SLOPE_GAIN) {
    normalization += amplitude;
  }

  return (x: number, y: number) => {
    let value = 0;
    let frequency = baseFrequency;
    let amplitude = 1;
    for (let octave = 0; octave < SLOPE_OCTAVES; octave++) {
      value += gradientNoise(offsetX + x * frequency, offsetY + y * frequency) * amplitude;
      frequency *= 2;
      amplitude *= SLOPE_GAIN;
    }
    return Math.min(1, Math.max(0, 0.5 + value / normalization));
  };
}
