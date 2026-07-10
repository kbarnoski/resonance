// ─────────────────────────────────────────────────────────────────────────────
// field.ts — the deterministic noise field + the geometric "latent-pattern"
// detector for 1396-apophenia-field.
//
//   Everything here is pure and seeded (mulberry32, never Math.random / Date.now)
//   so the field is identical every run and the piece is headless-verifiable.
//   The detector is tuned GENEROUSLY: in a dense drifting field almost any locus
//   sits near *some* near-collinear triple, so seeking is reliably rewarded — the
//   self-fulfilling "it was always there the moment I looked" quality that IS the
//   apophenia point.
// ─────────────────────────────────────────────────────────────────────────────

export const FIELD_W = 1000;
export const FIELD_H = 640;

/** Small, fast, deterministic PRNG. Seeded — no Math.random / Date.now. */
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

export interface FieldPoint {
  id: number;
  bx: number;
  by: number;
  /** drift amplitude / frequency / phase per axis */
  dax: number;
  day: number;
  dfx: number;
  dfy: number;
  dpx: number;
  dpy: number;
  /** twinkle phase + rate for slow luminance drift (never a strobe) */
  tw: number;
  tr: number;
}

/**
 * Build the point field. A jittered grid guarantees even coverage (so every
 * attention locus has neighbours to crystallise), plus a scatter of extras to
 * break the grid regularity.
 */
export function buildField(seed: number, count: number): FieldPoint[] {
  const rnd = mulberry32(seed);
  const points: FieldPoint[] = [];
  const cols = 16;
  const rows = 11;
  const margin = 46;
  const cw = (FIELD_W - margin * 2) / cols;
  const ch = (FIELD_H - margin * 2) / rows;
  let id = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (points.length >= count) break;
      const bx = margin + cw * (c + 0.5) + (rnd() - 0.5) * cw * 0.9;
      const by = margin + ch * (r + 0.5) + (rnd() - 0.5) * ch * 0.9;
      points.push(makePoint(id++, bx, by, rnd));
    }
  }
  // Fill the remainder with free scatter.
  while (points.length < count) {
    const bx = margin + rnd() * (FIELD_W - margin * 2);
    const by = margin + rnd() * (FIELD_H - margin * 2);
    points.push(makePoint(id++, bx, by, rnd));
  }
  return points;
}

function makePoint(id: number, bx: number, by: number, rnd: () => number): FieldPoint {
  return {
    id,
    bx,
    by,
    dax: 10 + rnd() * 16,
    day: 10 + rnd() * 16,
    dfx: 0.05 + rnd() * 0.13,
    dfy: 0.05 + rnd() * 0.13,
    dpx: rnd() * Math.PI * 2,
    dpy: rnd() * Math.PI * 2,
    tw: rnd() * Math.PI * 2,
    tr: 0.2 + rnd() * 0.5,
  };
}

export interface Vec {
  x: number;
  y: number;
}

/** Drifted position of a point at time `t` (seconds). `motion` 0..1 scales the
 *  drift so reduced-motion users get a near-still field. */
export function pointPos(p: FieldPoint, t: number, motion: number): Vec {
  return {
    x: p.bx + motion * p.dax * Math.sin(t * p.dfx + p.dpx),
    y: p.by + motion * p.day * Math.sin(t * p.dfy + p.dpy),
  };
}

/** Slow luminance drift in [0.16, 0.46] — a soft twinkle, never a flash. */
export function pointGlow(p: FieldPoint, t: number, motion: number): number {
  const s = 0.5 + 0.5 * Math.sin(t * p.tr * (0.4 + motion) + p.tw);
  return 0.16 + 0.3 * s;
}

// ── The latent-pattern detector ──────────────────────────────────────────────

export type SignKind = "line" | "mirror";

export interface DetectedSign {
  indices: number[];
  kind: SignKind;
  cx: number;
  cy: number;
  /** just-intonation frequencies, ascending, one per member point (cap 5) */
  notes: number[];
  score: number;
}

// 5-limit just major pentatonic — every combination is consonant.
const PENT = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function freqFromDegree(root: number, deg: number): number {
  const oct = Math.floor(deg / 5);
  const idx = ((deg % 5) + 5) % 5;
  return root * PENT[idx] * Math.pow(2, oct);
}

/** Turn a chosen set of member points into a persistent sign + its JI chord. */
function makeSign(
  positions: Vec[],
  members: number[],
  kind: SignKind,
  score: number,
): DetectedSign {
  const idx = members.slice(0, 5);
  let cx = 0;
  let cy = 0;
  for (const k of idx) {
    cx += positions[k].x;
    cy += positions[k].y;
  }
  cx /= idx.length;
  cy /= idx.length;

  // Order the members left-to-right so spacing reads consistently.
  const ordered = [...idx].sort(
    (m, n) => positions[m].x - positions[n].x || positions[m].y - positions[n].y,
  );

  // Register from centroid height: higher on screen → higher octave.
  const heightFrac = 1 - cy / FIELD_H;
  const baseOct = 1 + Math.round(heightFrac * 2); // 1..3
  const rootHz = 55 * Math.pow(2, baseOct); // 110 / 220 / 440

  // Inter-point spacing → interval steps through the just pentatonic.
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    gaps.push(dist(positions[ordered[i]], positions[ordered[i - 1]]));
  }
  const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1;

  const notes: number[] = [freqFromDegree(rootHz, 0)];
  let deg = 0;
  for (let i = 0; i < gaps.length; i++) {
    const step = Math.max(1, Math.min(4, Math.round(gaps[i] / (avg || 1) + 0.4)));
    deg += step;
    notes.push(freqFromDegree(rootHz, deg));
  }

  return { indices: ordered, kind, cx, cy, notes, score };
}

/**
 * Find the strongest latent sign near the attention locus, or null.
 * Runs a generous near-collinearity search plus a local mirror-symmetry search.
 */
export function detectSign(
  positions: Vec[],
  lx: number,
  ly: number,
  radius: number,
): DetectedSign | null {
  const r2 = radius * radius;
  const cand: { i: number; d: number }[] = [];
  for (let i = 0; i < positions.length; i++) {
    const dx = positions[i].x - lx;
    const dy = positions[i].y - ly;
    const d = dx * dx + dy * dy;
    if (d <= r2) cand.push({ i, d });
  }
  if (cand.length < 3) return null;
  cand.sort((a, b) => a.d - b.d);
  const cc = cand.slice(0, 12).map((c) => c.i);

  let best: DetectedSign | null = null;
  const tol = radius * 0.12; // generous perpendicular tolerance

  // ── near-collinear chains (≥3 points on a shared line) ──
  for (let a = 0; a < cc.length; a++) {
    for (let b = a + 1; b < cc.length; b++) {
      const A = positions[cc[a]];
      const B = positions[cc[b]];
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      if (len < radius * 0.28) continue; // need real extent
      const nx = -dy / len;
      const ny = dx / len;
      const members: number[] = [];
      let perpSum = 0;
      for (let k = 0; k < cc.length; k++) {
        const P = positions[cc[k]];
        const perp = Math.abs((P.x - A.x) * nx + (P.y - A.y) * ny);
        if (perp <= tol) {
          members.push(cc[k]);
          perpSum += perp;
        }
      }
      if (members.length < 3) continue;
      const straight = 1 - perpSum / members.length / tol;
      const score = members.length * 10 + straight * 4;
      if (!best || score > best.score) {
        best = makeSign(positions, members, "line", score);
      }
    }
  }

  // ── local mirror symmetry about the vertical axis through the locus ──
  const mtol = radius * 0.16;
  const pairs: number[] = [];
  const used = new Set<number>();
  for (let a = 0; a < cc.length; a++) {
    if (used.has(cc[a])) continue;
    const P = positions[cc[a]];
    const mx = 2 * lx - P.x; // reflected x
    let bestK = -1;
    let bestErr = mtol;
    for (let b = 0; b < cc.length; b++) {
      if (b === a || used.has(cc[b])) continue;
      const Q = positions[cc[b]];
      const err = Math.hypot(Q.x - mx, Q.y - P.y);
      if (err < bestErr) {
        bestErr = err;
        bestK = b;
      }
    }
    if (bestK >= 0) {
      used.add(cc[a]);
      used.add(cc[bestK]);
      pairs.push(cc[a], cc[bestK]);
    }
  }
  if (pairs.length >= 4) {
    // Mirror signs are rarer, so give them a bonus to surface as variety.
    const score = pairs.length * 10 + 8;
    if (!best || score > best.score) {
      best = makeSign(positions, pairs, "mirror", score);
    }
  }

  return best;
}

/** True if two signs share most of their points (avoid re-ringing the same sign). */
export function signsOverlap(a: number[], b: number[]): boolean {
  const set = new Set(a);
  let shared = 0;
  for (const k of b) if (set.has(k)) shared++;
  const min = Math.min(a.length, b.length);
  return min > 0 && shared / min >= 0.6;
}
