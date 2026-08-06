// ─────────────────────────────────────────────────────────────────────────────
// memory.ts — the authored MEMORY: a fixed, discrete list of timed events that a
// traveling wave will later re-fire. Pure data + math, no React, no DOM.
//
//   A "memory" is just an ordered list of MemoryEvent {x, y, tNorm, degree}.
//   x,y live in centered, aspect-normalized field coordinates (y up, radius ~1 at
//   the shorter screen half). tNorm is the authoring order along the gesture;
//   degree (0..6) selects a scale step. The wave does NOT read tNorm to fire —
//   it fires each event when the expanding radial front crosses that event's
//   RADIUS, so replay order is inner→outer (the tunnel rush). tNorm survives only
//   to draw the gesture the way it was authored.
//
//   Determinism: the default seed-gesture uses an inline mulberry32 PRNG. No
//   Math.random / Date anywhere in the lab — replay must be reproducible.
// ─────────────────────────────────────────────────────────────────────────────

export interface MemoryEvent {
  /** centered, aspect-normalized field coords (y up). */
  x: number;
  y: number;
  /** authoring position along the gesture, [0,1]. */
  tNorm: number;
  /** scale degree, 0..6, into the just-intonation modal scale. */
  degree: number;
}

/** Deterministic PRNG — the lab bans Math.random(). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anti-pentatonic 7-note JUST-INTONATION modal scale (ratios over the tonic).
 *  1, 9/8, 6/5, 4/3, 3/2, 8/5, 9/5 — a minor-leaning mode, deliberately not a
 *  plain major pentatonic. */
export const SCALE_RATIOS = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 9 / 5];

/** Keyboard authoring: home-row keys drop / play scale degrees. */
export const KEY_DEGREE: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  g: 4,
  h: 5,
  j: 6,
};

const GOLDEN_ANGLE = 2.399963229728653;

/** Map a field y (up positive, ~[-1,1]) to a scale degree 0..6. */
export function yToDegree(y: number): number {
  const t = Math.min(1, Math.max(0, y * 0.5 + 0.5));
  return Math.min(6, Math.max(0, Math.round(t * 6)));
}

/** Clamp a point's radius into the field the wave actually sweeps. */
function clampToField(x: number, y: number): [number, number] {
  const r = Math.hypot(x, y);
  if (r < 1e-4) return [0.04, 0.0];
  const cr = Math.min(1.4, Math.max(0.035, r));
  const s = cr / r;
  return [x * s, y * s];
}

/** Resample a raw drawn path into a fixed, evenly arc-length-spaced list of
 *  events. Degree comes from height; tNorm from position along the stroke. */
export function resamplePath(
  raw: { x: number; y: number }[],
  target = 30,
): MemoryEvent[] {
  const pts = raw.filter((p, i) => i === 0 || Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) > 1e-4);
  if (pts.length < 2) return [];

  // cumulative arc length
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-3) return [];

  const n = Math.max(6, Math.min(48, Math.round(target * Math.min(1.4, total))));
  const out: MemoryEvent[] = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * total;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const span = cum[j] - cum[j - 1] || 1;
    const f = (s - cum[j - 1]) / span;
    const x = pts[j - 1].x + (pts[j].x - pts[j - 1].x) * f;
    const y = pts[j - 1].y + (pts[j].y - pts[j - 1].y) * f;
    const [cx, cy] = clampToField(x, y);
    out.push({ x: cx, y: cy, tNorm: i / (n - 1), degree: yToDegree(cy) });
  }
  return out;
}

/** A seeded default memory so Start demos instantly: a slow outward spiral.
 *  Inner events fire first, so the wave replays as an accelerating tunnel rush. */
export function defaultMemory(seed = 0x7640): MemoryEvent[] {
  const rnd = mulberry32(seed);
  const n = 34;
  const out: MemoryEvent[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const ang = i * GOLDEN_ANGLE + (rnd() - 0.5) * 0.25;
    const r = 0.05 + f * 1.28 + (rnd() - 0.5) * 0.04;
    const [x, y] = clampToField(Math.cos(ang) * r, Math.sin(ang) * r);
    out.push({ x, y, tNorm: f, degree: yToDegree(y) });
  }
  return out;
}

/** Append a keyboard-authored event. Each successive keypress steps outward on a
 *  golden-angle spiral, so typing builds a coherent replayable tunnel. */
export function keyboardEvent(index: number, degree: number): MemoryEvent {
  const ang = index * GOLDEN_ANGLE;
  const r = 0.09 + ((index % 22) / 22) * 1.25;
  const [x, y] = clampToField(Math.cos(ang) * r, Math.sin(ang) * r);
  return { x, y, tNorm: (index % 22) / 22, degree };
}
