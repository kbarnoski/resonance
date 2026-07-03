/**
 * 1123 · Conductor-Veil — gesture → phrasing/tempo/dynamics primitive.
 *
 * The listener moves a baton (pointer / finger) across the canvas. Every frame
 * we track its normalized position, velocity and curvature. The core primitive
 * is downbeat detection by *vertical-velocity reversal*: the bottom of a
 * downward stroke (vy goes from descending to ascending) marks a beat. The
 * inter-downbeat intervals feed an EMA-smoothed BPM (clamped ~40–160). Hand
 * height sets register + brightness; recent gesture energy sets dynamics.
 *
 * A deterministic mulberry32 "ghost conductor" (fixed seed) traces a gentle
 * down-up beat pattern whenever no human is moving, so the piece animates AND
 * sounds on a cold glance — the never-blank / never-silent path. Real pointer
 * input takes over the instant the user moves. No Math.random on any per-frame
 * path — all stochastic wobble comes from the seeded PRNG.
 */

const GHOST_SEED = 0x1120c04f;

export const BPM_MIN = 40;
export const BPM_MAX = 160;

/** How long after the last pointer move before the ghost resumes control. */
const HUMAN_TIMEOUT_MS = 1300;

/** Minimum peak downward speed (norm units / s) for a stroke to count. */
const MIN_STROKE_SPEED = 0.32;

/** Deterministic PRNG — no Math.random anywhere in the frame path. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Source = "human" | "ghost";

export interface ConductorState {
  /** Smoothed baton position, normalized 0..1 (y: 0 top, 1 bottom). */
  x: number;
  y: number;
  /** Raw target the smoother chases (pointer or ghost). */
  targetX: number;
  targetY: number;
  /** Smoothed velocity, normalized units per second. */
  vx: number;
  vy: number;
  /** Recent speed magnitude (EMA) → drives dynamics. */
  speed: number;
  /** Path curvature estimate (0..~1) → subtle phrasing colour. */
  curvature: number;

  /** Derived musical controls, all 0..1 unless noted. */
  bpm: number;
  register: number; // octave shift 0 .. +1.2
  brightness: number; // 0 dark .. 1 open
  energy: number; // 0 calm .. 1 vigorous (dynamics)

  source: Source;

  // ── internal downbeat tracking ──
  descending: boolean;
  peakDown: number;
  lastDownbeatMs: number;
  lastHumanMs: number;

  // ── ghost internals ──
  ghostPhase: number; // beats
  ghostBpm: number;
  ghostAmp: number;
  ghostSeedPhase: number;
  rng: () => number;

  started: boolean;
}

export interface StepEvent {
  /** True on the frame a downbeat is detected. */
  downbeat: boolean;
  /** Beat position within the ghost/human bar, 0..1 (for the phase ring). */
  phase: number;
}

export function makeConductorState(): ConductorState {
  const rng = mulberry32(GHOST_SEED);
  return {
    x: 0.5,
    y: 0.55,
    targetX: 0.5,
    targetY: 0.55,
    vx: 0,
    vy: 0,
    speed: 0,
    curvature: 0,
    bpm: 72,
    register: 0.4,
    brightness: 0.5,
    energy: 0.3,
    source: "ghost",
    descending: false,
    peakDown: 0,
    lastDownbeatMs: 0,
    lastHumanMs: -1e9,
    ghostPhase: 0,
    ghostBpm: 66,
    ghostAmp: 0.22,
    ghostSeedPhase: rng() * Math.PI * 2,
    rng,
    started: false,
  };
}

/** Feed a pointer sample (normalized 0..1). Immediately claims human control. */
export function applyPointer(
  state: ConductorState,
  nx: number,
  ny: number,
  now: number,
): void {
  state.targetX = clamp01(nx);
  state.targetY = clamp01(ny);
  state.lastHumanMs = now;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Advance the ghost conductor one step; writes into state.target*. */
function stepGhost(state: ConductorState, dt: number): void {
  // Gentle seeded drift of tempo & amplitude so the ghost breathes.
  const drift = state.rng();
  state.ghostBpm = lerp(state.ghostBpm, 60 + drift * 16, 0.002);
  state.ghostAmp = lerp(state.ghostAmp, 0.17 + state.rng() * 0.1, 0.004);

  state.ghostPhase += (dt * state.ghostBpm) / 60;

  // Bottom of the stroke (max screen-y) lands on integer phase → a downbeat,
  // detected by the same vy-reversal logic the human path uses.
  const twoPi = Math.PI * 2;
  const midY = 0.55;
  const y = midY + state.ghostAmp * Math.cos(twoPi * state.ghostPhase);
  const x =
    0.5 +
    0.13 * Math.sin(twoPi * state.ghostPhase * 0.5 + state.ghostSeedPhase);
  state.targetX = clamp01(x);
  state.targetY = clamp01(y);
}

/**
 * Advance one frame. Handles source arbitration, smoothing, velocity, the
 * downbeat primitive, EMA-BPM, and all derived musical controls.
 */
export function stepConductor(
  state: ConductorState,
  dt: number,
  now: number,
): StepEvent {
  state.started = true;
  const isHuman = now - state.lastHumanMs < HUMAN_TIMEOUT_MS;
  state.source = isHuman ? "human" : "ghost";
  if (!isHuman) stepGhost(state, dt);

  // Smooth the baton position toward its target (light — keeps reversals sharp).
  const px = state.x;
  const py = state.y;
  const k = isHuman ? 0.45 : 0.6;
  state.x = lerp(state.x, state.targetX, k);
  state.y = lerp(state.y, state.targetY, k);

  // Instantaneous velocity in normalized units / second.
  const safeDt = dt > 1e-4 ? dt : 1e-4;
  const ivx = (state.x - px) / safeDt;
  const ivy = (state.y - py) / safeDt;
  const prevVy = state.vy;
  state.vx = lerp(state.vx, ivx, 0.35);
  state.vy = lerp(state.vy, ivy, 0.35);

  // Curvature: how much the velocity direction is turning.
  const turn = Math.abs(state.vy - prevVy);
  state.curvature = lerp(state.curvature, Math.min(1, turn * 0.15), 0.1);

  // Speed EMA → dynamics.
  const spd = Math.hypot(state.vx, state.vy);
  state.speed = lerp(state.speed, spd, 0.2);

  // ── downbeat primitive: bottom of a downward stroke (vy: + → −) ──
  let downbeat = false;
  const descendingNow = state.vy > 0; // y increasing = baton moving down
  if (descendingNow) {
    state.descending = true;
    if (state.vy > state.peakDown) state.peakDown = state.vy;
  } else if (state.descending && state.peakDown > MIN_STROKE_SPEED) {
    // Reversal at the low point of the stroke.
    const interval = now - state.lastDownbeatMs;
    const minMs = 60000 / BPM_MAX; // ignore implausibly short intervals
    const maxMs = 60000 / BPM_MIN;
    if (state.lastDownbeatMs > 0 && interval >= minMs && interval <= maxMs) {
      const measured = 60000 / interval;
      state.bpm = lerp(state.bpm, measured, 0.28); // EMA-smoothed BPM
      state.bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, state.bpm));
    }
    state.lastDownbeatMs = now;
    downbeat = true;
    state.descending = false;
    state.peakDown = 0;
  }

  // ── derived musical controls ──
  const height = 1 - state.y; // higher hand → higher value
  state.register = lerp(state.register, height * 1.2, 0.08); // 0 .. +1.2 oct
  state.brightness = lerp(state.brightness, 0.25 + height * 0.7, 0.08);
  const dyn = Math.min(1, state.speed / 2.2);
  state.energy = lerp(state.energy, dyn, 0.12);

  const beatFrac = state.lastDownbeatMs
    ? ((now - state.lastDownbeatMs) / (60000 / Math.max(1, state.bpm))) % 1
    : 0;

  return { downbeat, phase: beatFrac };
}

export function sourceLabel(source: Source): string {
  return source === "human" ? "you conducting" : "ghost conductor";
}
