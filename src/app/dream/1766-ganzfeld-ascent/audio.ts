// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the hypnagogic cosmic-ambient bed (self-contained Web Audio).
//
//   A soft sustained pad of detuned low sine/triangle voices (a gentle drone
//   just off unison so it beats slowly) through a lowpass and a synthesized
//   reverb, at a calm master gain behind a limiter.
//
//   The hypnagogic signature is a slow THETA-band amplitude modulation: a ~6 Hz
//   LFO on a gain node — this is AUDIO amplitude, NOT visual flicker, so it is
//   safe, and it is the sonic analog of hypnagogic theta rhythm. As `complexity`
//   climbs the ascent, the texture thickens: the filter opens, a faint higher
//   granular shimmer fades in, the reverb wet rises, and the theta depth deepens
//   — so the EAR hears the climb too.
//
//   Determinism: the reverb impulse response is a fixed-seed mulberry32; the
//   update path uses only ctx.currentTime for Web Audio ramps (allowed). No
//   Math.random / Date in any state that the visuals also depend on.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./gpu";

// Low, detuned pad partials — a JI-ish gentle drone (unison, fifth, octave,
// twelfth) kept slightly off-round so it shimmers instead of locking.
const PAD_PARTIALS = [1.0, 1.4983, 2.0, 3.0021];
const BASE_FREQ = 55.13; // ~A1, an off-round fundamental

function makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  const rnd = mulberry32(0x9a17feed);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Deterministic noise tail with exponential decay.
      data[i] = (rnd() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export class GanzfeldAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private padFilter: BiquadFilterNode;
  private thetaGain: GainNode; // theta-AM lives here
  private thetaBase: ConstantSourceNode;
  private thetaLfo: OscillatorNode;
  private thetaDepth: GainNode;
  private dryGain: GainNode;
  private wetGain: GainNode;
  private convolver: ConvolverNode;
  private shimmerGain: GainNode;
  private padOscs: OscillatorNode[] = [];
  private shimmerOscs: OscillatorNode[] = [];
  private detuneLfos: OscillatorNode[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // master → limiter → destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4.0;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    // Reverb (dry + wet) → compressor.
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = makeImpulseResponse(ctx, 4.0, 2.6);
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 0.7;
    this.wetGain = ctx.createGain();
    this.wetGain.gain.value = 0.3;
    this.dryGain.connect(this.comp);
    this.wetGain.connect(this.comp);
    this.convolver.connect(this.wetGain);

    // Lowpass → theta-AM gain → (dry + convolver).
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = "lowpass";
    this.padFilter.frequency.value = 520;
    this.padFilter.Q.value = 0.6;

    this.thetaGain = ctx.createGain();
    this.thetaGain.gain.value = 0.0; // driven by base + LFO below
    this.padFilter.connect(this.thetaGain);
    this.thetaGain.connect(this.dryGain);
    this.thetaGain.connect(this.convolver);

    // Theta amplitude modulation: gain = base + depth·sin(2π·~6Hz·t).
    this.thetaBase = ctx.createConstantSource();
    this.thetaBase.offset.value = 0.42;
    this.thetaBase.connect(this.thetaGain.gain);

    this.thetaLfo = ctx.createOscillator();
    this.thetaLfo.type = "sine";
    this.thetaLfo.frequency.value = 6.0; // theta band (5–7 Hz), AUDIO not light
    this.thetaDepth = ctx.createGain();
    this.thetaDepth.gain.value = 0.1;
    this.thetaLfo.connect(this.thetaDepth);
    this.thetaDepth.connect(this.thetaGain.gain);

    // Pad voices: detuned pairs per partial for slow beating.
    for (let p = 0; p < PAD_PARTIALS.length; p++) {
      const ratio = PAD_PARTIALS[p];
      const freq = BASE_FREQ * ratio;
      for (let s = 0; s < 2; s++) {
        const osc = ctx.createOscillator();
        osc.type = s === 0 ? "sine" : "triangle";
        osc.frequency.value = freq;
        osc.detune.value = s === 0 ? -5 : 5;

        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.017 + ratio * 0.011;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 2.0 + ratio;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.detune);

        const pg = ctx.createGain();
        pg.gain.value = 0.4 / (ratio * (s === 0 ? 1 : 1.6));
        osc.connect(pg);
        pg.connect(this.padFilter);

        this.padOscs.push(osc);
        this.detuneLfos.push(lfo);
      }
    }

    // Shimmer: two higher, quiet partials that fade in with complexity → the
    // ear's version of the field climbing from grain to structure.
    this.shimmerGain = ctx.createGain();
    this.shimmerGain.gain.value = 0.0;
    this.shimmerGain.connect(this.convolver);
    for (let s = 0; s < 2; s++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = BASE_FREQ * (5.98 + s * 2.03);
      osc.detune.value = s === 0 ? -7 : 9;
      const sg = ctx.createGain();
      sg.gain.value = s === 0 ? 0.06 : 0.04;
      osc.connect(sg);
      sg.connect(this.shimmerGain);
      this.shimmerOscs.push(osc);
    }
  }

  /** Start voices and fade the master in. Call from the Begin gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    this.thetaBase.start();
    this.thetaLfo.start();
    for (const osc of this.padOscs) osc.start();
    for (const osc of this.shimmerOscs) osc.start();
    for (const lfo of this.detuneLfos) lfo.start();

    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.4, now + 4.0);
  }

  /** Per-frame update. complexity 0..1 is the stillness-driven ascent height. */
  step(complexity: number): void {
    if (!this.started) return;
    const now = this.ctx.currentTime;
    const c = Math.max(0, Math.min(1, complexity));

    // Filter opens, shimmer fades in, reverb wettens, theta deepens with ascent.
    this.padFilter.frequency.setTargetAtTime(460 + c * 1400, now, 0.5);
    this.shimmerGain.gain.setTargetAtTime(c * c * 0.5, now, 0.7);
    this.wetGain.gain.setTargetAtTime(0.25 + c * 0.4, now, 0.8);
    this.dryGain.gain.setTargetAtTime(0.7 - c * 0.15, now, 0.8);
    this.thetaDepth.gain.setTargetAtTime(0.08 + c * 0.18, now, 0.6);
  }

  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.2);
    } catch {
      /* ctx may be closing */
    }
    const stopAt = now + 0.5;
    const stopNode = (n: OscillatorNode | ConstantSourceNode) => {
      try {
        n.stop(stopAt);
      } catch {
        /* already stopped */
      }
    };
    for (const osc of this.padOscs) stopNode(osc);
    for (const osc of this.shimmerOscs) stopNode(osc);
    for (const lfo of this.detuneLfos) stopNode(lfo);
    stopNode(this.thetaLfo);
    stopNode(this.thetaBase);
  }
}
