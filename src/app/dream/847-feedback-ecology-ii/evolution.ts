/*
 * 847 · FEEDBACK ECOLOGY II — self-evolving topology
 *
 * This is the cycle-2 substance: a layer that makes the 820 resonator network
 * drive ITS OWN topology over minutes, with no user input required.
 *
 *   1. Lorenz attractor — integrated every frame; its normalised coordinates
 *      become GLOBAL modulation (coupling / self-feedback / timbre). The system
 *      "weathers" — it never settles, so minute 5 differs from minute 0.
 *
 *   2. Hebbian adaptive edges — per-edge live weights: an edge whose two
 *      endpoints are both energetic strengthens; idle edges decay toward a
 *      floor. The graph literally rewires itself ("seldom-used links die out,
 *      heavily-used links strengthen").
 *
 * Reference: E. N. Lorenz, "Deterministic Nonperiodic Flow," J. Atmos. Sci.
 * 20 (1963), 130–141 — the canonical σ=10, ρ=28, β=8/3 system.
 */

import type { Edge, ResonatorNode } from "./audio";

// ── Lorenz attractor ─────────────────────────────────────────────────────────

export interface LorenzState {
  x: number;
  y: number;
  z: number;
  // smoothed normalised channels [0,1] for modulation mapping
  nx: number;
  ny: number;
  nz: number;
}

export const LORENZ_SIGMA = 10;
export const LORENZ_RHO = 28;
export const LORENZ_BETA = 8 / 3;

// Sub-steps per frame keep the integration stable; dt is small.
const LORENZ_DT = 0.005;
const LORENZ_SUBSTEPS = 6;

// Classic Lorenz attractor bounds (approx) used to normalise into [0,1].
const X_RANGE = 20;
const Z_MIN = 0;
const Z_RANGE = 50;

export function createLorenz(): LorenzState {
  return {
    x: 0.1,
    y: 0,
    z: 0,
    nx: 0.5,
    ny: 0.5,
    nz: 0.5,
  };
}

/**
 * Advance the Lorenz system by one frame (LORENZ_SUBSTEPS Euler sub-steps).
 * Updates the smoothed normalised channels nx/ny/nz used for modulation.
 * `speed` lets the autonomous drift be sped up / slowed (default 1).
 */
export function stepLorenz(L: LorenzState, speed = 1): void {
  let { x, y, z } = L;
  const dt = LORENZ_DT * speed;
  for (let s = 0; s < LORENZ_SUBSTEPS; s++) {
    const dx = LORENZ_SIGMA * (y - x);
    const dy = x * (LORENZ_RHO - z) - y;
    const dz = x * y - LORENZ_BETA * z;
    x += dx * dt;
    y += dy * dt;
    z += dz * dt;
  }
  L.x = x;
  L.y = y;
  L.z = z;

  // Normalise into [0,1]. x,y roughly ±20; z roughly 0..50.
  const rawNx = (x + X_RANGE) / (2 * X_RANGE);
  const rawNy = (y + X_RANGE) / (2 * X_RANGE);
  const rawNz = (z - Z_MIN) / Z_RANGE;

  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  // Smooth so the modulation drifts gently rather than jittering.
  const k = 0.06;
  L.nx += (clamp01(rawNx) - L.nx) * k;
  L.ny += (clamp01(rawNy) - L.ny) * k;
  L.nz += (clamp01(rawNz) - L.nz) * k;
}

// ── Lorenz → modulation mapping ──────────────────────────────────────────────

export interface Modulation {
  coupling: number; // [0, MAX_COUPLING-ish] — global coupling strength
  selfFeedback: number; // [0, MAX_FB_GAIN-ish] — edge of chaos
  qScale: number; // [0,1] — timbral (filter Q)
  detuneCents: number; // small ± detune
}

/**
 * Map normalised Lorenz coords to global modulation. The actual hard clamps
 * live in the audio engine (MAX_COUPLING / MAX_FB_GAIN); these ranges keep the
 * system in a musical, mostly-stable window while still sweeping through
 * bifurcations (isolated pings ↔ entrainment ↔ drone) on its own.
 */
export function lorenzToModulation(L: LorenzState): Modulation {
  // x → global coupling: sweep 0.06 .. 0.34 (under MAX_COUPLING 0.35)
  const coupling = 0.06 + L.nx * 0.28;
  // y → self-feedback / edge of chaos: 0.42 .. 0.82 (under MAX_FB_GAIN 0.88)
  const selfFeedback = 0.42 + L.ny * 0.4;
  // z → timbre (Q) and a gentle global detune
  const qScale = L.nz;
  const detuneCents = (L.nz - 0.5) * 18; // ±9 cents
  return { coupling, selfFeedback, qScale, detuneCents };
}

// ── Hebbian adaptive edges ───────────────────────────────────────────────────

export interface HebbianState {
  weights: Float32Array; // live weight per edge, [WEIGHT_FLOOR, 1]
}

const WEIGHT_FLOOR = 0.12; // idle edges decay toward this, never to zero
const WEIGHT_CEIL = 1.0;
const POTENTIATION = 0.045; // strengthening rate when both endpoints active
const DECAY = 0.012; // decay rate toward floor
const ENERGY_THRESHOLD = 0.04; // below this an endpoint counts as "idle"

export function createHebbian(edgeCount: number): HebbianState {
  const weights = new Float32Array(edgeCount);
  weights.fill(0.5); // start mid so the graph has room to grow OR prune
  return { weights };
}

/**
 * Evolve per-edge weights one frame. An edge whose BOTH endpoints exceed the
 * energy threshold is potentiated (toward CEIL); otherwise it decays toward the
 * floor. `dtScale` lets the rate be frame-rate-normalised. Deltas are small so
 * it never runs away.
 */
export function stepHebbian(
  H: HebbianState,
  edges: Edge[],
  nodes: ResonatorNode[],
  dtScale = 1
): void {
  const w = H.weights;
  for (let e = 0; e < edges.length; e++) {
    const a = nodes[edges[e].from];
    const b = nodes[edges[e].to];
    if (!a || !b) continue;
    const coActive = a.energy > ENERGY_THRESHOLD && b.energy > ENERGY_THRESHOLD;
    // Product of energies scales the potentiation — strongly co-active edges
    // strengthen fastest (classic correlation-based / "fire together" rule).
    const corr = Math.min(a.energy * b.energy * 4, 1);
    let next = w[e];
    if (coActive) {
      next += POTENTIATION * corr * dtScale * (WEIGHT_CEIL - next);
    } else {
      next -= DECAY * dtScale * (next - WEIGHT_FLOOR);
    }
    if (next < WEIGHT_FLOOR) next = WEIGHT_FLOOR;
    else if (next > WEIGHT_CEIL) next = WEIGHT_CEIL;
    w[e] = next;
  }
}
