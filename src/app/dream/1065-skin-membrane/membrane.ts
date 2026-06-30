// membrane.ts — a pure mass-spring drumhead solver (no React, no DOM).
//
// A square lattice of point masses connected by structural (4-neighbour),
// shear (diagonal) and bend (2-away) springs, with a pinned boundary. We
// integrate with symplectic Euler (semi-implicit) using 2 substeps/frame and
// per-spring strain tracking — springs that overstretch SNAP, producing a
// visible/audible rupture. A faint autonomous breathing field keeps the skin
// alive when idle. The pointer is a soft radial brush with flick momentum.
//
// Design lineage: position/constraint-based cloth & soft bodies in the spirit
// of Thomas Jakobsen, "Advanced Character Physics" (GDC 2001). We use a force/
// velocity formulation (springs + symplectic Euler) rather than pure Verlet
// projection, but borrow the same ideas: a relaxation grid of point masses,
// distance constraints, and breaking constraints under strain. See README.md.

// ── Grid size ───────────────────────────────────────────────────────────────
// 52×52 is the brief's target. Each spring family is iterated over the grid,
// so cost is ~N^2. On a mid-range laptop 52×52×2 substeps holds 60fps; if a
// device is struggling, drop GRID to 44 (documented in README). We keep 52.
export const GRID = 52;

// ── Tunables ────────────────────────────────────────────────────────────────
const SUBSTEPS = 2;
const STRUCT_K = 480; // structural spring stiffness
const SHEAR_K = 200; // diagonal shear stiffness
const BEND_K = 90; // 2-away bend stiffness
const DAMPING = 0.992; // per-substep velocity damping (alive but settles)
const MAX_VEL = 9; // velocity clamp (rest-length units / s) — stability
const MAX_DISP = 1.4; // out-of-plane displacement clamp
const TEAR_STRAIN = 0.62; // fractional stretch beyond which a spring snaps
const MAX_TEARS = 220; // cap so the skin can't fully disintegrate in one poke
const BREATH_AMP = 0.0016; // autonomous idle forcing amplitude
const BREATH_FREQ = 0.18; // breathing rate (Hz-ish)
const POINTER_RADIUS = 7.0; // brush radius in grid cells
const POINTER_FORCE = 0.55; // brush push strength

// Each mass lives on the membrane: rest position is the (x,y) lattice site;
// `z` is its out-of-plane displacement (what we hear and see deform). The
// solver is effectively 1-D per node (transverse) coupled through springs —
// this is the standard cheap drumhead model and is rock-solid numerically.
export interface MembraneStats {
  tension: number; // mean fractional spring stretch (0..~1) → pitch driver
  excitation: number; // instantaneous injected energy (pokes + tears) 0..1
  brightness: number; // high-freq motion + recent tears 0..1
  tearCount: number; // total springs currently torn
  freshTears: number; // tears that happened this frame (for audio bursts)
}

interface Spring {
  a: number; // index of node A
  b: number; // index of node B
  rest: number; // rest length (in z-space this is 0; we use planar dist as scale)
  k: number; // stiffness
  alive: boolean; // false once torn
  strain: number; // last computed fractional strain (for render shading)
}

export class Membrane {
  readonly n = GRID;
  readonly count = GRID * GRID;

  // Node state (z = transverse displacement, vz = transverse velocity).
  z: Float32Array;
  vz: Float32Array;
  pinned: Uint8Array; // 1 if fixed (boundary)

  springs: Spring[] = [];
  // Areal strain per node, for render shading (0 = slack, →1 taut).
  areal: Float32Array;

  private tears = 0;
  private excitAccum = 0;
  private breathPhase = 0;
  private breathPhase2 = 0;

  // Pointer / brush state.
  private pointerActive = false;
  private px = 0; // grid coords
  private py = 0;
  private pvx = 0; // pointer velocity in grid coords/s (for flick momentum)
  private pvy = 0;
  private pressDepth = 0; // how hard we're pressing (ramps while held)

  constructor() {
    const c = this.count;
    this.z = new Float32Array(c);
    this.vz = new Float32Array(c);
    this.pinned = new Uint8Array(c);
    this.areal = new Float32Array(c);
    this.buildPins();
    this.buildSprings();
  }

  private idx(x: number, y: number): number {
    return y * this.n + x;
  }

  private buildPins(): void {
    const n = this.n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (x === 0 || y === 0 || x === n - 1 || y === n - 1) {
          this.pinned[this.idx(x, y)] = 1;
        }
      }
    }
  }

  private addSpring(ax: number, ay: number, bx: number, by: number, k: number): void {
    const dx = bx - ax;
    const dy = by - ay;
    const rest = Math.hypot(dx, dy);
    this.springs.push({
      a: this.idx(ax, ay),
      b: this.idx(bx, by),
      rest,
      k,
      alive: true,
      strain: 0,
    });
  }

  private buildSprings(): void {
    const n = this.n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        // Structural (right, down).
        if (x + 1 < n) this.addSpring(x, y, x + 1, y, STRUCT_K);
        if (y + 1 < n) this.addSpring(x, y, x, y + 1, STRUCT_K);
        // Shear (diagonals).
        if (x + 1 < n && y + 1 < n) this.addSpring(x, y, x + 1, y + 1, SHEAR_K);
        if (x - 1 >= 0 && y + 1 < n) this.addSpring(x, y, x - 1, y + 1, SHEAR_K);
        // Bend (2-away).
        if (x + 2 < n) this.addSpring(x, y, x + 2, y, BEND_K);
        if (y + 2 < n) this.addSpring(x, y, x, y + 2, BEND_K);
      }
    }
  }

  // ── Pointer API (grid coords; caller maps screen → [0,n)) ──────────────────
  setPointer(gx: number, gy: number, vx: number, vy: number, active: boolean): void {
    if (active && !this.pointerActive) this.pressDepth = 0; // fresh press
    this.pointerActive = active;
    this.px = gx;
    this.py = gy;
    this.pvx = vx;
    this.pvy = vy;
  }

  // Flick: release with velocity imparts a traveling wave at the last point.
  releaseFlick(vx: number, vy: number): void {
    this.pointerActive = false;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.4) return;
    // Stamp a directional dipole (push ahead, pull behind) → traveling wave.
    const dirx = vx / (speed + 1e-6);
    const diry = vy / (speed + 1e-6);
    const amp = Math.min(speed * 0.06, 0.9);
    const lead = 2.2;
    this.stampImpulse(this.px + dirx * lead, this.py + diry * lead, amp, POINTER_RADIUS * 0.8);
    this.stampImpulse(this.px - dirx * lead, this.py - diry * lead, -amp, POINTER_RADIUS * 0.8);
    this.excitAccum += Math.min(amp * 1.5, 1);
  }

  // Add a velocity impulse with a smooth radial falloff.
  private stampImpulse(cx: number, cy: number, amp: number, radius: number): void {
    const n = this.n;
    const r2 = radius * radius;
    const x0 = Math.max(1, Math.floor(cx - radius));
    const x1 = Math.min(n - 2, Math.ceil(cx + radius));
    const y0 = Math.max(1, Math.floor(cy - radius));
    const y1 = Math.min(n - 2, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const fall = 1 - d2 / r2;
        const i = this.idx(x, y);
        if (this.pinned[i]) continue;
        this.vz[i] += amp * fall * fall;
      }
    }
  }

  // ── Main step: advance dt seconds ──────────────────────────────────────────
  step(dt: number): MembraneStats {
    // Clamp dt so a stalled tab (huge dt) cannot explode the sim.
    const sdt = Math.min(dt, 0.033) / SUBSTEPS;
    this.excitAccum *= 0.6; // decay the running excitation between frames
    let freshTears = 0;

    // Ramp press depth while held → the brush "pulls" the skin progressively.
    if (this.pointerActive) this.pressDepth = Math.min(this.pressDepth + dt * 2.2, 1);
    else this.pressDepth *= 0.9;

    for (let s = 0; s < SUBSTEPS; s++) {
      freshTears += this.substep(sdt);
    }

    // Apply pointer brush as a sustained displacement target (press/pull).
    if (this.pointerActive) this.applyBrush(dt);

    // Autonomous breathing — two slow incommensurate sines forcing the field.
    this.breathPhase += dt * BREATH_FREQ * Math.PI * 2;
    this.breathPhase2 += dt * BREATH_FREQ * 1.37 * Math.PI * 2;
    this.applyBreath();

    return this.computeStats(freshTears);
  }

  private substep(dt: number): number {
    const z = this.z;
    const vz = this.vz;
    const springs = this.springs;
    let fresh = 0;

    // Accumulate spring forces. Force model: transverse springs pull a node
    // toward its neighbour's height, scaled by stiffness; "stretch" here is the
    // transverse height difference relative to rest spacing — a clean proxy for
    // membrane tension that is unconditionally stable under our clamps.
    // We integrate velocity then position (symplectic / semi-implicit Euler).
    for (let si = 0; si < springs.length; si++) {
      const sp = springs[si];
      if (!sp.alive) continue;
      const a = sp.a;
      const b = sp.b;
      const diff = z[b] - z[a];
      const force = sp.k * diff;
      const fa = force * dt;
      // Apply equal/opposite (skip pinned — they stay put).
      if (!this.pinned[a]) vz[a] += fa;
      if (!this.pinned[b]) vz[b] -= fa;

      // Strain = |height diff| / rest spacing. Track for shading + tearing.
      const strain = Math.abs(diff) / sp.rest;
      sp.strain = strain;
      if (strain > TEAR_STRAIN && this.tears < MAX_TEARS) {
        sp.alive = false;
        this.tears++;
        fresh++;
        // A snap dumps the stored energy as a local kick.
        const kick = Math.min(diff * 0.5, 0.6);
        if (!this.pinned[a]) vz[a] -= kick;
        if (!this.pinned[b]) vz[b] += kick;
        this.excitAccum = Math.min(this.excitAccum + 0.5, 1);
      }
    }

    // Integrate, damp, clamp. Guard against NaN: if anything goes non-finite,
    // reset that node to rest. This is the safety net for 600+ frames of abuse.
    const c = this.count;
    for (let i = 0; i < c; i++) {
      if (this.pinned[i]) {
        z[i] = 0;
        vz[i] = 0;
        continue;
      }
      let v = vz[i] * DAMPING;
      if (!Number.isFinite(v)) v = 0;
      if (v > MAX_VEL) v = MAX_VEL;
      else if (v < -MAX_VEL) v = -MAX_VEL;
      let nz = z[i] + v * dt;
      if (!Number.isFinite(nz)) {
        nz = 0;
        v = 0;
      }
      if (nz > MAX_DISP) {
        nz = MAX_DISP;
        v *= 0.3;
      } else if (nz < -MAX_DISP) {
        nz = -MAX_DISP;
        v *= 0.3;
      }
      z[i] = nz;
      vz[i] = v;
    }
    return fresh;
  }

  // Sustained brush: pull masses under the cursor toward a press depth and
  // smear in the pointer's motion direction (gives drag a living wake).
  private applyBrush(dt: number): void {
    const n = this.n;
    const radius = POINTER_RADIUS;
    const r2 = radius * radius;
    const target = -0.9 * this.pressDepth; // pressing pushes the skin "in"
    const speed = Math.hypot(this.pvx, this.pvy);
    const x0 = Math.max(1, Math.floor(this.px - radius));
    const x1 = Math.min(n - 2, Math.ceil(this.px + radius));
    const y0 = Math.max(1, Math.floor(this.py - radius));
    const y1 = Math.min(n - 2, Math.ceil(this.py + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - this.px;
        const dy = y - this.py;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const i = this.idx(x, y);
        if (this.pinned[i]) continue;
        const fall = 1 - d2 / r2;
        const soft = fall * fall;
        // Pull toward target depth (spring-to-cursor).
        this.vz[i] += (target - this.z[i]) * POINTER_FORCE * soft * dt * 60;
        // Motion smear: leading edge gets pushed, adds traveling energy.
        if (speed > 0.2) {
          const along = (dx * this.pvx + dy * this.pvy) / (speed + 1e-6);
          this.vz[i] += along * 0.012 * soft;
        }
      }
    }
    this.excitAccum = Math.min(this.excitAccum + (0.04 + speed * 0.01) * this.pressDepth, 1);
  }

  private applyBreath(): void {
    const n = this.n;
    const cx = (n - 1) / 2;
    const cy = (n - 1) / 2;
    const a1 = Math.sin(this.breathPhase) * BREATH_AMP;
    const a2 = Math.sin(this.breathPhase2) * BREATH_AMP * 0.6;
    // Low spatial modes: a gentle dome + a slow sloshing tilt.
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = this.idx(x, y);
        const rx = (x - cx) / cx;
        const ry = (y - cy) / cy;
        const dome = (1 - rx * rx) * (1 - ry * ry);
        const slosh = rx * Math.cos(this.breathPhase2 * 0.5);
        this.vz[i] += a1 * dome + a2 * slosh;
      }
    }
  }

  private computeStats(freshTears: number): MembraneStats {
    const springs = this.springs;
    // Mean spring strain → tension. Also accumulate high-freq motion proxy.
    let strainSum = 0;
    let liveCount = 0;
    for (let si = 0; si < springs.length; si++) {
      const sp = springs[si];
      if (!sp.alive) continue;
      strainSum += sp.strain;
      liveCount++;
    }
    const tension = liveCount > 0 ? strainSum / liveCount : 0;

    // Brightness proxy: mean |velocity| (high-freq jitter) + tear contribution.
    let velSum = 0;
    const c = this.count;
    for (let i = 0; i < c; i++) {
      const v = this.vz[i];
      velSum += v < 0 ? -v : v;
    }
    const meanVel = velSum / c;
    const tearBright = Math.min(this.tears / 80, 1);
    const brightness = Math.min(meanVel * 6 + tearBright * 0.5 + freshTears * 0.15, 1);

    // Update per-node areal strain for the renderer (avg of incident springs).
    this.updateAreal();

    return {
      tension: Math.min(tension * 3.0, 1), // scale into a useful 0..1 band
      excitation: Math.min(this.excitAccum + freshTears * 0.2, 1),
      brightness,
      tearCount: this.tears,
      freshTears,
    };
  }

  // Per-node areal strain = mean strain of its live incident springs, used for
  // colour shading in the renderer. Cheap accumulation pass.
  private areaCount: Float32Array | null = null;
  private updateAreal(): void {
    const areal = this.areal;
    if (!this.areaCount) this.areaCount = new Float32Array(this.count);
    const cnt = this.areaCount;
    areal.fill(0);
    cnt.fill(0);
    const springs = this.springs;
    for (let si = 0; si < springs.length; si++) {
      const sp = springs[si];
      if (!sp.alive) continue;
      areal[sp.a] += sp.strain;
      areal[sp.b] += sp.strain;
      cnt[sp.a]++;
      cnt[sp.b]++;
    }
    const c = this.count;
    for (let i = 0; i < c; i++) {
      if (cnt[i] > 0) areal[i] /= cnt[i];
    }
  }
}
