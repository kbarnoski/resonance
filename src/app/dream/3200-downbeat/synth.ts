// ─────────────────────────────────────────────────────────────────────────────
// 3200-downbeat · synth.ts
//
//   Three synthesised ensemble voices + a conductor "tick", all scheduled at
//   precise AudioContext times so the groove is TIGHT when conducted steadily
//   and audibly flammy when rushed:
//     • bass   — triangle with a plucked envelope through a lowpass
//     • chord  — a few detuned saws through a lowpass (a soft stab)
//     • melody — a 2:1 FM sine voice
//     • tick   — a short filtered blip on every conductor beat, so you HEAR the
//                conductor's pulse land on (or ahead of) the ensemble downbeat.
//
//   No samples, no network. Master ≤ 0.15 through a compressor, silent until
//   the Start gesture creates the context.
// ─────────────────────────────────────────────────────────────────────────────

import type { EnsembleNote, Voice } from "./scheduler";

const MASTER = 0.14;

export class Ensemble {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private busses: Record<Voice, GainNode>;
  private tickGain: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    const mkBus = (g: number) => {
      const bus = ctx.createGain();
      bus.gain.value = g;
      bus.connect(this.comp);
      return bus;
    };
    this.busses = {
      bass: mkBus(0.9),
      chord: mkBus(0.5),
      melody: mkBus(0.6),
    };
    this.tickGain = mkBus(0.55);
  }

  /** Fade in over `fade` seconds from the Start gesture. */
  start(fade = 0.4): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(MASTER, now + fade);
  }

  private env(
    gain: AudioParam,
    t: number,
    peak: number,
    attack: number,
    dur: number,
    release: number
  ): void {
    const a = Math.max(t, this.ctx.currentTime);
    gain.setValueAtTime(0, a);
    gain.linearRampToValueAtTime(peak, a + attack);
    gain.exponentialRampToValueAtTime(
      Math.max(0.0001, peak * 0.25),
      a + attack + dur * 0.6
    );
    gain.exponentialRampToValueAtTime(0.0001, a + attack + dur + release);
  }

  playNote(note: EnsembleNote): void {
    if (note.voice === "bass") this.playBass(note);
    else if (note.voice === "chord") this.playChord(note);
    else this.playMelody(note);
  }

  private playBass(n: EnsembleNote): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = n.freqs[0];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, n.time);
    lp.frequency.exponentialRampToValueAtTime(320, n.time + n.dur);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(lp).connect(g).connect(this.busses.bass);
    this.env(g.gain, n.time, n.vel, 0.004, n.dur, 0.05);
    const stop = Math.max(n.time, ctx.currentTime) + n.dur + 0.1;
    osc.start(Math.max(n.time, ctx.currentTime));
    osc.stop(stop);
    osc.onended = () => {
      osc.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  private playChord(n: EnsembleNote): void {
    const { ctx } = this;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1700;
    lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0;
    lp.connect(g).connect(this.busses.chord);
    const detunes = [-6, 6];
    const oscs: OscillatorNode[] = [];
    for (const f of n.freqs) {
      for (const d of detunes) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = d;
        osc.connect(lp);
        oscs.push(osc);
      }
    }
    this.env(g.gain, n.time, n.vel / n.freqs.length, 0.006, n.dur, 0.12);
    const at = Math.max(n.time, ctx.currentTime);
    const stop = at + n.dur + 0.2;
    for (const o of oscs) {
      o.start(at);
      o.stop(stop);
    }
    oscs[oscs.length - 1].onended = () => {
      for (const o of oscs) o.disconnect();
      lp.disconnect();
      g.disconnect();
    };
  }

  private playMelody(n: EnsembleNote): void {
    const { ctx } = this;
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = n.freqs[0];
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = n.freqs[0] * 2;
    const modGain = ctx.createGain();
    modGain.gain.value = n.freqs[0] * 1.4;
    mod.connect(modGain).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    car.connect(g).connect(this.busses.melody);
    this.env(g.gain, n.time, n.vel, 0.01, n.dur, 0.12);
    const at = Math.max(n.time, ctx.currentTime);
    const stop = at + n.dur + 0.2;
    car.start(at);
    mod.start(at);
    car.stop(stop);
    mod.stop(stop);
    car.onended = () => {
      car.disconnect();
      mod.disconnect();
      modGain.disconnect();
      g.disconnect();
    };
  }

  /** A short blip on the conductor's beat. accent = downbeat. */
  tick(time: number, accent: boolean): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = "square";
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = accent ? 2100 : 1500;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.frequency.value = accent ? 2100 : 1500;
    osc.connect(bp).connect(g).connect(this.tickGain);
    const at = Math.max(time, ctx.currentTime);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(accent ? 0.6 : 0.35, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.start(at);
    osc.stop(at + 0.06);
    osc.onended = () => {
      osc.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  stop(): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.15);
  }
}
