// ════════════════════════════════════════════════════════════════════════════
// SONIFICATION (2728-bifurcation)
//
// The live orbit IS the music. Each audio step is one iterate of the logistic
// map at the current r; the resulting x ∈ [0,1] maps CONTINUOUSLY (never
// snapped to any scale — that is the whole point) to a frequency across ~2.8
// octaves. Because rhythm rides one-iterate-per-step, the listener hears the
// period-doubling directly:
//
//   fixed point  → the same pitch every step ⇒ one held tone
//   2-cycle      → two pitches alternating   ⇒ a 2-step ostinato
//   4 / 8-cycle  → a longer repeating figure ⇒ the loop lengthens
//   chaos        → a never-repeating wash    ⇒ approaches noise
//   periodic win → a short clean loop        ⇒ a triplet out of the static
//
// A sustained triangle "drone" glides to each new pitch (portamento wash);
// plucked sine notes mark each iterate and pan by x. The master chain is
// lowpass + limiter so the chaotic zone never blasts.
// ════════════════════════════════════════════════════════════════════════════

import { stepLogistic } from "./logistic";

export interface SynthSnapshot {
  /** most recent orbit value */
  x: number;
  /** most recent sounding frequency (Hz) */
  freq: number;
  /** ring buffer of recent orbit values, oldest → newest */
  history: number[];
}

const F_MIN = 110; // A2
const OCTAVES = 2.8; // → up to ~766 Hz
const STEP_DUR = 0.15; // seconds per iterate (~6.7 steps/s)
const LOOKAHEAD = 0.12; // schedule this far ahead (s)
const TICK_MS = 25; // scheduler wake interval
const HISTORY = 96;

export class LogisticSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private droneOsc: OscillatorNode;
  private droneGain: GainNode;
  private getR: () => number;

  private x = 0.5;
  private freq = F_MIN;
  private nextStepTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private history: number[] = new Array(HISTORY).fill(0.5);
  private started = false;

  constructor(ctx: AudioContext, getR: () => number) {
    this.ctx = ctx;
    this.getR = getR;

    // master: gain (ramped up) → lowpass → limiter → out
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 1.6);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500;
    lp.Q.value = 0.4;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 8;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;

    this.master.connect(lp).connect(limiter).connect(ctx.destination);

    // sustained wash that glides between attractor pitches
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    this.droneOsc = ctx.createOscillator();
    this.droneOsc.type = "triangle";
    this.droneOsc.frequency.value = F_MIN;
    this.droneOsc.connect(this.droneGain).connect(this.master);
  }

  private freqFor(x: number): number {
    return F_MIN * Math.pow(2, x * OCTAVES);
  }

  /** schedule one plucked note + glide the drone, all at audio time t */
  private scheduleStep(t: number): void {
    const r = this.getR();
    this.x = stepLogistic(this.x, r);
    const f = this.freqFor(this.x);
    this.freq = f;

    this.history.push(this.x);
    if (this.history.length > HISTORY) this.history.shift();

    // portamento drone
    this.droneOsc.frequency.setTargetAtTime(f, t, 0.04);

    // plucked marker note, panned by x
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f, t);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + STEP_DUR * 1.7);

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (this.x * 2 - 1) * 0.7;

    osc.connect(g).connect(pan).connect(this.master);
    osc.start(t);
    osc.stop(t + STEP_DUR * 2);
  }

  private tick = (): void => {
    const now = this.ctx.currentTime;
    while (this.nextStepTime < now + LOOKAHEAD) {
      this.scheduleStep(this.nextStepTime);
      this.nextStepTime += STEP_DUR;
    }
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    this.droneOsc.start();
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.tick();
    this.timer = setInterval(this.tick, TICK_MS);
  }

  /** fade out + stop scheduling, keep nodes for a clean resume */
  pause(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.06);
  }

  resume(): void {
    if (this.timer !== null) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.22, now, 0.25);
    this.nextStepTime = now + 0.06;
    this.tick();
    this.timer = setInterval(this.tick, TICK_MS);
  }

  snapshot(): SynthSnapshot {
    return { x: this.x, freq: this.freq, history: this.history };
  }

  dispose(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.droneOsc.stop();
    } catch {
      // already stopped
    }
    try {
      this.master.disconnect();
    } catch {
      // already disconnected
    }
  }
}
