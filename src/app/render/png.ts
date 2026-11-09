const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const COLOR_TYPE_GRAY = 0;
const FILTER_SUB = 1;

export interface PngImage {
  width: number;
  height: number;
  bitDepth: 8 | 16;
  writeRow: (row: number, target: Uint8Array) => void;
}

export async function encodePng({ width, height, bitDepth, writeRow }: PngImage) {
  const bytesPerPixel = bitDepth / 8;
  const rowLength = width * bytesPerPixel;
  const raw = new Uint8Array((rowLength + 1) * height);
  const row = new Uint8Array(rowLength);

  for (let y = 0; y < height; y++) {
    writeRow(y, row);
    const offset = y * (rowLength + 1);
    raw[offset] = FILTER_SUB;
    for (let i = 0; i < rowLength; i++) {
      raw[offset + 1 + i] = row[i] - (i >= bytesPerPixel ? row[i - bytesPerPixel] : 0);
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = bitDepth;
  header[9] = COLOR_TYPE_GRAY;

  const compressed = await deflate(raw);
  return new Blob(
    [new Uint8Array(SIGNATURE), chunk('IHDR', header), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())],
    { type: 'image/png' },
  );
}

async function deflate(data: Uint8Array) {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function chunk(type: string, data: Uint8Array) {
  const bytes = new Uint8Array(12 + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) {
    bytes[4 + i] = type.charCodeAt(i);
  }
  bytes.set(data, 8);
  view.setUint32(8 + data.length, crc32(bytes.subarray(4, 8 + data.length)));
  return bytes;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
