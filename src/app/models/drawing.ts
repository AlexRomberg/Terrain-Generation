import { Vector2 } from "three";
import { LayerImage } from "./layerImage";
import { VoronoiResult } from "./common";
import Srand from "seeded-rand";

const RED: [number, number, number] = [255, 0, 0];

export interface PointDrawOptions {
    color?: [number, number, number];
    strokeWidth?: number;
}

export interface VectorDrawOptions extends PointDrawOptions {
    scale?: number;
}

export function drawPixel(image: LayerImage, x: number, y: number, options: PointDrawOptions = {}) {
    if (!image.color) {
        return;
    }

    const radius = Math.ceil((options.strokeWidth || 1) / 2);
    const radiusSquared = radius * radius;
    const roundedX = Math.round(x);
    const roundedY = Math.round(y);
    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            if ((roundedX + i) < 0 || (roundedX + i) >= image.size || (roundedY + j) < 0 || (roundedY + j) >= image.size) {
                continue;
            }

            if (i * i + j * j > radiusSquared) {
                continue;
            }
            const color = options.color ?? RED;

            const colorIndex = ((roundedX + i) + (roundedY + j) * image.size) * 3;
            image.color.set(color, colorIndex);
        }
    }
}

export function drawLine(image: LayerImage, fromX: number, fromY: number, toX: number, toY: number, options: PointDrawOptions = {}) {
    if (!image.color) {
        return;
    }

    const dx = toX - fromX;
    const dy = toY - fromY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));

    for (let step = 0; step <= steps; step++) {
        const x = Math.round(fromX + (dx * step) / steps);
        const y = Math.round(fromY + (dy * step) / steps);
        drawPixel(image, x, y, options);
    }
}

export function drawVector(image: LayerImage, vector: Vector2, x: number, y: number, options: VectorDrawOptions = {}) {
    if (!image.color) {
        return;
    }

    const strokeWidth = options.strokeWidth ?? 1;
    const factor = options.scale ?? 1;
    const arrowHeadLength = 4 * strokeWidth;
    const arrowHeadAngle = Math.PI / 6;

    const angle = Math.atan2(vector.y, vector.x);
    const leftAngle = angle + Math.PI - arrowHeadAngle;
    const rightAngle = angle + Math.PI + arrowHeadAngle;

    const leftX = x + vector.x * factor + arrowHeadLength * Math.cos(leftAngle);
    const leftY = y + vector.y * factor + arrowHeadLength * Math.sin(leftAngle);
    const rightX = x + vector.x * factor + arrowHeadLength * Math.cos(rightAngle);
    const rightY = y + vector.y * factor + arrowHeadLength * Math.sin(rightAngle);

    drawLine(image, x + vector.x * factor, y + vector.y * factor, leftX, leftY, options);
    drawLine(image, x + vector.x * factor, y + vector.y * factor, rightX, rightY, options);
    drawLine(image, x, y, x + vector.x * factor, y + vector.y * factor, options);
}

export function drawVoronoi(image: LayerImage, voronoi: VoronoiResult) {
    const rnd = new Srand(0);

    if (!image.color) {
        return;
    }

    const colors = voronoi.points.map(() => [rnd.intInRange(0, 255), rnd.intInRange(0, 255), rnd.intInRange(0, 255)] as [number, number, number]);
    for (let i = 0; i < voronoi.lookup.length; i++) {
        image.color.set(colors[voronoi.lookup[i]], i * 3);
    }

    for (const p of voronoi.points) {
        drawPixel(image, p.x, p.y, { color: [255, 0, 0], strokeWidth: 10 });
    }
}