/* ───────────────────────────────────────────────────────────────────────────
   pitch.ts — pure, dependency-free pitch detection for Hum Blossom.

   Real-time fundamental-frequency estimation from a float time-domain buffer
   using normalized autocorrelation (a YIN-lite approach): RMS silence gate,
   normalized autocorrelation across a candidate lag range, first strong peak
   after the correlation dips, parabolic interpolation for sub-sample accuracy,
   and a clarity gate so noisy/unvoiced frames are rejected. Returns -1 when no
   confident pitch is present.

   This module is intentionally framework-free so it can be unit-tested with
   plain TS + console.assert (see pitch.test.ts) and bundled into next build
   without any test-runner imports.
─────────────────────────────────────────────────────────────────────────── */

export const PITCH_MIN_HZ = 70; // below child/adult speaking range
export const PITCH_MAX_HZ = 1200; // above a child's sung high notes
export const RMS_GATE = 0.01; // silence floor; frames quieter than this → -1
export const CLARITY_GATE = 0.8; // normalized peak correlation must clear this

/**
 * Detect the fundamental frequency (Hz) of a single time-domain frame.
 * @param buffer  Float32Array of samples in roughly [-1, 1].
 * @param sampleRate  Audio sample rate (e.g. 44100 or 48000).
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

  // 2) Candidate lag range from the frequency band of interest.
  const minLag = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / PITCH_MIN_HZ));
  if (maxLag <= minLag) return -1;

  // 3) Normalized autocorrelation across the lag range.
  //    Normalizing by the energy of both windows keeps the peak in [-1, 1] and
  //    makes the clarity gate meaningful regardless of loudness.
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

  // 4) Find the FIRST strong peak after the correlation has dipped below zero.
  //    For a periodic signal the normalized correlation is ~1 at every multiple
  //    of the true period, so taking the *first* qualifying local maximum (the
  //    smallest lag = highest frequency among the period multiples) recovers the
  //    fundamental instead of a sub-harmonic/octave-down error.
  let dipped = false;
  let bestLag = -1;
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const v = corr[lag];
    if (!dipped && v < 0) dipped = true;
    if (!dipped) continue;
    // first local maximum that clears the clarity gate wins
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

/** Convert a frequency in Hz to a (fractional) MIDI note number. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** Convert a MIDI note number back to Hz. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
