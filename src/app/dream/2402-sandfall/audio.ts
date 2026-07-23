// Audio engine for 2402-sandfall. The sound is DERIVED FROM THE SIMULATION:
// each frame the field's aggregate motion drives three coupled voices.
//
//   pad    — a detuned pentatonic drone. Louder with total motion; brighter
//            (filter opens) with flow; bends DOWN in pitch as grains fall,
//            returning to rest as the pile settles → near silence.
//   rush   — band-passed noise whose gain tracks the flowing fraction, so an
//            avalanche is an audible swell; its band follows fall speed.
//   trickle— high-passed noise gated by collision "contact", the sandy
//            hiss/tick of grains striking the pile.
//
// AudioContext is created only inside a user gesture (Chrome blocks
// gesture-less contexts); webkitAudioContext fallback + SSR guard included.
// No Math.random / Date — the noise buffer is filled from a seeded PRNG.

import { SimStats, SEED, mulberry32, clamp } from "./sim";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

// A major pentatonic stack (A2..E4) — a warm, open drone to colour.
const PAD_FREQS = [110.0, 164.81, 220.0, 277.18, 329.63];

export class SandAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private rushGain: GainNode;
  private rushFilter: BiquadFilterNode;
  private trickGain: GainNode;
  private trickFilter: BiquadFilterNode;
  private sources: AudioBufferSourceNode[] = [];
  private stopped = false;

  constructor() {
    if (typeof window === "undefined") {
      throw new Error("no window (SSR)");
    }
    const AC =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AC) throw new Error("Web Audio unavailable");
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);

    // Pad voice.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 300;
    this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.0001;
    this.padFilter.connect(this.padGain).connect(this.master);
    for (const f of PAD_FREQS) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(this.padFilter);
      o.start();
      this.oscs.push(o);
    }

    // Shared seeded noise buffer (2 s loop).
    const buf = this.makeNoise(ctx);

    // Rush voice (avalanche swell).
    this.rushFilter = ctx.createBiquadFilter();
    this.rushFilter.type = "bandpass";
    this.rushFilter.frequency.value = 500;
    this.rushFilter.Q.value = 0.8;
    this.rushGain = ctx.createGain();
    this.rushGain.gain.value = 0.0001;
    this.rushFilter.connect(this.rushGain).connect(this.master);
    const rushSrc = ctx.createBufferSource();
    rushSrc.buffer = buf;
    rushSrc.loop = true;
    rushSrc.connect(this.rushFilter);
    rushSrc.start();
    this.sources.push(rushSrc);

    // Trickle voice (sandy contact hiss).
    this.trickFilter = ctx.createBiquadFilter();
    this.trickFilter.type = "highpass";
    this.trickFilter.frequency.value = 2600;
    this.trickGain = ctx.createGain();
    this.trickGain.gain.value = 0.0001;
    this.trickFilter.connect(this.trickGain).connect(this.master);
    const trickSrc = ctx.createBufferSource();
    trickSrc.buffer = buf;
    trickSrc.loop = true;
    trickSrc.connect(this.trickFilter);
    trickSrc.start();
    this.sources.push(trickSrc);

    void ctx.resume();
    // Fade master up smoothly (no click, no strobe).
    this.master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.15);
  }

  private makeNoise(ctx: AudioContext) {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rnd = mulberry32(SEED);
    for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
    return buf;
  }

  /** Push one frame of simulation state into the sound. */
  update(stats: SimStats) {
    if (this.stopped) return;
    const now = this.ctx.currentTime;
    const tc = 0.08;

    const eN = clamp(stats.energy / 1.0, 0, 1);
    const fN = clamp(stats.flow / 0.35, 0, 1);
    const faN = clamp(stats.fall / 0.9, 0, 1);
    const cN = clamp(stats.contact / 1.5, 0, 1);
    const alive = stats.count > 0 ? 1 : 0;

    this.padGain.gain.setTargetAtTime(alive * (0.02 + eN * 0.26), now, tc);
    this.padFilter.frequency.setTargetAtTime(260 + fN * 4200, now, tc);
    // Falling grains bend the drone DOWN; a settled pile drifts back up.
    const detune = -faN * 800;
    for (const o of this.oscs) o.detune.setTargetAtTime(detune, now, tc);

    this.rushGain.gain.setTargetAtTime(alive * fN * eN * 0.34, now, tc);
    this.rushFilter.frequency.setTargetAtTime(320 + faN * 2400, now, tc);

    this.trickGain.gain.setTargetAtTime(alive * cN * eN * 0.2, now, 0.04);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.05);
    } catch {
      // ignore
    }
    const t = now + 0.25;
    for (const o of this.oscs) {
      try {
        o.stop(t);
      } catch {
        // ignore
      }
    }
    for (const s of this.sources) {
      try {
        s.stop(t);
      } catch {
        // ignore
      }
    }
    window.setTimeout(() => {
      try {
        void this.ctx.close();
      } catch {
        // ignore
      }
    }, 400);
  }
}
