// audio.ts — the wordless drone that breathes with the journey.
//
// A just-intonation drone over a low root (A1, 55 Hz). It starts as root +
// octave in the void; as the camera climbs toward the light it ADDS just-tuned
// overtones — a perfect fifth (3/2), major third (5/4) and harmonic seventh
// (7/4) — then withdraws them on the return, so the harmony literally comes
// home. A slow amplitude "breath" LFO modulates the master. Soft bell tones
// (additive partials, long decay) ring when the camera passes tunnel rings.
//
// Everything runs through a short generated-impulse reverb, a low master gain
// (≤ 0.16) and a compressor acting as a limiter. Built only on a user gesture.

import { mulberry32, SEED } from "./rng";

interface Voice {
  ratio: number;
  osc: OscillatorNode;
  gain: GainNode;
  /** target gain as a function of journey state */
  target: (warmth: number, tunnel: number, lightNorm: number) => number;
}

export interface LuminousAudio {
  update(
    warmth: number,
    lightIntensity: number,
    tunnelStrength: number,
  ): void;
  bell(): void;
  stop(): void;
}

const ROOT = 55; // A1
const LIGHT_MAX = 1.55; // matches journey LINT peak, for normalisation

// A just pentatonic for the bells, a few octaves above the root.
const BELL_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2];

/** A short, smooth, deterministic reverb impulse (seeded noise × decay). */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rng = mulberry32(SEED ^ 0x9e37);
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 3.2);
      d[i] = (rng() * 2 - 1) * decay;
    }
  }
  return buf;
}

export function makeLuminousAudio(
  ctx: AudioContext,
  peak: number,
): LuminousAudio {
  const bellRng = mulberry32(SEED ^ 0x51f0);
  let stopped = false;

  // master → limiter → out
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // reverb bus: everything feeds `bus`, split to dry + convolver(wet)
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.82;
  const conv = ctx.createConvolver();
  conv.buffer = makeImpulse(ctx, 2.8);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  bus.connect(dry);
  bus.connect(conv);
  dry.connect(master);
  conv.connect(wet);
  wet.connect(master);

  // amplitude "breath": a sub-audio LFO added onto master gain
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.035;
  const breathAmt = ctx.createGain();
  breathAmt.gain.value = 0.02;
  breath.connect(breathAmt);
  breathAmt.connect(master.gain);
  breath.start();

  // fade the master up gently on start
  master.gain.setTargetAtTime(peak * 0.6, ctx.currentTime, 1.5);

  // ---- drone voices ----
  const voices: Voice[] = [
    {
      ratio: 1,
      osc: ctx.createOscillator(),
      gain: ctx.createGain(),
      target: () => 0.5,
    },
    {
      ratio: 2,
      osc: ctx.createOscillator(),
      gain: ctx.createGain(),
      target: () => 0.26,
    },
    {
      ratio: 3 / 2,
      osc: ctx.createOscillator(),
      gain: ctx.createGain(),
      target: (_w, tunnel) => 0.3 * tunnel,
    },
    {
      ratio: 5 / 4,
      osc: ctx.createOscillator(),
      gain: ctx.createGain(),
      target: (warmth) => 0.32 * warmth,
    },
    {
      ratio: 7 / 4,
      osc: ctx.createOscillator(),
      gain: ctx.createGain(),
      target: (warmth) => 0.22 * Math.max(0, (warmth - 0.4) / 0.6),
    },
  ];

  for (const v of voices) {
    v.osc.type = "sine";
    v.osc.frequency.value = ROOT * v.ratio;
    v.gain.gain.value = 0;
    v.osc.connect(v.gain);
    v.gain.connect(bus);
    v.osc.start();
  }

  return {
    update(warmth: number, lightIntensity: number, tunnelStrength: number) {
      if (stopped) return;
      const now = ctx.currentTime;
      const lightNorm = Math.min(1, lightIntensity / LIGHT_MAX);
      for (const v of voices) {
        const t = v.target(warmth, tunnelStrength, lightNorm);
        v.gain.gain.setTargetAtTime(t, now, 1.2);
      }
      // overall swell toward the light, damped away from it
      const level = peak * (0.55 + 0.45 * lightNorm);
      master.gain.setTargetAtTime(level, now, 0.8);
    },

    bell() {
      if (stopped) return;
      const now = ctx.currentTime;
      const ratio = BELL_RATIOS[Math.floor(bellRng() * BELL_RATIOS.length)];
      const base = ROOT * 8 * ratio; // ~a few octaves up
      const partials = [1, 2.01, 3.03];
      const amps = [0.05, 0.024, 0.012];
      const dur = 2.6 + bellRng() * 1.2;
      for (let p = 0; p < partials.length; p++) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = base * partials[p];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(amps[p], now + 0.012);
        g.gain.setTargetAtTime(0, now + 0.012, dur * 0.35);
        osc.connect(g);
        g.connect(bus);
        osc.start(now);
        osc.stop(now + dur + 0.4);
      }
    },

    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0, now, 0.4);
      const end = now + 0.9;
      for (const v of voices) {
        try {
          v.osc.stop(end);
        } catch {
          /* already stopped */
        }
      }
      try {
        breath.stop(end);
      } catch {
        /* already stopped */
      }
    },
  };
}
