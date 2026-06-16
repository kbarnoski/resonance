// chroma.ts — Pitch-class isolation via salience tracking + soft harmonic-comb masks.
//
// Cycle-3 of the piano-decomposition arc. Where 630 fanned the harmonic layer into
// 4 register BANDS via NMF, this goes finer: it attributes the harmonic STFT energy
// to the 12 PITCH CLASSES (chromas C, C#, … B) using a salience function built from
// harmonic combs, then builds a SOFT per-chroma mask that is a PARTITION OF UNITY
// over the 12 classes (so summed they reconstruct the harmonic layer, phase intact),
// ISTFTs each → 12 isolated pitch-class PCM buffers.
//
// References:
//   - T. Fujishima, "Realtime Chord Recognition of Musical Sound: A System Using
//     Common Lisp Music," ICMC 1999. (Pitch Class Profile / chroma — sum spectral
//     energy into 12 bins folding octaves.)
//   - A. Klapuri, "Multiple Fundamental Frequency Estimation by Summing Harmonic
//     Amplitudes," ISMIR 2006. (Salience = sum of partial amplitudes at integer
//     multiples of each candidate F0.)

import { FFT_SIZE, TARGET_SR, istft } from "./hpss";

export const CHROMA_COUNT = 12;
export const CHROMA_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

const FREQ_BINS = FFT_SIZE / 2 + 1; // 513
const EPS = 1e-8;

// Candidate fundamentals: piano-ish range, one per semitone, A4 = 440.
// We sweep MIDI 33 (A1 ≈ 55 Hz) .. MIDI 96 (C7 ≈ 2093 Hz). Each candidate's
// salience comes from summing harmonic-comb support; the candidate is then folded
// to its pitch class.
const MIDI_LO = 33;
const MIDI_HI = 96;
const PARTIALS = 6; // partials per harmonic comb
const PARTIAL_DECAY = 0.78; // weight of the h-th partial ∝ DECAY^(h-1)

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/** Pitch class (0..11) of a MIDI note, with C = 0. MIDI 60 = C4. */
function midiToChroma(m: number): number {
  return ((m % 12) + 12) % 12;
}

export interface ChromaResult {
  /** 12 isolated pitch-class PCM buffers at `sampleRate`. */
  buffers: Float32Array[];
  sampleRate: number;
  /** 12×frames chroma activation envelope (for the visual / level fallback). */
  activation: Float32Array; // CHROMA_COUNT * frames
  frames: number;
  /** Average chroma vector over the whole slice (12 numbers, normalized). */
  meanChroma: Float32Array;
}

export type ChromaProgress = (fraction: number, label: string) => void;

function nextTick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Build per-candidate harmonic-comb bin weights once (sparse: list of bins +
 * weights per candidate MIDI note). Bin index for a frequency f is round(f*N/SR).
 */
interface CombEntry {
  bin: number;
  w: number;
}
function buildCombs(): { chroma: number; entries: CombEntry[] }[] {
  const combs: { chroma: number; entries: CombEntry[] }[] = [];
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    const f0 = midiToHz(m);
    const entries: CombEntry[] = [];
    for (let h = 1; h <= PARTIALS; h++) {
      const f = f0 * h;
      const bin = Math.round((f * FFT_SIZE) / TARGET_SR);
      if (bin < 1 || bin >= FREQ_BINS) break;
      entries.push({ bin, w: Math.pow(PARTIAL_DECAY, h - 1) });
    }
    if (entries.length > 0) combs.push({ chroma: midiToChroma(m), entries });
  }
  return combs;
}

/**
 * Isolate 12 pitch classes from a harmonic-layer complex STFT.
 *
 * For every frame:
 *   1. salience[m] = Σ_partials w_h · mag[bin(h·f0)]  for each candidate note m
 *      (Klapuri-style summed harmonic amplitudes).
 *   2. Distribute each candidate's salience onto its comb bins → a per-CHROMA
 *      spectral "support" S_c[bin] (12 dense spectra). This folds octaves into
 *      pitch classes (Fujishima chroma) while keeping a per-bin profile.
 *   3. Soft mask M_c[bin] = S_c[bin] / (Σ_j S_j[bin] + ε)  → PARTITION OF UNITY:
 *      Σ_c M_c = 1 wherever any support exists, so the 12 masks repartition the
 *      original complex STFT exactly (phase preserved). Bins with no comb support
 *      are left to the dominant chroma's residual (handled by adding a tiny flat
 *      floor so silence isn't amplified).
 *   4. Apply each mask to the original re/im → 12 complex spectra → ISTFT.
 */
export async function isolateChromas(
  re: Float32Array,
  im: Float32Array,
  mag: Float32Array,
  frames: number,
  bins: number,
  outLen: number,
  onProgress: ChromaProgress,
): Promise<ChromaResult> {
  onProgress(0.02, "building harmonic combs");
  await nextTick();
  const combs = buildCombs();

  // Output complex spectra for each chroma.
  const reC: Float32Array[] = [];
  const imC: Float32Array[] = [];
  for (let c = 0; c < CHROMA_COUNT; c++) {
    reC.push(new Float32Array(frames * bins));
    imC.push(new Float32Array(frames * bins));
  }
  const activation = new Float32Array(CHROMA_COUNT * frames);
  const meanChroma = new Float32Array(CHROMA_COUNT);

  // Per-bin support for the 12 chromas, reused each frame.
  const support = new Float32Array(CHROMA_COUNT * bins);
  // Tiny flat floor so bins with no comb support repartition smoothly instead of
  // dumping into chroma 0; keeps the partition-of-unity well-conditioned.
  const FLOOR = 1e-4;

  for (let f = 0; f < frames; f++) {
    const base = f * bins;
    support.fill(FLOOR);

    // 1+2: salience per candidate, splatted onto its chroma's comb bins.
    for (let ci = 0; ci < combs.length; ci++) {
      const comb = combs[ci];
      let sal = 0;
      for (let e = 0; e < comb.entries.length; e++) {
        sal += comb.entries[e].w * mag[base + comb.entries[e].bin];
      }
      if (sal <= EPS) continue;
      const cBase = comb.chroma * bins;
      for (let e = 0; e < comb.entries.length; e++) {
        // weight each comb bin by the candidate salience * its partial weight.
        support[cBase + comb.entries[e].bin] += sal * comb.entries[e].w;
      }
    }

    // 3: partition-of-unity soft mask + apply to original complex STFT.
    for (let b = 0; b < bins; b++) {
      let denom = 0;
      for (let c = 0; c < CHROMA_COUNT; c++) denom += support[c * bins + b];
      denom += EPS;
      const r = re[base + b];
      const ii = im[base + b];
      for (let c = 0; c < CHROMA_COUNT; c++) {
        const mC = support[c * bins + b] / denom;
        reC[c][base + b] = r * mC;
        imC[c][base + b] = ii * mC;
      }
    }

    // Activation envelope = per-chroma masked magnitude energy this frame.
    for (let c = 0; c < CHROMA_COUNT; c++) {
      let en = 0;
      const cBase = c * bins;
      for (let b = 0; b < bins; b++) {
        const sup = support[cBase + b];
        // approximate masked energy without recomputing: support fraction * mag.
        en += sup;
      }
      activation[c * frames + f] = en;
    }

    if ((f & 31) === 0) {
      onProgress(0.05 + 0.55 * (f / frames), "salience masks");
      await nextTick();
    }
  }

  // Normalize activation per chroma to 0..1 and accumulate mean chroma.
  let actMax = EPS;
  for (let i = 0; i < activation.length; i++) if (activation[i] > actMax) actMax = activation[i];
  for (let i = 0; i < activation.length; i++) activation[i] /= actMax;
  for (let c = 0; c < CHROMA_COUNT; c++) {
    let s = 0;
    for (let f = 0; f < frames; f++) s += activation[c * frames + f];
    meanChroma[c] = s / frames;
  }
  let mcMax = EPS;
  for (let c = 0; c < CHROMA_COUNT; c++) if (meanChroma[c] > mcMax) mcMax = meanChroma[c];
  for (let c = 0; c < CHROMA_COUNT; c++) meanChroma[c] /= mcMax;

  // 4: ISTFT each chroma into a PCM buffer.
  const buffers: Float32Array[] = [];
  for (let c = 0; c < CHROMA_COUNT; c++) {
    onProgress(0.6 + 0.38 * (c / CHROMA_COUNT), `istft ${CHROMA_NAMES[c]}`);
    await nextTick();
    const pcm = istft(reC[c], imC[c], frames, outLen);
    buffers.push(pcm);
  }

  // Light normalization: scale all 12 by a common factor so the SUM peaks ~0.9
  // (preserves relative balance / the partition-of-unity reconstruction).
  let sumPeak = EPS;
  const probe = Math.min(outLen, buffers[0].length);
  for (let i = 0; i < probe; i++) {
    let s = 0;
    for (let c = 0; c < CHROMA_COUNT; c++) s += buffers[c][i];
    const a = Math.abs(s);
    if (a > sumPeak) sumPeak = a;
  }
  const g = 0.9 / sumPeak;
  for (let c = 0; c < CHROMA_COUNT; c++) {
    const buf = buffers[c];
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }

  onProgress(1, "done");
  return { buffers, sampleRate: TARGET_SR, activation, frames, meanChroma };
}
