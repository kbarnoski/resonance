/**
 * 7384 · Pulsegate — the hard EDM voice engine.
 *
 * Supersaw/detuned-saw lead stabs + a persistent sub + a white-noise riser
 * sweep + a synthesized kick, summed through an authentic sidechain
 * topology: the kick bus bypasses the duck (it should hit at full level),
 * everything else routes through a duck GainNode whose value is driven
 * every frame by the engine's sidechain-pump envelope. The whole mix then
 * runs through a DynamicsCompressor limiter before a fixed ~0.25 ceiling.
 *
 * All randomness (the noise buffer content, the supersaw detune spread) is
 * seeded via mulberry32 — no Math.random, no Date.now.
 */

import { mulberry32, midiToFreq, ROOT_MIDI, type Phase } from "./engine";

const NOISE_SECONDS = 2;
const DETUNE_CENTS = [-19, -9, -3, 0, 3, 9, 19];

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rng = mulberry32(0x7384 ^ 0x9e3779b9);
  for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
  return buf;
}

export class PulsegateAudio {
  private ctx: AudioContext;
  private kickBus: GainNode;
  private mixBus: GainNode;
  private duck: GainNode;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;

  private subOsc: OscillatorNode;
  private subGain: GainNode;

  private noiseSrc: AudioBufferSourceNode;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;

  private pitchBendSemitones = 0;
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -6;
    this.compressor.knee.value = 0;
    this.compressor.ratio.value = 20;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.25; // ceiling
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    this.kickBus = ctx.createGain();
    this.kickBus.gain.value = 1;
    this.kickBus.connect(this.master);

    this.duck = ctx.createGain();
    this.duck.gain.value = 1;
    this.duck.connect(this.master);

    this.mixBus = ctx.createGain();
    this.mixBus.gain.value = 1;
    this.mixBus.connect(this.duck);

    // persistent sub — a low sine that tracks the arc's root note, gated
    // continuously by applyContinuous().
    this.subOsc = ctx.createOscillator();
    this.subOsc.type = "sine";
    this.subOsc.frequency.value = midiToFreq(ROOT_MIDI - 24);
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.0001;
    this.subOsc.connect(this.subGain);
    this.subGain.connect(this.mixBus);
    this.subOsc.start();

    // persistent riser noise — swept + gated by mod/phase.
    this.noiseSrc = ctx.createBufferSource();
    this.noiseSrc.buffer = makeNoiseBuffer(ctx);
    this.noiseSrc.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 400;
    this.noiseFilter.Q.value = 0.9;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.mixBus);
    this.noiseSrc.start();
  }

  setPitchBend(semitones: number) {
    this.pitchBendSemitones = semitones;
  }

  /** Continuous parameter update — call every animation frame. */
  applyContinuous(tension: number, mod: number, phase: Phase, pump: number) {
    const t = this.ctx.currentTime;
    this.duck.gain.setTargetAtTime(0.3 + pump * 0.7, t, 0.02);

    const dropOrBuild = phase === "drop" || phase === "build" || phase === "riser";
    const subTarget = (dropOrBuild ? 0.22 : 0.08) * (0.3 + tension * 0.7);
    this.subGain.gain.setTargetAtTime(subTarget, t, 0.15);

    // Riser noise: quiet by default, blooms with mod, louder in riser/drop.
    const phaseBoost = phase === "riser" ? 1 : phase === "drop" ? 0.5 : 0.15;
    const noiseTarget = mod * mod * 0.45 * phaseBoost;
    this.noiseGain.gain.setTargetAtTime(noiseTarget, t, 0.08);
    const filterHz = 300 + (tension * 0.4 + mod * 0.6) * 5500;
    this.noiseFilter.frequency.setTargetAtTime(filterHz, t, 0.06);
  }

  /** A performed (or auto-DJ) note — a short supersaw stab. */
  noteOn(midi: number, vel: number, tension: number, mod: number) {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const freq = midiToFreq(midi + this.pitchBendSemitones);

    const voiceGain = ctx.createGain();
    const cutoff = 350 + (tension * 0.5 + mod * 0.5) * 4500;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    voiceGain.connect(filter);
    filter.connect(this.mixBus);

    const peak = 0.05 + vel * 0.16;
    const dur = 0.22 + vel * 0.35;
    voiceGain.gain.setValueAtTime(0.0001, t);
    voiceGain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + 0.006);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const oscs: OscillatorNode[] = [];
    const spread = 0.5 + tension * 0.6; // wider detune as tension climbs
    for (const cents of DETUNE_CENTS) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = cents * spread;
      o.connect(voiceGain);
      o.start(t);
      o.stop(t + dur + 0.05);
      o.onended = () => o.disconnect();
      oscs.push(o);
    }
    // teardown of the shared per-note nodes once the envelope finishes
    // (t is "now" on the audio clock, so a plain wall-clock timeout of the
    // same duration is an accurate proxy — no cross-clock math needed).
    window.setTimeout(
      () => {
        try {
          filter.disconnect();
          voiceGain.disconnect();
        } catch {
          /* already gone */
        }
      },
      Math.max(0, (dur + 0.08) * 1000),
    );
  }

  /** One synthesized kick hit, scheduled now (bypasses the sidechain duck). */
  kick() {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1.0, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(g);
    g.connect(this.kickBus);
    osc.start(t);
    osc.stop(t + 0.3);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** One-shot impact on the drop hit — a low thump plus a short noise crack. */
  dropImpact() {
    if (this.disposed) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(g);
    g.connect(this.kickBus);
    osc.start(t);
    osc.stop(t + 0.65);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };

    const crack = ctx.createBufferSource();
    crack.buffer = this.noiseSrc.buffer;
    const cf = ctx.createBiquadFilter();
    cf.type = "highpass";
    cf.frequency.value = 1200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    crack.connect(cf);
    cf.connect(cg);
    cg.connect(this.kickBus);
    crack.start(t);
    crack.stop(t + 0.2);
    crack.onended = () => {
      crack.disconnect();
      cf.disconnect();
      cg.disconnect();
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.subOsc.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.noiseSrc.stop();
    } catch {
      /* already stopped */
    }
    for (const n of [
      this.subOsc,
      this.subGain,
      this.noiseSrc,
      this.noiseFilter,
      this.noiseGain,
      this.kickBus,
      this.mixBus,
      this.duck,
      this.master,
      this.compressor,
    ]) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}
