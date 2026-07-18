// Monophonic pitch detection via the YIN algorithm, implemented from the
// mic time-domain buffer (no library). YIN = autocorrelation's cumulative-mean
// normalized difference function + absolute threshold + parabolic interpolation.
// Reference: de Cheveigné & Kawahara, "YIN, a fundamental frequency estimator
// for speech and music" (JASA 2002).

export interface PitchResult {
  /** Fundamental frequency in Hz, or -1 when no confident pitch. */
  freq: number;
  /** Confidence 0..1 (1 - normalized difference at the chosen lag). */
  clarity: number;
  /** RMS amplitude of the analysed window, 0..1. */
  rms: number;
}

const SILENT: PitchResult = { freq: -1, clarity: 0, rms: 0 };

/**
 * Detect the fundamental of a time-domain buffer.
 * Search is bounded to the singing range (~70–1000 Hz) to keep the O(W^2)
 * difference function affordable at interactive rates.
 */
export function detectPitchYin(
  buf: Float32Array,
  sampleRate: number,
  threshold = 0.12
): PitchResult {
  const n = buf.length;
  const W = Math.floor(n / 2);

  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.006) return { ...SILENT, rms };

  const tauMin = Math.max(2, Math.floor(sampleRate / 1000));
  const tauMax = Math.min(W - 1, Math.floor(sampleRate / 70));

  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalized difference.
  const dp = new Float32Array(tauMax + 1);
  dp[tauMin] = 1;
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += d[tau];
    dp[tau] = running > 0 ? (d[tau] * (tau - tauMin + 1)) / running : 1;
  }

  // First lag under the absolute threshold that is a local minimum.
  let tauEst = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (dp[tau] < threshold) {
      while (tau + 1 <= tauMax && dp[tau + 1] < dp[tau]) tau++;
      tauEst = tau;
      break;
    }
  }

  if (tauEst === -1) {
    // No lag beat the threshold: fall back to the global minimum, but only
    // trust it if it is at least reasonably periodic.
    let minTau = tauMin;
    let minVal = dp[tauMin];
    for (let tau = tauMin + 1; tau <= tauMax; tau++) {
      if (dp[tau] < minVal) {
        minVal = dp[tau];
        minTau = tau;
      }
    }
    if (minVal > 0.55) return { ...SILENT, rms };
    tauEst = minTau;
  }

  // Parabolic interpolation around the chosen lag for sub-sample precision.
  const x0 = tauEst > tauMin ? tauEst - 1 : tauEst;
  const x2 = tauEst + 1 <= tauMax ? tauEst + 1 : tauEst;
  const s0 = dp[x0];
  const s1 = dp[tauEst];
  const s2 = dp[x2];
  const denom = 2 * (2 * s1 - s2 - s0);
  const betterTau = denom !== 0 ? tauEst + (s2 - s0) / denom : tauEst;

  const freq = sampleRate / betterTau;
  const clarity = Math.max(0, Math.min(1, 1 - dp[tauEst]));
  if (freq < 70 || freq > 1000) return { ...SILENT, rms };
  return { freq, clarity, rms };
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

/** e.g. 60 -> "C4". Rounds to the nearest chromatic pitch. */
export function midiToName(midi: number): string {
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const octave = Math.floor(m / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}

/** Cents deviation of a frequency from the nearest chromatic pitch, -50..50. */
export function centsOff(freq: number): number {
  const m = freqToMidi(freq);
  return Math.round((m - Math.round(m)) * 100);
}
