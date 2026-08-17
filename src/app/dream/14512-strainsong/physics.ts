// physics.ts — a mass-spring soft-body MEMBRANE, hand-rolled.
//
// A GRID×GRID lattice of point masses linked by structural + shear springs,
// pinned along its whole border, integrated with Verlet + Position-Based
// Dynamics constraint relaxation (Jakobsen 2001). Gravity is a free 2D vector
// (from phone tilt or an autonomous orbit) that pulls the interior toward one
// corner, so the sheet stretches uphill (tension) and bunches downhill
// (compression).
//
// The sim reports a signed STRAIN field: per-spring strain = (len-rest)/rest,
// averaged onto each vertex and into a 4×4 grid of regions. That strain — not a
// slider — is the control signal the audio + visuals read.

export const GRID = 28; // masses per side
export const REGIONS = 4; // 4×4 = 16 regions ↔ 16 recordings
export const REGION_COUNT = REGIONS * REGIONS;

interface Spring {
  a: number;
  b: number;
  rest: number;
  stiff: number; // PBD stiffness 0..1
}

export class Membrane {
  readonly n = GRID * GRID;
  // positions live in clip space [-1, 1] on both axes.
  readonly pos = new Float32Array(this.n * 2);
  private prev = new Float32Array(this.n * 2);
  private pinned = new Uint8Array(this.n);
  private region = new Int32Array(this.n);

  private springs: Spring[] = [];

  /** Signed strain averaged onto each vertex (tension +, compression −). */
  readonly vertStrain = new Float32Array(this.n);
  private degree = new Float32Array(this.n);
  /** Signed strain averaged into each of the 16 regions. */
  readonly regionStrain = new Float32Array(REGION_COUNT);
  /** Peak |strain| seen this step — used to auto-scale color + audio range. */
  maxAbsStrain = 0.0001;

  private readonly iters = 4;
  private readonly damp = 0.985;

  constructor() {
    this.build();
  }

  private build() {
    const g = GRID;
    const span = 2; // [-1, 1]
    const step = span / (g - 1);
    // lay out the rest lattice
    for (let row = 0; row < g; row++) {
      for (let col = 0; col < g; col++) {
        const i = row * g + col;
        const x = -1 + col * step;
        const y = -1 + row * step;
        this.pos[i * 2] = x;
        this.pos[i * 2 + 1] = y;
        this.prev[i * 2] = x;
        this.prev[i * 2 + 1] = y;
        // pin the whole border so the interior can pour and strain against it
        if (row === 0 || col === 0 || row === g - 1 || col === g - 1) {
          this.pinned[i] = 1;
        }
        const rx = Math.min(REGIONS - 1, Math.floor((col * REGIONS) / g));
        const ry = Math.min(REGIONS - 1, Math.floor((row * REGIONS) / g));
        this.region[i] = ry * REGIONS + rx;
      }
    }
    // springs: structural (N/E) + shear (diagonals)
    const addSpring = (a: number, b: number, stiff: number) => {
      const dx = this.pos[a * 2] - this.pos[b * 2];
      const dy = this.pos[a * 2 + 1] - this.pos[b * 2 + 1];
      const rest = Math.hypot(dx, dy);
      this.springs.push({ a, b, rest, stiff });
      this.degree[a] += 1;
      this.degree[b] += 1;
    };
    for (let row = 0; row < g; row++) {
      for (let col = 0; col < g; col++) {
        const i = row * g + col;
        if (col + 1 < g) addSpring(i, i + 1, 0.55); // horizontal structural
        if (row + 1 < g) addSpring(i, i + g, 0.55); // vertical structural
        if (col + 1 < g && row + 1 < g) addSpring(i, i + g + 1, 0.32); // shear ↘
        if (col > 0 && row + 1 < g) addSpring(i, i + g - 1, 0.32); // shear ↙
      }
    }
    for (let i = 0; i < this.n; i++) this.degree[i] = Math.max(1, this.degree[i]);
  }

  /** One integration step under a gravity acceleration vector (clip units/s²). */
  step(dt: number, gx: number, gy: number) {
    const d = Math.min(dt, 1 / 30);
    const dt2 = d * d;
    const pos = this.pos;
    const prev = this.prev;

    // Verlet integrate free masses
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) continue;
      const ix = i * 2;
      const iy = ix + 1;
      const vx = (pos[ix] - prev[ix]) * this.damp;
      const vy = (pos[iy] - prev[iy]) * this.damp;
      prev[ix] = pos[ix];
      prev[iy] = pos[iy];
      pos[ix] += vx + gx * dt2;
      pos[iy] += vy + gy * dt2;
      // never let a mass leave the frame
      if (pos[ix] < -1) pos[ix] = -1;
      else if (pos[ix] > 1) pos[ix] = 1;
      if (pos[iy] < -1) pos[iy] = -1;
      else if (pos[iy] > 1) pos[iy] = 1;
    }

    // PBD relaxation
    for (let it = 0; it < this.iters; it++) {
      for (let s = 0; s < this.springs.length; s++) {
        const sp = this.springs[s];
        const ax = sp.a * 2;
        const bx = sp.b * 2;
        let dx = pos[bx] - pos[ax];
        let dy = pos[bx + 1] - pos[ax + 1];
        const dist = Math.hypot(dx, dy) || 1e-6;
        const diff = ((dist - sp.rest) / dist) * sp.stiff;
        dx *= diff;
        dy *= diff;
        const pa = this.pinned[sp.a];
        const pb = this.pinned[sp.b];
        if (pa && pb) continue;
        if (!pa && !pb) {
          pos[ax] += dx * 0.5;
          pos[ax + 1] += dy * 0.5;
          pos[bx] -= dx * 0.5;
          pos[bx + 1] -= dy * 0.5;
        } else if (pa) {
          pos[bx] -= dx;
          pos[bx + 1] -= dy;
        } else {
          pos[ax] += dx;
          pos[ax + 1] += dy;
        }
      }
    }

    this.measure();
  }

  /** Recompute the signed strain field from final positions. */
  private measure() {
    this.vertStrain.fill(0);
    this.regionStrain.fill(0);
    const rCount = new Float32Array(REGION_COUNT);
    const pos = this.pos;
    let maxAbs = 1e-4;

    for (let s = 0; s < this.springs.length; s++) {
      const sp = this.springs[s];
      const ax = sp.a * 2;
      const bx = sp.b * 2;
      const dx = pos[bx] - pos[ax];
      const dy = pos[bx + 1] - pos[ax + 1];
      const dist = Math.hypot(dx, dy);
      const strain = (dist - sp.rest) / sp.rest; // + tension, − compression
      this.vertStrain[sp.a] += strain;
      this.vertStrain[sp.b] += strain;
      const abs = Math.abs(strain);
      if (abs > maxAbs) maxAbs = abs;
    }

    for (let i = 0; i < this.n; i++) {
      const v = this.vertStrain[i] / this.degree[i];
      this.vertStrain[i] = v;
      const r = this.region[i];
      this.regionStrain[r] += v;
      rCount[r] += 1;
    }
    for (let r = 0; r < REGION_COUNT; r++) {
      if (rCount[r] > 0) this.regionStrain[r] /= rCount[r];
    }
    // smooth the auto-scale so color/audio range breathes rather than flickers
    this.maxAbsStrain += (maxAbs - this.maxAbsStrain) * 0.08;
  }

  /**
   * Inject a ripple: nudge a handful of interior masses so the sheet shivers.
   * `amount` is a 0..1 energy scalar (fed from the live audio analyser).
   */
  kick(amount: number) {
    if (amount <= 0) return;
    const g = GRID;
    const shots = 3;
    for (let k = 0; k < shots; k++) {
      const col = 2 + Math.floor(Math.random() * (g - 4));
      const row = 2 + Math.floor(Math.random() * (g - 4));
      const i = row * g + col;
      if (this.pinned[i]) continue;
      const ang = Math.random() * Math.PI * 2;
      const mag = amount * 0.012;
      // displace prev so Verlet reads it as an impulse
      this.prev[i * 2] -= Math.cos(ang) * mag;
      this.prev[i * 2 + 1] -= Math.sin(ang) * mag;
    }
  }
}
