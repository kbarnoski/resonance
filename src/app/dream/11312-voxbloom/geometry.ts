// ─────────────────────────────────────────────────────────────────────────────
// geometry.ts — pure math + point layout for VOXBLOOM.
//
// The sculpture is NUM_BANDS concentric spherical shells of points. Every point
// belongs to one frequency BAND and owns a fixed unit DIRECTION on its shell.
// Only the RADIUS of each point moves: it eases toward `floor(band) + amp²·bloom`
// so a loud harmonic blooms its whole shell outward and a quiet one collapses it
// back toward the core. No physics, no fluid — just a kinematic radius lerp.
// ─────────────────────────────────────────────────────────────────────────────

export const NUM_BANDS = 24; // spectral shells (must be ≤ 32 for the uniform pack)
export const N_GPU = 60_000; // points on the WebGPU path
export const N_CPU = 24_000; // points on the three.js fallback (lighter for phones)

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Base radius of a band's shell at silence — inner bands sit closer to the core. */
export function bandFloor(band: number): number {
  return 0.16 + band * 0.011;
}

/**
 * Fixed per-point data: a unit direction on the point's shell plus its band index.
 * Layout is vec4 per point (x, y, z = unit dir, w = band) so it maps 1:1 onto a
 * WGSL `array<vec4f>` storage buffer and onto three.js attributes.
 */
export function buildDirections(count: number): Float32Array {
  const perBand = Math.floor(count / NUM_BANDS);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const band = Math.min(NUM_BANDS - 1, Math.floor(i / perBand));
    const k = i - band * perBand;
    // Fibonacci sphere within the shell for an even, seam-free spread.
    const y = 1 - ((k + 0.5) / perBand) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = k * GOLDEN_ANGLE + band * 0.61; // per-band phase so shells decorrelate
    data[i * 4] = Math.cos(theta) * r;
    data[i * 4 + 1] = y;
    data[i * 4 + 2] = Math.sin(theta) * r;
    data[i * 4 + 3] = band;
  }
  return data;
}

/** Initial per-point state: radius parked at the band floor, intensity 0. */
export function buildInitialState(count: number): Float32Array {
  const perBand = Math.floor(count / NUM_BANDS);
  const data = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const band = Math.min(NUM_BANDS - 1, Math.floor(i / perBand));
    data[i * 4] = bandFloor(band); // radius
    data[i * 4 + 1] = 0; // intensity
  }
  return data;
}

/**
 * Collapse an FFT magnitude frame (0..255) into NUM_BANDS log-spaced amplitudes
 * in 0..1. Low bins carry the fundamental; high bins the airy overtones.
 */
export function aggregateBands(freq: Uint8Array, out: Float32Array): void {
  const bins = freq.length;
  const minBin = 1;
  const maxBin = Math.min(bins - 1, Math.floor(bins * 0.72));
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  for (let b = 0; b < NUM_BANDS; b++) {
    const lo = Math.floor(Math.exp(logMin + ((logMax - logMin) * b) / NUM_BANDS));
    const hi = Math.max(
      lo + 1,
      Math.floor(Math.exp(logMin + ((logMax - logMin) * (b + 1)) / NUM_BANDS)),
    );
    let sum = 0;
    for (let j = lo; j < hi; j++) sum += freq[j];
    out[b] = sum / ((hi - lo) * 255);
  }
}

/**
 * A gentle synthetic spectrum used ONLY as a visual safety net when the audio
 * graph is silent or still suspended (e.g. a muted phone before any gesture).
 * Two slow gaussian "harmonics" drift across the bands so the sculpture is
 * always alive and blooming. This is decorative motion, not a simulation.
 */
export function syntheticBands(t: number, out: Float32Array): void {
  const c1 = (Math.sin(t * 0.31) * 0.5 + 0.5) * (NUM_BANDS - 1);
  const c2 = (Math.sin(t * 0.19 + 2.1) * 0.5 + 0.5) * (NUM_BANDS - 1);
  const breath = 0.35 + 0.25 * (Math.sin(t * 0.7) * 0.5 + 0.5);
  for (let b = 0; b < NUM_BANDS; b++) {
    const g1 = Math.exp(-((b - c1) * (b - c1)) / 10);
    const g2 = Math.exp(-((b - c2) * (b - c2)) / 6);
    out[b] = Math.min(1, (g1 * 0.8 + g2 * 0.55) * breath);
  }
}

/** Total energy of a band frame — used to decide when to fall back to synthetic. */
export function bandEnergy(bands: Float32Array): number {
  let s = 0;
  for (let i = 0; i < bands.length; i++) s += bands[i];
  return s;
}

/**
 * Column-major view-projection matrix for an orbit camera looking at the origin
 * from spherical angles (az, el) at the given radius. WebGPU depth range [0,1].
 */
export function buildMvp(
  az: number,
  el: number,
  aspect: number,
  radius: number,
): Float32Array {
  const fov = 50 * (Math.PI / 180);
  const f = 1 / Math.tan(fov / 2);
  const nr = 0.1;
  const fr = 60.0;
  const A = fr / (nr - fr);
  const B = (nr * fr) / (nr - fr);
  const P = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, A, -1,
    0, 0, B, 0,
  ]);

  const ex = radius * Math.cos(el) * Math.sin(az);
  const ey = radius * Math.sin(el);
  const ez = radius * Math.cos(el) * Math.cos(az);

  const fx = -ex / radius;
  const fy = -ey / radius;
  const fz = -ez / radius;

  let rx = -fz;
  let rz = fx;
  const rl = Math.sqrt(rx * rx + rz * rz);
  rx /= rl;
  rz /= rl;

  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;

  const tx = -(rx * ex + rz * ez);
  const ty = -(ux * ex + uy * ey + uz * ez);
  const tz = fx * ex + fy * ey + fz * ez;

  const V = new Float32Array([
    rx, ux, -fx, 0,
    0, uy, -fy, 0,
    rz, uz, -fz, 0,
    tx, ty, tz, 1,
  ]);

  const M = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let rr = 0; rr < 4; rr++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += P[k * 4 + rr] * V[c * 4 + k];
      M[c * 4 + rr] = s;
    }
  }
  return M;
}
