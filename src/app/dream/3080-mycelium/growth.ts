// ─────────────────────────────────────────────────────────────────────────────
// 3080 · Mycelium — space-colonization dendritic growth engine.
//
// A morphogenetic network grown with the Space Colonization Algorithm
// (Runions, Lane & Prusinkiewicz, "Modeling Trees with a Space Colonization
// Algorithm", Eurographics Workshop on Natural Phenomena, 2007). Attractor
// points ("nutrient") pull the nearest growth node; every influenced node steps
// one segment toward the *average* direction of the attractors pulling it, so
// branching emerges wherever a node is tugged in divergent directions. Tips
// that arrive near a foreign lineage FUSE (anastomosis) instead of pushing on —
// the fungal-network behaviour Fricker et al. describe for transport webs.
//
// The network is a PALIMPSEST: nodes are never deleted, so geometry is
// persistent evolving memory. Rendering (in page.tsx) lets old strands dim to a
// dark-violet floor rather than vanish.
//
// Deterministic: all randomness comes from an injected mulberry32 PRNG.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG — deterministic, no Math.random / Date.now anywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Node {
  x: number;
  y: number;
  parent: number; // index into nodes, -1 for a spore root
  depth: number; // generations from its spore root
  born: number; // performance.now() at creation
  active: boolean; // still a growth tip?
  length: number; // cumulative path length from root (drives voice pitch)
  fused: boolean; // arrived by anastomosis onto a foreign strand
}

interface Attractor {
  x: number;
  y: number;
  alive: boolean;
}

/** Result of one grow() step — new segments plus classified events. */
export interface GrowEvent {
  node: number; // index of the newly created node
  isFork: boolean; // parent already had a child → a genuine branch point
  isFuse: boolean; // anastomosis: tip merged into a foreign strand
}

export interface MyceliumConfig {
  width: number;
  height: number;
  maxNodes: number;
  attractionRadius: number; // attractors farther than this ignore a node
  killRadius: number; // attractors this close are consumed
  segmentLength: number; // step size per growth generation
  fuseRadius: number; // tip merges into a foreign node within this distance
}

export class Mycelium {
  nodes: Node[] = [];
  private attractors: Attractor[] = [];
  private childCount: number[] = []; // children spawned per node → fork detection
  private rnd: () => number;
  private cfg: MyceliumConfig;

  // Running tallies surfaced to the UI + audio.
  branchPoints = 0;
  totalLength = 0;

  constructor(cfg: MyceliumConfig, seed: number) {
    this.cfg = cfg;
    this.rnd = mulberry32(seed);
  }

  liveAttractorCount(): number {
    let n = 0;
    for (const a of this.attractors) if (a.alive) n++;
    return n;
  }

  /** Plant a spore: a fresh growth root at (x,y) that will colonise nearby food. */
  plantSpore(x: number, y: number, now: number): number {
    const i = this.nodes.length;
    this.nodes.push({
      x,
      y,
      parent: -1,
      depth: 0,
      born: now,
      active: true,
      length: 0,
      fused: false,
    });
    this.childCount.push(0);
    return i;
  }

  /** Scatter `count` attractor points ("nutrient") in a disc around (cx,cy). */
  scatterNutrient(count: number, cx: number, cy: number, radius: number): void {
    const { width, height } = this.cfg;
    for (let i = 0; i < count; i++) {
      // Uniform disc sample via sqrt radius, jittered by the seeded PRNG.
      const t = this.rnd() * Math.PI * 2;
      const r = Math.sqrt(this.rnd()) * radius;
      const x = Math.max(4, Math.min(width - 4, cx + Math.cos(t) * r));
      const y = Math.max(4, Math.min(height - 4, cy + Math.sin(t) * r));
      this.attractors.push({ x, y, alive: true });
    }
  }

  /**
   * Advance the network by one space-colonization step.
   * `vigour` (0..1+) scales how many attractors we let act this frame so growth
   * feels alive-but-calm and can run indefinitely.
   */
  grow(vigour: number): GrowEvent[] {
    const events: GrowEvent[] = [];
    if (this.nodes.length >= this.cfg.maxNodes) return events;

    const { attractionRadius, killRadius, segmentLength, fuseRadius } = this.cfg;
    const ar2 = attractionRadius * attractionRadius;

    // Accumulate a pull vector per node from every attractor that "chooses" it.
    // Map keyed by node index → {dx,dy,count}.
    const pull = new Map<number, { dx: number; dy: number; n: number }>();

    for (const a of this.attractors) {
      if (!a.alive) continue;
      // Find the nearest node to this attractor.
      let best = -1;
      let bestD2 = ar2;
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (!node.active) continue;
        const dx = a.x - node.x;
        const dy = a.y - node.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      if (best < 0) continue;
      const node = this.nodes[best];
      const dx = a.x - node.x;
      const dy = a.y - node.y;
      const len = Math.hypot(dx, dy) || 1;
      const e = pull.get(best);
      if (e) {
        e.dx += dx / len;
        e.dy += dy / len;
        e.n += 1;
      } else {
        pull.set(best, { dx: dx / len, dy: dy / len, n: 1 });
      }
    }

    if (pull.size === 0) return events;

    // Optionally throttle how many pulled nodes actually step this frame.
    const entries = Array.from(pull.entries());
    const budget = Math.max(1, Math.round(entries.length * Math.min(1, vigour)));

    const now = performance.now();
    let stepped = 0;
    for (const [ni, e] of entries) {
      if (stepped >= budget) break;
      if (this.nodes.length >= this.cfg.maxNodes) break;
      const parent = this.nodes[ni];
      if (!parent.active) continue;

      // Average pull direction + a little seeded jitter for organic wander.
      let dirx = e.dx / e.n;
      let diry = e.dy / e.n;
      const jitter = 0.35;
      dirx += (this.rnd() - 0.5) * jitter;
      diry += (this.rnd() - 0.5) * jitter;
      const dlen = Math.hypot(dirx, diry) || 1;
      dirx /= dlen;
      diry /= dlen;

      const nx = parent.x + dirx * segmentLength;
      const ny = parent.y + diry * segmentLength;

      // --- Anastomosis: does this tip land on a FOREIGN strand? If so, fuse. ---
      let fusedInto = -1;
      const fr2 = fuseRadius * fuseRadius;
      for (let j = 0; j < this.nodes.length; j++) {
        if (j === ni) continue;
        const o = this.nodes[j];
        // Skip our own immediate neighbourhood (parent / very shallow kin).
        if (o.parent === ni || ni === o.parent) continue;
        const ddx = nx - o.x;
        const ddy = ny - o.y;
        if (ddx * ddx + ddy * ddy < fr2) {
          fusedInto = j;
          break;
        }
      }

      const childIdx = this.nodes.length;
      const isFork = this.childCount[ni] > 0; // parent already branched → fork
      const segLen = Math.hypot(nx - parent.x, ny - parent.y);

      this.nodes.push({
        x: fusedInto >= 0 ? this.nodes[fusedInto].x : nx,
        y: fusedInto >= 0 ? this.nodes[fusedInto].y : ny,
        parent: ni,
        depth: parent.depth + 1,
        born: now,
        active: fusedInto < 0, // a fused tip stops growing
        length: parent.length + segLen,
        fused: fusedInto >= 0,
      });
      this.childCount.push(0);
      this.childCount[ni] += 1;
      this.totalLength += segLen;
      if (isFork) this.branchPoints += 1;

      events.push({ node: childIdx, isFork, isFuse: fusedInto >= 0 });
      stepped++;
    }

    // Consume attractors that any active tip has reached.
    for (const a of this.attractors) {
      if (!a.alive) continue;
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (!node.active) continue;
        const dx = a.x - node.x;
        const dy = a.y - node.y;
        if (dx * dx + dy * dy < killRadius * killRadius) {
          a.alive = false;
          break;
        }
      }
    }

    return events;
  }

  /**
   * Nearest node to a pointer, for plucking a living strand. Returns the node
   * index and its distance, or null if nothing is within `maxDist`.
   */
  nearestNode(x: number, y: number, maxDist: number): { index: number; dist: number } | null {
    let best = -1;
    let bestD2 = maxDist * maxDist;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const dx = x - node.x;
      const dy = y - node.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best < 0) return null;
    return { index: best, dist: Math.sqrt(bestD2) };
  }
}
