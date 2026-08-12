// ─────────────────────────────────────────────────────────────────────────────
// 10536-inkmirror — audio.ts
//
// Every laid stroke sounds a warm plucked/bowed voice (gut-string / vielle
// colour): a short filtered-noise attack + a couple of gently inharmonic
// partials with a fast pluck decay. Pitch comes from the stroke's vertical
// position in a warm D-Dorian modal set — high on the figure = high voice.
//
// Underneath, a soft warm pad that MOVES: detuned triangles through a slowly
// swept lowpass, a breathing tremolo, and a root that glides between two modal
// centres every ~13s. NO sustained just-intonation drone, NO consonance lattice.
//
// Whole mix routes through the shared ear-safety master.
// ─────────────────────────────────────────────────────────────────────────────

import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// D-Dorian degrees (semitone offsets), two octaves. Modal, not a JI lattice.
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19, 21, 22, 24];
const BASE_HZ = 146.83; // D3

// slightly inharmonic partial stack for a plucked-string body
const PARTIALS: Array<[number, number]> = [
  [1.0, 1.0],
  [2.01, 0.4],
  [3.02, 0.16],
];

export interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  pluckBus: GainNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
  noiseBuf: AudioBuffer;
  padRoot: OscillatorNode[];
  rnd: () => number;
  padTarget: number;
  padNextAt: number;
}

export function createAudio(rnd: () => number): AudioEngine {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  const master = createSafeMaster(ctx, { gain: 0.82 });

  // ── pluck bus (gentle body lowpass so plucks stay warm, never brittle) ─────
  const pluckBus = ctx.createGain();
  pluckBus.gain.value = 0.9;
  const pluckBody = ctx.createBiquadFilter();
  pluckBody.type = "lowpass";
  pluckBody.frequency.value = 2600;
  pluckBody.Q.value = 0.5;
  pluckBus.connect(pluckBody);
  pluckBody.connect(master.input);

  // shared noise buffer for pluck attack transients
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rnd() * 2 - 1;

  // ── moving warm pad ────────────────────────────────────────────────────────
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  padGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  padGain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 3.5);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 520;
  padFilter.Q.value = 0.7;
  padFilter.connect(padGain);
  padGain.connect(master.input);

  // slow filter sweep LFO (keeps the pad breathing, never static)
  const swLfo = ctx.createOscillator();
  swLfo.type = "sine";
  swLfo.frequency.value = 0.06;
  const swAmt = ctx.createGain();
  swAmt.gain.value = 240;
  swLfo.connect(swAmt);
  swAmt.connect(padFilter.frequency);
  swLfo.start();

  // tremolo on the whole pad
  const trem = ctx.createOscillator();
  trem.type = "sine";
  trem.frequency.value = 0.14;
  const tremAmt = ctx.createGain();
  tremAmt.gain.value = 0.05;
  trem.connect(tremAmt);
  tremAmt.connect(padGain.gain);
  trem.start();

  // three detuned voices a warm modal chord (root, minor-third, fifth-ish)
  const padRoot: OscillatorNode[] = [];
  const chord = [0, 3, 7];
  chord.forEach((semi, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "triangle" : "sine";
    o.frequency.value = (BASE_HZ / 2) * Math.pow(2, semi / 12);
    o.detune.value = (i - 1) * 6;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.3;
    o.connect(g);
    g.connect(padFilter);
    o.start();
    padRoot.push(o);
    // slow independent detune drift so the chord never sits still
    const d = ctx.createOscillator();
    d.type = "sine";
    d.frequency.value = 0.03 + i * 0.011;
    const da = ctx.createGain();
    da.gain.value = 7;
    d.connect(da);
    da.connect(o.detune);
    d.start();
  });

  return {
    ctx,
    master,
    pluckBus,
    padGain,
    padFilter,
    noiseBuf,
    padRoot,
    rnd,
    padTarget: 0,
    padNextAt: 0,
  };
}

/** Fire one warm plucked voice. y ∈ [0,1] → pitch; speed → velocity. */
export function pluck(
  eng: AudioEngine,
  x: number,
  y: number,
  speed: number,
  hue: number,
): void {
  const { ctx, pluckBus, noiseBuf, rnd } = eng;
  const t0 = ctx.currentTime;
  const deg = Math.max(0, Math.min(DORIAN.length - 1, Math.round(y * (DORIAN.length - 1))));
  const detune = (rnd() - 0.5) * 12; // ±6 cents — breaks any clean lattice
  const freq = BASE_HZ * Math.pow(2, DORIAN[deg] / 12) * Math.pow(2, detune / 1200);
  const vel = 0.14 + Math.min(1, speed) * 0.42;
  // accents ring a touch brighter / longer
  const decay = (hue === 0 ? 0.85 : 1.1) + rnd() * 0.4;

  const pan = ctx.createStereoPanner();
  pan.pan.value = (x - 0.5) * 1.4;
  const voice = ctx.createGain();
  voice.gain.value = 1;
  pan.connect(pluckBus);
  voice.connect(pan);

  // attack transient: a short filtered noise "finger" on the string
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = freq * 2;
  nf.Q.value = 0.8;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * 0.5, t0);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(voice);
  noise.start(t0);
  noise.stop(t0 + 0.08);

  // partials with a plucked exponential decay
  PARTIALS.forEach(([ratio, pg], i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? "triangle" : "sine";
    o.frequency.value = freq * ratio;
    const g = ctx.createGain();
    const a = vel * pg;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(a, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay * (1 - i * 0.22));
    o.connect(g);
    g.connect(voice);
    o.start(t0);
    o.stop(t0 + decay + 0.1);
  });
}

/** Per-frame: glide the pad root between two modal centres so it keeps moving. */
export function updatePad(eng: AudioEngine, now: number): void {
  if (now < eng.padNextAt) return;
  eng.padNextAt = now + 11 + eng.rnd() * 5;
  // choose a new modal centre: down a fourth or up a whole tone
  const options = [0, 2, -5, 5];
  eng.padTarget = options[(eng.rnd() * options.length) | 0];
  const chord = [0, 3, 7];
  eng.padRoot.forEach((o, i) => {
    const semi = chord[i] + eng.padTarget;
    const f = (BASE_HZ / 2) * Math.pow(2, semi / 12);
    o.frequency.setTargetAtTime(f, eng.ctx.currentTime, 2.5); // slow glide
  });
}

export function closeAudio(eng: AudioEngine): void {
  try {
    eng.padGain.gain.setTargetAtTime(0.0001, eng.ctx.currentTime, 0.2);
    eng.master.disconnect();
  } catch {
    /* already closing */
  }
  try {
    void eng.ctx.close();
  } catch {
    /* ignore */
  }
}
