// ════════════════════════════════════════════════════════════════════════════
// Mirror Hall — acoustics engine (3328)
//
// A real 2D implementation of the IMAGE-SOURCE METHOD (Allen & Berkley 1979,
// "Image method for efficiently simulating small-room acoustics"). The room is
// a convex-ish quadrilateral. A source S is mirrored across each wall to make
// first-order image sources; those are recursively mirrored to make 2nd/3rd
// order images (a "hall of mirrors"). Each candidate image is then VALIDATED by
// reconstructing the specular ray path back through its reflecting walls — an
// image only contributes an echo tap if every reflection point actually lands
// on its wall segment and the ray is not blocked by another wall. That pruning
// is what makes this physically correct rather than a naive echo grid.
// ════════════════════════════════════════════════════════════════════════════

export interface Vec {
  x: number;
  y: number;
}

/** Speed of sound in air, m/s. */
export const SPEED_OF_SOUND = 343;

/** A room is an ordered ring of vertices; wall i spans verts[i] → verts[i+1]. */
export type Polygon = Vec[];

export function polygonWalls(poly: Polygon): [Vec, Vec][] {
  const n = poly.length;
  const walls: [Vec, Vec][] = [];
  for (let i = 0; i < n; i++) walls.push([poly[i], poly[(i + 1) % n]]);
  return walls;
}

function reflectAcrossLine(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return { x: 2 * projX - p.x, y: 2 * projY - p.y };
}

interface Hit {
  x: number;
  y: number;
  t: number; // param along segment p1→p2
  u: number; // param along segment p3→p4
}

function segSegIntersect(p1: Vec, p2: Vec, p3: Vec, p4: Vec): Hit | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y, t, u };
}

// ── Candidate image sources (before validation) ─────────────────────────────
interface ImageCandidate {
  pos: Vec; // mirrored source position
  order: number;
  walls: number[]; // reflection order: first wall reflected … last wall reflected
  chain: Vec[]; // chain[0]=S, chain[k]=image after reflecting across walls[0..k-1]
}

function buildImageCandidates(
  walls: [Vec, Vec][],
  source: Vec,
  maxOrder: number,
): ImageCandidate[] {
  const out: ImageCandidate[] = [];
  const recurse = (pos: Vec, order: number, wallSeq: number[], chain: Vec[]) => {
    if (order >= maxOrder) return;
    for (let i = 0; i < walls.length; i++) {
      // Reflecting twice across the same wall in a row is a no-op.
      if (wallSeq.length > 0 && wallSeq[wallSeq.length - 1] === i) continue;
      const img = reflectAcrossLine(pos, walls[i][0], walls[i][1]);
      const newSeq = [...wallSeq, i];
      const newChain = [...chain, img];
      out.push({ pos: img, order: order + 1, walls: newSeq, chain: newChain });
      recurse(img, order + 1, newSeq, newChain);
    }
  };
  recurse(source, 0, [], [source]);
  return out;
}

// ── A validated reflection path → one impulse-response tap ──────────────────
export interface Tap {
  order: number;
  delay: number; // seconds
  gain: number; // linear amplitude
  pathLength: number; // metres
  points: Vec[]; // full ray: [S, p1, …, pn, L]
  image: Vec; // the mirrored image-source position (for the "hall of mirrors")
}

const EPS = 1e-6;

/**
 * Reconstruct + validate the specular path for one image candidate.
 * Walks from the listener back toward the source, intersecting each wall in
 * reverse reflection order. Returns the ray points if valid, else null.
 */
function validatePath(
  cand: ImageCandidate,
  walls: [Vec, Vec][],
  listener: Vec,
): Vec[] | null {
  const points: Vec[] = [];
  let target = listener;
  for (let k = cand.walls.length - 1; k >= 0; k--) {
    const wallIdx = cand.walls[k];
    const imageK = cand.chain[k + 1]; // image after reflecting across walls[0..k]
    const [wa, wb] = walls[wallIdx];
    const hit = segSegIntersect(target, imageK, wa, wb);
    if (!hit) return null;
    // Reflection point must lie on the wall segment and between listener/image.
    if (hit.u < EPS || hit.u > 1 - EPS) return null;
    if (hit.t < EPS || hit.t > 1 - EPS) return null;
    points.unshift({ x: hit.x, y: hit.y });
    target = { x: hit.x, y: hit.y };
  }
  const full = [cand.chain[0], ...points, listener];

  // Blocking test: no ray segment may cross a wall other than the ones it
  // reflects off at its own endpoints.
  for (let s = 0; s < full.length - 1; s++) {
    const a = full[s];
    const b = full[s + 1];
    // Walls used at this segment's endpoints (reflection points), excluded.
    const endWalls = new Set<number>();
    if (s >= 1 && s - 1 < cand.walls.length) endWalls.add(cand.walls[cand.walls.length - s]);
    if (s < cand.walls.length) endWalls.add(cand.walls[cand.walls.length - 1 - s]);
    for (let w = 0; w < walls.length; w++) {
      if (endWalls.has(w)) continue;
      const hit = segSegIntersect(a, b, walls[w][0], walls[w][1]);
      if (!hit) continue;
      if (hit.t > EPS && hit.t < 1 - EPS && hit.u > EPS && hit.u < 1 - EPS) {
        return null;
      }
    }
  }
  return full;
}

function pathLength(points: Vec[]): number {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) {
    d += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return d;
}

export interface AcousticsResult {
  taps: Tap[];
  flutterRisk: number; // 0..1
  flutterPeriodMs: number; // ms between the periodic reflections, if any
  spreadMs: number; // spread of early reflections (last early tap − direct), ms
}

/**
 * Full solve: direct sound + validated image sources → impulse-response taps,
 * plus a flutter-echo diagnosis derived directly from the tap train.
 *
 * @param absorption 0 (hard, mirror walls) … 1 (fully absorbing)
 */
export function computeAcoustics(
  poly: Polygon,
  source: Vec,
  listener: Vec,
  absorption: number,
  maxOrder = 3,
): AcousticsResult {
  const walls = polygonWalls(poly);
  const reflCoeff = Math.max(0, 1 - absorption); // pressure reflection per wall
  const taps: Tap[] = [];

  // Order 0 — the direct sound.
  const directLen = Math.hypot(listener.x - source.x, listener.y - source.y);
  if (directLen > 1e-6) {
    taps.push({
      order: 0,
      delay: directLen / SPEED_OF_SOUND,
      gain: 1 / directLen,
      pathLength: directLen,
      points: [source, listener],
      image: source,
    });
  }

  // Orders 1..maxOrder — validated image sources.
  const candidates = buildImageCandidates(walls, source, maxOrder);
  for (const cand of candidates) {
    const ray = validatePath(cand, walls, listener);
    if (!ray) continue;
    const len = pathLength(ray);
    if (len < 1e-6) continue;
    const gain = Math.pow(reflCoeff, cand.order) / len;
    taps.push({
      order: cand.order,
      delay: len / SPEED_OF_SOUND,
      gain,
      pathLength: len,
      points: ray,
      image: cand.pos,
    });
  }

  taps.sort((a, b) => a.delay - b.delay);
  const flutter = diagnoseFlutter(poly, taps, absorption);
  return { taps, ...flutter };
}

// ── Flutter-echo diagnosis ──────────────────────────────────────────────────
// A flutter echo is the ringing you get between two PARALLEL, reflective walls:
// the source and its higher-order images line up into an equally-spaced train
// whose period is 2·d/c (d = wall separation). So the risk is grounded in the
// geometry the visitor actually drags: how parallel each opposing wall pair is,
// scaled by how reflective the walls are. Splaying a wall breaks the alignment
// and the flutter dies — exactly the decision the sandbox lets you get wrong.
function diagnoseFlutter(
  poly: Polygon,
  taps: Tap[],
  absorption: number,
): { flutterRisk: number; flutterPeriodMs: number; spreadMs: number } {
  // Real early-reflection spread, straight from the validated taps.
  const refl = taps.filter((t) => t.order >= 1);
  const direct = taps.find((t) => t.order === 0);
  const directMs = direct ? direct.delay * 1000 : 0;
  const spreadMs =
    refl.length > 0 ? Math.max(0, refl[refl.length - 1].delay * 1000 - directMs) : 0;

  const n = poly.length;
  const reflectivity = Math.max(0, 1 - absorption);
  let bestRisk = 0;
  let bestPeriodMs = 0;
  let sumSq = 0;
  let pairs = 0;

  // Opposing wall pairs (for a quad: 0↔2, 1↔3).
  const half = Math.floor(n / 2);
  for (let i = 0; i < half; i++) {
    const j = i + half;
    if (j >= n) break;
    const wa: [Vec, Vec] = [poly[i], poly[(i + 1) % n]];
    const wb: [Vec, Vec] = [poly[j], poly[(j + 1) % n]];
    const da = norm({ x: wa[1].x - wa[0].x, y: wa[1].y - wa[0].y });
    const db = norm({ x: wb[1].x - wb[0].x, y: wb[1].y - wb[0].y });
    const parallelism = Math.abs(da.x * db.x + da.y * db.y); // 1 = parallel
    const midA = { x: (wa[0].x + wa[1].x) / 2, y: (wa[0].y + wa[1].y) / 2 };
    const midB = { x: (wb[0].x + wb[1].x) / 2, y: (wb[0].y + wb[1].y) / 2 };
    const d = Math.hypot(midA.x - midB.x, midA.y - midB.y);
    // Parallelism dominates (cubed), reflective walls sustain the train, and
    // the walls must actually be some distance apart to ring.
    const farFactor = Math.max(0.35, Math.min(1, d / 3));
    const risk = 0.72 * Math.pow(parallelism, 3) * reflectivity * farFactor;
    sumSq += risk * risk;
    pairs += 1;
    if (risk > bestRisk) {
      bestRisk = risk;
      bestPeriodMs = ((2 * d) / SPEED_OF_SOUND) * 1000;
    }
  }
  // A single fully-parallel pair still rings (worst pair leads), but splaying
  // one axis of a rectangle should visibly help — so blend worst-case with RMS.
  const rms = pairs > 0 ? Math.sqrt(sumSq / pairs) : 0;
  const flutterRisk = Math.min(1, 0.55 * bestRisk + 0.45 * rms);
  return { flutterRisk, flutterPeriodMs: bestPeriodMs, spreadMs };
}

function norm(v: Vec): Vec {
  const m = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / m, y: v.y / m };
}
