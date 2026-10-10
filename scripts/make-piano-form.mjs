#!/usr/bin/env node
// Derive the statement card's PARTICLE SOURCE from Karel's 1919 piano photo
// (Karel 2026-10-09: "the burning piano … detailed and clear").
//
// The photo's mahogany cabinet is as dark as the room behind it (mean
// luminance 0.03 vs 0.04), and particle sampling follows brightness — so the
// field formed only the flames and the keys. This writes
// public/tramokyo-pack/emblems/piano-1919-form.jpg:
//   • cropped to the piano + candles + fire (the form fills the plane);
//   • the room, floor and smoke → black (no motes off the instrument);
//   • the cabinet silhouette filled with lifted mahogany, its carvings, panel
//     lines, keys and legs drawn as warm gold edges (Sobel of a stretched image);
//   • flames + candles kept in their own colours, highlights compressed so
//     they no longer take most of the samples.
// Usage: node scripts/make-piano-form.mjs
import sharp from "sharp";

const SRC = "public/tramokyo-pack/emblems/piano-1919.jpg";
const OUT = "public/tramokyo-pack/emblems/piano-1919-form.jpg";
// content box in the 1024² source (flame tips → feet, arm → right side)
const CROP = { left: 205, top: 150, width: 590, height: 805 };
// the upright's silhouette (source coordinates): cabinet, keyboard arm, left leg + foot
const BODY = [
  [295, 498, 776, 702], // cabinet: top board → keyboard
  [338, 700, 770, 942], // cabinet: lower panel → plinth (recessed behind the leg)
  [224, 588, 330, 702], // left cheek / keyboard arm
  [244, 690, 306, 918], // left leg + foot
];
const inRect = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const L = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) L[i] = (0.2126 * data[i * C] + 0.7152 * data[i * C + 1] + 0.0722 * data[i * C + 2]) / 255;
// stretched luminance inside the cabinet (its detail lives in 0.02–0.2)
const S = (x, y) => Math.min(1, L[y * W + x] * 5);
const out = Buffer.alloc(W * H * 3);
const ss = (e0, e1, v) => { const u = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const i = y * W + x;
  const r0 = data[i * C] / 255, g0 = data[i * C + 1] / 255, b0 = data[i * C + 2] / 255;
  const l = L[i];
  let r = 0, g = 0, b = 0;
  // fire + candles: bright light above the cabinet, own colour, highlights compressed
  // (smoke, ~0.1–0.3, stays dark; the floor embers bottom-right are dropped)
  const light = ss(0.3, 0.5, l) * (y < 520 || (l > 0.45 && x < 755) ? 1 : 0);
  if (light > 0) {
    const k = Math.min(1, 0.82 / Math.max(l, 1e-3)) * (0.55 + 0.45 * light);
    r = r0 * k; g = g0 * k; b = b0 * k;
  }
  const cab = inRect(BODY[0], x, y) || inRect(BODY[1], x, y), limb = !cab && (inRect(BODY[2], x, y) || inRect(BODY[3], x, y));
  if (cab || limb) {
    const gx = S(x + 1, y - 1) + 2 * S(x + 1, y) + S(x + 1, y + 1) - S(x - 1, y - 1) - 2 * S(x - 1, y) - S(x - 1, y + 1);
    const gy = S(x - 1, y + 1) + 2 * S(x, y + 1) + S(x + 1, y + 1) - S(x - 1, y - 1) - 2 * S(x, y - 1) - S(x + 1, y - 1);
    const e = ss(0.12, 0.7, Math.hypot(gx, gy) / 4);
    // arm + leg rects also hold room: fill only mahogany (red ≫ green) or drawn edges there
    const wood = r0 > 0.045 && r0 > 2.3 * g0;
    if (limb && !wood && e < 0.25) { out[i * 3] = Math.round(Math.min(1, r) * 255); out[i * 3 + 1] = Math.round(Math.min(1, g) * 255); out[i * 3 + 2] = Math.round(Math.min(1, b) * 255); continue; }
    const body = 0.24 + 0.5 * Math.min(1, l * 4); // lifted mahogany, carvings brighter
    // mahogany fill + gold edges; the keys / brass keep their own light
    r = Math.max(r, 0.62 * body + 0.95 * e, r0);
    g = Math.max(g, 0.26 * body + 0.66 * e, g0);
    b = Math.max(b, 0.1 * body + 0.32 * e, b0);
  }
  out[i * 3] = Math.round(Math.min(1, r) * 255);
  out[i * 3 + 1] = Math.round(Math.min(1, g) * 255);
  out[i * 3 + 2] = Math.round(Math.min(1, b) * 255);
}
await sharp(out, { raw: { width: W, height: H, channels: 3 } }).extract(CROP).jpeg({ quality: 92 }).toFile(OUT);
console.log(`wrote ${OUT} (${CROP.width}×${CROP.height}, aspect ${(CROP.width / CROP.height).toFixed(3)})`);
