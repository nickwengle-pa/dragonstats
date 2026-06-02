/**
 * Zero-dependency favicon generator for Dragon Stats.
 *
 * Rasterizes the "stat bars on a gold axis" mark (same geometry as
 * public/favicon.svg) into PNGs using only Node's built-in zlib, then packs
 * them into a real multi-size favicon.ico. Also emits apple-touch-icon.png and
 * a large preview.
 *
 * Run:  node scripts/generate-favicon.cjs
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const PUBLIC = path.join(__dirname, "..", "public");
const PREVIEW = path.join(__dirname, "favicon-preview.png");

// ── Design geometry, in a 512x512 coordinate space ──────────────────────────
const VB = 512;
const BG_R = 110;       // background corner radius
const BAR_R = 14;       // bar top-corner radius
const BASELINE = 412;   // bars sit here, on top of the axis

// bars: [x0, top, x1] — bottom is BASELINE
const BARS = [
  { x0: 128, y0: 296, x1: 202 },
  { x0: 240, y0: 232, x1: 314 },
  { x0: 352, y0: 152, x1: 426 },
];

// gold L-axis (vertical + horizontal), as thick round-capped segments
const AXIS = [
  [[98, 124], [98, 420]],   // vertical
  [[98, 420], [430, 420]],  // horizontal
];
const AXIS_HALF = 8;        // half axis stroke width
const AXIS_ORIGIN = [98, 420];
const AXIS_FAR = [430, 124];
const AXIS_LEN2 = (AXIS_FAR[0] - AXIS_ORIGIN[0]) ** 2 + (AXIS_FAR[1] - AXIS_ORIGIN[1]) ** 2;

// Multi-stop gradients: [offset 0..1, [r,g,b]]
const BG_STOPS = [[0, [61, 20, 24]], [0.55, [20, 10, 12]], [1, [6, 5, 7]]];
const BAR_STOPS = [[0, [251, 107, 107]], [0.55, [224, 51, 47]], [1, [127, 29, 29]]];
const GOLD_A = [245, 158, 11];  // amber, at the axis corner
const GOLD_B = [253, 224, 71];  // bright gold, at the axis ends
const BG_FOCAL = [256, 297];
const BG_RADIUS = 369;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

function gstops(t, stops) {
  if (t <= stops[0][0]) return stops[0][1].slice();
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const u = (t - a[0]) / (b[0] - a[0]);
      return [lerp(a[1][0], b[1][0], u), lerp(a[1][1], b[1][1], u), lerp(a[1][2], b[1][2], u)];
    }
  }
  return stops[stops.length - 1][1].slice();
}

function rrDist(px, py, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2, hy = (y1 - y0) / 2;
  const qx = Math.abs(px - cx) - (hx - r);
  const qy = Math.abs(py - cy) - (hy - r);
  const ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}
function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp01(t);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// Bar with rounded TOP corners and square bottom (sits flat on the axis).
function inBar(px, py, b) {
  if (px < b.x0 || px > b.x1 || py < b.y0 || py > BASELINE) return false;
  if (py < b.y0 + BAR_R) {
    if (px < b.x0 + BAR_R) return Math.hypot(px - (b.x0 + BAR_R), py - (b.y0 + BAR_R)) <= BAR_R;
    if (px > b.x1 - BAR_R) return Math.hypot(px - (b.x1 - BAR_R), py - (b.y0 + BAR_R)) <= BAR_R;
  }
  return true;
}

// Opaque composited color at a point inside the icon, or null if outside.
function colorAt(fx, fy) {
  if (rrDist(fx, fy, 0, 0, VB, VB, BG_R) > 0) return null;
  // background — soft radial red glow
  const bd = Math.hypot(fx - BG_FOCAL[0], fy - BG_FOCAL[1]);
  let col = gstops(clamp01(bd / BG_RADIUS), BG_STOPS);
  // gold axis (drawn under the bars)
  if (AXIS.some((s) => segDist(fx, fy, s[0], s[1]) <= AXIS_HALF)) {
    const tl = clamp01(
      ((fx - AXIS_ORIGIN[0]) * (AXIS_FAR[0] - AXIS_ORIGIN[0]) +
        (fy - AXIS_ORIGIN[1]) * (AXIS_FAR[1] - AXIS_ORIGIN[1])) / AXIS_LEN2,
    );
    col = [lerp(GOLD_A[0], GOLD_B[0], tl), lerp(GOLD_A[1], GOLD_B[1], tl), lerp(GOLD_A[2], GOLD_B[2], tl)];
  }
  // bars on top — richer 3-stop vertical red gradient (per bar)
  for (const b of BARS) {
    if (inBar(fx, fy, b)) {
      col = gstops(clamp01((fy - b.y0) / (BASELINE - b.y0)), BAR_STOPS);
    }
  }
  return col;
}

// Render to straight-alpha RGBA via supersampling (handles anti-aliasing).
function render(size) {
  const SS = 4, scale = VB / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, inside = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) * scale;
          const fy = (y + (sy + 0.5) / SS) * scale;
          const c = colorAt(fx, fy);
          if (c) { r += c[0]; g += c[1]; b += c[2]; inside++; }
        }
      }
      const n = SS * SS, i = (y * size + x) * 4;
      if (inside > 0) {
        out[i] = Math.round(r / inside);
        out[i + 1] = Math.round(g / inside);
        out[i + 2] = Math.round(b / inside);
        out[i + 3] = Math.round((inside / n) * 255);
      }
    }
  }
  return out;
}

// ── PNG encoder ─────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(rgba, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ── ICO packer (PNG-compressed entries) ─────────────────────────────────────
function buildICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((im, i) => {
    const b = i * 16;
    dir[b] = im.size >= 256 ? 0 : im.size;
    dir[b + 1] = im.size >= 256 ? 0 : im.size;
    dir.writeUInt16LE(1, b + 4);   // color planes
    dir.writeUInt16LE(32, b + 6);  // bits per pixel
    dir.writeUInt32LE(im.png.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += im.png.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.png)]);
}

// ── Emit ────────────────────────────────────────────────────────────────────
const icoSizes = [16, 32, 48, 64];
const icoImages = icoSizes.map((s) => ({ size: s, png: encodePNG(render(s), s, s) }));
fs.writeFileSync(path.join(PUBLIC, "favicon.ico"), buildICO(icoImages));
fs.writeFileSync(path.join(PUBLIC, "apple-touch-icon.png"), encodePNG(render(180), 180, 180));
fs.writeFileSync(PREVIEW, encodePNG(render(256), 256, 256));

console.log("Wrote public/favicon.ico (" + icoSizes.join("/") + "), public/apple-touch-icon.png, and scripts/favicon-preview.png");
