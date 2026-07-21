// web.ts — the hyperconnectivity SIM (harmonic-lock math) + the Canvas2D
// additive light-web RENDERER for 2136 · Communion.
//
// Nodes = the voices of the self (one per active pointer + seeded autopilot
// voices). Edges = sympathetic-resonance threads between EVERY pair of active
// voices — so as more voices are held the web is denser (hyperconnectivity).
// As the communion coupling K rises: threads brighten + thicken, a shimmer
// travels along them, and a central bloom intensifies until the many lock into
// ONE radiant whole. All luminance changes are slew-limited elsewhere; here we
// only ever draw slowly-varying values (no strobe).

import { BP_SPAN } from "./bp";

export interface Voice {
  id: string; // "p<pointerId>" or "auto-N"
  auto: boolean;
  audioId: number;
  // input state (css px / normalized)
  x: number;
  y: number;
  nx: number; // normalized X → pitch
  ny: number; // normalized Y (0 top)
  rawStep: number; // continuous BP step from X
  baseDetune: number; // per-voice microtonal offset (BP steps), resolves as K→1
  brightness: number; // 1 - ny, from Y
  velocity: number; // smoothed pointer speed (0..1)
  // render state (eased)
  px: number;
  py: number;
  glow: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Radiant violet (low pitch) → gold (high pitch), lifted by brightness. */
export function stepColor(rawStep: number, brightness: number): RGB {
  const t = Math.max(0, Math.min(1, rawStep / BP_SPAN));
  // violet 150,90,255 → rose 235,120,220 → gold 255,205,90
  let r: number, g: number, b: number;
  if (t < 0.5) {
    const u = t / 0.5;
    r = 150 + (235 - 150) * u;
    g = 90 + (120 - 90) * u;
    b = 255 + (220 - 255) * u;
  } else {
    const u = (t - 0.5) / 0.5;
    r = 235 + (255 - 235) * u;
    g = 120 + (205 - 120) * u;
    b = 220 + (90 - 220) * u;
  }
  const lift = 0.6 + 0.4 * brightness;
  return { r: r * lift, g: g * lift, b: b * lift };
}

/**
 * Harmonic LOCK. A voice's X gives a continuous rawStep; its detune from the
 * nearest shared BP lattice pitch (integer step) plus a personal offset is
 * scaled by (1 - K). At K=0 the voice sings its own slightly-detuned pitch; at
 * K=1 every voice snaps onto the integer lattice → one consonant chord.
 */
export function lockedStep(rawStep: number, baseDetune: number, k: number): number {
  const lattice = Math.round(rawStep);
  const detune = rawStep - lattice + baseDetune;
  return lattice + detune * (1 - k);
}

/**
 * Slew-limited follower of sustained polyphony. K climbs toward a ceiling that
 * grows with the count of held voices (and climbs faster the more voices), and
 * eases back down when fingers lift — never a self-running 0→peak→0 timeline.
 */
export function advanceCoupling(k: number, count: number, dt: number): number {
  const ceil = count >= 2 ? Math.min(1, 0.34 + 0.17 * (count - 1)) : 0;
  const rate = count >= 2 ? 0.11 + 0.11 * (count - 1) : 0.55; // rise faster w/ more; gentle release
  return k + (ceil - k) * (1 - Math.exp(-rate * dt));
}

function addNode(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, c: RGB, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`);
  g.addColorStop(0.4, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a * 0.4})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export interface FieldOptions {
  voices: Voice[];
  cx: number;
  cy: number;
  k: number;
  tSec: number;
  glowMul: number; // safe-flicker / breathing luminance multiplier (~1)
  reduced: boolean;
}

/**
 * Draw one frame of the additive light-web. Caller must already have laid down
 * the low-alpha dark trail fill (source-over). This switches to "lighter".
 */
export function drawField(ctx: CanvasRenderingContext2D, opts: FieldOptions): void {
  const { voices, cx, cy, k, tSec, glowMul, reduced } = opts;
  const n = voices.length;
  ctx.globalCompositeOperation = "lighter";

  // ---- central communion bloom: grows with K and polyphony; at peak the whole
  //      field blooms toward one radiant center. Slow-varying only.
  const bloomPulse = 0.9 + 0.1 * Math.sin(tSec * (reduced ? 0.4 : 1.1)); // < 3 Hz
  const bloomR = (60 + k * 260 + n * 10) * bloomPulse;
  const bloomA = (0.03 + k * k * 0.22) * glowMul;
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
  // violet core → gold rim as the union locks
  bloom.addColorStop(0, `rgba(255,${210 + 30 * k | 0},${180 + 40 * k | 0},${bloomA})`);
  bloom.addColorStop(0.5, `rgba(${180 + 40 * k | 0},130,255,${bloomA * 0.5})`);
  bloom.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
  ctx.fill();

  // ---- edges: sympathetic-resonance threads between EVERY pair of voices.
  //      Thicken + brighten with K; a shimmer bead travels along each.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = voices[i];
      const b = voices[j];
      const ci = stepColor(a.rawStep, a.brightness);
      const cj = stepColor(b.rawStep, b.brightness);
      const grad = ctx.createLinearGradient(a.px, a.py, b.px, b.py);
      const edgeA = (0.02 + k * 0.16) * glowMul;
      grad.addColorStop(0, `rgba(${ci.r | 0},${ci.g | 0},${ci.b | 0},${edgeA})`);
      grad.addColorStop(0.5, `rgba(255,235,205,${edgeA * (0.4 + k * 0.9)})`);
      grad.addColorStop(1, `rgba(${cj.r | 0},${cj.g | 0},${cj.b | 0},${edgeA})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6 + k * 3.5 + (a.glow + b.glow) * 0.6;
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();

      // shimmer bead — travels along the thread, faster with velocity + K.
      const speed = 0.25 + k * 0.6 + (a.velocity + b.velocity) * 0.5;
      const phase = (tSec * speed + i * 0.37 + j * 0.19) % 1;
      const bx = a.px + (b.px - a.px) * phase;
      const by = a.py + (b.py - a.py) * phase;
      const beadA = (0.04 + k * 0.35) * glowMul;
      const bead = ctx.createRadialGradient(bx, by, 0, bx, by, 5 + k * 8);
      bead.addColorStop(0, `rgba(255,244,220,${beadA})`);
      bead.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bead;
      ctx.beginPath();
      ctx.arc(bx, by, 5 + k * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- nodes: each voice glows; brighter/bigger with its Y-brightness, and is
  //      pulled visually toward the center as K rises (the many → one).
  for (const v of voices) {
    const c = stepColor(v.rawStep, v.brightness);
    const radius = 16 + v.brightness * 26 + v.glow * 18 + k * 10;
    const a = (0.18 + v.brightness * 0.22 + k * 0.15) * glowMul;
    addNode(ctx, v.px, v.py, radius, c, a);
    // bright hot core
    addNode(ctx, v.px, v.py, 4 + v.velocity * 6, { r: 255, g: 246, b: 222 }, a * 0.9);
  }

  ctx.globalCompositeOperation = "source-over";
}
