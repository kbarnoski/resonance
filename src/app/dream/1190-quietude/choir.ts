// choir.ts — a just-intonation drone-choir that is ALWAYS synthesizing.
//
// Seven voices tuned in pure JI ratios over a 110 Hz root. Each voice is a
// pair of slightly detuned oscillators (chorus beating) with a sub-0.3 Hz
// shimmer LFO on their detune, shaped by a gentle peaking formant, summed into
// a shared procedural convolution reverb, through a limiter, to a master gain
// the room's quiet ramps open. Voices fade in one at a time as stillness is
// rewarded, so deep silence is audibly RICHER.

const ROOT_HZ = 110;

// Just-intonation partials: unison, major 2nd, major 3rd, perfect 5th,
// major 6th, major 7th, octave.
const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 15 / 8, 2] as const;

// Lower partials carry more weight; upper partials sit lighter (ivory sheen).
const LEVELS = [1.0, 0.62, 0.6, 0.7, 0.5, 0.36, 0.44] as const;

const PEAK_MASTER = 0.18;

interface Voice {
  gain: GainNode; // per-voice fade (unlock) envelope
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  lfo: OscillatorNode;
  base: number; // its resting level
}

/** Build a decaying-noise impulse response for a soft cathedral reverb. */
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export class Choir {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private started = false;

  get isRunning(): boolean {
    return this.started;
  }

  /** Create the audio graph and begin synthesizing. Master starts at 0. */
  async start(): Promise<void> {
    if (this.started) return;
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const ctx = new Ctor();
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0; // ramp up from silence — no click

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.006;
    limiter.release.value = 0.25;

    // Wet/dry reverb bus.
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 3.6, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    const bus = ctx.createGain();
    bus.gain.value = 1;

    bus.connect(dry).connect(limiter);
    bus.connect(convolver).connect(wet).connect(limiter);
    limiter.connect(master).connect(ctx.destination);

    const voices: Voice[] = [];
    for (let i = 0; i < RATIOS.length; i++) {
      const freq = ROOT_HZ * RATIOS[i];
      const vGain = ctx.createGain();
      vGain.gain.value = i === 0 ? LEVELS[0] : 0; // root on, rest fade in

      const shape = ctx.createBiquadFilter();
      shape.type = "peaking";
      shape.frequency.value = freq;
      shape.Q.value = 1.1;
      shape.gain.value = 3;

      const soften = ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 2600;
      soften.Q.value = 0.6;

      const oscA = ctx.createOscillator();
      oscA.type = i < 3 ? "triangle" : "sine";
      oscA.frequency.value = freq;
      oscA.detune.value = -4;

      const oscB = ctx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.value = freq;
      oscB.detune.value = 4;

      // Sub-0.3 Hz shimmer on detune — the "breath" of each voice.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03; // 0.05 .. 0.23 Hz
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 5 + i; // cents
      lfo.connect(lfoDepth);
      lfoDepth.connect(oscA.detune);
      lfoDepth.connect(oscB.detune);

      oscA.connect(shape);
      oscB.connect(shape);
      shape.connect(soften).connect(vGain).connect(bus);

      oscA.start();
      oscB.start();
      lfo.start();

      voices.push({ gain: vGain, oscA, oscB, lfo, base: LEVELS[i] });
    }

    this.ctx = ctx;
    this.master = master;
    this.voices = voices;
    this.started = true;
  }

  /** Openness (0..1) → master gain, glide to avoid zipper noise. */
  setOpenness(openness: number): void {
    if (!this.ctx || !this.master) return;
    const target = Math.max(0, Math.min(1, openness)) * PEAK_MASTER;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  /**
   * Fractional unlock count (1..7). Voice i fades in as `unlocked` passes it,
   * so a newly-unlocked voice blooms rather than snapping on.
   */
  setUnlocked(unlocked: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const frac = Math.max(0, Math.min(1, unlocked - i));
      const lvl = i === 0 ? v.base : v.base * frac;
      v.gain.gain.setTargetAtTime(lvl, now, 1.2);
    }
  }

  /** Full teardown — ramp down, stop oscillators, disconnect, close context. */
  async stop(): Promise<void> {
    if (!this.started) return;
    const ctx = this.ctx;
    const master = this.master;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    }
    await new Promise((r) => setTimeout(r, 350));
    for (const v of this.voices) {
      try {
        v.oscA.stop();
        v.oscB.stop();
        v.lfo.stop();
        v.oscA.disconnect();
        v.oscB.disconnect();
        v.lfo.disconnect();
        v.gain.disconnect();
      } catch {
        // already torn down
      }
    }
    try {
      master?.disconnect();
      await ctx?.close();
    } catch {
      // ignore
    }
    this.voices = [];
    this.ctx = null;
    this.master = null;
    this.started = false;
  }
}

export const VOICE_COUNT = RATIOS.length;
