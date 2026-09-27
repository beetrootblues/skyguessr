#!/usr/bin/env node
/* Pure-Node PNG generator for SKYQ — no dependencies.
   Brand: paper bg #f4f1ea, navy #0e1b2c, sky #2e86de, gold #f2b632. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAVY = [14, 27, 44], SKY = [46, 134, 222], GOLD = [242, 182, 50],
  PAPER = [244, 241, 234], CLOUD = [208, 222, 238], MIST = [150, 160, 175],
  WHITE = [255, 255, 255];

const out = process.argv[2] || 'assets/icons';
fs.mkdirSync(out, { recursive: true });

// ---------- minimal PNG encoder (RGBA, filter 0) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- pixel canvas ----------
function canvas(w, h, bg) {
  const b = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { b[i * 4] = bg[0]; b[i * 4 + 1] = bg[1]; b[i * 4 + 2] = bg[2]; b[i * 4 + 3] = 255; }
  return { w, h, buf: b };
}
function px(c, x, y, col, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const k = Math.max(0, Math.min(1, a === undefined ? 1 : a));
  const i = (y * c.w + x) * 4;
  c.buf[i] = Math.round(col[0] * k + c.buf[i] * (1 - k));
  c.buf[i + 1] = Math.round(col[1] * k + c.buf[i + 1] * (1 - k));
  c.buf[i + 2] = Math.round(col[2] * k + c.buf[i + 2] * (1 - k));
  c.buf[i + 3] = 255;
}
function disc(c, cx, cy, r, col, a) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r) - 1; y <= cy + r + 1; y++)
    for (let x = Math.floor(cx - r) - 1; x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) px(c, x, y, col, a);
    }
}
function ring(c, cx, cy, r, w, col, a) {
  const o = r + w / 2, i = Math.max(0, r - w / 2);
  for (let y = Math.floor(cy - o) - 1; y <= cy + o + 1; y++)
    for (let x = Math.floor(cx - o) - 1; x <= cx + o + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy;
      if (d <= o * o && d >= i * i) px(c, x, y, col, a);
    }
}
function rect(c, x0, y0, w, h, col, a) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(c, x, y, col, a);
}

// 5x7 bitmap font
const F = {
  '3': ['11111', '00001', '00110', '00010', '01100', '10000', '11111'],
  'K': ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  'Q': ['01110', '10001', '10001', '10001', '10101', '01110', '00011'],
  'S': ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
  'Y': ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
};
function text(c, str, x0, y0, s, col, a) {
  let x = x0;
  for (const ch of str) {
    const g = F[ch];
    if (!g) { x += 2 * s; continue; }
    for (let r = 0; r < 7; r++)
      for (let cc = 0; cc < 5; cc++)
        if (g[r][cc] === '1') rect(c, x + cc * s, y0 + r * s, s, s, col, a);
    x += 6 * s;
  }
}
function textWidth(str, s) { let w = 0; for (const ch of str) w += (F[ch] ? 6 : 2) * s; return w - s; }

// ---------- brand art ----------
function glyphDark(c, cx, cy, R) {
  disc(c, cx, cy, R * 1.06, NAVY);
  ring(c, cx, cy, R, R * 0.14, WHITE, 1);
  disc(c, cx, cy, R * 0.5, SKY, 1);
  for (const f of [0.22, 0.44]) ring(c, cx, cy, R * f, R * 0.06, WHITE, 0.8);
  rect(c, cx - R * 0.045, cy - R * 0.5, R * 0.09, R, WHITE, 0.8);
  const arc = (a0, a1, rr, wd, col) => {
    for (let i = 0; i <= 44; i++) {
      const a = a0 + (a1 - a0) * (i / 44);
      disc(c, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, wd / 2, col, 0.95);
    }
  };
  arc(-0.35, 1.05, R * 0.85, R * 0.09, GOLD);
  disc(c, cx + Math.cos(-0.35) * R * 0.85, cy + Math.sin(-0.35) * R * 0.85, R * 0.12, GOLD);
  disc(c, cx + Math.cos(1.05) * R * 0.85, cy + Math.sin(1.05) * R * 0.85, R * 0.12, GOLD);
}
function paperBG(c) {
  const n = c.h;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const i = (y * c.w + x) * 4;
      const cl = Math.sin(x * 0.012 + y * 0.03) * Math.sin(x * 0.03 - y * 0.011);
      if (cl > 0.82) {
        c.buf[i] = Math.round(CLOUD[0] * 0.5 + c.buf[i] * 0.5);
        c.buf[i + 1] = Math.round(CLOUD[1] * 0.5 + c.buf[i + 1] * 0.5);
        c.buf[i + 2] = Math.round(CLOUD[2] * 0.5 + c.buf[i + 2] * 0.5);
      }
      const t = (y / n) * 0.05;
      c.buf[i] = Math.round(c.buf[i] * (1 - t));
      c.buf[i + 1] = Math.round(c.buf[i + 1] * (1 - t));
      c.buf[i + 2] = Math.round(c.buf[i + 2] * (1 - t));
    }
  }
}
function icon1024() {
  const c = canvas(1024, 1024, PAPER);
  paperBG(c);
  disc(c, 60, 60, 190, CLOUD, 0.5);
  disc(c, 964, 964, 190, CLOUD, 0.5);
  glyphDark(c, 512, 512, 330);
  return c;
}
function scaleCanvas(src, w, h) {
  const c = canvas(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = (x / w) * src.w, sy = (y / h) * src.h;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      for (let k = 0; k < 4; k++) {
        const v =
          src.buf[(y0 * src.w + x0) * 4 + k] * (1 - fx) * (1 - fy) +
          src.buf[(y0 * src.w + x1) * 4 + k] * fx * (1 - fy) +
          src.buf[(y1 * src.w + x0) * 4 + k] * (1 - fx) * fy +
          src.buf[(y1 * src.w + x1) * 4 + k] * fx * fy;
        c.buf[(y * w + x) * 4 + k] = Math.round(v);
      }
    }
  }
  return c;
}
function iconScaled(size) { return scaleCanvas(icon1024(), size, size); }
function splashLight(w, h) {
  const c = canvas(w, h, PAPER);
  paperBG(c);
  glyphDark(c, w / 2, h * 0.42, Math.min(w, h) * 0.16);
  return c;
}
function splashDark(w, h) {
  const c = canvas(w, h, NAVY);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const t = (y / h) * 0.35 + (x / w) * 0.1;
      c.buf[i] = Math.round(NAVY[0] * (1 - t) + 20 * t);
      c.buf[i + 1] = Math.round(NAVY[1] * (1 - t) + 30 * t);
      c.buf[i + 2] = Math.round(NAVY[2] * (1 - t) + 50 * t);
    }
  }
  glyphDark(c, w / 2, h * 0.42, Math.min(w, h) * 0.16);
  return c;
}
function ogCover() {
  const c = canvas(1200, 630, PAPER);
  paperBG(c);
  glyphDark(c, 190, 315, 110);
  const s = 32;
  text(c, 'SKYGUESSR', 350, 230, s, NAVY);
  text(c, 'FIND THE ROUTE', 350, 330, 18, MIST);
  return c;
}

const jobs = [
  ['icon-1024.png', () => icon1024()],
  ['icon-60@2x.png', () => iconScaled(120)],
  ['icon-60@3x.png', () => iconScaled(180)],
  ['icon-76.png', () => iconScaled(76)],
  ['icon-76@2x.png', () => iconScaled(152)],
  ['icon-83.5@2x.png', () => iconScaled(167)],
  ['icon-40@2x.png', () => iconScaled(80)],
  ['icon-40@3x.png', () => iconScaled(120)],
  ['icon-29@2x.png', () => iconScaled(58)],
  ['icon-29@3x.png', () => iconScaled(87)],
  ['icon-512.png', () => iconScaled(512)],
  ['icon-192.png', () => iconScaled(192)],
  ['icon-32.png', () => iconScaled(32)],
  ['apple-touch-icon.png', () => iconScaled(180)],
  ['og-cover.png', () => ogCover()],
  ['splash-2732.png', () => splashLight(2732, 2732)],
  ['splash-dark.png', () => splashDark(1290, 2796)],
  ['notify.png', () => { const c = canvas(96, 96, NAVY); glyphDark(c, 48, 48, 34); return c; }],
];
for (const [name, fn] of jobs) {
  const c = fn();
  fs.writeFileSync(path.join(out, name), encodePNG(c.w, c.h, c.buf));
  console.log('ok', name, c.w + 'x' + c.h);
}
console.log('done');
