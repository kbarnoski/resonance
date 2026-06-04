/**
 * pitch.ts — YIN-style monophonic pitch detection via normalized autocorrelation.
 * Quantizes detected pitch to D-Dorian scale.
 * Reference: Paul Brossier, "Automatic annotation of musical audio for interactive
 * applications", 2006; Chris Wilson's classic Web Audio autocorrelation demo.
 */

/** D-Dorian scale frequencies across 3 octaves.
 *  D E F G A B C — relative to D2 (73.4 Hz) up to D5 (~587 Hz).
 *  Semitone intervals from D: 0 2 3 5 7 9 10 (12).
 */
const D_DORIAN_SEMITONES = [0, 2, 3, 5, 7, 9, 10]; // relative to D
const D2_MIDI = 38; // MIDI note number for D2

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** All D-Dorian notes from D2 to D5 as Hz values */
export const DORIAN_FREQS_HZ: number[] = (() => {
  const freqs: number[] = [];
  for (let octave = 0; octave < 4; octave++) {
    for (const semi of D_DORIAN_SEMITONES) {
      const midi = D2_MIDI + octave * 12 + semi;
      const hz = midiToHz(midi);
      if (hz >= 70 && hz <= 600) freqs.push(hz);
    }
  }
  return freqs.sort((a, b) => a - b);
})();

/** Snap a frequency to the nearest D-Dorian note */
export function snapToDorian(hz: number): number {
  let best = DORIAN_FREQS_HZ[0];
  let bestDist = Infinity;
  for (const f of DORIAN_FREQS_HZ) {
    const dist = Math.abs(Math.log2(hz / f));
    if (dist < bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return best;
}

/**
 * Detect monophonic pitch from a PCM buffer using normalized autocorrelation.
 * Returns 0 if signal is too quiet or no confident pitch found.
 * @param buf  time-domain float samples
 * @param sr   sample rate
 * @param threshold  autocorrelation confidence threshold (0.82 is a good default)
 */
export function detectPitch(
  buf: Float32Array,
  sr: number,
  threshold = 0.82
): number {
  const n = buf.length;

  // RMS gate — below this, treat as silence
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return 0;

  // Normalized autocorrelation (NSDF)
  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s;
  }
  if (ac[0] === 0) return 0;

  const acn = new Float32Array(n);
  for (let i = 0; i < n; i++) acn[i] = ac[i] / ac[0];

  // Skip the initial drop then find first peak
  let minBin = 0;
  while (minBin < n - 1 && acn[minBin + 1] < acn[minBin]) minBin++;

  let maxVal = 0;
  let maxBin = minBin;
  for (let i = minBin; i < n; i++) {
    if (acn[i] > maxVal) {
      maxVal = acn[i];
      maxBin = i;
    }
  }

  if (maxVal < threshold) return 0;

  // Parabolic interpolation for sub-sample precision
  const y0 = acn[Math.max(0, maxBin - 1)];
  const y1 = acn[maxBin];
  const y2 = acn[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;

  const freq = sr / refined;
  if (freq < 70 || freq > 900) return 0;
  return freq;
}

/** Map a frequency to a 0..1 "pitch t" for visual use (log scale, D2–D5 range) */
export function pitchToT(hz: number): number {
  const lo = Math.log2(73.4); // D2
  const hi = Math.log2(587.3); // D5
  return Math.max(0, Math.min(1, (Math.log2(hz) - lo) / (hi - lo)));
}
