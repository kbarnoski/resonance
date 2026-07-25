// ─────────────────────────────────────────────────────────────────────────────
// prosody.ts — analysis for 2610-prosody-formant.
//
//   Extracts the *how* of a voice while discarding the *what*:
//     • f0  — autocorrelation with parabolic interpolation → continuous Hz
//             (NEVER snapped to a scale; microtonal by design), plus a clarity
//             value used to gate voiced / unvoiced.
//     • spectral envelope — the FFT magnitude spectrum reduced to a coarse set
//             of log-spaced band energies plus a rough F1/F2 peak estimate.
//             This is what carries vowel COLOR (/a/ vs /i/ vs /u/) with no words.
//     • intensity (RMS) and brightness (spectral centroid).
//
//   Also holds the seeded mulberry32 PRNG and the silent auto-demo contour:
//   a synthetic speech-prosody-plus-vowel sequence (declination, stressed
//   peaks, unvoiced gaps, wandering F1/F2) driven only by mulberry32(0x2610).
// ─────────────────────────────────────────────────────────────────────────────

/** Number of coarse spectral-envelope bands (the "vowel color" strata). */
export const BAND_COUNT = 5;

/** One analysed frame — the shared currency of synth + ribbon. */
export interface Frame {
  /** ms timestamp (performance.now-relative or demo clock). */
  t: number;
  /** true when the frame is voiced (pitched); false = breath / silence. */
  voiced: boolean;
  /** continuous fundamental in Hz (~70–400); microtonal, never quantized. */
  hz: number;
  /** autocorrelation clarity 0..1 (periodicity confidence). */
  clarity: number;
  /** loudness 0..1 (RMS, soft-scaled). */
  rms: number;
  /** spectral centroid in Hz (brightness). */
  centroid: number;
  /** estimated first formant centre (Hz). */
  f1: number;
  /** estimated second formant centre (Hz). */
  f2: number;
  /** coarse log-spaced band energies, each normalised 0..1 within the frame. */
  bands: number[];
}

// ── seeded PRNG ──────────────────────────────────────────────────────────────

/** mulberry32 — deterministic PRNG. The only source of randomness in this
 *  prototype (no Math.random / Date). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── f0: autocorrelation + parabolic interpolation ────────────────────────────

export interface PitchResult {
  hz: number;
  clarity: number;
  rms: number;
}

const F0_MIN = 70;
const F0_MAX = 400;

/** Estimate f0 from a time-domain frame via normalised autocorrelation with
 *  parabolic peak interpolation. Returns continuous Hz + clarity + RMS.
 *  hz = 0 when unvoiced (too quiet or too noisy to be pitched). */
export function trackF0(buf: Float32Array, sampleRate: number): PitchResult {
  const n = buf.length;

  // RMS (with a light DC removal).
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] - mean;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / n);

  if (rms < 0.006) return { hz: 0, clarity: 0, rms };

  const maxLag = Math.min(n - 1, Math.floor(sampleRate / F0_MIN));
  const minLag = Math.max(2, Math.floor(sampleRate / F0_MAX));

  // Zeroth-lag energy for normalisation.
  let r0 = 0;
  for (let i = 0; i < n; i++) {
    const v = buf[i] - mean;
    r0 += v * v;
  }
  if (r0 <= 0) return { hz: 0, clarity: 0, rms };

  // Find the best autocorrelation peak, skipping the initial descent so we
  // don't lock onto lag 0.
  let bestLag = -1;
  let bestVal = 0;
  let prev = 1;
  let descending = true;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i < n - lag; i++) {
      acc += (buf[i] - mean) * (buf[i + lag] - mean);
    }
    const norm = acc / r0;
    if (descending) {
      if (norm < prev) {
        prev = norm;
      } else {
        descending = false;
      }
    }
    if (!descending && norm > bestVal) {
      bestVal = norm;
      bestLag = lag;
    }
    prev = norm;
  }

  if (bestLag < 0 || bestVal < 0.3) return { hz: 0, clarity: bestVal, rms };

  // Parabolic interpolation around the integer peak for sub-sample precision
  // → smooth, microtonal Hz.
  const lag = bestLag;
  const ym = autocorrAt(buf, mean, lag - 1) / r0;
  const y0 = bestVal;
  const yp = autocorrAt(buf, mean, lag + 1) / r0;
  const denom = ym - 2 * y0 + yp;
  const shift = denom !== 0 ? (0.5 * (ym - yp)) / denom : 0;
  const refined = lag + Math.max(-1, Math.min(1, shift));
  const hz = sampleRate / refined;

  if (hz < F0_MIN || hz > F0_MAX) return { hz: 0, clarity: bestVal, rms };
  return { hz, clarity: bestVal, rms };
}

function autocorrAt(buf: Float32Array, mean: number, lag: number): number {
  if (lag <= 0 || lag >= buf.length) return 0;
  let acc = 0;
  for (let i = 0; i < buf.length - lag; i++) {
    acc += (buf[i] - mean) * (buf[i + lag] - mean);
  }
  return acc;
}

// ── spectral envelope (vowel color) ──────────────────────────────────────────

export interface Envelope {
  bands: number[];
  f1: number;
  f2: number;
  centroid: number;
}

// Log-spaced band edges (Hz) over the speech range that carries vowel colour.
const BAND_EDGES = [200, 500, 1000, 1800, 3000, 4500];
// Formant search windows.
const F1_LO = 250;
const F1_HI = 900;
const F2_LO = 900;
const F2_HI = 2700;

/** Reduce an FFT magnitude spectrum (dB values from getFloatFrequencyData) to a
 *  coarse envelope: BAND_COUNT log-spaced band energies (normalised within the
 *  frame) + rough F1/F2 peak frequencies + spectral centroid. */
export function trackEnvelope(
  freqDb: Float32Array,
  sampleRate: number,
  fftSize: number,
): Envelope {
  const bins = freqDb.length;
  const hzPerBin = sampleRate / fftSize;

  // dB → linear magnitude.
  const mag = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    mag[i] = Math.pow(10, freqDb[i] / 20);
  }

  // Coarse band energies.
  const bands = new Array<number>(BAND_COUNT).fill(0);
  for (let b = 0; b < BAND_COUNT; b++) {
    const lo = BAND_EDGES[b];
    const hi = BAND_EDGES[b + 1];
    let acc = 0;
    let count = 0;
    for (let i = 1; i < bins; i++) {
      const f = i * hzPerBin;
      if (f >= lo && f < hi) {
        acc += mag[i];
        count++;
      }
    }
    bands[b] = count > 0 ? acc / count : 0;
  }
  // Normalise bands within the frame so the *shape* (colour) is what shows.
  let bandMax = 1e-9;
  for (let b = 0; b < BAND_COUNT; b++) bandMax = Math.max(bandMax, bands[b]);
  for (let b = 0; b < BAND_COUNT; b++) bands[b] = bands[b] / bandMax;

  // Formant peak picks inside their windows.
  const f1 = peakFreq(mag, hzPerBin, F1_LO, F1_HI, 500);
  const f2 = peakFreq(mag, hzPerBin, F2_LO, F2_HI, 1500);

  // Spectral centroid (brightness).
  let num = 0;
  let den = 0;
  for (let i = 1; i < bins; i++) {
    const f = i * hzPerBin;
    num += f * mag[i];
    den += mag[i];
  }
  const centroid = den > 0 ? num / den : 0;

  return { bands, f1, f2, centroid };
}

function peakFreq(
  mag: Float32Array,
  hzPerBin: number,
  lo: number,
  hi: number,
  fallback: number,
): number {
  let bestF = fallback;
  let bestV = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = i * hzPerBin;
    if (f < lo || f > hi) continue;
    if (mag[i] > bestV) {
      bestV = mag[i];
      bestF = f;
    }
  }
  return bestF;
}

// ── seeded auto-demo contour ─────────────────────────────────────────────────
//
//   A wordless speech prosody: a loop of "phrases", each with declining pitch
//   (declination), a stressed peak, occasional unvoiced gaps, and a wandering
//   vowel (F1/F2) that traces a plausible sequence. Deterministic from the
//   seed — it both DRAWS the ribbon and SOUNDS the formant resynth.

/** Prototypical vowel formant targets (Hz), roughly /a e i o u/. */
const VOWELS: Array<{ f1: number; f2: number }> = [
  { f1: 730, f2: 1090 }, // a
  { f1: 530, f2: 1840 }, // e
  { f1: 270, f2: 2290 }, // i
  { f1: 570, f2: 840 }, //  o
  { f1: 300, f2: 870 }, //  u
];

interface DemoSeg {
  dur: number; // seconds
  voiced: boolean;
  vowel: number; // index into VOWELS
  base: number; // phrase-base f0 (Hz)
  stress: number; // added Hz at seg midpoint
  loud: number; // 0..1 target loudness
}

export interface DemoContour {
  /** total loop length in seconds. */
  duration: number;
  /** sample the contour at a given loop time; returns a full Frame. */
  frameAt: (tSec: number, clockMs: number) => Frame;
}

/** Build the deterministic demo contour from a seed (default 0x2610). */
export function makeDemoContour(seed = 0x2610): DemoContour {
  const rng = mulberry32(seed);
  const segs: DemoSeg[] = [];

  // Build ~6 phrases; each phrase = a few voiced syllables with declining
  // base pitch, sometimes separated by a short unvoiced (breath) gap.
  const phrases = 6;
  for (let p = 0; p < phrases; p++) {
    const phraseTop = 150 + rng() * 90; // starting pitch of the phrase
    const syl = 3 + Math.floor(rng() * 3); // syllables in the phrase
    for (let s = 0; s < syl; s++) {
      const decl = (s / syl) * (40 + rng() * 30); // declination over phrase
      segs.push({
        dur: 0.16 + rng() * 0.22,
        voiced: true,
        vowel: Math.floor(rng() * VOWELS.length),
        base: phraseTop - decl,
        stress: s === 1 ? 18 + rng() * 22 : rng() * 8,
        loud: 0.5 + rng() * 0.4,
      });
      // occasional unvoiced consonant-ish gap between syllables
      if (rng() < 0.4) {
        segs.push({
          dur: 0.05 + rng() * 0.08,
          voiced: false,
          vowel: Math.floor(rng() * VOWELS.length),
          base: phraseTop - decl,
          stress: 0,
          loud: 0.18 + rng() * 0.14,
        });
      }
    }
    // breath pause between phrases
    segs.push({
      dur: 0.22 + rng() * 0.2,
      voiced: false,
      vowel: 0,
      base: 120,
      stress: 0,
      loud: 0.08 + rng() * 0.06,
    });
  }

  // Cumulative timing.
  const starts: number[] = [];
  let acc = 0;
  for (const s of segs) {
    starts.push(acc);
    acc += s.dur;
  }
  const duration = acc;

  const frameAt = (tSec: number, clockMs: number): Frame => {
    const t = ((tSec % duration) + duration) % duration;
    // locate segment
    let idx = 0;
    for (let i = 0; i < segs.length; i++) {
      if (t >= starts[i]) idx = i;
      else break;
    }
    const seg = segs[idx];
    const local = (t - starts[idx]) / seg.dur; // 0..1 within seg

    // Smoothly cross-fade vowel toward the next segment for glide realism.
    const next = segs[(idx + 1) % segs.length];
    const va = VOWELS[seg.vowel];
    const vb = VOWELS[next.vowel];
    const blend = smoothstep(local) * 0.35;
    const f1 = va.f1 + (vb.f1 - va.f1) * blend;
    const f2 = va.f2 + (vb.f2 - va.f2) * blend;

    // Pitch: base + a stress arch + gentle vibrato + micro jitter.
    const arch = Math.sin(Math.PI * local) * seg.stress;
    const vib = Math.sin((clockMs / 1000) * 2 * Math.PI * 5.2) * 2.2;
    const jitter = Math.sin((clockMs / 1000) * 2 * Math.PI * 31) * 0.8;
    const hz = seg.voiced ? seg.base + arch + vib + jitter : 0;

    // Loudness envelope: rise/fall inside the segment.
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, local)));
    const rms = seg.loud * (0.55 + 0.45 * env);

    // Bands from formants: place energy near F1/F2, tilt down with frequency.
    const bands = bandsFromFormants(f1, f2, seg.voiced);
    const centroid = seg.voiced ? (f1 + f2) / 2 : 2600;

    return {
      t: clockMs,
      voiced: seg.voiced,
      hz,
      clarity: seg.voiced ? 0.9 : 0.1,
      rms,
      centroid,
      f1,
      f2,
      bands,
    };
  };

  return { duration, frameAt };
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Synthesize coarse band energies that peak near F1/F2 (voiced) or read as a
 *  high-tilted breath (unvoiced). Mirrors trackEnvelope's normalised output. */
function bandsFromFormants(f1: number, f2: number, voiced: boolean): number[] {
  const bands = new Array<number>(BAND_COUNT).fill(0);
  for (let b = 0; b < BAND_COUNT; b++) {
    const centre = (BAND_EDGES[b] + BAND_EDGES[b + 1]) / 2;
    if (voiced) {
      const d1 = Math.exp(-Math.pow((centre - f1) / 320, 2));
      const d2 = Math.exp(-Math.pow((centre - f2) / 420, 2));
      bands[b] = 0.15 + d1 + 0.85 * d2;
    } else {
      // breath: energy tilts toward the top bands
      bands[b] = 0.2 + 0.8 * (b / (BAND_COUNT - 1));
    }
  }
  let max = 1e-9;
  for (let b = 0; b < BAND_COUNT; b++) max = Math.max(max, bands[b]);
  for (let b = 0; b < BAND_COUNT; b++) bands[b] = bands[b] / max;
  return bands;
}
