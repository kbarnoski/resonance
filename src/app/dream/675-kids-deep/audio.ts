// audio.ts — Web Audio engine.
//
// Two voices:
//  1) DRONE  — a slow sustained pedal/tanpura-like voice whose root MIGRATES
//     (frequency glided in the rAF loop from harmony.rootHzAt). Always on, so
//     it is never silent. This is the "floor" the child hears move.
//  2) MALLET — struck/soft pad voice at FIXED pitches triggered by taps.
//
// Kid-safe master chain (hard requirement):
//   masterGain → lowpass ~7.5kHz → DynamicsCompressor(-16,6,12,fast) → dest
// Gains capped, triggers rate-limited (~40ms), context resumed on gesture.

import { HOME_ROOT_HZ } from "./harmony";

export class DeepAudio {
  ctx: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  comp: DynamicsCompressorNode;

  // drone voice
  private droneRoot!: OscillatorNode; // root
  private droneFifth!: OscillatorNode; // 5th above (tanpura-ish)
  private droneOct!: OscillatorNode; // sub-octave body
  private droneSh!: OscillatorNode; // shimmer partial
  private droneGain!: GainNode;
  private droneLfo!: OscillatorNode; // slow breathing
  private droneLfoGain!: GainNode;

  private convBuffer: AudioBuffer;
  private lastTrig = 0;

  constructor() {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0; // fade in after start

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7500;
    this.lowpass.Q.value = 0.4;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 6;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;

    this.master.connect(this.lowpass);
    this.lowpass.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.convBuffer = this.makeReverb(2.6);
    this.buildDrone();
  }

  private makeReverb(seconds: number): AudioBuffer {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
    }
    return buf;
  }

  private buildDrone() {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    this.droneGain = g;

    // soft lowpass on the drone itself to keep it warm/deep
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.Q.value = 0.5;

    const conv = ctx.createConvolver();
    conv.buffer = this.convBuffer;
    const revG = ctx.createGain();
    revG.gain.value = 0.22;

    g.connect(lp);
    lp.connect(this.master);
    lp.connect(conv);
    conv.connect(revG);
    revG.connect(this.master);

    const mk = (
      freq: number,
      type: OscillatorType,
      level: number,
    ): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const vg = ctx.createGain();
      vg.gain.value = level;
      o.connect(vg);
      vg.connect(g);
      o.start();
      return o;
    };

    // root + sub-octave body + 5th + faint shimmer (tanpura-like spread)
    this.droneRoot = mk(HOME_ROOT_HZ, "sawtooth", 0.16);
    this.droneOct = mk(HOME_ROOT_HZ / 2, "sine", 0.5);
    this.droneFifth = mk(HOME_ROOT_HZ * 1.5, "triangle", 0.08);
    this.droneSh = mk(HOME_ROOT_HZ * 3, "sine", 0.025);

    // slow breathing amplitude
    this.droneLfo = ctx.createOscillator();
    this.droneLfo.type = "sine";
    this.droneLfo.frequency.value = 0.07;
    this.droneLfoGain = ctx.createGain();
    this.droneLfoGain.gain.value = 0.18;
    this.droneLfo.connect(this.droneLfoGain);
    this.droneLfoGain.connect(g.gain);
    this.droneLfo.start();
  }

  // Called after the Start gesture. Resumes context and fades everything in.
  async start() {
    await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.85, now + 1.6);
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.linearRampToValueAtTime(0.5, now + 2.2);
  }

  // Glide the whole drone to a new migrating root (called each frame).
  setRoot(rootHz: number) {
    const t = this.ctx.currentTime;
    // setTargetAtTime → smooth analog-like glide, no zipper
    const tc = 0.08;
    this.droneRoot.frequency.setTargetAtTime(rootHz, t, tc);
    this.droneOct.frequency.setTargetAtTime(rootHz / 2, t, tc);
    this.droneFifth.frequency.setTargetAtTime(rootHz * 1.5, t, tc);
    this.droneSh.frequency.setTargetAtTime(rootHz * 3, t, tc);
  }

  // Struck mallet/soft-pad note at a FIXED pitch. tension 0..1 only colours
  // the timbre gently (never harsh) — used for functional recontextualization.
  pluck(hz: number, tension = 0): boolean {
    const now = this.ctx.currentTime;
    if (now - this.lastTrig < 0.04) return false; // global rate-limit ~40ms
    this.lastTrig = now;

    const ctx = this.ctx;
    const env = ctx.createGain();
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = "triangle";
    o2.type = "sine";
    o1.frequency.value = hz;
    o2.frequency.value = hz * 2.0;

    // tension subtly opens a 2nd-partial detune & brightness — beautiful, gentle
    const o2g = ctx.createGain();
    o2g.gain.value = 0.18 + tension * 0.16;
    o2.detune.value = tension * 8; // tiny shimmer, never dissonant slap

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1600 + tension * 1400;
    tone.Q.value = 0.6;

    const peak = 0.22; // capped
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0008, now + 1.6);

    o1.connect(tone);
    o2.connect(o2g);
    o2g.connect(tone);
    tone.connect(env);
    env.connect(this.master);

    // a touch of the shared reverb for depth
    const conv = ctx.createConvolver();
    conv.buffer = this.convBuffer;
    const revG = ctx.createGain();
    revG.gain.value = 0.3;
    env.connect(conv);
    conv.connect(revG);
    revG.connect(this.master);

    o1.start(now);
    o2.start(now);
    o1.stop(now + 1.7);
    o2.stop(now + 1.7);
    return true;
  }

  async dispose() {
    const stop = (o?: OscillatorNode) => {
      try {
        o?.stop();
      } catch {
        /* already stopped */
      }
    };
    stop(this.droneRoot);
    stop(this.droneOct);
    stop(this.droneFifth);
    stop(this.droneSh);
    stop(this.droneLfo);
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
