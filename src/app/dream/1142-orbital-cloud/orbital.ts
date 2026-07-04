// ─────────────────────────────────────────────────────────────────────────────
// orbital.ts — genuine hydrogen-atom wavefunction math for the orbital cloud.
//
//   ψ_nlm(r,θ,φ) = R_nl(r) · Y_lm(θ,φ)
//
//   R_nl is the real hydrogenic radial function (associated Laguerre polynomial
//   × exponential), in Bohr-radius units (a0 = 1). The angular part uses the
//   REAL spherical harmonics (real linear combinations of the complex Y_lm),
//   written as solid-harmonic polynomials in the direction cosines so the shapes
//   come out physically correct:
//     l=0 s → sphere · l=1 p → dumbbell · l=2 d → cloverleaf/torus · l=3 f → multi-lobe
//
//   The point cloud is drawn by importance/rejection-sampling |ψ|² · r² over the
//   volume (dV = r² dr dΩ), so point density is the real quantum probability
//   density. Each point also carries the SIGN of ψ (its phase lobe) for colour.
//
//   Spectroscopy: rydbergEnergyEv() is the Rydberg / Bohr formula
//     ΔE = 13.6 eV · (1/n_f² − 1/n_i²)
//   and energyToAudibleHz() folds the Lyman/Balmer/Paschen line energies into an
//   audible register so the atom plays its own emission spectrum.
// ─────────────────────────────────────────────────────────────────────────────

export const RYDBERG_EV = 13.605693; // hydrogen ionisation energy (eV)

export interface OrbitalState {
  n: number; // principal (1..4 here)
  l: number; // azimuthal 0..n-1  (s,p,d,f)
  m: number; // real-harmonic index -l..l (orientation / phase)
}

export const L_LABELS = ["s", "p", "d", "f"] as const;

// ── factorial (tiny inputs: n+l ≤ 7) ────────────────────────────────────────
function factorial(k: number): number {
  let out = 1;
  for (let i = 2; i <= k; i++) out *= i;
  return out;
}

// ── associated Laguerre L_p^α(x) via the stable upward recurrence ────────────
function laguerre(p: number, alpha: number, x: number): number {
  let lPrev = 1; // L_0
  if (p === 0) return lPrev;
  let lCur = 1 + alpha - x; // L_1
  for (let k = 1; k < p; k++) {
    const lNext = ((2 * k + 1 + alpha - x) * lCur - (k + alpha) * lPrev) / (k + 1);
    lPrev = lCur;
    lCur = lNext;
  }
  return lCur;
}

// ── real hydrogenic radial function R_nl(r), a0 = 1 ─────────────────────────
export function radialR(n: number, l: number, r: number): number {
  const rho = (2 * r) / n; // 2r / (n·a0)
  const p = n - l - 1;
  const alpha = 2 * l + 1;
  const norm = Math.sqrt(
    Math.pow(2 / n, 3) * (factorial(n - l - 1) / (2 * n * factorial(n + l))),
  );
  return norm * Math.exp(-rho / 2) * Math.pow(rho, l) * laguerre(p, alpha, rho);
}

// ── real spherical-harmonic angular part, as a polynomial in the unit vector.
//    Returns an unnormalised real value; only its magnitude² (density) and sign
//    (phase) are used, so the constant prefactors are irrelevant. ─────────────
export function angular(l: number, m: number, x: number, y: number, z: number): number {
  switch (l) {
    case 0:
      return 0.2820948; // 1/(2√π) — constant sphere
    case 1:
      // p orbitals: dumbbells along an axis
      if (m === -1) return y;
      if (m === 0) return z;
      return x; // m = +1
    case 2:
      // d orbitals: cloverleaves + the d_z² torus/lobe
      if (m === -2) return x * y; // d_xy
      if (m === -1) return y * z; // d_yz
      if (m === 0) return 3 * z * z - 1; // d_z²   (3z²−r², r=1)
      if (m === 1) return x * z; // d_xz
      return x * x - y * y; // d_x²−y²
    case 3:
    default:
      // f orbitals: 7 multi-lobed shapes
      if (m === -3) return y * (3 * x * x - y * y);
      if (m === -2) return x * y * z;
      if (m === -1) return y * (5 * z * z - 1);
      if (m === 0) return z * (5 * z * z - 3);
      if (m === 1) return x * (5 * z * z - 1);
      if (m === 2) return z * (x * x - y * y);
      return x * (x * x - 3 * y * y); // m = +3
  }
}

export interface CloudSample {
  /** Interleaved xyz positions in Bohr radii, length = count·3. */
  positions: Float32Array;
  /** Phase sign of ψ per point (−1 or +1), length = count. */
  phase: Float32Array;
  /** How many points were actually accepted. */
  count: number;
  /** RMS radius (Bohr) of the accepted cloud — used to auto-frame the view. */
  rms: number;
}

// A small deterministic PRNG so every mount samples the same clouds (headless
// reproducibility, no Math.random surprises in review).
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * Importance-sample the probability cloud of |ψ_nlm|² over the volume.
 * Returns `count` points whose spatial density ∝ |ψ|² and whose phase sign is
 * tagged for colour.
 */
export function sampleCloud(state: OrbitalState, count: number, seed = 0x51ed): CloudSample {
  const { n, l, m } = state;
  const rMax = n * n * 4 + 8; // orbital effectively vanishes beyond this (Bohr)
  const rng = makeRng(seed + n * 101 + l * 17 + (m + 4) * 7);

  // Estimate the peak of the sampling density d = R(r)²·A(dir)²·r² over the
  // domain, so rejection acceptance is well-scaled.
  let dMax = 1e-12;
  const probe = 4000;
  for (let i = 0; i < probe; i++) {
    const r = rng() * rMax;
    // uniform direction on the sphere
    const u = 2 * rng() - 1;
    const ph = 2 * Math.PI * rng();
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const x = s * Math.cos(ph);
    const y = s * Math.sin(ph);
    const zz = u;
    const R = radialR(n, l, r);
    const A = angular(l, m, x, y, zz);
    const d = R * R * A * A * r * r;
    if (d > dMax) dMax = d;
  }
  dMax *= 1.05;

  const positions = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  let accepted = 0;
  let attempts = 0;
  const maxAttempts = count * 400;
  let sumSq = 0;

  while (accepted < count && attempts < maxAttempts) {
    attempts++;
    const r = rng() * rMax;
    const u = 2 * rng() - 1;
    const ph = 2 * Math.PI * rng();
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dx = s * Math.cos(ph);
    const dy = s * Math.sin(ph);
    const dz = u;
    const R = radialR(n, l, r);
    const A = angular(l, m, dx, dy, dz);
    const d = R * R * A * A * r * r;
    if (rng() * dMax < d) {
      const i3 = accepted * 3;
      positions[i3] = dx * r;
      positions[i3 + 1] = dy * r;
      positions[i3 + 2] = dz * r;
      phase[accepted] = R * A >= 0 ? 1 : -1;
      sumSq += r * r;
      accepted++;
    }
  }

  // If rejection under-filled (pathological), pad remaining with the last point.
  for (let i = accepted; i < count; i++) {
    const src = accepted > 0 ? (i % accepted) * 3 : 0;
    positions[i * 3] = positions[src];
    positions[i * 3 + 1] = positions[src + 1];
    positions[i * 3 + 2] = positions[src + 2];
    phase[i] = accepted > 0 ? phase[i % accepted] : 1;
  }

  const rms = Math.sqrt(sumSq / Math.max(1, accepted)) || 1;
  return { positions, phase, count, rms };
}

// ── spectroscopy ────────────────────────────────────────────────────────────

/** Rydberg / Bohr formula: photon energy (eV) for the n_i → n_f transition. */
export function rydbergEnergyEv(ni: number, nf: number): number {
  return RYDBERG_EV * (1 / (nf * nf) - 1 / (ni * ni));
}

/** Bohr binding energy of level n (eV, negative). */
export function levelEnergyEv(n: number): number {
  return -RYDBERG_EV / (n * n);
}

/**
 * Fold a transition's photon energy (eV, ~0.3–13.6) into an audible pitch.
 * Higher energy → higher pitch, so Lyman sits above Balmer above Paschen and
 * the Balmer series (Hα<Hβ<Hγ<Hδ) rises as an ascending scale.
 */
export function energyToAudibleHz(energyEv: number): number {
  const eMin = 0.3;
  const eMax = 13.6;
  const octaves = 3.2;
  const t = Math.min(1, Math.max(0, (Math.abs(energyEv) - eMin) / (eMax - eMin)));
  return 174.6 * Math.pow(2, t * octaves); // base ≈ F3
}

/** A deep sustained drone pitch for the current level (lower n = deeper). */
export function levelToDroneHz(n: number): number {
  // binding energy magnitude maps to a low register: n=1 deepest? No — n=1 is
  // most bound (largest |E|). Map so the ground state is a warm low root and
  // higher levels drift up gently.
  return 55 * Math.pow(2, (n - 1) * 0.58); // A1 → up ~1.7 oct across n=1..4
}

// Which Bohr series a downward transition belongs to (for the label / colour).
export function seriesName(nf: number): string {
  if (nf === 1) return "Lyman";
  if (nf === 2) return "Balmer";
  if (nf === 3) return "Paschen";
  return "Brackett";
}

/** Enumerate the valid (l,m) sublevels of a given n, in reading order. */
export function sublevels(n: number): Array<{ l: number; m: number }> {
  const out: Array<{ l: number; m: number }> = [];
  for (let l = 0; l < n; l++) {
    for (let m = -l; m <= l; m++) out.push({ l, m });
  }
  return out;
}
