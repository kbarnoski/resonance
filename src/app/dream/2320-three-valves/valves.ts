// ════════════════════════════════════════════════════════════════════════════
// 2320-three-valves · valves.ts
//
// Pure helpers, no React / DOM: the deterministic autopilot that self-demos the
// CGD cube, plus the phenomenology labels that make the axis-independence legible.
// ════════════════════════════════════════════════════════════════════════════

export interface CGD {
  c: number; // classifier relaxation → geometry
  g: number; // generator prior → figuration
  d: number; // reality monitoring → solidity
}

/** mulberry32 — tiny deterministic PRNG (no Math.random / Date.now anywhere). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tour that visits distinct octants of the cube — proving each corner reads
// (and sounds) categorically different, and that there is no single dial.
const WAYPOINTS: CGD[] = [
  { c: 0.15, g: 0.15, d: 0.5 }, // quiet graphite void
  { c: 0.92, g: 0.14, d: 0.14 }, // floating geometry · unreal
  { c: 0.9, g: 0.16, d: 0.92 }, // bound geometry · present
  { c: 0.16, g: 0.9, d: 0.2 }, // ghost figures · suppressed lattice
  { c: 0.15, g: 0.9, d: 0.9 }, // vivid vision · no lattice
  { c: 0.9, g: 0.88, d: 0.18 }, // figures in a drifting lattice
  { c: 0.92, g: 0.9, d: 0.92 }, // objective visions
  { c: 0.3, g: 0.3, d: 0.5 }, // ease back toward centre
];

const HOLD = 3.2; // seconds resting on a waypoint
const GLIDE = 3.0; // seconds gliding between waypoints
const LEG = HOLD + GLIDE;

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * Deterministic autopilot value at elapsed time `t` (seconds). Glides between
 * octant corners with a little seeded wobble so it feels alive, not robotic.
 */
export function autopilotAt(t: number, rng: () => number, wob: number): CGD {
  const total = WAYPOINTS.length * LEG;
  const tt = ((t % total) + total) % total;
  const idx = Math.floor(tt / LEG);
  const local = tt - idx * LEG;
  const a = WAYPOINTS[idx];
  const b = WAYPOINTS[(idx + 1) % WAYPOINTS.length];
  const k = local <= HOLD ? 0 : smoothstep((local - HOLD) / GLIDE);
  const w = 0.03 * wob;
  return {
    c: clamp01(a.c + (b.c - a.c) * k + (rng() - 0.5) * w),
    g: clamp01(a.g + (b.g - a.g) * k + (rng() - 0.5) * w),
    d: clamp01(a.d + (b.d - a.d) * k + (rng() - 0.5) * w),
  };
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// ── phenomenology labels ─────────────────────────────────────────────────────

/** One-word state for a single valve, so each fader reads independently. */
export function axisWord(axis: "c" | "g" | "d", v: number): string {
  const hi = v >= 0.5;
  if (axis === "c") return hi ? "geometric" : "tight";
  if (axis === "g") return hi ? "figurative" : "abstract";
  return hi ? "present" : "unreal";
}

/** The octant name — the categorical phenomenology of the current CGD corner. */
export function octantName(cgd: CGD): string {
  const c = cgd.c >= 0.5;
  const g = cgd.g >= 0.5;
  const d = cgd.d >= 0.5;
  if (!c && !g && !d) return "quiet graphite void";
  if (c && !g && !d) return "floating geometry · unreal";
  if (c && !g && d) return "bound geometry · present";
  if (!c && !g && d) return "sparse but solid";
  if (!c && g && !d) return "ghost figures · suppressed lattice";
  if (!c && g && d) return "vivid vision · no lattice";
  if (c && g && !d) return "figures in a drifting lattice";
  return "objective visions";
}
