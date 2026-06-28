// ─────────────────────────────────────────────────────────────────────────────
// spring.ts · The slinky's physics: a 1D LONGITUDINAL mass-spring chain.
//
// Each coil is a point-mass with a scalar displacement u_i ALONG the helix axis.
// This is a *compression* (longitudinal) wave, NOT a transverse string wave.
//
//   a_i = (k/m)*(u_{i+1} - 2*u_i + u_{i-1}) - damping*v_i
//
// Boundaries are FIXED–FIXED (both ends pinned), which gives a clean integer
// harmonic series f_n = n * c / (2L). The grabbed end can be driven while held.
// CPU-integrated with fixed substeps for stability. Reference: discrete wave
// equation / FDTD (Bilbao, Numerical Sound Synthesis).
// ─────────────────────────────────────────────────────────────────────────────

export interface SlinkyState {
  n: number; // number of coils (masses)
  u: Float32Array; // longitudinal displacement of each coil
  v: Float32Array; // velocity
  k: number; // spring stiffness / mass ratio (k/m)
  damping: number;
}

export function makeSlinky(n: number): SlinkyState {
  return {
    n,
    u: new Float32Array(n),
    v: new Float32Array(n),
    k: 2600, // tuned so the wave travels in a visible, satisfying way
    damping: 0.9, // gentle decay -> the standing wave hums then settles
  };
}

// Advance the chain by `substeps` fixed steps of size dt each.
// `heldIndex` (>=0) is clamped to a driven displacement `heldU` (grab+drag).
export function stepSlinky(
  s: SlinkyState,
  dt: number,
  substeps: number,
  heldIndex: number,
  heldU: number,
): void {
  const { n, u, v, k, damping } = s;
  for (let step = 0; step < substeps; step++) {
    // ends 0 and n-1 are pinned (u stays 0)
    for (let i = 1; i < n - 1; i++) {
      const lap = u[i + 1] - 2 * u[i] + u[i - 1];
      const a = k * lap - damping * v[i];
      v[i] += a * dt;
    }
    for (let i = 1; i < n - 1; i++) {
      u[i] += v[i] * dt;
    }
    // Driven (held) coil: snap toward the grabbed displacement.
    if (heldIndex > 0 && heldIndex < n - 1) {
      u[heldIndex] = heldU;
      v[heldIndex] = 0;
    }
    // Pinned ends.
    u[0] = 0;
    v[0] = 0;
    u[n - 1] = 0;
    v[n - 1] = 0;
  }
}

// A "flick": inject a localised compression pulse near one end so it travels,
// reflects off both boundaries, and settles into standing-wave modes.
export function flickSlinky(s: SlinkyState, strength: number): void {
  const { n, u, v } = s;
  const center = Math.floor(n * 0.18); // near the grab end
  const width = Math.max(3, Math.floor(n * 0.08));
  for (let i = 1; i < n - 1; i++) {
    const d = (i - center) / width;
    const g = Math.exp(-d * d); // gaussian bump
    u[i] += strength * g;
    v[i] += strength * 14 * g; // give it momentum so it propagates
  }
}

// Project the displacement field onto the fixed-fixed mode shapes
// phi_n(i) = sin(n*pi*i/(N-1)). Returns normalised amplitudes for n=1..count.
// These ARE the standing-wave modes -> drive additive audio + glow.
export function modeAmplitudes(
  s: SlinkyState,
  count: number,
  out: Float32Array,
): void {
  const { n, u } = s;
  const norm = 2 / (n - 1);
  for (let mode = 1; mode <= count; mode++) {
    let acc = 0;
    const w = (mode * Math.PI) / (n - 1);
    for (let i = 0; i < n; i++) {
      acc += u[i] * Math.sin(w * i);
    }
    out[mode - 1] = acc * norm;
  }
}

// Total kinetic+potential energy proxy (for the audio swell envelope).
export function chainEnergy(s: SlinkyState): number {
  const { n, u, v, k } = s;
  let e = 0;
  for (let i = 1; i < n; i++) {
    const du = u[i] - u[i - 1];
    e += 0.5 * k * du * du + 0.5 * v[i] * v[i];
  }
  return e;
}
