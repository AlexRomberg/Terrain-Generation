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
