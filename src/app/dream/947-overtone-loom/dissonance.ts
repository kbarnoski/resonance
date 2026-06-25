// ── Sethares / Plomp-Levelt sensory-dissonance model ─────────────────────────
// Roughness between two partials (f1,a1) and (f2,a2):
//   df  = |f2 - f1|
//   fmin = min(f1, f2)
//   s   = 0.24 / (0.0207 * fmin + 18.96)
//   R   = a1*a2 * ( e^(-b1*s*df) - e^(-b2*s*df) )   with b1=3.5, b2=5.75
// Summed over every pair of partials currently sounding.
//
// This module is the canonical CPU reference. The exact same arithmetic is
// re-implemented inside the WGSL compute shader and the WebGL2 fragment shader
// so all three render tiers agree. Helmholtz (1863) framed consonance as
// overtone coincidence; Sethares (1998) turned it into this continuous curve;
// the 2026 "Elementary spectrum for the dissonance curve" paper shows the curve
// is a property of the actual timbre's spectrum — which is why the timbre knob
// changes which intervals read as consonant.

export const B1 = 3.5;
export const B2 = 5.75;

// Frequency axis bounds for the field (≈ A1 .. A6), log-spaced.
export const F_MIN = 55; // A1
export const F_MAX = 1760; // A6

export interface Partial {
  freq: number;
  amp: number;
}

// Pairwise roughness for two partials.
export function pairRoughness(
  f1: number,
  a1: number,
  f2: number,
  a2: number,
): number {
  const df = Math.abs(f2 - f1);
  const fmin = Math.min(f1, f2);
  const s = 0.24 / (0.0207 * fmin + 18.96);
  return a1 * a2 * (Math.exp(-B1 * s * df) - Math.exp(-B2 * s * df));
}

// Total sensory dissonance for the whole bank of sounding partials.
export function totalDissonance(partials: Partial[]): number {
  let sum = 0;
  for (let i = 0; i < partials.length; i++) {
    for (let j = i + 1; j < partials.length; j++) {
      sum += pairRoughness(
        partials[i].freq,
        partials[i].amp,
        partials[j].freq,
        partials[j].amp,
      );
    }
  }
  return sum;
}

// Log-frequency for a normalized x in [0,1] across the field.
export function xToFreq(x: number): number {
  return F_MIN * Math.pow(F_MAX / F_MIN, x);
}

// Field roughness contributed *near* a probe frequency fp: for each sounding
// partial, treat a hypothetical probe partial at fp (unit amp) and sum its
// roughness against every real partial. This produces bright bands exactly
// where a new partial would beat against the existing chord — the "interference
// field" the user sees. (Used only by the Canvas2D CPU fallback; GPU tiers do
// the same per-bin.)
export function fieldAt(fp: number, partials: Partial[]): number {
  let sum = 0;
  for (let k = 0; k < partials.length; k++) {
    sum += pairRoughness(fp, 1, partials[k].freq, partials[k].amp);
  }
  return sum;
}

// Build the harmonic partial bank for one voice (additive synthesis).
// count partials, 1/n^rolloff amplitude; brightness biases the rolloff so the
// timbre knob shifts spectral energy up (more high partials → more clash).
export function voicePartials(
  fundamental: number,
  count: number,
  brightness: number,
): Partial[] {
  const out: Partial[] = [];
  // brightness 0..1 → rolloff exponent 1.6 (dark) .. 0.6 (bright/buzzy)
  const rolloff = 1.6 - brightness;
  for (let n = 1; n <= count; n++) {
    const freq = fundamental * n;
    if (freq > F_MAX * 1.15) break;
    out.push({ freq, amp: 1 / Math.pow(n, rolloff) });
  }
  // normalize peak amp to 1
  let peak = 0;
  for (const p of out) peak = Math.max(peak, p.amp);
  if (peak > 0) for (const p of out) p.amp /= peak;
  return out;
}
