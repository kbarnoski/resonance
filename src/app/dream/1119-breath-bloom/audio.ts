/**
 * audio.ts — additive bell/chime synthesis + a soft breath-modulated wind bed.
 *
 * Each growth event rings ONE bell voice: a fundamental plus a few *inharmonic*
 * partials with a fast attack and long decay (the fūrin / struck-bell timbre).
 * Successive events climb a just-intonation pentatonic, so the accumulating,
 * overlapping decays literally build an evolving chord as the plant grows.
 *
 * A slowly-drifting register raises the root octave over a long session so the
 * sonority at minute 5 differs from minute 1. Everything passes through a
 * DynamicsCompressor limiter before the destination. The mic is analysis-only
 * and is NEVER connected to this graph.
 */

// just-intonation pentatonic ratios above the root
const PENT: number[] = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
// inharmonic partial ratios + relative gains + relative decay (bell-like)
const PARTIALS: { ratio: number; gain: number; decay: number }[] = [
  { ratio: 1.0, gain: 1.0, decay: 1.0 },
  { ratio: 2.01, gain: 0.5, decay: 0.72 },
  { ratio: 2.99, gain: 0.34, decay: 0.55 },
  { ratio: 4.21, gain: 0.2, decay: 0.4 },
  { ratio: 5.43, gain: 0.12, decay: 0.3 },
];

const ROOT_HZ = 196; // G3 — warm, low
const MAX_DECAY_S = 5.2;

export class BellEngine {
  private ctx: AudioContext;
  private limiter: DynamicsCompressorNode;
  private bellBus: GainNode;
  private droneGain: GainNode;
  private droneFilter: BiquadFilterNode;
  private windGain: GainNode;
  private windFilter: BiquadFilterNode;
  private droneOscs: OscillatorNode[] = [];
  private windSrc: AudioBufferSourceNode | null = null;
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);

    this.bellBus = ctx.createGain();
    this.bellBus.gain.value = 0.9;
    this.bellBus.connect(this.limiter);

    // low drone: two slightly-detuned saws through a gentle lowpass
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 480;
    this.droneFilter.Q.value = 0.6;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.limiter);

    // wind bed: filtered noise, gain follows breath drive
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 620;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.limiter);
  }

  /** Start the sustained beds. Call after ctx.resume() from a user gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    for (const detune of [-4, 5]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = ROOT_HZ / 2;
      o.detune.value = detune;
      o.connect(this.droneFilter);
      o.start(now);
      this.droneOscs.push(o);
    }
    this.droneGain.gain.setValueAtTime(0, now);
    this.droneGain.gain.linearRampToValueAtTime(0.05, now + 3);

    // pink-ish noise buffer, looped
    const len = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.windFilter);
    src.start(now);
    this.windSrc = src;
  }

  /** Follow continuous breath drive: brighten wind + drone. */
  setDrive(drive: number): void {
    const now = this.ctx.currentTime;
    const wind = 0.015 + 0.11 * drive;
    this.windGain.gain.setTargetAtTime(wind, now, 0.2);
    this.windFilter.frequency.setTargetAtTime(500 + 900 * drive, now, 0.3);
    this.droneFilter.frequency.setTargetAtTime(440 + 320 * drive, now, 0.4);
  }

  /**
   * Ring one bell for growth event `noteIndex` (== breaths so far).
   * `register` slowly transposes the root up over a long session.
   */
  ring(noteIndex: number, strength: number, register: number): void {
    const now = this.ctx.currentTime;
    const degree = noteIndex % PENT.length;
    const octave = Math.floor(noteIndex / PENT.length) % 3; // wrap 0..2
    // register drifts the root up in whole-ish steps but stays bounded
    const rootDrift = Math.pow(2, (register % 6) / 12);
    const fund = ROOT_HZ * rootDrift * PENT[degree] * Math.pow(2, octave);

    const amp = 0.16 + 0.22 * strength;
    const decayScale = 0.7 + 0.5 * strength;

    for (const part of PARTIALS) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * part.ratio;
      osc.detune.value = (Math.random() - 0.5) * 6;

      const env = this.ctx.createGain();
      const peak = amp * part.gain;
      const decay = MAX_DECAY_S * part.decay * decayScale;
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(peak, now + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.006 + decay);

      osc.connect(env);
      env.connect(this.bellBus);
      osc.start(now);
      osc.stop(now + 0.006 + decay + 0.1);
    }
  }

  dispose(): void {
    const now = this.ctx.currentTime;
    try {
      this.droneGain.gain.cancelScheduledValues(now);
      this.droneGain.gain.setTargetAtTime(0, now, 0.3);
      this.windGain.gain.setTargetAtTime(0, now, 0.3);
    } catch {
      // context may already be closing
    }
    const stopAt = now + 0.6;
    for (const o of this.droneOscs) {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    this.droneOscs = [];
    if (this.windSrc) {
      try {
        this.windSrc.stop(stopAt);
      } catch {
        /* already stopped */
      }
      this.windSrc = null;
    }
  }
}
