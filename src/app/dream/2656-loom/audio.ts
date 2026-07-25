// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the chamber-synth voice pool + shared reverb/delay bus.
//
//   Each scheduled note strikes a plucked/struck voice: two lightly-detuned
//   oscillators through a per-note low-pass whose cutoff tracks an attack→decay
//   envelope (brighter when louder). Voices are cheap and short, created per
//   note and reclaimed on `stop`; a registry lets teardown kill everything. A
//   slow drone (root + fifth) provides the SOUNDING HARMONY that the engine's
//   chromatic / interval-expanded transforms bite against — fractional
//   (microtonal) pitches are honoured, so dissonance is real, not snapped away.
//
//   Determinism: the convolver reverb tail is generated from a seeded PRNG
//   (never Math.random). AudioContext must be resumed on a user gesture.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./engine";

const TONIC_HZ = 146.83; // D3 — warm root
const hzOf = (semi: number) => TONIC_HZ * Math.pow(2, semi / 12);

export class LoomAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private busDry: GainNode;
  private busWet: GainNode;
  private reverb: ConvolverNode;
  private delay: DelayNode;
  private delayFb: GainNode;
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];
  private active = new Set<{ nodes: AudioNode[] }>();
  private started = false;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // faded up on start
    this.master.connect(ctx.destination);

    // shared bus: dry + convolver reverb + a feedback delay for air.
    this.busDry = ctx.createGain();
    this.busDry.gain.value = 0.85;
    this.busDry.connect(this.master);

    this.reverb = this.makeReverb(3.6);
    this.busWet = ctx.createGain();
    this.busWet.gain.value = 0.5;
    this.reverb.connect(this.busWet).connect(this.master);

    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.38;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delay.connect(this.delayFb).connect(this.delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.28;
    this.delay.connect(delayOut).connect(this.master);

    // drone
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 520;
    this.droneGain.connect(droneFilter).connect(this.master);
    for (const semi of [-12, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hzOf(semi);
      const g = ctx.createGain();
      g.gain.value = semi === 0 ? 0.5 : 0.28;
      o.connect(g).connect(this.droneGain);
      this.droneOscs.push(o);
    }
  }

  private makeReverb(seconds: number): ConvolverNode {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    const rng = mulberry32(0x2656 ^ 0x5eed);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (rng() * 2 - 1) * Math.pow(1 - t, 2.7);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  get isStarted() {
    return this.started;
  }

  /** Resume + fade the master/drone in. Call from a user gesture. */
  async start() {
    if (this.started) return;
    try {
      await this.ctx.resume();
    } catch {
      /* ignore */
    }
    const now = this.ctx.currentTime;
    for (const o of this.droneOscs) o.start(now);
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.6, now + 4);
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.exponentialRampToValueAtTime(0.16, now + 6);
    this.started = true;
  }

  /** Slowly move the drone to a new root (semitone offset). */
  setDroneRoot(semi: number, when: number) {
    if (!this.started) return;
    const bases = [-12, 0, 7];
    this.droneOscs.forEach((o, i) => {
      o.frequency.cancelScheduledValues(when);
      o.frequency.linearRampToValueAtTime(hzOf(semi + bases[i]), when + 2.5);
    });
  }

  /** Strike one note at absolute AudioContext time `when`. */
  strike(when: number, pitch: number, dur: number, dyn: number) {
    if (!this.started) return;
    const ctx = this.ctx;
    const freq = hzOf(pitch);
    const t = Math.max(when, ctx.currentTime + 0.001);
    const peak = 0.08 + dyn * 0.16;

    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.value = freq;
    o2.detune.value = 5;

    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.Q.value = 6;
    const openTo = 700 + dyn * 3800;
    filt.frequency.setValueAtTime(openTo, t);
    filt.frequency.exponentialRampToValueAtTime(320, t + Math.min(1.4, dur + 0.3));

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    const rel = t + Math.max(0.35, dur * 1.15);
    amp.gain.exponentialRampToValueAtTime(0.0001, rel);

    o1.connect(mix);
    o2.connect(mix);
    mix.connect(filt).connect(amp);
    amp.connect(this.busDry);
    amp.connect(this.reverb);
    amp.connect(this.delay);

    const entry = { nodes: [o1, o2, mix, filt, amp] as AudioNode[] };
    this.active.add(entry);

    o1.start(t);
    o2.start(t);
    o1.stop(rel + 0.1);
    o2.stop(rel + 0.1);
    o2.onended = () => {
      try {
        mix.disconnect();
        filt.disconnect();
        amp.disconnect();
      } catch {
        /* already gone */
      }
      this.active.delete(entry);
    };
  }

  /** Full teardown: stop every voice + drone, then close the context. */
  dispose() {
    const now = this.ctx.currentTime;
    for (const entry of this.active) {
      for (const n of entry.nodes) {
        try {
          if (n instanceof OscillatorNode) n.stop(now);
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }
    this.active.clear();
    for (const o of this.droneOscs) {
      try {
        o.stop(now);
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      void this.ctx.close();
    } catch {
      /* ignore */
    }
  }
}
