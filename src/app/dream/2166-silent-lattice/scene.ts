// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the two co-located line-architectures of the Silent Lattice.
//
//   Everything here is pure, deterministic geometry generated ONCE at module
//   load from a seeded PRNG (mulberry32). No Math.random / Date — ever. The
//   arrays exported below are FIXED LENGTH: the page renders one SVG element per
//   entry a single time, then mutates attributes per frame. The element pool is
//   bounded (see ELEMENT_BUDGET) and never grows.
//
//   Two architectures share one viewBox:
//     • ACTIVE_LINES  — a calm, legible isometric grid (the familiar, sensory-
//       connected world). Bright when dissociation depth D is low.
//     • IMPOSSIBLE_*  — an Escher machine of interpenetrating struts at
//       contradictory angles + Penrose "tribar" beams (the dormant/alien
//       architecture). Dark until D crosses the SWITCH, then it ignites.
//
//   Each element carries a `switchAt` in D-space, spread by its horizontal
//   position, so the SWITCH sweeps ACROSS the field as D rises — the familiar
//   motif fragments region-by-region while the alien one assembles in its place.
// ─────────────────────────────────────────────────────────────────────────────

export const VIEW = { w: 1200, h: 800 } as const;
const CX = VIEW.w / 2;
const CY = VIEW.h / 2;

/** Deterministic PRNG. Seeded once; NEVER Math.random / Date.now. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 0x51e17; // hard-coded — the lattice is the same every load.
const rnd = mulberry32(SEED);

// ── switchAt spread ──────────────────────────────────────────────────────────
// D-value at which a given element flips, biased by horizontal position so the
// switch sweeps left→right. Keeps the whole transition inside D∈[0.28, 0.58].
function switchAtForX(midX: number): number {
  const p = Math.min(1, Math.max(0, midX / VIEW.w));
  return 0.28 + 0.3 * p;
}

// ── ACTIVE: the familiar isometric grid ──────────────────────────────────────
export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  switchAt: number;
}

function isoFamily(angleDeg: number, spacing: number, halfExtent: number): GridLine[] {
  const th = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  const px = -dy; // perpendicular
  const py = dx;
  const L = 1000; // long enough to overrun the viewBox (clipped by overflow)
  const out: GridLine[] = [];
  for (let off = -halfExtent; off <= halfExtent; off += spacing) {
    const ox = CX + px * off;
    const oy = CY + py * off;
    const x1 = ox - dx * L;
    const y1 = oy - dy * L;
    const x2 = ox + dx * L;
    const y2 = oy + dy * L;
    out.push({ x1, y1, x2, y2, switchAt: switchAtForX((x1 + x2) / 2 + off * 0.6) });
  }
  return out;
}

// Three families at 30° / 150° / 90° read as a clean isometric cube grid.
export const ACTIVE_LINES: GridLine[] = [
  ...isoFamily(30, 82, 560),
  ...isoFamily(150, 82, 560),
  ...isoFamily(90, 96, 560),
];

// ── DORMANT: the impossible Escher machine ────────────────────────────────────
export interface Strut {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  switchAt: number;
  drift: number; // small per-strut rotation amplitude (radians)
  phase: number; // drift phase offset
}

export interface Hub {
  x: number;
  y: number;
}

// Hubs: shared vertices the struts fan out from — the joints of the machine.
export const HUBS: Hub[] = [];
{
  const n = 11;
  for (let i = 0; i < n; i++) {
    const x = 140 + rnd() * (VIEW.w - 280);
    const y = 120 + rnd() * (VIEW.h - 240);
    HUBS.push({ x, y });
  }
}

// Struts snap to a set of CONTRADICTORY angles that never resolve into a
// coherent Euclidean grid — the non-Euclidean, interpenetrating look.
const CONTRA_ANGLES = [14, 40, 76, 104, 130, 166];
export const IMPOSSIBLE_STRUTS: Strut[] = [];
{
  const count = 30;
  for (let i = 0; i < count; i++) {
    const h = HUBS[Math.floor(rnd() * HUBS.length)];
    const aDeg = CONTRA_ANGLES[Math.floor(rnd() * CONTRA_ANGLES.length)];
    const th = (aDeg * Math.PI) / 180;
    const len = 150 + rnd() * 260;
    const sign = rnd() < 0.5 ? -1 : 1;
    const x2 = h.x + Math.cos(th) * len * sign;
    const y2 = h.y + Math.sin(th) * len * sign;
    const midX = (h.x + x2) / 2;
    IMPOSSIBLE_STRUTS.push({
      x1: h.x,
      y1: h.y,
      x2,
      y2,
      switchAt: switchAtForX(midX),
      drift: (2 + rnd() * 5) * (Math.PI / 180), // ≤7° — small reorganising sway
      phase: rnd() * Math.PI * 2,
    });
  }
}

// ── Penrose "tribar" beams — the unmistakable impossible-object signal ────────
export interface Beam {
  d: string;
  switchAt: number;
}

/** One Penrose tribar as three beam quads. Cyclic paint order + end-overlap
 *  makes the occlusion contradict itself — the classic impossible triangle. */
function tribar(cx: number, cy: number, R: number, rotDeg: number): Beam[] {
  const rot = (rotDeg * Math.PI) / 180;
  const w = R * 0.3;
  const ext = w * 1.05;
  const P: [number, number][] = [];
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * 2 * Math.PI) / 3 - Math.PI / 2;
    P.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  const beams: Beam[] = [];
  for (let i = 0; i < 3; i++) {
    const a = P[i];
    const b = P[(i + 1) % 3];
    let ex = b[0] - a[0];
    let ey = b[1] - a[1];
    const eL = Math.hypot(ex, ey) || 1;
    ex /= eL;
    ey /= eL;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    let nx = cx - mx;
    let ny = cy - my;
    const nL = Math.hypot(nx, ny) || 1;
    nx /= nL;
    ny /= nL;
    const oAx = a[0] - ex * ext;
    const oAy = a[1] - ey * ext;
    const oBx = b[0] + ex * ext;
    const oBy = b[1] + ey * ext;
    const iAx = oAx + nx * w;
    const iAy = oAy + ny * w;
    const iBx = oBx + nx * w;
    const iBy = oBy + ny * w;
    const f = (v: number) => v.toFixed(1);
    beams.push({
      d: `M${f(oAx)} ${f(oAy)} L${f(oBx)} ${f(oBy)} L${f(iBx)} ${f(iBy)} L${f(iAx)} ${f(iAy)} Z`,
      switchAt: switchAtForX(cx),
    });
  }
  return beams;
}

// Three tribars at seeded positions — beams flattened into one paint-ordered
// list so each beam overlaps the previous (the impossible interlock).
export const IMPOSSIBLE_BEAMS: Beam[] = [];
{
  const specs = [
    { cx: 320, cy: 300, R: 150, rot: 8 },
    { cx: 860, cy: 480, R: 175, rot: 200 },
    { cx: 600, cy: 250, R: 120, rot: 110 },
  ];
  // nudge with the PRNG so it is seeded, not hand-placed to the pixel.
  for (const s of specs) {
    const cx = s.cx + (rnd() - 0.5) * 60;
    const cy = s.cy + (rnd() - 0.5) * 60;
    for (const beam of tribar(cx, cy, s.R, s.rot + (rnd() - 0.5) * 30)) {
      IMPOSSIBLE_BEAMS.push(beam);
    }
  }
}

// ── decoupling warp ───────────────────────────────────────────────────────────
// At high D the pointer no longer maps 1:1. We rotate/mirror the contact around
// centre and pull it toward the nearest impossible hub — "reality far off in the
// distance." `amt` is 0 (coupled, identity) → 1 (fully decoupled).
export function warp(x: number, y: number, amt: number): { x: number; y: number } {
  if (amt <= 0) return { x, y };
  // rotate about centre by up to ~150°, gently mirror across centre.
  const ang = amt * 2.6;
  const rx = x - CX;
  const ry = y - CY;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  let wx = CX + (rx * ca - ry * sa) * (1 - 0.35 * amt);
  let wy = CY + (rx * sa + ry * ca) * (1 - 0.35 * amt);
  // pull toward nearest hub as decoupling deepens.
  let best = HUBS[0];
  let bd = Infinity;
  for (const h of HUBS) {
    const d = (h.x - wx) ** 2 + (h.y - wy) ** 2;
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  const pull = 0.45 * amt;
  wx += (best.x - wx) * pull;
  wy += (best.y - wy) * pull;
  return { x: wx, y: wy };
}

// ── bounded element budget (documented invariant) ─────────────────────────────
export const MAX_CONTACTS = 8; // response markers reuse this pool
export const SPARK_POOL = 24;
export const ELEMENT_BUDGET =
  ACTIVE_LINES.length +
  IMPOSSIBLE_STRUTS.length +
  IMPOSSIBLE_BEAMS.length +
  HUBS.length +
  MAX_CONTACTS * 3 +
  SPARK_POOL; // ~145 — all created once, mutated in place, never destroyed.
