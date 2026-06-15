// ─────────────────────────────────────────────────────────────────────────────
// mask.ts — turn a filled body SILHOUETTE MASK into monster signals.
//
// HONESTY NOTE: this prototype derives everything from a segmentation MASK (a
// filled body blob), NOT from pose/skeleton landmarks. We never look at joints.
// From the binary mask each frame we compute:
//
//   • coverage  — fraction of the frame the body fills (0..1)  → "how big"
//   • centroid  — (cx, cy) of the filled pixels (0..1)         → where it is
//   • motion    — mean per-pixel change vs the previous mask    → "how much moving"
//
// Those raw numbers become MONSTER SIGNALS:
//   • whoosh  — smoothed motion energy
//   • roar    — smoothed coverage GROWING (area swelling = getting big)
//   • boing   — a one-shot event when the centroid RISES fast (a jump)
//
// The MonsterState here is consumed by both renderers (GPU + Canvas2D) and the
// audio engine. It also synthesises a "ghost" mask for the idle auto-demo so the
// piece is fully alive with no camera at all.
// ─────────────────────────────────────────────────────────────────────────────

export const MASK_W = 96;
export const MASK_H = 96; // small grid: cheap motion math, plenty for a blob

export interface MonsterState {
  coverage: number; // 0..1 area
  cx: number; // 0..1 centroid x (mirrored display space)
  cy: number; // 0..1 centroid y (0 top)
  motion: number; // 0..1 smoothed frame-to-frame change
  growth: number; // 0..1 smoothed positive area growth → roar
  wobble: number; // 0..1 a lively bounce factor for the body outline
  whoosh: number; // 0..1 audio-facing motion
  roar: number; // 0..1 audio-facing bigness
  boing: number; // >0 for one frame when a jump fires (= jump power)
}

export class MonsterTracker {
  private prev = new Float32Array(MASK_W * MASK_H);
  private cur = new Float32Array(MASK_W * MASK_H);
  private hasPrev = false;

  // Smoothed signals.
  private sMotion = 0;
  private sCoverage = 0;
  private sGrowth = 0;
  private sWobble = 0;
  private prevCy = 0.5;
  private cyVel = 0; // smoothed downward velocity of centroid (neg = rising)
  private lastBoing = 0; // ms timestamp guard so boings don't machine-gun

  readonly state: MonsterState = {
    coverage: 0,
    cx: 0.5,
    cy: 0.5,
    motion: 0,
    growth: 0,
    wobble: 0,
    whoosh: 0,
    roar: 0,
    boing: 0,
  };

  /**
   * Feed a downsampled mask: `grid` is MASK_W*MASK_H floats in 0..1 (1 = body).
   * `nowMs` is performance.now(). Returns the updated MonsterState.
   */
  update(grid: Float32Array, nowMs: number): MonsterState {
    this.cur.set(grid);

    // ── Coverage + centroid ──────────────────────────────────────────────────
    let sum = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < MASK_H; y++) {
      for (let x = 0; x < MASK_W; x++) {
        const v = this.cur[y * MASK_W + x];
        if (v > 0.5) {
          sum += 1;
          sx += x;
          sy += y;
        }
      }
    }
    const total = MASK_W * MASK_H;
    const coverage = sum / total;
    const cx = sum > 0 ? sx / sum / MASK_W : 0.5;
    const cy = sum > 0 ? sy / sum / MASK_H : 0.5;

    // ── Motion energy: mean abs diff vs previous mask ─────────────────────────
    let motionRaw = 0;
    if (this.hasPrev) {
      let acc = 0;
      for (let i = 0; i < total; i++) {
        acc += Math.abs(this.cur[i] - this.prev[i]);
      }
      motionRaw = acc / total; // 0..1, usually small
    }

    // ── Smooth everything (alive, not twitchy) ────────────────────────────────
    this.sMotion = lerp(this.sMotion, clamp01(motionRaw * 6.0), 0.25);

    const prevCov = this.sCoverage;
    this.sCoverage = lerp(this.sCoverage, coverage, 0.3);
    const dCov = this.sCoverage - prevCov; // positive = getting bigger
    this.sGrowth = lerp(this.sGrowth, clamp01(dCov * 40 + coverage * 0.15), 0.2);

    // A lively wobble that rides motion → squash-stretch life on the outline.
    this.sWobble = lerp(this.sWobble, clamp01(this.sMotion * 1.4), 0.2);

    // ── Jump detection: centroid rising FAST → BOING ──────────────────────────
    // cy decreasing (toward 0/top) means the body moved UP in the frame.
    const dCy = cy - this.prevCy; // negative when rising
    this.cyVel = lerp(this.cyVel, dCy, 0.5);
    this.prevCy = cy;
    let boing = 0;
    const RISE = -0.012; // threshold: rising fast enough
    if (
      this.cyVel < RISE &&
      coverage > 0.02 &&
      nowMs - this.lastBoing > 360 // debounce
    ) {
      boing = clamp01((-this.cyVel - 0.01) * 18);
      this.lastBoing = nowMs;
    }

    // ── Audio-facing signals ──────────────────────────────────────────────────
    const whoosh = this.sMotion;
    const roar = this.sGrowth;

    // Commit.
    this.prev.set(this.cur);
    this.hasPrev = true;

    const s = this.state;
    s.coverage = this.sCoverage;
    s.cx = cx;
    s.cy = cy;
    s.motion = this.sMotion;
    s.growth = this.sGrowth;
    s.wobble = this.sWobble;
    s.whoosh = whoosh;
    s.roar = roar;
    s.boing = boing;
    return s;
  }

  reset(): void {
    this.prev.fill(0);
    this.hasPrev = false;
    this.sMotion = 0;
    this.sCoverage = 0;
    this.sGrowth = 0;
    this.sWobble = 0;
  }
}

// ── Ghost auto-demo mask ────────────────────────────────────────────────────
// Synthesises a soft body blob that drifts, jumps and "grows" so a SILENT
// glance with NO camera still SEES the monster move and HEARS whoosh/boing/roar.
// Returns a fresh MASK_W*MASK_H grid; feed it to MonsterTracker.update like a
// real camera mask.
const ghostGrid = new Float32Array(MASK_W * MASK_H);

export function makeGhostMask(tSec: number): Float32Array {
  ghostGrid.fill(0);

  // A gentle figure: drifts side to side, bobs/jumps, and breathes bigger.
  const drift = Math.sin(tSec * 0.55) * 0.16;
  // A periodic "jump": a quick rise every ~3.2s.
  const jumpPhase = (tSec % 3.2) / 3.2;
  const jump = jumpPhase < 0.22 ? Math.sin((jumpPhase / 0.22) * Math.PI) : 0;
  const breathe = 0.5 + 0.5 * Math.sin(tSec * 0.4); // 0..1 grow/shrink

  const bodyCx = 0.5 + drift;
  const bodyCy = 0.62 - jump * 0.16; // rises on jump
  // Body scale grows with breathe → roar swells.
  const scale = 0.18 + breathe * 0.1;
  const headR = scale * 0.55;
  const headCy = bodyCy - scale * 1.05;

  // Squash-stretch: taller on the jump, wider when landing.
  const stretch = 1 + jump * 0.35 - (1 - jumpPhase) * 0.04;

  for (let y = 0; y < MASK_H; y++) {
    for (let x = 0; x < MASK_W; x++) {
      const nx = x / MASK_W;
      const ny = y / MASK_H;
      // Body: a tall rounded blob (ellipse).
      const bdx = (nx - bodyCx) / (scale * 0.9);
      const bdy = (ny - bodyCy) / (scale * 1.5 * stretch);
      const inBody = bdx * bdx + bdy * bdy < 1;
      // Head: a circle on top.
      const hdx = nx - bodyCx;
      const hdy = ny - headCy;
      const inHead = hdx * hdx + hdy * hdy < headR * headR;
      // Two stubby arms that wave with time.
      const wave = Math.sin(tSec * 2.2) * 0.06;
      const armY = bodyCy - scale * 0.4 + wave;
      const armSpan = scale * 1.4;
      const inArm =
        Math.abs(ny - armY) < scale * 0.18 &&
        Math.abs(nx - bodyCx) < armSpan &&
        Math.abs(nx - bodyCx) > scale * 0.6;
      if (inBody || inHead || inArm) ghostGrid[y * MASK_W + x] = 1;
    }
  }
  return ghostGrid;
}

// ── small helpers ────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
