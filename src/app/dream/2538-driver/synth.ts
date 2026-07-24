// synth.ts — fully synthesized 909/303-flavoured voices for 2538-driver.
// Everything here is Web Audio: no samples. Percussion is shaped noise + pitch-
// dropped sines; the acid line is a single continuous sawtooth through a
// resonant lowpass with an envelope-modulated cutoff (TB-303 behaviour,
// including glide/slide), then driven through a waveshaper so it can bite.
// A soft-clip + limiter on the master keeps it loud and dangerous without
// letting a peak run away into ear-damage territory.

import type { AcidEvent, PercVoice } from "./engine";

function makeCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

export class DriverSynth {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private noise: AudioBuffer;
  private delay: DelayNode;
  private delayFb: GainNode;
  private delaySend: GainNode;

  // Persistent mono acid voice.
  private acidOsc: OscillatorNode;
  private acidFilter: BiquadFilterNode;
  private acidVca: GainNode;
  private acidLevel: GainNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.14;

    const softclip = ctx.createWaveShaper();
    softclip.curve = makeCurve(1.4);
    softclip.oversample = "2x";

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(softclip);
    softclip.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    // A short feedback delay for hats/acid air.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.28;
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.5;
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.master);

    // White-noise buffer reused by every percussion hit.
    const len = Math.floor(ctx.sampleRate * 1.2);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    // Seeded fill so the noise bed is deterministic too.
    let s = 0x2538 >>> 0;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }

    // Acid voice graph (runs continuously; VCA gates it).
    this.acidOsc = ctx.createOscillator();
    this.acidOsc.type = "sawtooth";
    this.acidOsc.frequency.value = 55;
    this.acidFilter = ctx.createBiquadFilter();
    this.acidFilter.type = "lowpass";
    this.acidFilter.frequency.value = 200;
    this.acidFilter.Q.value = 9;
    this.acidVca = ctx.createGain();
    this.acidVca.gain.value = 0.0001;
    const acidDrive = ctx.createWaveShaper();
    acidDrive.curve = makeCurve(6);
    acidDrive.oversample = "4x";
    this.acidLevel = ctx.createGain();
    this.acidLevel.gain.value = 0.42;

    this.acidOsc.connect(this.acidFilter);
    this.acidFilter.connect(this.acidVca);
    this.acidVca.connect(acidDrive);
    acidDrive.connect(this.acidLevel);
    this.acidLevel.connect(this.master);
    this.acidLevel.connect(this.delaySend);
    this.acidOsc.start();
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    return src;
  }

  kick(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.33);
    // Click transient.
    const c = this.noiseSource();
    const cg = this.ctx.createGain();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    cg.gain.setValueAtTime(vel * 0.5, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    c.connect(hp);
    hp.connect(cg);
    cg.connect(this.master);
    c.start(t);
    c.stop(t + 0.03);
  }

  sub(t: number, vel: number): void {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(44, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.9, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.5);
  }

  clap(t: number, vel: number): void {
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1650;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // Three fast retriggers → the classic clap smear.
    for (const dt of [0, 0.011, 0.023]) {
      g.gain.setValueAtTime(vel, t + dt);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.02);
    }
    g.gain.setValueAtTime(vel * 0.8, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.2);
  }

  chat(t: number, vel: number): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.05);
  }

  ohat(t: number, vel: number): void {
    const src = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    g.connect(this.delaySend);
    src.start(t);
    src.stop(t + 0.3);
  }

  acid(t: number, ev: AcidEvent, freq: number, cutoff: number): void {
    const f = this.acidFilter.frequency;
    const q = this.acidFilter.Q;
    const amp = this.acidVca.gain;
    const base = 120 + cutoff * 900;
    const peak = base + (ev.accent ? 4200 : 2000) * (0.4 + cutoff);

    // Pitch — glide from the current value on a slide, otherwise snap.
    const p = this.acidOsc.frequency;
    p.cancelScheduledValues(t);
    if (ev.slide) p.linearRampToValueAtTime(freq, t + 0.06);
    else p.setValueAtTime(freq, t);

    q.cancelScheduledValues(t);
    q.setValueAtTime(ev.accent ? 18 : 10, t);

    f.cancelScheduledValues(t);
    f.setValueAtTime(base, t);
    f.linearRampToValueAtTime(peak, t + 0.02);
    f.exponentialRampToValueAtTime(base, t + ev.decay * 1.3);

    amp.cancelScheduledValues(t);
    amp.setValueAtTime(0.0001, t);
    amp.linearRampToValueAtTime(ev.velocity, t + 0.006);
    amp.exponentialRampToValueAtTime(0.0001, t + ev.decay);
  }

  perc(voice: PercVoice, t: number, vel: number): void {
    if (voice === "kick") this.kick(t, vel);
    else if (voice === "sub") this.sub(t, vel);
    else if (voice === "clap") this.clap(t, vel);
    else if (voice === "chat") this.chat(t, vel);
    else this.ohat(t, vel);
  }

  riser(t: number, dur: number): void {
    const src = this.noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    g.connect(this.delaySend);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  dispose(): void {
    try {
      this.acidOsc.stop();
    } catch {
      /* already stopped */
    }
    try {
      this.master.disconnect();
      this.acidLevel.disconnect();
      this.delay.disconnect();
    } catch {
      /* ignore */
    }
  }
}
