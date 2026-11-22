export function downsample(field: Float32Array, size: number, n: number) {
  const stride = strideOf(size, n);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[x + y * n] = field[x * stride + y * stride * size];
    }
  }
  return out;
}

export function upsampleBilinear(field: Float32Array, n: number, size: number) {
  if (n === size) {
    return field.slice();
  }
  const scale = (n - 1) / (size - 1);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const y0 = Math.min(Math.floor(fy), n - 2);
    const ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const x0 = Math.min(Math.floor(fx), n - 2);
      const tx = fx - x0;
      const i = x0 + y0 * n;
      const top = field[i] + (field[i + 1] - field[i]) * tx;
      const bottom = field[i + n] + (field[i + n + 1] - field[i + n]) * tx;
      out[x + y * size] = top + (bottom - top) * ty;
    }
  }
  return out;
}

function strideOf(size: number, n: number) {
  if (n < 2 || n > size || (size - 1) % (n - 1) !== 0) {
    throw new Error(`Cannot resample a ${size} grid to ${n}`);
  }
  return (size - 1) / (n - 1);
}
