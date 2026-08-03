// ─────────────────────────────────────────────────────────────────────────
// Breath — slow broadband-envelope extraction + guided-pace entrainment.
//
// We do NOT do pitch or onset detection. We track the SWELL of broadband
// amplitude (the rise and fall as you inhale/exhale or sustain a hum) with a
// one-pole smoother over ~0.7 s, then adaptively normalise it against a slow
// running floor/ceiling so any mic gain maps to a clean 0..1 breath level.
//
// The pacer is a target LFO whose PERIOD slowly lengthens over the session —
// from ~5 s toward ~10 s per cycle — gently entraining the breather toward the
// ~6 breaths-per-minute / 0.1 Hz "resonance frequency" of coherent breathing.
// ─────────────────────────────────────────────────────────────────────────

export type BreathState = {
  level: number; // 0..1 smoothed, adaptively-normalised breath level (the tide)
  raw: number; // 0..1 raw normalised (pre final smoothing), for debugging
  target: number; // 0..1 guided pace phase (0 = full exhale, 1 = peak inhale)
  targetPeriod: number; // current guided breath period, seconds
  phase: "inhale" | "exhale"; // where the guide currently is
  minutes: number; // elapsed session minutes
};

const START_PERIOD = 5.0; // seconds per full breath at session start
const END_PERIOD = 10.0; // seconds per full breath once fully settled
const DEEPEN_SECONDS = 150; // ~2.5 min to travel from start to end period

// One-pole smoothing coefficient for a given time-constant (seconds) at dt.
function poleCoef(tauSeconds: number, dt: number): number {
  if (tauSeconds <= 0) return 1;
  return 1 - Math.exp(-dt / tauSeconds);
}

export class BreathTracker {
  // Smoothed RMS envelope (tracks breath, not transients).
  private env = 0;
  // Slow adaptive floor / ceiling for normalisation.
  private floor = 1e-4;
  private ceil = 1e-3;
  // Final smoothed, normalised level.
  private level = 0;
  private lastRaw = 0;
  // Elapsed time and pacer phase accumulator.
  private elapsed = 0;
  private pacePhase = 0; // 0..1 saw that we shape into a raised-cosine

  reset() {
    this.env = 0;
    this.floor = 1e-4;
    this.ceil = 1e-3;
    this.level = 0;
    this.lastRaw = 0;
    this.elapsed = 0;
    this.pacePhase = 0;
  }

  // Current guided period, seconds (lengthens over the session).
  private currentPeriod(): number {
    const t = Math.min(1, this.elapsed / DEEPEN_SECONDS);
    // smootherstep for an unhurried settling
    const s = t * t * t * (t * (t * 6 - 15) + 10);
    return START_PERIOD + (END_PERIOD - START_PERIOD) * s;
  }

  // Feed a fresh RMS reading (>=0) and advance the pacer by dt seconds.
  // If rms is null we are in auto-breathe mode: the "breath" simply follows the
  // guide LFO so the whole instrument still works and is beautiful.
  update(rms: number | null, dt: number): BreathState {
    this.elapsed += dt;
    const period = this.currentPeriod();

    // Advance the guide LFO.
    this.pacePhase += dt / period;
    this.pacePhase -= Math.floor(this.pacePhase);
    // Raised cosine: 0 at exhale bottom, 1 at inhale peak. A slightly longer
    // exhale feels calmer, so we skew the phase gently toward exhale.
    const skewed = this.skew(this.pacePhase, 0.45); // <0.5 => longer exhale
    const target = 0.5 - 0.5 * Math.cos(skewed * Math.PI * 2);
    const phase: "inhale" | "exhale" = skewed < 0.5 ? "inhale" : "exhale";

    if (rms == null) {
      // Auto-breathe: the sea breathes on its own, following the guide with a
      // touch of organic drift so it never feels metronomic.
      const drift =
        0.04 * Math.sin(this.elapsed * 0.21) + 0.02 * Math.sin(this.elapsed * 0.07);
      const lvl = Math.max(0, Math.min(1, target * 0.96 + 0.02 + drift * target));
      this.level += (lvl - this.level) * poleCoef(0.35, dt);
      this.lastRaw = lvl;
      return {
        level: this.level,
        raw: lvl,
        target,
        targetPeriod: period,
        phase,
        minutes: this.elapsed / 60,
      };
    }

    // Envelope follower over ~0.7 s so we ride the breath swell, not syllables.
    this.env += (rms - this.env) * poleCoef(0.7, dt);

    // Adaptive floor/ceiling. Floor tracks the quiet baseline quickly-down /
    // slowly-up; ceiling tracks peaks quickly-up / slowly-down. This lets any
    // mic level self-calibrate within a couple of breaths.
    if (this.env < this.floor) this.floor += (this.env - this.floor) * poleCoef(1.5, dt);
    else this.floor += (this.env - this.floor) * poleCoef(12, dt);
    if (this.env > this.ceil) this.ceil += (this.env - this.ceil) * poleCoef(0.8, dt);
    else this.ceil += (this.env - this.ceil) * poleCoef(9, dt);

    const span = Math.max(this.ceil - this.floor, 1e-4);
    let raw = (this.env - this.floor) / span;
    raw = Math.max(0, Math.min(1, raw));
    // Gentle gamma so quiet breathing still lifts the tide meaningfully.
    raw = Math.pow(raw, 0.8);
    this.lastRaw = raw;

    // Final smoothing (~0.4 s) for a liquid, non-jittery sea line.
    this.level += (raw - this.level) * poleCoef(0.4, dt);

    return {
      level: this.level,
      raw,
      target,
      targetPeriod: period,
      phase,
      minutes: this.elapsed / 60,
    };
  }

  // Warp a 0..1 phase so the crossing point (inhale->exhale) sits at `mid`.
  private skew(p: number, mid: number): number {
    if (p < mid) return (p / mid) * 0.5;
    return 0.5 + ((p - mid) / (1 - mid)) * 0.5;
  }
}

// Compute broadband RMS from a time-domain buffer (values ~ -1..1).
export function rmsOf(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
