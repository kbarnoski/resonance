// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the "Enigma drone".
//
// Two oscillator banks tuned a few Hz apart. Where bank A sits at frequency f
// and bank B sits at f + beatHz, their sum swells and fades at exactly beatHz —
// an audible amplitude BEAT (the interference / difference-tone phenomenon).
// We drive beatHz from the *perceived* streaming rate of the Enigma figure, so
// the shimmer you HEAR tracks the illusory rotation you SEE. This is an
// interference model, NOT a fixed musical scale.
//
// Signal path:   banks → mixGain → lowpass → (dry + feedback delay) → out
// No Math.random() / Date.now() in any audio-rate path; nothing is scheduled
// per animation frame — parameter changes are smooth setTargetAtTime ramps.
// ─────────────────────────────────────────────────────────────────────────────

interface Partial {
  /** ratio of this partial's frequency to the current root. */
  ratio: number;
  a: OscillatorNode; // bank A (root side)
  b: OscillatorNode; // bank B (detuned side → produces the beat)
  gain: GainNode;
}

const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export class EnigmaDrone {
  private ctx: AudioContext;
  private partials: Partial[] = [];
  private mix: GainNode;
  private master: GainNode;
  private lp: BiquadFilterNode;
  private delay: DelayNode;
  private feedback: GainNode;

  private root = 96; // Hz — low register base
  private beatHz = 1.4; // current audible beat rate
  private started = false;
  private muted = false;

  // A restrained additive cluster: octave + fifth partials, no dense chord.
  private static readonly RATIOS = [1, 2, 3, 4.5];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;

    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.frequency.value = 900;
    this.lp.Q.value = 0.5;

    this.mix = ctx.createGain();
    this.mix.gain.value = 0.9;

    // Gentle feedback delay for shimmer.
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.33;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.34;

    this.mix.connect(this.lp);
    this.lp.connect(this.master);
    this.lp.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);
    this.delay.connect(this.master);
    this.master.connect(ctx.destination);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const now = this.ctx.currentTime;

    for (const ratio of EnigmaDrone.RATIOS) {
      const gain = this.ctx.createGain();
      // higher partials quieter for a soft, breathy cluster.
      gain.gain.value = 0.85 / (1 + ratio * 0.7);
      gain.connect(this.mix);

      const a = this.ctx.createOscillator();
      const b = this.ctx.createOscillator();
      a.type = "sine";
      b.type = "sine";
      a.frequency.value = this.root * ratio;
      b.frequency.value = this.root * ratio + this.beatHz;
      a.connect(gain);
      b.connect(gain);
      a.start(now);
      b.start(now);

      this.partials.push({ ratio, a, b, gain });
    }

    // fade in.
    this.master.gain.setTargetAtTime(0.16, now, 1.2);
  }

  /** Perceived streaming depth in [0,1] → beat rate + brightness + register.
   *  Deeper fixation ⇒ faster shimmer, brighter, slightly higher. */
  setDepth(depth: number): void {
    const d = clamp(depth, 0, 1);
    this.beatHz = 1.0 + d * 5.0; // 1 → 6 Hz audible beat
    this.applyBeat();
    const t = this.ctx.currentTime;
    this.lp.frequency.setTargetAtTime(700 + d * 1600, t, 0.4);
  }

  /** Pointer radius selecting the "active annulus" → base register.
   *  near centre = lower, outer = higher. */
  setRegister(x: number): void {
    const r = clamp(x, 0, 1);
    this.root = 84 * Math.pow(2, r * 0.75); // ~84 → ~142 Hz
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      p.a.frequency.setTargetAtTime(this.root * p.ratio, t, 0.5);
      p.b.frequency.setTargetAtTime(this.root * p.ratio + this.beatHz, t, 0.5);
    }
  }

  private applyBeat(): void {
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      p.b.frequency.setTargetAtTime(this.root * p.ratio + this.beatHz, t, 0.3);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(m ? 0.0001 : 0.16, t, 0.3);
  }

  isMuted(): boolean {
    return this.muted;
  }

  stop(): void {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.0001, t, 0.2);
    for (const p of this.partials) {
      try {
        p.a.stop(t + 0.5);
        p.b.stop(t + 0.5);
      } catch {
        /* already stopped */
      }
    }
    this.partials = [];
    this.started = false;
  }
}
