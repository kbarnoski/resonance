// flow.ts — a divergence-free curl-noise velocity field, particle advection
// through it, and emergent-flow-stat extraction. Pure (no React, no DOM, no
// Web Audio): it owns numbers only. The page renders it; the instrument listens
// to it.
//
// Curl-noise (Bridson et al., SIGGRAPH 2007): build a scalar stream function ψ
// from layered gradient noise, then take the 2D curl
//
//     v = ( ∂ψ/∂y , −∂ψ/∂x )
//
// Because v is the curl of a potential, ∇·v = 0 exactly — the field has no
// sources or sinks, so particles swirl, braid and pool but are never created or
// destroyed. A slowly drifting 3rd noise axis keeps ψ alive when idle. A
// pointer "stir" adds a local rotational vortex term you steer by gesture.

// ─── Gradient (Perlin-ish) noise, 3D ────────────────────────────────────────
// Small, dependency-free value-gradient noise. Two octaves used for ψ.

const PERM = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Deterministic shuffle so the field is identical every load.
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function dotGrad(hash: number, x: number, y: number, z: number): number {
  const g = GRAD3[hash % 12];
  return g[0] * x + g[1] * y + g[2] * z;
}

/** 3D Perlin-style gradient noise, roughly in [-1, 1]. */
function noise3(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const zf = z - Math.floor(z);
  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const A = PERM[X] + Y;
  const AA = PERM[A] + Z;
  const AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y;
  const BA = PERM[B] + Z;
  const BB = PERM[B + 1] + Z;

  return lerp(
    lerp(
      lerp(dotGrad(PERM[AA], xf, yf, zf), dotGrad(PERM[BA], xf - 1, yf, zf), u),
      lerp(dotGrad(PERM[AB], xf, yf - 1, zf), dotGrad(PERM[BB], xf - 1, yf - 1, zf), u),
      v,
    ),
    lerp(
      lerp(dotGrad(PERM[AA + 1], xf, yf, zf - 1), dotGrad(PERM[BA + 1], xf - 1, yf, zf - 1), u),
      lerp(dotGrad(PERM[AB + 1], xf, yf - 1, zf - 1), dotGrad(PERM[BB + 1], xf - 1, yf - 1, zf - 1), u),
      v,
    ),
    w,
  );
}

// ─── Stream function ψ and its curl ──────────────────────────────────────────

const NOISE_SCALE = 2.1; // base spatial frequency of ψ (in normalized units)
const EPS = 1e-3; // finite-difference step for the curl

/**
 * Two-octave stream function in normalized [0,1] coordinates, evolving along a
 * slowly drifting z axis (the "alive when idle" term). `amp` lets the audio's
 * own loudness gently breathe the field (RMS → flow feedback).
 */
function psi(x: number, y: number, z: number, amp: number): number {
  const o1 = noise3(x * NOISE_SCALE, y * NOISE_SCALE, z);
  const o2 = 0.5 * noise3(x * NOISE_SCALE * 2.3 + 9.1, y * NOISE_SCALE * 2.3 - 4.2, z * 1.7 + 2.0);
  return (o1 + o2) * amp;
}

export interface Vortex {
  /** Normalized position of the stir. */
  x: number;
  y: number;
  /** Signed strength: sign = rotation direction (follows gesture), |.| decays. */
  strength: number;
  /** Influence radius in normalized units. */
  radius: number;
}

/**
 * Velocity at a point: the divergence-free curl of ψ, plus an optional local
 * vortex from the pointer stir. v = (∂ψ/∂y, −∂ψ/∂x) via central differences.
 */
function velocityAt(
  x: number,
  y: number,
  z: number,
  amp: number,
  vortex: Vortex | null,
  out: { vx: number; vy: number },
): void {
  const dpdy = (psi(x, y + EPS, z, amp) - psi(x, y - EPS, z, amp)) / (2 * EPS);
  const dpdx = (psi(x + EPS, y, z, amp) - psi(x - EPS, y, z, amp)) / (2 * EPS);
  let vx = dpdy;
  let vy = -dpdx;

  if (vortex && vortex.strength !== 0) {
    const dx = x - vortex.x;
    const dy = y - vortex.y;
    const d2 = dx * dx + dy * dy;
    const falloff = Math.exp(-d2 / (vortex.radius * vortex.radius));
    // Perpendicular (rotational) component → a clean swirl, sign = direction.
    vx += -dy * vortex.strength * falloff;
    vy += dx * vortex.strength * falloff;
  }

  out.vx = vx;
  out.vy = vy;
}

// ─── Particles ───────────────────────────────────────────────────────────────

export interface FlowStats {
  /** Mean particle speed (normalized units/sec-ish). */
  meanSpeed: number;
  /** Directional coherence 0..1: how aligned particle headings are (order). */
  coherence: number;
  /** Mean |curl| sampled near the cursor — local turbulence/vorticity. */
  vorticity: number;
  /** Peak local particle density (a forming "pool"), 0..1. */
  poolDensity: number;
  /** Centroid x of fast-moving energy, 0..1 (→ stereo pan). */
  energyX: number;
  /** Centroid y of energy, 0..1 (→ register tilt). */
  energyY: number;
  /** Two strong vorticity lobes are merging near the cursor (confluence). */
  confluence: boolean;
}

const GRID = 12; // density grid resolution for pooling / confluence detection

export class FlowField {
  readonly count: number;
  // Particle state, normalized [0,1] positions; velocities in same units/sec.
  px: Float32Array;
  py: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  // Previous-position buffers so the page can draw streaks.
  ppx: Float32Array;
  ppy: Float32Array;

  private z = 0; // drifting 3rd noise axis
  private vortex: Vortex = { x: 0.5, y: 0.5, strength: 0, radius: 0.18 };
  private density = new Float32Array(GRID * GRID);
  private curlGrid = new Float32Array(GRID * GRID);
  private _tmp = { vx: 0, vy: 0 };

  /** Audio-RMS feedback into field amplitude (river breathes with its sound). */
  audioAmp = 1;

  constructor(count = 3200) {
    this.count = count;
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.ppx = new Float32Array(count);
    this.ppy = new Float32Array(count);
    let s = 99173;
    const r = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      this.px[i] = this.ppx[i] = r();
      this.py[i] = this.ppy[i] = r();
    }
  }

  /**
   * Stir: set the vortex from the pointer. `dirSign` (+1/-1) is the gesture
   * rotation direction; `power` 0..1 is how hard. Strength decays each step
   * unless restirred (see step()).
   */
  stir(x: number, y: number, dirSign: number, power: number): void {
    this.vortex.x = x;
    this.vortex.y = y;
    const target = dirSign * power * 6.0;
    // Blend toward the new target so quick flicks read as direction changes.
    this.vortex.strength = this.vortex.strength * 0.4 + target * 0.6;
  }

  /** Advance the simulation by dt seconds. Returns emergent flow stats. */
  step(dt: number): FlowStats {
    // Clamp dt so tab-switches don't explode the integrator.
    const h = Math.min(0.05, Math.max(0.001, dt));
    this.z += h * 0.08; // idle drift keeps ψ alive
    this.vortex.strength *= Math.pow(0.06, h); // decay on lift-off (~0.06/sec)

    const amp = 0.7 + this.audioAmp * 0.6;
    const SPEED = 0.22; // global advection gain
    const tmp = this._tmp;

    this.density.fill(0);
    this.curlGrid.fill(0);

    let sumSpeed = 0;
    let sumDirX = 0;
    let sumDirY = 0;
    let sumEX = 0;
    let sumEY = 0;
    let sumE = 0;

    for (let i = 0; i < this.count; i++) {
      const x = this.px[i];
      const y = this.py[i];
      velocityAt(x, y, this.z, amp, this.vortex, tmp);
      const vxv = tmp.vx * SPEED;
      const vyv = tmp.vy * SPEED;
      this.vx[i] = vxv;
      this.vy[i] = vyv;

      this.ppx[i] = x;
      this.ppy[i] = y;
      let nx = x + vxv * h;
      let ny = y + vyv * h;

      // Toroidal wrap — no visible boundary sources/sinks, field stays full.
      if (nx < 0) nx += 1;
      else if (nx >= 1) nx -= 1;
      if (ny < 0) ny += 1;
      else if (ny >= 1) ny -= 1;
      this.px[i] = nx;
      this.py[i] = ny;

      const sp = Math.hypot(vxv, vyv);
      sumSpeed += sp;
      if (sp > 1e-5) {
        sumDirX += vxv / sp;
        sumDirY += vyv / sp;
      }
      sumEX += nx * sp;
      sumEY += ny * sp;
      sumE += sp;

      // Density grid (pooling).
      const gx = Math.min(GRID - 1, (nx * GRID) | 0);
      const gy = Math.min(GRID - 1, (ny * GRID) | 0);
      this.density[gy * GRID + gx] += 1;
    }

    const inv = 1 / this.count;
    const meanSpeed = sumSpeed * inv;
    const coherence = Math.hypot(sumDirX, sumDirY) * inv; // |mean heading|
    const energyX = sumE > 1e-6 ? sumEX / sumE : 0.5;
    const energyY = sumE > 1e-6 ? sumEY / sumE : 0.5;

    // Peak pool density, normalized against the uniform expectation.
    const expected = this.count / (GRID * GRID);
    let peak = 0;
    for (let i = 0; i < this.density.length; i++) {
      if (this.density[i] > peak) peak = this.density[i];
    }
    const poolDensity = Math.min(1, peak / (expected * 3));

    // Curl magnitude on a coarse grid (turbulence), and near-cursor vorticity.
    let vortNear = 0;
    let vortSamples = 0;
    const cell = 1 / GRID;
    const lobes: { gx: number; gy: number; v: number }[] = [];
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const cx = (gx + 0.5) * cell;
        const cy = (gy + 0.5) * cell;
        velocityAt(cx + EPS, cy, this.z, amp, this.vortex, tmp);
        const vyR = tmp.vy;
        velocityAt(cx - EPS, cy, this.z, amp, this.vortex, tmp);
        const vyL = tmp.vy;
        velocityAt(cx, cy + EPS, this.z, amp, this.vortex, tmp);
        const vxU = tmp.vx;
        velocityAt(cx, cy - EPS, this.z, amp, this.vortex, tmp);
        const vxD = tmp.vx;
        const curl = Math.abs((vyR - vyL) / (2 * EPS) - (vxU - vxD) / (2 * EPS));
        this.curlGrid[gy * GRID + gx] = curl;
        const dc = Math.hypot(cx - this.vortex.x, cy - this.vortex.y);
        if (dc < 0.28) {
          vortNear += curl;
          vortSamples++;
          if (curl > 0.5) lobes.push({ gx, gy, v: curl });
        }
      }
    }
    const vorticity = vortSamples > 0 ? Math.min(1, (vortNear / vortSamples) * 0.12) : 0;

    // Confluence: two separated strong-vorticity lobes both near the cursor.
    let confluence = false;
    if (lobes.length >= 2) {
      lobes.sort((a, b) => b.v - a.v);
      const a = lobes[0];
      const b = lobes[1];
      const sep = Math.hypot(a.gx - b.gx, a.gy - b.gy);
      if (sep >= 2 && sep <= 5) confluence = true;
    }

    return { meanSpeed, coherence, vorticity, poolDensity, energyX, energyY, confluence };
  }
}
