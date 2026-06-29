// ─────────────────────────────────────────────────────────────────────────────
// 1056-key-bloom · bloom.ts — log-polar form-constant kaleidoscope renderer.
//
//   Each played note seeds a Bloom: a chrysanthemum of form-constant geometry
//   laid out in CORTICAL space and warped to the screen with cortexToScreen, so
//   the petals genuinely ARE Klüver / Bressloff–Cowan form constants (concentric
//   ring tunnels, radial spokes, spirals, honeycomb lattice) rather than arbitrary
//   flowers. An N-fold kaleidoscope fold (à la Iñigo Quílez domain folding) opens
//   from 2 → ~12 → settles as the bloom grows, then slowly fades on release.
//
//   Canvas2D, additive "lighter" compositing for glow, warm-organic palette.
// ─────────────────────────────────────────────────────────────────────────────

import {
  cortexToScreen,
  formConstant,
  honeycomb,
  FORM_PHI,
  type FormConstant,
} from "../_shared/psych/logpolar";

const FORM_ORDER: FormConstant[] = ["tunnel", "spoke", "spiral", "honeycomb"];

/** Warm-organic ramp: ember → rust → amber → ochre → moss → luminous gold.
 *  t in [0,1]. Returns [r,g,b] 0..255. Floors on warm ember (never cold/black). */
export function warmRamp(t: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [40, 14, 6]], // deep ember
    [0.22, [120, 40, 16]], // rust
    [0.45, [200, 96, 28]], // amber
    [0.62, [216, 150, 52]], // ochre
    [0.8, [150, 168, 70]], // moss
    [1.0, [255, 226, 150]], // luminous gold
  ];
  const c = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (c >= a && c <= b) {
      const f = (c - a) / (b - a);
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * f),
        Math.round(ca[1] + (cb[1] - ca[1]) * f),
        Math.round(ca[2] + (cb[2] - ca[2]) * f),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export interface Bloom {
  id: number;
  freq: number; // ring density (mapped from pitch)
  phi: number; // form-constant plane-wave angle
  form: FormConstant;
  hueBias: number; // [0,1] palette offset per note
  velocity: number; // [0,1] → size + brightness
  bornAt: number; // sec
  releasedAt: number | null; // sec or null while held
  cx: number; // screen anchor (px, fraction of min dim handled by renderer)
  cy: number;
  seed: number;
}

let bloomSeq = 1;

export function createBloom(opts: {
  freq: number;
  noteIndex: number;
  velocity: number;
  tSec: number;
  cx: number;
  cy: number;
}): Bloom {
  const form = FORM_ORDER[opts.noteIndex % FORM_ORDER.length];
  const phi = form === "honeycomb" ? FORM_PHI.tunnel : FORM_PHI[form];
  return {
    id: bloomSeq++,
    freq: opts.freq,
    phi,
    form,
    hueBias: (opts.noteIndex * 0.137) % 1,
    velocity: Math.max(0.05, Math.min(1, opts.velocity)),
    bornAt: opts.tSec,
    releasedAt: null,
    cx: opts.cx,
    cy: opts.cy,
    seed: Math.random() * 1000,
  };
}

/** Envelope: 0 at birth → grows in, holds while pressed, fades after release. */
function envelope(b: Bloom, tSec: number): number {
  const age = tSec - b.bornAt;
  const growIn = Math.min(1, age / 0.5); // ~half-second open
  if (b.releasedAt == null) {
    // While held: full, with a tiny breathing.
    return growIn * (0.9 + 0.1 * Math.sin(age * 1.7 + b.seed));
  }
  const since = tSec - b.releasedAt;
  const fade = Math.max(0, 1 - since / 2.2); // ~2.2s dissolve
  return growIn * fade;
}

/** True once fully faded — renderer can cull it. */
export function isDead(b: Bloom, tSec: number): boolean {
  return b.releasedAt != null && tSec - b.releasedAt > 2.4;
}

/** N-fold kaleidoscope count: blooms 2 → ~12 → settles to ~6 as it matures. */
function foldCount(b: Bloom, tSec: number): number {
  const age = tSec - b.bornAt;
  const opening = 2 + 10 * Math.min(1, age / 0.8); // 2 → 12 in 0.8s
  const settle = 6 + 6 * Math.exp(-Math.max(0, age - 0.8) * 0.6); // 12 → 6
  const n = age < 0.8 ? opening : settle;
  return Math.max(2, Math.round(n));
}

/**
 * Draw one bloom. The canvas must already be translated so (0,0) is the bloom's
 * anchor; `scale` maps cortical-warped unit space to pixels. ctx must be in
 * "lighter" composite mode. `bright` is the global brightness multiplier.
 */
export function drawBloom(
  ctx: CanvasRenderingContext2D,
  b: Bloom,
  tSec: number,
  scale: number,
  bright: number,
): void {
  const env = envelope(b, tSec);
  if (env <= 0.001) return;

  const age = tSec - b.bornAt;
  const fold = foldCount(b, tSec);
  const phase = age * 0.9 + b.seed; // slow drift since onset
  // Pitch → ring density: clamp the engine freq to a pleasant band.
  const freq = 2.2 + Math.min(7, b.freq / 70);
  const size = scale * (0.55 + 0.85 * b.velocity) * env;

  // Sample the form constant along a set of cortical radii, fold N-fold, and
  // stroke petals. We walk cortical u (log r) outward and v (theta) around.
  const rings = 26;
  const angSteps = 46;
  const baseAlpha = 0.5 * env * bright * (0.5 + 0.5 * b.velocity);

  for (let f = 0; f < fold; f++) {
    const foldRot = (Math.PI * 2 * f) / fold + age * 0.12;
    ctx.save();
    ctx.rotate(foldRot);
    for (let ri = 0; ri < rings; ri++) {
      const u = -2.2 + (ri / rings) * 3.0; // cortical log-radius band
      ctx.beginPath();
      let started = false;
      for (let ai = 0; ai <= angSteps; ai++) {
        // Restrict theta to one fold wedge so the kaleidoscope mirrors cleanly.
        const v = (ai / angSteps) * ((Math.PI * 2) / fold);
        const fc =
          b.form === "honeycomb"
            ? honeycomb(u, v, freq, phase)
            : formConstant(u, v, b.phi, freq, phase);
        // Form-constant value modulates radius → petals bulge where the
        // cortical stripe is bright.
        const warp = 1 + 0.35 * (fc - 0.5);
        const [sx, sy] = cortexToScreen(u, v);
        const px = sx * size * warp;
        const py = sy * size * warp;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      const tCol = Math.min(1, (ri / rings) * 0.7 + b.hueBias * 0.3 + env * 0.2);
      const [r, g, bl] = warmRamp(tCol);
      const a = baseAlpha * (0.25 + 0.75 * (1 - ri / rings));
      ctx.strokeStyle = `rgba(${r},${g},${bl},${a.toFixed(3)})`;
      ctx.lineWidth = Math.max(0.6, size * 0.012 * (1 + b.velocity));
      ctx.stroke();
    }
    ctx.restore();
  }

  // Bright core.
  const coreT = Math.min(1, 0.7 + b.hueBias * 0.3);
  const [cr, cg, cb] = warmRamp(coreT);
  const coreA = baseAlpha * 1.4;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.5);
  grad.addColorStop(0, `rgba(${cr},${cg},${cb},${Math.min(1, coreA).toFixed(3)})`);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
}
