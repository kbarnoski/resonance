/**
 * Warm audio engine for the mycelial grower. Framework-free helper class.
 *
 * - A sustained drone bed: root ~55 Hz + a just fifth + soft partials through
 *   a slowly-moving lowpass.
 * - Each branch/split event triggers a soft pluck/bell from a FIXED consonant
 *   set (A-minor pentatonic) → no wrong notes. Pan by x, pitch by height/depth.
 * - Voice-steal cap so dense growth shimmers instead of clipping.
 * - Master chain: gain (<=0.28) -> lowpass -> DynamicsCompressor -> destination.
 *
 * The mic is handled separately and is analysis-only — it never connects here,
 * so there is no feedback path.
 */

// A-minor pentatonic across a few octaves (Hz). Consonant, no wrong notes.
const PENTATONIC_HZ: number[] = [
  // A1..E2 low body
  55.0, 65.41, 73.42, 82.41, 98.0,
  // A2..E3
  110.0, 130.81, 146.83, 164.81, 196.0,
  // A3..E4
  220.0, 261.63, 293.66, 329.63, 392.0,
  // A4..A5 sparkle
  440.0, 523.25, 587.33, 659.25, 880.0,
];

const MASTER_GAIN = 0.26; // <= 0.28 ceiling
const MAX_VOICES = 7; // voice-steal cap

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  endsAt: number;
}

export class MyceliumAudio {
  readonly ctx: AudioContext;
  private master: GainNode;
  private masterLP: BiquadFilterNode;
  private comp: DynamicsCompressorNode;
  private droneGain: GainNode;
  private droneLP: BiquadFilterNode;
  private droneOscs: OscillatorNode[] = [];
  private droneLfo: OscillatorNode | null = null;
  private droneLfoGain: GainNode | null = null;
  private voices: Voice[] = [];
  private started = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.28;

    this.masterLP = ctx.createBiquadFilter();
    this.masterLP.type = "lowpass";
    this.masterLP.frequency.value = 4200;
    this.masterLP.Q.value = 0.4;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    // gain -> lowpass -> compressor -> destination
    this.master.connect(this.masterLP);
    this.masterLP.connect(this.comp);
    this.comp.connect(ctx.destination);

    // Drone bus.
    this.droneLP = ctx.createBiquadFilter();
    this.droneLP.type = "lowpass";
    this.droneLP.frequency.value = 320;
    this.droneLP.Q.value = 0.7;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.5;
    this.droneLP.connect(this.droneGain);
    this.droneGain.connect(this.master);
  }

  /** Start the drone bed and ramp master up. Call from a user gesture. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.now ? this.ctx.now() : this.ctx.currentTime;

    // Root 55 Hz, just fifth (3:2 = 82.5), octave, and a soft upper partial.
    const partials: Array<{ f: number; type: OscillatorType; g: number }> = [
      { f: 55.0, type: "sine", g: 0.55 },
      { f: 82.5, type: "sine", g: 0.34 }, // just fifth
      { f: 110.0, type: "triangle", g: 0.2 },
      { f: 165.0, type: "sine", g: 0.12 }, // fifth an octave up
    ];
    for (const p of partials) {
      const o = this.ctx.createOscillator();
      o.type = p.type;
      o.frequency.value = p.f;
      const g = this.ctx.createGain();
      g.gain.value = p.g;
      o.connect(g);
      g.connect(this.droneLP);
      o.start(t);
      this.droneOscs.push(o);
    }

    // Slow filter movement so the bed breathes.
    this.droneLfo = this.ctx.createOscillator();
    this.droneLfo.type = "sine";
    this.droneLfo.frequency.value = 0.05; // 20s cycle
    this.droneLfoGain = this.ctx.createGain();
    this.droneLfoGain.gain.value = 140;
    this.droneLfo.connect(this.droneLfoGain);
    this.droneLfoGain.connect(this.droneLP.frequency);
    this.droneLfo.start(t);

    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(MASTER_GAIN, t + 2.5);
  }

  /**
   * Trigger a soft bell/pluck for a branch event.
   * @param x01     branch x normalised 0..1 → stereo pan
   * @param depth01 0..1 (deeper/older → lower note), drives pitch selection
   * @param bright  0..1 extra brightness/level (breath energy)
   */
  branch(x01: number, depth01: number, bright = 0.5): void {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Voice-steal: cap simultaneous voices, drop the oldest if over.
    this.reap(t);
    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      if (oldest) {
        try {
          oldest.gain.gain.cancelScheduledValues(t);
          oldest.gain.gain.setTargetAtTime(0, t, 0.03);
          oldest.osc.stop(t + 0.12);
        } catch {
          /* already stopped */
        }
      }
    }

    // Pitch: shallow tips → higher in the set, deep/old → lower body.
    const span = PENTATONIC_HZ.length - 1;
    // depth01 0 (tip) maps high, 1 (deep) maps low.
    const idxF = (1 - Math.max(0, Math.min(1, depth01))) * span;
    let idx = Math.round(idxF);
    idx = Math.max(0, Math.min(span, idx));
    const freq = PENTATONIC_HZ[idx];

    const osc = ctx.createOscillator();
    osc.type = idx > span * 0.65 ? "triangle" : "sine";
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    const peak = 0.05 + 0.09 * Math.max(0, Math.min(1, bright));
    const dur = 0.9 + 1.4 * (1 - Math.max(0, Math.min(1, depth01)));

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, x01 * 2 - 1));

    osc.connect(gain);
    gain.connect(pan);
    pan.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    this.voices.push({ osc, gain, endsAt: t + dur });
  }

  private reap(t: number): void {
    this.voices = this.voices.filter((v) => v.endsAt > t - 0.1);
  }

  /** Smoothly fade out and free everything. */
  async dispose(): Promise<void> {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 450));
    for (const o of this.droneOscs) {
      try {
        o.stop();
      } catch {
        /* ignore */
      }
    }
    try {
      this.droneLfo?.stop();
    } catch {
      /* ignore */
    }
    for (const v of this.voices) {
      try {
        v.osc.stop();
      } catch {
        /* ignore */
      }
    }
    this.droneOscs = [];
    this.voices = [];
    if (ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }
}

// Augment the lib type for the optional non-standard ctx.now() guard above.
declare global {
  interface AudioContext {
    now?: () => number;
  }
}
