/**
 * formants.ts — Real-time vowel formant detection via FFT peak-picking.
 *
 * Approach:
 *  1. Get RMS from time-domain buffer; gate on silence.
 *  2. Smooth the log-magnitude FFT spectrum with a box kernel.
 *  3. Peak-pick the first dominant peak in the F1 band (~250–900 Hz)
 *     and the F2 band (~900–2800 Hz) via separate search windows.
 *  4. Use parabolic interpolation for sub-bin frequency accuracy.
 *  5. Classify the (F1, F2) pair via Mahalanobis-like distance on Bark scale
 *     against canonical Peterson–Barney centroids for {a, e, i, o, u}.
 *  6. Exponential smoothing on formant estimates and confidence over time.
 *
 * References:
 *  - Peterson, G. E., & Barney, H. L. (1952). Control methods used in a study
 *    of the vowels. JASA, 24(2), 175–184.
 *  - AURORA formant-to-tongue inversion model (arXiv:2603.17543, March 2026):
 *    raw formants are too abstract for naive users; use a proxy (color here).
 */

export type VowelId = "a" | "e" | "i" | "o" | "u";

export interface VowelResult {
  vowel: VowelId;
  /** 0–1 confidence of the best match */
  confidence: number;
  f1: number;
  f2: number;
  rms: number;
  /** true if signal is above RMS gate */
  active: boolean;
}

// ── Peterson–Barney canonical centroids (male average, Hz) ───────────────────
// Adapted from Table I of Peterson & Barney (1952).
const VOWEL_CENTROIDS: Record<VowelId, { f1: number; f2: number }> = {
  a: { f1: 730, f2: 1090 }, // "father" / "aaah"
  e: { f1: 400, f2: 1990 }, // "bead" / "eee"
  i: { f1: 270, f2: 2290 }, // "bit" / "ih"
  o: { f1: 570, f2: 840 },  // "boat" / "ooo"
  u: { f1: 300, f2: 870 },  // "boot" / "uuu"
};

const RMS_THRESHOLD = 0.018;

// Bark-scale approximation for perceptually-weighted distance
function barkApprox(hz: number): number {
  return 13 * Math.atan(0.00076 * hz) + 3.5 * Math.atan((hz / 7500) ** 2);
}

// ── Peak-picking helpers ──────────────────────────────────────────────────────

/** Find the bin index with the highest value in [loHz, hiHz]. */
function findPeakBin(
  spectrum: Float32Array,
  binHz: number,
  loHz: number,
  hiHz: number
): number {
  const loB = Math.max(0, Math.ceil(loHz / binHz));
  const hiB = Math.min(Math.floor(hiHz / binHz), spectrum.length - 1);
  let best = loB;
  for (let b = loB + 1; b <= hiB; b++) {
    if (spectrum[b] > spectrum[best]) best = b;
  }
  return best;
}

/** Parabolic interpolation around a peak bin for sub-bin frequency accuracy. */
function parabolicHz(
  spectrum: Float32Array,
  peak: number,
  binHz: number
): number {
  const y0 = spectrum[Math.max(0, peak - 1)];
  const y1 = spectrum[peak];
  const y2 = spectrum[Math.min(spectrum.length - 1, peak + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const offset = denom !== 0 ? (y0 - y2) / denom : 0;
  return (peak + offset) * binHz;
}

// ── Smoothing state (module-level; reset via resetFormantSmoother) ────────────

let smF1 = 500;
let smF2 = 1500;
let smRms = 0;
let smConf = 0;
let lastVowel: VowelId = "a";

const ALPHA_FORMANT = 0.15;
const ALPHA_RMS = 0.22;
const ALPHA_CONF = 0.12;

/** Reset all smoother state — call when audio restarts. */
export function resetFormantSmoother(): void {
  smF1 = 500;
  smF2 = 1500;
  smRms = 0;
  smConf = 0;
  lastVowel = "a";
}

// ── Main detection function ───────────────────────────────────────────────────

/**
 * Call every animation frame with freshly-fetched analyser data.
 *
 * @param freqData  Float32Array from analyser.getFloatFrequencyData() (dB)
 * @param timeData  Float32Array from analyser.getFloatTimeDomainData()
 * @param sampleRate audioContext.sampleRate
 * @param fftSize   analyser.fftSize
 */
export function detectVowel(
  freqData: Float32Array,
  timeData: Float32Array,
  sampleRate: number,
  fftSize: number
): VowelResult {
  const binHz = sampleRate / fftSize;

  // RMS gate
  let rms = 0;
  for (let i = 0; i < timeData.length; i++) rms += timeData[i] * timeData[i];
  rms = Math.sqrt(rms / timeData.length);
  smRms = smRms + ALPHA_RMS * (rms - smRms);

  if (smRms < RMS_THRESHOLD) {
    return {
      vowel: lastVowel,
      confidence: 0,
      f1: smF1,
      f2: smF2,
      rms: smRms,
      active: false,
    };
  }

  // Convert dB spectrum to smoothed linear magnitude (5-bin box kernel)
  const numBins = freqData.length;
  const smoothed = new Float32Array(numBins);
  const W = 5;
  for (let b = 0; b < numBins; b++) {
    let sum = 0;
    let cnt = 0;
    for (let k = -W; k <= W; k++) {
      const idx = b + k;
      if (idx >= 0 && idx < numBins) {
        sum += Math.pow(10, freqData[idx] / 20); // dB → linear amplitude
        cnt++;
      }
    }
    smoothed[b] = sum / cnt;
  }

  // F1 peak: 250–900 Hz
  const f1Peak = findPeakBin(smoothed, binHz, 250, 900);
  const rawF1 = parabolicHz(smoothed, f1Peak, binHz);

  // F2 peak: 900–2800 Hz (non-overlapping with F1 band)
  const f2Peak = findPeakBin(smoothed, binHz, 900, 2800);
  const rawF2 = parabolicHz(smoothed, f2Peak, binHz);

  // Smooth formant estimates
  smF1 = smF1 + ALPHA_FORMANT * (rawF1 - smF1);
  smF2 = smF2 + ALPHA_FORMANT * (rawF2 - smF2);

  // Classify via Bark-scale distance
  const f1Bark = barkApprox(smF1);
  const f2Bark = barkApprox(smF2);

  let bestVowel: VowelId = "a";
  let bestDist = Infinity;
  const dists: Record<VowelId, number> = { a: 0, e: 0, i: 0, o: 0, u: 0 };

  for (const vid of ["a", "e", "i", "o", "u"] as VowelId[]) {
    const c = VOWEL_CENTROIDS[vid];
    const cf1 = barkApprox(c.f1);
    const cf2 = barkApprox(c.f2);
    // Weight F2 slightly less (peak-picking is noisier at higher frequencies)
    const d = Math.sqrt((f1Bark - cf1) ** 2 + 0.65 * (f2Bark - cf2) ** 2);
    dists[vid] = d;
    if (d < bestDist) {
      bestDist = d;
      bestVowel = vid;
    }
  }

  // Softmax-based confidence
  const temp = 0.8;
  let expSum = 0;
  const exps: Record<VowelId, number> = { a: 0, e: 0, i: 0, o: 0, u: 0 };
  for (const vid of ["a", "e", "i", "o", "u"] as VowelId[]) {
    exps[vid] = Math.exp(-dists[vid] / temp);
    expSum += exps[vid];
  }
  const rawConf = expSum > 0 ? exps[bestVowel] / expSum : 0;
  smConf = smConf + ALPHA_CONF * (rawConf - smConf);
  lastVowel = bestVowel;

  return {
    vowel: bestVowel,
    confidence: smConf,
    f1: smF1,
    f2: smF2,
    rms: smRms,
    active: true,
  };
}

// ── Vowel color palettes ──────────────────────────────────────────────────────

export interface VowelPalette {
  /** CSS gradient stop hex colors [dark, mid, light] */
  grad: [string, string, string];
  /** Glow accent color (CSS string) */
  glow: string;
  /** Accent hex for other UI uses */
  accent: string;
  /** Human name for accessibility / kids display */
  label: string;
}

export const VOWEL_PALETTES: Record<VowelId, VowelPalette> = {
  a: {
    grad: ["#7b0f00", "#c0392b", "#f39c12"],
    glow: "hsl(15,100%,65%)",
    accent: "#f39c12",
    label: "aaah",
  },
  e: {
    grad: ["#064e1a", "#27ae60", "#d4f542"],
    glow: "hsl(88,90%,55%)",
    accent: "#d4f542",
    label: "eee",
  },
  i: {
    grad: ["#6a1200", "#d35400", "#f39c12"],
    glow: "hsl(32,95%,60%)",
    accent: "#e67e22",
    label: "iii",
  },
  o: {
    grad: ["#0a1a6e", "#2980b9", "#8e44ad"],
    glow: "hsl(220,80%,65%)",
    accent: "#9b59b6",
    label: "ooo",
  },
  u: {
    grad: ["#2c0560", "#6c3483", "#2471a3"],
    glow: "hsl(270,80%,70%)",
    accent: "#8e44ad",
    label: "uuu",
  },
};

// ── Attract-mode sequence ─────────────────────────────────────────────────────

export const ATTRACT_SEQUENCE: VowelId[] = ["a", "e", "o", "i", "u"];
