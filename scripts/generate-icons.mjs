// Generates the PWA PNG icons from the LIQUEAMP favicon design
// (public/favicon.svg) without any image dependencies: the mark is a few
// rectangles and a circle, rasterized here with 4×4 supersampling.
//
//   node scripts/generate-icons.mjs
//
// Output: public/icons/*.png (committed, so builds need no extra tooling).
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0b, 0x10, 0x0e];
const ORANGE = [0xff, 0x7a, 0x3d];
const GREEN = [0x8f, 0xcf, 0xa9];

/** Paint order of favicon.svg in its 64×64 space; returns a color or null. */
function paint(x, y, withFrame) {
  if (x < 0 || y < 0 || x > 64 || y > 64) return null;
  if ((x - 44) ** 2 + (y - 20) ** 2 <= 16) return GREEN; // circle r=4
  const inRect = (x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  // "L" path, stroke 7, square caps: M20 16 v32 h24
  if (inRect(16.5, 12.5, 23.5, 51.5) || inRect(16.5, 44.5, 47.5, 51.5)) return ORANGE;
  // frame: rect x4 y4 56×56, stroke 3
  if (withFrame && inRect(2.5, 2.5, 61.5, 61.5) && !inRect(5.5, 5.5, 58.5, 58.5)) return ORANGE;
  return BG;
}

/**
 * @param size   output pixels
 * @param scale  how much of the icon the 64-unit design fills (maskable icons
 *               keep content inside the 80% safe circle)
 */
function render(size, { scale = 1, withFrame = true } = {}) {
  const S = 4;
  const px = Buffer.alloc(size * size * 4);
  const unit = (size * scale) / 64;
  const offset = (size - size * scale) / 2;
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (pxl + (sx + 0.5) / S - offset) / unit;
          const y = (py + (sy + 0.5) / S - offset) / unit;
          const c = paint(x, y, withFrame) ?? BG;
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (py * size + pxl) * 4;
      px[i] = Math.round(r / (S * S));
      px[i + 1] = Math.round(g / (S * S));
      px[i + 2] = Math.round(b / (S * S));
      px[i + 3] = 255;
    }
  }
  return png(size, size, px);
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

function png(w, h, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
const icons = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  // maskable: full-bleed background, mark inside the safe zone, no frame (it would be cropped)
  'icon-maskable-512.png': render(512, { scale: 0.85, withFrame: false }),
  'apple-touch-icon.png': render(180),
};
for (const [name, data] of Object.entries(icons)) {
  writeFileSync(new URL(name, out), data);
  console.log(`${name}  ${data.length} bytes`);
}
