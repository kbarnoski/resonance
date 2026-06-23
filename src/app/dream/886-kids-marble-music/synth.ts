// Material-based modal impact synthesis.
//
// Each material is a bank of decaying damped sinusoids ("resonant modes").
// An impact spawns the whole bank: a fundamental (set per-object so the
// piece stays in a consonant scale) times a set of partial RATIOS that give
// the material its character, each with its own decay time and amplitude.
//
// Impact velocity scales overall loudness AND brightness (faster hits inject
// more energy into the high modes), so a soft graze and a hard slam on the
// same object sound clearly different.
//
// RESEARCH §530 (2026-06-24): material-based modal impact sonification
// (Schütz et al., Material-Based Sonification, IEEE ISMAR 2025;
//  Real-Time Non-linear Modal Synthesis, arXiv 2603.10240, 2026).

export type Material = "wood" | "glass" | "metal" | "drum";

interface ModalProfile {
  // Partial ratios relative to the object's fundamental.
  ratios: number[];
  // Relative amplitude of each partial at full strength.
  amps: number[];
  // Decay time (seconds) of each partial.
  decays: number[];
  // Master gain for the material so they sit at similar loudness.
  gain: number;
}

// Near-harmonic but slightly stretched -> warm, dull "tok". Short decay.
const WOOD: ModalProfile = {
  ratios: [1, 2.02, 3.01, 4.05],
  amps: [1, 0.5, 0.28, 0.12],
  decays: [0.16, 0.12, 0.09, 0.06],
  gain: 0.9,
};

// Clean bright high partials, long ring -> bell "ting".
const GLASS: ModalProfile = {
  ratios: [1, 2.0, 3.0, 4.0, 5.4],
  amps: [1, 0.7, 0.45, 0.3, 0.18],
  decays: [1.5, 1.2, 0.95, 0.7, 0.5],
  gain: 0.55,
};

// Inharmonic bar/plate ratios -> shimmery metallic "clang". Longest ring.
const METAL: ModalProfile = {
  ratios: [1, 2.76, 5.4, 8.93],
  amps: [1, 0.65, 0.5, 0.32],
  decays: [2.0, 1.7, 1.3, 0.9],
  gain: 0.42,
};

// Circular-membrane ratios -> boomy, fast envelope.
const DRUM: ModalProfile = {
  ratios: [1, 1.59, 2.14, 2.3, 2.65],
  amps: [1, 0.55, 0.4, 0.3, 0.2],
  decays: [0.4, 0.3, 0.22, 0.18, 0.14],
  gain: 1.0,
};

const PROFILES: Record<Material, ModalProfile> = {
  wood: WOOD,
  glass: GLASS,
  metal: METAL,
  drum: DRUM,
};

export class ModalEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.18;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    this.master.connect(this.limiter);
    this.limiter.connect(ctx.destination);
  }

  // strength in [0,1]: normalized impact velocity.
  strike(material: Material, fundamentalHz: number, strength: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = PROFILES[material];

    const s = Math.max(0.05, Math.min(1, strength));
    // Loudness grows with strength; brightness (high-mode boost) too.
    const loud = 0.12 + 0.88 * s * s;
    const bright = 0.35 + 0.65 * s;

    for (let i = 0; i < p.ratios.length; i++) {
      const hz = fundamentalHz * p.ratios[i];
      if (hz > 16000 || hz < 20) continue;

      // Higher partials get scaled by brightness so soft hits stay dull.
      const partialBright = i === 0 ? 1 : Math.pow(bright, i);
      const amp = p.amps[i] * partialBright * loud * p.gain;
      if (amp < 0.0008) continue;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = hz;

      const g = ctx.createGain();
      // Tiny attack avoids clicks, then exponential decay.
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp, now + 0.004);
      const dec = p.decays[i];
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.004 + dec);

      osc.connect(g);
      g.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.02 + dec);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    }
  }

  dispose(): void {
    this.master.disconnect();
    this.limiter.disconnect();
  }
}
