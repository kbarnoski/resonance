// ─────────────────────────────────────────────────────────────────────────────
// PlateAudio — the metallic voice of the plate.
//
// The plate does NOT sing a consonant chord. When a mode locks it is STRUCK and
// rings with a bank of INHARMONIC partials — the stretched, non-integer series
// of a struck circular plate / bell (Rossing, "Science of Percussion
// Instruments"): ratios ≈ 1, 2.76, 5.40, 8.93, 13.34. Each partial has its own
// exponential decay, retriggered on every strike, and a faint continuous
// excitation driven by the singer's own voice amplitude — the voice is the
// exciter, the plate answers in metal.
// ─────────────────────────────────────────────────────────────────────────────

/** Inharmonic partial ratios of a struck plate/bell (non-integer on purpose). */
const PARTIALS = [1.0, 2.76, 5.404, 8.933, 13.34];
/** Per-partial decay time constants (s) — higher partials die faster. */
const DECAYS = [2.6, 1.8, 1.2, 0.8, 0.5];
/** Per-partial strike weights. */
const WEIGHTS = [1.0, 0.62, 0.4, 0.26, 0.16];

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
}

export class PlateAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private partials: Partial[] = [];
  private started = false;
  private f0 = 220;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;

    // Gentle high-shelf-ish tone shaping so the metal isn't harsh.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 9000;
    lp.Q.value = 0.4;
    this.master.connect(lp);
    lp.connect(ctx.destination);

    for (let i = 0; i < PARTIALS.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.master);
      this.partials.push({ osc, gain });
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    const t = this.ctx.currentTime;
    this.partials.forEach((p) => p.osc.start(t));
    this.master.gain.setTargetAtTime(0.85, t, 0.5);
  }

  /** Strike the plate: retune partials to the new modal fundamental and
   *  retrigger every partial's exponential decay. */
  strike(modeHz: number, intensity = 1) {
    // Fold the modal frequency into a bell-like register (octave transposition
    // preserves the inharmonic character while keeping busy modes from shrieking).
    let f0 = modeHz;
    while (f0 < 150) f0 *= 2;
    while (f0 > 1000) f0 *= 0.5;
    this.f0 = f0;
    const t = this.ctx.currentTime;
    const nyq = this.ctx.sampleRate * 0.5;
    for (let i = 0; i < this.partials.length; i++) {
      const p = this.partials[i];
      const freq = f0 * PARTIALS[i];
      if (freq > nyq * 0.95) {
        p.gain.gain.cancelScheduledValues(t);
        p.gain.gain.setTargetAtTime(0, t, 0.05);
        continue;
      }
      // Slight per-strike detune → shimmering, live metal.
      p.osc.frequency.setTargetAtTime(freq * (1 + (i - 2) * 0.0009), t, 0.01);
      // Sharp attack: snap each partial up to its strike peak. The per-frame
      // sustain() call then lets it decay (time constant DECAYS[i]) toward the
      // voice-driven floor, so strike and sustain compose instead of fighting.
      const peak = WEIGHTS[i] * 0.22 * intensity;
      p.gain.gain.cancelScheduledValues(t);
      p.gain.gain.setValueAtTime(peak, t);
    }
  }

  /** Continuous excitation from the singer — keeps the plate ringing while a
   *  pitch is held. `voice` 0..1 is mic amplitude, `bright` 0..1 raises the
   *  balance of upper partials. Called every frame; each partial relaxes toward
   *  its floor with its own decay constant, giving a struck-then-sustained metal. */
  sustain(voice: number, bright: number) {
    const t = this.ctx.currentTime;
    const drive = Math.min(1, voice);
    for (let i = 0; i < this.partials.length; i++) {
      const p = this.partials[i];
      const upper = i / (this.partials.length - 1);
      const bal = 0.5 + bright * upper;
      const floor = WEIGHTS[i] * drive * 0.06 * bal;
      p.gain.gain.setTargetAtTime(floor, t, DECAYS[i]);
    }
    this.master.gain.setTargetAtTime(0.55 + drive * 0.35, t, 0.25);
  }

  getF0() {
    return this.f0;
  }

  async stop() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, t, 0.25);
    await new Promise((res) => setTimeout(res, 350));
    this.partials.forEach((p) => {
      try {
        p.osc.stop();
      } catch {
        /* already stopped */
      }
    });
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}
