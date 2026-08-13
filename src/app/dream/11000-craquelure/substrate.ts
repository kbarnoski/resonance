// ─────────────────────────────────────────────────────────────────────────────
// substrate.ts — an agent-based crack-propagation engine after Jared Tarbell's
// *Substrate* (complexification.net/gallery/substrate). This is NOT a PDE, a
// cellular automaton, a mass-spring, or a mechanism sim. It is a colony of
// line-agents ("cracks"). Each crack advances one step per tick along a fixed
// heading, claiming unvisited cells of a coarse spatial grid. When a crack runs
// off the plane, or reaches a cell already claimed by a crack at a sufficiently
// DIFFERENT angle, it dies — and spawns 1–2 fresh cracks at a perpendicular
// (±90° with a few degrees of jitter) heading, seeded along the existing web.
// The grid is a Uint16Array of quantized crack-angles, so collisions are O(1).
//
// The engine owns its SVG output: every crack is a growing <polyline>. It emits
// birth / death events for the sonification layer, and runs a long-form cycle —
// it fills the plane, then dissolves and reseeds — so minute 5 differs from
// minute 1.
// ─────────────────────────────────────────────────────────────────────────────

/** Logical drawing space; the <svg> viewBox is `0 0 W H`. */
export const W = 1000;
export const H = 1000;

// ── Tunables (calm, ~2-minute fill) ──────────────────────────────────────────
const GW = 210; // coarse grid columns
const GH = 210; // coarse grid rows
const CELL_W = W / GW;
const CELL_H = H / GH;
const SPEED = 1.0; // viewBox units advanced per tick — sub-cell, no tunnelling
const COLLIDE_DEG = 14; // angular difference (0..90) that counts as a collision
const SAMPLE = 6; // min travel between recorded polyline vertices
const MIN_ALIVE = 4; // keep-alive floor so growth never stalls
const MAX_ALIVE = 11; // ceiling — keeps the piece meditative, not frantic
const SPAWN_TRIES = 6; // attempts to find a viable perpendicular seed
const FILL_THRESHOLD = 0.28; // claimed-cell fraction that triggers dissolve
const DISSOLVE_FRAMES = 720; // ~12 s fade-out before reseeding
const SVG_NS = "http://www.w3.org/2000/svg";

const DIE = 0;
const ALIVE = 1;

export interface SubstrateCallbacks {
  /** Fired when a crack first draws — a note is struck. */
  onBirth?: (gen: number, angleDeg: number) => void;
  /** Fired when a drawn crack collides and dies — a damped tone. */
  onDeath?: (gen: number, angleDeg: number) => void;
  onDissolveStart?: () => void;
  onReseed?: () => void;
}

interface Crack {
  x: number;
  y: number;
  dx: number;
  dy: number;
  angleDeg: number;
  gen: number;
  travel: number;
  lastPX: number;
  lastPY: number;
  drawn: boolean;
  el: SVGElement | null;
  ptsStr: string;
}

/** Folded angular difference in degrees, 0..90. Parallel and anti-parallel
 *  headings both fold to ~0, so collinear cracks merge rather than collide. */
function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

/** Pale ivory → frost-violet hairline; deeper generations dim and cool. */
function crackColor(gen: number): string {
  const l = Math.max(64, 90 - gen * 3);
  const s = Math.min(44, 16 + gen * 3);
  const h = 250 - Math.min(42, gen * 3);
  return `hsl(${h} ${s}% ${l}%)`;
}

export class Substrate {
  private group: SVGGElement;
  private cb: SubstrateCallbacks;
  private grid: Uint16Array;
  private occupied: number[] = [];
  private cracks: Crack[] = [];
  private phase: "growing" | "dissolving" = "growing";
  private dissolveT = 0;

  constructor(group: SVGGElement, cb: SubstrateCallbacks = {}) {
    this.group = group;
    this.cb = cb;
    this.grid = new Uint16Array(GW * GH); // 0 = empty, else angleDeg+1
  }

  get density(): number {
    return this.occupied.length / (GW * GH);
  }

  /** Seed n cracks at random empty points with random headings (generation 0). */
  seedRandom(n: number): void {
    for (let i = 0; i < n; i++) {
      let tries = 0;
      while (tries++ < 12) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        if (this.grid[this.cellIdx(x, y)] === 0) {
          this.makeCrack(x, y, Math.random() * 360, 0);
          break;
        }
      }
    }
  }

  /** Public seed used by pointer interaction — a visitor nudging the growth. */
  seedAt(x: number, y: number, angleDeg: number): void {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    this.makeCrack(x, y, angleDeg, 0);
  }

  /** Advance the whole colony by one animation frame. */
  frame(): void {
    if (this.phase === "dissolving") {
      this.stepDissolve();
      return;
    }

    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const cr = this.cracks[i];
      if (this.advance(cr) === DIE) {
        // swap-pop removal
        const lastIdx = this.cracks.length - 1;
        if (i !== lastIdx) this.cracks[i] = this.cracks[lastIdx];
        this.cracks.pop();

        // Only drawn cracks make sound and spawn — undrawn stubs vanish
        // silently, preventing any spawn storm.
        if (cr.drawn) {
          this.cb.onDeath?.(cr.gen, cr.angleDeg);
          const nSpawn = this.cracks.length < 12 ? 2 : 1;
          for (let k = 0; k < nSpawn; k++) {
            if (this.cracks.length >= MAX_ALIVE) break;
            this.spawnPerpendicular(cr.gen + 1);
          }
        }
      }
    }

    // Keep-alive: never let the web die out completely.
    let guard = 0;
    while (this.cracks.length < MIN_ALIVE && guard++ < 8) {
      if (!this.spawnPerpendicular(1)) break;
    }

    if (this.density >= FILL_THRESHOLD) this.startDissolve();
  }

  /** Immediate hard reset (used on unmount is unnecessary, but handy). */
  clear(): void {
    while (this.group.firstChild) this.group.removeChild(this.group.firstChild);
    this.grid.fill(0);
    this.occupied.length = 0;
    this.cracks = [];
    this.group.style.opacity = "1";
    this.phase = "growing";
    this.dissolveT = 0;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private cellIdx(x: number, y: number): number {
    const gx = Math.min(GW - 1, Math.max(0, (x / W * GW) | 0));
    const gy = Math.min(GH - 1, Math.max(0, (y / H * GH) | 0));
    return gy * GW + gx;
  }

  private makeCrack(x: number, y: number, angleDeg: number, gen: number): Crack {
    const rad = (angleDeg * Math.PI) / 180;
    const cr: Crack = {
      x,
      y,
      dx: Math.cos(rad),
      dy: Math.sin(rad),
      angleDeg,
      gen,
      travel: 0,
      lastPX: x,
      lastPY: y,
      drawn: false,
      el: null,
      ptsStr: "",
    };
    this.cracks.push(cr);
    return cr;
  }

  private advance(cr: Crack): number {
    cr.x += cr.dx * SPEED;
    cr.y += cr.dy * SPEED;
    cr.travel += SPEED;

    if (cr.x < 0 || cr.x >= W || cr.y < 0 || cr.y >= H) return DIE;

    const idx = this.cellIdx(cr.x, cr.y);
    const z = this.grid[idx];

    if (z === 0) {
      this.grid[idx] = (cr.angleDeg | 0) + 1;
      this.occupied.push(idx);
      if (!cr.drawn) this.birthElement(cr);
    } else if (angDiff(z - 1, cr.angleDeg) > COLLIDE_DEG) {
      return DIE; // hit a crack at a meaningfully different angle
    }
    // else: nearly collinear — merge-pass, keep travelling.

    // Record a vertex once we've travelled far enough.
    if (cr.drawn) {
      const ddx = cr.x - cr.lastPX;
      const ddy = cr.y - cr.lastPY;
      if (ddx * ddx + ddy * ddy >= SAMPLE * SAMPLE) {
        this.pushPoint(cr);
      }
    }
    return ALIVE;
  }

  private birthElement(cr: Crack): void {
    const el = document.createElementNS(SVG_NS, "polyline");
    el.setAttribute("vector-effect", "non-scaling-stroke");
    el.setAttribute("stroke", crackColor(cr.gen));
    el.setAttribute("stroke-opacity", (0.55 + Math.random() * 0.2).toFixed(2));
    cr.el = el;
    cr.ptsStr = `${cr.x.toFixed(1)},${cr.y.toFixed(1)}`;
    el.setAttribute("points", cr.ptsStr);
    this.group.appendChild(el);
    cr.drawn = true;
    cr.lastPX = cr.x;
    cr.lastPY = cr.y;
    this.cb.onBirth?.(cr.gen, cr.angleDeg);
  }

  private pushPoint(cr: Crack): void {
    cr.ptsStr += ` ${cr.x.toFixed(1)},${cr.y.toFixed(1)}`;
    cr.el?.setAttribute("points", cr.ptsStr);
    cr.lastPX = cr.x;
    cr.lastPY = cr.y;
  }

  /** Tarbell's `findStart`: pick a random claimed cell, head off perpendicular
   *  to the crack that claimed it (± a few degrees), one cell ahead into open
   *  space. Returns false if no viable seed was found. */
  private spawnPerpendicular(gen: number): boolean {
    if (this.occupied.length === 0) {
      this.seedRandom(1);
      return true;
    }
    for (let t = 0; t < SPAWN_TRIES; t++) {
      const idx = this.occupied[(Math.random() * this.occupied.length) | 0];
      const stored = this.grid[idx] - 1;
      const gx = idx % GW;
      const gy = (idx / GW) | 0;
      const ang = stored + (Math.random() < 0.5 ? 90 : -90) + (Math.random() * 6 - 3);
      const rad = (ang * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const sx = (gx + 0.5) * CELL_W + dx * CELL_W;
      const sy = (gy + 0.5) * CELL_H + dy * CELL_H;
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
      if (this.grid[this.cellIdx(sx, sy)] === 0) {
        this.makeCrack(sx, sy, ang, gen);
        return true;
      }
    }
    return false;
  }

  private startDissolve(): void {
    if (this.phase === "dissolving") return;
    this.phase = "dissolving";
    this.dissolveT = 0;
    this.cracks = []; // stop growth; leave the drawn web to fade
    this.cb.onDissolveStart?.();
  }

  private stepDissolve(): void {
    this.dissolveT++;
    const p = Math.min(1, this.dissolveT / DISSOLVE_FRAMES);
    // ease-out fade
    this.group.style.opacity = (1 - p * p).toFixed(3);
    if (p >= 1) {
      this.clear();
      this.seedRandom(3);
      this.cb.onReseed?.();
    }
  }
}
