/* ── 3880-conjure · Canvas2D fallback ──────────────────────────────────────
 *
 *  When navigator.gpu is unavailable, this CPU-integrates a few thousand
 *  particles through the SAME anchor-attraction + curl-noise-turbulence
 *  model as the WebGPU compute shader (gpu.ts): each particle is permanently
 *  assigned to one of the 21 hand-landmark anchors and pulled toward it with
 *  a strength that scales with coherence; low coherence swells the
 *  turbulence instead. The piece is never dead — only the particle count
 *  drops (a few thousand instead of ~18k).
 */

import type { FieldParams } from "./gpu";
import { ANCHOR_COUNT } from "./gpu";

export const FALLBACK_COUNT = 3200;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashf(x: number, y: number): number {
  let qx = (x * 0.3183099 + 0.1) % 1;
  let qy = (y * 0.3183099 + 0.1) % 1;
  if (qx < 0) qx += 1;
  if (qy < 0) qy += 1;
  qx *= 17;
  qy *= 17;
  const v = qx * qy * (qx + qy);
  return v - Math.floor(v);
}

function conjurePalette(x: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, x));
  const deep = [11, 7, 19];
  const indigo = [99, 102, 241];
  const violet = [139, 92, 246];
  const magenta = [176, 67, 224];
  const light = [196, 181, 253];
  const mix = (a: number[], b: number[], k: number): [number, number, number] => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
  if (t < 0.33) return mix(deep, indigo, t / 0.33);
  if (t < 0.66) return mix(indigo, violet, (t - 0.33) / 0.33);
  return mix(violet, mix(magenta, light, (t - 0.66) / 0.34), 1);
}

export interface FallbackState {
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  seed: Float32Array;
  anchor: Uint8Array;
}

export function createFallback(): FallbackState {
  const rand = mulberry32(0x3880);
  const px = new Float32Array(FALLBACK_COUNT);
  const py = new Float32Array(FALLBACK_COUNT);
  const vx = new Float32Array(FALLBACK_COUNT);
  const vy = new Float32Array(FALLBACK_COUNT);
  const seed = new Float32Array(FALLBACK_COUNT);
  const anchor = new Uint8Array(FALLBACK_COUNT);
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 1.1;
    px[i] = Math.cos(ang) * rad;
    py[i] = Math.sin(ang) * rad;
    vx[i] = (rand() - 0.5) * 0.002;
    vy[i] = (rand() - 0.5) * 0.002;
    seed[i] = rand() * 10;
    anchor[i] = i % ANCHOR_COUNT;
  }
  return { px, py, vx, vy, seed, anchor };
}

export function stepFallback(
  g2d: CanvasRenderingContext2D,
  s: FallbackState,
  p: FieldParams,
  anchorsNdc: Float32Array,
  w: number,
  h: number,
): void {
  const motion = p.reduce > 0.5 ? 0.5 : 1;
  const pull = (0.01 + (0.26 - 0.01) * p.coherence * p.coherence) * (0.25 + 0.75 * p.presence);
  const turbAmt = 0.06 + (1.1 - 0.06) * (1 - p.coherence);
  const maxs = (0.006 + (1 - p.coherence) * 0.03) * motion;

  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const posx = s.px[i];
    const posy = s.py[i];
    const ai = s.anchor[i] * 2;
    const tx = anchorsNdc[ai];
    const ty = anchorsNdc[ai + 1];

    let fx = (tx - posx) * pull;
    let fy = (ty - posy) * pull;

    const e = 0.025;
    const tpx = posx * 2.1 + s.seed[i] + p.time * 0.13;
    const tpy = posy * 2.1 + s.seed[i] + p.time * 0.09;
    const cdy = (hashf(tpx, tpy + e) - hashf(tpx, tpy - e)) / (2 * e);
    const cdx = (hashf(tpx + e, tpy) - hashf(tpx - e, tpy)) / (2 * e);
    fx += -cdy * 0.05 * turbAmt;
    fy += cdx * 0.05 * turbAmt;

    const r = Math.max(Math.hypot(posx, posy), 1e-4);
    const dx = posx / r;
    const dy = posy / r;
    fx += dx * hashf(posx * 3.7 + s.seed[i], posy * 3.7) * 0.01 * (1 - p.coherence);
    fy += dy * hashf(posx * 3.7 + s.seed[i], posy * 3.7) * 0.01 * (1 - p.coherence);

    fx += p.pan * 0.018 * (1 - p.coherence);

    if (r > 1.35) {
      fx -= dx * (r - 1.35) * 0.12;
      fy -= dy * (r - 1.35) * 0.12;
    }

    let nvx = s.vx[i] + fx * motion;
    let nvy = s.vy[i] + fy * motion;
    const sp = Math.hypot(nvx, nvy);
    if (sp > maxs) {
      nvx *= maxs / sp;
      nvy *= maxs / sp;
    }
    nvx *= 0.93;
    nvy *= 0.93;
    s.vx[i] = nvx;
    s.vy[i] = nvy;
    s.px[i] = posx + nvx;
    s.py[i] = posy + nvy;
  }

  const fadeAlpha = Math.min(0.55, 1 - p.fade);
  g2d.globalCompositeOperation = "source-over";
  g2d.fillStyle = `rgba(4,2,10,${fadeAlpha})`;
  g2d.fillRect(0, 0, w, h);

  g2d.globalCompositeOperation = "lighter";
  const cx = w * 0.5;
  const cy = h * 0.5;
  const scale = Math.min(w, h) * 0.33;
  const bright = 0.4 + p.brightness * 0.8 + p.coherence * 0.3;
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const sp = Math.hypot(s.vx[i], s.vy[i]);
    const t = Math.min(1, Math.max(0, p.coherence * 0.72 + sp * 5 + s.seed[i] * 0.1));
    const [r, gg, b] = conjurePalette(t);
    const a = Math.min(0.9, (0.16 + sp * 20) * bright);
    const sx = cx + s.px[i] * scale;
    const sy = cy + s.py[i] * scale;
    const rad = 1.0 + sp * 80 + p.brightness * 0.8 + p.coherence * 0.6;
    g2d.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${a})`;
    g2d.beginPath();
    g2d.arc(sx, sy, rad, 0, Math.PI * 2);
    g2d.fill();
  }
  g2d.globalCompositeOperation = "source-over";
}
