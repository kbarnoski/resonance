// ─────────────────────────────────────────────────────────────────────────────
// kuramoto.ts — a TWO-population coupled-oscillator society (Kuramoto, 1975)
// integrated with INERTIA (the second-order Kuramoto model), which is what gives
// the field a MEMORY that can disagree with fresh input: once the crowd locks it
// resists breaking, and once it fractures it resists re-forming (hysteresis /
// bistability). The Kuramoto order parameter r = |mean(e^{iθ})| is computed as a
// READOUT of the argument between the two sub-populations — never set directly.
//
//   dθᵢ/dt = vᵢ
//   m·dvᵢ/dt = ωᵢ − vᵢ + (K_intra/N)Σ_{self}sin(θⱼ−θᵢ) + (K_inter/N)Σ_{other}sin(θⱼ−θᵢ)
//
// For the block (two-community) mean field the double sum collapses to each
// community's centroid, so the whole step is O(N).
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic seedable PRNG so the autopilot / initial field are reproducible. */
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

/** Box–Muller normal from a uniform generator. */
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── model constants (tuned for a visibly "arguing" field) ──────────────────────
const SUBSTEPS = 3; // integration substeps per frame
const DT = 0.022; // substep timestep
const GLOBAL_DRIFT = 1.05; // shared rotation so the whole ring spins
const OMEGA_STD = 0.42; // within-population natural-frequency spread
const GAP_BASE = 0.1; // minimum separation of the two population centres
const GAP_RANGE = 1.35; // extra separation the "widen the gap" gesture can add
const K_INTRA = 2.35; // each community's pull toward its OWN internal sync
const INERTIA = 1.7; // m — the mass that creates hysteresis / memory
const LOCK_BONUS = 1.4; // extra intra-coupling the "lock memory" adds when synced

export interface SocietyParams {
  /** Inter-population coupling target (one of the two fighting gestures). 0..~3.5 */
  couplingInter: number;
  /** Frequency-gap target (the other fighting gesture). 0..1 */
  gap: number;
}

export interface SocietyReadout {
  rGlobal: number;
  psiGlobal: number;
  rA: number;
  psiA: number;
  rB: number;
  psiB: number;
  lockMemory: number;
  meanSpeed: number;
}

export class PhaseSociety {
  readonly n: number;
  readonly nA: number;
  readonly nB: number;
  readonly theta: Float32Array;
  readonly vel: Float32Array;
  readonly pop: Uint8Array; // 0 = slow community A, 1 = fast community B
  readonly radius: Float32Array; // fixed layout radius per oscillator (for the ring viz)
  private readonly omega0: Float32Array; // natural-frequency offset within its community
  private readonly rng: () => number;

  // effective (lagged) parameters — the low-pass on the target is itself a memory
  private couplingEff = 0.2;
  private gapEff = 0.5;
  private lockMem = 0; // bistable regime memory (deadband integrator)

  readout: SocietyReadout = {
    rGlobal: 0,
    psiGlobal: 0,
    rA: 0,
    psiA: 0,
    rB: 0,
    psiB: 0,
    lockMemory: 0,
    meanSpeed: GLOBAL_DRIFT,
  };

  constructor(n = 320, seed = 0x51ee7) {
    this.n = n;
    this.nA = Math.floor(n / 2);
    this.nB = n - this.nA;
    this.theta = new Float32Array(n);
    this.vel = new Float32Array(n);
    this.pop = new Uint8Array(n);
    this.radius = new Float32Array(n);
    this.omega0 = new Float32Array(n);
    this.rng = mulberry32(seed);

    for (let i = 0; i < n; i++) {
      const isA = i < this.nA;
      this.pop[i] = isA ? 0 : 1;
      this.theta[i] = this.rng() * Math.PI * 2;
      this.vel[i] = GLOBAL_DRIFT;
      this.omega0[i] = OMEGA_STD * gauss(this.rng);
      // community A occupies an inner ring band, B an outer band — visually distinct
      this.radius[i] = isA
        ? 0.5 + this.rng() * 0.16
        : 0.78 + this.rng() * 0.17;
    }
  }

  /** Scramble the phases of one community — a shock the field must recover from. */
  shock(which: 0 | 1): void {
    for (let i = 0; i < this.n; i++) {
      if (this.pop[i] === which) {
        this.theta[i] = this.rng() * Math.PI * 2;
        this.vel[i] = GLOBAL_DRIFT + gauss(this.rng) * 0.6;
      }
    }
  }

  /**
   * Advance the society. `dtScale` is a clamped frame-time multiplier so the
   * dynamics run at a steady pace regardless of frame rate. `params` are the
   * user/autopilot TARGETS — they are low-passed here, so the field's own state
   * always lags and can contradict a sudden gesture.
   */
  step(dtScale: number, params: SocietyParams): void {
    // low-pass the targets: this lag is the first layer of "memory that disagrees"
    const follow = Math.min(1, 0.06 * dtScale);
    this.couplingEff += (params.couplingInter - this.couplingEff) * follow;
    this.gapEff += (params.gap - this.gapEff) * follow;

    const n = this.n;
    const nA = this.nA;
    const nB = this.nB;
    const fracA = nA / n;
    const fracB = nB / n;
    const gapTerm = GAP_BASE + this.gapEff * GAP_RANGE;
    const kInterEff = this.couplingEff;
    const kIntraEff = K_INTRA + this.lockMem * LOCK_BONUS; // hysteretic self-pull

    const dt = DT * Math.min(2.5, Math.max(0.25, dtScale));

    let rGlobal = 0;
    let psiGlobal = 0;
    let rA = 0;
    let psiA = 0;
    let rB = 0;
    let psiB = 0;

    for (let s = 0; s < SUBSTEPS; s++) {
      // community centroids
      let cA = 0;
      let sA = 0;
      let cB = 0;
      let sB = 0;
      for (let i = 0; i < n; i++) {
        const th = this.theta[i];
        if (this.pop[i] === 0) {
          cA += Math.cos(th);
          sA += Math.sin(th);
        } else {
          cB += Math.cos(th);
          sB += Math.sin(th);
        }
      }
      cA /= nA;
      sA /= nA;
      cB /= nB;
      sB /= nB;
      rA = Math.hypot(cA, sA);
      psiA = Math.atan2(sA, cA);
      rB = Math.hypot(cB, sB);
      psiB = Math.atan2(sB, cB);

      // integrate every oscillator against its own + the rival community's centroid
      for (let i = 0; i < n; i++) {
        const th = this.theta[i];
        const isA = this.pop[i] === 0;
        const rSelf = isA ? rA : rB;
        const psiSelf = isA ? psiA : psiB;
        const rOther = isA ? rB : rA;
        const psiOther = isA ? psiB : psiA;
        const fracSelf = isA ? fracA : fracB;
        const fracOther = isA ? fracB : fracA;
        const centre = isA ? -1 : 1;

        const omega = GLOBAL_DRIFT + centre * gapTerm + this.omega0[i];
        const coup =
          kIntraEff * fracSelf * rSelf * Math.sin(psiSelf - th) +
          kInterEff * fracOther * rOther * Math.sin(psiOther - th);

        // second-order (inertial) update — the mass m is the hysteresis
        const v = this.vel[i] + (dt / INERTIA) * (omega - this.vel[i] + coup);
        this.vel[i] = v;
        let nth = th + dt * v;
        // wrap
        if (nth > Math.PI) nth -= Math.PI * 2;
        else if (nth < -Math.PI) nth += Math.PI * 2;
        this.theta[i] = nth;
      }
    }

    // global order parameter — a pure READOUT of the two arguing communities
    let cG = 0;
    let sG = 0;
    let speed = 0;
    for (let i = 0; i < n; i++) {
      cG += Math.cos(this.theta[i]);
      sG += Math.sin(this.theta[i]);
      speed += this.vel[i];
    }
    cG /= n;
    sG /= n;
    rGlobal = Math.hypot(cG, sG);
    psiGlobal = Math.atan2(sG, cG);
    speed /= n;

    // bistable "lock memory": integrates toward locked/unlocked with a DEADBAND in
    // between where it simply HOLDS — so mid-transition the memory disagrees with
    // whatever the user is currently doing.
    const mrate = Math.min(1, 0.025 * dtScale);
    if (rGlobal > 0.62) this.lockMem += (1 - this.lockMem) * mrate;
    else if (rGlobal < 0.4) this.lockMem += (0 - this.lockMem) * mrate;
    // else: hold (deadband)

    this.readout.rGlobal = rGlobal;
    this.readout.psiGlobal = psiGlobal;
    this.readout.rA = rA;
    this.readout.psiA = psiA;
    this.readout.rB = rB;
    this.readout.psiB = psiB;
    this.readout.lockMemory = this.lockMem;
    this.readout.meanSpeed = speed;
  }
}
