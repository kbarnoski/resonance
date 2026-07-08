// 1278-faraday-relief — faraday.ts
//
// A parametric-Faraday instability, solved as a slow-envelope AMPLITUDE
// equation (not Navier–Stokes). Six standing-wave modes share one wavenumber k
// but sit at six orientations (0°,30°,60°,90°,120°,150°). Each mode is a
// Mathieu (parametric) oscillator whose slow envelope A_j grows above a
// threshold and saturates through cubic self- and cross-coupling, so the modes
// COMPETE for the surface:
//
//   dA_j/dt = A_j·(σ_j − A_j² − c·Σ_{m≠j} A_m²) + ν·w_j
//   σ_j     = g · w_j ,     g = kGrow·(ε − ε_c)
//
// The drive amplitude ε gates everything: ε < ε_c ⇒ g < 0 ⇒ every A_j decays
// and the surface flattens; ε > ε_c ⇒ the weighted modes rise and lock. The
// drive frequency f selects BOTH the wavenumber k (finer ripples as f climbs)
// AND the symmetry, through the weight vector w_j:
//
//   stripes  [1,0,0,0,0,0]   square [1,0,0,1,0,0]
//   hexagon  [1,0,1,0,1,0]   quasicrystal (12-fold) [1,1,1,1,1,1]
//
// The real surface is the sum of the six plane waves:
//   h(x,y) = Σ_j A_j·cos( k·(x·cosθ_j + y·sinθ_j) + φ_j )
//
// Determinism: all randomness comes from a seeded mulberry32 PRNG (phases +
// their slow drift only — the amplitudes are never perturbed, so the active
// modes stay balanced and the prescribed symmetry holds). No top-level
// Math.random(). Cubic saturation caps A_j by construction (bounded).

export const MODE_COUNT = 6;

const THETA_DEG = [0, 30, 60, 90, 120, 150];
export const COS_THETA: number[] = THETA_DEG.map((d) => Math.cos((d * Math.PI) / 180));
export const SIN_THETA: number[] = THETA_DEG.map((d) => Math.sin((d * Math.PI) / 180));

export type SymmetryName = "flat" | "stripes" | "square" | "hexagon" | "quasicrystal";
export type ActiveSymmetry = Exclude<SymmetryName, "flat">;

export const SYMMETRY_WEIGHTS: Record<ActiveSymmetry, number[]> = {
  stripes: [1, 0, 0, 0, 0, 0],
  square: [1, 0, 0, 1, 0, 0],
  hexagon: [1, 0, 1, 0, 1, 0],
  quasicrystal: [1, 1, 1, 1, 1, 1],
};

export const SYMMETRY_LABEL: Record<ActiveSymmetry, string> = {
  stripes: "STRIPES",
  square: "SQUARE",
  hexagon: "HEXAGON",
  quasicrystal: "12-FOLD QUASICRYSTAL",
};

// Drive range — musical, f/2 lands in a rich sub register (55–220 Hz).
export const F_MIN = 110;
export const F_MAX = 440;
export const EPS_MIN = 0.05;
export const EPS_MAX = 0.95;
// Wavenumber over the (12-unit) plane: a few → many wavelengths across.
const K_MIN = 1.55;
const K_MAX = 4.15;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FaradayConfig {
  epsC?: number;
  kGrow?: number;
  cCross?: number;
  seed?: number;
}

export interface FaradayState {
  A: number[];
  phi: number[];
  phiRate: number[];
  w: number[];
  k: number;
  eps: number;
  f: number;
  symmetry: ActiveSymmetry;
  readonly epsC: number;
  readonly kGrow: number;
  readonly cCross: number;
  readonly nucleation: number;
  readonly rnd: () => number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function symmetryForF(f: number): ActiveSymmetry {
  const t = clamp((f - F_MIN) / (F_MAX - F_MIN), 0, 1);
  if (t < 0.25) return "stripes";
  if (t < 0.5) return "square";
  if (t < 0.75) return "hexagon";
  return "quasicrystal";
}

export function kForF(f: number): number {
  const t = clamp((f - F_MIN) / (F_MAX - F_MIN), 0, 1);
  return K_MIN + t * (K_MAX - K_MIN);
}

/** Frequency at the centre of each symmetry band (for the preset buttons). */
export const PRESET_F: Record<ActiveSymmetry, number> = {
  stripes: F_MIN + 0.125 * (F_MAX - F_MIN),
  square: F_MIN + 0.375 * (F_MAX - F_MIN),
  hexagon: F_MIN + 0.625 * (F_MAX - F_MIN),
  quasicrystal: F_MIN + 0.875 * (F_MAX - F_MIN),
};

export function createFaraday(cfg: FaradayConfig = {}): FaradayState {
  const rnd = mulberry32(cfg.seed ?? 0x1278face);
  const phi: number[] = [];
  const phiRate: number[] = [];
  for (let i = 0; i < MODE_COUNT; i++) {
    phi.push(rnd() * Math.PI * 2);
    phiRate.push((rnd() - 0.5) * 0.14); // slow liquid drift, per-mode
  }
  const f = PRESET_F.square;
  const symmetry = symmetryForF(f);
  return {
    A: new Array(MODE_COUNT).fill(0),
    phi,
    phiRate,
    w: SYMMETRY_WEIGHTS[symmetry].slice(),
    k: kForF(f),
    eps: 0.75,
    f,
    symmetry,
    epsC: cfg.epsC ?? 0.3,
    kGrow: cfg.kGrow ?? 6.0,
    cCross: cfg.cCross ?? 1.3,
    nucleation: 2.2e-3,
    rnd,
  };
}

/** Set the played drive: horizontal → f (symmetry + k), vertical → ε. */
export function setDrive(state: FaradayState, f: number, eps: number): void {
  const nf = clamp(f, F_MIN, F_MAX);
  state.f = nf;
  state.eps = clamp(eps, 0, 1);
  state.k = kForF(nf);
  const sym = symmetryForF(nf);
  if (sym !== state.symmetry) {
    state.symmetry = sym;
    state.w = SYMMETRY_WEIGHTS[sym].slice();
  }
}

/** Drop a ripple: knock every envelope down so the relief collapses + re-forms. */
export function tap(state: FaradayState): void {
  for (let j = 0; j < MODE_COUNT; j++) state.A[j] *= 0.3;
}

/** One forward-Euler step of the amplitude equations. dt ≈ 0.016. Bounded. */
export function step(state: FaradayState, dt: number): void {
  const { A, w, cCross, nucleation } = state;
  const g = state.kGrow * (state.eps - state.epsC);

  let total = 0;
  for (let j = 0; j < MODE_COUNT; j++) total += A[j] * A[j];

  for (let j = 0; j < MODE_COUNT; j++) {
    const aj = A[j];
    const sigma = g * w[j];
    const cross = cCross * (total - aj * aj);
    const dA = aj * (sigma - aj * aj - cross) + nucleation * w[j];
    let next = aj + dA * dt;
    if (next < 0) next = 0;
    if (next > 3) next = 3; // safety clamp; saturation caps well below this
    A[j] = next;
    // Slow phase drift keeps the ridges flowing like a liquid (does NOT touch
    // amplitudes, so the prescribed symmetry stays balanced).
    state.phi[j] += state.phiRate[j] * dt;
  }
}

/** Height field h(x,y) — the sum of ≤6 plane waves. */
export function sampleHeight(state: FaradayState, x: number, y: number): number {
  const { A, phi, k } = state;
  let h = 0;
  for (let j = 0; j < MODE_COUNT; j++) {
    const a = A[j];
    if (a > 1e-4) h += a * Math.cos(k * (x * COS_THETA[j] + y * SIN_THETA[j]) + phi[j]);
  }
  return h;
}

/** Surface energy E = Σ A_j². */
export function energy(state: FaradayState): number {
  let e = 0;
  for (let j = 0; j < MODE_COUNT; j++) e += state.A[j] * state.A[j];
  return e;
}

/** Energy normalised to ~0..1 — brightness / lock indicator. */
export function lockLevel(state: FaradayState): number {
  return clamp(energy(state) / 3.6, 0, 1);
}
