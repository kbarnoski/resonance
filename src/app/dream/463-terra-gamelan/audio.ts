// audio.ts — gamelan-tuned bell sonification + evolving drone bed.
// Everything runs through a compressor + brick-wall limiter so a quake swarm
// can never clip or hurt ears.

import type { Quake } from "./seismic";

// Javanese gamelan tunings, in cents within an octave.
// slendro: 5 near-equal steps (~240c). pelog: 7 unequal steps.
export const SLENDRO_CENTS = [0, 231, 474, 717, 955];
export const PELOG_CENTS = [0, 120, 258, 539, 675, 785, 943];

export type TuningName = "slendro" | "pelog";

export function tuningCents(name: TuningName): number[] {
  return name === "slendro" ? SLENDRO_CENTS : PELOG_CENTS;
}

// Low ~D as the gong base.
const BASE_FREQ = 146.83;
const OCTAVES = 3; // pitch range used by depth mapping

/**
 * Map a quake to a frequency using the given tuning.
 * Shallow quakes -> high, deep quakes -> low, across OCTAVES of the scale.
 */
export function quakeFreq(q: Quake, tuning: TuningName): number {
  const cents = tuningCents(tuning);
  const n = cents.length;
  // depth 0..700 -> normalized 0..1 ; shallow should be HIGH so invert.
  const depthNorm = Math.min(1, Math.max(0, q.depthKm / 700));
  const high = 1 - depthNorm;
  // total scale-degree span across OCTAVES
  const totalSteps = OCTAVES * n;
  const stepIndex = Math.round(high * (totalSteps - 1));
  const octave = Math.floor(stepIndex / n);
  const degree = stepIndex % n;
  const c = cents[degree];
  return BASE_FREQ * Math.pow(2, octave + c / 1200);
}

/** Magnitude -> normalized loudness, decay length, brightness. */
function magShape(mag: number) {
  const m = Math.min(8, Math.max(0, mag));
  const norm = m / 8;
  // micro-quakes are soft ticks; M5+ are resonant gongs.
  const gain = 0.04 + Math.pow(norm, 1.4) * 0.9; // 0.04 .. ~0.94
  const decay = 0.5 + Math.pow(norm, 0.8) * 7.5; // 0.5s .. ~8s
  const brightness = 0.4 + norm * 0.6; // partial mix
  return { gain, decay, brightness };
}

export class GamelanEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private bellBus: GainNode;
  private noiseBuffer: AudioBuffer;

  // drone
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private droneVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private droneTarget = 0; // 0..1 energy, smoothed toward via setTargetAtTime

  tuning: TuningName = "slendro";
  muted = false;

  constructor() {
    type WithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor =
      window.AudioContext || (window as WithWebkit).webkitAudioContext;
    this.ctx = new Ctor();
    const ctx = this.ctx;

    // master chain: bellBus + drone -> master -> compressor -> limiter -> out
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.18;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.25;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    this.master.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(ctx.destination);

    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.9;
    this.bellBus.connect(this.master);

    // drone bed
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 420;
    this.droneFilter.Q.value = 0.7;
    this.droneGain.connect(this.droneFilter);
    this.droneFilter.connect(this.master);

    // shared noise buffer for attack transients
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;

    this.startDrone();
  }

  resume() {
    if (this.ctx.state !== "running") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.85, now, 0.08);
  }

  setTuning(t: TuningName) {
    this.tuning = t;
  }

  // ── drone bed ──────────────────────────────────────────────────────────
  // Sustained detuned partials around the gong base; brightness + level
  // track rolling seismic energy.
  private startDrone() {
    const ctx = this.ctx;
    const partials = [1, 2.01, 2.76, 4.07]; // mildly inharmonic shimmer
    for (const p of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = BASE_FREQ * 0.5 * p;
      // slow detune drift via a small LFO would add cost; keep static + filter.
      const g = ctx.createGain();
      g.gain.value = 1 / partials.length;
      osc.connect(g);
      g.connect(this.droneGain);
      osc.start();
      this.droneVoices.push({ osc, gain: g });
    }
    // baseline hum so it is never silent
    this.droneGain.gain.value = 0.06;
  }

  /** energy 0..1 (rolling quake count+magnitude). Smoothly steer the bed. */
  setSeismicEnergy(energy: number) {
    this.droneTarget = Math.min(1, Math.max(0, energy));
    const now = this.ctx.currentTime;
    const level = 0.05 + this.droneTarget * 0.16;
    this.droneGain.gain.setTargetAtTime(level, now, 1.5);
    const cutoff = 320 + this.droneTarget * 1400;
    this.droneFilter.frequency.setTargetAtTime(cutoff, now, 2.0);
  }

  // ── bell strike ───────────────────────────────────────────────────────
  ringQuake(q: Quake) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freq = quakeFreq(q, this.tuning);
    const { gain, decay, brightness } = magShape(q.mag);

    // pan from longitude -180..180 -> -1..1
    const pan = Math.min(1, Math.max(-1, q.lon / 180));
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceGain.connect(panner);
    panner.connect(this.bellBus);

    // inharmonic partials (bonang/gong-like): fundamental + 2 metallic partials
    const partials: { ratio: number; level: number }[] = [
      { ratio: 1, level: 1 },
      { ratio: 2.41, level: 0.5 * brightness },
      { ratio: 3.93, level: 0.28 * brightness },
    ];
    const oscs: OscillatorNode[] = [];
    for (const pr of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * pr.ratio;
      const pg = ctx.createGain();
      pg.gain.value = pr.level;
      osc.connect(pg);
      pg.connect(voiceGain);
      osc.start(now);
      osc.stop(now + decay + 0.2);
      oscs.push(osc);
    }

    // envelope: fast attack, exponential decay
    const peak = gain;
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    // short noise-burst attack (mallet strike), brighter for bigger quakes
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = Math.min(8000, freq * 4 + 1200);
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(peak * 0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(panner);
    noise.start(now);
    noise.stop(now + 0.12);

    // cleanup
    const stopAt = now + decay + 0.25;
    const cleanup = () => {
      try {
        voiceGain.disconnect();
        panner.disconnect();
        ng.disconnect();
        nf.disconnect();
      } catch {
        /* already gone */
      }
    };
    oscs[oscs.length - 1].onended = cleanup;
    // guard in case onended never fires
    setTimeout(cleanup, (stopAt - now) * 1000 + 400);
  }

  dispose() {
    try {
      for (const v of this.droneVoices) {
        try {
          v.osc.stop();
        } catch {
          /* noop */
        }
        v.osc.disconnect();
        v.gain.disconnect();
      }
      this.droneGain.disconnect();
      this.droneFilter.disconnect();
      this.bellBus.disconnect();
      this.master.disconnect();
      this.compressor.disconnect();
      this.limiter.disconnect();
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
