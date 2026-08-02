// synth.ts — seeded cosmic-ambient pad fallback for 5160-datapigment.
//
// When Karel's real recording can't be fetched/decoded (offline, CORS, 404, no
// decodeAudioData), the piece must still SOUND and feed the analyser. This
// engine plays a slow, drug-free cosmic-ambient drone: a few detuned sine and
// triangle voices in a low, open pentatonic register, crossfading over tens of
// seconds through a soft lowpass and a long reverb tail. It exposes the same
// { analyser } contract as the real chain, so the renderer is oblivious to which
// source is playing. Every choice is seeded (mulberry32) for reproducibility.

import { mulberry32, SEED } from "./rng";

export interface SynthEngine {
  analyser: AnalyserNode;
  stop(): void;
}

const ROOT_HZ = 82.41; // E2 — deep, oceanic
// Open pentatonic offsets (semitones) — never lands anywhere harsh.
const SCALE = [0, 7, 12, 19, 24, 16];

function midiRatio(semi: number): number {
  return Math.pow(2, semi / 12);
}

function buildReverbBuffer(ctx: AudioContext, decaySec: number, rand: () => number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * decaySec);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
  }
  return buf;
}

export function buildSynthEngine(ctx: AudioContext): SynthEngine {
  const rand = mulberry32(SEED ^ 0x9e3779b9);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.72;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3.0);

  const felt = ctx.createBiquadFilter();
  felt.type = "lowpass";
  felt.frequency.value = 1400;
  felt.Q.value = 0.4;
  // Slow filter sweep — the pad "breathes" open and closed.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.03;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 700;
  lfo.connect(lfoGain);
  lfoGain.connect(felt.frequency);
  lfo.start();

  const convolver = ctx.createConvolver();
  convolver.buffer = buildReverbBuffer(ctx, 6.0, rand);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const dry = ctx.createGain();
  dry.gain.value = 0.7;

  felt.connect(dry);
  dry.connect(master);
  felt.connect(convolver);
  convolver.connect(wet);
  wet.connect(master);

  master.connect(analyser);
  master.connect(ctx.destination);

  // A voice = a long crossfading detuned drone note.
  function playVoice(freq: number, when: number, dur: number, vel: number): void {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + dur * 0.4); // long swell in
    g.gain.linearRampToValueAtTime(0.0001, when + dur); // long fade out
    g.connect(felt);

    const detunes = [-6, 7];
    for (const cents of detunes) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(g);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
    // A faint triangle overtone voice for shimmer.
    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = freq * 2;
    const triG = ctx.createGain();
    triG.gain.setValueAtTime(0, when);
    triG.gain.linearRampToValueAtTime(vel * 0.15, when + dur * 0.5);
    triG.gain.linearRampToValueAtTime(0.0001, when + dur);
    tri.connect(triG);
    triG.connect(felt);
    tri.start(when);
    tri.stop(when + dur + 0.1);
  }

  // Slow scheduler: overlapping long drones so the pad never fully silences.
  let nextTime = ctx.currentTime + 0.2;
  const STEP_SEC = 6.0;

  function scheduleAhead(): void {
    const horizon = ctx.currentTime + 8.0;
    while (nextTime < horizon) {
      const octave = Math.floor(rand() * 3); // 0..2
      const degree = SCALE[Math.floor(rand() * SCALE.length)];
      const freq = ROOT_HZ * midiRatio(degree) * Math.pow(2, octave);
      const vel = 0.08 + rand() * 0.1;
      const dur = 10.0 + rand() * 8.0; // long, overlapping
      playVoice(freq, nextTime, dur, vel);
      nextTime += STEP_SEC + rand() * 3.0;
    }
  }

  scheduleAhead();
  const timer = window.setInterval(scheduleAhead, 1500);

  function stop(): void {
    window.clearInterval(timer);
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.4);
    } catch {
      /* ok */
    }
    window.setTimeout(() => {
      try {
        lfo.stop();
        master.disconnect();
        felt.disconnect();
        dry.disconnect();
        wet.disconnect();
        convolver.disconnect();
        analyser.disconnect();
      } catch {
        /* ok */
      }
    }, 500);
  }

  return { analyser, stop };
}
