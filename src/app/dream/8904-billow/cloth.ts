// ─────────────────────────────────────────────────────────────────────────────
// cloth.ts — slack, gravity-loaded mass-spring cloth (Provot 1995), integrated
// with Verlet + constraint relaxation. Structural + shear + bend springs.
//
// The cloth is pinned along its TOP edge and DRAPES under gravity. Wind / tilt
// pushes it out of plane (z) so folds travel across the fabric. Each frame we
// measure, per region, the mean spring STRAIN and its RATE of change plus the
// mean vertex SPEED — that is what the audio layer turns into struck bells.
// ─────────────────────────────────────────────────────────────────────────────

export const NX = 32; // points across (columns)
export const NY = 24; // points down    (rows)
export const N = NX * NY;

export const REGX = 6; // sonified regions across
export const REGY = 4; // sonified regions down
export const NREG = REGX * REGY;

// World-space cloth extent (arbitrary units; the camera frames [-1,1]-ish).
const W = 1.6;
const H = 1.4;
const DY = H / (NY - 1);
const TOP_Y = 0.7;

export interface ClothForces {
  gx: number; // lateral gravity / wind (world x)
  gy: number; // gravity (world y, negative = down)
  wz: number; // global out-of-plane wind (world z)
  gusts: { x: number; amp: number; sig: number }[]; // moving gaussian bumps in z
}

export interface Excite {
  strain: number; // mean |strain| in region
  strainRate: number; // d(strain)/dt (signed magnitude used by audio)
  speed: number; // mean vertex speed in region
}

export class Cloth {
  readonly pos: Float32Array; // N*3, live positions (also the render source)
  private readonly prev: Float32Array; // N*3, previous positions (Verlet)
  private readonly pinned: Uint8Array; // 1 = fixed
  private readonly restX: Float32Array; // pin anchors for the top row
  private readonly restY: Float32Array;

  // springs, flattened for cache-friendly relaxation
  private readonly sA: Int32Array;
  private readonly sB: Int32Array;
  private readonly sRest: Float32Array;
  private readonly sReg: Int32Array; // region owning each spring (by midpoint)
  private readonly nS: number;

  private readonly pointReg: Int32Array; // region per point

  private readonly regStrain = new Float32Array(NREG);
  private readonly regPrevStrain = new Float32Array(NREG);
  readonly excite: Excite[] = [];

  constructor(rng: () => number) {
    this.pos = new Float32Array(N * 3);
    this.prev = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);
    this.restX = new Float32Array(NX);
    this.restY = new Float32Array(NX);
    this.pointReg = new Int32Array(N);

    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const k = (j * NX + i) * 3;
        const x = (i / (NX - 1) - 0.5) * W;
        const y = TOP_Y - j * DY;
        // tiny seeded z jitter breaks perfect symmetry so folds read organically
        const z = (rng() - 0.5) * 0.012;
        this.pos[k] = x;
        this.pos[k + 1] = y;
        this.pos[k + 2] = z;
        this.prev[k] = x;
        this.prev[k + 1] = y;
        this.prev[k + 2] = z;
        const idx = j * NX + i;
        if (j === 0) {
          this.pinned[idx] = 1;
          this.restX[i] = x;
          this.restY[i] = y;
        }
        const rc = Math.min(REGX - 1, Math.floor((i / NX) * REGX));
        const rr = Math.min(REGY - 1, Math.floor((j / NY) * REGY));
        this.pointReg[idx] = rr * REGX + rc;
      }
    }

    // Build springs: structural (adjacent), shear (diagonal), bend (skip-one).
    const A: number[] = [];
    const B: number[] = [];
    const R: number[] = [];
    const RG: number[] = [];
    const push = (ax: number, ay: number, bx: number, by: number) => {
      const a = ay * NX + ax;
      const b = by * NX + bx;
      const dx = this.pos[a * 3] - this.pos[b * 3];
      const dy = this.pos[a * 3 + 1] - this.pos[b * 3 + 1];
      const dz = this.pos[a * 3 + 2] - this.pos[b * 3 + 2];
      A.push(a);
      B.push(b);
      R.push(Math.hypot(dx, dy, dz));
      const mi = (ax + bx) * 0.5;
      const mj = (ay + by) * 0.5;
      const rc = Math.min(REGX - 1, Math.floor((mi / NX) * REGX));
      const rr = Math.min(REGY - 1, Math.floor((mj / NY) * REGY));
      RG.push(rr * REGX + rc);
    };
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        if (i + 1 < NX) push(i, j, i + 1, j); // structural h
        if (j + 1 < NY) push(i, j, i, j + 1); // structural v
        if (i + 1 < NX && j + 1 < NY) push(i, j, i + 1, j + 1); // shear \
        if (i + 1 < NX && j + 1 < NY) push(i + 1, j, i, j + 1); // shear /
        if (i + 2 < NX) push(i, j, i + 2, j); // bend h
        if (j + 2 < NY) push(i, j, i, j + 2); // bend v
      }
    }
    this.sA = Int32Array.from(A);
    this.sB = Int32Array.from(B);
    this.sRest = Float32Array.from(R);
    this.sReg = Int32Array.from(RG);
    this.nS = A.length;

    for (let r = 0; r < NREG; r++) {
      this.excite.push({ strain: 0, strainRate: 0, speed: 0 });
    }
  }

  step(dt: number, f: ClothForces): void {
    const { pos, prev, pinned } = this;
    const damp = 0.985;
    const dt2 = dt * dt;

    // ── Verlet integration with per-point force ──────────────────────────────
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const idx = j * NX + i;
        if (pinned[idx]) continue;
        const k = idx * 3;
        const px = pos[k];
        const py = pos[k + 1];
        const pz = pos[k + 2];

        // billow factor: lower rows swing more, top stays taut near the pins
        const bf = 0.35 + 0.65 * (j / (NY - 1));
        let fz = f.wz * bf;
        const wx = px;
        for (let g = 0; g < f.gusts.length; g++) {
          const gu = f.gusts[g];
          const d = wx - gu.x;
          fz += gu.amp * Math.exp(-(d * d) / (2 * gu.sig * gu.sig)) * bf;
        }
        const fx = f.gx * bf;
        const fy = f.gy;

        const nx = px + (px - prev[k]) * damp + fx * dt2;
        const ny = py + (py - prev[k + 1]) * damp + fy * dt2;
        const nz = pz + (pz - prev[k + 2]) * damp + fz * dt2;
        prev[k] = px;
        prev[k + 1] = py;
        prev[k + 2] = pz;
        pos[k] = nx;
        pos[k + 1] = ny;
        pos[k + 2] = nz;
      }
    }

    // ── Constraint relaxation (Jakobsen-style position correction) ───────────
    const ITER = 6;
    const stiff = 0.5; // per-iteration correction fraction
    for (let it = 0; it < ITER; it++) {
      for (let s = 0; s < this.nS; s++) {
        const a = this.sA[s] * 3;
        const b = this.sB[s] * 3;
        const dx = pos[b] - pos[a];
        const dy = pos[b + 1] - pos[a + 1];
        const dz = pos[b + 2] - pos[a + 2];
        const dist = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = ((dist - this.sRest[s]) / dist) * stiff;
        const ox = dx * diff;
        const oy = dy * diff;
        const oz = dz * diff;
        const pa = pinned[this.sA[s]];
        const pb = pinned[this.sB[s]];
        if (!pa && !pb) {
          pos[a] += ox * 0.5;
          pos[a + 1] += oy * 0.5;
          pos[a + 2] += oz * 0.5;
          pos[b] -= ox * 0.5;
          pos[b + 1] -= oy * 0.5;
          pos[b + 2] -= oz * 0.5;
        } else if (!pa) {
          pos[a] += ox;
          pos[a + 1] += oy;
          pos[a + 2] += oz;
        } else if (!pb) {
          pos[b] -= ox;
          pos[b + 1] -= oy;
          pos[b + 2] -= oz;
        }
      }
      // re-pin the top edge exactly
      for (let i = 0; i < NX; i++) {
        const k = i * 3;
        pos[k] = this.restX[i];
        pos[k + 1] = this.restY[i];
        pos[k + 2] = 0;
      }
    }

    // ── Per-region measurement: strain, strain-rate, speed ───────────────────
    const strainSum = new Float32Array(NREG);
    const strainCnt = new Float32Array(NREG);
    for (let s = 0; s < this.nS; s++) {
      const a = this.sA[s] * 3;
      const b = this.sB[s] * 3;
      const dx = pos[b] - pos[a];
      const dy = pos[b + 1] - pos[a + 1];
      const dz = pos[b + 2] - pos[a + 2];
      const dist = Math.hypot(dx, dy, dz);
      const strain = Math.abs(dist - this.sRest[s]) / this.sRest[s];
      const r = this.sReg[s];
      strainSum[r] += strain;
      strainCnt[r] += 1;
    }
    const speedSum = new Float32Array(NREG);
    const speedCnt = new Float32Array(NREG);
    for (let idx = 0; idx < N; idx++) {
      const k = idx * 3;
      const vx = pos[k] - prev[k];
      const vy = pos[k + 1] - prev[k + 1];
      const vz = pos[k + 2] - prev[k + 2];
      const sp = Math.hypot(vx, vy, vz) / dt;
      const r = this.pointReg[idx];
      speedSum[r] += sp;
      speedCnt[r] += 1;
    }
    for (let r = 0; r < NREG; r++) {
      const meanStrain = strainCnt[r] ? strainSum[r] / strainCnt[r] : 0;
      this.regStrain[r] = meanStrain;
      const rate = (meanStrain - this.regPrevStrain[r]) / dt;
      this.regPrevStrain[r] = meanStrain;
      const e = this.excite[r];
      e.strain = meanStrain;
      e.strainRate = Math.abs(rate);
      e.speed = speedCnt[r] ? speedSum[r] / speedCnt[r] : 0;
    }
  }
}
