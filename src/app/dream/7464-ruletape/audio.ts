// ─────────────────────────────────────────────────────────────────────────────
// 7464-ruletape — audio.ts
//
// Web Audio voice for the turmite. Cell writes fire warm notes (cell-state →
// pitch, x-position → pan). Two things shape the timbre:
//
//   1. The RULETAPE re-voices the instrument: the ratio of R/L/U/N symbols and
//      the tape length move the base register, the oscillator character, and the
//      delay time — so editing the rule literally re-tunes the sound.
//   2. The ORDER METER drives a master lowpass + a noise bed: a chaotic tape is
//      brighter, noisier and denser; an ordered tape is cleaner and groovier.
//
// AudioContext is created/resumed only after the Start gesture (from page.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import type { Turn } from "./turmite";

const SCALE = [0, 3, 5, 7, 10, 12]; // minor pentatonic + octave

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class RuletapeAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private filter: BiquadFilterNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private wet: GainNode;
  private noiseGain: GainNode;
  private noiseFilter: BiquadFilterNode;

  private baseMidi = 48;
  private wave: OscillatorType = "triangle";
  private detune = 0;
  private chaos = 0.5;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 1400;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);

    // feedback delay
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.28;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.34;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.4;
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.wet);
    this.wet.connect(this.filter);

    // chaos noise bed
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 2200;
    this.noiseFilter.Q.value = 0.6;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    noise.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.master);
    noise.start();
  }

  /** Re-voice the instrument from the current tape. */
  setRuleTimbre(tape: Turn[]): void {
    let r = 0;
    let l = 0;
    let turns = 0;
    for (const t of tape) {
      if (t === "R") r++;
      else if (t === "L") l++;
      if (t !== "N") turns++;
    }
    const n = Math.max(1, tape.length);
    // longer tapes sit lower; balance of R vs L skews register a touch
    this.baseMidi = Math.round(54 - n * 1.4 + (r - l) * 0.6);
    // more "turny" tapes get a brighter waveform
    const density = turns / n;
    this.wave = density > 0.85 ? "sawtooth" : density > 0.55 ? "triangle" : "sine";
    this.detune = (r - l) * 4;
    // delay time keyed to tape length → editing the rule reshapes the groove
    const now = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(clamp(0.18 + n * 0.02, 0.12, 0.5), now, 0.1);
  }

  /** Drive brightness/noise from the order meter (0 chaos … 1 order). */
  setOrder(order: number): void {
    this.chaos = clamp(1 - order, 0, 1);
    const now = this.ctx.currentTime;
    // chaos → bright + open; order → mellow
    const cutoff = 500 + this.chaos * this.chaos * 5200;
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.15);
    this.filter.Q.setTargetAtTime(0.6 + this.chaos * 3, now, 0.15);
    this.noiseGain.gain.setTargetAtTime(this.chaos * this.chaos * 0.06, now, 0.2);
    this.noiseFilter.frequency.setTargetAtTime(1200 + this.chaos * 3000, now, 0.2);
    this.feedback.gain.setTargetAtTime(0.2 + order * 0.32, now, 0.2);
  }

  /**
   * Fire one note. `state` 0..k-1 and vertical position pick the scale degree;
   * `pan` is -1..1 from the ant's x. Throttled by the caller (~6–9/sec).
   */
  note(state: number, k: number, yNorm: number, pan: number, velocity = 1): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const degree = (state + Math.round((1 - yNorm) * (k + 2))) % SCALE.length;
    const octave = Math.floor((1 - yNorm) * 2);
    const midi = this.baseMidi + SCALE[degree] + octave * 12;
    const hz = midiToHz(midi);

    const osc = ctx.createOscillator();
    osc.type = this.wave;
    osc.frequency.value = hz;
    osc.detune.value = this.detune + (Math.random() - 0.5) * 5;

    const vLP = ctx.createBiquadFilter();
    vLP.type = "lowpass";
    vLP.frequency.value = clamp(hz * 4, 600, 6000);
    vLP.Q.value = 0.8;

    const g = ctx.createGain();
    const peak = 0.09 + velocity * 0.05;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55 + this.chaos * 0.2);

    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);

    osc.connect(vLP);
    vLP.connect(g);
    g.connect(panner);
    panner.connect(this.filter);
    panner.connect(this.delay);

    osc.start(now);
    osc.stop(now + 0.9 + this.chaos * 0.2);
  }

  setMuted(muted: boolean): void {
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.9, now, 0.05);
  }

  stop(): void {
    try {
      this.master.disconnect();
    } catch {
      /* already gone */
    }
  }
}
