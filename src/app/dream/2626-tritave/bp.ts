// ─────────────────────────────────────────────────────────────────────────
// Bohlen–Pierce tuning engine + odd-harmonic additive synth voice.
//
// BP is a NON-octave tuning. Its interval of equivalence is the TRITAVE,
// the 3:1 ratio (a perfect twelfth), divided into 13 equal steps.
//   step ratio = 3^(1/13) ≈ 1.088182   (≈ 146.30 cents each)
//   freq(step) = base * 3^(step/13)     →  freq(13) === base * 3  (exact)
//
// Refs: Heinz Bohlen (1978); Max Mathews & John Pierce; Xenharmonic Wiki
//       "Bohlen–Pierce scale" (en.xen.wiki/w/Bohlen–Pierce_scale).
// ─────────────────────────────────────────────────────────────────────────

export const STEPS_PER_TRITAVE = 13;
export const STEP_RATIO = Math.pow(3, 1 / STEPS_PER_TRITAVE); // ≈ 1.088182
export const CENTS_PER_STEP = 1200 * Math.log2(STEP_RATIO); // ≈ 146.30

/** Frequency of a BP step above `base`. freq(base, 13) === base * 3 exactly. */
export function freq(base: number, step: number): number {
  return base * Math.pow(3, step / STEPS_PER_TRITAVE);
}

/** The 9-note "Lambda" mode of Bohlen–Pierce (the classic BP scale). */
export const LAMBDA_STEPS = [0, 1, 3, 4, 6, 7, 9, 10, 12] as const;

/** Where the ordinary 2:1 octave would fall — it lands mid-tritave and does
 *  NOT coincide with any step, which is exactly what makes BP feel alien. */
export const OCTAVE_STEP = STEPS_PER_TRITAVE * Math.log(2) / Math.log(3); // ≈ 8.202

export interface BpChord {
  id: string;
  name: string;
  /** step offsets from the chord root */
  steps: number[];
  /** the just ratio these steps approximate */
  ratio: string;
}

// BP consonances are built on ODD harmonics. Verified numerically:
//   5/3 → step 6.045, 7/3 → step 10.026  ⇒ 3:5:7 ≈ steps 0,6,10
//   7/5 → step 3.982, 9/5 → step 6.955   ⇒ 5:7:9 ≈ steps 0,4,7
export const CHORDS: BpChord[] = [
  { id: "bp-major", name: "BP major", steps: [0, 6, 10], ratio: "3:5:7" },
  { id: "bp-minor", name: "BP minor", steps: [0, 4, 7], ratio: "5:7:9" },
  { id: "bp-wide", name: "wide", steps: [0, 6, 13], ratio: "3:5:9" },
];

/** Identify a set of currently-held steps (relative to its lowest note). */
export function identifyChord(activeSteps: number[]): BpChord | null {
  if (activeSteps.length < 2) return null;
  const sorted = [...new Set(activeSteps)].sort((a, b) => a - b);
  const root = sorted[0];
  const rel = sorted.map((s) => s - root);
  for (const c of CHORDS) {
    if (c.steps.length !== rel.length) continue;
    if (c.steps.every((v, i) => v === rel[i])) return c;
  }
  return null;
}

// ─── Odd-harmonic (clarinet-like) periodic wave ──────────────────────────────
// Strong odd partials (1,3,5,7,9), only vestigial even ones. This lets BP's
// real 3:5:7 consonances lock and ring, and its clusters genuinely bite.
export function makeOddWave(ctx: BaseAudioContext): PeriodicWave {
  const n = 12;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const odd: Record<number, number> = {
    1: 1.0,
    3: 0.62,
    5: 0.42,
    7: 0.26,
    9: 0.15,
    11: 0.09,
  };
  for (let h = 1; h < n; h++) {
    if (odd[h] !== undefined) imag[h] = odd[h];
    else if (h % 2 === 0) imag[h] = 0.03; // vestigial even partials
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

// ─── Synth engine ────────────────────────────────────────────────────────────
interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class BpSynth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private wave: PeriodicWave;
  private voices = new Map<number, Voice>();
  private disposed = false;

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();
    this.wave = makeOddWave(this.ctx);

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;

    // gentle low-pass keeps the bright odd partials from getting harsh
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    filter.Q.value = 0.4;

    this.master.connect(filter);
    filter.connect(this.ctx.destination);
  }

  async resume(): Promise<void> {
    if (this.disposed) return;
    if (this.ctx.state !== "running") await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.9, now, 0.05);
  }

  noteOn(step: number, base: number, velocity = 0.85): void {
    if (this.disposed) return;
    if (this.voices.has(step)) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq(base, step);

    const gain = this.ctx.createGain();
    const peak = 0.16 * velocity;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.012); // attack
    gain.gain.setTargetAtTime(peak * 0.7, now + 0.012, 0.35); // decay→sustain

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);

    this.voices.set(step, { osc, gain });
  }

  noteOff(step: number): void {
    if (this.disposed) return;
    const v = this.voices.get(step);
    if (!v) return;
    const now = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18); // release
    v.osc.stop(now + 0.22);
    this.voices.delete(step);
  }

  activeSteps(): number[] {
    return [...this.voices.keys()];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const now = this.ctx.currentTime;
    for (const v of this.voices.values()) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.osc.stop(now + 0.05);
      } catch {
        /* already stopped */
      }
    }
    this.voices.clear();
    this.ctx.close().catch(() => {
      /* context already closing */
    });
  }
}
