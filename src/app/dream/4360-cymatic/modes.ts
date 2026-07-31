// ─────────────────────────────────────────────────────────────────────────────
// 4360 · Cymatic — shared physics: Chladni eigenmodes + resonance response.
//
// A square plate's standing-wave shapes are approximated by the classic Chladni
// eigenmode combinations
//
//     Φ_mn(x,y) = cos(mπx)·cos(nπy)  +  s·cos(nπx)·cos(mπy)   ,  x,y ∈ [0,1]
//
// with the mixing sign s ∈ {+1,-1,0}. The plate displacement under a drive of
// frequency f is the superposition  A(p) = Σ_k w_k(f)·Φ_k(p), where each mode's
// weight w_k(f) is a Lorentzian resonance response peaked at that mode's natural
// frequency f_k. Sand (particles) does a damped Newton descent onto the nodal
// set A(p)=0 — the figure of the pitch.
//
// This file is imported by BOTH the WebGPU and Canvas2D backends so the two paths
// run the identical model, and by page.tsx for the resonance-response mapper.
// ─────────────────────────────────────────────────────────────────────────────

export const PI = Math.PI;

// ── Deterministic PRNG (mulberry32) — NEVER Math.random / Date.now ────────────
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The eight named modes (keys A S D F G H J K) ──────────────────────────────
// Each is a Chladni combination with a natural frequency f_k (Hz). They are
// ordered by ascending f_k so a left→right frequency drag sweeps A→K, and each
// f_k is chosen near a musical pitch so the plate sings a clean tone at its peak.
export interface Mode {
  key: string; // keyboard key that jumps here
  m: number;
  n: number;
  s: number; // mixing sign: +1, -1 or 0 (single term when m===n)
  fk: number; // natural resonant frequency (Hz)
  label: string; // e.g. "(2,1)−"
  note: string; // nearest musical pitch, for the HUD
}

export const MODES: Mode[] = [
  { key: "a", m: 1, n: 1, s: 0, fk: 98, label: "(1,1)", note: "G2 · cross" },
  { key: "s", m: 2, n: 1, s: -1, fk: 147, label: "(2,1)−", note: "D3 · saddle" },
  { key: "d", m: 2, n: 2, s: 0, fk: 196, label: "(2,2)", note: "G3 · grid" },
  { key: "f", m: 3, n: 1, s: -1, fk: 262, label: "(3,1)−", note: "C4 · fan" },
  { key: "g", m: 3, n: 2, s: -1, fk: 330, label: "(3,2)−", note: "E4 · lattice" },
  { key: "h", m: 4, n: 1, s: -1, fk: 392, label: "(4,1)−", note: "G4 · ribs" },
  { key: "j", m: 3, n: 3, s: 0, fk: 466, label: "(3,3)", note: "A♯4 · mesh" },
  { key: "k", m: 4, n: 2, s: -1, fk: 554, label: "(4,2)−", note: "C♯5 · weave" },
];

export const N_MODES = MODES.length;
export const FREQ_MIN = 70; // Hz — left edge of the sweep
export const FREQ_MAX = 620; // Hz — right edge of the sweep

// ── Resonance response: Lorentzian weight of each mode at drive frequency f ────
// γ_k (half-width) is proportional to f_k so every resonance has a similar Q. The
// weights are normalised to sum to 1 so the field magnitude stays bounded and the
// figure is always legible; the UN-normalised peak sum is returned separately as
// a "resonance strength" (how hard the plate is actually ringing) for audio/vis.
export interface Weights {
  w: Float32Array; // length N_MODES, normalised, sums to ~1
  strength: number; // 0..1, how close f is to any resonance peak
  dominant: number; // index of the currently strongest mode
}

const GAMMA_FRAC = 0.11; // fractional half-width of each Lorentzian

export function makeWeights(f: number): Weights {
  const w = new Float32Array(N_MODES);
  let sum = 0;
  let rawMax = 0;
  for (let k = 0; k < N_MODES; k++) {
    const fk = MODES[k].fk;
    const g = GAMMA_FRAC * fk;
    const df = f - fk;
    const raw = (g * g) / (df * df + g * g); // Lorentzian, peak 1 at f===fk
    w[k] = raw;
    sum += raw;
    if (raw > rawMax) rawMax = raw;
  }
  let dominant = 0;
  let best = -1;
  const inv = sum > 1e-6 ? 1 / sum : 0;
  for (let k = 0; k < N_MODES; k++) {
    w[k] *= inv;
    if (w[k] > best) {
      best = w[k];
      dominant = k;
    }
  }
  return { w, strength: rawMax, dominant };
}

// ── Field evaluation (CPU path) ───────────────────────────────────────────────
// Returns the plate displacement A and its gradient (gx,gy) at (x,y)∈[0,1]².
// The WGSL backend implements the identical formula in a compute shader.
export interface FieldSample {
  A: number;
  gx: number;
  gy: number;
}

export function evalField(x: number, y: number, w: Float32Array): FieldSample {
  let A = 0;
  let gx = 0;
  let gy = 0;
  for (let k = 0; k < N_MODES; k++) {
    const wk = w[k];
    if (wk < 1e-4) continue;
    const md = MODES[k];
    const mp = md.m * PI;
    const np = md.n * PI;
    const s = md.s;
    const cmx = Math.cos(mp * x);
    const cny = Math.cos(np * y);
    const cnx = Math.cos(np * x);
    const cmy = Math.cos(mp * y);
    const smx = Math.sin(mp * x);
    const sny = Math.sin(np * y);
    const snx = Math.sin(np * x);
    const smy = Math.sin(mp * y);
    // Φ = cos(mπx)cos(nπy) + s·cos(nπx)cos(mπy)
    A += wk * (cmx * cny + s * cnx * cmy);
    // ∂Φ/∂x
    gx += wk * (-mp * smx * cny - s * np * snx * cmy);
    // ∂Φ/∂y
    gy += wk * (-np * cmx * sny - s * mp * cnx * smy);
  }
  return { A, gx, gy };
}
