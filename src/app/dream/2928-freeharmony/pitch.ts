// ─────────────────────────────────────────────────────────────────────────────
// 2928 · FREE HARMONY — monophonic pitch detection (YIN)
// A YIN pitch tracker with parabolic interpolation, reading the mic's
// time-domain buffer pulled from an AnalyserNode inside a rAF loop. Emits a
// CONTINUOUS MIDI pitch (never snapped to a scale) plus a confidence/voicing
// gate so silence and noise don't pollute the harmony histogram.
// ─────────────────────────────────────────────────────────────────────────────

export interface PitchResult {
  f0: number; // Hz
  midi: number; // continuous MIDI note number
  confidence: number; // 0..1 voicing confidence
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const YIN_THRESHOLD = 0.15;
const RMS_GATE = 0.006; // below this = silence
const MIN_HZ = 65; // ~C2
const MAX_HZ = 1100; // ~C6

/**
 * Detect the fundamental of a time-domain buffer using YIN.
 * Returns null when unvoiced (silence, noise, or no clear period).
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
): PitchResult | null {
  const size = buf.length;
  const halfSize = size >> 1;

  // Voicing gate 1: RMS energy.
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < RMS_GATE) return null;

  // Step 1: difference function.
  const yin = new Float32Array(halfSize);
  for (let tau = 1; tau < halfSize; tau++) {
    let sum = 0;
    for (let i = 0; i < halfSize; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    yin[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference.
  yin[0] = 1;
  let running = 0;
  for (let tau = 1; tau < halfSize; tau++) {
    running += yin[tau];
    yin[tau] = running > 0 ? (yin[tau] * tau) / running : 1;
  }

  // Step 3: absolute threshold — first dip below threshold, then local min.
  let tau = -1;
  for (let t = 2; t < halfSize; t++) {
    if (yin[t] < YIN_THRESHOLD) {
      while (t + 1 < halfSize && yin[t + 1] < yin[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null; // no periodicity found → unvoiced

  // Step 4: parabolic interpolation around the chosen lag.
  let betterTau = tau;
  if (tau > 1 && tau < halfSize - 1) {
    const s0 = yin[tau - 1];
    const s1 = yin[tau];
    const s2 = yin[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }

  const f0 = sampleRate / betterTau;
  if (f0 < MIN_HZ || f0 > MAX_HZ) return null;

  // Confidence: periodicity clarity (1 - aperiodicity) tempered by loudness.
  const clarity = Math.max(0, Math.min(1, 1 - yin[tau]));
  const loud = Math.min(1, rms / 0.03);
  const confidence = clarity * loud;

  return { f0, midi: freqToMidi(f0), confidence };
}
