// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the atom's voice (Web Audio API).
//
//   • A sustained two-oscillator DRONE tuned to the current energy level.
//   • On each downward transition, emitPhoton() strikes a bell-like FM voice at
//     the Rydberg-derived pitch — so the atom literally plays its own emission
//     spectrum as a scale.
//   • Both feed a code-generated convolution reverb (from _shared/psych) then a
//     DynamicsCompressor limiter → destination. Everything starts on a user
//     gesture and tears down fully on dispose().
// ─────────────────────────────────────────────────────────────────────────────

import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";

interface DroneVoice {
  a: OscillatorNode;
  b: OscillatorNode;
  gain: GainNode;
}

export interface AtomAudio {
  /** Strike a photon at the given audible pitch; colour tint 0..1 unused here. */
  emitPhoton(freqHz: number, gain?: number): void;
  /** Glide the sustained drone to a new level pitch. */
  setLevel(droneHz: number): void;
  /** Master level 0..1. */
  setMaster(v: number): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
  readonly ctx: AudioContext;
}

type AudioCtor = typeof AudioContext;

export function createAtomAudio(): AtomAudio | null {
  const Ctor: AudioCtor | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0001;

  // Limiter so overlapping photons never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const reverb: VoidReverb = createVoidReverb(ctx, { seconds: 3.6, decay: 2.6, wet: 0.42 });

  // routing: sources → reverb.input → reverb.output → master → limiter → out
  reverb.output.connect(master);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // A little dry bus so transients keep presence.
  const dry = ctx.createGain();
  dry.gain.value = 0.55;
  dry.connect(master);

  // fade master up gently on creation
  const now = ctx.currentTime;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.6, now + 1.2);

  // ── the sustained drone ────────────────────────────────────────────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.12;
  const droneLp = ctx.createBiquadFilter();
  droneLp.type = "lowpass";
  droneLp.frequency.value = 900;
  droneGain.connect(droneLp);
  droneLp.connect(reverb.input);
  droneLp.connect(dry);

  function makeDrone(freq: number): DroneVoice {
    const a = ctx.createOscillator();
    a.type = "sine";
    a.frequency.value = freq;
    const b = ctx.createOscillator();
    b.type = "triangle";
    b.frequency.value = freq * 2.005; // gentle beating octave
    const g = ctx.createGain();
    g.gain.value = 1;
    a.connect(g);
    b.connect(g);
    g.connect(droneGain);
    a.start();
    b.start();
    return { a, b, gain: g };
  }

  const drone = makeDrone(55);

  const emitPhoton = (freqHz: number, gain = 1) => {
    const t = ctx.currentTime;
    const f = Math.min(6000, Math.max(60, freqHz));

    // Simple 2-op FM bell: modulator → carrier frequency.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = f * 2.01;
    const modGain = ctx.createGain();
    const modDepth = f * 1.4;
    modGain.gain.setValueAtTime(modDepth, t);
    modGain.gain.exponentialRampToValueAtTime(modDepth * 0.05 + 0.001, t + 0.9);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // A shimmering upper partial (additive) for the spectral-line brightness.
    const shimmer = ctx.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.value = f * 3.0;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.18;
    shimmer.connect(shimmerGain);

    const env = ctx.createGain();
    const peak = 0.34 * Math.min(1, Math.max(0.1, gain));
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

    carrier.connect(env);
    shimmerGain.connect(env);
    env.connect(reverb.input);
    env.connect(dry);

    carrier.start(t);
    mod.start(t);
    shimmer.start(t);
    const stop = t + 1.7;
    carrier.stop(stop);
    mod.stop(stop);
    shimmer.stop(stop);
  };

  const setLevel = (droneHz: number) => {
    const t = ctx.currentTime;
    drone.a.frequency.cancelScheduledValues(t);
    drone.b.frequency.cancelScheduledValues(t);
    drone.a.frequency.setTargetAtTime(droneHz, t, 0.18);
    drone.b.frequency.setTargetAtTime(droneHz * 2.005, t, 0.18);
  };

  return {
    ctx,
    emitPhoton,
    setLevel,
    setMaster(v) {
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(Math.max(0.0001, v), t, 0.1);
    },
    suspend() {
      if (ctx.state === "running") void ctx.suspend();
    },
    resume() {
      if (ctx.state === "suspended") void ctx.resume();
    },
    dispose() {
      try {
        drone.a.stop();
        drone.b.stop();
      } catch {
        /* already stopped */
      }
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    },
  };
}
