// synth.ts — the sound of the sanctuary.
//
// Two voices, both ear-safe and beat-free:
//   1. A just-intonation OVERTONE CHOIR — an additive drone of stacked sine
//      partials at pure ratios over a low fundamental. Each partial has its
//      own slow amplitude LFO so the choir shimmers and "breathes" instead of
//      sitting as a dead chord. Breath energy swells overall loudness +
//      brightness (upper partials).
//   2. Struck SINGING-BOWL RESONATORS — short inharmonic modal tones with long
//      exponential decay, struck at the top of each breath, ringing out into a
//      long feedback-delay + convolution-ish tail during the rest.
//
// Master chain is hard-capped: choir/bowl buses -> master gain (<=0.5) ->
// DynamicsCompressor -> destination. The mic is NEVER routed here.

/** Pure just-intonation ratios over the fundamental — beat-free intervals.
 *  1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2. */
const JI_RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2] as const;

/** Inharmonic partial sets for a few distinct bowls. Ratios above the bowl's
 *  strike pitch, loosely modelled on real singing-bowl spectra (slightly
 *  stretched, not pure harmonics). Each entry: [ratio, relativeGain]. */
const BOWL_MODES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // bowl A — bright, close partials
  [
    [1, 1],
    [2.74, 0.42],
    [5.41, 0.22],
    [8.9, 0.1],
  ],
  // bowl B — wider, hollow
  [
    [1, 1],
    [2.61, 0.5],
    [4.98, 0.18],
    [7.6, 0.08],
  ],
  // bowl C — deep, long
  [
    [1, 0.9],
    [2.83, 0.36],
    [5.18, 0.2],
    [9.4, 0.06],
  ],
];

/** One additive partial of the overtone choir. */
interface ChoirPartial {
  osc: OscillatorNode;
  /** Per-partial gain (its own slow LFO writes here). */
  amp: GainNode;
  /** The pure ratio this partial sits at. */
  ratio: number;
  /** Index into the partial stack (higher = brighter, swells more with breath). */
  index: number;
  /** Slow shimmer LFO phase + rate. */
  lfoPhase: number;
  lfoRate: number;
  /** Base loudness before shimmer + breath modulation. */
  baseGain: number;
}

export interface SanctuaryParams {
  /** Breath energy 0..1 — swells loudness and brightness. */
  breath: number;
  /** Ritual brightness 0..1 — how many upper partials are present (arc). */
  openness: number;
  /** Reverb/tail length factor 0..1 — grows across the arc. */
  tail: number;
}

export class SanctuarySynth {
  readonly ctx: AudioContext;

  private master: GainNode;
  private compressor: DynamicsCompressorNode;

  // Choir bus.
  private choirBus: GainNode;
  private choirLowpass: BiquadFilterNode;
  private partials: ChoirPartial[] = [];

  // Bowl bus + tail (feedback delay = a long, simple "reverb").
  private bowlBus: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private delayWet: GainNode;
  private toneShelf: BiquadFilterNode;

  private fundamental: number;
  private smoothedBreath = 0;

  constructor(ctx: AudioContext, fundamentalHz = 65.41 /* C2 */) {
    this.ctx = ctx;
    this.fundamental = fundamentalHz;

    // ── Master chain (hard cap) ──────────────────────────────────────────
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -22;
    this.compressor.knee.value = 28;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.32;

    this.master = ctx.createGain();
    this.master.gain.value = 0; // faded in on start()
    this.master.connect(this.compressor);
    this.compressor.connect(ctx.destination);

    // ── Choir bus ────────────────────────────────────────────────────────
    this.choirLowpass = ctx.createBiquadFilter();
    this.choirLowpass.type = "lowpass";
    this.choirLowpass.frequency.value = 600;
    this.choirLowpass.Q.value = 0.4;

    this.choirBus = ctx.createGain();
    this.choirBus.gain.value = 0.5;
    this.choirLowpass.connect(this.choirBus);
    this.choirBus.connect(this.master);

    // ── Bowl bus + long tail ─────────────────────────────────────────────
    this.bowlBus = ctx.createGain();
    this.bowlBus.gain.value = 0.55;

    this.toneShelf = ctx.createBiquadFilter();
    this.toneShelf.type = "highshelf";
    this.toneShelf.frequency.value = 2600;
    this.toneShelf.gain.value = -6;

    this.delay = ctx.createDelay(4.0);
    this.delay.delayTime.value = 0.55;
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.55;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.6;

    // bowlBus -> shelf -> [dry to master] and into the delay tail
    this.bowlBus.connect(this.toneShelf);
    this.toneShelf.connect(this.master); // dry strike
    this.toneShelf.connect(this.delay);
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay); // feedback loop (capped < 1)
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.master);

    this.buildChoir();
  }

  private buildChoir() {
    const ctx = this.ctx;
    JI_RATIOS.forEach((ratio, index) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = this.fundamental * ratio;
      // Gentle detune per partial for an analog, living shimmer (still beat-free
      // at the fundamental — this is a few cents only).
      osc.detune.value = (index % 2 === 0 ? 1 : -1) * (1.5 + index * 0.4);

      const amp = ctx.createGain();
      // Upper partials start quieter; the arc/breath lift them.
      const baseGain = 0.5 / (1 + index * 0.9);
      amp.gain.value = baseGain;

      osc.connect(amp);
      amp.connect(this.choirLowpass);
      osc.start();

      this.partials.push({
        osc,
        amp,
        ratio,
        index,
        lfoPhase: Math.random() * Math.PI * 2,
        lfoRate: 0.045 + Math.random() * 0.07, // very slow
        baseGain,
      });
    });
  }

  /** Fade the whole sanctuary in over a few seconds (call inside start gesture). */
  fadeIn(seconds = 4) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0.0001, t);
    this.master.gain.exponentialRampToValueAtTime(0.5, t + seconds);
  }

  /** Fade out + tidy down (call before close on unmount). */
  fadeOut(seconds = 1.2) {
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), t);
    this.master.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  }

  /** Drift the fundamental (e.g. down a fifth in the release phase). Smooth. */
  setFundamental(hz: number, glideSeconds = 12) {
    this.fundamental = hz;
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      const target = hz * p.ratio;
      p.osc.frequency.cancelScheduledValues(t);
      p.osc.frequency.setValueAtTime(p.osc.frequency.value, t);
      p.osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, target),
        t + glideSeconds
      );
    }
  }

  /** Grow the reverb/delay tail across the arc. */
  setTail(amount01: number) {
    const t = this.ctx.currentTime;
    const fb = 0.45 + amount01 * 0.32; // up to ~0.77 — long but stable
    const dt = 0.45 + amount01 * 0.55; // up to ~1.0s
    this.feedback.gain.setTargetAtTime(fb, t, 2);
    this.delay.delayTime.setTargetAtTime(dt, t, 4);
    this.delayWet.gain.setTargetAtTime(0.45 + amount01 * 0.35, t, 2);
  }

  /** Per-frame update: shimmer LFOs + breath swell of loudness/brightness. */
  step(dt: number, params: SanctuaryParams) {
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Smooth the breath so swells are graceful, not jittery.
    this.smoothedBreath += (params.breath - this.smoothedBreath) * Math.min(1, dt * 3);
    const breath = this.smoothedBreath;

    // Brightness: breath + arc openness open the choir lowpass and lift the
    // upper partials.
    const openness = params.openness;
    const cutoff = 420 + (breath * 0.7 + openness * 0.6) * 2600;
    this.choirLowpass.frequency.setTargetAtTime(cutoff, t, 0.25);

    for (const p of this.partials) {
      p.lfoPhase += p.lfoRate * dt * Math.PI * 2;
      const shimmer = 0.55 + 0.45 * Math.sin(p.lfoPhase);
      // Upper partials are gated by openness so the arc literally adds voices.
      const present = p.index <= 1 ? 1 : Math.min(1, openness * 1.4 + breath * 0.5);
      // Breath lifts upper partials more than the low fundamental.
      const breathLift = 1 + breath * (0.4 + p.index * 0.22);
      const target = p.baseGain * shimmer * present * breathLift;
      p.amp.gain.setTargetAtTime(Math.min(0.6, target), t, 0.08);
    }

    // Overall choir level breathes a little too.
    this.choirBus.gain.setTargetAtTime(0.4 + breath * 0.22, t, 0.2);

    this.setTail(params.tail);
  }

  /** Strike a singing bowl. `bowlIndex` selects the modal set; `pitchHz` is the
   *  strike pitch; `strength` 0..1 scales loudness + decay. Self-cleaning. */
  strikeBowl(bowlIndex: number, pitchHz: number, strength = 0.8) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const modes = BOWL_MODES[bowlIndex % BOWL_MODES.length];
    const decay = 5.5 + strength * 6.5; // 5.5–12s ring

    for (const [ratio, rel] of modes) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = pitchHz * ratio;

      const g = ctx.createGain();
      const peak = Math.min(0.25, 0.22 * rel * (0.4 + strength * 0.6));
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.012); // fast strike
      // Higher partials decay faster (physical damping).
      const modeDecay = decay / (1 + (ratio - 1) * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + modeDecay);

      osc.connect(g);
      g.connect(this.bowlBus);
      osc.start(t);
      osc.stop(t + modeDecay + 0.1);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* already gone */
        }
      };
    }
  }

  /** The choir's current fundamental — handy for choosing a bowl strike pitch. */
  get currentFundamental() {
    return this.fundamental;
  }

  /** Tear down all permanently-running nodes (the drone oscillators). */
  dispose() {
    for (const p of this.partials) {
      try {
        p.osc.stop();
        p.osc.disconnect();
        p.amp.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.partials = [];
    try {
      this.choirLowpass.disconnect();
      this.choirBus.disconnect();
      this.bowlBus.disconnect();
      this.toneShelf.disconnect();
      this.delay.disconnect();
      this.feedback.disconnect();
      this.delayWet.disconnect();
      this.master.disconnect();
      this.compressor.disconnect();
    } catch {
      /* ignore */
    }
  }
}
