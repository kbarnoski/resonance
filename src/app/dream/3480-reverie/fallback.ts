/* ── 3480-reverie · Canvas2D fallback ─────────────────────────────────────
 *
 *  When navigator.gpu is unavailable (Safari / Firefox / headless), this
 *  CPU-integrates a few thousand particles through the SAME weighted force
 *  model as the WebGPU compute shader (drift + vortex + radial + turbulence),
 *  driven by the SAME director / arc / audio. The piece is never dead — only
 *  the particle count drops. Additive draw over a soft fade for the glow.
 */

import type { FieldParams } from "./compute";

export const FALLBACK_COUNT = 3600;

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

function dreamPalette(x: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, x));
  const deep = [11, 7, 19];
  const indigo = [99, 102, 241];
  const violet = [139, 92, 246];
  const magenta = [176, 67, 224];
  const light = [196, 181, 253];
  const mix = (
    a: number[],
    b: number[],
    k: number,
  ): [number, number, number] => [
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
}

export function createFallback(): FallbackState {
  const rand = mulberry32(0x3480);
  const px = new Float32Array(FALLBACK_COUNT);
  const py = new Float32Array(FALLBACK_COUNT);
  const vx = new Float32Array(FALLBACK_COUNT);
  const vy = new Float32Array(FALLBACK_COUNT);
  const seed = new Float32Array(FALLBACK_COUNT);
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = Math.sqrt(rand()) * 0.9;
    px[i] = Math.cos(ang) * rad;
    py[i] = Math.sin(ang) * rad;
    vx[i] = (rand() - 0.5) * 0.002;
    vy[i] = (rand() - 0.5) * 0.002;
    seed[i] = rand() * 10;
  }
  return { px, py, vx, vy, seed };
}

export function stepFallback(
  g2d: CanvasRenderingContext2D,
  s: FallbackState,
  p: FieldParams,
  w: number,
  h: number,
): void {
  const motion = p.reduce > 0.5 ? 0.45 : 1;
  const maxs = (0.006 + p.arousal * 0.02) * motion;

  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const posx = s.px[i];
    const posy = s.py[i];
    const r = Math.max(Math.hypot(posx, posy), 1e-4);
    const dx = posx / r;
    const dy = posy / r;
    let fx = 0;
    let fy = 0;

    // drift
    const band = Math.sin(posx * 1.7 + p.time * 0.15 + s.seed[i] * 6.283);
    fx += (0.01 + 0.006 * Math.sin(p.time * 0.06 + s.seed[i])) * p.driftW;
    fy += (band * 0.004 - posy * 0.012) * p.driftW;

    // vortex
    fx += (-dy * (0.05 / (r + 0.25)) - dx * 0.003) * p.vortexW;
    fy += (dx * (0.05 / (r + 0.25)) - dy * 0.003) * p.vortexW;

    // radial
    fx += dx * (p.radialDir * 0.055) * p.radialW;
    fy += dy * (p.radialDir * 0.055) * p.radialW;

    // turbulence (cheap curl via hash gradient)
    const e = 0.02;
    const tpx = posx * 1.5 + s.seed[i] + p.time * 0.11;
    const tpy = posy * 1.5 + s.seed[i] + p.time * 0.08;
    const cdy =
      (hashf(tpx, tpy + e) - hashf(tpx, tpy - e)) / (2 * e);
    const cdx =
      (hashf(tpx + e, tpy) - hashf(tpx - e, tpy)) / (2 * e);
    fx += -cdy * 0.03 * p.turbW;
    fy += cdx * 0.03 * p.turbW;

    // containment
    if (r > 1.2) {
      fx -= dx * (r - 1.2) * 0.09;
      fy -= dy * (r - 1.2) * 0.09;
    }

    let nvx = s.vx[i] + fx * motion;
    let nvy = s.vy[i] + fy * motion;
    const sp = Math.hypot(nvx, nvy);
    if (sp > maxs) {
      nvx *= maxs / sp;
      nvy *= maxs / sp;
    }
    nvx *= 0.94;
    nvy *= 0.94;
    s.vx[i] = nvx;
    s.vy[i] = nvy;
    s.px[i] = posx + nvx;
    s.py[i] = posy + nvy;
  }

  // ── draw: soft fade, then additive dots ──
  const fadeAlpha = Math.min(0.5, 1 - p.fade);
  g2d.globalCompositeOperation = "source-over";
  g2d.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
  g2d.fillRect(0, 0, w, h);

  g2d.globalCompositeOperation = "lighter";
  const cx = w * 0.5;
  const cy = h * 0.5;
  const scale = Math.min(w, h) * 0.31;
  const bright = 0.35 + p.brightness * 0.95;
  for (let i = 0; i < FALLBACK_COUNT; i++) {
    const sp = Math.hypot(s.vx[i], s.vy[i]);
    const t = Math.min(1, Math.max(0, p.valence * 0.68 + sp * 6 + s.seed[i] * 0.12));
    const [r, gg, b] = dreamPalette(t);
    const a = Math.min(0.9, (0.18 + sp * 22) * bright);
    const sx = cx + s.px[i] * scale;
    const sy = cy + s.py[i] * scale;
    const rad = 1.1 + sp * 90 + p.brightness * 0.8;
    g2d.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${a})`;
    g2d.beginPath();
    g2d.arc(sx, sy, rad, 0, Math.PI * 2);
    g2d.fill();
  }
  g2d.globalCompositeOperation = "source-over";
}
