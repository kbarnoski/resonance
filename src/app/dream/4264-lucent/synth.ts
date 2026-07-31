// synth.ts — seeded felt-piano fallback for 4264-lucent.
//
// When Karel's real recording can't be fetched/decoded (network, CORS, 404),
// we still need the piece to SOUND and to feed the analyser. This engine plays
// a slow, generative felt-piano progression: a handful of detuned-triangle
// voices with soft attack/release through a lowpass "felt" filter and a long
// convolution tail. Every choice is drawn from a mulberry32 stream so two runs
// are identical.
//
// It exposes the same { analyser } contract as the real chain, so the visual
// layer is oblivious to which source is playing.

import { mulberry32, SEED } from "./rng";

export interface SynthEngine {
  analyser: AnalyserNode;
  stop(): void;
}

// A gentle Dorian-ish palette (semitone offsets from a root) that voice-leads
// smoothly and never lands anywhere harsh. Root ~ A2.
const ROOT_HZ = 110; // A2
const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15]; // extended dorian

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
      // Seeded noise burst with an exponential decay — a cheap plate tail.
      d[i] = (rand() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  return buf;
}

export function buildSynthEngine(ctx: AudioContext): SynthEngine {
  const rand = mulberry32(SEED ^ 0x9e3779b9);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;

  // Master + felt lowpass + reverb send.
  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.gain.setValueAtTime(0.0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2.5);

  const felt = ctx.createBiquadFilter();
  felt.type = "lowpass";
  felt.frequency.value = 2600;
  felt.Q.value = 0.5;

  const convolver = ctx.createConvolver();
  convolver.buffer = buildReverbBuffer(ctx, 4.2, rand);
  const wet = ctx.createGain();
  wet.gain.value = 0.4;
  const dry = ctx.createGain();
  dry.gain.value = 0.8;

  // felt -> dry -> master ; felt -> convolver -> wet -> master
  felt.connect(dry);
  dry.connect(master);
  felt.connect(convolver);
  convolver.connect(wet);
  wet.connect(master);

  master.connect(analyser);
  master.connect(ctx.destination);

  // ── Note voice ────────────────────────────────────────────────────────────
  function playNote(freq: number, when: number, dur: number, vel: number): void {
    // Two slightly detuned triangles + a soft sub for body.
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.04); // soft felt attack
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(felt);

    const detunes = [-4, 5];
    for (const cents of detunes) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(g);
      o.start(when);
      o.stop(when + dur + 0.05);
    }
    // Sub sine an octave down for warmth.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq * 0.5;
    const subG = ctx.createGain();
    subG.gain.setValueAtTime(0, when);
    subG.gain.linearRampToValueAtTime(vel * 0.35, when + 0.05);
    subG.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    sub.connect(subG);
    subG.connect(felt);
    sub.start(when);
    sub.stop(when + dur + 0.05);
  }

  // ── Generative scheduler (lookahead) ───────────────────────────────────────
  // Slow arpeggio + occasional bloom chords. The audio clock (ctx.currentTime)
  // drives timing; mulberry32 drives every stochastic choice.
  let nextTime = ctx.currentTime + 0.3;
  const STEP_SEC = 0.9; // slow, dreamlike pulse

  function scheduleAhead(): void {
    const horizon = ctx.currentTime + 1.5;
    while (nextTime < horizon) {
      const r = rand();
      // Register wanders slowly over a long span for long-form variety.
      const octave = 1 + Math.floor(rand() * 3); // 1..3
      const degree = SCALE[Math.floor(rand() * SCALE.length)];
      const freq = ROOT_HZ * midiRatio(degree) * Math.pow(2, octave - 1);
      const vel = 0.10 + rand() * 0.14;

      if (r < 0.72) {
        // single sustained note
        playNote(freq, nextTime, 3.0 + rand() * 2.5, vel);
      } else {
        // a soft bloom chord — a stack of thirds within the scale
        const dur = 4.0 + rand() * 3.0;
        playNote(freq, nextTime, dur, vel);
        playNote(freq * midiRatio(SCALE[2]), nextTime + 0.06, dur, vel * 0.8);
        playNote(freq * midiRatio(SCALE[4]), nextTime + 0.12, dur, vel * 0.7);
      }
      // Occasional rests keep it breathing.
      const gap = rand() < 0.25 ? STEP_SEC * 2 : STEP_SEC;
      nextTime += gap;
    }
  }

  scheduleAhead();
  const timer = window.setInterval(scheduleAhead, 400);

  function stop(): void {
    window.clearInterval(timer);
    try {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.3);
    } catch {
      /* ok */
    }
    // Disconnect after the fade so we don't click.
    window.setTimeout(() => {
      try {
        master.disconnect();
        felt.disconnect();
        dry.disconnect();
        wet.disconnect();
        convolver.disconnect();
        analyser.disconnect();
      } catch {
        /* ok */
      }
    }, 400);
  }

  return { analyser, stop };
}
