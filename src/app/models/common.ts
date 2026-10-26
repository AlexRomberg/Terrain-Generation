export interface VoronoiResult {
    points: { x: number; z: number }[];
    lookup: number[];
}

export function calculateVoronoi(points: { x: number; z: number }[], width: number, height: number) {
    return {
        points,
        lookup: new Array(width * height).fill(0).map((_, index) => {
            const x = index % width;
            const z = Math.floor(index / width);
            let closestPointIndex = 0;
            let closestDistanceSquared = Number.POSITIVE_INFINITY;

            for (let i = 0; i < points.length; i++) {
                const dx = x - points[i].x;
                const dz = z - points[i].z;
                const distanceSquared = dx * dx + dz * dz;

                if (distanceSquared < closestDistanceSquared) {
                    closestDistanceSquared = distanceSquared;
                    closestPointIndex = i;
                }
            }

            return closestPointIndex;
        }),
    };
}