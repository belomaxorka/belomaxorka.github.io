// PNG без зависимостей: читает снимок Chrome (8 бит, RGB или RGBA, без interlace) и пишет его палитрой на 256
// цветов (median cut по всем цветам снимка, без дизеринга), deflate 9. Для превью 1200×630: ~4 раза меньше.
import { inflateSync, deflateSync, crc32 } from 'node:zlib';

export function pack(png, colors = 256) {
  const { width, height, rgb } = decode(png);
  const { palette, index } = quantize(rgb, colors);
  return encode(width, height, palette, index);
}

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let off = 8, width, height, depth, type, interlace;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), kind = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') [width, height, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    if (kind === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6) || interlace) throw new Error(`unsupported png: depth ${depth}, type ${type}`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp] : 0, b = y ? px[prev + x] : 0, c = x >= bpp && y ? px[prev + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[row + x] = v;
    }
  }
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < px.length; i += bpp, j += 3) rgb.set(px.subarray(i, i + 3), j);
  return { width, height, rgb };
}

// Median cut: делит коробку цветов с наибольшим «весом × разбросом» пополам по самой длинной оси.
function quantize(rgb, colors) {
  const count = new Map();
  for (let i = 0; i < rgb.length; i += 3) {
    const c = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    count.set(c, (count.get(c) || 0) + 1);
  }
  const all = [...count.entries()];
  const box = (items) => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    let n = 0;
    for (const [c, k] of items) {
      const ch = [c >> 16, (c >> 8) & 255, c & 255];
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], ch[a]); hi[a] = Math.max(hi[a], ch[a]); }
      n += k;
    }
    const range = hi.map((h, a) => h - lo[a]), axis = range.indexOf(Math.max(...range));
    return { items, n, axis, score: items.length > 1 ? n * range[axis] : -1 };
  };
  const boxes = [box(all)];
  while (boxes.length < colors) {
    const i = boxes.reduce((best, b, j) => (b.score > boxes[best].score ? j : best), 0), b = boxes[i];
    if (b.score <= 0) break;
    const shift = 16 - 8 * b.axis, ch = (c) => (c >> shift) & 255;
    b.items.sort((x, y) => ch(x[0]) - ch(y[0]));
    let half = 0, cut = 0;
    while (cut < b.items.length - 1 && (half += b.items[cut][1]) < b.n / 2) cut++;
    cut = Math.min(Math.max(cut, 0), b.items.length - 2) + 1;
    boxes.splice(i, 1, box(b.items.slice(0, cut)), box(b.items.slice(cut)));
  }
  const palette = boxes.map(({ items, n }) => {
    const s = [0, 0, 0];
    for (const [c, k] of items) { s[0] += (c >> 16) * k; s[1] += ((c >> 8) & 255) * k; s[2] += (c & 255) * k; }
    return s.map((v) => Math.round(v / n));
  });
  const nearest = new Map();
  for (const [c] of all) {
    const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
    let best = 0, bd = Infinity;
    palette.forEach(([pr, pg, pb], i) => { const d = (r - pr) ** 2 * 2 + (g - pg) ** 2 * 4 + (b - pb) ** 2 * 3; if (d < bd) { bd = d; best = i; } });
    nearest.set(c, best);
  }
  const index = new Uint8Array(rgb.length / 3);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j++) index[j] = nearest.get((rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2]);
  return { palette, index };
}

function encode(width, height, palette, index) {
  const chunk = (kind, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(kind, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 3, 0, 0, 0], 8);
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) rows.set(index.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flat())),
    chunk('IDAT', deflateSync(rows, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
