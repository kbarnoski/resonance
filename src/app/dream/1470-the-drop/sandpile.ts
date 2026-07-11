// 1470-the-drop — sandpile.ts
//
// A CPU abelian sandpile (Bak–Tang–Wiesenfeld, "Self-Organized Criticality",
// PRL 59, 1987; Bak, *How Nature Works*, 1996) on an N×N grid of integer grain
// counts h[x][y]. A cell with h >= 4 is unstable and TOPPLES: it sheds 4 grains,
// one to each orthogonal neighbour; grains that fall off the edge are lost.
//
// The system is driven slowly (grains rain only while the pile is quiescent),
// which is the canonical SOC protocol that produces scale-free avalanches: most
// drives topple nothing or a few cells, but rarely one grain sets off a cascade
// that sweeps the whole terrain. Avalanche sizes follow a power law — so the
// piece composes its own rhythm and never loops.
//
// A huge cascade is CAPPED per frame (budget) and carried forward, so it unfolds
// over several frames as a visible wave rather than resolving in one hitch.
//
// Determinism: all grain positions come from a seeded mulberry32 PRNG. No
// Math.random, no Date — only the caller's performance.now drives animation time.

/** mulberry32 — a tiny deterministic PRNG (public domain, Tommy Ettinger). */
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

export interface AvalancheEvent {
  /** Total number of topple events in this cascade (power-law distributed). */
  size: number;
  /** Centroid of the cascade, each in [0,1]. */
  cx: number;
  cy: number;
  /** Normalised bounding-box diagonal of the cascade, in [0,1]. */
  extent: number;
}

export interface StepResult {
  /** Topple events this frame (drives the visible wave + granular activity). */
  topples: number;
  /** Cascades that fully settled this frame (the discrete "drops"). */
  events: AvalancheEvent[];
  /** Tension scalar in [0,1] — how loaded toward critical the pile is. */
  load: number;
  /** True while a cascade is still relaxing (carried across frames). */
  active: boolean;
}

const THRESH = 4;

export interface SandpileOptions {
  n: number;
  seed: number;
  /** Max topple events processed per frame (rest carries forward). */
  maxTopples?: number;
  /** Average grains rained per frame while quiescent (fractional; the drive
   *  rate — kept low so the instrument breathes rather than roars). */
  grainsPerFrame?: number;
  /** Per-frame multiplicative decay of the heat field. */
  heatDecay?: number;
  /** An avalanche this big or bigger is a "release" that resets the riser. */
  releaseSize?: number;
  /** Grains that must rain to build the riser from empty back to full tension. */
  reloadGrains?: number;
}

export class Sandpile {
  readonly n: number;
  readonly h: Int32Array; // grain counts
  readonly heat: Float32Array; // toppling glow, [0,1], decays each frame

  private readonly rng: () => number;
  private readonly maxTopples: number;
  private readonly grainsPerFrame: number;
  private readonly heatDecay: number;
  private readonly releaseSize: number;
  private readonly reloadGrains: number;

  // drive-rate accumulator + riser "reload" scalar
  private driveCredit = 0;
  private grainsSinceRelease = 0;

  private readonly queue: number[] = []; // indices of unstable cells (stack)
  private readonly inQueue: Uint8Array;

  // avalanche accumulators
  private avActive = false;
  private avSize = 0;
  private avMinX = 0;
  private avMaxX = 0;
  private avMinY = 0;
  private avMaxY = 0;
  private avSumX = 0;
  private avSumY = 0;

  private frameTopples = 0;

  // pending external input (applied at the top of the next step)
  private readonly pending: number[] = []; // flat [idx, amount, idx, amount, ...]
  private shockPending = false;

  /** Tilt bias in [-1,1] per axis — leans the pile so avalanches drift downhill
   *  (a directed-sandpile bias, cf. Dhar–Ramaswamy 1989). */
  tiltX = 0;
  tiltY = 0;

  constructor(opts: SandpileOptions) {
    this.n = opts.n;
    const cells = this.n * this.n;
    this.h = new Int32Array(cells);
    this.heat = new Float32Array(cells);
    this.inQueue = new Uint8Array(cells);
    this.rng = mulberry32(opts.seed >>> 0);
    this.maxTopples = opts.maxTopples ?? 2200;
    // Slow driving is the whole point of SOC — a fraction of a grain per
    // quiescent frame keeps avalanches scale-free (mostly tiny, rarely enormous)
    // and gives the instrument room to breathe. Over-driving pins the pile
    // permanently supercritical and destroys the power law.
    this.grainsPerFrame = opts.grainsPerFrame ?? 0.34;
    this.heatDecay = opts.heatDecay ?? 0.86;
    this.releaseSize = opts.releaseSize ?? 2600;
    this.reloadGrains = opts.reloadGrains ?? 90;
  }

  /** Pour grains at a normalised location (used by pointer/tap). */
  pour(px: number, py: number, amount: number): void {
    const n = this.n;
    const x = Math.min(n - 1, Math.max(0, Math.round(px * (n - 1))));
    const y = Math.min(n - 1, Math.max(0, Math.round(py * (n - 1))));
    this.pending.push(y * n + x, amount);
  }

  /** A seismic shock — nudge much of the pile one grain toward toppling. */
  shock(): void {
    this.shockPending = true;
  }

  /** Warm the pile toward its self-organized critical state before display so it
   *  is alive on the first frame (deterministic). Seeds the approximate BTW
   *  recurrent height distribution, then drives for a few steps to organize it. */
  prime(settleSteps: number): void {
    const cells = this.n * this.n;
    for (let i = 0; i < cells; i++) {
      const r = this.rng();
      this.h[i] = r < 0.07 ? 0 : r < 0.24 ? 1 : r < 0.55 ? 2 : 3;
    }
    for (let i = 0; i < settleSteps; i++) this.step();
    this.grainsSinceRelease = 0; // start the riser fresh at display time
    this.driveCredit = 0;
  }

  private push(idx: number): void {
    if (this.inQueue[idx]) return;
    this.inQueue[idx] = 1;
    this.queue.push(idx);
  }

  private give(x: number, y: number, count: number): void {
    if (count === 0) return;
    if (x < 0 || y < 0 || x >= this.n || y >= this.n) return; // off edge → lost
    const j = y * this.n + x;
    this.h[j] += count;
    if (this.h[j] >= THRESH) this.push(j);
  }

  private addGrain(idx: number, amount: number): void {
    this.h[idx] += amount;
    if (this.h[idx] >= THRESH) this.push(idx);
  }

  private beginAvalanche(): void {
    this.avActive = true;
    this.avSize = 0;
    this.avSumX = 0;
    this.avSumY = 0;
    this.avMinX = this.n;
    this.avMaxX = 0;
    this.avMinY = this.n;
    this.avMaxY = 0;
  }

  private finalizeAvalanche(): AvalancheEvent | null {
    this.avActive = false;
    if (this.avSize === 0) return null;
    const n = this.n;
    const cx = this.avSumX / this.avSize / (n - 1);
    const cy = this.avSumY / this.avSize / (n - 1);
    const dx = this.avMaxX - this.avMinX;
    const dy = this.avMaxY - this.avMinY;
    const extent = Math.min(1, Math.hypot(dx, dy) / (Math.SQRT2 * (n - 1)));
    return { size: this.avSize, cx, cy, extent };
  }

  private toppleOne(): void {
    const idx = this.queue.pop();
    if (idx === undefined) return;
    this.inQueue[idx] = 0;
    const h = this.h;
    if (h[idx] < THRESH) return; // stale entry
    h[idx] -= THRESH;

    const n = this.n;
    const x = idx % n;
    const y = (idx / n) | 0;

    // record for glow + avalanche stats
    this.heat[idx] = Math.min(1, this.heat[idx] + 0.6);
    this.avSize++;
    this.frameTopples++;
    this.avSumX += x;
    this.avSumY += y;
    if (x < this.avMinX) this.avMinX = x;
    if (x > this.avMaxX) this.avMaxX = x;
    if (y < this.avMinY) this.avMinY = y;
    if (y > this.avMaxY) this.avMaxY = y;

    // canonical distribution: +1 to each of 4 neighbours.
    let dl = 1;
    let dr = 1;
    let dd = 1;
    let du = 1;
    // directed bias: occasionally redirect the uphill grain downhill (sum stays 4)
    const mag = Math.abs(this.tiltX) + Math.abs(this.tiltY);
    if (mag > 0.05 && this.rng() < Math.min(0.7, mag * 0.6)) {
      if (Math.abs(this.tiltX) >= Math.abs(this.tiltY)) {
        if (this.tiltX > 0) {
          dr += 1;
          dl -= 1;
        } else {
          dl += 1;
          dr -= 1;
        }
      } else if (this.tiltY > 0) {
        du += 1;
        dd -= 1;
      } else {
        dd += 1;
        du -= 1;
      }
    }
    this.give(x - 1, y, dl);
    this.give(x + 1, y, dr);
    this.give(x, y - 1, dd);
    this.give(x, y + 1, du);

    if (h[idx] >= THRESH) this.push(idx); // multi-topple tall cell
  }

  private applyPending(): void {
    for (let i = 0; i < this.pending.length; i += 2) {
      const amt = this.pending[i + 1];
      this.addGrain(this.pending[i], amt);
      this.grainsSinceRelease += amt; // poured grains load the riser too
    }
    this.pending.length = 0;
    if (this.shockPending) {
      this.shockPending = false;
      const cells = this.n * this.n;
      for (let i = 0; i < cells; i++) {
        if (this.rng() < 0.55) this.addGrain(i, 1);
      }
    }
  }

  private driveOnce(): void {
    const n = this.n;
    const r = this.rng;
    // Rain roughly UNIFORMLY across the grid (decorrelated driving keeps the
    // avalanche distribution scale-free with tiny cascades dominating), pulled
    // gently toward the downhill side under tilt.
    const bx = r() + this.tiltX * 0.16;
    const by = r() + this.tiltY * 0.16;
    const x = Math.min(n - 1, Math.max(0, Math.round(bx * (n - 1))));
    const y = Math.min(n - 1, Math.max(0, Math.round(by * (n - 1))));
    this.addGrain(y * n + x, 1);
    this.grainsSinceRelease += 1;
  }

  step(): StepResult {
    this.frameTopples = 0;
    const events: AvalancheEvent[] = [];

    this.applyPending();

    // accrue fractional drive credit (cap so a long cascade doesn't burst-drive)
    this.driveCredit = Math.min(6, this.driveCredit + this.grainsPerFrame);

    let budget = this.maxTopples;

    while (budget > 0) {
      if (this.queue.length === 0) {
        // pile is quiescent
        if (this.avActive) {
          const ev = this.finalizeAvalanche();
          if (ev) {
            events.push(ev);
            // a big cascade is a RELEASE — it discharges the riser
            if (ev.size >= this.releaseSize) this.grainsSinceRelease = 0;
          }
        }
        if (this.driveCredit < 1) break;
        this.driveCredit -= 1;
        this.driveOnce();
        continue;
      }
      if (!this.avActive) this.beginAvalanche();
      this.toppleOne();
      budget--;
    }

    // decay the heat glow (smooth trailing wave, not a strobe)
    const heat = this.heat;
    const decay = this.heatDecay;
    const cells = this.n * this.n;
    for (let i = 0; i < cells; i++) heat[i] *= decay;

    // TENSION = the riser: grains accumulated since the last big release. It
    // sawtooths — climbs as the pile reloads, collapses when a big one drops.
    // (Physical criticality pins mean height ~2.1, so it can't drive a riser;
    // the reload cycle can, and it stays honestly coupled to the SOC timing.)
    const load = Math.min(1, this.grainsSinceRelease / this.reloadGrains);

    return {
      topples: this.frameTopples,
      events,
      load,
      active: this.avActive,
    };
  }
}
