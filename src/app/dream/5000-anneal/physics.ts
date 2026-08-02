// physics.ts — mass-spring / soft-body crystal lattice with local melt + anneal.
//
// A regular grid of masses connected by structural + shear (diagonal) springs.
// Sustained deformation past a yield strain raises a per-node "melt" scalar in
// [0,1]. Melt softens the springs (kEff drops), so the ordered grid slumps into
// liquid slush; when force is released the strain falls and melt decays back
// toward zero (anneal → re-crystallise). Per-node strain energy is exported so
// the audio layer can use the physics as its composer (BioSonix-style).
//
// Deterministic: any randomness comes from a seeded mulberry32 stream advanced
// in lockstep, never Math.random — so the seeded auto-demo is reproducible.

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

// 6 audio regions: 2 rows x 3 cols, matching the 6-voice modal bank.
export const REGION_ROWS = 2;
export const REGION_COLS = 3;
export const REGION_COUNT = REGION_ROWS * REGION_COLS;

export type Spring = {
  a: number;
  b: number;
  rest: number;
  k: number; // base stiffness (shear springs are weaker than structural)
};

export type Lattice = {
  cols: number;
  rows: number;
  count: number;
  aspect: number; // width / height of the physics box
  px: Float32Array; // current positions
  py: Float32Array;
  ox: Float32Array; // previous positions (Verlet)
  oy: Float32Array;
  rx: Float32Array; // rest / crystal positions
  ry: Float32Array;
  melt: Float32Array; // 0 = crystal, 1 = molten
  strain: Float32Array; // per-node strain energy (this frame)
  ax: Float32Array; // force accumulators
  ay: Float32Array;
  springs: Spring[];
  rng: () => number;
};

export type LatticeInput = {
  pointerActive: boolean;
  px: number; // pointer in physics coords
  py: number;
  vx: number; // pointer velocity (for shear)
  vy: number;
  radius: number;
  force: number; // press strength
  tiltX: number; // device tilt gravity, -1..1
  tiltY: number;
  reduced: boolean;
};

export type StepReport = {
  totalStrain: number;
  avgMelt: number;
  maxMelt: number;
  regionExcite: Float32Array; // positive strain-rate per region (impact energy)
  regionMelt: Float32Array; // avg melt per region (stiffness proxy)
};

const K = 220; // global stiffness scale for the crystal lattice
const K_STRUCT = 1.0;
const K_SHEAR = 0.5;
const YIELD = 0.16; // relative strain above which a spring starts melting nodes
const MELT_GAIN = 3.2; // how fast strain drives melt up
const ANNEAL = 0.55; // per-second decay of melt when unstrained
const MELT_SOFTEN = 0.92; // fraction of stiffness removed at full melt
const DAMP = 0.986; // Verlet velocity damping

export function createLattice(
  cols: number,
  rows: number,
  aspect: number,
  seed: number,
): Lattice {
  const count = cols * rows;
  const px = new Float32Array(count);
  const py = new Float32Array(count);
  const ox = new Float32Array(count);
  const oy = new Float32Array(count);
  const rx = new Float32Array(count);
  const ry = new Float32Array(count);
  const melt = new Float32Array(count);
  const strain = new Float32Array(count);
  const ax = new Float32Array(count);
  const ay = new Float32Array(count);

  // Rest grid spans [-aspect, aspect] x [-1, 1], slightly inset.
  const spanX = aspect * 1.6;
  const spanY = 1.6;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      const x = (i / (cols - 1) - 0.5) * spanX;
      const y = (j / (rows - 1) - 0.5) * spanY;
      rx[idx] = x;
      ry[idx] = y;
      px[idx] = x;
      py[idx] = y;
      ox[idx] = x;
      oy[idx] = y;
    }
  }

  const springs: Spring[] = [];
  const rest = (a: number, b: number) =>
    Math.hypot(rx[a] - rx[b], ry[a] - ry[b]);
  const add = (a: number, b: number, k: number) =>
    springs.push({ a, b, rest: rest(a, b), k });

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i;
      if (i + 1 < cols) add(idx, idx + 1, K_STRUCT); // right
      if (j + 1 < rows) add(idx, idx + cols, K_STRUCT); // down
      if (i + 1 < cols && j + 1 < rows) add(idx, idx + cols + 1, K_SHEAR); // \
      if (i > 0 && j + 1 < rows) add(idx, idx + cols - 1, K_SHEAR); // /
    }
  }

  return {
    cols,
    rows,
    count,
    aspect,
    px,
    py,
    ox,
    oy,
    rx,
    ry,
    melt,
    strain,
    ax,
    ay,
    springs,
    rng: mulberry32(seed),
  };
}

function regionOf(L: Lattice, idx: number): number {
  const i = idx % L.cols;
  const j = (idx / L.cols) | 0;
  const rc = Math.min(REGION_COLS - 1, ((i / L.cols) * REGION_COLS) | 0);
  const rr = Math.min(REGION_ROWS - 1, ((j / L.rows) * REGION_ROWS) | 0);
  return rr * REGION_COLS + rc;
}

// Scratch buffers reused across frames (allocation-free hot loop).
const regExcite = new Float32Array(REGION_COUNT);
const regMelt = new Float32Array(REGION_COUNT);
const regCount = new Float32Array(REGION_COUNT);
const prevRegionStrain = new Float32Array(REGION_COUNT);
const regStrain = new Float32Array(REGION_COUNT);

export function stepLattice(
  L: Lattice,
  dt: number,
  input: LatticeInput,
): StepReport {
  const sub = 2; // substeps for stability
  const h = dt / sub;
  const { px, py, ox, oy, rx, ry, melt, strain, ax, ay, springs } = L;

  strain.fill(0);

  for (let s = 0; s < sub; s++) {
    ax.fill(0);
    ay.fill(0);

    // Spring forces + strain accumulation + melt drive.
    for (let si = 0; si < springs.length; si++) {
      const sp = springs[si];
      const a = sp.a;
      const b = sp.b;
      const dx = px[b] - px[a];
      const dy = py[b] - py[a];
      let len = Math.hypot(dx, dy);
      if (len < 1e-6) len = 1e-6;
      const rel = (len - sp.rest) / sp.rest; // signed relative strain
      const soft = 1 - MELT_SOFTEN * 0.5 * (melt[a] + melt[b]);
      const kEff = sp.k * K * soft;
      const f = kEff * (len - sp.rest);
      const nx = dx / len;
      const ny = dy / len;
      ax[a] += f * nx;
      ay[a] += f * ny;
      ax[b] -= f * nx;
      ay[b] -= f * ny;

      // strain energy on the spring, split to both nodes
      const e = 0.5 * kEff * (len - sp.rest) * (len - sp.rest);
      strain[a] += e;
      strain[b] += e;

      // yield: excess relative strain heats the two nodes toward melting
      const over = Math.abs(rel) - YIELD;
      if (over > 0) {
        const heat = over * MELT_GAIN * h;
        melt[a] = Math.min(1, melt[a] + heat);
        melt[b] = Math.min(1, melt[b] + heat);
      }
    }

    // External input: pointer press dents the lattice (radial push away),
    // drag shears it, tilt acts as directional gravity on molten nodes.
    if (input.pointerActive && input.force > 0) {
      const r2 = input.radius * input.radius;
      for (let idx = 0; idx < L.count; idx++) {
        const dx = px[idx] - input.px;
        const dy = py[idx] - input.py;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          const fall = 1 - d2 / r2;
          let len = Math.sqrt(d2);
          if (len < 1e-6) len = 1e-6;
          const push = input.force * fall * 6.0;
          ax[idx] += (dx / len) * push;
          ay[idx] += (dy / len) * push;
          // drag imparts shear
          ax[idx] += input.vx * fall * 4.0;
          ay[idx] += input.vy * fall * 4.0;
        }
      }
    }

    // Integrate (Verlet) with gravity + weak restoring pull toward rest.
    for (let idx = 0; idx < L.count; idx++) {
      const m = melt[idx];
      // tilt is a body force: it strains even the crystal (so a hard tilt can
      // yield it) and slumps molten regions much harder. Downward drip only
      // affects already-molten nodes, so the crystal never sags at rest.
      const rm = input.reduced ? 0.6 : 1;
      const g = (0.5 + 1.7 * m) * rm;
      ax[idx] += input.tiltX * g;
      ay[idx] += input.tiltY * g - 0.35 * m * rm; // molten drip

      // weak home spring keeps crystal registered; vanishes when molten
      ax[idx] += (rx[idx] - px[idx]) * 0.6 * (1 - m);
      ay[idx] += (ry[idx] - py[idx]) * 0.6 * (1 - m);

      const cx = px[idx];
      const cy = py[idx];
      let vx = (cx - ox[idx]) * DAMP;
      let vy = (cy - oy[idx]) * DAMP;
      // molten slush: extra viscous damping + seeded jitter (deterministic)
      if (m > 0.05) {
        const visc = 1 - 0.25 * m;
        vx *= visc;
        vy *= visc;
        const jit = 0.0016 * m * (input.reduced ? 0.3 : 1);
        vx += (L.rng() - 0.5) * jit;
        vy += (L.rng() - 0.5) * jit;
      }
      px[idx] = cx + vx + ax[idx] * h * h;
      py[idx] = cy + vy + ay[idx] * h * h;
      ox[idx] = cx;
      oy[idx] = cy;
    }
  }

  // Anneal: melt decays toward zero when the node is no longer over-strained.
  const annealStep = ANNEAL * dt;
  let total = 0;
  let meltSum = 0;
  let meltMax = 0;
  regExcite.fill(0);
  regMelt.fill(0);
  regCount.fill(0);
  regStrain.fill(0);

  for (let idx = 0; idx < L.count; idx++) {
    melt[idx] = Math.max(0, melt[idx] - annealStep);
    const st = strain[idx];
    total += st;
    meltSum += melt[idx];
    if (melt[idx] > meltMax) meltMax = melt[idx];
    const r = regionOf(L, idx);
    regStrain[r] += st;
    regMelt[r] += melt[idx];
    regCount[r] += 1;
  }

  for (let r = 0; r < REGION_COUNT; r++) {
    // excitation = positive rate of strain change (an "impact" this frame)
    const delta = regStrain[r] - prevRegionStrain[r];
    regExcite[r] = delta > 0 ? delta : 0;
    prevRegionStrain[r] = regStrain[r];
    regMelt[r] = regCount[r] > 0 ? regMelt[r] / regCount[r] : 0;
  }

  return {
    totalStrain: total,
    avgMelt: meltSum / L.count,
    maxMelt: meltMax,
    regionExcite: regExcite,
    regionMelt: regMelt,
  };
}
