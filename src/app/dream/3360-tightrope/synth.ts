// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — the played instrument (Web Audio, fully synthesized).
//
//   • A low tonic DRONE (C + G, sines) sounds the key so tension is audible, not
//     just theoretical — you hear how a note sits against home.
//   • Each keypress plucks a clean two-partial tone with a fast decay envelope,
//     through a light feedback-delay space. Dissonant notes are voiced a touch
//     brighter and sourer so the danger is heard as well as felt.
//   • As the walker wobbles, a detune LFO swells on the drone — an instability
//     that rises with his lean.
//   • When he falls, the drone bends downward and collapses to silence.
// ─────────────────────────────────────────────────────────────────────────────

import { TONIC_MIDI } from "./harmony";

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class TightropeSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private dryBus: GainNode;
  private reverbIn: GainNode;
  private droneGain: GainNode;
  private wobbleDepth: GainNode;
  private wobbleLfo: OscillatorNode;
  private droneOscs: OscillatorNode[] = [];
  private alive = true;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1;
    this.dryBus.connect(this.master);

    // Light algorithmic space: two feedback delays, low-passed feedback.
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    wet.connect(this.master);
    for (const time of [0.17, 0.27]) {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = time;
      const fb = ctx.createGain();
      fb.gain.value = 0.34;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      this.reverbIn.connect(delay);
      delay.connect(lp);
      lp.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
    }

    // Drone bus (recreated on reset).
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.dryBus);
    this.droneGain.connect(this.reverbIn);

    // Instability LFO → drone detune.
    this.wobbleLfo = ctx.createOscillator();
    this.wobbleLfo.type = "sine";
    this.wobbleLfo.frequency.value = 5.6;
    this.wobbleDepth = ctx.createGain();
    this.wobbleDepth.gain.value = 0; // cents of detune, driven by wobble
    this.wobbleLfo.connect(this.wobbleDepth);
    this.wobbleLfo.start();

    this.startDrone();
  }

  private startDrone(): void {
    const now = this.ctx.currentTime;
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(0.0001, now);
    this.droneGain.gain.exponentialRampToValueAtTime(0.14, now + 1.2);

    const roots = [TONIC_MIDI - 12, TONIC_MIDI - 5]; // C2 + G2
    for (const midi of roots) {
      const osc = this.ctx.createOscillator();
      osc.type = midi === roots[0] ? "triangle" : "sine";
      osc.frequency.value = midiToFreq(midi);
      this.wobbleDepth.connect(osc.detune);
      osc.connect(this.droneGain);
      osc.start();
      this.droneOscs.push(osc);
    }
  }

  private stopDrone(): void {
    for (const osc of this.droneOscs) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      osc.disconnect();
    }
    this.droneOscs = [];
  }

  /** Pluck a note. `tension` ∈ [0,1] colours the timbre toward the sour side. */
  pluck(midi: number, tension: number): void {
    if (!this.alive) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const freq = midiToFreq(midi);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.32, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.9);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400 + (1 - tension) * 2600, t0);
    lp.frequency.exponentialRampToValueAtTime(700, t0 + 0.7);
    lp.Q.value = 1.2;

    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;

    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2;
    o2.detune.value = tension * 28; // dissonant notes ring slightly sour
    const o2g = ctx.createGain();
    o2g.gain.value = 0.2 + tension * 0.35;

    o1.connect(lp);
    o2.connect(o2g);
    o2g.connect(lp);
    lp.connect(env);
    env.connect(this.dryBus);
    env.connect(this.reverbIn);

    o1.start(t0);
    o2.start(t0);
    o1.stop(t0 + 1.1);
    o2.stop(t0 + 1.1);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      o2g.disconnect();
      lp.disconnect();
      env.disconnect();
    };
  }

  /** Drive the audible instability from the walker's wobble ∈ [0,1]. */
  setWobble(w: number): void {
    if (!this.alive) return;
    const now = this.ctx.currentTime;
    this.wobbleDepth.gain.setTargetAtTime(w * w * 55, now, 0.08);
  }

  /** Downward collapse gesture, then silence. */
  collapse(): void {
    if (!this.alive) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Bend the drone down and fade it.
    for (const osc of this.droneOscs) {
      const f = osc.frequency.value;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(18, f * 0.25), now + 1.1);
    }
    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.setValueAtTime(this.droneGain.gain.value || 0.14, now);
    this.droneGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
    this.wobbleDepth.gain.setTargetAtTime(0, now, 0.2);

    // A short falling sweep — the sound of him going over.
    const sweep = ctx.createOscillator();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(midiToFreq(TONIC_MIDI + 12), now);
    sweep.frequency.exponentialRampToValueAtTime(midiToFreq(TONIC_MIDI - 20), now + 0.9);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    sg.gain.exponentialRampToValueAtTime(0.0008, now + 1.0);
    const sf = ctx.createBiquadFilter();
    sf.type = "lowpass";
    sf.frequency.value = 1400;
    sweep.connect(sf);
    sf.connect(sg);
    sg.connect(this.dryBus);
    sg.connect(this.reverbIn);
    sweep.start(now);
    sweep.stop(now + 1.05);
    sweep.onended = () => {
      sweep.disconnect();
      sf.disconnect();
      sg.disconnect();
    };
  }

  /** Restart the drone after a fall/win reset. */
  reset(): void {
    if (!this.alive) return;
    this.stopDrone();
    this.startDrone();
  }

  /** Tear everything down (page closes the AudioContext afterward). */
  stop(): void {
    if (!this.alive) return;
    this.alive = false;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.15);
    this.stopDrone();
    try {
      this.wobbleLfo.stop();
    } catch {
      /* already stopped */
    }
  }
}
