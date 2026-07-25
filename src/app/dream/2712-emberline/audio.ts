// audio.ts — the additive synthesis engine for "emberline".
//
// Each element is voiced as an additive bank: one sine OscillatorNode per
// emission line, tuned EXACTLY to that line's mapped audible frequency
// (spectra.ts::nmToHz), its gain set by the line's relative intensity. The
// bank sums into one voice with a gentle attack/sustain/release. Advancing
// the tour cross-fades the old voice out while the new one blooms in. A
// shared convolution reverb gives the tour a slow breathing tail.
//
// The LINE frequencies are never detuned — only a slow per-partial amplitude
// shimmer drifts, so the physics stays exact.

import { mulberry32, SEED, type ElementView } from "./spectra";

const ATTACK = 1.4; // s
const RELEASE = 2.2; // s
const VOICE_PEAK = 0.5; // per-voice bus gain before master
const MASTER = 0.32;

interface Voice {
  bus: GainNode;
  oscs: OscillatorNode[];
  lfos: OscillatorNode[];
}

export interface Engine {
  ctx: AudioContext;
  resume(): Promise<void>;
  /** Cross-fade to the given element's additive chord. */
  playElement(view: ElementView): void;
  /** Ramp everything to silence (kept alive; call playElement to resume). */
  silence(): void;
  dispose(): void;
}

/** Build a short exponential-decay stereo impulse response (seeded noise). */
function makeReverbIR(ctx: AudioContext): AudioBuffer {
  const rng = mulberry32(SEED ^ 0x9e37);
  const seconds = 3.2;
  const len = Math.floor(ctx.sampleRate * seconds);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (rng() * 2 - 1) * decay;
    }
  }
  return ir;
}

export function buildEngine(): Engine {
  const Ctor: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(ctx.destination);

  // reverb send + dry path
  const dry = ctx.createGain();
  dry.gain.value = 0.72;
  dry.connect(master);

  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbIR(ctx);
  reverb.connect(wet);
  wet.connect(master);

  // a soft feedback delay so the tour "breathes" between elements
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);

  const voiceOut = (bus: GainNode): void => {
    bus.connect(dry);
    bus.connect(reverb);
    bus.connect(delay);
  };

  let current: Voice | null = null;
  // stable per-partial shimmer rates, deterministic
  const rng = mulberry32(SEED);
  const shimmerRates = Array.from({ length: 24 }, () => 0.04 + rng() * 0.09);

  const stopVoice = (v: Voice, at: number): void => {
    v.bus.gain.cancelScheduledValues(at);
    v.bus.gain.setValueAtTime(v.bus.gain.value, at);
    v.bus.gain.linearRampToValueAtTime(0, at + RELEASE);
    const stopAt = at + RELEASE + 0.05;
    v.oscs.forEach((o) => o.stop(stopAt));
    v.lfos.forEach((o) => o.stop(stopAt));
    window.setTimeout(
      () => {
        try {
          v.bus.disconnect();
        } catch {
          /* already gone */
        }
      },
      (RELEASE + 0.4) * 1000,
    );
  };

  const playElement = (view: ElementView): void => {
    const now = ctx.currentTime;
    if (current) stopVoice(current, now);

    const bus = ctx.createGain();
    bus.gain.value = 0;
    voiceOut(bus);

    const oscs: OscillatorNode[] = [];
    const lfos: OscillatorNode[] = [];
    const sumRel = view.partials.reduce((s, p) => s + p.rel, 0) || 1;

    view.partials.forEach((p, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = p.hz; // EXACT physics frequency, never detuned

      const g = ctx.createGain();
      const base = p.rel / sumRel;
      g.gain.value = base;

      // slow amplitude shimmer (does not touch frequency)
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = shimmerRates[i % shimmerRates.length];
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = base * 0.28;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);

      osc.connect(g);
      g.connect(bus);
      osc.start(now);
      lfo.start(now);
      oscs.push(osc);
      lfos.push(lfo);
    });

    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(VOICE_PEAK, now + ATTACK);

    current = { bus, oscs, lfos };
  };

  return {
    ctx,
    async resume() {
      if (ctx.state !== "running") await ctx.resume();
    },
    playElement,
    silence() {
      if (current) {
        stopVoice(current, ctx.currentTime);
        current = null;
      }
    },
    dispose() {
      if (current) stopVoice(current, ctx.currentTime);
      current = null;
      window.setTimeout(() => {
        void ctx.close();
      }, (RELEASE + 0.5) * 1000);
    },
  };
}
