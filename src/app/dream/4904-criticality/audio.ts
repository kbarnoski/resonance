// ─────────────────────────────────────────────────────────────────────────────
// 4904-criticality — audio.ts
//
// The output half of the phase transition, so order → entropy is HEARD as well
// as seen. A consonant additive drone whose harmonic COHERENCE dissolves in
// lockstep with the field:
//
//   • order = 1 : partials sit exactly on the harmonic series (1,2,3,…) →
//     a stable, consonant drone. Reverb narrow, noise floor silent.
//   • crossing  : partials progressively DETUNE and SPREAD off the harmonic
//     grid; a broadband NOISE floor rises; the REVERB widens (wet up). The tone
//     smears into an inharmonic, boundary-less cloud.
//   • a swell at the critical bloom = the "opalescence" heard as a surge.
//
// Output only, gesture-gated, limited for the listener. Shares the page's
// AudioContext with the mic. Deterministic: per-partial detune jitter and the
// reverb impulse come from a seeded PRNG, never Math.random.
// ─────────────────────────────────────────────────────────────────────────────

import { mulberry32 } from "./criticality";

const PARTIAL_RATIOS = [1, 2, 3, 4, 5, 6, 7, 8];
const BASE_HZ = 110; // A2 root

export interface DroneParams {
  order: number; // 1 coherent .. 0 dissolved
  crit: number; // 0..1 edge bloom
  entropy: number; // 0..1 = 1 - order
  spread: number; // 0..1 past-critical
}

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  ratio: number;
  jitter: number; // seeded, symmetric per-partial detune character
}

export class CriticalityDrone {
  private ctx: AudioContext;
  private master: GainNode;
  private partialBus: GainNode;
  private partials: Partial[] = [];
  private noiseSrc: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private calmed = false;
  private rng: () => number;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.rng = mulberry32(0x4904);
    const now = ctx.currentTime;

    // master → limiter → destination (protect the listener)
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.5, now + 1.4); // fade in
    master.connect(limiter);
    this.master = master;

    // reverb (widening) — dry + wet crossfade into master
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(2.6);
    this.convolver = convolver;
    const wet = ctx.createGain();
    wet.gain.value = 0.08;
    const dry = ctx.createGain();
    dry.gain.value = 0.95;
    convolver.connect(wet);
    wet.connect(master);
    dry.connect(master);
    this.wetGain = wet;
    this.dryGain = dry;

    // partial bus feeds both dry and reverb
    const partialBus = ctx.createGain();
    partialBus.gain.value = 0.9;
    partialBus.connect(dry);
    partialBus.connect(convolver);
    this.partialBus = partialBus;

    // additive partials
    for (let i = 0; i < PARTIAL_RATIOS.length; i++) {
      const ratio = PARTIAL_RATIOS[i];
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = BASE_HZ * ratio;
      const gain = ctx.createGain();
      // 1/n rolloff → warm, consonant when perfectly harmonic
      gain.gain.value = 0.9 / (ratio + 0.6);
      osc.connect(gain);
      gain.connect(partialBus);
      osc.start(now);
      this.partials.push({ osc, gain, ratio, jitter: this.rng() * 2 - 1 });
    }

    // broadband noise floor (silent until entropy rises)
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 240;
    noiseFilter.Q.value = 0.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0001;
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dry);
    noiseGain.connect(convolver);
    this.noiseFilter = noiseFilter;
    this.noiseGain = noiseGain;

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.makeNoise(2.0);
    noiseSrc.loop = true;
    noiseSrc.connect(noiseFilter);
    noiseSrc.start(now);
    this.noiseSrc = noiseSrc;
  }

  /** Seeded white-noise buffer (deterministic). */
  private makeNoise(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng() * 2 - 1;
    return buf;
  }

  /** Seeded exponential-decay stereo impulse response for the reverb. */
  private makeImpulse(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.4);
        d[i] = (this.rng() * 2 - 1) * decay;
      }
    }
    return buf;
  }

  /** Map the field state onto the drone's harmonic coherence, once per frame. */
  update(p: DroneParams): void {
    if (this.calmed) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const tc = 0.15; // smoothing time-constant → no zipper noise
    const e = p.entropy;

    // Partials: detune + drift off the harmonic grid as entropy rises.
    for (const part of this.partials) {
      // Detune spread in cents: 0 when coherent, wide + inharmonic when dissolved.
      const detuneCents = e * (35 + part.ratio * 18) * part.jitter;
      part.osc.detune.setTargetAtTime(detuneCents, now, tc);
      // Nudge the frequency itself slightly inharmonic past the crossing.
      const inh = 1 + e * 0.02 * part.jitter * part.ratio;
      part.osc.frequency.setTargetAtTime(BASE_HZ * part.ratio * inh, now, tc);
      // Upper partials fade slightly so the smear reads as loss of the fundamental.
      const roll = 0.9 / (part.ratio + 0.6);
      part.gain.gain.setTargetAtTime(roll * (1 - e * 0.35), now, tc);
    }

    // Partial bus dips a touch as order is lost, ceding room to noise + reverb.
    this.partialBus.gain.setTargetAtTime(0.9 - e * 0.32, now, tc);

    // Broadband noise floor rises with entropy; its filter opens (broadband).
    this.noiseGain.gain.setTargetAtTime(0.0001 + e * 0.14, now, tc);
    this.noiseFilter.frequency.setTargetAtTime(240 + e * 5600, now, tc);

    // Reverb widens: wet up, dry down → boundary-less space.
    this.wetGain.gain.setTargetAtTime(0.08 + e * 0.42, now, tc);
    this.dryGain.gain.setTargetAtTime(0.95 - e * 0.35, now, tc);

    // Critical opalescence heard as a swell right at the crossing.
    this.master.gain.setTargetAtTime(0.5 + p.crit * 0.16, now, 0.25);
  }

  /** Instant calm: fade the whole drone to near-silence. Paired with the
   *  visual freeze in the safety "Calm / Stop" control. */
  calm(): void {
    this.calmed = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.25);
  }

  /** Resume after a calm. */
  resume(): void {
    this.calmed = false;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.5, now, 0.4);
  }

  /** Tear down all nodes. */
  stop(): void {
    const now = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(0.0001, now);
    } catch {
      /* context may be closing */
    }
    for (const part of this.partials) {
      try {
        part.osc.stop();
        part.osc.disconnect();
        part.gain.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.partials = [];
    try {
      this.noiseSrc?.stop();
      this.noiseSrc?.disconnect();
    } catch {
      /* already stopped */
    }
    this.noiseSrc = null;
    try {
      this.noiseFilter.disconnect();
      this.noiseGain.disconnect();
      this.convolver.disconnect();
      this.wetGain.disconnect();
      this.dryGain.disconnect();
      this.partialBus.disconnect();
      this.master.disconnect();
    } catch {
      /* already gone */
    }
  }
}
