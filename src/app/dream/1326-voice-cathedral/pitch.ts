/* ───────────────────────────────────────────────────────────────────────────
   pitch.ts — pure, dependency-free pitch detection for Voice Cathedral.

   Real-time fundamental-frequency estimation from a float time-domain buffer
   using normalized autocorrelation (a YIN-lite approach): an RMS silence gate,
   normalized autocorrelation across a candidate lag range, the first strong peak
   after the correlation dips below zero (so we recover the fundamental, not an
   octave-down sub-harmonic), parabolic interpolation for sub-sample accuracy,
   and a clarity gate so noisy / unvoiced frames are rejected. Returns -1 when no
   confident pitch is present.

   Framework-free on purpose so it bundles cleanly into the Next build and can be
   reasoned about in isolation. A sustained sung/hummed tone is the whole gesture
   of the piece, so a stable fundamental estimate matters more than latency.
─────────────────────────────────────────────────────────────────────────── */

export const PITCH_MIN_HZ = 65; // ~C2 — below a low hum
export const PITCH_MAX_HZ = 1000; // above a sung high note
export const RMS_GATE = 0.012; // silence floor; quieter frames → -1
export const CLARITY_GATE = 0.9; // normalized peak correlation must clear this

/**
 * Detect the fundamental frequency (Hz) of a single time-domain frame.
 * @param buffer      Float32 samples in roughly [-1, 1].
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

  // 4) First strong peak after the correlation dips below zero (recovers the
  //    fundamental instead of an octave-down error).
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

/** Frequency (Hz) → fractional MIDI note number. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/** MIDI note number → frequency (Hz). */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// A soft, always-consonant scale: C major pentatonic pitch classes.
const SCALE_PCS = [0, 2, 4, 7, 9];

/** Snap a (fractional) MIDI note to the nearest pentatonic scale tone, keeping
 *  it near its original octave. Guarantees the seeded drone is consonant. */
export function snapToScale(midi: number): number {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  let bestPc = SCALE_PCS[0];
  let bestDist = 99;
  for (const t of SCALE_PCS) {
    let d = Math.abs(pc - t);
    d = Math.min(d, 12 - d);
    if (d < bestDist) {
      bestDist = d;
      bestPc = t;
    }
  }
  const baseOctave = Math.floor(rounded / 12);
  let snapped = baseOctave * 12 + bestPc;
  let snapDist = Math.abs(snapped - midi);
  for (const o of [baseOctave - 1, baseOctave + 1]) {
    const cand = o * 12 + bestPc;
    const dist = Math.abs(cand - midi);
    if (dist < snapDist) {
      snapDist = dist;
      snapped = cand;
    }
  }
  return snapped;
}
