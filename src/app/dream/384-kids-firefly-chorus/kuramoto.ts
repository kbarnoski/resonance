// Kuramoto coupled-oscillator firefly meadow.
//
// Each firefly is a phase oscillator:
//   dθᵢ/dt = ωᵢ + (K / Nᵢ) · Σ_j sin(θⱼ − θᵢ)
// summed over neighbours j within COUPLE_R of firefly i.
//
// When θ crosses 2π the firefly "flashes" (bright + plays its note).
// As fireflies cluster, the local coupling drives phase-locking → they blink
// in unison and their notes collapse onto a shared chord.
//
// We also compute the global Kuramoto order parameter r ∈ [0,1]:
//   r·e^{iψ} = (1/N) · Σ_j e^{iθⱼ}
// r ≈ 0 → chaos, r ≈ 1 → full synchrony. We surface it as a "togetherness"
// cue in the UI.
//
// Reference: Y. Kuramoto (1975); Huygens' coupled pendulum clocks (1665);
// the spontaneous flash-synchrony of SE-Asian Pteroptyx fireflies.

// World space is normalised [0,1] x [0,1]; the renderer maps it to the canvas.

export const NUM_FF = 280; // a few hundred fireflies, target 60fps

// Coupling radius: only fireflies closer than this nudge each other.
export const COUPLE_R = 0.13;
const COUPLE_R2 = COUPLE_R * COUPLE_R;

// Coupling strength K. Strong enough that a dense cluster locks quickly,
// gentle enough that a lone firefly keeps its own rhythm.
export const K = 3.4;

// Natural blink rate spread (radians/sec). D-Dorian lullaby tempo ~ one blink
// every ~1.4s on average, with a gentle spread so the un-synced meadow shimmers.
const OMEGA_MEAN = (2 * Math.PI) / 1.4;
const OMEGA_SPREAD = 0.55; // ± rad/s

// Drift physics — fireflies are soft, floaty, heavily damped.
const DRIFT_ACCEL = 0.9; // how hard tilt/breeze pushes them
const DAMPING = 0.86; // velocity retained per frame (floaty)
const WANDER = 0.012; // tiny idle brownian wander so they never freeze
const MARGIN = 0.04; // soft wall padding

// Spatial hash grid for cheap neighbour lookup.
const GRID_N = Math.max(2, Math.floor(1 / COUPLE_R)); // cells per axis
const CELL = 1 / GRID_N;

export interface FlashEvent {
  index: number;
  x: number;
  y: number;
  /** local synchrony 0..1 at the moment of flash (drives note → chord pull) */
  localR: number;
  /** cluster id this firefly belongs to (-1 if solitary) */
  cluster: number;
}

export interface KuramotoSim {
  readonly n: number;
  // Per-firefly state (flat arrays for cache friendliness + zero-alloc draw).
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly theta: Float32Array;
  readonly omega: Float32Array;
  /** flash brightness 0..1, decays each frame, spikes to 1 on flash */
  readonly bright: Float32Array;
  /** local order parameter per firefly 0..1 (how synced its neighbourhood is) */
  readonly localR: Float32Array;
  /** stable cluster id for colour/chord grouping (-1 = solitary) */
  readonly cluster: Int32Array;
  /** global Kuramoto order parameter r 0..1 */
  orderR: number;

  /**
   * @param dt        seconds since last step
   * @param gx        gravity / breeze vector x (world units/s², already eased)
   * @param gy        gravity / breeze vector y
   * @returns flash events fired this step
   */
  step(dt: number, gx: number, gy: number): FlashEvent[];
}

export function makeSim(): KuramotoSim {
  const n = NUM_FF;
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const theta = new Float32Array(n);
  const omega = new Float32Array(n);
  const bright = new Float32Array(n);
  const localR = new Float32Array(n);
  const cluster = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    x[i] = MARGIN + Math.random() * (1 - 2 * MARGIN);
    y[i] = MARGIN + Math.random() * (1 - 2 * MARGIN);
    theta[i] = Math.random() * Math.PI * 2;
    omega[i] = OMEGA_MEAN + (Math.random() * 2 - 1) * OMEGA_SPREAD;
    cluster[i] = -1;
  }

  // Spatial hash buckets: a flat list of indices, with per-cell start offsets.
  const cellCount = new Int32Array(GRID_N * GRID_N);
  const cellStart = new Int32Array(GRID_N * GRID_N + 1);
  const order = new Int32Array(n); // firefly indices sorted by cell

  function cellOf(i: number): number {
    let cx = (x[i] / CELL) | 0;
    let cy = (y[i] / CELL) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= GRID_N) cx = GRID_N - 1;
    if (cy < 0) cy = 0;
    else if (cy >= GRID_N) cy = GRID_N - 1;
    return cy * GRID_N + cx;
  }

  function rebuildGrid() {
    cellCount.fill(0);
    for (let i = 0; i < n; i++) cellCount[cellOf(i)]++;
    let acc = 0;
    for (let c = 0; c < GRID_N * GRID_N; c++) {
      cellStart[c] = acc;
      acc += cellCount[c];
    }
    cellStart[GRID_N * GRID_N] = acc;
    const cursor = cellStart.slice(0, GRID_N * GRID_N);
    for (let i = 0; i < n; i++) {
      const c = cellOf(i);
      order[cursor[c]++] = i;
    }
  }

  // Scratch for the phase derivative.
  const dtheta = new Float32Array(n);

  // Union-find for stable cluster ids (neighbours-of-neighbours = one cluster).
  const parent = new Int32Array(n);
  function find(a: number): number {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
  }

  function step(dt: number, gx: number, gy: number): FlashEvent[] {
    // Clamp dt so a stalled tab can't explode the integrator.
    if (dt > 0.05) dt = 0.05;

    rebuildGrid();
    dtheta.fill(0);
    for (let i = 0; i < n; i++) parent[i] = i;

    // Accumulators for the global order parameter.
    let sumCos = 0;
    let sumSin = 0;

    // ── Coupling pass: neighbours within COUPLE_R via the 3x3 cell window ──
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const yi = y[i];
      const ti = theta[i];
      let coupleSum = 0; // Σ sin(θⱼ − θᵢ)
      let count = 0;
      // local order accumulators (includes self)
      let lc = Math.cos(ti);
      let ls = Math.sin(ti);

      let cx = (xi / CELL) | 0;
      let cy = (yi / CELL) | 0;
      if (cx < 0) cx = 0;
      else if (cx >= GRID_N) cx = GRID_N - 1;
      if (cy < 0) cy = 0;
      else if (cy >= GRID_N) cy = GRID_N - 1;

      for (let oy = -1; oy <= 1; oy++) {
        const ny = cy + oy;
        if (ny < 0 || ny >= GRID_N) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          if (nx < 0 || nx >= GRID_N) continue;
          const c = ny * GRID_N + nx;
          const s = cellStart[c];
          const e = cellStart[c + 1];
          for (let k = s; k < e; k++) {
            const j = order[k];
            if (j === i) continue;
            const dx = x[j] - xi;
            const dy = y[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 > COUPLE_R2) continue;
            coupleSum += Math.sin(theta[j] - ti);
            lc += Math.cos(theta[j]);
            ls += Math.sin(theta[j]);
            count++;
            if (j > i) union(i, j); // build clusters
          }
        }
      }

      // Kuramoto update: ωᵢ + (K/Nᵢ)·Σ sin(θⱼ−θᵢ)
      dtheta[i] = omega[i] + (count > 0 ? (K / count) * coupleSum : 0);

      // Local order parameter for this firefly's neighbourhood.
      const m = count + 1;
      localR[i] = Math.sqrt(lc * lc + ls * ls) / m;

      sumCos += Math.cos(ti);
      sumSin += Math.sin(ti);
    }

    // ── Integrate phase + detect flashes ──
    const TWO_PI = Math.PI * 2;
    const flashes: FlashEvent[] = [];
    for (let i = 0; i < n; i++) {
      let nt = theta[i] + dtheta[i] * dt;
      if (nt >= TWO_PI) {
        nt -= TWO_PI;
        bright[i] = 1;
        flashes.push({
          index: i,
          x: x[i],
          y: y[i],
          localR: localR[i],
          cluster: find(i),
        });
      }
      theta[i] = nt;
      // brightness decays toward a faint idle glow
      bright[i] *= 0.90;
    }

    // ── Cluster ids: collapse union-find roots to compact stable-ish ids ──
    for (let i = 0; i < n; i++) {
      const root = find(i);
      // Solitary fireflies (their own root, no neighbours) → -1
      cluster[i] = root === i && localR[i] > 0.999 ? -1 : root;
    }

    // ── Drift physics: tilt/breeze gravity + damping + idle wander ──
    for (let i = 0; i < n; i++) {
      vx[i] += gx * DRIFT_ACCEL * dt + (Math.random() * 2 - 1) * WANDER * dt;
      vy[i] += gy * DRIFT_ACCEL * dt + (Math.random() * 2 - 1) * WANDER * dt;
      vx[i] *= DAMPING;
      vy[i] *= DAMPING;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      // Soft walls: bounce gently so they pool instead of sticking.
      if (x[i] < MARGIN) {
        x[i] = MARGIN;
        vx[i] = Math.abs(vx[i]) * 0.4;
      } else if (x[i] > 1 - MARGIN) {
        x[i] = 1 - MARGIN;
        vx[i] = -Math.abs(vx[i]) * 0.4;
      }
      if (y[i] < MARGIN) {
        y[i] = MARGIN;
        vy[i] = Math.abs(vy[i]) * 0.4;
      } else if (y[i] > 1 - MARGIN) {
        y[i] = 1 - MARGIN;
        vy[i] = -Math.abs(vy[i]) * 0.4;
      }
    }

    sim.orderR = Math.sqrt(sumCos * sumCos + sumSin * sumSin) / n;
    return flashes;
  }

  const sim: KuramotoSim = {
    n,
    x,
    y,
    theta,
    omega,
    bright,
    localR,
    cluster,
    orderR: 0,
    step,
  };
  return sim;
}
