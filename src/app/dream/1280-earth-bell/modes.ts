// 1280-earth-bell — modes.ts
//
// The Earth's free-oscillation NORMAL MODES as a played physical model. After a
// great earthquake the whole planet rings like a bell in its spheroidal modes
// ₙSₗ, each with a real eigenfrequency (fractions of a mHz — periods of tens of
// minutes) and a spherical-harmonic mode SHAPE Yₗᵐ. Here we take a handful of
// the real PREM eigenfrequencies, scale them by a single fixed factor into the
// audible band (ratios preserved), and drive a decaying modal oscillator per
// mode. Striking a point on the globe excites each mode in proportion to the
// value of its mode shape THERE — strike a node and the mode barely rings;
// strike an antinode and it sings. This module is the single source of truth
// for the mode state (envelopes); geometry-specific shape sampling lives in the
// scene / fallback, but both call the SAME realSH() defined here so what you
// see and what you hear stay locked together.
//
// Frequencies (fundamental spheroidal modes ₀Sₗ + a couple of radial overtones
// ₙSₗ), in mHz, are standard PREM values — see README for references.

export interface ModeDef {
  /** e.g. "0S2" — the spheroidal mode ₙSₗ. */
  id: string;
  /** Angular degree l (the spherical-harmonic degree of the mode shape). */
  l: number;
  /** Representative azimuthal order m we render for this mode (see README). */
  m: number;
  /** Real eigenfrequency in mHz (PREM, approximate). */
  mHz: number;
  /** Modal decay time-constant in seconds (bell-like long tail; ~ mode Q). */
  tau: number;
  /** Short human label. */
  label: string;
  /** Mode-shape description shown in the UI. */
  shape: string;
}

// A single fixed factor maps the real mHz eigenfrequencies into the audible
// band while preserving every interval ratio, so the struck chord IS the real
// mode spectrum, just transposed up ~6 octaves.
export const AUDIO_SCALE = 315; // audible Hz per mHz  (₀S₂ → ~97 Hz)
// A second fixed factor maps the same mHz values to a VISIBLE oscillation rate
// (the real ~hour periods are far too slow to watch), ratios again preserved.
export const VIS_SCALE = 0.42; // visible Hz per mHz  (₀S₂ → ~0.13 Hz)

export const MODES: ModeDef[] = [
  { id: "0S2", l: 2, m: 0, mHz: 0.30928, tau: 27, label: "₀S₂", shape: "football (rugby prolate/oblate)" },
  { id: "0S0", l: 0, m: 0, mHz: 0.81433, tau: 24, label: "₀S₀", shape: "radial breathing (whole sphere)" },
  { id: "0S3", l: 3, m: 2, mHz: 0.46856, tau: 22, label: "₀S₃", shape: "degree-3 rosette" },
  { id: "0S4", l: 4, m: 4, mHz: 0.64698, tau: 19, label: "₀S₄", shape: "8-lobe sectoral petals" },
  { id: "0S5", l: 5, m: 3, mHz: 0.84042, tau: 17, label: "₀S₅", shape: "degree-5 tesseral" },
  { id: "0S6", l: 6, m: 6, mHz: 1.03824, tau: 15, label: "₀S₆", shape: "12-lobe sectoral crown" },
  { id: "1S2", l: 2, m: 2, mHz: 0.67998, tau: 17, label: "₁S₂", shape: "degree-2 overtone (n=1)" },
  { id: "1S3", l: 3, m: 0, mHz: 0.93980, tau: 15, label: "₁S₃", shape: "degree-3 overtone (n=1)" },
];

export const MODE_COUNT = MODES.length;

export function modeAudioHz(d: ModeDef): number {
  return d.mHz * AUDIO_SCALE;
}
export function modeVisHz(d: ModeDef): number {
  return d.mHz * VIS_SCALE;
}

// ── Real spherical harmonics (mode shapes) ─────────────────────────────────
// Associated Legendre function P_l^m(x), m ≥ 0, standard upward recurrence.
function assocLegendre(l: number, m: number, x: number): number {
  let pmm = 1;
  if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    let fact = 1;
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2;
      fact += 2;
    }
  }
  if (l === m) return pmm;
  let pmmp1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pmmp1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

/**
 * Real spherical harmonic of degree l, order m (un-normalised by design — the
 * caller divides by the mode's peak, MODE_MAX_ABS, to get a value in [-1,1]).
 * theta = polar angle from +Y in [0,π]; phi = azimuth around +Y.
 */
export function realSH(l: number, m: number, theta: number, phi: number): number {
  const x = Math.cos(theta);
  const am = Math.abs(m);
  const p = assocLegendre(l, am, x);
  if (m > 0) return Math.cos(am * phi) * p;
  if (m < 0) return Math.sin(am * phi) * p;
  return p;
}

// Peak |Y| of each mode, sampled once so shape values and strike excitation
// can be normalised to [-1,1] / [0,1] consistently.
export const MODE_MAX_ABS: number[] = MODES.map((d) => {
  let mx = 1e-6;
  const NT = 90;
  const NP = 180;
  for (let it = 0; it <= NT; it++) {
    const theta = (it / NT) * Math.PI;
    for (let ip = 0; ip < NP; ip++) {
      const phi = (ip / NP) * 2 * Math.PI;
      const v = Math.abs(realSH(d.l, d.m, theta, phi));
      if (v > mx) mx = v;
    }
  }
  return mx;
});

/** Normalised mode shape at a unit direction — value in [-1,1]. */
export function shapeAt(modeIndex: number, dir: [number, number, number]): number {
  const d = MODES[modeIndex];
  const theta = Math.acos(Math.max(-1, Math.min(1, dir[1])));
  const phi = Math.atan2(dir[2], dir[0]);
  return realSH(d.l, d.m, theta, phi) / MODE_MAX_ABS[modeIndex];
}

// ── The live mode state ────────────────────────────────────────────────────
export interface ModeModel {
  /** Current envelope amplitude of each mode (0 at rest, jumps on strike). */
  env: Float32Array;
  /** Whether each mode is allowed to ring (UI solo/mute). */
  enabled: boolean[];
  /** Global clock in seconds (drives the visible oscillation phase). */
  t: number;
}

export function createModeModel(): ModeModel {
  return {
    env: new Float32Array(MODE_COUNT),
    enabled: MODES.map(() => true),
    t: 0,
  };
}

/**
 * STRIKE the planet at a unit direction (a "virtual great earthquake"). Each
 * enabled mode gains energy in proportion to |mode shape| at the strike point —
 * a node contributes ~0, an antinode the full strength. Returns the per-mode
 * excitation actually applied (for the visual ping / audio impact).
 */
export function strikeModel(
  model: ModeModel,
  dir: [number, number, number],
  strength: number,
): number {
  let total = 0;
  for (let i = 0; i < MODE_COUNT; i++) {
    if (!model.enabled[i]) continue;
    const exc = Math.abs(shapeAt(i, dir)); // 0 at a node, 1 at an antinode
    model.env[i] = Math.min(1.3, model.env[i] + strength * exc);
    total += strength * exc;
  }
  return total;
}

/** Advance the modal envelopes: bell-like exponential decay; muted modes fade fast. */
export function decayModel(model: ModeModel, dt: number): void {
  model.t += dt;
  for (let i = 0; i < MODE_COUNT; i++) {
    const tau = model.enabled[i] ? MODES[i].tau : 0.5;
    model.env[i] *= Math.exp(-dt / tau);
    if (model.env[i] < 1e-4) model.env[i] = 0;
  }
}

/** Sum of all mode envelopes, normalised roughly to [0,1] for drive/brightness. */
export function totalEnergy(model: ModeModel): number {
  let s = 0;
  for (let i = 0; i < MODE_COUNT; i++) s += model.env[i];
  return Math.min(1, s / 2.5);
}
