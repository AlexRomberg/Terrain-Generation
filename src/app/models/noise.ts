const HASH_X = 0.3183099;
const HASH_Y = 0.3678794;

export function gradientNoise(x: number, y: number) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const fracX = x - cellX;
  const fracY = y - cellY;
  const blendX = fracX * fracX * fracX * (fracX * (fracX * 6 - 15) + 10);
  const blendY = fracY * fracY * fracY * (fracY * (fracY * 6 - 15) + 10);

  const a = cornerValue(cellX, cellY, fracX, fracY);
  const b = cornerValue(cellX + 1, cellY, fracX - 1, fracY);
  const c = cornerValue(cellX, cellY + 1, fracX, fracY - 1);
  const d = cornerValue(cellX + 1, cellY + 1, fracX - 1, fracY - 1);

  return a + blendX * (b - a) + blendY * (c - a) + blendX * blendY * (a - b - c + d);
}

function cornerValue(cellX: number, cellY: number, offsetX: number, offsetY: number) {
  const hashX = cellX * HASH_X + HASH_Y;
  const hashY = cellY * HASH_Y + HASH_X;
  const seed = fract(hashX * hashY * (hashX + hashY));
  const gradientX = -1 + 2 * fract(16 * HASH_X * seed);
  const gradientY = -1 + 2 * fract(16 * HASH_Y * seed);
  return gradientX * offsetX + gradientY * offsetY;
}

function fract(value: number) {
  return value - Math.floor(value);
}
