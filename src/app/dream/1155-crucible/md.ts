// md.ts — a genuine 2D molecular-dynamics gas: the Lennard-Jones potential
// integrated with velocity-Verlet, thermostatted to a target temperature that
// the music supplies as HEAT. This is real physics, in reduced LJ units
// (ε = σ = m = kB = 1), not a faked look.
//
//   • Pair force (John Lennard-Jones, 1924):
//        U(r) = 4ε[(σ/r)^12 − (σ/r)^6]
//        F(r) = 24ε[2(σ/r)^12 − (σ/r)^6] / r   (attractive well + hard core)
//     evaluated with a 2.5σ cutoff and an O(N) cell (neighbor) list.
//   • Integrator (Loup Verlet, velocity form, 1967):
//        v += ½a·dt ; x += v·dt ; recompute a ; v += ½a·dt   (symplectic)
//   • Thermostat: Berendsen velocity-rescale toward the audio-set temperature.
//
// Cold  → the cluster settles into a hexagonal close-packed CRYSTAL (order you
//         can see). Warm → it MELTS to a liquid drop. Hot → it VAPORISES to a
//         gas that fills the box. Onset spikes inject a kinetic SHOCK.
//
// Reflecting walls keep the gas bounded. A soft-core clamp (r ≥ 0.8σ for the
// force only) keeps violent gas collisions numerically stable.

export type Phase = "SOLID" | "LIQUID" | "GAS";

export interface MDStats {
  temperature: number; // instantaneous reduced temperature
  targetTemperature: number; // thermostat set-point (from the music)
  avgCoordination: number; // mean neighbours within the first shell
  phase: Phase;
}

const RC = 2.5; // force cutoff (σ)
const RC2 = RC * RC;
const R_SOFT2 = 0.64; // soft-core clamp for the force (r ≥ 0.8σ)
const COORD_R2 = 1.35 * 1.35; // first-shell radius² for coordination counting
const LATTICE_A = 1.122; // 2^(1/6) — the LJ pair-minimum spacing

/** Deterministic PRNG so the initial crystal and jitter are reproducible. */
function makeRand(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal deviate from a uniform PRNG. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class MolecularDynamics {
  readonly n: number;
  readonly L: number; // square box side
  readonly pos: Float32Array; // n*2, in [0,L]
  readonly vel: Float32Array; // n*2
  readonly speed: Float32Array; // n — |v| per particle (for colour)
  readonly coord: Float32Array; // n — coordination number per particle

  private acc: Float32Array; // n*2
  private rand: () => number;

  // Cell (neighbour) list scratch.
  private ncell: number;
  private cellSize: number;
  private head: Int32Array;
  private next: Int32Array;

  private temp = 0;

  constructor(n = 900, seed = 0x1155c) {
    this.n = n;
    this.rand = makeRand(seed);
    this.pos = new Float32Array(n * 2);
    this.vel = new Float32Array(n * 2);
    this.acc = new Float32Array(n * 2);
    this.speed = new Float32Array(n);
    this.coord = new Float32Array(n);

    // Build a centred triangular (hexagonal) lattice block, then size the box
    // with a vacuum margin so the crystal is a compact drop the gas can boil
    // out of and re-condense into.
    const cols = Math.ceil(Math.sqrt(n * 1.08));
    let idx = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const rowH = LATTICE_A * Math.sqrt(3) * 0.5;
    for (let row = 0; idx < n; row++) {
      const y = row * rowH;
      const xoff = (row & 1) * LATTICE_A * 0.5;
      for (let c = 0; c < cols && idx < n; c++) {
        const x = xoff + c * LATTICE_A;
        this.pos[idx * 2] = x;
        this.pos[idx * 2 + 1] = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        idx++;
      }
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const span = Math.max(spanX, spanY);
    const margin = span * 0.28;
    this.L = span + margin * 2;

    // Centre the lattice in the box.
    const shiftX = (this.L - spanX) * 0.5 - minX;
    const shiftY = (this.L - spanY) * 0.5 - minY;
    for (let i = 0; i < n; i++) {
      this.pos[i * 2] += shiftX;
      this.pos[i * 2 + 1] += shiftY;
    }

    // Seed a small thermal velocity, then remove net momentum so the whole
    // crystal doesn't drift.
    const v0 = Math.sqrt(0.12);
    let cmx = 0;
    let cmy = 0;
    for (let i = 0; i < n; i++) {
      const vx = gaussian(this.rand) * v0;
      const vy = gaussian(this.rand) * v0;
      this.vel[i * 2] = vx;
      this.vel[i * 2 + 1] = vy;
      cmx += vx;
      cmy += vy;
    }
    cmx /= n;
    cmy /= n;
    for (let i = 0; i < n; i++) {
      this.vel[i * 2] -= cmx;
      this.vel[i * 2 + 1] -= cmy;
    }

    this.cellSize = RC;
    this.ncell = Math.max(3, Math.floor(this.L / this.cellSize));
    this.cellSize = this.L / this.ncell;
    this.head = new Int32Array(this.ncell * this.ncell);
    this.next = new Int32Array(n);

    this.computeForces();
  }

  /** Number density (particles per unit area) of the whole box. */
  get density(): number {
    return this.n / (this.L * this.L);
  }

  /** Rebuild the cell list and accumulate LJ forces + coordination counts. */
  private computeForces(): void {
    const { pos, acc, coord, n, ncell, head, next } = this;
    acc.fill(0);
    coord.fill(0);
    head.fill(-1);

    const cs = this.cellSize;
    for (let i = 0; i < n; i++) {
      let cx = Math.floor(pos[i * 2] / cs);
      let cy = Math.floor(pos[i * 2 + 1] / cs);
      if (cx < 0) cx = 0;
      else if (cx >= ncell) cx = ncell - 1;
      if (cy < 0) cy = 0;
      else if (cy >= ncell) cy = ncell - 1;
      const ci = cx + cy * ncell;
      next[i] = head[ci];
      head[ci] = i;
    }

    // Half-stencil neighbour offsets — each cell pair visited once.
    const offs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
    ];

    for (let cy = 0; cy < ncell; cy++) {
      for (let cx = 0; cx < ncell; cx++) {
        const ci = cx + cy * ncell;
        for (let o = 0; o < offs.length; o++) {
          const nx = cx + offs[o][0];
          const ny = cy + offs[o][1];
          if (nx < 0 || nx >= ncell || ny < 0 || ny >= ncell) continue;
          const cj = nx + ny * ncell;
          const sameCell = ci === cj;

          for (let i = head[ci]; i !== -1; i = next[i]) {
            // Within the same cell only consider j after i (avoid double count).
            for (
              let j = sameCell ? next[i] : head[cj];
              j !== -1;
              j = next[j]
            ) {
              const dx = pos[i * 2] - pos[j * 2];
              const dy = pos[i * 2 + 1] - pos[j * 2 + 1];
              const r2 = dx * dx + dy * dy;
              if (r2 >= RC2) continue;

              if (r2 < COORD_R2) {
                coord[i] += 1;
                coord[j] += 1;
              }

              // Soft-core clamp: cap the force at r = 0.8σ for stability.
              const r2f = r2 < R_SOFT2 ? R_SOFT2 : r2;
              const inv2 = 1 / r2f;
              const inv6 = inv2 * inv2 * inv2;
              // F(r)/r = 24(2·inv6² − inv6)·inv2 ; multiply by (dx,dy).
              const f = 24 * (2 * inv6 * inv6 - inv6) * inv2;
              const fx = f * dx;
              const fy = f * dy;
              acc[i * 2] += fx;
              acc[i * 2 + 1] += fy;
              acc[j * 2] -= fx;
              acc[j * 2 + 1] -= fy;
            }
          }
        }
      }
    }
  }

  /**
   * One velocity-Verlet step with reflecting walls, then a Berendsen rescale
   * toward `targetT`. Returns nothing; read stats() afterwards.
   */
  step(dt: number, targetT: number, tau = 0.6): void {
    const { pos, vel, acc, n, L } = this;
    const halfDt = 0.5 * dt;

    // First half-kick + drift + wall reflection.
    for (let i = 0; i < n; i++) {
      const ix = i * 2;
      const iy = ix + 1;
      vel[ix] += halfDt * acc[ix];
      vel[iy] += halfDt * acc[iy];
      let x = pos[ix] + vel[ix] * dt;
      let y = pos[iy] + vel[iy] * dt;
      if (x < 0) {
        x = -x;
        vel[ix] = -vel[ix];
      } else if (x > L) {
        x = 2 * L - x;
        vel[ix] = -vel[ix];
      }
      if (y < 0) {
        y = -y;
        vel[iy] = -vel[iy];
      } else if (y > L) {
        y = 2 * L - y;
        vel[iy] = -vel[iy];
      }
      pos[ix] = x;
      pos[iy] = y;
    }

    this.computeForces();

    // Second half-kick + measure kinetic energy.
    let ke = 0;
    for (let i = 0; i < n; i++) {
      const ix = i * 2;
      const iy = ix + 1;
      vel[ix] += halfDt * acc[ix];
      vel[iy] += halfDt * acc[iy];
      const s2 = vel[ix] * vel[ix] + vel[iy] * vel[iy];
      ke += s2;
      this.speed[i] = Math.sqrt(s2);
    }
    // 2D: KE_total = ½Σv² and equipartition gives KE_total = N·kB·T.
    const temp = 0.5 * ke / n;
    this.temp = temp;

    // Berendsen thermostat — gently steer the measured T toward the target.
    const t = temp < 1e-6 ? 1e-6 : temp;
    let lambda = Math.sqrt(1 + (dt / tau) * (targetT / t - 1));
    if (!Number.isFinite(lambda)) lambda = 1;
    if (lambda < 0.85) lambda = 0.85;
    else if (lambda > 1.18) lambda = 1.18;
    for (let i = 0; i < n; i++) {
      vel[i * 2] *= lambda;
      vel[i * 2 + 1] *= lambda;
    }
  }

  /**
   * Inject kinetic energy into particles near a point (sim coords) — the
   * user's drag "stirs heat" into a region so they can melt it by hand.
   */
  applyLocalHeat(sx: number, sy: number, radius: number, amount: number): void {
    const { pos, vel, n } = this;
    const r2max = radius * radius;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 2] - sx;
      const dy = pos[i * 2 + 1] - sy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2max) continue;
      const falloff = 1 - d2 / r2max;
      const kick = amount * falloff;
      vel[i * 2] += gaussian(this.rand) * kick;
      vel[i * 2 + 1] += gaussian(this.rand) * kick;
    }
  }

  /**
   * A global kinetic shock — an onset spike detonates a burst of velocity
   * through the whole medium (a visible pressure wave that then thermostats
   * back down).
   */
  applyShock(amount: number): void {
    const { vel, n } = this;
    for (let i = 0; i < n; i++) {
      vel[i * 2] += gaussian(this.rand) * amount;
      vel[i * 2 + 1] += gaussian(this.rand) * amount;
    }
  }

  /** Phase + temperature readout for the HUD. */
  stats(targetT: number): MDStats {
    const { coord, n } = this;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += coord[i];
    const avgCoord = sum / n;
    const T = this.temp;

    let phase: Phase;
    if (T < 0.32 && avgCoord > 4.4) phase = "SOLID";
    else if (T < 1.05 && avgCoord > 2.6) phase = "LIQUID";
    else phase = "GAS";

    return {
      temperature: T,
      targetTemperature: targetT,
      avgCoordination: avgCoord,
      phase,
    };
  }
}
