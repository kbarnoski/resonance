/* ───────────────────────────────────────────────────────────────────────────
   pitch.ts — dependency-free voice analysis for "Tanpura Throat".

   Two jobs, both pure so they can run inside the animation loop without any
   framework or npm dependency:

     1) detectPitchHz — fundamental-frequency estimation from a time-domain
        frame using normalized autocorrelation (a YIN-lite approach) with an
        RMS silence gate, first-strong-peak selection (to dodge octave-down
        errors) and parabolic interpolation of the peak for sub-sample accuracy.

     2) bandEnergyDb / normDb — read the loudness sitting near a target
        frequency out of an FFT magnitude frame. Called once per sympathetic
        string so each string can be excited by the energy the voice puts into
        that partial.

   Plus a seeded mulberry32 PRNG so the autonomous "cantor" and the visuals are
   deterministic — we seed once and never touch Math.random in a hot loop.
─────────────────────────────────────────────────────────────────────────── */

export const PITCH_MIN_HZ = 80; // a little below a low male drone
export const PITCH_MAX_HZ = 1000; // above a sung high note
export const RMS_GATE = 0.008; // silence floor; quieter frames → -1
export const CLARITY_GATE = 0.7; // normalized peak correlation must clear this

/** Deterministic PRNG. Seed once, then pull values — never Math.random in a
 *  hot loop. Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convert a frequency in Hz to a (fractional) MIDI note number. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** Convert a MIDI note number back to Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Detect the fundamental frequency (Hz) of a single time-domain frame.
 * @returns frequency in Hz, or -1 if no confident pitch is found.
 */
export function detectPitchHz(buffer: Float32Array, sampleRate: number): number {
  const size = buffer.length;
  if (size < 4) return -1;

  // 1) RMS gate — bail out on silence.
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < RMS_GATE) return -1;

  // 2) Candidate lag range from the band of interest.
  const minLag = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / PITCH_MIN_HZ));
  if (maxLag <= minLag) return -1;

  // 3) Normalized autocorrelation across the lag range. Normalizing by the
  //    energy of both windows keeps the peak in [-1, 1] regardless of loudness.
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e0 = 0;
    let e1 = 0;
    const lim = size - lag;
    for (let i = 0; i < lim; i++) {
      const a = buffer[i];
      const b = buffer[i + lag];
      sum += a * b;
      e0 += a * a;
      e1 += b * b;
    }
    const denom = Math.sqrt(e0 * e1);
    corr[lag] = denom > 0 ? sum / denom : 0;
  }

  // 4) First strong peak after the correlation dips below zero. For a periodic
  //    signal the correlation is ~1 at every multiple of the true period, so
  //    the smallest qualifying lag recovers the fundamental, not a sub-harmonic.
  let dipped = false;
  let bestLag = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const v = corr[lag];
    if (!dipped && v < 0) dipped = true;
    if (!dipped) continue;
    if (v > CLARITY_GATE && v >= corr[lag - 1] && v >= corr[lag + 1]) {
      bestLag = lag;
      break;
    }
  }
  if (bestLag < 0) return -1;

  // 5) Parabolic interpolation around the peak for sub-sample lag accuracy.
  const y0 = corr[bestLag - 1];
  const y1 = corr[bestLag];
  const y2 = corr[bestLag + 1];
  const denom = y0 - 2 * y1 + y2;
  let refinedLag = bestLag;
  if (denom !== 0) refinedLag = bestLag - (0.5 * (y2 - y0)) / denom;
  if (refinedLag <= 0) return -1;

  return sampleRate / refinedLag;
}

/**
 * Peak magnitude (in dB) among the FFT bins nearest a target frequency.
 * `freqData` is the raw output of AnalyserNode.getFloatFrequencyData (dBFS,
 * typically -100..0). We take the peak rather than the mean so a partial that
 * lands between bins still registers.
 */
export function bandEnergyDb(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  targetHz: number,
  halfWidthBins = 2,
): number {
  const binHz = sampleRate / fftSize;
  const center = targetHz / binHz;
  const lo = Math.max(0, Math.floor(center - halfWidthBins));
  const hi = Math.min(freqData.length - 1, Math.ceil(center + halfWidthBins));
  let peak = -Infinity;
  for (let b = lo; b <= hi; b++) {
    if (freqData[b] > peak) peak = freqData[b];
  }
  return peak === -Infinity ? -120 : peak;
}

/** Map a dBFS reading (~ -95..-30) onto a normalized 0..1 excitation level. */
export function normDb(db: number): number {
  const n = (db + 95) / 65;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
