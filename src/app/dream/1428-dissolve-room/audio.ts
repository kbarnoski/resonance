// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — THE POINT. An inharmonic bell voice that drifts FURTHER out of tune
// as the room dissolves. The lab's monoculture is always-consonant pentatonic /
// just-intonation; this piece is the antidote.
//
//   • Risset-style inharmonic bell partials — no small-integer ratios, so they
//     beat faintly even at rest.
//   • A Railsback octave-stretch exponent that GROWS 1.00 → ~1.06 with progress,
//     dragging the partials progressively further from consonance.
//   • A chorus detune that widens from a few cents → tens of cents.
//   • A high inharmonic "light" cluster that shimmers in during the light phase.
//   • Routed through the shared void reverb → master (silence → ≤0.18) →
//     compressor/limiter → destination.
//
//   Deterministic: NO Math.random (fixed detune offsets only).
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb } from "../_shared/psych/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { effectiveProgress } from "./lattice";

const ROOT = 55; // A1
// Risset-style inharmonic bell partials — none a small integer ratio.
const PARTIALS = [0.5, 1.0, 1.19, 1.56, 2.02, 2.55, 3.06];
// High inharmonic "light" cluster (shimmering top partials).
const LIGHT_PARTIALS = [4.31, 5.43, 6.79, 8.12];

const MASTER_MAX = 0.18;

// Railsback stretch exponent: 1.00 at rest → STRETCH_MAX at full dissolution.
const STRETCH_MAX = 1.06;
// Chorus detune (cents) per voice: base at rest → wide at full dissolution.
const DETUNE_BASE = 3;
const DETUNE_WIDE = 34;

export interface DissolveAudio {
  /** Call each frame with the true clock, the 0..1 lean, and dt seconds. */
  update(progress: number, lean: number, dtSec: number): void;
  stop(): void;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  /** Fixed per-voice detune sign so the chorus is deterministic. */
  detuneSign: number;
  baseLevel: number;
}

/** Railsback-stretched, chorus-detuned frequency for a partial. */
function partialFreq(ratio: number, stretchExp: number): number {
  return ROOT * Math.pow(ratio, stretchExp);
}

export function startAudio(ctx: AudioContext): DissolveAudio {
  const now = ctx.currentTime;

  // ── Master chain: sources → void → master → compressor(limiter) → out ──────
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(MASTER_MAX * 0.5, now + 6); // silence → up

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.setValueAtTime(-8, now);
  limiter.knee.setValueAtTime(6, now);
  limiter.ratio.setValueAtTime(12, now);
  limiter.attack.setValueAtTime(0.004, now);
  limiter.release.setValueAtTime(0.25, now);

  master.connect(limiter);
  limiter.connect(ctx.destination);

  const verb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.55 });
  verb.output.connect(master);

  // ── Bell partials (each with a fixed-cent chorus twin) ─────────────────────
  const voices: Voice[] = [];
  const stretch0 = 1.0;
  for (let i = 0; i < PARTIALS.length; i++) {
    const ratio = PARTIALS[i];
    for (const sign of [-1, 1]) {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      const f = partialFreq(ratio, stretch0);
      osc.frequency.setValueAtTime(f, now);
      osc.detune.setValueAtTime(sign * DETUNE_BASE, now);
      const gain = ctx.createGain();
      // Higher partials quieter; twin split so the pair beats, not doubles.
      const baseLevel = (0.5 / (ratio + 0.4)) * 0.5;
      gain.gain.setValueAtTime(baseLevel, now);
      osc.connect(gain);
      gain.connect(verb.input);
      osc.start(now);
      voices.push({ osc, gain, ratio, detuneSign: sign, baseLevel });
    }
  }

  // ── Light cluster: high inharmonic shimmer, silent until the light phase ───
  const lightVoices: Voice[] = [];
  const lightBus = ctx.createGain();
  lightBus.gain.setValueAtTime(0.0001, now);
  lightBus.connect(verb.input);
  // A slow sub-Hz tremolo gives the cluster its shimmer (deterministic LFO).
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(0.17, now);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.4, now);
  lfo.connect(lfoGain);
  for (let i = 0; i < LIGHT_PARTIALS.length; i++) {
    const ratio = LIGHT_PARTIALS[i];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(partialFreq(ratio, stretch0), now);
    osc.detune.setValueAtTime(i % 2 === 0 ? 5 : -5, now);
    const gain = ctx.createGain();
    const baseLevel = 0.16 / (i + 1);
    gain.gain.setValueAtTime(baseLevel, now);
    lfoGain.connect(gain.gain); // shimmer
    osc.connect(gain);
    gain.connect(lightBus);
    osc.start(now);
    lightVoices.push({ osc, gain, ratio, detuneSign: 1, baseLevel });
  }
  lfo.start(now);

  // ── Low inharmonic bed (drone bank, but with INHARMONIC ratios) ────────────
  const drone: DroneBank = startDroneBank(ctx, verb.input, {
    root: 27.5,
    ratios: [1, 1.19, 1.56], // inharmonic — NOT the default consonant chord
    cutoffLow: 110,
    cutoffHigh: 780,
    peakGain: 0.12,
  });

  let disposed = false;
  let accum = 0; // throttle param updates to ~15 Hz

  const update = (progress: number, lean: number, dtSec: number) => {
    if (disposed) return;
    accum += dtSec;
    if (accum < 0.066) return;
    accum = 0;

    const t = ctx.currentTime;
    // Leaning in recovers the *tuning* toward consonance, but the clock marches.
    const effP = effectiveProgress(progress, lean);

    const stretch = 1.0 + effP * (STRETCH_MAX - 1.0);
    const detune = DETUNE_BASE + effP * (DETUNE_WIDE - DETUNE_BASE);

    for (const v of voices) {
      const f = partialFreq(v.ratio, stretch);
      v.osc.frequency.setTargetAtTime(f, t, 0.08);
      v.osc.detune.setTargetAtTime(v.detuneSign * detune, t, 0.12);
    }

    // Light cluster fades in through the light phase.
    const lightLevel = smoothstep(0.72, 0.98, effP) * 0.9;
    lightBus.gain.setTargetAtTime(0.0001 + lightLevel, t, 0.3);
    for (const v of lightVoices) {
      v.osc.frequency.setTargetAtTime(partialFreq(v.ratio, stretch), t, 0.1);
    }

    // Master swells gently but never past the ceiling.
    const level = MASTER_MAX * (0.45 + 0.55 * smoothstep(0, 1, progress));
    master.gain.setTargetAtTime(Math.min(MASTER_MAX, level), t, 0.4);

    // Void deepens; low bed drives up as the room comes apart.
    verb.setWet(0.5 + effP * 0.4);
    drone.setDrive(progress);
  };

  const stop = () => {
    if (disposed) return;
    disposed = true;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    } catch {
      /* ctx closing */
    }
    const killAt = t + 0.6;
    for (const v of [...voices, ...lightVoices]) {
      try {
        v.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      lfo.stop(killAt);
    } catch {
      /* already stopped */
    }
    drone.stop();
  };

  return { update, stop };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  let t = (x - edge0) / (edge1 - edge0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}
