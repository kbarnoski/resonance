// ParliamentAudio — Web Audio synthesis for the entity parliament.
//
// Each held note is one being singing. Voices use an additive PeriodicWave
// built from PREDOMINANTLY ODD harmonics (clarinet-like spectrum) — this is
// what makes the Bohlen–Pierce scale ring consonant-but-alien. A low tritave
// drone swells with the collective "presence" so structure BUILDS as you hold
// more voices and something ARRIVES.

import { BP_ROOT_HZ } from "./bp";

interface Voice {
  id: number;
  osc: OscillatorNode;
  shimmer: OscillatorNode; // a partial a tritave up — BP sparkle
  shimmerGain: GainNode;
  vibrato: OscillatorNode;
  vibratoGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  peak: number;
}

export class ParliamentAudio {
  ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private wave: PeriodicWave;
  private voices = new Map<number, Voice>();
  private nextId = 1;

  // presence drone bus
  private droneGain: GainNode;
  private droneOscs: OscillatorNode[] = [];

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -8;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Odd-harmonic (clarinet-like) periodic wave.
    const n = 18;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      imag[k] = k % 2 === 1 ? 1 / Math.pow(k, 1.15) : 0.04 / Math.pow(k, 2);
    }
    this.wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    // Presence drone: a soft tritave-low pad that swells with polyphony.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.master);
    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 500;
    droneFilter.connect(this.droneGain);
    for (const f of [BP_ROOT_HZ / 3, BP_ROOT_HZ, BP_ROOT_HZ * 1.001]) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(droneFilter);
      o.start();
      this.droneOscs.push(o);
    }
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  /** Smoothly set the collective presence level (0..1) → drone swell. */
  setPresence(level: number): void {
    const g = Math.min(0.09, Math.max(0, level) * 0.09);
    const now = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(g, now, 0.6);
  }

  noteOn(freq: number, velocity: number): number {
    const now = this.ctx.currentTime;
    const id = this.nextId++;

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq;

    // vibrato — the being is alive, breathing.
    const vibrato = this.ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = 4.3 + velocity * 1.5;
    const vibratoGain = this.ctx.createGain();
    vibratoGain.gain.value = 5 + velocity * 6; // cents
    vibrato.connect(vibratoGain).connect(osc.detune);

    const shimmer = this.ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = freq * 3; // a tritave up
    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.value = 0;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * (2.2 + velocity * 5);
    filter.Q.value = 0.7;

    const gain = this.ctx.createGain();
    const peak = 0.05 + velocity * 0.13;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.06 + (1 - velocity) * 0.05);
    gain.gain.setTargetAtTime(peak * 0.7, now + 0.2, 0.4); // gentle decay to sustain

    shimmerGain.gain.setValueAtTime(0.0001, now);
    shimmerGain.gain.exponentialRampToValueAtTime(peak * 0.16 * velocity + 0.0002, now + 0.12);

    osc.connect(filter).connect(gain).connect(this.master);
    shimmer.connect(shimmerGain).connect(gain);

    osc.start();
    shimmer.start();
    vibrato.start();

    this.voices.set(id, {
      id,
      osc,
      shimmer,
      shimmerGain,
      vibrato,
      vibratoGain,
      filter,
      gain,
      peak,
    });
    return id;
  }

  noteOff(id: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const now = this.ctx.currentTime;
    const rel = 0.7;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    v.shimmerGain.gain.cancelScheduledValues(now);
    v.shimmerGain.gain.setTargetAtTime(0.0001, now, rel * 0.3);
    const stopAt = now + rel + 0.08;
    v.osc.stop(stopAt);
    v.shimmer.stop(stopAt);
    v.vibrato.stop(stopAt);
    window.setTimeout(() => {
      try {
        v.osc.disconnect();
        v.shimmer.disconnect();
        v.shimmerGain.disconnect();
        v.vibrato.disconnect();
        v.vibratoGain.disconnect();
        v.filter.disconnect();
        v.gain.disconnect();
      } catch {
        /* already gone */
      }
    }, (rel + 0.3) * 1000);
  }

  dispose(): void {
    for (const id of Array.from(this.voices.keys())) this.noteOff(id);
    for (const o of this.droneOscs) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.droneOscs = [];
    window.setTimeout(() => {
      try {
        this.master.disconnect();
        this.limiter.disconnect();
        this.droneGain.disconnect();
        void this.ctx.close();
      } catch {
        /* ignore */
      }
    }, 1200);
  }
}
