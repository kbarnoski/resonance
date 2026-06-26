// audio.ts — Web Audio synthesis for the taqsim.
//
// NO granular synthesis (banned). The melody is a plucked/struck oud-or-qanun
// tone: triangle+saw oscillators through a fast-decaying lowpass envelope, with
// a detuned sympathetic partial. A sustained tanbura drone (tonic + fifth)
// sits underneath as two slowly-beating oscillators.
//
// Master chain: masterGain (≤0.28) → lowpass (~7k) → DynamicsCompressor → dest.

import { centsToFreq } from "./maqam";
import { NoteEvent } from "./sayr";

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  tonicHz: number;
  drone: { stop: () => void };
}

export function buildEngine(tonicHz: number): AudioEngine | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.0;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  master.connect(lp).connect(comp).connect(ctx.destination);

  // fade master in gently (avoid clicks)
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.26, ctx.currentTime + 1.5);

  const drone = startDrone(ctx, master, tonicHz);

  return { ctx, master, tonicHz, drone };
}

// ── Tanbura drone: tonic + fifth (700c), slow beating ─────────────────────
function startDrone(ctx: AudioContext, master: GainNode, tonicHz: number) {
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);
  droneGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  droneGain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 3);

  const oscs: OscillatorNode[] = [];
  const make = (cents: number, detuneCents: number, gain: number) => {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "sawtooth";
    o2.type = "sawtooth";
    const f = centsToFreq(tonicHz, cents);
    o1.frequency.value = f;
    o2.frequency.value = f;
    o1.detune.value = -detuneCents;
    o2.detune.value = detuneCents; // a few cents apart → slow beating
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.value = gain;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(droneGain);
    o1.start();
    o2.start();
    oscs.push(o1, o2);
  };

  make(0, 4, 0.6); // tonic
  make(700, 4, 0.45); // fifth
  make(-1200, 3, 0.4); // low octave body

  return {
    stop: () => {
      const t = ctx.currentTime;
      droneGain.gain.cancelScheduledValues(t);
      droneGain.gain.setValueAtTime(droneGain.gain.value, t);
      droneGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      oscs.forEach((o) => {
        try {
          o.stop(t + 1.4);
        } catch {
          /* already stopped */
        }
      });
    },
  };
}

// ── A single plucked/struck note with ornaments ───────────────────────────
export function playNote(eng: AudioEngine, ev: NoteEvent): void {
  if (ev.rest) return;
  const { ctx, master, tonicHz } = eng;
  const now = ctx.currentTime;
  const baseFreq = centsToFreq(tonicHz, ev.cents);
  const durS = Math.min(2.2, ev.durationMs / 1000);

  // body: triangle + saw blend
  const oTri = ctx.createOscillator();
  const oSaw = ctx.createOscillator();
  oTri.type = "triangle";
  oSaw.type = "sawtooth";

  // sympathetic resonance: a slightly detuned, quieter partial
  const oSym = ctx.createOscillator();
  oSym.type = "triangle";
  oSym.detune.value = 6;

  const mix = ctx.createGain();
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.35;
  const symGain = ctx.createGain();
  symGain.gain.value = 0.18;

  // fast-decaying lowpass envelope = the pluck
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const openF = Math.min(6500, baseFreq * 7 + 800);
  lp.frequency.setValueAtTime(openF, now);
  lp.frequency.exponentialRampToValueAtTime(Math.max(300, baseFreq * 1.5), now + 0.18);
  lp.Q.value = 1.2;

  const amp = ctx.createGain();
  const peak = 0.14 + ev.emphasis * 0.16;
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(peak, now + 0.008); // sharp attack
  // pluck decay; held tones sustain a touch longer
  const sustainTail = ev.trill ? durS : Math.min(durS, 0.9);
  amp.gain.exponentialRampToValueAtTime(peak * 0.25, now + 0.12);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + sustainTail + 0.15);

  // ── pitch: set base, apply portamento / grace / trill / lean ──
  const setFreq = (osc: OscillatorNode, f: number) => {
    osc.frequency.setValueAtTime(f, now);
  };

  const startFreq =
    ev.glide && ev.prevCents != null
      ? centsToFreq(tonicHz, ev.prevCents)
      : ev.grace != null
        ? centsToFreq(tonicHz, ev.grace)
        : baseFreq;

  [oTri, oSaw, oSym].forEach((o) => setFreq(o, startFreq));

  const applyTo = (param: AudioParam) => {
    if (ev.glide && ev.prevCents != null) {
      // portamento: smooth slide through microtonal space
      param.setTargetAtTime(baseFreq, now, durS * 0.18 + 0.02);
    } else if (ev.grace != null) {
      // grace note: quick neighbour, then snap to target
      param.setValueAtTime(centsToFreq(tonicHz, ev.grace), now);
      param.setValueAtTime(baseFreq, now + 0.06);
    } else {
      param.setValueAtTime(baseFreq, now);
    }

    if (ev.lean) {
      // leaning: overshoot a touch then settle (the half-flat's life)
      const over = centsToFreq(tonicHz, ev.cents + 22);
      param.setTargetAtTime(over, now + 0.05, 0.04);
      param.setTargetAtTime(baseFreq, now + 0.18, 0.08);
    }

    if (ev.trill) {
      // vibrato/trill ~5 Hz on the held tone
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 4.5 + Math.random() * 1.5;
      lfoGain.gain.value = baseFreq * 0.012; // ~20 cents depth
      lfo.connect(lfoGain).connect(param);
      lfo.start(now + 0.2);
      lfo.stop(now + sustainTail + 0.15);
    }
  };

  applyTo(oTri.frequency);
  applyTo(oSaw.frequency);
  applyTo(oSym.frequency);

  oTri.connect(mix);
  oSaw.connect(sawGain).connect(mix);
  oSym.connect(symGain).connect(mix);
  mix.connect(lp).connect(amp).connect(master);

  const stopAt = now + sustainTail + 0.3;
  [oTri, oSaw, oSym].forEach((o) => {
    o.start(now);
    o.stop(stopAt);
  });
}

export function teardown(eng: AudioEngine): void {
  try {
    eng.drone.stop();
  } catch {
    /* noop */
  }
  const t = eng.ctx.currentTime;
  try {
    eng.master.gain.cancelScheduledValues(t);
    eng.master.gain.setValueAtTime(eng.master.gain.value, t);
    eng.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  } catch {
    /* noop */
  }
  setTimeout(() => {
    try {
      void eng.ctx.close();
    } catch {
      /* noop */
    }
  }, 600);
}
