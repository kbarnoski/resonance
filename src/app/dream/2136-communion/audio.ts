// CommunionAudio — Web Audio synthesis for the ecstatic-union instrument.
//
// Each held pointer is one VOICE: an additive odd-harmonic (clarinet-like)
// oscillator → per-voice lowpass (brightness from Y) → per-voice gain → master.
// A vibrato LFO tracks pointer velocity. A per-voice SHIMMER partial a tritave
// up swells with the communion coupling K, so at peak everything glitters.
//
// A UNION DRONE BUS (base and sub-tritave sines) swells with K and polyphony —
// the "one radiant whole" you feel in the low end. Master ends in a limiter so
// stacking ten voices can't clip. Frequencies glide (portamento) so, as K rises
// and the harmonic LOCK pulls detuned voices onto the shared BP lattice, the
// chord audibly RESOLVES into consonance rather than jumping.

import { BP_ROOT_HZ } from "./bp";

interface Voice {
  id: number;
  osc: OscillatorNode;
  shimmer: OscillatorNode;
  shimmerGain: GainNode;
  vibrato: OscillatorNode;
  vibratoGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  peak: number;
}

export class CommunionAudio {
  ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private wave: PeriodicWave;
  private voices = new Map<number, Voice>();
  private nextId = 1;

  // union drone bus
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private droneOscs: OscillatorNode[] = [];

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.22;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.82;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Odd-harmonic (clarinet-like) periodic wave — bright, not harsh.
    const n = 20;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      imag[k] = k % 2 === 1 ? 1 / Math.pow(k, 1.12) : 0.05 / Math.pow(k, 2);
    }
    this.wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    // Union drone: a soft pad on the root and a sub-tritave that swells with K.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.master);
    this.droneFilter = this.ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 420;
    this.droneFilter.Q.value = 0.6;
    this.droneFilter.connect(this.droneGain);
    for (const f of [BP_ROOT_HZ / 3, BP_ROOT_HZ / 3 + 0.15, BP_ROOT_HZ, BP_ROOT_HZ * 1.003]) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(this.droneFilter);
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

  /** Union bus: drone swell + filter opening from coupling K (0..1) and count. */
  setUnion(k: number, count: number): void {
    const now = this.ctx.currentTime;
    const poly = Math.min(1, count / 6);
    const g = Math.min(0.12, (0.02 + 0.1 * k) * (0.4 + 0.6 * poly));
    this.droneGain.gain.setTargetAtTime(g, now, 0.4);
    // brighter drone as the union locks — the low end gains upper harmonics.
    this.droneFilter.frequency.setTargetAtTime(420 + k * 900, now, 0.5);
  }

  noteOn(freq: number, brightness: number, velocity: number): number {
    const now = this.ctx.currentTime;
    const id = this.nextId++;

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq;

    const vibrato = this.ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = 4.5 + velocity * 2.5;
    const vibratoGain = this.ctx.createGain();
    vibratoGain.gain.value = 3 + velocity * 22; // cents
    vibrato.connect(vibratoGain).connect(osc.detune);

    // shimmer partial a tritave up — sympathetic sparkle, gated by K later.
    const shimmer = this.ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.value = freq * 3;
    const shimmerGain = this.ctx.createGain();
    shimmerGain.gain.value = 0.0001;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = freq * (2 + brightness * 6);
    filter.Q.value = 0.8;

    const gain = this.ctx.createGain();
    const peak = 0.045 + velocity * 0.05 + brightness * 0.05;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.05);
    gain.gain.setTargetAtTime(peak * 0.75, now + 0.15, 0.5);

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

  /** Live per-frame update — freq glides (lock), filter tracks Y, shimmer ∝ K. */
  updateVoice(
    id: number,
    freq: number,
    brightness: number,
    velocity: number,
    k: number,
  ): void {
    const v = this.voices.get(id);
    if (!v) return;
    const now = this.ctx.currentTime;
    // portamento glide so the harmonic lock RESOLVES rather than jumps.
    v.osc.frequency.setTargetAtTime(freq, now, 0.06);
    v.shimmer.frequency.setTargetAtTime(freq * 3, now, 0.06);
    v.filter.frequency.setTargetAtTime(freq * (2 + brightness * 6), now, 0.08);
    v.vibratoGain.gain.setTargetAtTime(3 + velocity * 22, now, 0.1);
    // sympathetic shimmer rises steeply with the union coupling.
    v.shimmerGain.gain.setTargetAtTime(v.peak * (0.05 + 0.5 * k) * (0.4 + brightness), now, 0.2);
  }

  noteOff(id: number): void {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    const now = this.ctx.currentTime;
    const rel = 0.8;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + rel);
    v.shimmerGain.gain.cancelScheduledValues(now);
    v.shimmerGain.gain.setTargetAtTime(0.0001, now, rel * 0.3);
    const stopAt = now + rel + 0.08;
    v.osc.stop(stopAt);
    v.shimmer.stop(stopAt);
    v.vibrato.stop(stopAt);
    window.setTimeout(
      () => {
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
      },
      (rel + 0.3) * 1000,
    );
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
        this.droneFilter.disconnect();
        this.droneGain.disconnect();
        this.master.disconnect();
        this.limiter.disconnect();
        void this.ctx.close();
      } catch {
        /* ignore */
      }
    }, 1300);
  }
}
