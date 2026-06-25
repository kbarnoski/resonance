// audio.ts — safe master chain, a bright friendly bird chirp synth, and a
// shared-clock look-ahead canon scheduler. Every voice (bird) plays the SAME
// melody on ONE clock at a fixed time offset → a real round / canon.

import {
  MelodyNote,
  SCALE_HZ,
  LOOP_SECONDS,
  STEP_SECONDS,
} from "./melody";

// ---- master chain ----------------------------------------------------------
// gain (ceiling) → lowpass → compressor → destination. Bright but never harsh.
const MASTER_CEIL = 0.26;

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  // index of the bird that "just sang" this frame, for visual pulse, with the
  // wall-clock time it fired. Read by the renderer.
  pulses: { bird: number; at: number; scaleIdx: number }[];
}

export function makeEngine(): AudioEngine | null {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = MASTER_CEIL;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;
  lp.Q.value = 0.4;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  return { ctx, master, pulses: [] };
}

// More birds must NOT mean louder: scale the master headroom by voice count.
export function applyFlockGain(engine: AudioEngine, voices: number) {
  const g = MASTER_CEIL / Math.sqrt(Math.max(1, voices));
  const t = engine.ctx.currentTime;
  engine.master.gain.cancelScheduledValues(t);
  engine.master.gain.setTargetAtTime(g, t, 0.08);
}

// ---- chirp synth ------------------------------------------------------------
// sine/triangle blend with a quick upward pitch-glide attack, light vibrato,
// and a short bell/pluck envelope. Hue/voice tint comes from the caller.
export function runChirp(
  engine: AudioEngine,
  freq: number,
  when: number,
  level = 1,
) {
  const { ctx, master } = engine;
  const dur = 0.42;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  const sine = ctx.createOscillator();
  sine.type = "sine";

  // pitch-glide attack: start a touch below, swoop up to target (bird-like).
  const glideFrom = freq * 0.86;
  osc.frequency.setValueAtTime(glideFrom, when);
  osc.frequency.exponentialRampToValueAtTime(freq, when + 0.05);
  sine.frequency.setValueAtTime(glideFrom, when);
  sine.frequency.exponentialRampToValueAtTime(freq, when + 0.05);

  // light vibrato
  const vib = ctx.createOscillator();
  vib.frequency.value = 6.5;
  const vibGain = ctx.createGain();
  vibGain.gain.value = freq * 0.012;
  vib.connect(vibGain);
  vibGain.connect(osc.frequency);
  vibGain.connect(sine.frequency);

  // blend the two oscillators
  const mix = ctx.createGain();
  mix.gain.value = 0.6;
  const sineMix = ctx.createGain();
  sineMix.gain.value = 0.4;
  osc.connect(mix);
  sine.connect(sineMix);

  // short bell/pluck envelope
  const env = ctx.createGain();
  const peak = 0.9 * level;
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(peak, when + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, when + dur);

  mix.connect(env);
  sineMix.connect(env);
  env.connect(master);

  osc.start(when);
  sine.start(when);
  vib.start(when);
  const stop = when + dur + 0.02;
  osc.stop(stop);
  sine.stop(stop);
  vib.stop(stop);
}

// ---- soft pad ---------------------------------------------------------------
// A gentle sustained drone (tonic + fifth) under the flock. Stays quiet/musical.
export function startPad(engine: AudioEngine): () => void {
  const { ctx, master } = engine;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  padGain.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
  padGain.connect(master);

  const oscs: OscillatorNode[] = [];
  // C3 + G3 — tonic + fifth of the C-pentatonic scale.
  for (const f of [130.81, 196.0]) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g);
    g.connect(padGain);
    o.start();
    oscs.push(o);
  }

  return () => {
    padGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    for (const o of oscs) {
      try {
        o.stop(ctx.currentTime + 1.0);
      } catch {
        /* already stopped */
      }
    }
  };
}

// ---- canon scheduler --------------------------------------------------------
// One shared look-ahead clock. Each bird is a voice with a constant time
// offset (a fraction of the loop). All voices read the same melody, so adding
// a voice = a time-shifted copy = a round.
export interface CanonState {
  melody: MelodyNote[];
  voices: number; // number of birds
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12; // seconds

// Offset (in seconds) for voice v: stagger evenly across the loop, but classic
// canons enter ~1 phrase apart. We stagger by 1 beat per added voice.
function voiceOffset(v: number): number {
  return v * STEP_SECONDS * 2; // one beat per voice
}

export function makeScheduler(
  engine: AudioEngine,
  getState: () => CanonState,
) {
  // Anchor the loop to a fixed start time so all voices share phase.
  const startTime = engine.ctx.currentTime + 0.1;
  // Track the next step index we've scheduled per voice.
  const nextStep: number[] = [];

  const tick = () => {
    const { ctx } = engine;
    const state = getState();
    const horizon = ctx.currentTime + SCHEDULE_AHEAD;

    for (let v = 0; v < state.voices; v++) {
      if (nextStep[v] === undefined) {
        // New voice: align it to the current loop so it never plays the past.
        const off = voiceOffset(v);
        const elapsed = ctx.currentTime - (startTime + off);
        nextStep[v] = elapsed <= 0 ? 0 : Math.ceil(elapsed / STEP_SECONDS);
      }
    }

    for (let v = 0; v < state.voices; v++) {
      const off = voiceOffset(v);
      while (true) {
        const stepIdx = nextStep[v];
        const loop = Math.floor(stepIdx / state.melody.length);
        const slot = ((stepIdx % state.melody.length) + state.melody.length) %
          state.melody.length;
        const when =
          startTime + off + loop * LOOP_SECONDS + slot * STEP_SECONDS;
        if (when > horizon) break;
        if (when >= ctx.currentTime - 0.01) {
          const note = state.melody[slot];
          if (note && note.scaleIdx >= 0) {
            const freq = SCALE_HZ[note.scaleIdx];
            // later voices a touch softer so the lead melody stays on top
            const level = v === 0 ? 1 : 0.78;
            runChirp(engine, freq, when, level);
            engine.pulses.push({ bird: v, at: when, scaleIdx: note.scaleIdx });
          }
        }
        nextStep[v] = stepIdx + 1;
      }
    }

    // trim old pulses
    const cut = engine.ctx.currentTime - 1;
    while (engine.pulses.length && engine.pulses[0].at < cut) {
      engine.pulses.shift();
    }
  };

  const id = window.setInterval(tick, LOOKAHEAD_MS);
  tick();
  return {
    stop() {
      window.clearInterval(id);
    },
    startTime,
    loopSeconds: LOOP_SECONDS,
    voiceOffset,
  };
}
