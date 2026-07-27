// ─────────────────────────────────────────────────────────────────────────────
// 3056 · clearlight — breath.ts
//
// The instrument is the breath. This module turns a raw microphone amplitude
// (or, with no mic, a seeded synthetic breath) into ONE calm scalar the whole
// piece is driven by, plus a slowly-accumulating "calm" that gates the
// form-constants and a rough breaths-per-minute readout.
//
//   • BreathFollower  — a self-scaling amplitude follower: fast attack, slow
//     release, with a running normalizer so it adapts to any mic / room level.
//     It never reads pitch or an FFT tone — only the slow breathing envelope.
//   • makeSyntheticBreath — a deterministic ~5.5-breaths/min sine (seeded with
//     mulberry32) so the piece fully self-demos when no mic is granted.
//   • mulberry32 — the tiny deterministic RNG (implemented inline, no deps).
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 32-bit RNG. Same seed → same stream, forever. */
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

export interface BreathSample {
  /** Self-scaled slow breathing envelope, 0..1 (swells on inhale). */
  breath: number;
  /** Sustained-calm accumulator, 0..1. Rises over ~60–90 s of slow, steady
   *  breathing; falls fast when the breath turns agitated. */
  calm: number;
  /** Instantaneous agitation (rate of change of the envelope), 0..1. */
  agitation: number;
  /** Rough estimated breaths-per-minute (smoothed; readout only). */
  bpm: number;
}

/**
 * A self-scaling breath-amplitude follower. Feed it an RMS-ish level and a dt;
 * it returns the mapped breath scalar plus the derived calm / agitation / bpm.
 */
export class BreathFollower {
  private env = 0; // smoothed level (fast attack, slow release)
  private norm = 0.04; // adaptive normalizer (recent peak)
  private breath = 0;
  private prevBreath = 0;
  private calm = 0;
  private bpm = 5.5;
  private rising = false; // inside an inhale peak?
  private lastPeakT = -1;
  private clock = 0;

  update(rms: number, dt: number): BreathSample {
    const step = Math.min(0.1, Math.max(1e-3, dt));
    this.clock += step;

    const level = Math.max(0, rms);
    // Fast attack (~0.22 s) so a breath swells promptly; slow release (~2.2 s)
    // so the field softens gently on the exhale rather than snapping shut.
    const atk = 1 - Math.exp(-step / 0.22);
    const rel = 1 - Math.exp(-step / 2.2);
    const k = level > this.env ? atk : rel;
    this.env += (level - this.env) * k;

    // Self-scaling: the normalizer tracks recent peaks and decays slowly, so a
    // quiet mic and a loud one both resolve to a full 0..1 swing.
    const decay = Math.exp(-step / 14);
    this.norm = Math.max(this.env, this.norm * decay, 0.02);
    const floor = 0.006;
    const b = Math.min(
      1,
      Math.max(0, (this.env - floor) / (this.norm - floor + 1e-6)),
    );

    this.prevBreath = this.breath;
    this.breath = b;

    // Agitation = how fast the envelope is moving. Slow, deep breaths → low.
    const speed = Math.abs(this.breath - this.prevBreath) / step;
    const agitation = Math.min(1, speed / 1.6);

    // Calm rises only when there is actual (steady) breathing; it climbs on a
    // ~34 s time-constant so it takes a sustained minute-plus to bloom, and
    // falls on a ~4.5 s constant so agitation scatters it quickly.
    const presence = Math.min(1, this.breath * 1.8);
    const calmNow = presence * (1 - agitation);
    const ck =
      calmNow > this.calm
        ? 1 - Math.exp(-step / 34)
        : 1 - Math.exp(-step / 4.5);
    this.calm += (calmNow - this.calm) * ck;
    this.calm = Math.min(1, Math.max(0, this.calm));

    // Rough bpm via inhale-peak detection with hysteresis.
    if (!this.rising && this.breath > 0.62) {
      this.rising = true;
      if (this.lastPeakT >= 0) {
        const period = this.clock - this.lastPeakT;
        if (period > 1.5 && period < 20) {
          const inst = 60 / period;
          this.bpm += (inst - this.bpm) * 0.4;
        }
      }
      this.lastPeakT = this.clock;
    } else if (this.rising && this.breath < 0.32) {
      this.rising = false;
    }

    return { breath: this.breath, calm: this.calm, agitation, bpm: this.bpm };
  }
}

/**
 * A deterministic synthetic breath for the no-mic fallback: a ~5.5-breaths/min
 * envelope with a slow seeded wobble so it is organic, not mechanical. Returns
 * a level in roughly [0.05, 1] to feed the follower exactly like a mic RMS.
 */
export function makeSyntheticBreath(seed: number): (dt: number) => number {
  const rnd = mulberry32(seed);
  let phase = rnd() * Math.PI * 2;
  const wobPhase = rnd() * Math.PI * 2;
  let t = 0;
  return (dt: number) => {
    const step = Math.min(0.1, Math.max(1e-3, dt));
    t += step;
    // 5.5 bpm = 0.0917 Hz, with a gentle ±12 % rate drift.
    const rate = 0.0917 * (1 + 0.12 * Math.sin(t * 0.03 + wobPhase));
    phase += rate * step * Math.PI * 2;
    const s = 0.5 + 0.5 * Math.sin(phase);
    const shimmer = 0.03 * (rnd() - 0.5);
    return 0.05 + 0.9 * Math.pow(s, 1.3) + shimmer;
  };
}
