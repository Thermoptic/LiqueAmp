// Splits the LIQUEAMP logo (src/assets/logo/source.png, white on transparent)
// into two alpha masks so the app can colour them from the active theme:
//   body.png — the play triangle and the drop shape
//   note.png — the music note
// The note is its own connected shape in the artwork (separated from the rest
// by transparent gaps), so the split is exact; anti-aliased edge pixels go to
// the nearest shape. Output is cropped to the artwork and made square.
//
//   node scripts/split-logo.mjs
//
// No image dependencies: minimal PNG decode/encode (8-bit RGBA) below.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const DIR = new URL('../src/assets/logo/', import.meta.url);

function decode(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) throw new Error('source.png must be 8-bit RGBA, non-interlaced');
    }
    if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y ? px[(y - 1) * stride + x - 4] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px };
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encode(w, h, px) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const { w, h, px } = decode(readFileSync(new URL('source.png', DIR)));
// The artwork has invisible noise (alpha 1–3, under 1.2% coverage) scattered
// over the whole canvas; treat it as transparent so the crop fits the logo.
const NOISE = 4;
const alpha = (i) => (px[i * 4 + 3] < NOISE ? 0 : px[i * 4 + 3]);

// 1. connected shapes of the solid part of the artwork
const SOLID = 32;
const label = new Int32Array(w * h).fill(-1);
const sizes = [];
for (let s = 0; s < w * h; s++) {
  if (label[s] >= 0 || alpha(s) < SOLID) continue;
  const id = sizes.length;
  const stack = [s];
  label[s] = id;
  let n = 0;
  while (stack.length) {
    const i = stack.pop();
    n++;
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (label[j] < 0 && alpha(j) >= SOLID) {
        label[j] = id;
        stack.push(j);
      }
    }
  }
  sizes.push(n);
}
const shapes = sizes.map((n, id) => ({ id, n })).filter((s) => s.n > 100);
if (shapes.length !== 3) throw new Error(`expected 3 shapes (triangle, drop, note), found ${shapes.length}`);

// the note is the shape furthest to the bottom-right
const centroid = (id) => {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) if (label[i] === id) (sx += i % w), (sy += (i / w) | 0), n++;
  return (sx + sy) / n;
};
const noteId = shapes.reduce((best, s) => (centroid(s.id) > centroid(best.id) ? s : best)).id;

// 2. faint anti-aliasing pixels join the nearest shape (breadth-first growth)
let frontier = [];
for (let i = 0; i < w * h; i++) if (label[i] >= 0) frontier.push(i);
while (frontier.length) {
  const next = [];
  for (const i of frontier) {
    const x = i % w;
    const y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (label[j] < 0 && alpha(j) > 0) {
        label[j] = label[i];
        next.push(j);
      }
    }
  }
  frontier = next;
}

// 3. crop to the artwork (+ margin), square canvas, write two alpha masks
let x0 = w;
let y0 = h;
let x1 = 0;
let y1 = 0;
for (let i = 0; i < w * h; i++) {
  if (alpha(i) === 0) continue;
  const x = i % w;
  const y = (i / w) | 0;
  x0 = Math.min(x0, x);
  x1 = Math.max(x1, x);
  y0 = Math.min(y0, y);
  y1 = Math.max(y1, y);
}
const MARGIN = 4;
const side = Math.max(x1 - x0, y1 - y0) + 1 + MARGIN * 2;
const ox = x0 - MARGIN - Math.floor((side - MARGIN * 2 - (x1 - x0 + 1)) / 2);
const oy = y0 - MARGIN - Math.floor((side - MARGIN * 2 - (y1 - y0 + 1)) / 2);

for (const [name, keep] of [
  ['body.png', (id) => id >= 0 && id !== noteId],
  ['note.png', (id) => id === noteId],
]) {
  const out = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const sx = x + ox;
      const sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = sy * w + sx;
      if (!keep(label[i])) continue;
      const o = (y * side + x) * 4;
      // white, original coverage — the app recolours it through a CSS mask
      out[o] = out[o + 1] = out[o + 2] = 255;
      out[o + 3] = alpha(i);
    }
  }
  writeFileSync(new URL(name, DIR), encode(side, side, out));
  console.log(`${name}  ${side}×${side}`);
}
