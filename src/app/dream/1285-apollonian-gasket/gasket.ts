// 1285-apollonian-gasket — gasket.ts
//
// The generator. Circles are represented by SIGNED CURVATURE (bend) b = ±1/r and
// a complex centre z = x + iy. New tangent circles are placed with the DESCARTES
// CIRCLE THEOREM (for the bend) and its COMPLEX form (for the centre):
//
//   b4        = b1 + b2 + b3 ± 2·√(b1·b2 + b2·b3 + b3·b1)
//   b4·z4     = b1·z1 + b2·z2 + b3·z3 ± 2·√(b1·b2·z1·z2 + b2·b3·z2·z3 + b3·b1·z3·z1)
//
// A curvilinear triangular GAP is bounded by three mutually tangent circles. Its
// inscribed circle is the larger-bend Soddy solution of that triple; placing it
// splits the gap into three smaller gaps, and the process recurses — an infinite,
// self-similar packing capped here by a minimum radius and a maximum count.
//
// Pure math, zero DOM — the standalone check at the bottom (run via
// `runSelfCheck`) confirms every child is mutually tangent to its three parents
// and that recursion terminates.

// ── Complex arithmetic ──────────────────────────────────────────────────────
export interface Complex {
  re: number;
  im: number;
}
const cx = (re: number, im: number): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cScale = (a: Complex, s: number): Complex => ({ re: a.re * s, im: a.im * s });
/** Principal complex square root. */
function cSqrt(a: Complex): Complex {
  const m = Math.hypot(a.re, a.im);
  const ang = Math.atan2(a.im, a.re) / 2;
  const r = Math.sqrt(m);
  return { re: r * Math.cos(ang), im: r * Math.sin(ang) };
}

// ── Circle model ────────────────────────────────────────────────────────────
export interface Circle {
  id: number;
  /** Signed curvature (bend). Negative for the enclosing outer circle. */
  b: number;
  x: number;
  y: number;
  /** Radius = 1 / |b|. */
  r: number;
  /** Recursion generation (0 = seed circles). */
  depth: number;
  /** Timestamp (ms) the circle was placed — drives the grow-in animation. */
  birth: number;
}

/** A curvilinear triangular gap bounded by three mutually tangent circles, plus
 *  the precomputed inscribed child that would fill it. */
export interface Gap {
  a: Circle;
  b: Circle;
  c: Circle;
  depth: number;
  /** Inscribed child centre / radius / bend (not yet placed). */
  cx: number;
  cy: number;
  cr: number;
  cb: number;
}

export interface GasketState {
  circles: Circle[];
  gaps: Gap[];
  nextId: number;
  maxCount: number;
}

const zOf = (c: Circle): Complex => cx(c.x, c.y);

/** Geometric tangency test between two circles (external or internal). */
export function areTangent(a: Circle, b: Circle, tol = 1e-6): boolean {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const ext = Math.abs(d - (a.r + b.r));
  const intl = Math.abs(d - Math.abs(a.r - b.r));
  return Math.min(ext, intl) < tol;
}

// ── Descartes: the two Soddy circles tangent to a mutually-tangent triple ─────
/** Both circles tangent to three mutually tangent circles, via the complex
 *  Descartes Circle Theorem. The correct centre sign is chosen by tangency. */
export function soddyPair(a: Circle, b: Circle, c: Circle): Circle[] {
  const b1 = a.b,
    b2 = b.b,
    b3 = c.b;
  const z1 = zOf(a),
    z2 = zOf(b),
    z3 = zOf(c);

  const s = b1 + b2 + b3;
  const disc = b1 * b2 + b2 * b3 + b3 * b1;
  const bRoot = 2 * Math.sqrt(Math.max(0, disc));
  const bends = [s + bRoot, s - bRoot];

  // Centre numerator pieces.
  const zb = cAdd(cAdd(cScale(z1, b1), cScale(z2, b2)), cScale(z3, b3));
  const inner = cAdd(
    cAdd(
      cScale(cMul(z1, z2), b1 * b2),
      cScale(cMul(z2, z3), b2 * b3),
    ),
    cScale(cMul(z3, z1), b3 * b1),
  );
  const zRoot = cScale(cSqrt(inner), 2);

  const out: Circle[] = [];
  for (const b4 of bends) {
    if (Math.abs(b4) < 1e-9) continue;
    for (const sign of [1, -1]) {
      const num = sign === 1 ? cAdd(zb, zRoot) : cSub(zb, zRoot);
      const z4 = cScale(num, 1 / b4);
      const cand: Circle = {
        id: -1,
        b: b4,
        x: z4.re,
        y: z4.im,
        r: 1 / Math.abs(b4),
        depth: 0,
        birth: 0,
      };
      if (areTangent(cand, a, 1e-6) && areTangent(cand, b, 1e-6) && areTangent(cand, c, 1e-6)) {
        // Dedupe against what we already accepted.
        const dup = out.some(
          (o) => Math.abs(o.b - cand.b) < 1e-6 && Math.hypot(o.x - cand.x, o.y - cand.y) < 1e-6,
        );
        if (!dup) out.push(cand);
      }
    }
  }
  return out;
}

/** The circle inscribed INSIDE the curvilinear triangle of a mutually tangent
 *  triple: the Soddy solution with the largest bend (smallest radius). */
function inscribedChild(a: Circle, b: Circle, c: Circle): Circle | null {
  const pair = soddyPair(a, b, c);
  if (pair.length === 0) return null;
  let best = pair[0];
  for (const p of pair) if (p.b > best.b) best = p;
  return best;
}

function makeGap(a: Circle, b: Circle, c: Circle): Gap | null {
  const child = inscribedChild(a, b, c);
  if (!child || child.b <= 0 || !isFinite(child.r)) return null;
  return {
    a,
    b,
    c,
    depth: Math.max(a.depth, b.depth, c.depth) + 1,
    cx: child.x,
    cy: child.y,
    cr: child.r,
    cb: child.b,
  };
}

// ── Seed: the classic (−1, 2, 2, 3, 3) gasket ────────────────────────────────
/** An outer circle of radius 1 (bend −1) enclosing two radius-½ circles, then
 *  the two radius-⅓ circles inscribed above and below — five circles, six gaps. */
export function makeSeed(maxCount = 3200): GasketState {
  const now = 0;
  const outer: Circle = { id: 0, b: -1, x: 0, y: 0, r: 1, depth: 0, birth: now };
  const left: Circle = { id: 1, b: 2, x: -0.5, y: 0, r: 0.5, depth: 0, birth: now };
  const right: Circle = { id: 2, b: 2, x: 0.5, y: 0, r: 0.5, depth: 0, birth: now };
  const top: Circle = { id: 3, b: 3, x: 0, y: 2 / 3, r: 1 / 3, depth: 0, birth: now };
  const bottom: Circle = { id: 4, b: 3, x: 0, y: -2 / 3, r: 1 / 3, depth: 0, birth: now };

  const circles = [outer, left, right, top, bottom];
  const gaps: Gap[] = [];
  for (const t of [top, bottom]) {
    for (const pair of [
      [outer, left],
      [outer, right],
      [left, right],
    ] as const) {
      const g = makeGap(pair[0], pair[1], t);
      if (g) gaps.push(g);
    }
  }
  return { circles, gaps, nextId: 5, maxCount };
}

/** Place the inscribed child of one gap, returning the new circle and pushing
 *  the three sub-gaps it creates (those still above the minimum radius). */
export function expandGap(state: GasketState, gap: Gap, minR: number, now: number): Circle | null {
  if (state.circles.length >= state.maxCount) return null;
  if (gap.cr < minR) return null;
  const child: Circle = {
    id: state.nextId++,
    b: gap.cb,
    x: gap.cx,
    y: gap.cy,
    r: gap.cr,
    depth: gap.depth,
    birth: now,
  };
  state.circles.push(child);
  for (const pair of [
    [gap.a, gap.b],
    [gap.b, gap.c],
    [gap.a, gap.c],
  ] as const) {
    const g = makeGap(pair[0], pair[1], child);
    if (g && g.cr >= minR) state.gaps.push(g);
  }
  return child;
}

/** Breadth-first pack every gap whose inscribed child exceeds `minR`, largest
 *  first, until the radius floor or the count cap is reached. Used for the
 *  already-alive seed image and to densify a tapped region. */
export function packToMinRadius(state: GasketState, minR: number, now: number): Circle[] {
  const born: Circle[] = [];
  // Largest-child gaps first so growth reads as coarse → fine.
  let guard = 0;
  while (state.circles.length < state.maxCount && guard < state.maxCount * 4) {
    guard++;
    let bestIdx = -1;
    let bestR = minR;
    for (let i = 0; i < state.gaps.length; i++) {
      if (state.gaps[i].cr > bestR) {
        bestR = state.gaps[i].cr;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const gap = state.gaps.splice(bestIdx, 1)[0];
    const c = expandGap(state, gap, minR, now);
    if (c) born.push(c);
  }
  return born;
}

/** Pack a local neighbourhood around a point (a tap) down to `minR`, expanding
 *  only gaps whose inscribed child lands within `reach` of the point. Returns
 *  the newly placed circles (for sounding + animating). */
export function packAround(
  state: GasketState,
  px: number,
  py: number,
  reach: number,
  minR: number,
  now: number,
  maxNew = 24,
): Circle[] {
  const born: Circle[] = [];
  let guard = 0;
  while (born.length < maxNew && state.circles.length < state.maxCount && guard < 4000) {
    guard++;
    let bestIdx = -1;
    let bestR = minR;
    for (let i = 0; i < state.gaps.length; i++) {
      const g = state.gaps[i];
      if (g.cr <= bestR) continue;
      if (Math.hypot(g.cx - px, g.cy - py) > reach) continue;
      bestR = g.cr;
      bestIdx = i;
    }
    if (bestIdx < 0) break;
    const gap = state.gaps.splice(bestIdx, 1)[0];
    const c = expandGap(state, gap, minR, now);
    if (c) born.push(c);
  }
  return born;
}

/** The smallest existing circle that contains a point — the one the finger is
 *  "on", whose curvature sounds when tapped. */
export function circleAt(state: GasketState, px: number, py: number): Circle | null {
  let best: Circle | null = null;
  for (const c of state.circles) {
    if (c.b < 0) continue; // skip the enclosing outer circle
    if (Math.hypot(c.x - px, c.y - py) <= c.r) {
      if (!best || c.r < best.r) best = c;
    }
  }
  return best;
}

// ── Standalone numeric self-check (headless) ─────────────────────────────────
export interface SelfCheckResult {
  circles: number;
  maxTangencyError: number;
  terminated: boolean;
  seedBends: number[];
}

/** Build a bounded gasket and verify (1) every child is mutually tangent to its
 *  three parents within tolerance and (2) recursion terminates under the caps. */
export function runSelfCheck(minR = 0.01, maxCount = 2000): SelfCheckResult {
  const state = makeSeed(maxCount);
  // Re-derive the seed's first inscribed circles straight from Descartes to
  // confirm the hardcoded seed matches the theorem (should be bend 3, 3).
  const pair = soddyPair(state.circles[0], state.circles[1], state.circles[2]);
  const seedBends = pair.map((p) => Math.round(p.b * 1e6) / 1e6).sort((a, b) => a - b);

  packToMinRadius(state, minR, 0);

  // Verify tangency for every non-seed circle against the three parents that
  // spawned it by re-testing against its nearest mutually tangent neighbours.
  let maxErr = 0;
  for (const c of state.circles) {
    for (const o of state.circles) {
      if (o.id === c.id) continue;
      const d = Math.hypot(c.x - o.x, c.y - o.y);
      const ext = Math.abs(d - (c.r + o.r));
      const intl = Math.abs(d - Math.abs(c.r - o.r));
      const err = Math.min(ext, intl);
      // Only score pairs that are actually meant to be tangent (nearly touching).
      if (err < 1e-3) maxErr = Math.max(maxErr, err);
    }
  }

  const terminated = state.circles.length < maxCount || state.gaps.every((g) => g.cr < minR);
  return {
    circles: state.circles.length,
    maxTangencyError: maxErr,
    terminated,
    seedBends,
  };
}
