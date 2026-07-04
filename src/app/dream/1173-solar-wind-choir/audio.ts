// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the 8-voice just-intonation solar-wind choir.
//
// Graph (per render call, built once, then only param-ramped):
//
//   for each of 8 voices:
//     sine osc  ┐
//     tri  osc  ┼→ peaking BiquadFilter (formant) → voice gain ┐
//   (both slightly detuned; a shared vibrato LFO FM's every osc)          │
//                                                                          ▼
//                       high-shelf "shimmer" filter (Bt) → sum bus → compressor
//                       (limiter) → master gain (~0.2) → destination
//
// Every parameter change is ramped with setTargetAtTime so nothing clicks, and
// voices fade in/out smoothly as density changes. stop() tears the whole graph
// down: oscillators stopped, LFO stopped, context left to the caller to close.
// ─────────────────────────────────────────────────────────────────────────────

import { computeTargets, VOICE_COUNT, type Targets } from "./mapping";
import type { SolarWind } from "./feeds";

interface Voice {
  sine: OscillatorNode;
  tri: OscillatorNode;
  formant: BiquadFilterNode;
  gain: GainNode;
}

export interface ChoirAudio {
  /** Apply a fresh sample; ramps all parameters smoothly. */
  applyData(data: SolarWind): void;
  /** The most recently applied targets (for the visual layer to share). */
  latest(): Targets | null;
  /** Full teardown: stop all oscillators + LFO. */
  stop(): void;
}

const RAMP = 0.6; // setTargetAtTime time-constant (seconds) — slow, glassy.

export function startChoir(
  ctx: AudioContext,
  data: SolarWind,
): ChoirAudio {
  const now = ctx.currentTime;

  // ── Master chain: sum → shimmer high-shelf → limiter → master → out ──────────
  const master = ctx.createGain();
  master.gain.value = 0.2;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;

  const shimmer = ctx.createBiquadFilter();
  shimmer.type = "highshelf";
  shimmer.frequency.value = 2400;
  shimmer.gain.value = 0;

  const sumBus = ctx.createGain();
  sumBus.gain.value = 1;

  sumBus.connect(shimmer);
  shimmer.connect(limiter);
  limiter.connect(master);
  master.connect(ctx.destination);

  // ── Shared vibrato LFO → detune of every oscillator ─────────────────────────
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 5.2; // gentle choir vibrato
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 8; // cents; ramped from targets
  lfo.connect(lfoDepth);

  // ── Build the 8 voices ──────────────────────────────────────────────────────
  const voices: Voice[] = [];
  for (let i = 0; i < VOICE_COUNT; i++) {
    const sine = ctx.createOscillator();
    sine.type = "sine";
    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.detune.value = 6; // subtle chorusing between the two oscillators

    const formant = ctx.createBiquadFilter();
    formant.type = "peaking";
    formant.Q.value = 6;
    formant.gain.value = 8;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    // Vibrato feeds each oscillator's detune.
    lfoDepth.connect(sine.detune);
    lfoDepth.connect(tri.detune);

    sine.connect(formant);
    tri.connect(formant);
    formant.connect(gain);
    gain.connect(sumBus);

    sine.start(now);
    tri.start(now);
    voices.push({ sine, tri, formant, gain });
  }
  lfo.start(now);

  let current: Targets | null = null;

  function applyData(sample: SolarWind): void {
    const t = computeTargets(sample);
    current = t;
    const at = ctx.currentTime;

    for (let i = 0; i < VOICE_COUNT; i++) {
      const v = voices[i];
      const vt = t.voices[i];
      const freq = t.baseHz * vt.ratio;
      v.sine.frequency.setTargetAtTime(freq, at, RAMP);
      v.tri.frequency.setTargetAtTime(freq, at, RAMP);
      v.formant.frequency.setTargetAtTime(vt.formantHz, at, RAMP);
      v.gain.gain.setTargetAtTime(vt.gain * 0.5, at, RAMP);
    }

    shimmer.gain.setTargetAtTime(t.shimmerDb, at, RAMP);
    lfoDepth.gain.setTargetAtTime(t.vibratoCents, at, RAMP);
    // A touch more overall vibrato rate with sparkle/aurora.
    lfo.frequency.setTargetAtTime(5.0 + t.sparkle * 1.4, at, RAMP);
  }

  // Seed immediately so it sings from the first frame.
  applyData(data);

  function stop(): void {
    const at = ctx.currentTime;
    // Quick fade to avoid a click, then hard-stop shortly after.
    master.gain.setTargetAtTime(0, at, 0.05);
    const killAt = at + 0.3;
    try {
      lfo.stop(killAt);
    } catch {
      /* already stopped */
    }
    for (const v of voices) {
      try {
        v.sine.stop(killAt);
        v.tri.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }

  return {
    applyData,
    latest: () => current,
    stop,
  };
}
