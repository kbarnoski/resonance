// ─────────────────────────────────────────────────────────────────────────────
// 3056 · clearlight — field.ts
//
// The Ganzfeld renderer (Canvas2D). A full-viewport, soft, edge-free radial
// luminance wash whose brightness tracks the breath + accumulated calm, with an
// imperceptibly slow hue/lightness drift. Layered over it:
//
//   1. the base Ganzfeld wash — a uniform field the viewer's brain fills in;
//   2. a center-out "clear light" bloom that expands + warms on the inhale;
//   3. faint form-constants (concentric rings = tunnels + a soft log spiral =
//      spirals — two of Klüver's constants) that fade up near-subliminally as
//      calm accumulates, and scatter back toward noise when the breath agitates;
//   4. a 5.5-bpm pacer ring to breathe WITH.
//
// All raw color lives here in the art layer, drawn from the brand violet arc.
// The math for the concentric rings composes the shared logpolar engine.
// ─────────────────────────────────────────────────────────────────────────────

import { formConstant } from "../_shared/visionary/logpolar";

export interface FieldState {
  /** Visual clock, seconds (already reduced-motion-scaled by the caller). */
  t: number;
  /** Breath envelope, 0..1. */
  breath: number;
  /** Sustained-calm accumulator, 0..1. */
  calm: number;
  /** 5.5-bpm pacer phase, 0..1 (0 = fully exhaled, 1 = fully inhaled). */
  pacer: number;
  /** Luminance multiplier from the opt-in SafeFlicker (1.0 when off). */
  flicker: number;
  /** Instantaneous agitation, 0..1 — scatters the form-constants. */
  agitation: number;
  /** prefers-reduced-motion — thins the field so nothing pulses. */
  reduced: boolean;
}

/** Render one Ganzfeld frame. `w`/`h` are CSS pixels (ctx is dpr-scaled). */
export function drawField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: FieldState,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(w, h) / 2;
  const flick = Math.max(0, Math.min(1.2, s.flicker));

  // Imperceptibly slow hue/lightness drift, held inside the violet→magenta arc.
  const drift = 0.5 + 0.5 * Math.sin(s.t * 0.021) * Math.cos(s.t * 0.013);
  const hue = 264 + drift * 34; // 264..298

  // Base field luminance rises softly with calm + breath (percentages).
  const baseL = 6 + s.calm * 10 + s.breath * 6;
  const centerL = (baseL + 10 + s.breath * 22) * flick;

  // ── 1) Full-field, edge-free Ganzfeld wash ──────────────────────────────
  const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  wash.addColorStop(0, `hsl(${hue} 58% ${centerL}%)`);
  wash.addColorStop(0.55, `hsl(${hue - 6} 54% ${(baseL + 4) * flick}%)`);
  wash.addColorStop(1, `hsl(${hue - 12} 50% ${baseL * 0.7 * flick}%)`);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // ── 2) Center-out "clear light" bloom (grows + warms on the inhale) ──────
  ctx.globalCompositeOperation = "lighter";
  const bloomR = maxR * (0.18 + s.breath * 0.62);
  const warmHue = hue + s.breath * 24;
  const ba = (0.1 + s.breath * 0.42) * flick;
  const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
  bloom.addColorStop(0, `hsla(${warmHue} 72% 84% ${ba})`);
  bloom.addColorStop(0.5, `hsla(${warmHue - 8} 66% 72% ${ba * 0.5})`);
  bloom.addColorStop(1, `hsla(${warmHue - 16} 60% 62% 0)`);
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
  ctx.fill();

  // ── 3) Form-constants, emerging near-subliminally from sustained calm ────
  // Thresholded so they only surface after real accumulated calm; scaled down
  // hard under reduced-motion so nothing ever flickers into being.
  const formAlpha = Math.max(0, s.calm - 0.12) * (s.reduced ? 0.4 : 0.95);
  if (formAlpha > 0.001) {
    const freq = 3.2;
    const phase = -s.t * 0.12; // slow inward drift (tunnel motion)
    const rings = s.reduced ? 28 : 46;
    const jitter = s.agitation * 16; // agitation scatters them back to noise
    ctx.lineWidth = 1.4;
    for (let i = 1; i <= rings; i++) {
      const rr = (i / rings) * maxR;
      const u = Math.log(Math.max(rr, 1e-3));
      // phi = 0 → concentric rings (Klüver "tunnels / funnels").
      const lum = formConstant(u, 0, 0, freq, phase);
      const a = formAlpha * lum * 0.1 * flick;
      if (a < 0.004) continue;
      const jr = rr + Math.sin(i * 12.9898 + s.t * 1.7) * jitter;
      ctx.strokeStyle = `hsla(${hue + 20} 70% 82% ${a})`;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, jr), 0, Math.PI * 2);
      ctx.stroke();
    }

    // A single soft logarithmic spiral (Klüver "spirals").
    const spiralA = formAlpha * 0.45 * flick;
    if (spiralA > 0.003) {
      ctx.strokeStyle = `hsla(${hue + 30} 72% 84% ${spiralA})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const bSpin = 0.17;
      const spin = s.t * 0.05;
      let first = true;
      for (let th = 0.2; th < 5 * Math.PI * 2; th += 0.12) {
        const rr = 4 * Math.exp(bSpin * th);
        if (rr > maxR) break;
        const ang = th + spin;
        const scat = jitter * 0.6 * Math.sin(th * 3.1 + s.t * 2.3);
        const px = cx + (rr + scat) * Math.cos(ang);
        const py = cy + (rr + scat) * Math.sin(ang);
        if (first) {
          ctx.moveTo(px, py);
          first = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }

  // ── 4) The 5.5-bpm pacer ring — breathe WITH it ─────────────────────────
  const pr = maxR * (0.12 + s.pacer * 0.26);
  const pa = (0.14 + 0.12 * s.pacer) * flick;
  ctx.strokeStyle = `hsla(${hue + 10} 58% 88% ${pa})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, pr, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalCompositeOperation = "source-over";
}

/** A single faint idle frame before the piece begins (never blank). */
export function drawIdle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  drawField(ctx, w, h, {
    t: 0,
    breath: 0,
    calm: 0,
    pacer: 0,
    flicker: 1,
    agitation: 0,
    reduced: true,
  });
}
