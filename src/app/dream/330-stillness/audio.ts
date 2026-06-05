"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 330 · Stillness — JI drone engine
//   A just-intonation drone over a low ROOT E2 (~82.41 Hz). Partials fade in,
//   staggered, as stillness deepens; a lowpass opens with the bloom. On startle
//   everything collapses (lowpass down, gains to near-zero). Procedural
//   convolver reverb. Master gain ≤ 0.5 → brick-wall DynamicsCompressor limiter.
//   Every parameter change uses setTargetAtTime glides — click-free.
// ─────────────────────────────────────────────────────────────────────────────

export const ROOT_HZ = 82.41; // E2

// Just-intonation ratios over the root. NOT pentatonic — a sustained
// drone built from low integer ratios (octave, fifth, fourth, minor third,
// minor sixth) in the spirit of Radigue / La Monte Young tuning.
export const PARTIAL_RATIOS = [1, 2, 6 / 5, 4 / 3, 3 / 2, 8 / 5] as const;

interface Partial {
  osc: OscillatorNode;
  gain: GainNode;
  // The peak gain this partial reaches at full bloom (lower partials louder).
  ceiling: number;
  // Bloom fraction (0..1) at which this partial begins to enter, so they
  // stagger in rather than swelling all at once.
  enterAt: number;
}

/** Render a smooth, slightly bright procedural impulse response for the
 *  convolver — an exponentially decaying noise burst, stereo-decorrelated. */
function renderImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponential decay; a short fade-in avoids a click at the head.
      const env = Math.pow(1 - t, 2.6) * Math.min(1, i / (rate * 0.01));
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

export class DroneEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private lowpass: BiquadFilterNode;
  private dry: GainNode;
  private wet: GainNode;
  private convolver: ConvolverNode;
  private partials: Partial[] = [];
  private startedAt = 0;

  constructor() {
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    const ctx = this.ctx;

    // ── Master bus: master gain (≤0.5) → brick-wall limiter → destination ──
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20; // brick wall
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.limiter);

    // ── Lowpass that opens with the bloom, drops on startle ──
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 180;
    this.lowpass.Q.value = 0.5;
    this.lowpass.connect(this.master);

    // ── Reverb send (procedural convolver) + dry path ──
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = renderImpulse(ctx, 4.5);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.62;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;

    this.dry.connect(this.lowpass);
    this.convolver.connect(this.wet);
    this.wet.connect(this.lowpass);
    this.dry.connect(this.convolver);

    // ── Partials ──
    const enterPoints = [0, 0.12, 0.28, 0.46, 0.66, 0.84];
    const ceilings = [0.5, 0.22, 0.3, 0.26, 0.32, 0.18];
    PARTIAL_RATIOS.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = ROOT_HZ * ratio;
      // Tiny per-partial detune for a living, beat-rich drone.
      osc.detune.value = (i - 2.5) * 1.5;

      const g = ctx.createGain();
      g.gain.value = 0.0;
      osc.connect(g);
      g.connect(this.dry);

      this.partials.push({
        osc,
        gain: g,
        ceiling: ceilings[i],
        enterAt: enterPoints[i],
      });
    });
  }

  /** Start oscillators. Call once, after a user gesture (ctx already running). */
  start() {
    const t = this.ctx.currentTime;
    this.startedAt = t;
    this.partials.forEach((p) => p.osc.start(t));
    // Fade the master in gently so "Begin" doesn't thump.
    this.master.gain.setTargetAtTime(0.46, t, 0.6);
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Drive the whole instrument from a single 0..1 bloom level.
   *  bloom 0 = collapsed / startled; bloom 1 = full stillness bloom. */
  setBloom(bloom: number) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const b = Math.max(0, Math.min(1, bloom));

    // Stagger partials: each enters across a window past its enterAt point.
    for (const p of this.partials) {
      const local = (b - p.enterAt) / (1 - p.enterAt + 0.0001);
      const amt = Math.max(0, Math.min(1, local));
      // Smooth ramp shape.
      const target = p.ceiling * (amt * amt);
      p.gain.gain.setTargetAtTime(target, t, 0.5);
    }

    // Lowpass opens from a muffled 180 Hz toward an airy ~2600 Hz.
    const cutoff = 180 + b * b * 2400;
    this.lowpass.frequency.setTargetAtTime(cutoff, t, 0.4);

    // More reverb as the room blooms.
    this.wet.gain.setTargetAtTime(0.35 + b * 0.45, t, 0.5);
  }

  /** Hard, fast collapse on startle — short time-constant glide, still no click. */
  startle() {
    const t = this.ctx.currentTime;
    for (const p of this.partials) {
      p.gain.gain.setTargetAtTime(0.0001, t, 0.08);
    }
    this.lowpass.frequency.setTargetAtTime(160, t, 0.06);
    this.wet.gain.setTargetAtTime(0.3, t, 0.1);
  }

  stop() {
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.0001, t, 0.2);
    try {
      this.partials.forEach((p) => p.osc.stop(t + 0.6));
    } catch {
      /* already stopped */
    }
    // Close shortly after the fade completes.
    window.setTimeout(() => {
      void this.ctx.close().catch(() => {});
    }, 800);
  }
}
