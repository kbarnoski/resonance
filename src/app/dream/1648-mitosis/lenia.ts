// Particle Lenia — Alexander Mordvintsev's continuous-CA / particle variant (2023),
// in Bert Chan's Lenia lineage. Pure, DOM-free simulation so it can be unit-reasoned
// and driven from the three.js render loop.
//
// Field math (canonical params). For a query point x, summed over all particles j:
//   bell(v,m,s) = exp(-((v-m)/s)^2)
//   U(x) = Σ_j w_k * bell(dist(x,p_j), mu_k, sigma_k)         // long-range attraction kernel
//   G(x) = bell(U(x), mu_g, sigma_g)                          // growth
//   R(x) = Σ_j (c_rep/2) * max(1 - dist(x,p_j), 0)^2          // short-range repulsion (self excluded)
//   E(x) = R(x) - G(x)
// Each particle descends the energy: p_i -= dt * gradE(p_i), gradE by central differences.

export const MU_K = 4.0;
export const SIGMA_K = 1.0;
export const W_K = 0.022;
export const SIGMA_G = 0.15;
export const C_REP = 1.0;
export const DT = 0.1;
export const EPS = 1e-4;

// mu_g is live-morphable. Low -> one big hollow membrane; mid -> a solid cell with a
// bright rim; high -> the cell fragments into several small cells (mitosis).
export const MU_G_MIN = 0.32;
export const MU_G_MAX = 1.04;
export const MU_G_DEFAULT = 0.6;

const IK2 = 1 / (SIGMA_K * SIGMA_K);
const IG2 = 1 / (SIGMA_G * SIGMA_G);
const LINK = 1.6; // clustering link distance (just above repulsion range)
const MIN_MEMBERS = 6; // ignore stray specks when counting cells

export interface Swarm {
  n: number;
  px: Float32Array;
  py: Float32Array;
  gx: Float32Array;
  gy: Float32Array;
  glow: Float32Array; // per-particle 0..1 brightness for the shader (density + motion)
  muG: number;
  // telemetry (smoothed downstream by the audio engine)
  centroidX: number;
  centroidY: number;
  meanRadius: number;
  radiusStd: number;
  kinetic: number; // mean |gradE|^2 across particles — reorganization energy
  extent: number; // max particle radius, for camera framing
  clusterCount: number; // number of distinct cells
}

function gaussianRadius(spread: number): number {
  // Box–Muller magnitude for a soft blob.
  const u = Math.max(1e-6, Math.random());
  return Math.sqrt(-2 * Math.log(u)) * spread;
}

export function createSwarm(n: number, spread: number, muG: number): Swarm {
  const s: Swarm = {
    n,
    px: new Float32Array(n),
    py: new Float32Array(n),
    gx: new Float32Array(n),
    gy: new Float32Array(n),
    glow: new Float32Array(n),
    muG,
    centroidX: 0,
    centroidY: 0,
    meanRadius: spread,
    radiusStd: 0,
    kinetic: 0,
    extent: spread * 2,
    clusterCount: 1,
  };
  reseed(s, spread, muG);
  return s;
}

export function reseed(s: Swarm, spread: number, muG: number): void {
  const { n, px, py } = s;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = gaussianRadius(spread);
    px[i] = Math.cos(a) * r;
    py[i] = Math.sin(a) * r;
  }
  s.muG = muG;
  s.gx.fill(0);
  s.gy.fill(0);
  s.glow.fill(0.3);
}

// One or more energy-descent substeps. Also gathers cheap per-particle neighbour
// counts (reusing the perturbed distance) so the shader can light the membrane.
export function stepSwarm(s: Swarm, substeps: number): void {
  const { n, px, py, gx, gy, glow } = s;
  const muG = s.muG;
  const nb = _nb.length >= n ? _nb : (_nb = new Float32Array(n));

  for (let step = 0; step < substeps; step++) {
    const last = step === substeps - 1;
    for (let i = 0; i < n; i++) {
      const x = px[i];
      const y = py[i];
      let uxp = 0;
      let uxm = 0;
      let uyp = 0;
      let uym = 0;
      let rxpSum = 0;
      let rxmSum = 0;
      let rypSum = 0;
      let rymSum = 0;
      let neighbours = 0;

      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const ax = x - px[j];
        const ay = y - py[j];
        const axp = ax + EPS;
        const axm = ax - EPS;
        const ayp = ay + EPS;
        const aym = ay - EPS;
        const rxp = Math.sqrt(axp * axp + ay * ay);
        const rxm = Math.sqrt(axm * axm + ay * ay);
        const ryp = Math.sqrt(ax * ax + ayp * ayp);
        const rym = Math.sqrt(ax * ax + aym * aym);

        let t = rxp - MU_K;
        uxp += Math.exp(-t * t * IK2);
        t = rxm - MU_K;
        uxm += Math.exp(-t * t * IK2);
        t = ryp - MU_K;
        uyp += Math.exp(-t * t * IK2);
        t = rym - MU_K;
        uym += Math.exp(-t * t * IK2);

        if (rxp < 1) {
          const m = 1 - rxp;
          rxpSum += m * m;
        }
        if (rxm < 1) {
          const m = 1 - rxm;
          rxmSum += m * m;
        }
        if (ryp < 1) {
          const m = 1 - ryp;
          rypSum += m * m;
        }
        if (rym < 1) {
          const m = 1 - rym;
          rymSum += m * m;
        }
        if (last && rxp < LINK) neighbours++;
      }

      uxp *= W_K;
      uxm *= W_K;
      uyp *= W_K;
      uym *= W_K;

      let g = uxp - muG;
      const exp = 0.5 * C_REP * rxpSum - Math.exp(-g * g * IG2);
      g = uxm - muG;
      const exm = 0.5 * C_REP * rxmSum - Math.exp(-g * g * IG2);
      g = uyp - muG;
      const eyp = 0.5 * C_REP * rypSum - Math.exp(-g * g * IG2);
      g = uym - muG;
      const eym = 0.5 * C_REP * rymSum - Math.exp(-g * g * IG2);

      gx[i] = (exp - exm) / (2 * EPS);
      gy[i] = (eyp - eym) / (2 * EPS);
      if (last) nb[i] = neighbours;
    }

    // integrate: descend the gradient
    for (let i = 0; i < n; i++) {
      px[i] -= DT * gx[i];
      py[i] -= DT * gy[i];
    }
  }

  // telemetry + per-particle glow
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += px[i];
    cy += py[i];
  }
  cx /= n;
  cy /= n;

  let meanR = 0;
  let extent = 0;
  let kinetic = 0;
  for (let i = 0; i < n; i++) {
    const dx = px[i] - cx;
    const dy = py[i] - cy;
    const r = Math.sqrt(dx * dx + dy * dy);
    meanR += r;
    if (r > extent) extent = r;
    const speed2 = gx[i] * gx[i] + gy[i] * gy[i];
    kinetic += speed2;
    // membrane (many neighbours) + motion flares -> brighter
    const density = Math.min(1, nb[i] / 13);
    const flare = Math.min(1, Math.sqrt(speed2) * 0.35);
    glow[i] = Math.min(1, 0.24 + density * 0.7 + flare * 0.6);
  }
  meanR /= n;
  kinetic /= n;

  let varR = 0;
  for (let i = 0; i < n; i++) {
    const dx = px[i] - cx;
    const dy = py[i] - cy;
    const d = Math.sqrt(dx * dx + dy * dy) - meanR;
    varR += d * d;
  }
  varR /= n;

  s.centroidX = cx;
  s.centroidY = cy;
  s.meanRadius = meanR;
  s.radiusStd = Math.sqrt(varR);
  s.kinetic = kinetic;
  s.extent = extent;
}

let _nb = new Float32Array(0);

// Grid-accelerated connected components -> count of distinct cells.
// Cheap enough to run every frame, but callers may throttle it.
export function countClusters(s: Swarm): number {
  const { n, px, py } = s;
  const cell = LINK;
  const inv = 1 / cell;
  const buckets = new Map<number, number[]>();
  const key = (a: number, b: number) => a * 73856093 + b * 19349663;
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(px[i] * inv);
    const by = Math.floor(py[i] * inv);
    const k = key(bx, by);
    const arr = buckets.get(k);
    if (arr) arr.push(i);
    else buckets.set(k, [i]);
  }

  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) r = parent[r];
    while (parent[a] !== r) {
      const nx = parent[a];
      parent[a] = r;
      a = nx;
    }
    return r;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  const link2 = LINK * LINK;
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(px[i] * inv);
    const by = Math.floor(py[i] * inv);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const arr = buckets.get(key(bx + ox, by + oy));
        if (!arr) continue;
        for (let a = 0; a < arr.length; a++) {
          const j = arr[a];
          if (j <= i) continue;
          const dx = px[i] - px[j];
          const dy = py[i] - py[j];
          if (dx * dx + dy * dy < link2) union(i, j);
        }
      }
    }
  }

  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  let cells = 0;
  for (const c of counts.values()) if (c >= MIN_MEMBERS) cells++;
  s.clusterCount = Math.max(1, cells);
  return s.clusterCount;
}
