/**
 * Space Colonization Algorithm — pure, framework-free.
 *
 * Reference: Runions, Lane & Prusinkiewicz, "Modeling Trees with a Space
 * Colonization Algorithm" (2007, algorithmicbotany.org). Creative-coding port
 * idiom follows Jason Webb, "Modeling organic branching structures with the
 * space colonization algorithm and JavaScript".
 *
 * The model: a cloud of ATTRACTOR points pulls a network of growth NODES
 * forward. Each attractor influences only its nearest node (within an
 * attraction radius). Each influenced node averages the directions to all
 * the attractors that picked it, steps one segment length in that direction,
 * and spawns a child node. Attractors within the kill radius are consumed.
 * Branching emerges naturally when a node is pulled in divergent directions.
 *
 * This module has NO React/DOM imports so it stays clean and testable.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Node {
  /** Position in field space. */
  x: number;
  y: number;
  /** Index of the parent node (-1 for a root). Defines the drawn segment. */
  parent: number;
  /** Branch depth from the nearest root (0 = root). Drives thickness/colour. */
  depth: number;
  /** Frame index at which this node was created. Used for age-based fade. */
  bornAt: number;
  /** Accumulated pull this step (reset every grow()). */
  dirX: number;
  dirY: number;
  /** How many attractors influenced this node this step. */
  influences: number;
  /** True once this node has spawned at least one child (no longer a tip). */
  hasChild: boolean;
}

export interface Attractor {
  x: number;
  y: number;
  /** True once consumed (within kill radius of some node). */
  dead: boolean;
}

/** A branch event emitted by grow() so the host can sonify splits. */
export interface BranchEvent {
  /** New node index. */
  node: number;
  x: number;
  y: number;
  depth: number;
  /** True when the parent already had a child this step → a true fork. */
  isFork: boolean;
}

export interface GrowthParams {
  width: number;
  height: number;
  /** Attractors farther than this from a node cannot influence it. */
  attractionRadius: number;
  /** Attractors closer than this to any node are consumed. */
  killRadius: number;
  /** Distance a node steps toward its averaged attractor direction. */
  segmentLength: number;
  /** Cap on total nodes; oldest are recycled past this. */
  maxNodes: number;
}

export const DEFAULT_PARAMS: GrowthParams = {
  width: 1280,
  height: 720,
  attractionRadius: 86,
  killRadius: 14,
  segmentLength: 7,
  maxNodes: 4200,
};

/** Small seeded PRNG (mulberry32) so growth is reproducible when desired but
 *  still "never the same twice" with a time seed. Pure, no globals. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Mycelium {
  params: GrowthParams;
  nodes: Node[] = [];
  attractors: Attractor[] = [];
  frame = 0;
  /** Ring-buffer write head for node recycling. */
  private recycleHead = 0;
  private rng: () => number;

  constructor(params: Partial<GrowthParams> = {}, seed = 1) {
    this.params = { ...DEFAULT_PARAMS, ...params };
    this.rng = makeRng(seed);
  }

  /** Seed N root nodes (growth origins). */
  seedRoots(count: number): void {
    const { width, height } = this.params;
    for (let i = 0; i < count; i++) {
      this.nodes.push({
        x: width * (0.2 + 0.6 * this.rng()),
        y: height * (0.25 + 0.5 * this.rng()),
        parent: -1,
        depth: 0,
        bornAt: this.frame,
        dirX: 0,
        dirY: 0,
        influences: 0,
        hasChild: false,
      });
    }
  }

  /** Scatter a fresh cloud of attractors. Called in slow waves so the network
   *  keeps colonising NEW territory — this is what makes minute 5 ≠ minute 1. */
  seedAttractors(count: number, region?: { cx: number; cy: number; r: number }): void {
    const { width, height } = this.params;
    for (let i = 0; i < count; i++) {
      let x: number;
      let y: number;
      if (region) {
        // Rejection-sample a disc for a localised colonisation front.
        const ang = this.rng() * Math.PI * 2;
        const rad = region.r * Math.sqrt(this.rng());
        x = region.cx + Math.cos(ang) * rad;
        y = region.cy + Math.sin(ang) * rad;
      } else {
        x = this.rng() * width;
        y = this.rng() * height;
      }
      x = Math.max(0, Math.min(width, x));
      y = Math.max(0, Math.min(height, y));
      this.attractors.push({ x, y, dead: false });
    }
  }

  get rand(): () => number {
    return this.rng;
  }

  /** Count of attractors still alive. Lets the host know when to reseed. */
  liveAttractorCount(): number {
    let n = 0;
    for (const a of this.attractors) if (!a.dead) n++;
    return n;
  }

  /**
   * One growth step. Returns the branch events produced (for audio).
   *
   * @param growthScale 0..1+ multiplier on how many influenced nodes actually
   *        step this frame. Driven by breath RMS for "breathe → bloom faster".
   */
  grow(growthScale = 1): BranchEvent[] {
    this.frame++;
    const {
      attractionRadius,
      killRadius,
      segmentLength,
      maxNodes,
    } = this.params;
    const ar2 = attractionRadius * attractionRadius;
    const kr2 = killRadius * killRadius;

    // Reset per-step pull accumulators.
    for (const n of this.nodes) {
      n.dirX = 0;
      n.dirY = 0;
      n.influences = 0;
    }

    // For each live attractor, find its nearest node within the attraction
    // radius and add the normalised direction to that node's accumulator.
    for (const a of this.attractors) {
      if (a.dead) continue;
      let best = -1;
      let bestD2 = ar2;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        const dx = a.x - n.x;
        const dy = a.y - n.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      if (best >= 0) {
        const n = this.nodes[best];
        const dx = a.x - n.x;
        const dy = a.y - n.y;
        const len = Math.hypot(dx, dy) || 1;
        n.dirX += dx / len;
        n.dirY += dy / len;
        n.influences++;
      }
    }

    // Step influenced nodes forward, spawning children.
    const events: BranchEvent[] = [];
    const parentChildCount = new Map<number, number>();
    const snapshotLen = this.nodes.length; // don't iterate over new children
    for (let i = 0; i < snapshotLen; i++) {
      const n = this.nodes[i];
      if (n.influences === 0) continue;
      // Stochastic throttle by breath: low growthScale → some nodes skip.
      if (growthScale < 1 && this.rng() > Math.max(0.06, growthScale)) continue;

      let dx = n.dirX / n.influences;
      let dy = n.dirY / n.influences;
      const len = Math.hypot(dx, dy);
      if (len < 1e-4) continue;
      dx /= len;
      dy /= len;
      // Slight jitter so filaments wander organically, not ruler-straight.
      const jitter = (this.rng() - 0.5) * 0.35;
      const cos = Math.cos(jitter);
      const sin = Math.sin(jitter);
      const jx = dx * cos - dy * sin;
      const jy = dx * sin + dy * cos;

      const childX = n.x + jx * segmentLength;
      const childY = n.y + jy * segmentLength;

      const priorChildren = parentChildCount.get(i) ?? (n.hasChild ? 1 : 0);
      const isFork = priorChildren >= 1;
      parentChildCount.set(i, priorChildren + 1);
      n.hasChild = true;

      const child: Node = {
        x: childX,
        y: childY,
        parent: i,
        depth: n.depth + 1,
        bornAt: this.frame,
        dirX: 0,
        dirY: 0,
        influences: 0,
        hasChild: false,
      };

      const idx = this.pushNode(child);
      events.push({
        node: idx,
        x: childX,
        y: childY,
        depth: child.depth,
        isFork,
      });
    }

    // Consume attractors within the kill radius of any node.
    if (events.length > 0 || this.frame % 2 === 0) {
      for (const a of this.attractors) {
        if (a.dead) continue;
        for (let i = 0; i < this.nodes.length; i++) {
          const n = this.nodes[i];
          const dx = a.x - n.x;
          const dy = a.y - n.y;
          if (dx * dx + dy * dy < kr2) {
            a.dead = true;
            break;
          }
        }
      }
    }

    // Periodically compact the dead attractors so the inner loop stays cheap.
    if (this.frame % 120 === 0) {
      this.attractors = this.attractors.filter((a) => !a.dead);
    }

    // Recycle: once at the node cap, the oldest nodes are dropped logically by
    // the host (age fade) and physically by overwriting via the ring head.
    void maxNodes;
    return events;
  }

  /** Push a node, recycling the oldest slot once at the cap. Returns its index. */
  private pushNode(child: Node): number {
    const { maxNodes } = this.params;
    if (this.nodes.length < maxNodes) {
      this.nodes.push(child);
      return this.nodes.length - 1;
    }
    // At capacity: overwrite the oldest non-root slot in a ring. Roots (parent
    // -1) are skipped so the network never fully detaches.
    let tries = 0;
    while (tries < maxNodes) {
      const slot = this.recycleHead % maxNodes;
      this.recycleHead++;
      tries++;
      if (this.nodes[slot] && this.nodes[slot].parent !== -1) {
        // Reparent orphans of the recycled node onto its grandparent to keep
        // segments drawable (a recycled node's children would point at a slot
        // that now holds different data; cheaper to just let the host's age
        // fade hide them — we clamp parent so draw stays valid).
        this.nodes[slot] = child;
        // Fix the new node's parent if it referenced the just-overwritten slot.
        if (child.parent === slot) child.parent = -1;
        return slot;
      }
    }
    // All roots (degenerate): append anyway.
    this.nodes.push(child);
    return this.nodes.length - 1;
  }
}
