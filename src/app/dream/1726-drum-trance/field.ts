// ─────────────────────────────────────────────────────────────────────────────
// 1726 · drum-trance — Klüver form-constant field (Canvas2D, NOT WebGL).
//
// Deliberately CPU/Canvas2D: a small offscreen ImageData is filled per-pixel in
// cortical (log-polar) space using the shared logpolar engine, then upscaled
// with smoothing to the full canvas — the blur is part of the ember look.
//
// The field IS the entrainment reward. Everything scales with E in [0,1]:
//   • brightness, contrast, saturation and form-density rise with E;
//   • at low E the field is dim, grey, scattered;
//   • as E climbs it escalates tunnel → spiral → honeycomb (crossfaded);
//   • past deep lock a peripheral white-out bloom dissolves the boundary.
// Each beat gently pulses global luminance (small swing, high floor — never a
// hard strobe; the 4 Hz cadence is felt as a soft breath, not a flash).
//
// Palette: firelit ember/ochre — warm hex maths lives ONLY here in the art
// layer, never in UI chrome. No clock reads; caller passes frame-derived phase.
// ─────────────────────────────────────────────────────────────────────────────

import { formConstant, honeycomb } from "../_shared/psych/logpolar";

export interface FieldParams {
  /** entrainment scalar in [0,1] — the reward signal */
  E: number;
  /** decaying per-beat pulse in [0,1] */
  beatPulse: number;
  /** animated form-constant phase (advanced off a frame counter) */
  phase: number;
  /** soften motion / contrast for reduced-motion users */
  reduced: boolean;
}

export interface FieldRig {
  render(ctx: CanvasRenderingContext2D, W: number, H: number, p: FieldParams): void;
}

export function makeFieldRig(): FieldRig {
  const off = document.createElement("canvas");
  const octx = off.getContext("2d");
  let FW = 0;
  let FH = 0;
  let img: ImageData | null = null;

  function ensure(W: number, H: number): void {
    const targetW = 150;
    const fw = targetW;
    const fh = Math.max(60, Math.round((targetW * H) / Math.max(1, W)));
    if (fw !== FW || fh !== FH) {
      FW = fw;
      FH = fh;
      off.width = fw;
      off.height = fh;
      if (octx) img = octx.createImageData(fw, fh);
    }
  }

  function render(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    p: FieldParams,
  ): void {
    if (!octx) return;
    ensure(W, H);
    if (!img) return;
    const data = img.data;
    const aspect = FW / FH;

    const E = Math.max(0, Math.min(1, p.E));
    const contrastMax = p.reduced ? 1.15 : 1.7;
    const contrast = 0.55 + E * contrastMax;
    const pulseAmt = p.reduced ? 0.1 : 0.22;
    const bright = (0.22 + E * 0.9) * (1 + p.beatPulse * pulseAmt);
    const sat = 0.26 + 0.74 * E;
    const freq = 5 + E * 7;
    const seg = E * 2; // 0..1 tunnel→spiral, 1..2 spiral→honeycomb
    const bloom = E > 0.82 ? (E - 0.82) / 0.18 : 0;

    let idx = 0;
    for (let py = 0; py < FH; py++) {
      const ny = (py + 0.5) / FH * 2 - 1;
      for (let px = 0; px < FW; px++) {
        const nx = ((px + 0.5) / FW * 2 - 1) * aspect;

        // screen → cortex (log-polar), guarding the r=0 singularity
        const r = Math.hypot(nx, ny) + 1e-3;
        const u = Math.log(r);
        const v = Math.atan2(ny, nx);

        // crossfade two adjacent form constants by E
        let a: number;
        let b: number;
        let mix: number;
        if (seg < 1) {
          a = formConstant(u, v, 0, freq, p.phase); // tunnel
          b = formConstant(u, v, Math.PI / 4, freq, p.phase * 1.1); // spiral
          mix = seg;
        } else {
          a = formConstant(u, v, Math.PI / 4, freq, p.phase * 1.1); // spiral
          b = honeycomb(u, v, freq * 0.9, p.phase * 0.8); // honeycomb
          mix = seg - 1;
        }
        let val = a + (b - a) * mix;

        // contrast around mid-grey
        val = 0.5 + (val - 0.5) * contrast;
        if (val < 0) val = 0;
        else if (val > 1) val = 1;

        // depth vignette — pulls the eye down the tunnel toward centre
        const vf = 1 / (1 + r * r * 0.15);
        const lv = val * bright * (0.55 + 0.45 * vf);

        // ── ember ramp: dark red → orange → ochre → warm white ──
        const c = lv < 0 ? 0 : lv > 1 ? 1 : lv;
        let R = Math.pow(c, 0.7) * 255;
        let G = Math.pow(c, 1.5) * 200;
        let B = Math.pow(c, 3.2) * 150;

        // desaturate toward grey when entrainment is low
        const grey = 0.3 * R + 0.59 * G + 0.11 * B;
        R = grey + (R - grey) * sat;
        G = grey + (G - grey) * sat;
        B = grey + (B - grey) * sat;

        // peripheral white-out bloom at deep lock (boundary dissolution)
        if (bloom > 0) {
          const edge = Math.min(1, Math.max(0, r - 0.7)) * bloom;
          R += edge * 185;
          G += edge * 178;
          B += edge * 165;
        }

        // faint ember floor so the field is never pure black
        R += 6;
        G += 3;
        B += 5;

        data[idx] = R > 255 ? 255 : R;
        data[idx + 1] = G > 255 ? 255 : G;
        data[idx + 2] = B > 255 ? 255 : B;
        data[idx + 3] = 255;
        idx += 4;
      }
    }

    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, FW, FH, 0, 0, W, H);
  }

  return { render };
}

/** Which form constant dominates at entrainment E (for the readout). */
export function formNameFor(E: number): string {
  if (E < 0.34) return "tunnel";
  if (E < 0.68) return "spiral";
  return "honeycomb";
}
