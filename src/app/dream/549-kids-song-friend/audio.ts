"use client";

// ── C-major pentatonic, ~2 octaves ──────────────────────────────────────────
// Note indices 0..(PENTA_MIDI.length-1) are what we store as a "song".
// C3 D3 E3 G3 A3 C4 D4 E4 G4 A4 C5 D5 E5 (13 degrees, ~2 octaves)
export const PENTA_MIDI = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76];
export const PENTA_COUNT = PENTA_MIDI.length;

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Quantize an arbitrary frequency (Hz) to the nearest pentatonic note index. */
export function freqToPentaIndex(freq: number): number {
  if (freq <= 0) return 0;
  const midi = 69 + 12 * Math.log2(freq / 440);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PENTA_MIDI.length; i++) {
    const d = Math.abs(PENTA_MIDI[i] - midi);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Pentatonic degree → hue. Spreads warm violet→pink→amber across the scale. */
export function indexToHue(index: number): number {
  const t = index / Math.max(1, PENTA_COUNT - 1);
  return Math.round(270 + t * 150) % 360;
}

// ── Forgiving autocorrelation pitch detection ────────────────────────────────
// Tuned for a 4-year-old: high, noisy, breathy. Returns {freq, rms, confident}.
export type PitchResult = { freq: number; rms: number; confident: boolean };

export function detectPitch(buf: Float32Array, sampleRate: number): PitchResult {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);

  // very low signal → silence
  if (rms < 0.006) return { freq: -1, rms, confident: false };

  // Trim leading/trailing quiet samples
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.18;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) r1 = i;
    else break;
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) r2 = SIZE - i;
    else break;
  }
  const trimmed = buf.subarray(r1, r2);
  const n = trimmed.length;
  if (n < 256) return { freq: -1, rms, confident: false };

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  // find first dip then the peak after it
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  if (maxpos <= 0) return { freq: -1, rms, confident: false };

  // parabolic interpolation for sub-sample accuracy
  let T0 = maxpos;
  const x1 = c[maxpos - 1] ?? c[maxpos];
  const x2 = c[maxpos];
  const x3 = c[maxpos + 1] ?? c[maxpos];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = maxpos - b / (2 * a);

  const freq = sampleRate / T0;
  // clarity: peak relative to zero-lag energy
  const clarity = c[0] > 0 ? maxval / c[0] : 0;

  // kids sing high; accept a wide band but reject obvious garbage
  if (freq < 110 || freq > 1400) return { freq: -1, rms, confident: false };

  const confident = clarity > 0.5 && rms > 0.012;
  return { freq, rms, confident };
}

// ── Kid-safe master chain ────────────────────────────────────────────────────
export type AudioRig = {
  ctx: AudioContext;
  master: GainNode;
};

export function buildAudioRig(): AudioRig {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 8000;
  lowpass.Q.value = 0.7;

  // brick-wall limiter for a 4-year-old's ears
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;

  master.connect(lowpass);
  lowpass.connect(limiter);
  limiter.connect(ctx.destination);

  // gentle fade-in to avoid a click on unlock
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.9, ctx.currentTime + 0.4);

  return { ctx, master };
}

/** Warm pentatonic voice: detuned sine + triangle, soft attack/release. */
export function playNote(
  rig: AudioRig,
  midi: number,
  startAt: number,
  dur: number,
  level = 0.32,
): void {
  const { ctx, master } = rig;
  const freq = midiToFreq(midi);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(level, startAt + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  g.connect(master);

  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = freq;

  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = freq * 1.005; // gentle chorus
  const g2 = ctx.createGain();
  g2.gain.value = 0.4;
  o2.connect(g2);
  g2.connect(g);

  o1.connect(g);

  o1.start(startAt);
  o2.start(startAt);
  o1.stop(startAt + dur + 0.05);
  o2.stop(startAt + dur + 0.05);
}
