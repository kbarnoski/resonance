// ─────────────────────────────────────────────────────────────────────────────
// synth.ts — the Vow modal struck-resonator engine.
//
// Each of the 12 "vows" is a REAL physically-modeled struck body, not a sample
// and not a sine beep. We use modal synthesis (the additive-mode view of the
// banded-waveguide / modal family — Julius O. Smith, *Physical Audio Signal
// Processing*; Cook's STK ModalBar): a struck object rings as a bank of
// inharmonic vibrational modes, each an oscillator whose amplitude decays
// exponentially.
//
//     strike ──►  ┌ osc @ f·r₀  · env(τ₀) ┐
//                 ├ osc @ f·r₁  · env(τ₁) ┤ ─► voice ─► limiter ─► out
//                 └ osc @ f·rₙ  · env(τₙ) ┘
//
//   • The partial ratios rₖ are INHARMONIC and DIFFER per archetype, so the
//     constellation is a real scale of distinct-timbred bodies.
//   • Each mode's decay time-constant scales INVERSELY with its frequency:
//         τₖ = Qₖ / (π · fₖ)
//     so the bright high modes damp fastest — the frequency-dependent damping
//     of struck metal/glass falls straight out of the physics, for free.
//   • A seeded mulberry32 supplies all per-strike jitter — never Math.random /
//     Date.now — so the self-demo is bit-identical every load.
//
// Pure TS + Web Audio. No React, no DOM.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32). Deterministic jitter — never Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Partial {
  /** Frequency ratio relative to the fundamental (inharmonic on purpose). */
  ratio: number;
  /** Relative excitation gain of this mode. */
  gain: number;
}

export interface Archetype {
  id: string;
  /** Base quality factor — higher Q ⇒ longer ring (τ = Q/(π·f)). */
  q: number;
  /** Overall loudness trim. */
  level: number;
  partials: Partial[];
}

// ── Struck-body spectra ──────────────────────────────────────────────────────
// Hand-voiced inharmonic sets, each distinct. None use the lab-banned Chladni
// set {1, 2.76, 5.40, 8.93}.
export const ARCHETYPES: Archetype[] = [
  {
    // Church-bell partials (Rossing): hum · prime · tierce · quint · nominal …
    id: "bell",
    q: 2600,
    level: 0.95,
    partials: [
      { ratio: 0.56, gain: 0.7 },
      { ratio: 1.0, gain: 1.0 },
      { ratio: 1.19, gain: 0.62 },
      { ratio: 1.71, gain: 0.42 },
      { ratio: 2.0, gain: 0.5 },
      { ratio: 2.74, gain: 0.28 },
      { ratio: 3.0, gain: 0.22 },
      { ratio: 3.76, gain: 0.14 },
    ],
  },
  {
    // Glass — tall, bright, closely stretched, very high-Q shimmer.
    id: "glass",
    q: 3400,
    level: 0.8,
    partials: [
      { ratio: 1.0, gain: 1.0 },
      { ratio: 2.4, gain: 0.5 },
      { ratio: 4.1, gain: 0.34 },
      { ratio: 6.3, gain: 0.2 },
      { ratio: 8.9, gain: 0.11 },
      { ratio: 11.4, gain: 0.06 },
    ],
  },
  {
    // Tuned bronze bar (vibraphone) — sparse, stretched 1·4·10.7.
    id: "bar",
    q: 1500,
    level: 1.0,
    partials: [
      { ratio: 1.0, gain: 1.0 },
      { ratio: 3.98, gain: 0.45 },
      { ratio: 10.68, gain: 0.16 },
      { ratio: 17.9, gain: 0.06 },
    ],
  },
  {
    // Singing bowl — perturbed, long ring, slow beat from a detuned twin.
    id: "bowl",
    q: 4200,
    level: 0.9,
    partials: [
      { ratio: 1.0, gain: 1.0 },
      { ratio: 2.66, gain: 0.55 },
      { ratio: 4.97, gain: 0.3 },
      { ratio: 7.36, gain: 0.16 },
      { ratio: 10.2, gain: 0.08 },
    ],
  },
];

export interface VowSpec {
  /** Fundamental frequency (Hz). */
  freq: number;
  archetype: Archetype;
}

/**
 * Build the 12-node scale: a pentatonic spread over two-plus octaves so the
 * constellation is genuinely playable, with archetypes cycled so neighbours
 * differ in timbre. Deterministic — depends only on the seed.
 */
export function buildScale(seed: number): VowSpec[] {
  const rng = mulberry32(seed);
  const root = 146.83; // D3
  // minor-pentatonic degrees in semitones, spanning ~2.5 octaves
  const degrees = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
  return degrees.map((d, i) => {
    // tiny seeded detune (±4 cents) so no two bodies are perfectly in tune
    const cents = (rng() - 0.5) * 8;
    const freq = root * Math.pow(2, (d + cents / 100) / 12);
    return { freq, archetype: ARCHETYPES[i % ARCHETYPES.length] };
  });
}

// ── The audio engine ─────────────────────────────────────────────────────────

export class VowEngine {
  readonly ctx: AudioContext;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private rng: () => number;
  private specs: VowSpec[];

  constructor(specs: VowSpec[], seed: number) {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.specs = specs;
    this.rng = mulberry32(seed ^ 0x9e37);

    this.limiter = this.ctx.createDynamicsCompressor();
    // Brick-ish limiter to keep dense chords from clipping.
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;

    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);
  }

  /** Resume the context — must be called from a user gesture. */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore — some browsers reject before gesture */
      }
    }
  }

  get running(): boolean {
    return this.ctx.state === "running";
  }

  /**
   * Strike one vow. `amp` in [0,1] sets loudness; `ringMul` stretches the ring
   * (used ×3 for the farewell strike). Returns the approximate ring length (s)
   * so the visuals can time their decay to the sound.
   */
  strike(index: number, amp = 1, ringMul = 1): number {
    const spec = this.specs[index];
    if (!spec) return 0;
    const { ctx } = this;
    const now = ctx.currentTime;
    const { freq, archetype } = spec;

    // Per-strike voice bus so the whole body can be released together.
    const voice = ctx.createGain();
    voice.gain.value = archetype.level * amp;
    voice.connect(this.master);

    // Slight seeded strike-position jitter: shifts the excitation balance of
    // the modes a touch, so no two strikes are identical.
    const posJitter = 0.85 + this.rng() * 0.3;

    // Longest mode sets the voice lifetime; cap it so silent oscillators never
    // linger for minutes (the farewell ring is long, but bounded).
    let maxTau = 0;
    for (const p of archetype.partials) {
      const f = freq * p.ratio;
      if (f > 18000) continue;
      maxTau = Math.max(maxTau, (archetype.q / (Math.PI * f)) * ringMul);
    }
    const life = Math.min(maxTau * 5, ringMul > 1 ? 28 : 16);
    const stopAt = now + 0.003 + life + 0.1;

    for (let m = 0; m < archetype.partials.length; m++) {
      const p = archetype.partials[m];
      const f = freq * p.ratio;
      if (f > 18000) continue; // above hearing / Nyquist headroom — skip
      // τ = Q / (π f): high modes damp fastest → real struck-metal decay.
      const tau = (archetype.q / (Math.PI * f)) * ringMul;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      // ±3 cent seeded detune per mode → living, slightly beating partials.
      osc.detune.value = (this.rng() - 0.5) * 6;

      const g = ctx.createGain();
      // Excitation: higher modes get a mild extra tilt from strike position.
      const modeAmp =
        p.gain * (m === 0 ? 1 : Math.pow(posJitter, m * 0.5));
      // Raised-cosine-ish soft attack, then exponential modal decay.
      const atk = 0.003;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(modeAmp, now + atk);
      // setTargetAtTime decays toward 0 with time-constant τ.
      g.gain.setTargetAtTime(0, now + atk, tau);

      osc.connect(g);
      g.connect(voice);
      osc.start(now);
      osc.stop(stopAt);
    }

    // Fade the voice bus to silence before the oscillators stop, so the bounded
    // lifetime never produces an audible click.
    voice.gain.setTargetAtTime(0, now + life * 0.7, life * 0.12);

    return maxTau;
  }

  dispose(): void {
    try {
      this.master.disconnect();
      this.limiter.disconnect();
    } catch {
      /* noop */
    }
    void this.ctx.close();
  }
}
