// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — one continuous voice per Voronoi seed, plus a quiet drone bed.
//
//   Each seed = one sawtooth through a per-voice band-pass + gain. Pitch is
//   CONTINUOUS and inharmonic: frequency is derived directly from the seed's
//   field position (tunnel depth → log-frequency over ~80–900 Hz), never
//   quantised to a scale. Moving a cell glides its pitch.
//
//   Per-voice mapping (updated every frame, glided with setTargetAtTime):
//     • cell size proxy  (gap to nearest other seed) → amplitude  (big = loud)
//     • neighbour proxy  (seeds within a radius)      → filter cutoff (crowded
//                                                        = thin & bright)
//
//   A 2-oscillator sub drone sits underneath. Master ramps up from 0 over ~0.3s
//   and passes through a DynamicsCompressor limiter. Total oscillators:
//     12 seed voices + 2 drone = 14 (the hard cap).
//
//   The AudioContext is only ever created from a user gesture (the Start button).
// ─────────────────────────────────────────────────────────────────────────────

import { MAX_SEEDS } from "./gl";

const FREQ_LOW = 80;
const FREQ_HIGH = 900;

interface Voice {
  osc: OscillatorNode;
  bp: BiquadFilterNode;
  gain: GainNode;
}

export interface SeedAudioState {
  /** field.x (tunnel depth) in [0,1] → pitch. */
  depth: number;
  /** cell-size proxy: toroidal gap to the nearest other seed, ~[0,0.5]. */
  size: number;
  /** neighbour proxy: count of other seeds within a radius, integer. */
  neighbours: number;
}

export interface CrystalAudio {
  /** Push the current per-seed state; glides all voices. */
  update(states: SeedAudioState[]): void;
  stop(): void;
}

export function startAudio(ctx: AudioContext, seedCount: number): CrystalAudio {
  const now = ctx.currentTime;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(0.85, now + 0.3); // never a click
  master.connect(limiter);

  // ── Drone bed: two detuned low oscillators through a gentle lowpass. ─────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.12;
  const droneLp = ctx.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.value = 380;
  droneLp.Q.value = 0.6;
  droneLp.connect(droneGain);
  droneGain.connect(master);

  const drone: OscillatorNode[] = [];
  for (const detune of [-6, 6]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 55;
    o.detune.value = detune;
    o.connect(droneLp);
    o.start();
    drone.push(o);
  }

  // ── Seed voices. ────────────────────────────────────────────────────────────
  const n = Math.min(seedCount, MAX_SEEDS);
  const voices: Voice[] = [];
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 600;
    bp.Q.value = 3.5;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    osc.connect(bp);
    bp.connect(gain);
    gain.connect(master);
    osc.start();
    voices.push({ osc, bp, gain });
  }

  let stopped = false;

  function update(states: SeedAudioState[]): void {
    if (stopped) return;
    const t = ctx.currentTime;
    for (let i = 0; i < voices.length; i++) {
      const s = states[i];
      if (!s) continue;
      const v = voices[i];

      // continuous inharmonic pitch from tunnel depth (log-frequency sweep)
      const freq = FREQ_LOW * Math.pow(FREQ_HIGH / FREQ_LOW, clamp01(s.depth));
      v.osc.frequency.setTargetAtTime(freq, t, 0.05);

      // amplitude from cell size — bigger cells sing louder & rounder
      const size = Math.min(0.5, Math.max(0, s.size));
      const amp = 0.02 + Math.min(0.22, size * 0.9);
      v.gain.gain.setTargetAtTime(amp / Math.max(1, voices.length * 0.4), t, 0.08);

      // crowded cells → brighter/thinner band-pass; roomy cells → rounder
      const cutoff = 320 + s.neighbours * 420 + freq * 0.5;
      v.bp.frequency.setTargetAtTime(cutoff, t, 0.1);
      v.bp.Q.setTargetAtTime(2.5 + s.neighbours * 0.9, t, 0.15);
    }
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    } catch {
      /* ctx closing */
    }
    const killAt = t + 0.3;
    for (const v of voices) {
      try {
        v.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    for (const o of drone) {
      try {
        o.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }

  return { update, stop };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
