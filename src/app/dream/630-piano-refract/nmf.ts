// nmf.ts — Register-seeded (warm-start) Non-negative Matrix Factorization of the
// HARMONIC (strings) magnitude spectrogram from HPSS.
//
// References:
//   D. D. Lee & H. S. Seung, "Learning the parts of objects by non-negative
//     matrix factorization", Nature 1999 — the multiplicative-update NMF.
//   P. Smaragdis & J. C. Brown, "Non-negative matrix factorization for
//     polyphonic music transcription", WASPAA 2003 — NMF on music spectrograms,
//     and the supervised / seeded-basis idea this module leans on.
//
// V ≈ W · H   with V = bins×frames magnitude, W = bins×K basis,
//   H = K×frames activations, K = 4. KL-divergence multiplicative updates.
//
// LEGIBILITY STRATEGY — register-seeded warm start:
//   Random init makes the K components abstract and unstable run-to-run. Instead
//   we WARM-START W: each of the 4 basis columns is a smooth Gaussian-in-log-
//   frequency band centered at ~150 / ~350 / ~800 / ~1800 Hz (low / low-mid /
//   high-mid / high), with a small positive floor everywhere so updates can
//   still move spectral mass. This biases each component to converge to a
//   stable, nameable register regardless of run, and we keep the low→high seed
//   order as the final component order.

import { istft, TARGET_SR, FFT_SIZE, HOP } from "./hpss";

export const K = 4;
const EPS = 1e-9;
const ITERS = 70;
// Process this many iterations between yields so the UI never hard-freezes.
const ITERS_PER_CHUNK = 6;

/** Center frequencies (Hz) for the 4 register seeds, low→high. */
export const SEED_HZ = [150, 350, 800, 1800];
/** Human labels in the same low→high order. */
export const COMPONENT_LABELS = ["Low", "Low-mid", "High-mid", "High"] as const;

export interface NmfComponent {
  label: string;
  basis: Float32Array; // length = bins, the W[:,k] spectral profile (normalized)
  activation: Float32Array; // length = frames, the H[k,:] activation over time
  pcm: Float32Array; // looping mono PCM at TARGET_SR for this component
}

export interface NmfResult {
  components: NmfComponent[]; // length K, ordered low→high
  bins: number;
  frames: number;
  sampleRate: number;
}

export type NmfProgressCb = (fraction: number, label: string) => void;

function nextTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Frequency (Hz) of FFT bin index b at the analysis sample rate. */
function binToHz(b: number): number {
  return (b * TARGET_SR) / FFT_SIZE;
}

/**
 * Build the warm-start basis W (bins×K) as Gaussian-in-log-frequency bumps
 * centered at SEED_HZ, with a positive floor everywhere. Returned row-major as
 * W[b*K + k].
 */
function seedBasis(bins: number): Float32Array {
  const W = new Float32Array(bins * K);
  // Width of each log-Gaussian, in natural-log-Hz units (≈ +/- ~1 octave sigma).
  const sigma = 0.7;
  const floor = 0.02; // keeps every bin non-zero so updates can move mass.
  for (let k = 0; k < K; k++) {
    const logCenter = Math.log(SEED_HZ[k]);
    for (let b = 0; b < bins; b++) {
      const hz = Math.max(1, binToHz(b));
      const d = Math.log(hz) - logCenter;
      const bump = Math.exp(-(d * d) / (2 * sigma * sigma));
      W[b * K + k] = floor + bump;
    }
  }
  return W;
}

/**
 * Run register-seeded KL-NMF on the harmonic magnitude spectrogram, then build
 * one looping PCM buffer per component by soft-masking the ORIGINAL complex
 * harmonic STFT (phase preserved) and running ISTFT.
 *
 * @param mag      frame-major magnitude (frame*bins + bin) of the harmonic STFT
 * @param hRe      real part of the harmonic complex STFT (same layout)
 * @param hIm      imag part of the harmonic complex STFT
 * @param frames   number of STFT frames
 * @param bins     number of frequency bins (513)
 * @param outLen   samples of the harmonic PCM slice (for ISTFT length)
 */
export async function runNmf(
  mag: Float32Array,
  hRe: Float32Array,
  hIm: Float32Array,
  frames: number,
  bins: number,
  outLen: number,
  onProgress: NmfProgressCb,
): Promise<NmfResult> {
  onProgress(0, "seeding registers");
  await nextTick();

  // V is bins×frames; we keep it as V[b*frames + f] for cache-friendly updates.
  const V = new Float32Array(bins * frames);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bins; b++) {
      V[b * frames + f] = mag[f * bins + b];
    }
  }

  // Warm-started basis W (bins×K, row-major b*K+k).
  const W = seedBasis(bins);

  // Activations H (K×frames, row-major k*frames+f) — start flat-positive; the
  // seeded W carries the register prior, H learns the time envelope.
  const H = new Float32Array(K * frames);
  H.fill(0.5);

  // Scratch reconstruction WH (bins×frames) and ratio R = V / WH.
  const WH = new Float32Array(bins * frames);
  const R = new Float32Array(bins * frames);

  const computeWH = () => {
    for (let b = 0; b < bins; b++) {
      const wRow = b * K;
      for (let f = 0; f < frames; f++) {
        let s = 0;
        for (let k = 0; k < K; k++) s += W[wRow + k] * H[k * frames + f];
        WH[b * frames + f] = s + EPS;
      }
    }
  };

  for (let it = 0; it < ITERS; it++) {
    // ── KL multiplicative update for H ──
    computeWH();
    for (let i = 0; i < bins * frames; i++) R[i] = V[i] / WH[i];
    for (let k = 0; k < K; k++) {
      for (let f = 0; f < frames; f++) {
        let num = 0;
        let den = 0;
        for (let b = 0; b < bins; b++) {
          const w = W[b * K + k];
          num += w * R[b * frames + f];
          den += w;
        }
        H[k * frames + f] *= num / (den + EPS);
      }
    }

    // ── KL multiplicative update for W ──
    computeWH();
    for (let i = 0; i < bins * frames; i++) R[i] = V[i] / WH[i];
    for (let b = 0; b < bins; b++) {
      for (let k = 0; k < K; k++) {
        let num = 0;
        let den = 0;
        for (let f = 0; f < frames; f++) {
          const h = H[k * frames + f];
          num += h * R[b * frames + f];
          den += h;
        }
        W[b * K + k] *= num / (den + EPS);
      }
    }

    if ((it + 1) % ITERS_PER_CHUNK === 0 || it === ITERS - 1) {
      onProgress((it + 1) / ITERS, `factorizing (iter ${it + 1}/${ITERS})`);
      await nextTick();
    }
  }

  onProgress(1, "refracting strings");
  await nextTick();

  // ── Build per-component soft Wiener masks and synthesize PCM. ──
  // For component k: Vk = outer(W[:,k], H[k,:]); mask Mk = Vk / (Σj Vj + EPS);
  // apply Mk to ORIGINAL complex harmonic STFT (scale re AND im → keep phase).
  const components: NmfComponent[] = [];

  // Precompute the per-component reconstructions lazily inside the mask loop.
  for (let k = 0; k < K; k++) {
    const cRe = new Float32Array(frames * bins);
    const cIm = new Float32Array(frames * bins);
    for (let f = 0; f < frames; f++) {
      for (let b = 0; b < bins; b++) {
        // Σj Vj at (b,f).
        let total = 0;
        let vk = 0;
        for (let j = 0; j < K; j++) {
          const v = W[b * K + j] * H[j * frames + f];
          total += v;
          if (j === k) vk = v;
        }
        const m = vk / (total + EPS);
        const idx = f * bins + b;
        cRe[idx] = hRe[idx] * m;
        cIm[idx] = hIm[idx] * m;
      }
    }
    const pcm = istft(cRe, cIm, frames, outLen);
    normalizePeak(pcm, 0.85);

    // Basis profile W[:,k] (length bins), normalized for the visual.
    const basis = new Float32Array(bins);
    let bmax = 0;
    for (let b = 0; b < bins; b++) {
      const v = W[b * K + k];
      basis[b] = v;
      if (v > bmax) bmax = v;
    }
    if (bmax > EPS) for (let b = 0; b < bins; b++) basis[b] /= bmax;

    // Activation H[k,:] (length frames), normalized for the visual.
    const activation = new Float32Array(frames);
    let amax = 0;
    for (let f = 0; f < frames; f++) {
      const v = H[k * frames + f];
      activation[f] = v;
      if (v > amax) amax = v;
    }
    if (amax > EPS) for (let f = 0; f < frames; f++) activation[f] /= amax;

    components.push({
      label: COMPONENT_LABELS[k],
      basis,
      activation,
      pcm,
    });
  }

  // Components are already low→high by construction of SEED_HZ / seedBasis.
  void HOP;
  return {
    components,
    bins,
    frames,
    sampleRate: TARGET_SR,
  };
}

/** Scale a signal in place so its absolute peak hits `peak`. */
function normalizePeak(buf: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > max) max = a;
  }
  if (max < EPS) return;
  const g = peak / max;
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
}
