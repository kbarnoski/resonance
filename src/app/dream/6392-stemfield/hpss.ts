// ─────────────────────────────────────────────────────────────────────────────
// hpss.ts — Harmonic/Percussive Source Separation by median filtering, then a
//           harmonic band-split, producing four resynthesizable stems.
//
//   Method (no ML, all DSP), after Derry Fitzgerald, "Harmonic/Percussive
//   Separation using Median Filtering," DAFx 2010:
//
//     1. STFT the mono signal → magnitude spectrogram |X|.
//     2. Median-filter |X| ALONG TIME (per frequency bin)  → harmonic est. H.
//        Median-filter |X| ALONG FREQUENCY (per time frame) → percussive est. P.
//        (Sustained tones smear across time; transients smear across frequency;
//         the median suppresses the OTHER kind.)
//     3. Soft Wiener-style masks  Mh = H^p / (H^p + P^p),  Mp = 1 - Mh  (p = 2).
//     4. Inverse-STFT the masked complex spectrogram → harmonic + percussive
//        time-domain streams. Because Mh + Mp = 1, the two streams sum back to
//        the original signal, so muting a stem is a genuine removal, not a fade.
//     5. Split the HARMONIC stream by crossover biquads into
//          bass  = LP(H, 250 Hz)
//          air   = HP(H, 2600 Hz)
//          body  = H − bass − air     (guarantees bass+body+air === H exactly)
//        Final stems: [percussive, bass, body, air].
//
//   The work is chunked with `await` yields and reports progress so the UI
//   (and the synthetic bed) stay alive during separation.
// ─────────────────────────────────────────────────────────────────────────────

import { runSTFT, runISTFT } from "./stft";

export const STEM_NAMES = ["percussive", "bass", "body", "air"] as const;
export type StemName = (typeof STEM_NAMES)[number];

export interface SeparatedStems {
  percussive: Float32Array;
  bass: Float32Array;
  body: Float32Array;
  air: Float32Array;
  sampleRate: number;
}

const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

/** Median of the values currently in scratch[0..len). Small windows → sort. */
function medianOf(scratch: Float32Array, len: number): number {
  // insertion sort — len is small (odd, ~17)
  for (let i = 1; i < len; i++) {
    const v = scratch[i];
    let j = i - 1;
    while (j >= 0 && scratch[j] > v) {
      scratch[j + 1] = scratch[j];
      j--;
    }
    scratch[j + 1] = v;
  }
  return scratch[len >> 1];
}

// ── RBJ biquad crossover (direct form I, one forward pass) ────────────────────
interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function makeLowpass(sr: number, f0: number, q: number): Biquad {
  const w0 = (2 * Math.PI * f0) / sr;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cw) / 2) / a0,
    b1: (1 - cw) / a0,
    b2: ((1 - cw) / 2) / a0,
    a1: (-2 * cw) / a0,
    a2: (1 - alpha) / a0,
  };
}

function makeHighpass(sr: number, f0: number, q: number): Biquad {
  const w0 = (2 * Math.PI * f0) / sr;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cw) / 2) / a0,
    b1: -(1 + cw) / a0,
    b2: ((1 + cw) / 2) / a0,
    a1: (-2 * cw) / a0,
    a2: (1 - alpha) / a0,
  };
}

function runBiquad(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    y[i] = yi;
  }
  return y;
}

/**
 * Separate a mono signal into four stems. `onProgress(0..1, label)` is called
 * as the stages advance.
 */
export async function separateStems(
  mono: Float32Array,
  sampleRate: number,
  onProgress: (fraction: number, label: string) => void,
): Promise<SeparatedStems> {
  const N = 2048;
  const HOP = 512;
  const L_TIME = 17; // median window along time (harmonic)
  const L_FREQ = 17; // median window along frequency (percussive)
  const P = 2; // mask exponent

  onProgress(0.02, "analyzing spectrum");
  await yieldToUI();
  const spec = runSTFT(mono, N, HOP);
  const { mag, frames, bins } = spec;

  const H = new Float32Array(frames * bins);
  const Pm = new Float32Array(frames * bins);
  const scratch = new Float32Array(Math.max(L_TIME, L_FREQ));

  // Harmonic estimate: median along TIME, per frequency bin.
  const halfT = L_TIME >> 1;
  for (let b = 0; b < bins; b++) {
    for (let f = 0; f < frames; f++) {
      let len = 0;
      for (let k = -halfT; k <= halfT; k++) {
        const ff = f + k;
        if (ff >= 0 && ff < frames) scratch[len++] = mag[ff * bins + b];
      }
      H[f * bins + b] = medianOf(scratch, len);
    }
    if ((b & 63) === 0) {
      onProgress(0.05 + 0.4 * (b / bins), "estimating harmonic layer");
      await yieldToUI();
    }
  }

  // Percussive estimate: median along FREQUENCY, per time frame.
  const halfF = L_FREQ >> 1;
  for (let f = 0; f < frames; f++) {
    const base = f * bins;
    for (let b = 0; b < bins; b++) {
      let len = 0;
      for (let k = -halfF; k <= halfF; k++) {
        const bb = b + k;
        if (bb >= 0 && bb < bins) scratch[len++] = mag[base + bb];
      }
      Pm[base + b] = medianOf(scratch, len);
    }
    if ((f & 63) === 0) {
      onProgress(0.45 + 0.35 * (f / frames), "estimating percussive layer");
      await yieldToUI();
    }
  }

  // Soft mask Mh = H^p / (H^p + P^p); store in-place in H.
  const eps = 1e-9;
  for (let i = 0; i < H.length; i++) {
    const h = Math.pow(H[i], P);
    const p = Math.pow(Pm[i], P);
    H[i] = h / (h + p + eps);
  }
  onProgress(0.82, "resynthesizing streams");
  await yieldToUI();

  const harmonic = runISTFT(spec, H, false); // mask = Mh
  await yieldToUI();
  let percussive = runISTFT(spec, H, true); // mask = 1 - Mh
  await yieldToUI();

  onProgress(0.92, "splitting harmonic bands");
  // Crossover split of the harmonic stream.
  const bass = runBiquad(runBiquad(harmonic, makeLowpass(sampleRate, 250, 0.707)), makeLowpass(sampleRate, 250, 0.707));
  const air = runBiquad(runBiquad(harmonic, makeHighpass(sampleRate, 2600, 0.707)), makeHighpass(sampleRate, 2600, 0.707));
  const body = new Float32Array(harmonic.length);
  for (let i = 0; i < body.length; i++) body[i] = harmonic[i] - bass[i] - air[i];

  // Gentle peak normalization across the full mix so recorded audio has headroom.
  const len = Math.min(percussive.length, harmonic.length);
  let peak = 1e-6;
  for (let i = 0; i < len; i++) {
    const s = percussive[i] + bass[i] + body[i] + air[i];
    const a = Math.abs(s);
    if (a > peak) peak = a;
  }
  const g = Math.min(1, 0.9 / peak);
  if (g < 1) {
    for (let i = 0; i < percussive.length; i++) percussive[i] *= g;
    for (let i = 0; i < bass.length; i++) bass[i] *= g;
    for (let i = 0; i < body.length; i++) body[i] *= g;
    for (let i = 0; i < air.length; i++) air[i] *= g;
  }
  // trim percussive to matching length for buffer creation
  if (percussive.length > body.length) percussive = percussive.subarray(0, body.length);

  onProgress(1, "done");
  await yieldToUI();
  return { percussive, bass, body, air, sampleRate };
}
