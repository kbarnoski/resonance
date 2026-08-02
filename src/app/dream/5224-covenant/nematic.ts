// ─────────────────────────────────────────────────────────────────────────────
// nematic.ts — the physics substance of 5224-covenant.
//
//   An ACTIVE NEMATIC: a field of headless orientation θ(x,y) (θ ≡ θ+π), the
//   coarse-grained director of a dense suspension of energy-dissipating rods —
//   the lab-dish reality behind Sanchez & Dogic's swimming microtubule "beings"
//   (Nature 2012) and the self-mixing active turbulence of Tan et al. (Nature
//   Physics 2019). We store the DOUBLED-ANGLE vector U = (cos2θ, sin2θ) on a
//   periodic grid so the nematic symmetry θ≡θ+π is built in.
//
//   Each step:
//     1. Elastic relaxation  U ← U + κ∇²U  (5-point Laplacian), renormalize.
//     2. Active self-advection  v = A·( ∂xUx+∂yUy , ∂xUy−∂yUx ),
//        semi-Lagrangian back-sample U at pos−v·dt (bilinear).
//     3. Nucleation: seeded micro-rotations keep birthing ±½ defect pairs;
//        suppressed inside the confinement.
//
//   DEFECTS are the "beings": per plaquette we sum the wrapped winding of
//   φ=atan2(Uy,Ux). +2π → a comet-shaped, self-propelled +½; −2π → a passive
//   three-fold −½. We track them frame-to-frame into persistent IDs with age,
//   velocity and a trajectory trail.
//
//   CONFINEMENT → GOLDEN BRAID (2026 payload, arXiv:2503.10880): a soft disk in
//   which activity is quenched and nucleation suppressed, and three +½ cores are
//   gently coaxed onto a periodic three-body braid. Loose ⇒ turbulent chaos.
//
//   Pure TypeScript. No DOM, no React, no Web Audio. All randomness is the
//   seeded mulberry32 — never Math.random / Date.now.
// ─────────────────────────────────────────────────────────────────────────────

/** Seeded PRNG (mulberry32). Deterministic — never Math.random / Date.now. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Sign = 1 | -1;

export interface TrackedDefect {
  id: number;
  x: number; // grid units
  y: number;
  sign: Sign;
  vx: number; // grid units / sec (smoothed)
  vy: number;
  speed: number;
  heading: number; // radians, direction of travel (comet axis)
  age: number; // seconds alive
  inside: boolean; // within the confinement disk
  trail: number[]; // flat [x0,y0,x1,y1,…] recent grid positions, newest last
}

export interface StepResult {
  status: "CHAOS" | "GATHERING" | "BRAID LOCKED";
  plus: number; // count of +½ defects
  minus: number; // count of −½ defects
  braidLocked: boolean;
  braidPeriod: number; // seconds — clocks the audio canon
  births: number[]; // ids born this step
  deaths: { x: number; y: number; sign: Sign }[]; // grid coords of annihilations
}

interface RawDefect {
  x: number;
  y: number;
  sign: Sign;
}

const TWO_PI = Math.PI * 2;
const GOLDEN = 1.618033988749895;

/** Wrap an angle difference into (−π, π]. */
function wrap(d: number): number {
  return d - TWO_PI * Math.round(d / TWO_PI);
}

export interface NematicOptions {
  N?: number;
  kappa?: number;
  activity?: number;
  nucSites?: number;
  nucDelta?: number;
}

export class NematicField {
  readonly N: number;
  private kappa: number;
  private activity: number;
  private nucSites: number;
  private nucDelta: number;

  private ux: Float32Array;
  private uy: Float32Array;
  private tx: Float32Array;
  private ty: Float32Array;
  private phi: Float32Array; // cached atan2(Uy,Ux) per cell for defect scan

  private rng: () => number;

  // confinement disk (grid units)
  private confEngaged = false;
  private confCx = 0;
  private confCy = 0;
  private confR = 0;
  private conf = 0; // engagement 0..1, ramps smoothly

  // braid controller
  private braidTime = 0;
  private readonly braidOmega = 0.7; // orbital rate (rad/s)
  private braidLocked = false;
  private lockHold = 0; // seconds the lock condition has held
  private distWindow: number[] = []; // rolling sum-of-pairwise-distances

  // tracking
  private tracked: TrackedDefect[] = [];
  private nextId = 1;
  private readonly cap = 40;
  private readonly maxTrail = 46;

  constructor(seed: number, opts: NematicOptions = {}) {
    this.N = opts.N ?? 112;
    this.kappa = opts.kappa ?? 0.06;
    this.activity = opts.activity ?? 60;
    this.nucSites = opts.nucSites ?? 18;
    this.nucDelta = opts.nucDelta ?? 3.4;
    const n2 = this.N * this.N;
    this.ux = new Float32Array(n2);
    this.uy = new Float32Array(n2);
    this.tx = new Float32Array(n2);
    this.ty = new Float32Array(n2);
    this.phi = new Float32Array(n2);
    this.rng = mulberry32(seed);
    this.seedField();
  }

  /** Random smooth-ish initial director field (deterministic). */
  private seedField(): void {
    const { N } = this;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        // a few low-frequency waves so we start with structure, not white noise
        const a =
          1.7 * Math.sin(i * 0.09 + j * 0.05) +
          1.3 * Math.cos(i * 0.04 - j * 0.11) +
          (this.rng() - 0.5) * 1.2;
        const idx = i + j * N;
        this.ux[idx] = Math.cos(2 * a);
        this.uy[idx] = Math.sin(2 * a);
      }
    }
  }

  get trackedDefects(): TrackedDefect[] {
    return this.tracked;
  }

  private veilPos: Float32Array | null = null;
  private veilAng: Float32Array | null = null;

  /**
   * Downsample the director field for the faint background "veil". Returns
   * reused buffers: pos = [gx,gy,…] grid centres, ang = θ (director) per sample.
   */
  buildVeil(stride: number): { pos: Float32Array; ang: Float32Array; count: number } {
    const { N, ux, uy } = this;
    const n = Math.floor(N / stride);
    const count = n * n;
    if (!this.veilPos || this.veilPos.length < count * 2) {
      this.veilPos = new Float32Array(count * 2);
      this.veilAng = new Float32Array(count);
    }
    const pos = this.veilPos;
    const ang = this.veilAng!;
    let k = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const gi = i * stride;
        const gj = j * stride;
        const idx = gi + gj * N;
        pos[k * 2] = gi;
        pos[k * 2 + 1] = gj;
        ang[k] = Math.atan2(uy[idx], ux[idx]) * 0.5; // θ = ½·φ
        k++;
      }
    }
    return { pos, ang, count };
  }

  get engagement(): number {
    return this.conf;
  }

  get confinement(): { cx: number; cy: number; r: number; on: boolean } {
    return { cx: this.confCx, cy: this.confCy, r: this.confR, on: this.confEngaged };
  }

  /** Place / move the soft confinement disk (grid units). */
  setConfinement(cx: number, cy: number, r: number): void {
    this.confEngaged = true;
    this.confCx = cx;
    this.confCy = cy;
    this.confR = r;
  }

  /** Release the boundary — the field falls back into open active turbulence. */
  clearConfinement(): void {
    this.confEngaged = false;
    this.braidLocked = false;
    this.lockHold = 0;
    this.distWindow.length = 0;
  }

  private wrapIdx(i: number, j: number): number {
    const { N } = this;
    const ii = i < 0 ? i + N : i >= N ? i - N : i;
    const jj = j < 0 ? j + N : j >= N ? j - N : j;
    return ii + jj * N;
  }

  /** Radial engagement factor at a cell: 1 far outside, →0 at disk centre. */
  private confFactor(i: number, j: number): number {
    if (!this.confEngaged || this.conf <= 0) return 1;
    const dx = i - this.confCx;
    const dy = j - this.confCy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const r = this.confR;
    // smoothstep from full activity (outside r) to quenched (inside 0.35r)
    const inner = 0.35 * r;
    let t = (d - inner) / (r - inner);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const smooth = t * t * (3 - 2 * t); // 0 at centre, 1 outside
    return 1 - this.conf * (1 - smooth);
  }

  // ── 1 + 2: relaxation and active advection ────────────────────────────────
  private stepField(dt: number): void {
    const { N, ux, uy, tx, ty, kappa } = this;

    // Elastic relaxation into tx,ty (renormalized).
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const c = i + j * N;
        const l = this.wrapIdx(i - 1, j);
        const r = this.wrapIdx(i + 1, j);
        const u = this.wrapIdx(i, j - 1);
        const d = this.wrapIdx(i, j + 1);
        const lapx = ux[l] + ux[r] + ux[u] + ux[d] - 4 * ux[c];
        const lapy = uy[l] + uy[r] + uy[u] + uy[d] - 4 * uy[c];
        let nx = ux[c] + kappa * lapx;
        let ny = uy[c] + kappa * lapy;
        const m = Math.hypot(nx, ny) || 1e-6;
        nx /= m;
        ny /= m;
        tx[c] = nx;
        ty[c] = ny;
      }
    }
    // swap: relaxed field now in ux,uy
    this.ux = tx;
    this.uy = ty;
    this.tx = ux;
    this.ty = uy;

    // Active self-advection: semi-Lagrangian back-sample of the relaxed field.
    const A = this.activity;
    const src = { x: this.ux, y: this.uy };
    const dst = { x: this.tx, y: this.ty };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const l = this.wrapIdx(i - 1, j);
        const r = this.wrapIdx(i + 1, j);
        const u = this.wrapIdx(i, j - 1);
        const dn = this.wrapIdx(i, j + 1);
        // central-difference gradients of U
        const dUxdx = 0.5 * (src.x[r] - src.x[l]);
        const dUxdy = 0.5 * (src.x[dn] - src.x[u]);
        const dUydx = 0.5 * (src.y[r] - src.y[l]);
        const dUydy = 0.5 * (src.y[dn] - src.y[u]);
        const act = A * this.confFactor(i, j);
        let vx = act * (dUxdx + dUydy);
        let vy = act * (dUydx - dUxdy);
        // clamp displacement for unconditional stability (≤2 cells)
        let px = -vx * dt;
        let py = -vy * dt;
        const disp = Math.hypot(px, py);
        if (disp > 2) {
          const s = 2 / disp;
          px *= s;
          py *= s;
        }
        vx = i + px;
        vy = j + py;
        // bilinear back-sample (periodic)
        const x0 = Math.floor(vx);
        const y0 = Math.floor(vy);
        const fx = vx - x0;
        const fy = vy - y0;
        const i00 = this.wrapIdx(x0, y0);
        const i10 = this.wrapIdx(x0 + 1, y0);
        const i01 = this.wrapIdx(x0, y0 + 1);
        const i11 = this.wrapIdx(x0 + 1, y0 + 1);
        const c = i + j * N;
        const sx =
          (src.x[i00] * (1 - fx) + src.x[i10] * fx) * (1 - fy) +
          (src.x[i01] * (1 - fx) + src.x[i11] * fx) * fy;
        const sy =
          (src.y[i00] * (1 - fx) + src.y[i10] * fx) * (1 - fy) +
          (src.y[i01] * (1 - fx) + src.y[i11] * fx) * fy;
        const m = Math.hypot(sx, sy) || 1e-6;
        dst.x[c] = sx / m;
        dst.y[c] = sy / m;
      }
    }
    this.ux = dst.x;
    this.uy = dst.y;
    this.tx = src.x;
    this.ty = src.y;
  }

  // ── 3: nucleation — seeded micro-rotations birth ±½ pairs ─────────────────
  private nucleate(): void {
    const { N, ux, uy } = this;
    const sites = this.nucSites;
    for (let s = 0; s < sites; s++) {
      const ci = Math.floor(this.rng() * N);
      const cj = Math.floor(this.rng() * N);
      // suppress where the confinement has quenched activity
      if (this.confFactor(ci, cj) < 0.6) continue;
      const delta = (this.rng() - 0.5) * this.nucDelta; // θ rotation; U rotates by 2δ
      const c2 = Math.cos(2 * delta);
      const s2 = Math.sin(2 * delta);
      const rad = 2;
      for (let dj = -rad; dj <= rad; dj++) {
        for (let di = -rad; di <= rad; di++) {
          if (di * di + dj * dj > rad * rad) continue;
          const idx = this.wrapIdx(ci + di, cj + dj);
          const ox = ux[idx];
          const oy = uy[idx];
          ux[idx] = ox * c2 - oy * s2;
          uy[idx] = ox * s2 + oy * c2;
        }
      }
    }
  }

  // ── braid coaxing: stamp three +½ cores on a periodic three-body braid ─────
  private braidAnchors(): { x: number; y: number }[] {
    const Rb = 0.55 * this.confR;
    const th = this.braidTime * this.braidOmega;
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const ph = (TWO_PI * k) / 3;
      // radial breathing + angular wobble → the three paths weave (braid).
      // GOLDEN sets the radial proportion, hence a "golden" braid.
      const rr = Rb * (0.62 + 0.3 * Math.sin(3 * th + ph));
      const aa = th + ph + (1 / GOLDEN) * Math.sin(2 * th + ph);
      out.push({
        x: this.confCx + rr * Math.cos(aa),
        y: this.confCy + rr * Math.sin(aa),
      });
    }
    return out;
  }

  /**
   * Coax the interior toward the analytic three-defect director field. We blend
   * U toward U* = (cosΦ, sinΦ) with Φ = Σₖ atan2(y−aₖy, x−aₖx): the exact
   * superposition of three +½ disclinations, so the interior holds EXACTLY three
   * clean +½ cores (no spurious edge defects), and the compensating −3/2 winding
   * is spread smoothly around the taper ring where the stamp hands back to the
   * open exterior field. The anchors ride the periodic golden braid, so the
   * three real, tracked cores genuinely orbit and their distances oscillate.
   */
  private stampBraid(weight: number): void {
    const { N, ux, uy } = this;
    const anchors = this.braidAnchors();
    const R = this.confR;
    const rad = Math.ceil(R);
    const ci = Math.round(this.confCx);
    const cj = Math.round(this.confCy);
    for (let dj = -rad; dj <= rad; dj++) {
      for (let di = -rad; di <= rad; di++) {
        const d = Math.hypot(di, dj);
        if (d > R) continue;
        const gx = ci + di;
        const gy = cj + dj;
        // taper: full weight in the core, →0 at the disk edge for a smooth seam
        const t = d / R;
        const taper = t < 0.8 ? 1 : (1 - t) / 0.2;
        const w = weight * taper;
        if (w <= 0) continue;
        let phiSum = 0;
        for (const a of anchors) phiSum += Math.atan2(gy - a.y, gx - a.x);
        const tx = Math.cos(phiSum);
        const ty = Math.sin(phiSum);
        const idx = ((gx % N) + N) % N + (((gy % N) + N) % N) * N;
        const nx = ux[idx] * (1 - w) + tx * w;
        const ny = uy[idx] * (1 - w) + ty * w;
        const m = Math.hypot(nx, ny) || 1e-6;
        ux[idx] = nx / m;
        uy[idx] = ny / m;
      }
    }
  }

  /** Inject a genuine +½/−½ dipole to sustain the open-field active gas. */
  private seedPair(): void {
    const { N, ux, uy } = this;
    const px = this.rng() * N;
    const py = this.rng() * N;
    if (this.confFactor(Math.round(px), Math.round(py)) < 0.6) return;
    const ang = this.rng() * TWO_PI;
    const sep = 13;
    const cores: { x: number; y: number; s: Sign }[] = [
      { x: px + Math.cos(ang) * sep, y: py + Math.sin(ang) * sep, s: 1 },
      { x: px - Math.cos(ang) * sep, y: py - Math.sin(ang) * sep, s: -1 },
    ];
    const rc = 3.2;
    for (const core of cores) {
      const ci = Math.round(core.x);
      const cj = Math.round(core.y);
      const r = Math.ceil(rc);
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const dd = Math.hypot(di, dj);
          if (dd > rc) continue;
          const phi = core.s * Math.atan2(cj + dj - core.y, ci + di - core.x);
          const w = 0.75 * (1 - dd / rc);
          const idx = this.wrapIdx(ci + di, cj + dj);
          const nx = ux[idx] * (1 - w) + Math.cos(phi) * w;
          const ny = uy[idx] * (1 - w) + Math.sin(phi) * w;
          const m = Math.hypot(nx, ny) || 1e-6;
          ux[idx] = nx / m;
          uy[idx] = ny / m;
        }
      }
    }
  }

  // ── defect detection: winding of φ around each plaquette ───────────────────
  private detect(): RawDefect[] {
    const { N, ux, uy, phi } = this;
    for (let k = 0; k < N * N; k++) phi[k] = Math.atan2(uy[k], ux[k]);
    const raw: RawDefect[] = [];
    for (let j = 0; j < N; j++) {
      const jn = (j + 1) % N;
      for (let i = 0; i < N; i++) {
        const inx = (i + 1) % N;
        const a = phi[i + j * N];
        const b = phi[inx + j * N];
        const c = phi[inx + jn * N];
        const d = phi[i + jn * N];
        const sum = wrap(b - a) + wrap(c - b) + wrap(d - c) + wrap(a - d);
        // φ winds by ±2π over a ±½ defect (θ winds ±π)
        if (sum > 4.0) raw.push({ x: i + 0.5, y: j + 0.5, sign: 1 });
        else if (sum < -4.0) raw.push({ x: i + 0.5, y: j + 0.5, sign: -1 });
      }
    }
    return this.mergeRaw(raw);
  }

  /** Merge near-duplicate same-sign detections (defect cores span cells). */
  private mergeRaw(raw: RawDefect[]): RawDefect[] {
    const out: RawDefect[] = [];
    const used = new Array(raw.length).fill(false);
    for (let i = 0; i < raw.length; i++) {
      if (used[i]) continue;
      let sx = raw[i].x;
      let sy = raw[i].y;
      let n = 1;
      for (let j = i + 1; j < raw.length; j++) {
        if (used[j] || raw[j].sign !== raw[i].sign) continue;
        const dx = raw[j].x - raw[i].x;
        const dy = raw[j].y - raw[i].y;
        if (dx * dx + dy * dy <= 4) {
          sx += raw[j].x;
          sy += raw[j].y;
          n++;
          used[j] = true;
        }
      }
      out.push({ x: sx / n, y: sy / n, sign: raw[i].sign });
    }
    return out;
  }

  // ── tracking: nearest same-sign match → persistent IDs ─────────────────────
  private track(raw: RawDefect[], dt: number): { births: number[]; deaths: RawDefect[] } {
    const R2 = 6 * 6; // match radius²
    const matchedRaw = new Array(raw.length).fill(false);
    const births: number[] = [];
    const deaths: RawDefect[] = [];
    const survivors: TrackedDefect[] = [];

    for (const t of this.tracked) {
      let best = -1;
      let bestD = R2;
      for (let r = 0; r < raw.length; r++) {
        if (matchedRaw[r] || raw[r].sign !== t.sign) continue;
        const dx = raw[r].x - t.x;
        const dy = raw[r].y - t.y;
        const dd = dx * dx + dy * dy;
        if (dd < bestD) {
          bestD = dd;
          best = r;
        }
      }
      if (best >= 0) {
        matchedRaw[best] = true;
        const nx = raw[best].x;
        const ny = raw[best].y;
        const ivx = (nx - t.x) / Math.max(dt, 1e-3);
        const ivy = (ny - t.y) / Math.max(dt, 1e-3);
        t.vx = t.vx * 0.7 + ivx * 0.3;
        t.vy = t.vy * 0.7 + ivy * 0.3;
        t.x = t.x * 0.5 + nx * 0.5;
        t.y = t.y * 0.5 + ny * 0.5;
        t.speed = Math.hypot(t.vx, t.vy);
        if (t.speed > 0.4) t.heading = Math.atan2(t.vy, t.vx);
        t.age += dt;
        t.inside = this.isInside(t.x, t.y);
        t.trail.push(t.x, t.y);
        if (t.trail.length > this.maxTrail * 2) t.trail.splice(0, 2);
        survivors.push(t);
      } else {
        deaths.push({ x: t.x, y: t.y, sign: t.sign });
      }
    }

    // unmatched raw → births
    for (let r = 0; r < raw.length; r++) {
      if (matchedRaw[r]) continue;
      if (survivors.length >= this.cap) break;
      const id = this.nextId++;
      survivors.push({
        id,
        x: raw[r].x,
        y: raw[r].y,
        sign: raw[r].sign,
        vx: 0,
        vy: 0,
        speed: 0,
        heading: this.rng() * TWO_PI,
        age: 0,
        inside: this.isInside(raw[r].x, raw[r].y),
        trail: [raw[r].x, raw[r].y],
      });
      births.push(id);
    }

    this.tracked = survivors;
    return { births, deaths };
  }

  private isInside(x: number, y: number): boolean {
    if (!this.confEngaged) return false;
    const dx = x - this.confCx;
    const dy = y - this.confCy;
    return dx * dx + dy * dy <= this.confR * this.confR;
  }

  // ── braid-lock detection: 3 persistent +½ inside, distances oscillating ────
  private evaluateBraid(dt: number): void {
    if (!this.confEngaged || this.conf < 0.7) {
      this.braidLocked = false;
      this.lockHold = 0;
      this.distWindow.length = 0;
      return;
    }
    const inside = this.tracked
      .filter((t) => t.sign === 1 && t.inside && t.age > 1.2)
      .sort((a, b) => b.age - a.age)
      .slice(0, 3);

    if (inside.length < 3) {
      this.lockHold = Math.max(0, this.lockHold - dt);
      if (this.lockHold <= 0) this.braidLocked = false;
      return;
    }
    // sum of pairwise distances — genuinely oscillates as the braid orbits
    let sum = 0;
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        sum += Math.hypot(inside[a].x - inside[b].x, inside[a].y - inside[b].y);
      }
    }
    this.distWindow.push(sum);
    if (this.distWindow.length > 240) this.distWindow.shift();
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of this.distWindow) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const oscillating = this.distWindow.length > 60 && hi - lo > 0.06 * this.confR;
    if (oscillating) {
      this.lockHold += dt;
      if (this.lockHold > 1.5) this.braidLocked = true;
    } else {
      this.lockHold = Math.max(0, this.lockHold - dt * 0.5);
    }
  }

  // ── one full step ──────────────────────────────────────────────────────────
  step(dt: number): StepResult {
    // ramp confinement engagement smoothly
    const target = this.confEngaged ? 1 : 0;
    this.conf += (target - this.conf) * Math.min(1, dt * 1.6);

    this.stepField(dt);
    this.nucleate();

    // Sustain the open active gas: inject dipoles while the population is below
    // target, so +½ "beings" keep being born to dart and annihilate. Suppressed
    // where the confinement has quenched the field.
    const openPlus = this.tracked.reduce(
      (n, t) => n + (t.sign === 1 && this.confFactor(Math.round(t.x), Math.round(t.y)) > 0.6 ? 1 : 0),
      0,
    );
    if (this.conf < 0.9) {
      let want = openPlus < 10 ? 3 : openPlus < 16 ? 1 : 0;
      while (want-- > 0) this.seedPair();
    }

    if (this.confEngaged && this.conf > 0.45) {
      this.braidTime += dt;
      // coax the interior onto the analytic golden braid
      this.stampBraid(0.9 * this.conf);
    }

    const raw = this.detect();
    const { births, deaths } = this.track(raw, dt);
    this.evaluateBraid(dt);

    let plus = 0;
    let minus = 0;
    for (const t of this.tracked) {
      if (t.sign === 1) plus++;
      else minus++;
    }

    const status: StepResult["status"] = this.braidLocked
      ? "BRAID LOCKED"
      : this.confEngaged
        ? "GATHERING"
        : "CHAOS";

    return {
      status,
      plus,
      minus,
      braidLocked: this.braidLocked,
      braidPeriod: TWO_PI / this.braidOmega,
      births,
      deaths,
    };
  }
}
