import { Vector2 } from 'three';
import { FilterLayer } from '../filterLayer';
import { LayerImage } from '../layerImage';
import { drawLine, drawVector, drawVoronoi } from '../drawing';
import { NumberParameter } from '../layerParameter';
import { ELEVATION_TO_MAP_HEIGHT } from '../baseLayer';
import Srand from 'seeded-rand';
import { calculateVoronoi, Point } from '../common';

const ARROWS_PER_SIDE = 10;
const ARROW_FILL = 0.8;
const ERROR_CUTOFF = 1e-10;
const TAU = Math.PI * 2;
const PHASE_OFFSET = 0.25 * TAU;
const BLEND_RADIUS = 1.5;
const BLEND_CUTOFF = Math.exp(-2 * BLEND_RADIUS * BLEND_RADIUS);

interface ErosionSettings {
  scale: number;
  strength: number;
  gullyWeight: number;
  detail: number;
  ridgeRounding: number;
  creaseRounding: number;
  inputRounding: number;
  octaveRounding: number;
  inputOnset: number;
  octaveOnset: number;
  ridgeMapInputOnset: number;
  ridgeMapOctaveOnset: number;
  assumedSlope: number;
  assumedSlopeAmount: number;
  cellScale: number;
  normalization: number;
  octaves: number;
  lacunarity: number;
  gain: number;
  heightOffset: number;
  heightOffsetFade: number;
  fadeTargetRange: number;
}

interface Octave {
  field: PivotField;
  frequency: number;
  strength: number;
  roundingMultiplier: number;
}

interface PixelErosion {
  height: number;
  ridgeMap: number;
}

interface PivotField {
  pivots: Point[];
  spacing: number;
  bucketSize: number;
  bucketsPerSide: number;
  bucketStart: Uint32Array;
  pivotX: Float64Array;
  pivotY: Float64Array;
}

interface Phasor {
  cos: number;
  sin: number;
}

export class ErosionFilter implements FilterLayer {
  name = 'Stateless Erosion';
  parameters = {
    scale: new NumberParameter('Scale', 0.15, 0.02, 1, 0.01),
    strength: new NumberParameter('Strength', 0.22, 0, 1, 0.01),
    gullyWeight: new NumberParameter('Gully Weight', 0.5, 0, 1, 0.05),
    detail: new NumberParameter('Detail', 1.5, 0.1, 5, 0.1),
    ridgeRounding: new NumberParameter('Ridge Rounding', 0.1, 0, 1, 0.05),
    creaseRounding: new NumberParameter('Crease Rounding', 0, 0, 1, 0.05),
    inputRounding: new NumberParameter('Rounding: Input Multiplier', 0.1, 0, 1, 0.05),
    octaveRounding: new NumberParameter('Rounding: Octave Multiplier', 2, 0.5, 4, 0.1),
    inputOnset: new NumberParameter('Onset: Input', 1.25, 0, 5, 0.05),
    octaveOnset: new NumberParameter('Onset: Octaves', 1.25, 0, 5, 0.05),
    ridgeMapInputOnset: new NumberParameter('Ridge Map Onset: Input', 2.8, 0, 5, 0.05),
    ridgeMapOctaveOnset: new NumberParameter('Ridge Map Onset: Octaves', 1.5, 0, 5, 0.05),
    assumedSlope: new NumberParameter('Assumed Slope', 0.7, 0, 3, 0.05),
    assumedSlopeAmount: new NumberParameter('Assumed Slope Amount', 1, 0, 1, 0.05),
    cellScale: new NumberParameter('Cell Scale', 0.7, 0.3, 2, 0.05),
    normalization: new NumberParameter('Normalization', 0.5, 0, 0.95, 0.05),
    octaves: new NumberParameter('Octaves', 5, 1, 7, 1),
    lacunarity: new NumberParameter('Lacunarity', 2, 1.5, 3, 0.1),
    gain: new NumberParameter('Gain', 0.5, 0.1, 0.9, 0.05),
    heightOffset: new NumberParameter('Height Offset', -0.65, -1, 1, 0.05),
    heightOffsetFade: new NumberParameter('Height Offset: Keep Peaks & Valleys', 0, 0, 1, 0.05),
    fadeTargetRange: new NumberParameter('Fade Target Range', 0.0375, 0.005, 0.5, 0.0025),
  };

  private cachedSource?: LayerImage;
  private cachedParams = '';
  private cachedLayers: LayerImage[] = [];

  renderLayers(source: LayerImage, seed: number) {
    const settings = Object.fromEntries(
      Object.entries(this.parameters).map(([key, parameter]) => [key, parameter.value()]),
    ) as unknown as ErosionSettings;
    const params = `${JSON.stringify(settings)};${seed}`;
    if (source === this.cachedSource && params === this.cachedParams) {
      return this.cachedLayers;
    }

    const { size } = source;
    const gradients = computeGradients(source);
    const erosion = erode(source, gradients, settings, seed);
    const elevation = source.elevation.map((value, index) => value + erosion.heightDelta[index]);

    this.cachedSource = source;
    this.cachedParams = params;
    this.cachedLayers = [
      drawGradients(source, gradients),
      drawPivotField(source, erosion.firstOctave),
      new LayerImage('Fade Target', size, erosion.fadeTarget),
      new LayerImage('Ridge Map', size, erosion.ridgeMap),
      new LayerImage('Erosion Delta', size, erosion.heightDelta),
      new LayerImage('Erosion Result', size, elevation, source.color),
    ];
    return this.cachedLayers;
  }

  renderResult(source: LayerImage, seed: number) {
    return this.renderLayers(source, seed).at(-1)!;
  }
}

function erode(source: LayerImage, gradients: Float32Array, settings: ErosionSettings, seed: number) {
  const { size } = source;
  const pixelSize = 1 / (size - 1);
  const slopeScale = ELEVATION_TO_MAP_HEIGHT / pixelSize;
  const octaves = createOctaves(settings, size, seed);
  const magnitude = octaves.reduce((sum, octave) => sum + octave.strength, 0);

  const fadeTarget = computeFadeTarget(source.elevation, settings.fadeTargetRange);
  const heightDelta = new Float32Array(size * size);
  const ridgeMap = new Float32Array(size * size);
  const pixel: PixelErosion = { height: 0, ridgeMap: 0 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = x + y * size;
      const slopeX = gradients[index * 2] * slopeScale;
      const slopeY = gradients[index * 2 + 1] * slopeScale;
      erodePixel(octaves, settings, pixelSize, x, y, slopeX, slopeY, fadeTarget[index], pixel);

      const offset = lerp(settings.heightOffset, -fadeTarget[index], settings.heightOffsetFade) * magnitude;
      heightDelta[index] = (pixel.height + offset) / ELEVATION_TO_MAP_HEIGHT;
      ridgeMap[index] = pixel.ridgeMap;
    }
  }

  return { firstOctave: octaves[0].field, fadeTarget, ridgeMap, heightDelta };
}

function createOctaves(settings: ErosionSettings, size: number, seed: number): Octave[] {
  const octaves: Octave[] = [];
  let wavelength = settings.scale * (size - 1);
  let strength = settings.strength * settings.scale;
  let roundingMultiplier = 1;

  for (let i = 0; i < settings.octaves; i++) {
    const cellsPerSide = clamp(Math.round(size / (wavelength * settings.cellScale)), 1, size);
    const pivots = generateJitterGrid(cellsPerSide, size, seed + i);
    octaves.push({
      field: createPivotField(pivots, size, size / cellsPerSide),
      frequency: TAU / wavelength,
      strength,
      roundingMultiplier,
    });

    wavelength /= settings.lacunarity;
    strength *= settings.gain;
    roundingMultiplier *= settings.octaveRounding;
  }

  return octaves;
}

function erodePixel(
  octaves: Octave[],
  settings: ErosionSettings,
  pixelSize: number,
  x: number,
  y: number,
  slopeX: number,
  slopeY: number,
  inputFadeTarget: number,
  out: PixelErosion,
) {
  const phasor: Phasor = { cos: 0, sin: 0 };
  const slopeLength = Math.max(Math.hypot(slopeX, slopeY), ERROR_CUTOFF);
  let fadeTarget = clamp(inputFadeTarget, -1, 1);

  const inputRounding = roundingFor(settings, fadeTarget) * settings.inputRounding;
  let mask = easeOut(smoothStart(slopeLength * settings.inputOnset, inputRounding * settings.inputOnset));
  let ridgeMapMask = easeOut(slopeLength * settings.ridgeMapInputOnset);
  let ridgeMapFadeTarget = fadeTarget;

  let gullySlopeX = lerp(slopeX, (slopeX / slopeLength) * settings.assumedSlope, settings.assumedSlopeAmount);
  let gullySlopeY = lerp(slopeY, (slopeY / slopeLength) * settings.assumedSlope, settings.assumedSlopeAmount);
  let height = 0;

  for (const octave of octaves) {
    const gullySlopeLength = Math.hypot(gullySlopeX, gullySlopeY);
    const directionX = gullySlopeLength > ERROR_CUTOFF ? gullySlopeX / gullySlopeLength : gullySlopeX;
    const directionY = gullySlopeLength > ERROR_CUTOFF ? gullySlopeY / gullySlopeLength : gullySlopeY;
    const sideX = -directionY * octave.frequency;
    const sideY = directionX * octave.frequency;
    sampleStripes(octave.field, x, y, sideX, sideY, settings.normalization, phasor);

    const waveSlopeX = -sideX / pixelSize;
    const waveSlopeY = -sideY / pixelSize;
    const sloping = Math.abs(phasor.sin);
    gullySlopeX += Math.sign(phasor.sin) * waveSlopeX * octave.strength * settings.gullyWeight;
    gullySlopeY += Math.sign(phasor.sin) * waveSlopeY * octave.strength * settings.gullyWeight;

    const fadedGully = lerp(fadeTarget, phasor.cos * settings.gullyWeight, mask);
    height += fadedGully * octave.strength;
    fadeTarget = fadedGully;

    const octaveRounding = roundingFor(settings, phasor.cos) * octave.roundingMultiplier;
    const octaveMask = easeOut(smoothStart(sloping * settings.octaveOnset, octaveRounding * settings.octaveOnset));
    mask = powInv(mask, settings.detail) * octaveMask;

    ridgeMapFadeTarget = lerp(ridgeMapFadeTarget, phasor.cos, ridgeMapMask);
    ridgeMapMask *= easeOut(sloping * settings.ridgeMapOctaveOnset);
  }

  out.height = height;
  out.ridgeMap = ridgeMapFadeTarget * (1 - ridgeMapMask);
}

function roundingFor(settings: ErosionSettings, heightOnRidge: number) {
  return lerp(settings.creaseRounding, settings.ridgeRounding, clamp(heightOnRidge + 0.5, 0, 1));
}

function computeFadeTarget(elevation: Float32Array, range: number) {
  const mean = elevation.reduce((sum, value) => sum + value, 0) / elevation.length;
  return elevation.map((value) => clamp(((value - mean) * ELEVATION_TO_MAP_HEIGHT) / range, -1, 1));
}

function generateJitterGrid(cellsPerSide: number, size: number, seed: number) {
  const rnd = new Srand(seed);
  const points: Point[] = [];
  const cellSize = size / cellsPerSide;

  for (let i = 0; i < cellsPerSide * cellsPerSide; i++) {
    const x = i % cellsPerSide * cellSize + rnd.random() * cellSize;
    const y = Math.floor(i / cellsPerSide) * cellSize + rnd.random() * cellSize;
    points.push({ x, y });
  }

  return points;
}

function createPivotField(pivots: Point[], size: number, spacing: number): PivotField {
  const bucketSize = spacing * BLEND_RADIUS;
  const bucketsPerSide = Math.ceil(size / bucketSize);
  const bucketOf = pivots.map((pivot) => {
    const bucketX = clamp(Math.floor(pivot.x / bucketSize), 0, bucketsPerSide - 1);
    const bucketY = clamp(Math.floor(pivot.y / bucketSize), 0, bucketsPerSide - 1);
    return bucketX + bucketY * bucketsPerSide;
  });

  const bucketStart = new Uint32Array(bucketsPerSide * bucketsPerSide + 1);
  for (const bucket of bucketOf) {
    bucketStart[bucket + 1]++;
  }
  for (let bucket = 0; bucket < bucketsPerSide * bucketsPerSide; bucket++) {
    bucketStart[bucket + 1] += bucketStart[bucket];
  }

  const pivotX = new Float64Array(pivots.length);
  const pivotY = new Float64Array(pivots.length);
  const nextSlot = bucketStart.slice(0, -1);
  pivots.forEach((pivot, index) => {
    const slot = nextSlot[bucketOf[index]]++;
    pivotX[slot] = pivot.x;
    pivotY[slot] = pivot.y;
  });

  return { pivots, spacing, bucketSize, bucketsPerSide, bucketStart, pivotX, pivotY };
}

function sampleStripes(
  field: PivotField,
  x: number,
  y: number,
  sideX: number,
  sideY: number,
  normalization: number,
  out: Phasor,
) {
  const { spacing, bucketSize, bucketsPerSide, bucketStart, pivotX, pivotY } = field;
  const bucketX = Math.floor(x / bucketSize);
  const bucketY = Math.floor(y / bucketSize);
  const distanceScale = 1 / (spacing * spacing);
  let cosSum = 0;
  let sinSum = 0;
  let weightSum = 0;

  for (let cellY = Math.max(bucketY - 1, 0); cellY <= Math.min(bucketY + 1, bucketsPerSide - 1); cellY++) {
    for (let cellX = Math.max(bucketX - 1, 0); cellX <= Math.min(bucketX + 1, bucketsPerSide - 1); cellX++) {
      const bucket = cellX + cellY * bucketsPerSide;
      for (let slot = bucketStart[bucket]; slot < bucketStart[bucket + 1]; slot++) {
        const offsetX = x - pivotX[slot];
        const offsetY = y - pivotY[slot];
        const distanceSquared = (offsetX * offsetX + offsetY * offsetY) * distanceScale;
        if (distanceSquared >= BLEND_RADIUS * BLEND_RADIUS) {
          continue;
        }

        const weight = Math.exp(-2 * distanceSquared) - BLEND_CUTOFF;
        const phase = offsetX * sideX + offsetY * sideY + PHASE_OFFSET;
        cosSum += weight * Math.cos(phase);
        sinSum += weight * Math.sin(phase);
        weightSum += weight;
      }
    }
  }

  const cos = weightSum > 0 ? cosSum / weightSum : 0;
  const sin = weightSum > 0 ? sinSum / weightSum : 0;
  const magnitude = Math.max(1 - normalization, Math.hypot(cos, sin), ERROR_CUTOFF);
  out.cos = cos / magnitude;
  out.sin = sin / magnitude;
}

function easeOut(t: number) {
  const inverse = 1 - clamp(t, 0, 1);
  return 1 - inverse * inverse;
}

function smoothStart(t: number, smoothing: number) {
  if (t >= smoothing) {
    return t - 0.5 * smoothing;
  }
  return (0.5 * t * t) / smoothing;
}

function powInv(t: number, power: number) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), power);
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawPivotField(source: LayerImage, field: PivotField) {
  const { size } = source;
  const cellsPerSide = Math.round(size / field.spacing);
  const image = new LayerImage('Jitter Grid', size, source.elevation, new Uint8ClampedArray(size * size * 3));
  drawVoronoi(image, calculateVoronoi(field.pivots, size));

  for (let i = 0; i < cellsPerSide - 1; i++) {
    const cellEdge = (i + 1) * field.spacing;
    drawLine(image, 0, cellEdge, size, cellEdge, { strokeWidth: 2, color: [0, 0, 0] });
    drawLine(image, cellEdge, 0, cellEdge, size, { strokeWidth: 2, color: [0, 0, 0] });
  }

  return image;
}

function computeGradients(source: LayerImage) {
  const { size, elevation } = source;
  const gradients = new Float32Array(size * size * 2);

  for (let y = 0; y < size; y++) {
    const up = y > 0 ? y - 1 : y;
    const down = y < size - 1 ? y + 1 : y;

    for (let x = 0; x < size; x++) {
      const left = x > 0 ? x - 1 : x;
      const right = x < size - 1 ? x + 1 : x;

      const index = (x + y * size) * 2;
      gradients[index] = (elevation[right + y * size] - elevation[left + y * size]) / (right - left);
      gradients[index + 1] = (elevation[x + down * size] - elevation[x + up * size]) / (down - up);
    }
  }

  return gradients;
}

function drawGradients(source: LayerImage, gradients: Float32Array) {
  const image = new LayerImage('Gradient', source.size, source.elevation, new Uint8ClampedArray(source.size * source.size * 3).fill(255));
  const spacing = source.size / ARROWS_PER_SIDE;

  const samples: { x: number; y: number; gradient: Vector2 }[] = [];
  for (let column = 0; column < ARROWS_PER_SIDE; column++) {
    for (let row = 0; row < ARROWS_PER_SIDE; row++) {
      const x = Math.floor((column + 0.5) * spacing);
      const y = Math.floor((row + 0.5) * spacing);
      const index = (x + y * source.size) * 2;
      samples.push({ x, y, gradient: new Vector2(gradients[index], gradients[index + 1]) });
    }
  }

  const maxLength = samples.reduce((max, sample) => Math.max(max, sample.gradient.length()), 0);
  if (maxLength === 0) {
    return image;
  }

  const scale = (ARROW_FILL * spacing) / maxLength;
  for (const { x, y, gradient } of samples) {
    if (gradient.lengthSq() === 0) {
      continue;
    }
    const arrow = gradient.clone().multiplyScalar(scale);
    drawVector(image, arrow, x - arrow.x / 2, y - arrow.y / 2, { strokeWidth: 6 });
  }

  return image;
}
