// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the spatialized noise bath.
//
//   SUBSYSTEMS wired here:
//     1. spectral engine  — 3 seeded base buffers (white/pink/brown) equal-power
//        crossfaded by the slope control (see noise.ts).
//     2. panner field     — the mixed noise is decorrelated by short per-voice
//        delays and spread across N HRTF PannerNodes that slowly orbit the
//        listener, so the bath surrounds you rather than sitting in the head.
//     3. macro-swell      — each voice's gain + orbit is driven by the shared
//        seeded field controller (field.ts): "wave after wave".
//
//   The noise IS the instrument — no oscillators, no tonal drone. Everything you
//   hear is shaped broadband noise moving through space.
// ─────────────────────────────────────────────────────────────────────────────

import { makeNoiseBuffers, slopeToGains, type NoiseBuffers } from "./noise";
import { N_VOICES, type FieldState } from "./field";

interface Voice {
  gain: GainNode;
  panner: PannerNode;
}

export class NoiseVeilAudio {
  private ctx: AudioContext;
  private buffers: NoiseBuffers;
  private sources: AudioBufferSourceNode[] = [];
  private crossWhite: GainNode;
  private crossPink: GainNode;
  private crossBrown: GainNode;
  private noiseBus: GainNode;
  private master: GainNode;
  private voices: Voice[] = [];
  private started = false;

  constructor(ctx: AudioContext, seed: number) {
    this.ctx = ctx;
    this.buffers = makeNoiseBuffers(ctx, 8, seed);

    // Master out: a gentle high-cut keeps the bath soft, never hissy.
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    const softCut = ctx.createBiquadFilter();
    softCut.type = "lowpass";
    softCut.frequency.value = 9000;
    softCut.Q.value = 0.3;
    this.master.connect(softCut);
    softCut.connect(ctx.destination);

    // Crossfade gains (white / pink / brown).
    this.crossWhite = ctx.createGain();
    this.crossPink = ctx.createGain();
    this.crossBrown = ctx.createGain();
    const g0 = slopeToGains(0.5);
    this.crossWhite.gain.value = g0.white;
    this.crossPink.gain.value = g0.pink;
    this.crossBrown.gain.value = g0.brown;

    // Mixed, spectrally-shaped noise bus.
    this.noiseBus = ctx.createGain();
    this.noiseBus.gain.value = 1;
    this.crossWhite.connect(this.noiseBus);
    this.crossPink.connect(this.noiseBus);
    this.crossBrown.connect(this.noiseBus);

    // One looping source per band → its crossfade gain.
    const startBand = (buf: AudioBuffer, dest: GainNode, offset: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(dest);
      // Deterministic start offset so bands aren't phase-aligned.
      src.start(0, offset % buf.duration);
      this.sources.push(src);
    };
    startBand(this.buffers.white, this.crossWhite, 0.0);
    startBand(this.buffers.pink, this.crossPink, 2.3);
    startBand(this.buffers.brown, this.crossBrown, 4.7);

    // Panner field: noiseBus → per-voice delay (decorrelate) → gain → HRTF panner.
    for (let i = 0; i < N_VOICES; i++) {
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.007 + i * 0.011; // 7–51 ms, decorrelated
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.rolloffFactor = 0.6;
      this.noiseBus.connect(delay);
      delay.connect(gain);
      gain.connect(panner);
      panner.connect(this.master);
      this.voices.push({ gain, panner });
    }
  }

  /** Fade the bath in — call once, inside the user gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.26, now + 3.0);
  }

  /** Push a fresh field frame into the graph (throttled by the caller). */
  applyField(f: FieldState): void {
    const now = this.ctx.currentTime;
    const g = slopeToGains(f.slope);
    this.crossWhite.gain.setTargetAtTime(g.white, now, 0.25);
    this.crossPink.gain.setTargetAtTime(g.pink, now, 0.25);
    this.crossBrown.gain.setTargetAtTime(g.brown, now, 0.25);

    const r = 2.2;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      const level = (0.12 + 0.5 * f.voices[i]) * f.intensity;
      v.gain.gain.setTargetAtTime(level, now, 0.3);

      const az = f.azimuth[i];
      const el = f.elevation[i];
      const x = r * Math.sin(az) * Math.cos(el);
      const y = r * Math.sin(el);
      const z = -r * Math.cos(az) * Math.cos(el);
      v.panner.positionX.setTargetAtTime(x, now, 0.4);
      v.panner.positionY.setTargetAtTime(y, now, 0.4);
      v.panner.positionZ.setTargetAtTime(z, now, 0.4);
    }
  }

  /** Full teardown. */
  dispose(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } catch {
      /* ctx closing */
    }
    const killAt = now + 0.5;
    for (const src of this.sources) {
      try {
        src.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
  }
}
