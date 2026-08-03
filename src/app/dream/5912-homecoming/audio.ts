// Wordless generative just-intonation drone/pad. A few detuned oscillators on
// just-intoned ratios pass through a lowpass and a Schroeder-style feedback
// reverb. Brightness and level swell with the breathing LFO and the density of
// particles near the core. No beat, no melody, no note names.

import { mulberry32 } from "./rng";

const ROOT = 55; // A1 — warm, cosmic
// Just-intonation ratios across three octaves: root, fifth, major third,
// octave, twelfth, major seventh, plus a sub-octave for depth.
const RATIOS = [0.5, 1, 5 / 4, 3 / 2, 15 / 8, 2, 3];

export type AudioEngine = {
  start(): Promise<void>;
  update(breath: number, deepen: number, coreGlow: number): void;
  stop(): void;
  running(): boolean;
};

export function makeAudio(seed: number): AudioEngine {
  const rng = mulberry32(seed);
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let lowpass: BiquadFilterNode | null = null;
  let started = false;

  async function start(): Promise<void> {
    if (started) return;
    started = true;

    type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as WindowWithWebkit).webkitAudioContext;
    if (!Ctor) {
      started = false;
      return;
    }
    ctx = new Ctor();
    await ctx.resume();
    const now = ctx.currentTime;

    master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.32, now + 6); // slow bloom-in
    master.connect(ctx.destination);

    lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(320, now);
    lowpass.Q.value = 0.7;
    lowpass.connect(master);

    // Schroeder-ish feedback reverb: two damped combs feeding the master wash.
    const combTimes = [0.211, 0.337];
    for (const t of combTimes) {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = t;
      const fb = ctx.createGain();
      fb.gain.value = 0.55;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 2200;
      const send = ctx.createGain();
      send.gain.value = 0.35;
      lowpass.connect(send);
      send.connect(delay);
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      damp.connect(master);
    }

    // Voices: two detuned oscillators per ratio, each with a slow amplitude LFO.
    for (let v = 0; v < RATIOS.length; v++) {
      const freq = ROOT * RATIOS[v];
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.14 / Math.sqrt(v + 1); // gently roll off highs
      voiceGain.connect(lowpass);

      for (let d = 0; d < 2; d++) {
        const osc = ctx.createOscillator();
        osc.type = v < 2 ? "sine" : "triangle";
        osc.frequency.value = freq;
        osc.detune.value = (d === 0 ? -1 : 1) * (3 + rng() * 6);

        // per-oscillator shimmer LFO
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.03 + rng() * 0.06;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.35;
        const oscGain = ctx.createGain();
        oscGain.gain.value = 0.65;
        lfo.connect(lfoGain);
        lfoGain.connect(oscGain.gain);
        osc.connect(oscGain);
        oscGain.connect(voiceGain);
        osc.start(now);
        lfo.start(now);
      }
    }
  }

  function update(breath: number, deepen: number, coreGlow: number): void {
    if (!ctx || !lowpass || !master) return;
    const now = ctx.currentTime;
    // brightness follows breath + core density; level swells as the piece deepens
    const cutoff = 300 + coreGlow * 2600 + breath * 700;
    lowpass.frequency.setTargetAtTime(cutoff, now, 0.5);
    const level = 0.22 + 0.12 * deepen + 0.08 * coreGlow;
    master.gain.setTargetAtTime(level, now, 1.2);
  }

  function stop(): void {
    if (ctx) {
      const c = ctx;
      c.close().catch(() => {});
      ctx = null;
    }
    master = null;
    lowpass = null;
    started = false;
  }

  return { start, update, stop, running: () => started };
}
