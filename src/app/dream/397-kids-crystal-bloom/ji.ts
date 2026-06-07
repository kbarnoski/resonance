/**
 * ji.ts — Just-Intonation crystal-bell synthesis engine
 *
 * The soul of this piece: every bell is tuned to a PURE integer frequency
 * ratio above a single low fundamental (f0). Because the ratios are exact
 * small-integer fractions (5/4, 3/2, 5/3 ...), the partials of stacked bells
 * line up perfectly — there are NO beats, no roughness. That phase-locked
 * stillness is the "glassy" sound you cannot get from a 12-tone equal-
 * tempered piano (whose major third 2^(4/12) ≈ 1.2599 is sharp of 5/4 = 1.25
 * by ~14 cents, which produces a slow audible beating wobble).
 *
 * Each bell = a few sine partials at integer multiples of its own frequency,
 * with a fast attack + long exponential shimmer tail. A soft sustained drone
 * (f0 + its pure fifth 3/2) means there is never silence. Everything passes
 * through a soft-clip waveshaper + compressor limiter so peaks stay gentle —
 * kids-safe: no sudden loud transients, nothing harsh above ~6 kHz.
 *
 * Web Audio API only. No audio npm dependencies.
 */

export interface BellSpec {
  /** numerator of the pure ratio */
  num: number;
  /** denominator of the pure ratio */
  den: number;
  /** human-friendly interval name */
  name: string;
  /** bold saturated color — color is the language for pre-readers */
  color: string;
}

/** Low fundamental: A2 ≈ 110 Hz. Warm, never piercing. */
export const F0 = 110;

/**
 * The pure-ratio bell tower, low → high.
 * unison, pure maj 2nd, pure maj 3rd (5:4), pure 4th, pure 5th (3:2),
 * pure maj 6th (5:3), octave, +pure 9th, +pure maj 10th.
 */
export const BELLS: BellSpec[] = [
  { num: 1, den: 1, name: "1/1 unison", color: "#e11d48" }, // rose
  { num: 9, den: 8, name: "9/8 major 2nd", color: "#ea580c" }, // orange
  { num: 5, den: 4, name: "5/4 pure major 3rd", color: "#f59e0b" }, // amber
  { num: 4, den: 3, name: "4/3 pure fourth", color: "#65a30d" }, // lime
  { num: 3, den: 2, name: "3/2 pure fifth", color: "#059669" }, // emerald
  { num: 5, den: 3, name: "5/3 pure major 6th", color: "#0891b2" }, // cyan
  { num: 2, den: 1, name: "2/1 octave", color: "#2563eb" }, // blue
  { num: 9, den: 4, name: "9/4 pure ninth", color: "#7c3aed" }, // violet
  { num: 5, den: 2, name: "5/2 pure major 10th", color: "#c026d3" }, // fuchsia
];

export const N_BELLS = BELLS.length;

/** Frequency of bell i in Hz. */
export function bellFreq(i: number): number {
  return (F0 * BELLS[i].num) / BELLS[i].den;
}

export interface BellRig {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  droneGain: GainNode;
}

/** Build a gentle soft-clip curve for the waveshaper (tanh-like). */
function makeSoftClipCurve(amount = 1.4): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

/**
 * Create the audio context + master chain + a soft sustained drone on
 * f0 and its pure fifth. Call once, after a user gesture.
 */
export function makeRig(): BellRig {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // master gain, kept gentle
  const master = ctx.createGain();
  master.gain.value = 0.55;

  // soft-clip then limiter so nothing ever spikes loud
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSoftClipCurve(1.4);
  shaper.oversample = "4x";

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // gentle high cut so nothing harsh above ~6 kHz reaches kids' ears
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6000;
  tone.Q.value = 0.5;

  master.connect(shaper);
  shaper.connect(tone);
  tone.connect(limiter);
  limiter.connect(ctx.destination);

  // --- sustained drone: f0 + pure fifth, so there is never silence ---
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);

  const droneFreqs = [F0, F0 * (3 / 2)];
  droneFreqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = idx === 0 ? 0.6 : 0.4;

    // slow shimmer LFO on the drone amplitude — the tower "breathes"
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07 + idx * 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = idx === 0 ? 0.12 : 0.1;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);

    osc.connect(g);
    g.connect(droneGain);
    osc.start();
    lfo.start();
  });

  // fade the drone in softly
  const now = ctx.currentTime;
  droneGain.gain.setValueAtTime(0.0001, now);
  droneGain.gain.exponentialRampToValueAtTime(0.18, now + 2.5);

  return { ctx, master, limiter, droneGain };
}

/** Partial structure of a struck crystal bell (integer multiples, soft highs). */
const PARTIALS: { mult: number; gain: number }[] = [
  { mult: 1, gain: 1.0 },
  { mult: 2, gain: 0.5 },
  { mult: 3, gain: 0.28 },
  { mult: 4.2, gain: 0.16 }, // slightly inharmonic shimmer partial, very soft
  { mult: 6, gain: 0.08 },
];

/**
 * Ring bell i once: fast attack, long exponential shimmer tail.
 * intensity 0..1 scales loudness gently.
 */
export function ringBell(rig: BellRig, i: number, intensity = 1): void {
  const { ctx, master } = rig;
  if (ctx.state === "suspended") return;
  const now = ctx.currentTime;
  const base = bellFreq(i);

  // higher bells decay a touch faster (physical), all long & glassy
  const dur = Math.max(2.2, 5.5 - i * 0.3);
  const peak = 0.16 * Math.min(1, Math.max(0.15, intensity));

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, now);
  voiceGain.gain.exponentialRampToValueAtTime(peak, now + 0.012); // fast attack
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + dur); // long tail
  voiceGain.connect(master);

  PARTIALS.forEach((p) => {
    const f = base * p.mult;
    if (f > 6500) return; // skip harsh highs for kids
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    osc.connect(g);
    g.connect(voiceGain);
    osc.start(now);
    osc.stop(now + dur + 0.1);
  });
}
