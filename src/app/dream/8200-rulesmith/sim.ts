// ── Particle Life simulation (CPU + spatial hash) ───────────────────────────
//
// N particles in S color "species" live on a toroidal (wrapping) field. An
// asymmetric S×S attraction matrix M[i][j] ∈ [-1,1] is the force species i
// feels toward species j. Force curve (CodeParade / Ventrella "Clusters"):
// universal short-range repulsion inside an inner fraction, then a matrix-
// weighted tent of attraction out to the interaction radius. Velocity
// integrates with friction each frame.
//
// A spatial-hash grid makes neighbour search O(N). Each frame we also measure
// per-species clustering (mean same-species neighbours) so the page can turn
// emergent structure into sound AND into luminance — the world stays alive
// even when muted.

export const S = 5; // species count
export const N = 2400; // particle count
export const WORLD = 1.0; // field is [-WORLD, WORLD]^2, wrapping

const R_MAX = 0.11; // interaction radius
const R_MIN_FRAC = 0.3; // inner repulsion zone as a fraction of R_MAX
const FRICTION = 0.86;
const FORCE = 0.55;

export type Sim = {
  pos: Float32Array; // N*2
  vel: Float32Array; // N*2
  type: Uint8Array; // N
  clustering: Float32Array; // S — normalized 0..1 mean same-species neighbours
  reseedPositions: (rng: () => number) => void;
  step: (dt: number, matrix: Float32Array) => void;
};

export function createSim(rng: () => number): Sim {
  const pos = new Float32Array(N * 2);
  const vel = new Float32Array(N * 2);
  const type = new Uint8Array(N);
  const clustering = new Float32Array(S);

  const cell = R_MAX;
  const gridDim = Math.ceil((2 * WORLD) / cell);
  const heads = new Int32Array(gridDim * gridDim);
  const next = new Int32Array(N);
  const speciesNeighbors = new Float32Array(S);
  const speciesCount = new Int32Array(S);

  const cellOf = (gx: number, gy: number) =>
    ((gx + gridDim) % gridDim) * gridDim + ((gy + gridDim) % gridDim);

  const wrap = (v: number) => {
    if (v > WORLD) return v - 2 * WORLD;
    if (v < -WORLD) return v + 2 * WORLD;
    return v;
  };

  function reseedPositions(r: () => number): void {
    for (let i = 0; i < N; i++) {
      pos[i * 2] = r() * 2 - 1;
      pos[i * 2 + 1] = r() * 2 - 1;
      vel[i * 2] = 0;
      vel[i * 2 + 1] = 0;
      type[i] = Math.floor(r() * S);
    }
  }
  reseedPositions(rng);

  function step(dt: number, m: Float32Array): void {
    // build spatial hash
    heads.fill(-1);
    for (let i = 0; i < N; i++) {
      const gx = Math.floor((pos[i * 2] + WORLD) / cell);
      const gy = Math.floor((pos[i * 2 + 1] + WORLD) / cell);
      const c = cellOf(gx, gy);
      next[i] = heads[c];
      heads[c] = i;
    }

    speciesNeighbors.fill(0);
    speciesCount.fill(0);

    // integrate forces
    for (let i = 0; i < N; i++) {
      const xi = pos[i * 2];
      const yi = pos[i * 2 + 1];
      const ti = type[i];
      let fx = 0;
      let fy = 0;
      let nearSame = 0;

      const gx = Math.floor((xi + WORLD) / cell);
      const gy = Math.floor((yi + WORLD) / cell);

      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          let j = heads[cellOf(gx + ox, gy + oy)];
          while (j !== -1) {
            if (j !== i) {
              let dx = pos[j * 2] - xi;
              let dy = pos[j * 2 + 1] - yi;
              if (dx > WORLD) dx -= 2 * WORLD;
              else if (dx < -WORLD) dx += 2 * WORLD;
              if (dy > WORLD) dy -= 2 * WORLD;
              else if (dy < -WORLD) dy += 2 * WORLD;
              const d2 = dx * dx + dy * dy;
              if (d2 > 0 && d2 < R_MAX * R_MAX) {
                const d = Math.sqrt(d2);
                const rn = d / R_MAX;
                let f: number;
                if (rn < R_MIN_FRAC) {
                  f = rn / R_MIN_FRAC - 1; // universal short-range repulsion
                } else {
                  const a = m[ti * S + type[j]]; // matrix-weighted attraction tent
                  f = a * (1 - Math.abs(2 * rn - 1 - R_MIN_FRAC) / (1 - R_MIN_FRAC));
                }
                fx += (dx / d) * f;
                fy += (dy / d) * f;
                if (type[j] === ti) nearSame++;
              }
            }
            j = next[j];
          }
        }
      }

      vel[i * 2] = vel[i * 2] * FRICTION + fx * FORCE * dt * R_MAX * 60;
      vel[i * 2 + 1] = vel[i * 2 + 1] * FRICTION + fy * FORCE * dt * R_MAX * 60;

      speciesNeighbors[ti] += nearSame;
      speciesCount[ti]++;
    }

    // advance + wrap
    for (let i = 0; i < N; i++) {
      pos[i * 2] = wrap(pos[i * 2] + vel[i * 2] * dt);
      pos[i * 2 + 1] = wrap(pos[i * 2 + 1] + vel[i * 2 + 1] * dt);
    }

    // per-species clustering (mean same-species neighbours, normalized)
    for (let s = 0; s < S; s++) {
      const avg = speciesCount[s] > 0 ? speciesNeighbors[s] / speciesCount[s] : 0;
      clustering[s] = Math.min(1, avg / 6);
    }
  }

  return { pos, vel, type, clustering, reseedPositions, step };
}
