// ─────────────────────────────────────────────────────────────────────────────
// 3048 · CHRYSANTHEMUM — voice input + halo synth + the voice→geometry mapping
//
// The instrument is driven by a SUSTAINED HUMMED TONE. This module:
//   • detects the fundamental (lightweight YIN) + RMS loudness from an
//     AnalyserNode time-domain buffer,
//   • one-pole smooths both (fast attack / slower release) so the bloom swells
//     and then collapses to threshold when you go silent — no jitter,
//   • maps pitch → form-constant + spatial frequency, loudness → bloom depth,
//   • provides a deterministic seeded "autopilot voice" (mulberry32 @ 0x3048) so
//     the piece self-demos with no mic — slow rising/falling sustained tones,
//   • synthesises a subtle drone halo (sub-octave + fifth + octave partials) that
//     glides with the detected pitch and is gated by loudness, so the instrument
//     always sings back.
//
// The form-constant geometry itself lives in _shared/visionary/logpolar.ts and is
// composed by bloom-gl.ts — this module only decides WHICH constant + how dense.
// ─────────────────────────────────────────────────────────────────────────────

import type { FormConstant } from "../_shared/visionary/logpolar";

// ── pitch helpers ────────────────────────────────────────────────────────────

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

export interface PitchResult {
  f0: number;
  midi: number;
  confidence: number;
  rms: number;
}

/**
 * Detect the fundamental of a time-domain buffer with YIN + parabolic interp.
 * Always returns the measured RMS; returns a null `midi`/confidence 0 when
 * unvoiced so the caller can still read loudness for the threshold pattern.
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
): PitchResult {
  const size = buf.length;
  const halfSize = size >> 1;

  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < RMS_GATE) return { f0: 0, midi: 0, confidence: 0, rms };

  // Difference function.
  const yin = new Float32Array(halfSize);
  for (let tau = 1; tau < halfSize; tau++) {
    let sum = 0;
    for (let i = 0; i < halfSize; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    yin[tau] = sum;
  }

  // Cumulative mean normalized difference.
  yin[0] = 1;
  let running = 0;
  for (let tau = 1; tau < halfSize; tau++) {
    running += yin[tau];
    yin[tau] = running > 0 ? (yin[tau] * tau) / running : 1;
  }

  // First dip below threshold, then local min.
  let tau = -1;
  for (let t = 2; t < halfSize; t++) {
    if (yin[t] < YIN_THRESHOLD) {
      while (t + 1 < halfSize && yin[t + 1] < yin[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return { f0: 0, midi: 0, confidence: 0, rms };

  // Parabolic interpolation around the chosen lag.
  let betterTau = tau;
  if (tau > 1 && tau < halfSize - 1) {
    const s0 = yin[tau - 1];
    const s1 = yin[tau];
    const s2 = yin[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tau + (s2 - s0) / denom;
  }

  const f0 = sampleRate / betterTau;
  if (f0 < MIN_HZ || f0 > MAX_HZ)
    return { f0: 0, midi: 0, confidence: 0, rms };

  const clarity = Math.max(0, Math.min(1, 1 - yin[tau]));
  const loud = Math.min(1, rms / 0.03);
  return { f0, midi: freqToMidi(f0), confidence: clarity * loud, rms };
}

// ── one-pole smoothing of loudness + pitch ───────────────────────────────────

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Convert per-frame dt + time-constant into a one-pole blend coefficient. */
function poleCoef(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / Math.max(1e-4, tau));
}

/**
 * Smooths raw loudness + pitch into stable control signals. Loudness uses an
 * asymmetric envelope: quick attack so the bloom responds to a fresh note, a
 * slower (but still deliberate) release so it collapses to threshold shortly
 * after you fall silent, without a strobe-like snap.
 */
export class VoiceTracker {
  /** Smoothed loudness 0..1 — the master "bloom depth" control. */
  loud = 0;
  /** Smoothed continuous MIDI pitch (held through short unvoiced gaps). */
  midi = 57; // ~A3 resting pitch
  /** Voicing confidence of the most recent frame. */
  confidence = 0;

  /** Feed a raw measurement. Pass midi=null when unvoiced (loudness still used). */
  update(rawLoud: number, rawMidi: number | null, dt: number): void {
    const target = clamp01(rawLoud);
    const tau = target > this.loud ? 0.07 : 0.34; // fast attack, gentle release
    this.loud += (target - this.loud) * poleCoef(dt, tau);
    if (rawMidi != null && Number.isFinite(rawMidi)) {
      this.midi += (rawMidi - this.midi) * poleCoef(dt, 0.11);
      this.confidence = 1;
    } else {
      this.confidence *= 1 - poleCoef(dt, 0.2);
    }
  }
}

// ── loudness curve ───────────────────────────────────────────────────────────

/** Map raw RMS to a perceptual 0..1 loudness (gated + gentle curve). */
export function rmsToLoud(rms: number): number {
  const g = clamp01((rms - RMS_GATE) / 0.11);
  return Math.pow(g, 0.75);
}

// ── pitch → form-constant mapping ────────────────────────────────────────────

// Vocal window used for the pitch→geometry map (C3 .. C6).
const MIDI_LO = 48;
const MIDI_HI = 84;

/** Normalized pitch 0..1 across the working vocal range. */
export function pitchNorm(midi: number): number {
  return clamp01((midi - MIDI_LO) / (MIDI_HI - MIDI_LO));
}

// Form constants laid along the pitch axis: low → wide tunnels, rising through
// spirals and radial spokes, up to fine honeycomb lattices at the top.
const FORM_ORDER: FormConstant[] = ["tunnel", "spiral", "spoke", "honeycomb"];

/** Continuous form axis 0..3 (index into FORM_ORDER, crossfaded in-shader). */
export function formAxis(midi: number): number {
  return pitchNorm(midi) * (FORM_ORDER.length - 1);
}

/** Nearest named form constant — for the on-screen readout. */
export function formNameFromPitch(midi: number): FormConstant {
  const i = Math.round(formAxis(midi));
  return FORM_ORDER[Math.max(0, Math.min(FORM_ORDER.length - 1, i))];
}

export interface VisualUniforms {
  form: number; // 0..3 form-constant axis
  freq: number; // spatial frequency (ring/lattice density)
  folds: number; // kaleidoscope N-fold symmetry
  warp: number; // log-polar domain-warp amplitude
  detail: number; // fractal octave mix
  sat: number; // saturation / colour gain
  persist: number; // feedback-trail persistence
  chroma: number; // chromatic aberration amount
  bright: number; // overall brightness
  hue: number; // hue rotation
}

/**
 * The core voice→geometry law. Loudness drives bloom depth (folds, warp,
 * detail, saturation, trails, aberration, brightness); pitch drives the
 * form-constant + spatial frequency + hue. `calm` (<1 for reduced-motion)
 * tames contrast, saturation and warp.
 */
export function mapVoiceToVisual(
  loud: number,
  midi: number,
  calm = 1,
): VisualUniforms {
  const p = pitchNorm(midi);
  const l = clamp01(loud);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const bloom = l * calm;
  return {
    form: formAxis(midi),
    freq: mix(2.2, 8.5, p),
    folds: mix(2, 3 + 7 * calm, l),
    warp: bloom,
    detail: clamp01((l - 0.22) / 0.6) * calm,
    sat: mix(0.14, 0.55 + 0.45 * calm, l),
    persist: mix(0.5, 0.62 + 0.28 * calm, l),
    chroma: bloom,
    bright: 0.12 + 0.88 * Math.sqrt(l),
    hue: 0.6 + p * 0.36, // violet → magenta arc, wandering with pitch
  };
}

// ── deterministic autopilot voice (mulberry32 @ 0x3048) ──────────────────────

/** Classic mulberry32 PRNG — tiny, fully deterministic from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AutoVoiceFrame {
  midi: number;
  loud: number;
  confidence: number;
}

/**
 * A drug-free demonstrator: it hums slow rising/falling sustained tones with
 * breath gaps, so the chrysanthemum blooms and collapses on its own until a
 * real mic takes over. Deterministic — no Math.random / Date.now.
 */
export class AutoVoice {
  private rng: () => number;
  private midi = 55;
  private target = 55;
  private noteTimer = 0;
  private loud = 0;
  private loudTarget = 0;
  private phraseTimer = 0;

  constructor(seed = 0x3048) {
    this.rng = mulberry32(seed);
  }

  step(dt: number): AutoVoiceFrame {
    // Sustained pitch that slowly glides to a new held target every few seconds.
    this.noteTimer -= dt;
    if (this.noteTimer <= 0) {
      this.noteTimer = 2.6 + this.rng() * 3.4;
      this.target = 50 + Math.floor(this.rng() * 28); // ~D3 .. G5
    }
    this.midi += (this.target - this.midi) * Math.min(1, dt * 1.3);

    // Phrase envelope: sing a swell, then a breath gap that collapses the bloom.
    this.phraseTimer -= dt;
    if (this.phraseTimer <= 0) {
      const singing = this.rng() < 0.72;
      this.loudTarget = singing ? 0.55 + this.rng() * 0.45 : 0;
      this.phraseTimer = singing ? 2.2 + this.rng() * 3.5 : 0.9 + this.rng() * 1.6;
    }
    this.loud += (this.loudTarget - this.loud) * Math.min(1, dt * 1.1);

    return {
      midi: this.midi,
      loud: this.loud,
      confidence: this.loud > 0.05 ? 0.9 : 0,
    };
  }
}

// ── halo synth — the instrument sings back ───────────────────────────────────

/**
 * A subtle drone bed that tracks the sung pitch: sub-octave + perfect fifth +
 * octave partials through a warm low-pass, gated by loudness. The user's own
 * voice stays the star; this is a halo (master gain ≤ 0.11) so there's always
 * audible AV coupling even for a quiet hum.
 */
export class VoiceSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private voices: { osc: OscillatorNode; gain: GainNode; ratio: number }[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1600;
    this.filter.Q.value = 0.6;
    this.filter.connect(this.master);
    this.master.connect(ctx.destination);

    // sub-octave (weight), fifth, octave — a jeweled overtone halo.
    const spec: [number, number, OscillatorType][] = [
      [0.5, 0.5, "sine"],
      [1.5, 0.28, "triangle"],
      [2.0, 0.2, "sine"],
    ];
    for (const [ratio, w, type] of spec) {
      const osc = ctx.createOscillator();
      osc.type = type;
      const gain = ctx.createGain();
      gain.gain.value = w;
      osc.connect(gain);
      gain.connect(this.filter);
      this.voices.push({ osc, gain, ratio });
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    for (const v of this.voices) v.osc.start(now);
  }

  /** Glide the halo to the current sung pitch, gate volume by loudness. */
  set(midi: number, loud: number): void {
    const now = this.ctx.currentTime;
    const f0 = midiToFreq(midi);
    for (const v of this.voices) {
      v.osc.frequency.setTargetAtTime(f0 * v.ratio, now, 0.09);
    }
    // Open the filter a little as it gets louder for extra shimmer.
    this.filter.frequency.setTargetAtTime(1200 + 1800 * loud, now, 0.15);
    const g = Math.max(0, Math.min(1, loud));
    this.master.gain.setTargetAtTime(g * 0.1, now, 0.12);
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.setTargetAtTime(0, now, 0.05);
    } catch {
      /* ignore */
    }
    for (const v of this.voices) {
      try {
        v.osc.stop(now + 0.2);
      } catch {
        /* ignore */
      }
    }
    // Disconnect shortly after the fade so we don't click.
    window.setTimeout(() => {
      for (const v of this.voices) {
        try {
          v.osc.disconnect();
          v.gain.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        this.filter.disconnect();
        this.master.disconnect();
      } catch {
        /* ignore */
      }
    }, 260);
  }
}
