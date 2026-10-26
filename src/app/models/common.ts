export interface VoronoiResult {
    points: { x: number; y: number }[];
    lookup: number[];
}

export function calculateVoronoi(points: { x: number; y: number }[], size: number) {
    return {
        points,
        lookup: new Array(size * size).fill(0).map((_, index) => {
            const x = index % size;
            const y = Math.floor(index / size);
            let closestPointIndex = 0;
            let closestDistanceSquared = Number.POSITIVE_INFINITY;

            for (let i = 0; i < points.length; i++) {
                const dx = x - points[i].x;
                const dy = y - points[i].y;
                const distanceSquared = dx * dx + dy * dy;

                if (distanceSquared < closestDistanceSquared) {
                    closestDistanceSquared = distanceSquared;
                    closestPointIndex = i;
                }
            }

            return closestPointIndex;
        }),
    };
}