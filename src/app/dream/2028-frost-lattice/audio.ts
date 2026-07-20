/**
 * Crystalline audio for the Frost Lattice — glassy inharmonic bells.
 *
 * Each freeze rings a short additive bell built from GLASS-PLATE ratios
 * (1, 2.76, 5.40, 8.93 — Chladni / struck-plate style, deliberately NOT
 * integer harmonics, NOT just intonation, NOT any 12-TET/pentatonic scale).
 * The fundamental is chosen continuously by the frozen particle's radius from
 * the seed, so the crystal's outward expansion is an ascending shimmer.
 *
 * A soft, slightly-inharmonic ice-drone sits underneath. A voice pool caps
 * simultaneous strikes and a minimum inter-onset time keeps dense growth
 * washing rather than machine-gunning. Master gain <= 0.16 into a compressor.
 */

// Glass / struck-plate inharmonic partials (Chladni-style). Not harmonic.
const PARTIALS: ReadonlyArray<{ ratio: number; amp: number }> = [
  { ratio: 1.0, amp: 1.0 },
  { ratio: 2.76, amp: 0.5 },
  { ratio: 5.4, amp: 0.28 },
  { ratio: 8.93, amp: 0.15 },
];

const MASTER_GAIN = 0.16; // hard ceiling
const MAX_VOICES = 8;
const MIN_ONSET_DT = 0.028; // seconds between strikes
const F_LOW = 196; // inner growth (low register)
const F_HIGH = 1568; // outer growth (high register)

function makePrng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Voice {
  oscs: OscillatorNode[];
  vgain: GainNode;
  stop: (t: number) => void;
}

export class FrostAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private droneOscs: OscillatorNode[] = [];
  private droneGain: GainNode;
  private droneLfo: OscillatorNode | null = null;
  private droneFilter: BiquadFilterNode;
  private voices: Voice[] = [];
  private lastOnset = -1;
  private rnd = makePrng(0x2028);
  private disposed = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.005;
    this.comp.release.value = 0.25;
    this.comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.comp);

    // Ice-drone: three low, mildly-inharmonic sines through a soft lowpass.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 0.6;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.5;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);
  }

  /** Start the drone bed and fade the master in. Call once, after resume(). */
  start(): void {
    const t = this.ctx.currentTime;
    const droneFreqs = [55, 73.1, 97.7]; // continuous spacing, not a chord
    for (const f of droneFreqs) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.detune.value = (this.rnd() - 0.5) * 8;
      const g = this.ctx.createGain();
      g.gain.value = 0.16;
      osc.connect(g);
      g.connect(this.droneFilter);
      osc.start(t);
      this.droneOscs.push(osc);
    }
    // Slow filter drift for a breathing shimmer.
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(this.droneFilter.frequency);
    lfo.start(t);
    this.droneLfo = lfo;

    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(MASTER_GAIN, t + 1.4);
  }

  /**
   * Ring one crystalline bell. `radius01` is 0 (at the seed) .. 1 (field edge)
   * and sets the register. Throttled by voice pool + minimum onset spacing.
   */
  strike(radius01: number): void {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    if (now - this.lastOnset < MIN_ONSET_DT) return;
    this.lastOnset = now;

    const r = Math.max(0, Math.min(1, radius01));
    const fund = F_LOW * Math.pow(F_HIGH / F_LOW, r);
    const dur = 0.85 - 0.45 * r; // higher notes ring shorter

    if (this.voices.length >= MAX_VOICES) {
      const stolen = this.voices.shift();
      stolen?.stop(now);
    }

    const vgain = this.ctx.createGain();
    vgain.gain.value = 0;
    vgain.connect(this.master);

    const peak = 0.42;
    vgain.gain.setValueAtTime(0, now);
    vgain.gain.linearRampToValueAtTime(peak, now + 0.004);
    vgain.gain.exponentialRampToValueAtTime(0.0006, now + dur);

    const oscs: OscillatorNode[] = [];
    for (const p of PARTIALS) {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fund * p.ratio;
      osc.detune.value = (this.rnd() - 0.5) * 7; // subtle glassy beating
      const pg = this.ctx.createGain();
      pg.gain.value = p.amp;
      osc.connect(pg);
      pg.connect(vgain);
      osc.start(now);
      osc.stop(now + dur + 0.05);
      oscs.push(osc);
    }

    const voice: Voice = {
      oscs,
      vgain,
      stop: (t: number) => {
        try {
          vgain.gain.cancelScheduledValues(t);
          vgain.gain.setValueAtTime(vgain.gain.value, t);
          vgain.gain.exponentialRampToValueAtTime(0.0006, t + 0.05);
          for (const o of oscs) o.stop(t + 0.06);
        } catch {
          /* already stopped */
        }
      },
    };
    this.voices.push(voice);

    const last = oscs[oscs.length - 1];
    last.onended = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      try {
        vgain.disconnect();
      } catch {
        /* noop */
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const t = this.ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.linearRampToValueAtTime(0, t + 0.15);
    } catch {
      /* noop */
    }
    for (const v of this.voices) v.stop(t);
    this.voices = [];
    const stopAt = t + 0.2;
    for (const o of this.droneOscs) {
      try {
        o.stop(stopAt);
      } catch {
        /* noop */
      }
    }
    try {
      this.droneLfo?.stop(stopAt);
    } catch {
      /* noop */
    }
    this.droneOscs = [];
    this.droneLfo = null;
    window.setTimeout(() => {
      try {
        this.master.disconnect();
        this.comp.disconnect();
        this.droneGain.disconnect();
        this.droneFilter.disconnect();
      } catch {
        /* noop */
      }
    }, 300);
  }
}
