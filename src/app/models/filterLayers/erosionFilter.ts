import { Vector2 } from 'three';
import { LayerImage, layerImage } from '../layerImage';
import { drawLine, drawVector, drawVoronoi } from '../drawing';
import {
  FilterLayer,
  numberParam,
  ParameterValues,
  ProgressReporter,
  RenderContext,
  scaleReport,
} from '../layerDefinition';
import { ELEVATION_TO_MAP_HEIGHT } from '../terrain';
import Srand from 'seeded-rand';
import { calculateVoronoi, Point } from '../common';

const ARROWS_PER_SIDE = 10;
const ARROW_FILL = 0.8;
const ERROR_CUTOFF = 1e-10;
const TAU = Math.PI * 2;
const PHASE_OFFSET = 0.25 * TAU;
const BLEND_RADIUS = 1.5;
const BLEND_CUTOFF = Math.exp(-2 * BLEND_RADIUS * BLEND_RADIUS);

const parameters = {
  scale: numberParam('Scale', 0.15, 0.02, 1, 0.01),
  strength: numberParam('Strength', 0.22, 0, 1, 0.01),
  gullyWeight: numberParam('Gully Weight', 0.5, 0, 1, 0.05),
  detail: numberParam('Detail', 1.5, 0.1, 5, 0.1),
  ridgeRounding: numberParam('Ridge Rounding', 0.1, 0, 1, 0.05),
  creaseRounding: numberParam('Crease Rounding', 0, 0, 1, 0.05),
  inputRounding: numberParam('Rounding: Input Multiplier', 0.1, 0, 1, 0.05),
  octaveRounding: numberParam('Rounding: Octave Multiplier', 2, 0.5, 4, 0.1),
  inputOnset: numberParam('Onset: Input', 1.25, 0, 5, 0.05),
  octaveOnset: numberParam('Onset: Octaves', 1.25, 0, 5, 0.05),
  ridgeMapInputOnset: numberParam('Ridge Map Onset: Input', 2.8, 0, 5, 0.05),
  ridgeMapOctaveOnset: numberParam('Ridge Map Onset: Octaves', 1.5, 0, 5, 0.05),
  assumedSlope: numberParam('Assumed Slope', 0.7, 0, 3, 0.05),
  assumedSlopeAmount: numberParam('Assumed Slope Amount', 1, 0, 1, 0.05),
  cellScale: numberParam('Cell Scale', 0.7, 0.3, 2, 0.05),
  normalization: numberParam('Normalization', 0.5, 0, 0.95, 0.05),
  octaves: numberParam('Octaves', 5, 1, 7, 1),
  lacunarity: numberParam('Lacunarity', 2, 1.5, 3, 0.1),
  gain: numberParam('Gain', 0.5, 0.1, 0.9, 0.05),
  heightOffset: numberParam('Height Offset', -0.65, -1, 1, 0.05),
  heightOffsetFade: numberParam('Height Offset: Keep Peaks & Valleys', 0, 0, 1, 0.05),
  fadeTargetRange: numberParam('Fade Target Range', 0.0375, 0.005, 0.5, 0.0025),
};

type ErosionSettings = ParameterValues<typeof parameters>;

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

export class ErosionFilter implements FilterLayer<typeof parameters> {
  readonly role = 'filter';
  readonly type = 'stateless-erosion';
  readonly name = 'Stateless Erosion';
  readonly parameters = parameters;

  render(source: LayerImage, settings: ErosionSettings, { seed, report }: RenderContext) {
    return this.runErosion(source, settings, seed, report).result;
  }

  renderLayers(source: LayerImage, settings: ErosionSettings, { seed, report }: RenderContext) {
    const { size } = source;
    const { gradients, erosion, result } = this.runErosion(source, settings, seed, scaleReport(report, 0, 0.85));
    report(0.85);
    const gradientImage = this.drawGradients(source, gradients);
    report(0.9);
    const pivotImage = this.drawPivotField(source, erosion.firstOctave);

    return [
      gradientImage,
      pivotImage,
      layerImage('Fade Target', size, erosion.fadeTarget),
      layerImage('Ridge Map', size, erosion.ridgeMap),
      layerImage('Erosion Delta', size, erosion.heightDelta),
      result,
    ];
  }

  private runErosion(source: LayerImage, settings: ErosionSettings, seed: number, report: ProgressReporter) {
    const gradients = this.computeGradients(source);
    const erosion = this.erode(source, gradients, settings, seed, report);
    const elevation = source.elevation.map((value, index) => value + erosion.heightDelta[index]);
    return { gradients, erosion, result: layerImage('Erosion Result', source.size, elevation, source.color) };
  }

  private erode(
    source: LayerImage,
    gradients: Float32Array,
    settings: ErosionSettings,
    seed: number,
    report: ProgressReporter,
  ) {
    const { size } = source;
    const pixelSize = 1 / (size - 1);
    const slopeScale = ELEVATION_TO_MAP_HEIGHT / pixelSize;
    const octaves = this.createOctaves(settings, size, seed);
    const magnitude = octaves.reduce((sum, octave) => sum + octave.strength, 0);

    const fadeTarget = this.computeFadeTarget(source.elevation, settings.fadeTargetRange);
    const heightDelta = new Float32Array(size * size);
    const ridgeMap = new Float32Array(size * size);
    const pixel: PixelErosion = { height: 0, ridgeMap: 0 };

    for (let y = 0; y < size; y++) {
      if ((y & 31) === 0) {
        report(y / size);
      }
      for (let x = 0; x < size; x++) {
        const index = x + y * size;
        const slopeX = gradients[index * 2] * slopeScale;
        const slopeY = gradients[index * 2 + 1] * slopeScale;
        this.erodePixel(octaves, settings, pixelSize, x, y, slopeX, slopeY, fadeTarget[index], pixel);

        const offset = this.lerp(settings.heightOffset, -fadeTarget[index], settings.heightOffsetFade) * magnitude;
        heightDelta[index] = (pixel.height + offset) / ELEVATION_TO_MAP_HEIGHT;
        ridgeMap[index] = pixel.ridgeMap;
      }
    }

    return { firstOctave: octaves[0].field, fadeTarget, ridgeMap, heightDelta };
  }

  private createOctaves(settings: ErosionSettings, size: number, seed: number): Octave[] {
    const octaves: Octave[] = [];
    let wavelength = settings.scale * (size - 1);
    let strength = settings.strength * settings.scale;
    let roundingMultiplier = 1;

    for (let i = 0; i < settings.octaves; i++) {
      const cellsPerSide = this.clamp(Math.round(size / (wavelength * settings.cellScale)), 1, size);
      const pivots = this.generateJitterGrid(cellsPerSide, size, seed + i);
      octaves.push({
        field: this.createPivotField(pivots, size, size / cellsPerSide),
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

  private erodePixel(
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
    let fadeTarget = this.clamp(inputFadeTarget, -1, 1);

    const inputRounding = this.roundingFor(settings, fadeTarget) * settings.inputRounding;
    let mask = this.easeOut(this.smoothStart(slopeLength * settings.inputOnset, inputRounding * settings.inputOnset));
    let ridgeMapMask = this.easeOut(slopeLength * settings.ridgeMapInputOnset);
    let ridgeMapFadeTarget = fadeTarget;

    let gullySlopeX = this.lerp(slopeX, (slopeX / slopeLength) * settings.assumedSlope, settings.assumedSlopeAmount);
    let gullySlopeY = this.lerp(slopeY, (slopeY / slopeLength) * settings.assumedSlope, settings.assumedSlopeAmount);
    let height = 0;

    for (const octave of octaves) {
      const gullySlopeLength = Math.hypot(gullySlopeX, gullySlopeY);
      const directionX = gullySlopeLength > ERROR_CUTOFF ? gullySlopeX / gullySlopeLength : gullySlopeX;
      const directionY = gullySlopeLength > ERROR_CUTOFF ? gullySlopeY / gullySlopeLength : gullySlopeY;
      const sideX = -directionY * octave.frequency;
      const sideY = directionX * octave.frequency;
      this.sampleStripes(octave.field, x, y, sideX, sideY, settings.normalization, phasor);

      const waveSlopeX = -sideX / pixelSize;
      const waveSlopeY = -sideY / pixelSize;
      const sloping = Math.abs(phasor.sin);
      gullySlopeX += Math.sign(phasor.sin) * waveSlopeX * octave.strength * settings.gullyWeight;
      gullySlopeY += Math.sign(phasor.sin) * waveSlopeY * octave.strength * settings.gullyWeight;

      const fadedGully = this.lerp(fadeTarget, phasor.cos * settings.gullyWeight, mask);
      height += fadedGully * octave.strength;
      fadeTarget = fadedGully;

      const octaveRounding = this.roundingFor(settings, phasor.cos) * octave.roundingMultiplier;
      const octaveMask = this.easeOut(this.smoothStart(sloping * settings.octaveOnset, octaveRounding * settings.octaveOnset));
      mask = this.powInv(mask, settings.detail) * octaveMask;

      ridgeMapFadeTarget = this.lerp(ridgeMapFadeTarget, phasor.cos, ridgeMapMask);
      ridgeMapMask *= this.easeOut(sloping * settings.ridgeMapOctaveOnset);
    }

    out.height = height;
    out.ridgeMap = ridgeMapFadeTarget * (1 - ridgeMapMask);
  }

  private roundingFor(settings: ErosionSettings, heightOnRidge: number) {
    return this.lerp(settings.creaseRounding, settings.ridgeRounding, this.clamp(heightOnRidge + 0.5, 0, 1));
  }

  private computeFadeTarget(elevation: Float32Array, range: number) {
    const mean = elevation.reduce((sum, value) => sum + value, 0) / elevation.length;
    return elevation.map((value) => this.clamp(((value - mean) * ELEVATION_TO_MAP_HEIGHT) / range, -1, 1));
  }

  private generateJitterGrid(cellsPerSide: number, size: number, seed: number) {
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

  private createPivotField(pivots: Point[], size: number, spacing: number): PivotField {
    const bucketSize = spacing * BLEND_RADIUS;
    const bucketsPerSide = Math.ceil(size / bucketSize);
    const bucketOf = pivots.map((pivot) => {
      const bucketX = this.clamp(Math.floor(pivot.x / bucketSize), 0, bucketsPerSide - 1);
      const bucketY = this.clamp(Math.floor(pivot.y / bucketSize), 0, bucketsPerSide - 1);
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

  private sampleStripes(
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

  private easeOut(t: number) {
    const inverse = 1 - this.clamp(t, 0, 1);
    return 1 - inverse * inverse;
  }

  private smoothStart(t: number, smoothing: number) {
    if (t >= smoothing) {
      return t - 0.5 * smoothing;
    }
    return (0.5 * t * t) / smoothing;
  }

  private powInv(t: number, power: number) {
    return 1 - Math.pow(1 - this.clamp(t, 0, 1), power);
  }

  private lerp(from: number, to: number, t: number) {
    return from + (to - from) * t;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  private drawPivotField(source: LayerImage, field: PivotField) {
    const { size } = source;
    const cellsPerSide = Math.round(size / field.spacing);
    const image = layerImage('Jitter Grid', size, source.elevation, new Uint8ClampedArray(size * size * 3));
    drawVoronoi(image, calculateVoronoi(field.pivots, size));

    for (let i = 0; i < cellsPerSide - 1; i++) {
      const cellEdge = (i + 1) * field.spacing;
      drawLine(image, 0, cellEdge, size, cellEdge, { strokeWidth: 2, color: [0, 0, 0] });
      drawLine(image, cellEdge, 0, cellEdge, size, { strokeWidth: 2, color: [0, 0, 0] });
    }

    return image;
  }

  private computeGradients(source: LayerImage) {
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

  private drawGradients(source: LayerImage, gradients: Float32Array) {
    const image = layerImage('Gradient', source.size, source.elevation, new Uint8ClampedArray(source.size * source.size * 3).fill(255));
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
}
