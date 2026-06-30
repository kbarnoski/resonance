// audio.ts — warm cosmic-ambient instrument driven by the Physarum FieldStats.
//
// The field IS the body: every audio parameter is a function of the network's
// state read back from the GPU (or CPU) trail field.
//   energy   → drone gain + lowpass cutoff (brightness) + stereo width
//   variance → "filament forming" bell density (busyness)
//   panX     → slow stereo pan of the brightest region
//
// Signal: a just-intonation detuned sine/triangle drone bank (fundamental +
// just fifth 3:2 + octave + a high shimmer 9:4), through a slow lowpass, into
// a code-generated convolution reverb, a soft compressor, then the master.
// Sparse bell pings (just/pentatonic) fire when busyness crosses thresholds.

import type { FieldStats } from "./physarum";

const FUND = 65.41; // C2-ish fundamental
// Just-intonation ratios for the drone bank.
const DRONE_RATIOS = [1, 1.5, 2, 4.5]; // fund, just 5th, octave, high shimmer (9:2)
// Pentatonic-ish just bell scale (one octave up), ratios over the fundamental.
const BELL_RATIOS = [4, 4.5, 5, 6, 7.5, 8, 9, 10];

interface DroneVoice {
  osc: OscillatorNode;
  detune: OscillatorNode; // a second slightly-detuned osc for shimmer
  gain: GainNode;
}

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  panner: StereoPannerNode;
  drones: DroneVoice[];
  bellBus: GainNode;
  reverb: ConvolverNode;
  // smoothed control state
  lastBell: number;
  busyAvg: number;
  resume(): Promise<void>;
  update(stats: FieldStats, now: number): void;
  close(): void;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // decaying noise burst → smooth cosmic tail
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export function createAudio(): AudioEngine {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.0;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.02;
  comp.release.value = 0.4;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 380;
  lowpass.Q.value = 0.6;

  const panner = ctx.createStereoPanner();
  panner.pan.value = 0;

  // Reverb (code-generated impulse).
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 4.2, 2.6);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.55;
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.7;

  // Routing: voices → lowpass → panner → (dry + reverb) → comp → master → dest
  lowpass.connect(panner);
  panner.connect(dryGain);
  panner.connect(reverb);
  reverb.connect(reverbGain);
  dryGain.connect(comp);
  reverbGain.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  // Drone bank.
  const drones: DroneVoice[] = DRONE_RATIOS.map((ratio, i) => {
    const freq = FUND * ratio;
    const osc = ctx.createOscillator();
    osc.type = i >= 3 ? "sine" : "triangle";
    osc.frequency.value = freq;
    const detune = ctx.createOscillator();
    detune.type = "sine";
    detune.frequency.value = freq * 1.004; // gentle beating
    const gain = ctx.createGain();
    gain.gain.value = i === 0 ? 0.5 : i === 3 ? 0.08 : 0.22;
    osc.connect(gain);
    detune.connect(gain);
    gain.connect(lowpass);
    osc.start();
    detune.start();
    return { osc, detune, gain };
  });

  // Bell bus → its own reverb send for shimmer.
  const bellBus = ctx.createGain();
  bellBus.gain.value = 0.9;
  bellBus.connect(reverb);
  bellBus.connect(dryGain);

  const engine: AudioEngine = {
    ctx, master, lowpass, panner, drones, bellBus, reverb,
    lastBell: 0, busyAvg: 0,
    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
      // fade master in
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.85, t + 2.5);
    },
    update(stats, now) {
      const t = ctx.currentTime;
      // energy → lowpass cutoff (brightness) + a touch of drone gain.
      const cutoff = 280 + stats.energy * 2600;
      lowpass.frequency.setTargetAtTime(cutoff, t, 0.4);
      drones[3].gain.gain.setTargetAtTime(0.04 + stats.energy * 0.16, t, 0.6); // shimmer
      drones[0].gain.gain.setTargetAtTime(0.42 + stats.energy * 0.18, t, 0.6);

      // brightest region X → slow stereo pan.
      panner.pan.setTargetAtTime((stats.panX - 0.5) * 1.4, t, 0.8);

      // variance → bell density. Smooth it, fire when it surges.
      engine.busyAvg = engine.busyAvg * 0.9 + stats.variance * 0.1;
      const surge = stats.variance - engine.busyAvg;
      const minGap = 0.18 + (1 - stats.variance) * 0.9; // busier → more bells
      if (now - engine.lastBell > minGap && (surge > 0.012 || Math.random() < stats.variance * 0.04)) {
        engine.lastBell = now;
        ping(ctx, bellBus, stats);
      }
    },
    close() {
      try {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setTargetAtTime(0, t, 0.2);
        drones.forEach((d) => { d.osc.stop(t + 0.6); d.detune.stop(t + 0.6); });
        setTimeout(() => ctx.close().catch(() => {}), 700);
      } catch {
        ctx.close().catch(() => {});
      }
    },
  };

  return engine;
}

function ping(ctx: AudioContext, bus: GainNode, stats: FieldStats): void {
  const t = ctx.currentTime;
  const ratio = BELL_RATIOS[(Math.random() * BELL_RATIOS.length) | 0];
  const freq = FUND * ratio;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  // a soft FM partial for bell timbre
  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * 2.01;
  const modGain = ctx.createGain();
  modGain.gain.value = freq * 0.6;
  mod.connect(modGain);
  modGain.connect(osc.frequency);

  const g = ctx.createGain();
  const peak = 0.05 + stats.energy * 0.07;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);

  const pan = ctx.createStereoPanner();
  pan.pan.value = (stats.panX - 0.5) * 1.2;

  osc.connect(g);
  g.connect(pan);
  pan.connect(bus);
  osc.start(t);
  mod.start(t);
  osc.stop(t + 2.7);
  mod.stop(t + 2.7);
}
