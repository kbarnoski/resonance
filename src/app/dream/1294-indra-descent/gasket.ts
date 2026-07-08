// 1294-indra-descent — gasket.ts
//
// The generator + the TANGENCY GRAPH. Circles are signed-curvature (bend b = ±1/r)
// records with a complex centre. Every new tangent circle is placed by the
// DESCARTES CIRCLE THEOREM (bend) and its COMPLEX companion (centre):
//
//   b4      = b1 + b2 + b3 ± 2·√(b1·b2 + b2·b3 + b3·b1)
//   b4·z4   = b1·z1 + b2·z2 + b3·z3 ± 2·√(b1·b2·z1·z2 + b2·b3·z2·z3 + b3·b1·z3·z1)
//
// A curvilinear triangular GAP is bounded by three mutually tangent circles; its
// inscribed child is the larger-bend Soddy solution. Placing it splits the gap
// into three and the packing recurses toward the infinite-nesting limit.
//
// NEW HERE (never built in the lab before): as each child is inscribed we record
// its EXACT tangencies — a child is tangent to precisely the three circles that
// bounded its gap — building an adjacency graph. `bfsCascade` walks that graph so
// one strike unfolds a decaying, self-similar arpeggio hopping outward along the
// tangent edges. Pure math, zero DOM.

// ── Complex arithmetic ──────────────────────────────────────────────────────
interface Complex {
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
  /** Timestamp (ms) the circle was placed — drives the ease-in animation. */
  birth: number;
  /** Ids of every mutually tangent neighbour — the resonance graph. */
  neighbors: number[];
}

/** A curvilinear triangular gap bounded by three mutually tangent circles (by id),
 *  plus the precomputed inscribed child that would fill it. */
export interface Gap {
  a: number;
  b: number;
  c: number;
  depth: number;
  cx: number;
  cy: number;
  cr: number;
  cb: number;
}

export interface GasketState {
  circles: Circle[];
  byId: Map<number, Circle>;
  gaps: Gap[];
  nextId: number;
  maxCount: number;
}

const zOf = (c: Circle): Complex => cx(c.x, c.y);

/** Geometric tangency test (external or internal). */
export function areTangent(a: Circle, b: Circle, tol = 1e-6): boolean {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const ext = Math.abs(d - (a.r + b.r));
  const intl = Math.abs(d - Math.abs(a.r - b.r));
  return Math.min(ext, intl) < tol;
}

// ── Descartes: the two Soddy circles tangent to a mutually-tangent triple ─────
function soddyPair(a: Circle, b: Circle, c: Circle): Circle[] {
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

  const zb = cAdd(cAdd(cScale(z1, b1), cScale(z2, b2)), cScale(z3, b3));
  const inner = cAdd(
    cAdd(cScale(cMul(z1, z2), b1 * b2), cScale(cMul(z2, z3), b2 * b3)),
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
        neighbors: [],
      };
      if (areTangent(cand, a, 1e-6) && areTangent(cand, b, 1e-6) && areTangent(cand, c, 1e-6)) {
        const dup = out.some(
          (o) => Math.abs(o.b - cand.b) < 1e-6 && Math.hypot(o.x - cand.x, o.y - cand.y) < 1e-6,
        );
        if (!dup) out.push(cand);
      }
    }
  }
  return out;
}

/** The circle inscribed inside the curvilinear triangle: the largest-bend Soddy
 *  solution (smallest radius). */
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
    a: a.id,
    b: b.id,
    c: c.id,
    depth: Math.max(a.depth, b.depth, c.depth) + 1,
    cx: child.x,
    cy: child.y,
    cr: child.r,
    cb: child.b,
  };
}

// ── Tangency graph plumbing ──────────────────────────────────────────────────
function link(a: Circle, b: Circle): void {
  if (!a.neighbors.includes(b.id)) a.neighbors.push(b.id);
  if (!b.neighbors.includes(a.id)) b.neighbors.push(a.id);
}

// ── Seed: the classic (−1, 2, 2, 3, 3) gasket ────────────────────────────────
export function makeSeed(maxCount = 4000): GasketState {
  const now = 0;
  const mk = (id: number, b: number, x: number, y: number, r: number): Circle => ({
    id,
    b,
    x,
    y,
    r,
    depth: 0,
    birth: now,
    neighbors: [],
  });
  const outer = mk(0, -1, 0, 0, 1);
  const left = mk(1, 2, -0.5, 0, 0.5);
  const right = mk(2, 2, 0.5, 0, 0.5);
  const top = mk(3, 3, 0, 2 / 3, 1 / 3);
  const bottom = mk(4, 3, 0, -2 / 3, 1 / 3);

  const circles = [outer, left, right, top, bottom];
  const byId = new Map<number, Circle>();
  for (const c of circles) byId.set(c.id, c);

  // Exact seed tangencies via geometry (outer touches all four internally).
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++)
      if (areTangent(circles[i], circles[j], 1e-9)) link(circles[i], circles[j]);

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
  return { circles, byId, gaps, nextId: 5, maxCount };
}

/** Place the inscribed child of one gap, wiring its three tangencies into the
 *  graph and queuing the three sub-gaps it opens. Returns the new circle. */
export function expandGap(state: GasketState, gap: Gap, minR: number, now: number): Circle | null {
  if (state.circles.length >= state.maxCount) return null;
  if (gap.cr < minR) return null;
  const a = state.byId.get(gap.a);
  const b = state.byId.get(gap.b);
  const c = state.byId.get(gap.c);
  if (!a || !b || !c) return null; // a parent was pruned during a dive — drop gap

  const child: Circle = {
    id: state.nextId++,
    b: gap.cb,
    x: gap.cx,
    y: gap.cy,
    r: gap.cr,
    depth: gap.depth,
    birth: now,
    neighbors: [],
  };
  state.circles.push(child);
  state.byId.set(child.id, child);
  link(child, a);
  link(child, b);
  link(child, c);

  for (const pair of [
    [a, b],
    [b, c],
    [a, c],
  ] as const) {
    const g = makeGap(pair[0], pair[1], child);
    if (g && g.cr >= minR) state.gaps.push(g);
  }
  return child;
}

/** Breadth-first pack every gap whose child exceeds `minR`, largest first, until
 *  the radius floor or count cap is hit. Builds the already-alive seed image. */
export function packToMinRadius(state: GasketState, minR: number, now: number): Circle[] {
  const born: Circle[] = [];
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

export interface ViewBox {
  scale: number; // world → px
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** Lazily inscribe children whose ON-SCREEN radius has grown past `minScreenPx`
 *  and that fall inside the viewport — the engine of the dive: as the camera
 *  falls into a cusp, ever-finer nesting streams in exactly where it is needed.
 *  Largest-child-first; capped per call so it eases in over several frames. */
export function packForView(
  state: GasketState,
  view: ViewBox,
  minScreenPx: number,
  maxNew: number,
  now: number,
): Circle[] {
  const born: Circle[] = [];
  const { scale, cx: vx, cy: vy, w, h } = view;
  const halfW = w / 2 / scale;
  const halfH = h / 2 / scale;
  const margin = Math.max(halfW, halfH) * 0.35;
  const minWorld = minScreenPx / scale;

  let guard = 0;
  while (born.length < maxNew && state.circles.length < state.maxCount && guard < 6000) {
    guard++;
    let bestIdx = -1;
    let bestR = minWorld;
    for (let i = 0; i < state.gaps.length; i++) {
      const g = state.gaps[i];
      if (g.cr <= bestR) continue;
      // child must be on (or near) screen so we only pack what will be seen
      if (g.cx < vx - halfW - margin || g.cx > vx + halfW + margin) continue;
      if (g.cy < vy - halfH - margin || g.cy > vy + halfH + margin) continue;
      bestR = g.cr;
      bestIdx = i;
    }
    if (bestIdx < 0) break;
    const gap = state.gaps.splice(bestIdx, 1)[0];
    const c = expandGap(state, gap, minWorld, now);
    if (c) born.push(c);
  }
  return born;
}

/** Drop enclosing ancestors that have ballooned far off-screen during a sustained
 *  dive, so the packing budget is recycled into fresh nesting and the descent
 *  never runs out. Only removes circles bigger than the whole view AND well
 *  outside it — never anything visible. Returns how many were pruned. */
export function pruneOffscreen(state: GasketState, view: ViewBox): number {
  const { scale, cx: vx, cy: vy, w, h } = view;
  const viewWorld = Math.max(w, h) / scale;
  const halfW = w / 2 / scale;
  const halfH = h / 2 / scale;
  const doomed: number[] = [];
  for (const c of state.circles) {
    if (c.r < viewWorld * 1.5) continue; // not an over-grown encloser
    // fully outside an expanded viewport?
    const dx = Math.abs(c.x - vx);
    const dy = Math.abs(c.y - vy);
    if (dx - c.r > halfW * 3 || dy - c.r > halfH * 3 || c.r > viewWorld * 40) {
      doomed.push(c.id);
    }
  }
  if (doomed.length === 0) return 0;
  const drop = new Set(doomed);
  for (const id of drop) {
    const c = state.byId.get(id);
    if (c) for (const nId of c.neighbors) {
      const n = state.byId.get(nId);
      if (n) n.neighbors = n.neighbors.filter((x) => x !== id);
    }
    state.byId.delete(id);
  }
  state.circles = state.circles.filter((c) => !drop.has(c.id));
  state.gaps = state.gaps.filter((g) => !drop.has(g.a) && !drop.has(g.b) && !drop.has(g.c));
  return doomed.length;
}

/** Smallest existing circle that contains a point — the one under the finger. */
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

// ── Tangency-graph resonance cascade ─────────────────────────────────────────
export interface Arrival {
  id: number;
  /** Graph hop-distance from the struck circle (0 = the struck circle). */
  hop: number;
  /** Neighbour we arrived from — the tangent edge that lights (−1 at origin). */
  fromId: number;
  /** Scheduling offset from the strike, in ms (∝ hop). */
  delayMs: number;
  /** Amplitude 0..1, decaying per hop. */
  amp: number;
}

export interface CascadeOptions {
  maxHops: number;
  maxNodes: number;
  hopMs: number;
  decay: number;
  /** Max tangent edges followed out of any one circle (keeps it musical). */
  branch: number;
}

/** Breadth-first walk of the tangency graph from `startId`: each hop rings later
 *  (delay ∝ hop) and quieter (amp ×= decay), fanning out along tangent edges into
 *  a self-similar arpeggio that cascades down the packing. */
export function bfsCascade(state: GasketState, startId: number, opts: CascadeOptions): Arrival[] {
  const start = state.byId.get(startId);
  if (!start) return [];
  const { maxHops, maxNodes, hopMs, decay, branch } = opts;

  const arrivals: Arrival[] = [{ id: startId, hop: 0, fromId: -1, delayMs: 0, amp: 1 }];
  const visited = new Set<number>([startId]);
  let head = 0;

  while (head < arrivals.length && arrivals.length < maxNodes) {
    const cur = arrivals[head++];
    if (cur.hop >= maxHops) continue;
    const circle = state.byId.get(cur.id);
    if (!circle) continue;

    // Prefer the largest (lowest, most consonant) unvisited neighbours first.
    const next = circle.neighbors
      .filter((nId) => !visited.has(nId))
      .map((nId) => state.byId.get(nId))
      .filter((n): n is Circle => !!n && n.b > 0) // never ring the outer frame
      .sort((a, b) => b.r - a.r)
      .slice(0, branch);

    for (const n of next) {
      if (arrivals.length >= maxNodes) break;
      visited.add(n.id);
      arrivals.push({
        id: n.id,
        hop: cur.hop + 1,
        fromId: cur.id,
        delayMs: (cur.hop + 1) * hopMs,
        amp: Math.pow(decay, cur.hop + 1),
      });
    }
  }
  return arrivals;
}

/** The external tangent point between two circles (on the segment of centres). */
export function tangentPoint(a: Circle, b: Circle): { x: number; y: number } {
  const t = a.r / (a.r + b.r);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ── Standalone numeric self-check (headless, no DOM) ─────────────────────────
export interface SelfCheckResult {
  circles: number;
  maxTangencyError: number;
  graphEdges: number;
  graphConsistent: boolean;
  seedBends: number[];
}

/** Verify (1) every child is tangent to its recorded neighbours within tolerance,
 *  (2) the adjacency graph is symmetric, and (3) recursion terminates. */
export function runSelfCheck(minR = 0.01, maxCount = 1500): SelfCheckResult {
  const state = makeSeed(maxCount);
  const pair = soddyPair(state.circles[0], state.circles[1], state.circles[2]);
  const seedBends = pair.map((p) => Math.round(p.b * 1e6) / 1e6).sort((a, b) => a - b);

  packToMinRadius(state, minR, 0);

  let maxErr = 0;
  let edges = 0;
  let consistent = true;
  for (const c of state.circles) {
    for (const nId of c.neighbors) {
      edges++;
      const n = state.byId.get(nId);
      if (!n) {
        consistent = false;
        continue;
      }
      if (!n.neighbors.includes(c.id)) consistent = false; // symmetry
      const d = Math.hypot(c.x - n.x, c.y - n.y);
      const err = Math.min(Math.abs(d - (c.r + n.r)), Math.abs(d - Math.abs(c.r - n.r)));
      maxErr = Math.max(maxErr, err);
    }
  }
  return {
    circles: state.circles.length,
    maxTangencyError: maxErr,
    graphEdges: edges / 2,
    graphConsistent: consistent,
    seedBends,
  };
}
