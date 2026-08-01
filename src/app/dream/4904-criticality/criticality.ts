// ─────────────────────────────────────────────────────────────────────────────
// 4904-criticality — criticality.ts
//
// The CPU-side phase-transition state model. A single scalar "pressure" (the
// control parameter, driven by the user's voice) is pushed toward and past a
// critical point. Around that point an order parameter collapses and a
// correlation-length bloom ("critical opalescence") diverges — the numbers that
// the fullscreen shader and the additive drone both read to render the crossing.
//
// This renders the MECHANISM described in:
//   • Timmerman, Aqil et al., "DMT-induced shifts in criticality correlate with
//     ego-dissolution" (bioRxiv 2025.02.08.636868). DMT collapses posterior
//     alpha and pushes cortex past its slightly-subcritical operating point into
//     a more entropic/near-critical regime; the size of that shift tracks rated
//     ego-dissolution.
//   • Carhart-Harris et al., The Entropic Brain (2014); Carhart-Harris &
//     Friston, REBUS (2019).
//
// It is a metaphor made literal, NOT a claim that the brain is this exact
// mean-field system.
//
// DETERMINISM: no Math.random / Date.now / new Date anywhere. Randomness comes
// from a seeded mulberry32(0x4904); timing comes from the caller's
// performance.now()-derived dt.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG — deterministic, replay-safe. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The critical pressure. The field sits ordered below it and dissolves across
 *  it. Placed above the resting point so silence keeps a coherent "self". */
export const P_CRIT = 0.62;

/** A snapshot of the field state for a single frame. All fields are 0..1. */
export interface CriticalitySnapshot {
  /** Control parameter (the voice-driven "pressure"). Critical at P_CRIT. */
  pressure: number;
  /** Order parameter: 1 = coherent long-range "self", 0 = fully dissolved. */
  order: number;
  /** Entropy of the field: ~1 - order. Drives turbulence + audio noise floor. */
  entropy: number;
  /** Correlation-length / critical-opalescence bloom. Peaks AT the crossing. */
  crit: number;
  /** How far past the critical point (0 below, →1 deep supercritical). */
  spread: number;
}

/**
 * The phase-transition integrator. Feed it a raw voice drive (0..1) each frame;
 * it produces smoothed, physically-plausible order/entropy/crit values with the
 * asymmetric attack/release that makes the "self" re-form slowly in silence.
 */
export class CriticalityCore {
  private pressure = 0.03;
  private orderState = 1;
  private rng: () => number;

  // Asymmetric time constants (seconds): voice builds pressure faster than
  // silence releases it, so dissolution feels earned and re-cohesion feels slow.
  private readonly tauAttack = 0.85;
  private readonly tauRelease = 2.6;
  // Inertia on the order parameter — a little hysteresis around the transition.
  private readonly tauOrder = 0.5;

  constructor(seed = 0x4904) {
    this.rng = mulberry32(seed);
  }

  /** Current raw pressure (for readouts). */
  get currentPressure(): number {
    return this.pressure;
  }

  private static orderTarget(p: number): number {
    if (p >= P_CRIT) return 0;
    // Mean-field-flavoured: order ~ ((Pc - p)/Pc)^b. 1 at rest, 0 at crossing.
    return Math.pow((P_CRIT - p) / P_CRIT, 0.55);
  }

  /**
   * Advance the state by dt seconds toward the given raw voice drive.
   * @param dt    elapsed seconds since last update (from performance.now()).
   * @param drive raw voice pressure 0..1 (mic RMS/low-band or scripted demo).
   */
  update(dt: number, drive: number): CriticalitySnapshot {
    const step = Math.max(0, Math.min(0.1, dt)); // clamp huge tab-switch gaps
    const target = Math.max(0, Math.min(1, drive));

    // Asymmetric one-pole toward the drive.
    const tau = target > this.pressure ? this.tauAttack : this.tauRelease;
    const kP = 1 - Math.exp(-step / tau);
    this.pressure += (target - this.pressure) * kP;

    const p = this.pressure;

    // Correlation-length bloom: a Gaussian in |p - Pc|, diverging at the edge.
    const sigma = 0.09;
    const d = p - P_CRIT;
    const crit = Math.exp(-(d * d) / (2 * sigma * sigma));

    // Order relaxes toward its target with a little inertia.
    const oTarget = CriticalityCore.orderTarget(p);
    const kO = 1 - Math.exp(-step / this.tauOrder);
    this.orderState += (oTarget - this.orderState) * kO;

    // Critical fluctuations: seeded shimmer that swells right at the edge.
    const shimmer = (this.rng() - 0.5) * crit * 0.04;
    const order = Math.max(0, Math.min(1, this.orderState + shimmer));

    const spread = Math.max(0, Math.min(1, (p - P_CRIT) / (1 - P_CRIT)));
    const entropy = Math.max(0, Math.min(1, 1 - order));

    return { pressure: p, order, entropy, crit, spread };
  }
}

/** A named phase for the on-screen readout. */
export function phaseName(s: CriticalitySnapshot): string {
  if (s.pressure < P_CRIT - 0.14) return "coherent · self intact";
  if (s.pressure <= P_CRIT + 0.08) return "CRITICAL · the crossing";
  return "dissolved · boundless field";
}

// ── Seeded auto-demo ─────────────────────────────────────────────────────────
// A scripted voice envelope so the piece self-plays and self-paints with zero
// interaction: a coherent self is visible immediately, then a sustained "voice"
// builds, crosses criticality into boundless entropy, and finally releases so
// the self re-forms. Loops. Deterministic (a pure function of elapsed seconds).

const DEMO_PERIOD = 17;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Scripted drive 0..1 at elapsed time `tSec`. Loops every DEMO_PERIOD. */
export function demoDrive(tSec: number): number {
  const t = ((tSec % DEMO_PERIOD) + DEMO_PERIOD) % DEMO_PERIOD;
  let base: number;
  if (t < 2.4) {
    // coherent self, resting — visible from the first frame
    base = 0.04;
  } else if (t < 6.6) {
    // the voice rises and crosses the critical point
    base = 0.04 + smoothstep(2.4, 6.6, t) * 0.9;
  } else if (t < 9.6) {
    // sustained past criticality — boundless dissolution
    base = 0.94;
  } else if (t < 10.8) {
    // hover back at the edge
    base = 0.94 - smoothstep(9.6, 10.8, t) * 0.42;
  } else {
    // release into silence — the self slowly re-forms
    base = 0.52 - smoothstep(10.8, 16.6, t) * 0.49;
  }
  // Deterministic breath tremor (no PRNG needed for replay-stable timing).
  const tremor = 0.02 * Math.sin(t * 5.3) + 0.012 * Math.sin(t * 11.7 + 1.1);
  return Math.max(0, Math.min(1, base + tremor * (base > 0.1 ? 1 : 0.3)));
}
