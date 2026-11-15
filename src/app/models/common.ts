export interface Point {
    x: number;
    y: number;
}

export interface VoronoiResult {
    points: Point[];
    lookup: Uint32Array;
}

export function calculateVoronoi(points: Point[], worldSize: number) {
    const result: VoronoiResult = {
        points: points.map((point) => ({
            x: Math.round(point.x),
            y: Math.round(point.y),
        })),
        lookup: new Uint32Array(worldSize * worldSize),
    };
    const allPoints = result.points.map((_, i) => i);
    fillRegion(result, worldSize, allPoints, 0, worldSize - 1, 0, worldSize - 1);

    return result;
}

function fillRegion(voronoi: VoronoiResult, size: number, parentCandidatePoints: number[], fromX: number, toX: number, fromY: number, toY: number) {
    const candidates = findCandidatePoints(voronoi.points, parentCandidatePoints, fromX, toX, fromY, toY);

    const nearest = findNearest(voronoi.points, candidates, fromX, fromY);
    const isSameRegion =
        findNearest(voronoi.points, candidates, toX, fromY) === nearest &&
        findNearest(voronoi.points, candidates, fromX, toY) === nearest &&
        findNearest(voronoi.points, candidates, toX, toY) === nearest;

    if (isSameRegion) {
        for (let y = fromY; y <= toY; y++) {
            voronoi.lookup.fill(nearest, fromX + y * size, toX + 1 + y * size);
        }
        return;
    }

    if (toX - fromX < 2 || toY - fromY < 2) {
        for (let y = fromY; y <= toY; y++) {
            for (let x = fromX; x <= toX; x++) {
                voronoi.lookup[x + y * size] = findNearest(voronoi.points, candidates, x, y);
            }
        }
        return;
    }

    const midX = Math.floor((fromX + toX) / 2);
    const midY = Math.floor((fromY + toY) / 2);

    fillRegion(voronoi, size, candidates, fromX, midX, fromY, midY);
    fillRegion(voronoi, size, candidates, midX + 1, toX, fromY, midY);
    fillRegion(voronoi, size, candidates, fromX, midX, midY + 1, toY);
    fillRegion(voronoi, size, candidates, midX + 1, toX, midY + 1, toY);
}

function findCandidatePoints(points: Point[], candidates: number[], fromX: number, toX: number, fromY: number, toY: number) {
    const centerX = (fromX + toX) / 2;
    const centerY = (fromY + toY) / 2;
    const diagonal = Math.hypot(toX - centerX, toY - centerY) * 2;

    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const index of candidates) {
        nearestDistanceSquared = Math.min(nearestDistanceSquared, distanceSquared(points[index], centerX, centerY));
    }

    const reach = Math.sqrt(nearestDistanceSquared) + diagonal;
    return candidates.filter((index) => distanceSquared(points[index], centerX, centerY) <= reach * reach);
}

function findNearest(points: Point[], candidates: number[], x: number, y: number) {
    let nearestIndex = 0;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    for (const index of candidates) {
        const distance = distanceSquared(points[index], x, y);
        if (distance < nearestDistanceSquared) {
            nearestDistanceSquared = distance;
            nearestIndex = index;
        }
    }

    return nearestIndex;
}

function distanceSquared(point: Point, x: number, y: number) {
    const dx = point.x - x;
    const dy = point.y - y;
    return dx * dx + dy * dy;
}

export interface VoronoiVertex {
    x: number;
    y: number;
    cells: [number, number, number];
}

export interface VoronoiTopology {
    area: Uint32Array;
    neighbours: number[][];
    vertices: VoronoiVertex[];
}

const VERTEX_TOLERANCE = 4;
const EMPTY_CIRCLE_EPSILON = 1e-6;

export function calculateVoronoiTopology(voronoi: VoronoiResult, worldSize: number, mask?: ArrayLike<number>): VoronoiTopology {
    const { lookup, points } = voronoi;
    const cellCount = points.length;
    const area = new Uint32Array(cellCount);
    const neighbourPairs = new Set<number>();
    const vertexWindows = new Map<number, { sumX: number; sumY: number; count: number }>();

    for (let y = 0; y < worldSize; y++) {
        for (let x = 0; x < worldSize; x++) {
            const index = x + y * worldSize;
            const cell = lookup[index];
            if (!mask || mask[index]) {
                area[cell]++;
            }

            const hasRight = x < worldSize - 1;
            const hasDown = y < worldSize - 1;
            const right = hasRight ? lookup[index + 1] : cell;
            const down = hasDown ? lookup[index + worldSize] : cell;
            if (right !== cell) {
                neighbourPairs.add(pairKey(cell, right, cellCount));
            }
            if (down !== cell) {
                neighbourPairs.add(pairKey(cell, down, cellCount));
            }

            if (!hasRight || !hasDown) {
                continue;
            }
            const diagonal = lookup[index + worldSize + 1];
            if (cell === right && down === diagonal) {
                continue;
            }
            for (const triple of tripleCandidates(cell, right, down, diagonal)) {
                const key = tripleKey(triple, cellCount);
                const window = vertexWindows.get(key);
                if (window) {
                    window.sumX += x + 0.5;
                    window.sumY += y + 0.5;
                    window.count++;
                } else {
                    vertexWindows.set(key, { sumX: x + 0.5, sumY: y + 0.5, count: 1 });
                }
            }
        }
    }

    const neighbours: number[][] = Array.from({ length: cellCount }, () => []);
    for (const key of neighbourPairs) {
        const a = Math.floor(key / cellCount);
        const b = key % cellCount;
        neighbours[a].push(b);
        neighbours[b].push(a);
    }
    for (const list of neighbours) {
        list.sort((a, b) => a - b);
    }

    const vertices: VoronoiVertex[] = [];
    for (const [key, window] of vertexWindows) {
        const cells = unpackTriple(key, cellCount);
        const meanX = window.sumX / window.count;
        const meanY = window.sumY / window.count;
        const centre = circumcentre(points[cells[0]], points[cells[1]], points[cells[2]]);
        if (!centre || Math.hypot(centre.x - meanX, centre.y - meanY) > VERTEX_TOLERANCE) {
            vertices.push({ x: meanX, y: meanY, cells });
        } else if (isEmptyCircle(centre, cells, points, neighbours)) {
            vertices.push({ x: centre.x, y: centre.y, cells });
        }
    }
    vertices.sort((a, b) => a.cells[0] - b.cells[0] || a.cells[1] - b.cells[1] || a.cells[2] - b.cells[2]);

    return { area, neighbours, vertices };
}

function pairKey(a: number, b: number, cellCount: number) {
    return a < b ? a * cellCount + b : b * cellCount + a;
}

function tripleKey([a, b, c]: [number, number, number], cellCount: number) {
    return (a * cellCount + b) * cellCount + c;
}

function unpackTriple(key: number, cellCount: number): [number, number, number] {
    const c = key % cellCount;
    const rest = Math.floor(key / cellCount);
    return [Math.floor(rest / cellCount), rest % cellCount, c];
}

function tripleCandidates(a: number, b: number, c: number, d: number): [number, number, number][] {
    const labels = [...new Set([a, b, c, d])].sort((x, y) => x - y);
    if (labels.length < 3) {
        return [];
    }
    if (labels.length === 3) {
        return [[labels[0], labels[1], labels[2]]];
    }
    const [p, q, r, s] = labels;
    return [[p, q, r], [p, q, s], [p, r, s], [q, r, s]];
}

function isEmptyCircle(centre: Point, cells: [number, number, number], points: Point[], neighbours: number[][]) {
    const radiusSquared = distanceSquared(points[cells[0]], centre.x, centre.y);
    for (const cell of cells) {
        for (const other of neighbours[cell]) {
            if (other === cells[0] || other === cells[1] || other === cells[2]) {
                continue;
            }
            if (distanceSquared(points[other], centre.x, centre.y) < radiusSquared - EMPTY_CIRCLE_EPSILON) {
                return false;
            }
        }
    }
    return true;
}

function circumcentre(a: Point, b: Point, c: Point): Point | undefined {
    const bx = b.x - a.x;
    const by = b.y - a.y;
    const cx = c.x - a.x;
    const cy = c.y - a.y;
    const determinant = 2 * (bx * cy - by * cx);
    if (Math.abs(determinant) < 1e-9) {
        return undefined;
    }
    const bLength = bx * bx + by * by;
    const cLength = cx * cx + cy * cy;
    return {
        x: a.x + (cy * bLength - by * cLength) / determinant,
        y: a.y + (bx * cLength - cx * bLength) / determinant,
    };
}
