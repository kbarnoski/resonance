// audio.ts — Hand-rolled Web Audio additive/subtractive synth + JI drone bed.
//
// Per held note: a triangle + sine oscillator pair through a gentle lowpass,
// with a soft attack/release. A shared JI drone bed sits underneath. The
// master runs through a tanh WaveShaper soft-clip limiter, and master gain is
// hard-capped at 0.17 (house rule). No libraries.

import { midiToJiHz } from "./harmony";

const MASTER_CAP = 0.17; // strict house rule — never exceed.

interface Voice {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  hz: number;
  velocity: number;
  releasing: boolean;
}

export interface AudioEngine {
  ctx: AudioContext;
  resume: () => Promise<void>;
  noteOn: (midi: number, velocity: number) => void;
  noteOff: (midi: number) => void;
  /** Notes currently sounding (excludes fully released), for the harmony engine. */
  sounding: () => { midi: number; hz: number; gain: number }[];
  close: () => Promise<void>;
}

/** Build a tanh soft-clip curve for the limiter WaveShaper. */
function makeSoftClipCurve() {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 2.2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export function createAudioEngine(): AudioEngine {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  // Master chain: sum -> softclip limiter -> master gain -> destination.
  const masterGain = ctx.createGain();
  masterGain.gain.value = MASTER_CAP;

  const limiter = ctx.createWaveShaper();
  limiter.curve = makeSoftClipCurve();
  limiter.oversample = "2x";

  limiter.connect(masterGain);
  masterGain.connect(ctx.destination);

  // --- JI drone bed: tonic + fifth + octave, very quiet, always humming. ---
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.5;
  droneBus.connect(limiter);

  const droneFreqs = [1, 3 / 2, 2]; // relative to the tonic drone
  const droneOscs: OscillatorNode[] = [];
  for (const mult of droneFreqs) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 58 * mult;
    const g = ctx.createGain();
    g.gain.value = mult === 1 ? 0.22 : 0.1;
    // Slow detune shimmer via a second osc for gentle beating.
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = 58 * mult * 1.003;
    const g2 = ctx.createGain();
    g2.gain.value = 0.05;
    o.connect(g);
    o2.connect(g2);
    g.connect(droneBus);
    g2.connect(droneBus);
    droneOscs.push(o, o2);
  }

  const voices = new Map<number, Voice>();

  function noteOn(midi: number, velocity: number) {
    if (ctx.state !== "running") return;
    // Retrigger: release any existing voice on this key first.
    const existing = voices.get(midi);
    if (existing) releaseVoice(existing, midi);

    const hz = midiToJiHz(midi);
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    osc1.frequency.value = hz;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 2.001; // faint octave sparkle + tiny beat

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400 + hz * 4 + velocity * 1800;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    const peak = 0.18 + velocity * 0.22; // pre-limiter, comfortably below cap
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.06); // soft attack

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(limiter);

    osc1.start(now);
    osc2.start(now);

    voices.set(midi, {
      osc1,
      osc2,
      filter,
      gain,
      hz,
      velocity,
      releasing: false,
    });
  }

  function releaseVoice(v: Voice, midi: number) {
    if (v.releasing) return;
    v.releasing = true;
    const now = ctx.currentTime;
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.0001, now + 0.35); // soft release
    v.osc1.stop(now + 0.42);
    v.osc2.stop(now + 0.42);
    window.setTimeout(() => {
      try {
        v.osc1.disconnect();
        v.osc2.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* already gone */
      }
      if (voices.get(midi) === v) voices.delete(midi);
    }, 500);
  }

  function noteOff(midi: number) {
    const v = voices.get(midi);
    if (v) releaseVoice(v, midi);
  }

  function sounding() {
    const out: { midi: number; hz: number; gain: number }[] = [];
    voices.forEach((v, midi) => {
      if (!v.releasing) {
        out.push({ midi, hz: v.hz, gain: 0.4 + v.velocity * 0.6 });
      }
    });
    return out;
  }

  let started = false;
  async function resume() {
    await ctx.resume();
    if (!started) {
      const t = ctx.currentTime + 0.02;
      for (const o of droneOscs) o.start(t);
      started = true;
    }
  }

  async function close() {
    try {
      voices.forEach((v) => {
        try {
          v.osc1.stop();
          v.osc2.stop();
        } catch {
          /* noop */
        }
      });
      voices.clear();
      await ctx.close();
    } catch {
      /* already closed */
    }
  }

  return { ctx, resume, noteOn, noteOff, sounding, close };
}
