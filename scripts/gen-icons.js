// gen-icons.js —— 纯 Node 生成 PWA 图标（无第三方依赖）：粉嫩渐变 + 白色爱心
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT, { recursive: true });

let _table = null;
function crc32(buf) {
  if (!_table) {
    _table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      _table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = _table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; raw[o++] = rgba[i + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function makeIcon(size, opts) {
  opts = opts || {};
  const rounded = opts.rounded !== false;
  const heartScale = opts.heartScale || 0.26;
  const top = hex('#ffd3e0'), bottom = hex('#ff8fab');
  const white = [255, 255, 255];
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size * 0.56, s = size * heartScale;
  const r = 0.24;
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const bg = lerp(top, bottom, t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let alpha = 1;
      if (rounded) {
        const nx = x / size * 2 - 1, ny = y / size * 2 - 1;
        const qx = Math.abs(nx), qy = Math.abs(ny);
        const hx = 1 - r, hy = 1 - r;
        let d;
        if (qx >= hx && qy >= hy) d = Math.sqrt((qx - hx) ** 2 + (qy - hy) ** 2) - r;
        else if (qx > hx) d = qx - hx - r;
        else if (qy > hy) d = qy - hy - r;
        else d = -r;
        alpha = clamp01(0.5 - d);
      }
      const hx = (x - cx) / s, hy = (y - cy) / s;
      const f = (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy * hy * hy;
      const wa = clamp01(0.5 - f * 2);
      const col = [bg[0] + (white[0] - bg[0]) * wa, bg[1] + (white[1] - bg[1]) * wa, bg[2] + (white[2] - bg[2]) * wa];
      rgba[i] = Math.round(col[0]); rgba[i + 1] = Math.round(col[1]); rgba[i + 2] = Math.round(col[2]);
      rgba[i + 3] = Math.round(255 * alpha);
    }
  }
  return encodePNG(size, size, rgba);
}

fs.writeFileSync(path.join(OUT, 'icon-192.png'), makeIcon(192));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), makeIcon(512));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), makeIcon(512, { heartScale: 0.2 }));
fs.writeFileSync(path.join(OUT, 'apple-touch-180.png'), makeIcon(180, { rounded: false }));
console.log('icons generated ->', OUT);
