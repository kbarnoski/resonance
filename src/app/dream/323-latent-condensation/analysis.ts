// ─────────────────────────────────────────────────────────────────────────────
// analysis.ts — live spectral analysis + phrase state machine.
//
// Taps an AnalyserNode each frame: six perceptual FFT bands, RMS envelope, and a
// phrase state machine that converts rising/sustained/decaying energy into a
// single "condensation" coupling value in [0,1] that the GPU sim reads:
//
//   chaos    →  condensation drifts toward 0 (pure turbulent flow)
//   condense →  rising energy pulls condensation up toward the target form
//   form     →  sustained energy holds condensation near 1
//   release  →  decaying energy lets condensation fall back to chaos
//
// Self-contained: no imports from _shared or other dream folders.
// ─────────────────────────────────────────────────────────────────────────────

/** Six perceptual frequency bands (Hz). */
const BAND_RANGES_HZ: ReadonlyArray<[number, number]> = [
  [20, 60], // sub-bass
  [60, 250], // bass
  [250, 500], // low-mid
  [500, 2000], // mid
  [2000, 4000], // high-mid
  [4000, 16000], // high
];

export type Phase = "chaos" | "condense" | "form" | "release";

export interface Frame {
  /** Per-band normalized energy 0-1 after smoothing. */
  bands: number[];
  /** Total RMS-ish amplitude 0-1 (smoothed). */
  amplitude: number;
  /** Low-frequency energy 0-1 (bands 0+1) → flow turbulence/scale. */
  low: number;
  /** High-frequency energy 0-1 (bands 4+5) → sparkle/brightness. */
  high: number;
  /** Condensation coupling 0 (chaos) … 1 (fully formed). */
  condensation: number;
  /** Current phrase state. */
  phase: Phase;
}

export class Analysis {
  private analyser: AnalyserNode;
  private freq: Float32Array<ArrayBuffer>;
  private smoothBands = [0, 0, 0, 0, 0, 0];
  private smoothAmp = 0;
  // slow + fast envelope followers; their difference reveals rise vs decay
  private slowEnv = 0;
  private fastEnv = 0;
  private condensation = 0;
  private phase: Phase = "chaos";
  private holdTimer = 0;

  constructor(analyser: AnalyserNode) {
    this.analyser = analyser;
    this.freq = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
  }

  /** Sample the analyser and advance the phrase machine. dt in seconds. */
  read(dt: number): Frame {
    const a = this.analyser;
    a.getFloatFrequencyData(this.freq);
    const binHz = (a.context.sampleRate) / a.fftSize;

    const bandsRaw: number[] = [];
    let total = 0;
    for (let i = 0; i < BAND_RANGES_HZ.length; i++) {
      const [lo, hi] = BAND_RANGES_HZ[i];
      const loBin = Math.floor(lo / binHz);
      const hiBin = Math.min(this.freq.length, Math.ceil(hi / binHz));
      let sumDb = 0;
      let count = 0;
      for (let b = loBin; b < hiBin; b++) {
        sumDb += this.freq[b];
        count++;
      }
      const avgDb = count > 0 ? sumDb / count : -100;
      // map roughly -80..-10 dB to 0..1
      const norm = Math.max(0, Math.min(1, (avgDb + 80) / 70));
      bandsRaw.push(norm);
      total += norm;
    }

    // exponential smoothing
    const s = 0.78;
    for (let i = 0; i < bandsRaw.length; i++) {
      this.smoothBands[i] = this.smoothBands[i] * s + bandsRaw[i] * (1 - s);
    }
    const amp = Math.min(1, total / bandsRaw.length);
    this.smoothAmp = this.smoothAmp * 0.85 + amp * 0.15;

    // dual envelope followers
    this.fastEnv += (this.smoothAmp - this.fastEnv) * Math.min(1, dt * 6.0);
    this.slowEnv += (this.smoothEnvTarget() - this.slowEnv) * Math.min(1, dt * 0.9);
    const rise = this.fastEnv - this.slowEnv; // >0 rising, <0 decaying

    // ── phrase state machine ────────────────────────────────────────────────
    const energetic = this.fastEnv > 0.16;
    switch (this.phase) {
      case "chaos":
        if (energetic && rise > 0.02) this.phase = "condense";
        break;
      case "condense":
        if (this.condensation > 0.85) {
          this.phase = "form";
          this.holdTimer = 0;
        } else if (!energetic || rise < -0.05) {
          this.phase = "release";
        }
        break;
      case "form":
        this.holdTimer += dt;
        if (!energetic || rise < -0.03) this.phase = "release";
        break;
      case "release":
        if (this.condensation < 0.08) this.phase = "chaos";
        else if (energetic && rise > 0.04) this.phase = "condense";
        break;
    }

    // condensation glides toward the phase target
    const target =
      this.phase === "condense" ? 1.0 :
      this.phase === "form" ? 1.0 :
      this.phase === "release" ? 0.0 : 0.0;
    const speed =
      this.phase === "condense" ? 1.6 :
      this.phase === "form" ? 2.2 :
      this.phase === "release" ? 0.7 : 0.9;
    this.condensation += (target - this.condensation) * Math.min(1, dt * speed);
    this.condensation = Math.max(0, Math.min(1, this.condensation));

    const low = Math.min(1, (this.smoothBands[0] + this.smoothBands[1]) * 0.5);
    const high = Math.min(1, (this.smoothBands[4] + this.smoothBands[5]) * 0.5);

    return {
      bands: [...this.smoothBands],
      amplitude: this.smoothAmp,
      low,
      high,
      condensation: this.condensation,
      phase: this.phase,
    };
  }

  private smoothEnvTarget(): number {
    // slow follower chases the smoothed amplitude
    return this.smoothAmp;
  }
}
