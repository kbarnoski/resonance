// arc.ts — 2108-remap-field
//
// The stateful ~5-minute arc + the "self-map" model.
//
// The self is modelled as a parcellation: ~40 territories (seed points), each
// with a position, a hue/colour, and an "identity" scalar. The arc drives a
// single scalar `coherence` in [0,1] through four phases. As coherence falls
// the territory borders dissolve (handled in the shader) and the audio voices
// glide to unison; at the floor there is one boundless field. On the return,
// the seeds have MOVED and the hues RE-ROLLED (deterministic PRNG keyed to an
// integer that increments each cycle) — so you re-crystallise into a DIFFERENT
// map. You come back re-organised, not restored.
//
// Grounding: Siegel, Nichols, Dosenbach et al., "Psilocybin desynchronizes the
// human brain", Nature 2024 — ego-dissolution as desynchronisation that
// dissolves the distinctions between networks, with re-organisation that
// persists. See README.md.
//
// Determinism: no Math.random() / Date.now() in any loop. Seeds and hues come
// from mulberry32; timing comes from performance.now() (passed in as seconds).

export type PhaseName = "Bounded" | "Desync" | "Boundless" | "Return";

export interface Seed {
  x: number; // [0,1]
  y: number; // [0,1]
  hue: number; // [0,1)
  identity: number; // [0,1]
  r: number;
  g: number;
  b: number;
}

export interface ArcState {
  coherence: number; // slew-limited actual coherence [0,1]
  phase: PhaseName;
  progress: number; // [0,1) position within the current cycle
  cycle: number; // increments every full arc — each is a new map
  bias: number; // current steer bias [-0.5, 0.5]
  seeds: Seed[]; // blended seeds for the visuals (current -> next by morph)
  seedsCurrent: Seed[]; // the stable map we started this cycle in
  seedsNext: Seed[]; // the map we are re-crystallising into
  mapSeed: number; // integer key of the current stable map (for audio)
  nextMapSeed: number; // integer key of the map being formed (for audio)
}

export interface Arc {
  step(nowSec: number): ArcState;
  steer(delta: number): void; // + = shallower (more coherent), - = deeper
  release(): void; // hand control back to the autonomous arc
  getBias(): number;
}

// ── PRNG ───────────────────────────────────────────────────────────────────
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

// ── Seed field (the self-map) ────────────────────────────────────────────────
const COLS = 8;
const ROWS = 5; // 8 x 5 = 40 territories
export const SEED_COUNT = COLS * ROWS;

// A jittered grid reads more like a parcellation map than pure white noise:
// roughly even territories, organically deformed.
export function makeSeeds(mapSeed: number): Seed[] {
  const rng = mulberry32((Math.imul(mapSeed, 0x9e3779b9) ^ 0x85ebca6b) >>> 0);
  const seeds: Seed[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const jx = (rng() - 0.5) * 0.95;
      const jy = (rng() - 0.5) * 0.95;
      const x = clamp((c + 0.5 + jx) / COLS, 0.02, 0.98);
      const y = clamp((r + 0.5 + jy) / ROWS, 0.03, 0.97);
      // Hue centred on the violet band (~0.72) but wide enough to give each
      // territory a distinct voice. Wraps around the circle.
      const hue = fract(0.72 + (rng() - 0.5) * 1.05);
      const sat = 0.5 + rng() * 0.32;
      const val = 0.72 + rng() * 0.22;
      const [rr, gg, bb] = hsv2rgb(hue, sat, val);
      seeds.push({ x, y, hue, identity: rng(), r: rr, g: gg, b: bb });
    }
  }
  return seeds;
}

function blendSeeds(a: Seed[], b: Seed[], m: number): Seed[] {
  const out: Seed[] = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const s = a[i];
    const d = b[i];
    out[i] = {
      x: lerp(s.x, d.x, m),
      y: lerp(s.y, d.y, m),
      hue: s.hue,
      identity: s.identity,
      r: lerp(s.r, d.r, m),
      g: lerp(s.g, d.g, m),
      b: lerp(s.b, d.b, m),
    };
  }
  return out;
}

// ── Arc timing ───────────────────────────────────────────────────────────────
// One full cycle ≈ 5 minutes. Phase fractions of the cycle:
const CYCLE_SEC = 300;
const P_BOUNDED = 0.2; // 0.00–0.20  crisp map
const P_DESYNC = 0.42; // 0.20–0.42  borders diffuse
const P_FLOOR = 0.62; // 0.42–0.62  boundless plasma (~60s)
// 0.62–1.00  re-crystallise into a NEW map

// Morph of the seed positions/hues (old map -> new map). Happens WHILE the
// field is dissolved so the movement is hidden, and completes just as the
// borders re-form on the return.
function morphAt(local: number): number {
  return smoothstep(0.45, 0.7, local);
}

function autonomousTarget(local: number): { phase: PhaseName; target: number } {
  if (local < P_BOUNDED) return { phase: "Bounded", target: 0.9 };
  if (local < P_DESYNC) {
    const k = (local - P_BOUNDED) / (P_DESYNC - P_BOUNDED);
    return { phase: "Desync", target: lerp(0.9, 0.02, k) };
  }
  if (local < P_FLOOR) return { phase: "Boundless", target: 0.02 };
  const k = (local - P_FLOOR) / (1 - P_FLOOR);
  return { phase: "Return", target: lerp(0.02, 0.85, k) };
}

const SLEW_PER_SEC = 0.16; // max change of coherence/sec — slow, never a flash

export function createArc(seedBase: number): Arc {
  let coherence = 0.9;
  let bias = 0;
  let cycle = 0;
  let seedsCurrent = makeSeeds(seedBase + cycle);
  let seedsNext = makeSeeds(seedBase + cycle + 1);
  let startSec = -1;
  let lastSec = -1;

  return {
    steer(delta: number) {
      bias = clamp(bias + delta, -0.5, 0.5);
    },
    release() {
      bias = 0;
    },
    getBias() {
      return bias;
    },
    step(nowSec: number): ArcState {
      if (startSec < 0) {
        startSec = nowSec;
        lastSec = nowSec;
      }
      const dt = clamp(nowSec - lastSec, 0, 0.1);
      lastSec = nowSec;

      const elapsed = nowSec - startSec;
      const cycIdx = Math.floor(elapsed / CYCLE_SEC);
      if (cycIdx > cycle) {
        // Rolled into a new cycle: the map we returned into becomes the new
        // stable map, and we roll a fresh target for the cycle after this.
        cycle = cycIdx;
        seedsCurrent = seedsNext;
        seedsNext = makeSeeds(seedBase + cycle + 1);
      }
      const local = (elapsed - cycle * CYCLE_SEC) / CYCLE_SEC;

      const { phase, target } = autonomousTarget(local);
      const goal = clamp(target + bias, 0, 1);
      const maxStep = SLEW_PER_SEC * dt;
      coherence += clamp(goal - coherence, -maxStep, maxStep);

      const m = morphAt(local);
      const seeds = blendSeeds(seedsCurrent, seedsNext, m);

      return {
        coherence,
        phase,
        progress: local,
        cycle,
        bias,
        seeds,
        seedsCurrent,
        seedsNext,
        mapSeed: seedBase + cycle,
        nextMapSeed: seedBase + cycle + 1,
      };
    },
  };
}
