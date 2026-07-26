// Live pitch detection: mic → AnalyserNode time-domain buffer → fundamental
// frequency → continuous (float) MIDI. Uses a YIN-style difference function
// (more robust to octave errors than raw autocorrelation) with parabolic
// interpolation for sub-sample refinement, plus an energy/clarity gate so
// silence and breath don't register as notes.
//
// The result is ALWAYS a continuous log-frequency pitch — it is never snapped
// to a scale.

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface PitchResult {
  hz: number;
  midi: number;
  clarity: number; // 0..1, higher = more periodic
  rms: number;
  voiced: boolean;
}

const UNVOICED: PitchResult = { hz: 0, midi: 0, clarity: 0, rms: 0, voiced: false };

export interface PitchOptions {
  rmsGate?: number; // minimum RMS to consider voiced
  clarityGate?: number; // minimum periodicity (1 - YIN dip)
}

// Reusable scratch buffer for the difference function.
let diffBuf: Float32Array | null = null;

/** Detect the fundamental of a time-domain frame. `buf` should be float PCM
 *  in roughly [-1, 1] from `AnalyserNode.getFloatTimeDomainData`. */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: PitchOptions = {},
): PitchResult {
  const { rmsGate = 0.012, clarityGate = 0.72 } = opts;

  const win = Math.min(1024, buf.length);
  let energy = 0;
  for (let i = 0; i < win; i++) energy += buf[i] * buf[i];
  const rms = Math.sqrt(energy / win);
  if (rms < rmsGate) return UNVOICED;

  const minTau = Math.max(2, Math.floor(sampleRate / 1000)); // up to ~1000 Hz
  const maxTau = Math.min(win - 1, Math.floor(sampleRate / 70)); // down to ~70 Hz
  if (maxTau <= minTau) return UNVOICED;

  if (!diffBuf || diffBuf.length < maxTau + 1) {
    diffBuf = new Float32Array(maxTau + 1);
  }
  const d = diffBuf;

  // YIN step 1: squared difference function.
  d[0] = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    const lim = win - tau;
    for (let i = 0; i < lim; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // YIN step 2: cumulative mean normalized difference.
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // YIN step 3: absolute threshold — first dip below (1 - clarityGate).
  const threshold = 1 - clarityGate;
  let bestTau = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (d[tau] < threshold) {
      // walk to the local minimum of this dip
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  // Fallback: global minimum in the search band.
  if (bestTau < 0) {
    let minVal = Infinity;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (d[tau] < minVal) {
        minVal = d[tau];
        bestTau = tau;
      }
    }
    if (bestTau < 0 || minVal > 0.6) return UNVOICED; // too noisy
  }

  // Parabolic interpolation around bestTau for sub-sample period.
  let tauEst = bestTau;
  if (bestTau > minTau && bestTau < maxTau) {
    const y0 = d[bestTau - 1];
    const y1 = d[bestTau];
    const y2 = d[bestTau + 1];
    const denom = 2 * (2 * y1 - y0 - y2);
    if (denom !== 0) {
      tauEst = bestTau + (y2 - y0) / denom;
    }
  }

  const hz = sampleRate / tauEst;
  if (!isFinite(hz) || hz <= 0) return UNVOICED;
  const clarity = Math.max(0, Math.min(1, 1 - d[bestTau]));
  return { hz, midi: hzToMidi(hz), clarity, rms, voiced: true };
}
