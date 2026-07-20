// audio.ts — you hear the physics.
//
// Two layers, both driven by the pendulum, never by a random scheduler:
//
//   FLIGHT VOICE — one sustained oscillator per playing session. While a bob is
//   in flight its pitch glides toward the inverse-distance blend of the magnet
//   pitches (so it slides between captors), and a low-pass filter opens with the
//   bob's SPEED — a boundary-crossing bob accelerates and the voice brightens.
//   When nothing is flying, the voice fades to silence.
//
//   STRUCK BELLS — on CAPTURE the captor magnet rings an INHARMONIC bell:
//   additive partials at stretched, non-harmonic ratios (1, 2.01, 2.76, 5.40,
//   8.93) with a fast attack and per-partial decay. Inharmonic on purpose — it
//   reinforces the non-just-intonation stance and lets several captures pile
//   into an evolving, shimmering chord.
//
// A short deterministic convolution reverb (its impulse drawn from the seeded
// RNG, NOT Math.random) softens everything into a compressor/limiter and out at
// a calm ~0.14 master. No Math.random / Date.now / performance.now anywhere.

import { makeRng } from "./pendulum";

const BELL_RATIOS = [1, 2.01, 2.76, 5.4, 8.93];
const BELL_GAINS = [1, 0.55, 0.42, 0.24, 0.14];

export interface AudioEngine {
  resume: () => Promise<void>;
  setFlightActive: (active: boolean) => void;
  updateFlight: (blendFreq: number, speed: number) => void;
  strike: (freq: number, at?: number) => void;
  now: () => number;
  dispose: () => void;
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

// A tiny exponentially-decaying stereo impulse response, seeded (deterministic).
function buildImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 1.4;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const rng = makeRng(0x2020);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.6);
      data[i] = (rng() * 2 - 1) * env;
    }
  }
  return buf;
}

export function createAudio(): AudioEngine {
  const Ctx =
    window.AudioContext || (window as WebkitWindow).webkitAudioContext;
  const ctx = new Ctx();

  // master bus: master gain → limiter → destination
  const master = ctx.createGain();
  master.gain.value = 0.14;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // parallel reverb send
  const reverb = ctx.createConvolver();
  reverb.buffer = buildImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  reverb.connect(wet);
  wet.connect(master);

  // ── the sustained flight voice ─────────────────────────────────────────────
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 220;
  const flightFilter = ctx.createBiquadFilter();
  flightFilter.type = "lowpass";
  flightFilter.frequency.value = 500;
  flightFilter.Q.value = 6;
  const flightGain = ctx.createGain();
  flightGain.gain.value = 0.0001;
  osc.connect(flightFilter);
  flightFilter.connect(flightGain);
  flightGain.connect(master);
  flightGain.connect(reverb);
  osc.start();

  function resume(): Promise<void> {
    return ctx.state === "suspended" ? ctx.resume() : Promise.resolve();
  }

  function setFlightActive(active: boolean): void {
    const t = ctx.currentTime;
    flightGain.gain.cancelScheduledValues(t);
    flightGain.gain.setTargetAtTime(active ? 0.09 : 0.0001, t, active ? 0.05 : 0.12);
  }

  function updateFlight(blendFreq: number, speed: number): void {
    const t = ctx.currentTime;
    osc.frequency.setTargetAtTime(blendFreq, t, 0.06);
    // speed (≈0..3) opens the filter: a bob racing through a boundary brightens
    const cutoff = 320 + Math.min(3, speed) * 1400;
    flightFilter.frequency.setTargetAtTime(cutoff, t, 0.05);
  }

  function strike(freq: number, at?: number): void {
    const t0 = at ?? ctx.currentTime;
    const bellOut = ctx.createGain();
    bellOut.gain.value = 1;
    bellOut.connect(master);
    bellOut.connect(reverb);
    const oscs: OscillatorNode[] = [];
    let maxEnd = t0;
    for (let i = 0; i < BELL_RATIOS.length; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * BELL_RATIOS[i];
      const g = ctx.createGain();
      const peak = 0.32 * BELL_GAINS[i];
      const decay = 2.4 / (1 + i * 0.7); // higher partials die sooner
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      o.connect(g);
      g.connect(bellOut);
      o.start(t0);
      const end = t0 + decay + 0.05;
      o.stop(end);
      if (end > maxEnd) maxEnd = end;
      oscs.push(o);
    }
    const last = oscs[oscs.length - 1];
    last.onended = () => {
      for (const o of oscs) o.disconnect();
      bellOut.disconnect();
    };
  }

  function now(): number {
    return ctx.currentTime;
  }

  function dispose(): void {
    try {
      osc.stop();
    } catch {
      /* already stopped */
    }
    osc.disconnect();
    flightFilter.disconnect();
    flightGain.disconnect();
    reverb.disconnect();
    wet.disconnect();
    master.disconnect();
    limiter.disconnect();
    void ctx.close();
  }

  return { resume, setFlightActive, updateFlight, strike, now, dispose };
}
