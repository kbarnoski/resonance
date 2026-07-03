/**
 * 1121 · Pulse-Lock — two-body Kuramoto engine.
 *
 * Each person is a phase oscillator θ_i with a natural angular frequency ω_i
 * (set by how fast they tap). A coupling term K·sin(θ_j − θ_i) gently pulls the
 * two phases toward each other; when their tempos are close enough the pair
 * *entrains* (phase-locks) — the felt Kuramoto synchronisation.
 *
 * Pure math + a deterministic seeded ghost partner. No DOM, no audio, no
 * Math.random / Date.now at module scope.
 */

export const TWO_PI = Math.PI * 2;

/** mulberry32 — a tiny deterministic PRNG. Seeded from a fixed constant so the
 *  ghost partner behaves identically on every visit (never Math.random). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap an angle to (−π, π]. */
export function wrapPi(x: number): number {
  let a = x % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a <= -Math.PI) a += TWO_PI;
  return a;
}

/** Wrap an angle to [0, 2π). */
function wrapTau(x: number): number {
  let a = x % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

export type Side = "a" | "b";

export interface Oscillator {
  theta: number; // phase, [0, 2π)
  omega: number; // current angular freq (rad/s)
  omegaTarget: number; // eased toward this
  bpm: number; // display tempo
  lastTapMs: number; // any-source tap
  lastHumanMs: number; // human tap only
  intervals: number[]; // recent tap intervals (s)
  active: boolean; // human tapped recently
  swell: number; // (1+cos θ)/2, peaks at the beat
}

export interface EntrainState {
  a: Oscillator;
  b: Oscillator;
  K: number; // coupling strength (rad/s)
  kTarget: number;
  alignment: number; // order parameter r ∈ [0,1]
  phaseDiff: number; // wrapped θb − θa
  lock: number; // smoothed lock reward ∈ [0,1]
  t: number; // seconds since begin
  ghostNextMs: number;
  ghostSide: Side | null;
  rng: () => number;
}

/** A pulse event emitted when an oscillator crosses its beat (θ wraps 0). */
export interface PulseEvents {
  a: boolean;
  b: boolean;
}

const DEFAULT_BPM = 60;
const MIN_INTERVAL = 0.28; // s  (≈214 bpm ceiling)
const MAX_INTERVAL = 2.4; // s  (≈25 bpm floor)
const ACTIVE_MS = 7000; // a side counts as "human" for this long after a tap
const K_MAX = 1.0; // coupling ceiling (rad/s)
const K_RAMP_S = 13; // coupling eases up over the opening
const GHOST_TEMPO_RATIO = 1.06; // ghost runs a near-miss ~6% off its partner

function bpmToOmega(bpm: number): number {
  return (TWO_PI * bpm) / 60;
}

function makeOscillator(bpm: number): Oscillator {
  return {
    theta: 0,
    omega: bpmToOmega(bpm),
    omegaTarget: bpmToOmega(bpm),
    bpm,
    lastTapMs: -1e9,
    lastHumanMs: -1e9,
    intervals: [],
    active: false,
    swell: 1,
  };
}

export function makeEntrainState(): EntrainState {
  return {
    // Two slightly different natural tempos so, left alone, they drift then lock.
    a: makeOscillator(58),
    b: makeOscillator(63),
    K: 0.04,
    kTarget: 0.04,
    alignment: 0,
    phaseDiff: 0,
    lock: 0,
    t: 0,
    ghostNextMs: 0,
    ghostSide: "b",
    // Fixed constant seed → deterministic ghost partner.
    rng: makeRng(0x9e3779b9),
  };
}

/**
 * Register a beat on one side. Sets that oscillator's natural frequency from the
 * tap interval and gives its phase a soft nudge toward the downbeat so the
 * instrument audibly "catches" the person's rhythm (coupling still does the rest).
 */
export function registerTap(
  state: EntrainState,
  side: Side,
  nowMs: number,
  human: boolean,
): void {
  const osc = state[side];
  const dt = (nowMs - osc.lastTapMs) / 1000;
  osc.lastTapMs = nowMs;
  if (human) {
    osc.lastHumanMs = nowMs;
    osc.active = true;
  }

  if (dt >= MIN_INTERVAL && dt <= MAX_INTERVAL) {
    osc.intervals.push(dt);
    if (osc.intervals.length > 4) osc.intervals.shift();
    const mean =
      osc.intervals.reduce((s, v) => s + v, 0) / osc.intervals.length;
    osc.bpm = 60 / mean;
    osc.omegaTarget = TWO_PI / mean;
  }

  // Soft phase pull toward 0 (the beat you just marked) — never a hard reset,
  // so the coupling term is still free to entrain the two oscillators.
  const toBeat = -wrapPi(osc.theta);
  osc.theta = wrapTau(osc.theta + toBeat * 0.6);
}

/** Advance the two coupled oscillators by dt seconds. Returns beat crossings. */
export function stepEntrain(
  state: EntrainState,
  dt: number,
  nowMs: number,
): PulseEvents {
  state.t += dt;

  // Coupling eases up over the opening: early drift → later entrainment.
  state.kTarget = 0.04 + (K_MAX - 0.04) * smoothstep(state.t / K_RAMP_S);
  state.K += (state.kTarget - state.K) * Math.min(1, dt * 2.5);

  const { a, b } = state;
  a.omega += (a.omegaTarget - a.omega) * Math.min(1, dt * 3);
  b.omega += (b.omegaTarget - b.omega) * Math.min(1, dt * 3);

  // Kuramoto: dθ_i/dt = ω_i + K·sin(θ_j − θ_i)
  const dA = a.omega + state.K * Math.sin(b.theta - a.theta);
  const dB = b.omega + state.K * Math.sin(a.theta - b.theta);

  const events: PulseEvents = { a: false, b: false };

  a.theta += dA * dt;
  while (a.theta >= TWO_PI) {
    a.theta -= TWO_PI;
    events.a = true;
  }
  while (a.theta < 0) a.theta += TWO_PI;

  b.theta += dB * dt;
  while (b.theta >= TWO_PI) {
    b.theta -= TWO_PI;
    events.b = true;
  }
  while (b.theta < 0) b.theta += TWO_PI;

  a.swell = (1 + Math.cos(a.theta)) / 2;
  b.swell = (1 + Math.cos(b.theta)) / 2;

  a.active = nowMs - a.lastHumanMs < ACTIVE_MS;
  b.active = nowMs - b.lastHumanMs < ACTIVE_MS;

  // Order parameter for two oscillators: r = |cos(Δ/2)|.
  const diff = wrapPi(b.theta - a.theta);
  state.phaseDiff = diff;
  const r = Math.abs(Math.cos(diff / 2));
  state.alignment = r;

  // Lock reward: rises when alignment is high, eased for a slow bloom.
  const target = smoothstep((r - 0.55) / 0.45);
  state.lock += (target - state.lock) * Math.min(1, dt * 1.4);

  return events;
}

/**
 * Deterministic ghost partner. Whichever side has no recent human beat gets
 * gently tapped by the ghost at a near-miss tempo, so a lone visitor still
 * watches and hears the two drift toward lock. Returns the side it tapped (or
 * null). Mutates state (schedules the next ghost beat).
 */
export function runGhost(state: EntrainState, nowMs: number): Side | null {
  const { a, b } = state;

  // Decide which side the ghost drives (the inactive partner).
  let ghost: Side | null;
  if (a.active && !b.active) ghost = "b";
  else if (b.active && !a.active) ghost = "a";
  else if (!a.active && !b.active) ghost = "b";
  else ghost = null; // both human → true two-player, ghost steps aside
  state.ghostSide = ghost;

  if (ghost === null) return null;
  if (nowMs < state.ghostNextMs) return null;

  // Base the ghost tempo on its human partner if present, else a warm default,
  // then offset by a fixed near-miss ratio so the pair can entrain.
  const partner = ghost === "b" ? a : b;
  const baseBpm = partner.active ? partner.bpm : DEFAULT_BPM;
  const ghostBpm = baseBpm * GHOST_TEMPO_RATIO;
  const jitter = 0.97 + state.rng() * 0.06; // ±3% seeded jitter
  const periodMs = (60000 / ghostBpm) * jitter;

  registerTap(state, ghost, nowMs, false);
  state.ghostNextMs = nowMs + periodMs;
  return ghost;
}

/** True two-player only when both sides have a recent human beat. */
export function sourceLabel(state: EntrainState): "two-players" | "ghost-partner" {
  return state.a.active && state.b.active ? "two-players" : "ghost-partner";
}
