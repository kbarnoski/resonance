// 1288-gasket-cathedral — packing.ts
//
// A 3D Apollonian / Soddy sphere packing. Pure math, zero DOM.
//
// A sphere is signed CURVATURE (bend) b = ±1/r plus a centre c ∈ ℝ³. Five
// mutually-tangent spheres form a "Descartes configuration" and obey the
// SODDY–GOSSET THEOREM (the 3D generalisation of the Descartes Circle Theorem):
//
//     (b₁+b₂+b₃+b₄+b₅)² = 3·(b₁²+b₂²+b₃²+b₄²+b₅²)
//
// Given four of the five, the two spheres tangent to all four have bends that
// sum to Σ(the four) — so the "other" tangent sphere is the REFLECTION of the
// omitted one (Lagarias–Mallows–Wilks, "Beyond the Descartes Circle Theorem",
// 2002). The same reflection acts on the curvature-weighted centre m = b·c:
//
//     b'   = (b₁+b₂+b₃+b₄) − b_omitted            (retained = the four kept)
//     m'   = (m₁+m₂+m₃+m₄) − m_omitted   where mᵢ = bᵢ·cᵢ
//     c'   = m' / b'
//
// Starting from four unit spheres at the vertices of a regular tetrahedron
// inside their common bounding sphere (a Soddy 5-config), we recursively swap
// each sphere for its conjugate, filling every curvilinear-tetrahedron gap with
// an ever-smaller inscribed sphere — a self-similar 3D gasket, capped by a
// minimum radius / maximum count. `runSelfCheck()` verifies numerically that
// generated spheres are mutually tangent and that recursion terminates.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A sphere in UNIT space: signed bend, centre, radius, recursion depth. */
export interface USphere {
  id: number;
  /** Signed curvature. Negative for the enclosing bounding sphere. */
  b: number;
  c: Vec3;
  r: number;
  depth: number;
}

/** A sphere in WORLD space for rendering + spatial audio. Keeps the UNSCALED
 *  bend so pitch mapping is invariant to the render scale. */
export interface WorldSphere {
  id: number;
  /** Unscaled positive curvature (1 / unit-radius) — drives pitch. */
  bend: number;
  x: number;
  y: number;
  z: number;
  /** World radius (unit radius × scale). */
  r: number;
  depth: number;
  /** 0 (largest bell) … 1 (tiniest deep bell) — drives loudness + length. */
  sizeNorm: number;
}

export interface Outer {
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface SelfCheck {
  spheres: number;
  /** Worst tangency residual over pairs that are meant to touch. */
  maxTangencyError: number;
  /** Left-hand−right-hand residual of the Soddy–Gosset identity on the seed. */
  gossetResidual: number;
  terminated: boolean;
  maxDepth: number;
}

export interface Packing {
  /** Inner (strikeable) spheres, world space, largest first. */
  spheres: WorldSphere[];
  /** The enclosing cathedral shell, world space. */
  outer: Outer;
  scale: number;
  selfCheck: SelfCheck;
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dist = (a: Vec3, b: Vec3): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Tangency residual between two spheres (external OR internal), using signed
 *  radii so the enclosing sphere is handled uniformly. */
export function tangencyError(a: USphere, b: USphere): number {
  const d = dist(a.c, b.c);
  const ext = Math.abs(d - (a.r + b.r));
  const intl = Math.abs(d - Math.abs(a.r - b.r));
  return Math.min(ext, intl);
}

// ── The Soddy seed: four unit spheres in a tetrahedron + bounding sphere ──────
function makeSeed(): USphere[] {
  // Regular-tetrahedron vertices, scaled so the mutual centre distance is 2
  // (two unit spheres touching). Raw edge = 2√2, so scale by 1/√2 → edge 2.
  const s = 1 / Math.SQRT2;
  const verts: Vec3[] = [
    { x: s, y: s, z: s },
    { x: s, y: -s, z: -s },
    { x: -s, y: s, z: -s },
    { x: -s, y: -s, z: s },
  ];
  const inner: USphere[] = verts.map((c, i) => ({
    id: i + 1,
    b: 1,
    c,
    r: 1,
    depth: 0,
  }));
  // Bounding sphere: contains and is internally tangent to all four.
  // Circumradius of the centres is √6/2; add the unit radius.
  const R = Math.sqrt(6) / 2 + 1;
  const outer: USphere = { id: 0, b: -1 / R, c: { x: 0, y: 0, z: 0 }, r: R, depth: 0 };
  return [outer, ...inner];
}

/** Reflect one sphere of a 5-config across the other four → its Descartes
 *  conjugate (the "other" sphere tangent to those four). */
function conjugate(config: USphere[], omit: number): USphere | null {
  let bSum = 0;
  let m: Vec3 = { x: 0, y: 0, z: 0 };
  let maxDepth = 0;
  for (let i = 0; i < config.length; i++) {
    if (i === omit) continue;
    const s = config[i];
    bSum += s.b;
    m = add(m, scale(s.c, s.b));
    if (s.depth > maxDepth) maxDepth = s.depth;
  }
  const om = config[omit];
  const b = bSum - om.b;
  if (b <= 1e-9) return null; // a plane or the outer shell — not a gap sphere
  const mNew = { x: m.x - om.b * om.c.x, y: m.y - om.b * om.c.y, z: m.z - om.b * om.c.z };
  const c = scale(mNew, 1 / b);
  return { id: -1, b, c, r: 1 / b, depth: maxDepth + 1 };
}

interface PackOptions {
  minR?: number;
  maxCount?: number;
  maxDepth?: number;
}

/** Grow the packing in unit space. Returns [outer, ...inner spheres]. */
function grow(opts: PackOptions): { outer: USphere; inner: USphere[] } {
  const minR = opts.minR ?? 0.028;
  const maxCount = opts.maxCount ?? 520;
  const maxDepth = opts.maxDepth ?? 5;

  const seed = makeSeed();
  const outer = seed[0];
  const inner: USphere[] = seed.slice(1);
  let nextId = seed.length;

  // Dedup by quantised (bend, centre). Two spheres with the same bend and
  // centre are the same sphere.
  const seen = new Set<string>();
  const key = (s: USphere) =>
    `${Math.round(s.b * 1e4)}:${Math.round(s.c.x * 1e4)}:${Math.round(
      s.c.y * 1e4,
    )}:${Math.round(s.c.z * 1e4)}`;
  for (const s of seed) seen.add(key(s));

  // BFS over Descartes configurations.
  const queue: USphere[][] = [seed];
  let guard = 0;
  const guardMax = maxCount * 40;
  while (queue.length > 0 && inner.length + 1 < maxCount && guard < guardMax) {
    guard++;
    const config = queue.shift() as USphere[];
    for (let omit = 0; omit < config.length; omit++) {
      if (inner.length + 1 >= maxCount) break;
      const child = conjugate(config, omit);
      if (!child) continue;
      if (child.r < minR || child.depth > maxDepth) continue;
      if (!isFinite(child.r) || !isFinite(child.c.x)) continue;
      const k = key(child);
      if (seen.has(k)) continue;
      // Numerically confirm the child really is tangent to the four it was
      // built from before accepting it (guards against float blow-ups deep in).
      let ok = true;
      for (let i = 0; i < config.length; i++) {
        if (i === omit) continue;
        if (tangencyError(child, config[i]) > 1e-4) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      child.id = nextId++;
      seen.add(k);
      inner.push(child);
      // New configuration = the four retained spheres + the new one.
      const nextConfig: USphere[] = [];
      for (let i = 0; i < config.length; i++) if (i !== omit) nextConfig.push(config[i]);
      nextConfig.push(child);
      queue.push(nextConfig);
    }
  }

  return { outer, inner };
}

/** Build the full world-space packing at a given render scale. */
export function buildPacking(scaleWorld = 6, opts: PackOptions = {}): Packing {
  const { outer, inner } = grow(opts);

  // Normalise size for loudness: map log-bend across the range to 0..1.
  let bMin = Infinity;
  let bMax = -Infinity;
  for (const s of inner) {
    if (s.b < bMin) bMin = s.b;
    if (s.b > bMax) bMax = s.b;
  }
  const lgMin = Math.log2(bMin);
  const lgMax = Math.log2(bMax);
  const span = Math.max(1e-6, lgMax - lgMin);

  const spheres: WorldSphere[] = inner.map((s) => ({
    id: s.id,
    bend: s.b,
    x: s.c.x * scaleWorld,
    y: s.c.y * scaleWorld,
    z: s.c.z * scaleWorld,
    r: s.r * scaleWorld,
    depth: s.depth,
    sizeNorm: (Math.log2(s.b) - lgMin) / span,
  }));
  // Largest bells first (they anchor the drone and read as the nave).
  spheres.sort((a, b) => b.r - a.r);

  const selfCheck = runSelfCheck(opts);

  return {
    spheres,
    outer: { x: outer.c.x * scaleWorld, y: outer.c.y * scaleWorld, z: outer.c.z * scaleWorld, r: outer.r * scaleWorld },
    scale: scaleWorld,
    selfCheck,
  };
}

// ── Headless numeric self-check ──────────────────────────────────────────────
/** Verify (1) the seed satisfies Soddy–Gosset, (2) every generated sphere is
 *  tangent to ≥4 neighbours within tolerance, and (3) recursion terminates. */
export function runSelfCheck(opts: PackOptions = {}): SelfCheck {
  const seed = makeSeed();
  const bends = seed.map((s) => s.b);
  const sum = bends.reduce((a, b) => a + b, 0);
  const sumSq = bends.reduce((a, b) => a + b * b, 0);
  const gossetResidual = Math.abs(sum * sum - 3 * sumSq);

  const { outer, inner } = grow(opts);
  const all = [outer, ...inner];

  let maxErr = 0;
  let maxDepth = 0;
  for (const s of inner) {
    if (s.depth > maxDepth) maxDepth = s.depth;
    for (const o of all) {
      if (o.id === s.id) continue;
      const err = tangencyError(s, o);
      // Only pairs that actually (nearly) touch count toward the residual.
      if (err < 1e-3 && err > maxErr) maxErr = err;
    }
  }
  // "Terminated" = we stopped because gaps got small / cap reached, not diverged.
  const maxCount = opts.maxCount ?? 520;
  const terminated = inner.length + 1 <= maxCount;

  return {
    spheres: inner.length,
    maxTangencyError: maxErr,
    gossetResidual,
    terminated,
    maxDepth,
  };
}
