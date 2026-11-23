import Srand, { SrandInstance } from 'seeded-rand';
import { Point } from '../common';

export interface RiverMouth extends Point {
  priority: number;
  inward: Point;
}

export interface Domain {
  size: number;
  land: Uint8Array;
  coastDistance: Float32Array;
  mouths: RiverMouth[];
}

export interface DomainSettings {
  mouthCount: number;
  maxPriority: number;
  mouthSpacing: number;
  cornerMargin: number;
}

export function createDomain(size: number, settings: DomainSettings, seed: number): Domain {
  const rnd = new Srand(seed);
  const land = new Uint8Array(size * size).fill(1);
  const coastDistance = borderDistance(size);
  const mouths = assignPriorities(placeMouths(size, settings, rnd), settings.maxPriority, rnd);
  return { size, land, coastDistance, mouths };
}

function borderDistance(size: number) {
  const distance = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      distance[x + y * size] = Math.min(x, y, size - 1 - x, size - 1 - y);
    }
  }
  return distance;
}

function placeMouths(size: number, settings: DomainSettings, rnd: SrandInstance) {
  const edgeLength = Math.max(0, size - 1 - 2 * settings.cornerMargin);
  const perimeter = 4 * edgeLength;
  const count = Math.min(settings.mouthCount, Math.floor(perimeter / settings.mouthSpacing));
  if (count < 1) {
    return [];
  }

  const slot = perimeter / count;
  const offset = rnd.random() * slot;
  const spacingSquared = settings.mouthSpacing * settings.mouthSpacing;
  const mouths: Omit<RiverMouth, 'priority'>[] = [];

  for (let i = 0; i < count; i++) {
    const jitter = settings.mouthSpacing / 2 + rnd.random() * (slot - settings.mouthSpacing);
    const mouth = pointOnBorder((offset + i * slot + jitter) % perimeter, edgeLength, size, settings.cornerMargin);
    if (mouths.every((other) => (other.x - mouth.x) ** 2 + (other.y - mouth.y) ** 2 >= spacingSquared)) {
      mouths.push(mouth);
    }
  }

  return mouths;
}

function pointOnBorder(position: number, edgeLength: number, size: number, margin: number) {
  const edge = Math.min(3, Math.floor(position / edgeLength));
  const along = margin + (position - edge * edgeLength);
  const last = size - 1;

  switch (edge) {
    case 0:
      return { x: along, y: 0, inward: { x: 0, y: 1 } };
    case 1:
      return { x: last, y: along, inward: { x: -1, y: 0 } };
    case 2:
      return { x: last - along, y: last, inward: { x: 0, y: -1 } };
    default:
      return { x: 0, y: last - along, inward: { x: 1, y: 0 } };
  }
}

function assignPriorities(mouths: Omit<RiverMouth, 'priority'>[], maxPriority: number, rnd: SrandInstance): RiverMouth[] {
  const priorities = mouths.map((_, rank) =>
    Math.max(1, maxPriority - Math.floor((rank * maxPriority) / mouths.length)),
  );
  for (let i = priorities.length - 1; i > 0; i--) {
    const j = Math.floor(rnd.random() * (i + 1));
    [priorities[i], priorities[j]] = [priorities[j], priorities[i]];
  }

  if (mouths.length >= 2) {
    const order = priorities.map((_, i) => i).sort((a, b) => priorities[b] - priorities[a] || a - b);
    const largest = mouths[order[0]];
    let farthest = order[1];
    let farthestDistance = -1;
    mouths.forEach((mouth, i) => {
      const distance = (mouth.x - largest.x) ** 2 + (mouth.y - largest.y) ** 2;
      if (i !== order[0] && distance > farthestDistance) {
        farthest = i;
        farthestDistance = distance;
      }
    });
    [priorities[order[1]], priorities[farthest]] = [priorities[farthest], priorities[order[1]]];
  }

  return mouths.map((mouth, i) => ({ ...mouth, priority: priorities[i] }));
}
