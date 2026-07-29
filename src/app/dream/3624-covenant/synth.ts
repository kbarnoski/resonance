// synth.ts — self-contained Web Audio voices (soft ADSR sine/triangle).
// No external samples, no server. Everything is oscillator + gain envelopes.

import { midiToFreq } from "./accompanist";

export interface SynthGraph {
  ctx: AudioContext;
  melodyBus: GainNode; // the player's own notes
  padBus: GainNode; // accompanist sustained harmony
  compBus: GainNode; // accompanist rhythmic comping / bass
}

export function makeSynth(): SynthGraph {
  const Ctor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.9;

  // gentle master lowpass so nothing is harsh
  const soft = ctx.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 5200;
  soft.Q.value = 0.4;

  const melodyBus = ctx.createGain();
  melodyBus.gain.value = 0.5;
  const padBus = ctx.createGain();
  padBus.gain.value = 0.0; // faded up on first sound
  const compBus = ctx.createGain();
  compBus.gain.value = 0.0;

  melodyBus.connect(soft);
  padBus.connect(soft);
  compBus.connect(soft);
  soft.connect(master);
  master.connect(ctx.destination);

  return { ctx, melodyBus, padBus, compBus };
}

// A single plucked/struck ADSR voice.
export function playVoice(
  ctx: AudioContext,
  dest: AudioNode,
  midi: number,
  opts: { type?: OscillatorType; gain?: number; attack?: number; decay?: number; sustain?: number; release?: number; dur?: number } = {},
): void {
  const {
    type = "triangle",
    gain = 0.3,
    attack = 0.008,
    decay = 0.12,
    sustain = 0.35,
    release = 0.5,
    dur = 0.35,
  } = opts;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = midiToFreq(midi);

  // a soft detuned partial for warmth
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = midiToFreq(midi);
  osc2.detune.value = 6;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * sustain), t + attack + decay);
  const end = t + attack + decay + dur;
  g.gain.setValueAtTime(Math.max(0.0001, gain * sustain), end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + release);

  osc.connect(g);
  osc2.connect(g);
  g.connect(dest);
  osc.start(t);
  osc2.start(t);
  osc.stop(end + release + 0.05);
  osc2.stop(end + release + 0.05);
}

// Handle to a sustained chord that can be released & replaced smoothly.
export interface ChordHandle {
  release: (when?: number) => void;
}

export function voiceSustainedChord(
  ctx: AudioContext,
  dest: AudioNode,
  midis: number[],
  level: number,
): ChordHandle {
  const t = ctx.currentTime;
  const group = ctx.createGain();
  group.gain.setValueAtTime(0.0001, t);
  group.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), t + 0.35);
  group.connect(dest);

  const oscs: OscillatorNode[] = [];
  midis.forEach((m, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "sine" : "triangle";
    osc.frequency.value = midiToFreq(m);
    osc.detune.value = i === 0 ? 0 : (i % 2 === 0 ? 5 : -5);
    const vg = ctx.createGain();
    vg.gain.value = 1 / Math.max(1, midis.length);
    osc.connect(vg);
    vg.connect(group);
    osc.start(t);
    oscs.push(osc);
  });

  return {
    release: (when = 0.4) => {
      const now = ctx.currentTime;
      group.gain.cancelScheduledValues(now);
      group.gain.setValueAtTime(Math.max(0.0001, group.gain.value), now);
      group.gain.exponentialRampToValueAtTime(0.0001, now + when);
      oscs.forEach((o) => o.stop(now + when + 0.05));
    },
  };
}
