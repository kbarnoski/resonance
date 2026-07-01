// physarum.ts — the Jones (2010) Physarum transport model as a self-contained
// CPU/Canvas2D fallback simulation, plus the persistent cosmic-node model and
// the gravitational accretion / merge dynamics shared by both render paths.
//
// This is cycle-3 of the cosmic-web thread (see 1089). The GPU path here is a
// RAW WEBGL2 fragment-shader Physarum (see gl.ts); the CPU path below is the
// byte-for-byte-same sense/steer/deposit/diffuse rule at a smaller scale so the
// piece is fully demoable headless with no GPU. Graph extraction (degree, edges,
// clustering) lives in graph.ts and runs on a NORMALISED field produced by
// either path, so the sonified graph is identical across GPU and CPU.
//
// The Jones (2010) agent model: each agent is {x, y, heading}. Per step it
// senses the trail field at three points (forward, forward-left, forward-right
// at a sense angle / sense distance), rotates its heading toward the strongest
// reading, walks forward, wraps at the edges, and deposits a fixed amount of
// trail. A diffuse+decay pass (3x3 box blur * decay < 1) re-routes the network.
// Nutrient wells (nodes) add an attractive Gaussian halo to the sensed value so
// agents climb toward seeds and filaments form BETWEEN them (the cosmic-web
// reading — Elek/Burchett 2020). TWO SPECIES with different sense angles deposit
// into two channels, rendered as two colours and panned L/R.

// ── Tunable model parameters (shared by the WebGL2 + CPU paths) ─────────────
export const PARAMS = {
  senseAngleA: 0.48, // radians: species A angular offset of the L/R sensors
  senseAngleB: 0.66, // species B senses wider -> looser, curlier filaments
  senseDist: 11.0, // pixels ahead the sensors read
  turnSpeed: 0.42, // radians steered per step toward the strongest sensor
  moveSpeed: 1.05, // pixels stepped forward per frame
  depositAmount: 1.0, // trail injected per agent per step (CPU units)
  decay: 0.94, // trail multiplier per diffuse pass (< 1)
  diffuse: 0.62, // 0..1 blend toward the 3x3 box-blur neighbourhood
  nutrientPull: 2.0, // extra weight nutrients add to the sensed value
} as const;

// Brightness normaliser: the extraction + audio thresholds all read a 0..1
// normalised field, so trail scale (very different on GPU vs CPU) drops out.
export const FIELD_K = 0.55;
export function normalise(v: number): number {
  return 1 - Math.exp(-v * FIELD_K);
}

// A cosmic node: a persistent nutrient well carrying MASS. Nodes drift toward
// one another under gravity and merge into super-clusters over minutes. Each
// node also carries a fixed JI scale-degree `tone`, so graph EDGES between nodes
// sound as real interval dyads (see audio.ts).
export interface Node {
  id: number;
  x: number; // 0..1 normalised field coords
  y: number;
  strength: number; // luminous halo strength (attracts agents)
  mass: number; // gravitational mass; grows via accretion / merges
  vx: number; // drift velocity (norm units/sec)
  vy: number;
  degree: number; // measured filament degree (radial ray-count) — smoothed
  clustering: number; // local clustering coefficient 0..1 — smoothed
  tone: number; // JI scale-degree index -> pitch (audio.ts)
  alive: boolean;
}

let NODE_ID = 1;
export function makeNode(x: number, y: number, strength: number, mass: number, tone?: number): Node {
  return {
    id: NODE_ID++,
    x,
    y,
    strength,
    mass,
    vx: 0,
    vy: 0,
    degree: 0,
    clustering: 0,
    tone: tone ?? Math.floor(Math.random() * 8),
    alive: true,
  };
}

export interface FieldStats {
  energy: number; // mean trail brightness 0..~1 (network total activity)
  panX: number; // x of the brightest region 0..1
  panY: number;
}

// ── CPU fallback simulation (two species share one grid via two trail buffers)
export interface CpuSim {
  w: number;
  h: number;
  n: number; // agents per species
  trailA: Float32Array;
  trailB: Float32Array;
  sum: Float32Array; // trailA+trailB rebuilt each diffuse (sensing + extraction)
  norm: Float32Array; // normalise(sum) — what graph extraction reads
  tmp: Float32Array;
  ax: Float32Array;
  ay: Float32Array;
  ah: Float32Array;
  bx: Float32Array;
  by: Float32Array;
  bh: Float32Array;
}

export function makeCpuSim(w: number, h: number, n: number): CpuSim {
  const mk = () => {
    const ax = new Float32Array(n);
    const ay = new Float32Array(n);
    const ah = new Float32Array(n);
    const cx = w * 0.5;
    const cy = h * 0.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * Math.min(w, h) * 0.34;
      ax[i] = cx + Math.cos(a) * r;
      ay[i] = cy + Math.sin(a) * r;
      ah[i] = Math.random() * Math.PI * 2;
    }
    return { ax, ay, ah };
  };
  const A = mk();
  const B = mk();
  return {
    w,
    h,
    n,
    trailA: new Float32Array(w * h),
    trailB: new Float32Array(w * h),
    sum: new Float32Array(w * h),
    norm: new Float32Array(w * h),
    tmp: new Float32Array(w * h),
    ax: A.ax,
    ay: A.ay,
    ah: A.ah,
    bx: B.ax,
    by: B.ay,
    bh: B.ah,
  };
}

function sampleTrail(sum: Float32Array, w: number, h: number, nodes: Node[], px: number, py: number): number {
  let x = Math.floor(px);
  let y = Math.floor(py);
  x = ((x % w) + w) % w;
  y = ((y % h) + h) % h;
  let v = sum[y * w + x];
  for (let k = 0; k < nodes.length; k++) {
    const nu = nodes[k];
    if (!nu.alive) continue;
    const dx = px - nu.x * w;
    const dy = py - nu.y * h;
    const d2 = dx * dx + dy * dy;
    const r = 40.0;
    v += nu.strength * PARAMS.nutrientPull * Math.exp(-d2 / (r * r));
  }
  return v;
}

function stepSpecies(
  sim: CpuSim,
  nodes: Node[],
  senseAngle: number,
  xs: Float32Array,
  ys: Float32Array,
  hs: Float32Array,
  trail: Float32Array,
): void {
  const { n, w, h, sum } = sim;
  const { senseDist, turnSpeed, moveSpeed, depositAmount } = PARAMS;
  for (let i = 0; i < n; i++) {
    const hd = hs[i];
    const x = xs[i];
    const y = ys[i];
    const fC = sampleTrail(sum, w, h, nodes, x + Math.cos(hd) * senseDist, y + Math.sin(hd) * senseDist);
    const lA = hd - senseAngle;
    const rA = hd + senseAngle;
    const fL = sampleTrail(sum, w, h, nodes, x + Math.cos(lA) * senseDist, y + Math.sin(lA) * senseDist);
    const fR = sampleTrail(sum, w, h, nodes, x + Math.cos(rA) * senseDist, y + Math.sin(rA) * senseDist);

    let nh = hd;
    if (fC > fL && fC > fR) {
      // straight on
    } else if (fC < fL && fC < fR) {
      nh += (Math.random() < 0.5 ? -1 : 1) * turnSpeed;
    } else if (fL > fR) {
      nh -= turnSpeed;
    } else if (fR > fL) {
      nh += turnSpeed;
    }

    let nx = x + Math.cos(nh) * moveSpeed;
    let ny = y + Math.sin(nh) * moveSpeed;
    if (nx < 0) nx += w;
    else if (nx >= w) nx -= w;
    if (ny < 0) ny += h;
    else if (ny >= h) ny -= h;
    xs[i] = nx;
    ys[i] = ny;
    hs[i] = nh;

    const ix = nx | 0;
    const iy = ny | 0;
    trail[iy * w + ix] += depositAmount;
  }
}

export function stepCpuAgents(sim: CpuSim, nodes: Node[]): void {
  stepSpecies(sim, nodes, PARAMS.senseAngleA, sim.ax, sim.ay, sim.ah, sim.trailA);
  stepSpecies(sim, nodes, PARAMS.senseAngleB, sim.bx, sim.by, sim.bh, sim.trailB);
}

function diffuseChannel(trail: Float32Array, tmp: Float32Array, w: number, h: number): void {
  const { decay, diffuse } = PARAMS;
  for (let y = 0; y < h; y++) {
    const yu = (y - 1 + h) % h;
    const yd = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const s =
        trail[yu * w + xl] + trail[yu * w + x] + trail[yu * w + xr] +
        trail[y * w + xl] + trail[y * w + x] + trail[y * w + xr] +
        trail[yd * w + xl] + trail[yd * w + x] + trail[yd * w + xr];
      const box = s / 9;
      const cur = trail[y * w + x];
      tmp[y * w + x] = (cur * (1 - diffuse) + box * diffuse) * decay;
    }
  }
  trail.set(tmp);
}

export function diffuseCpu(sim: CpuSim, nodes: Node[]): void {
  const { w, h, trailA, trailB, tmp, sum, norm } = sim;
  diffuseChannel(trailA, tmp, w, h);
  diffuseChannel(trailB, tmp, w, h);
  // Bake a little nutrient glow into both channels so wells stay luminous.
  for (let k = 0; k < nodes.length; k++) {
    const nu = nodes[k];
    if (!nu.alive) continue;
    const cx = nu.x * w;
    const cy = nu.y * h;
    const r = 9;
    const x0 = Math.max(0, (cx - r) | 0);
    const x1 = Math.min(w - 1, (cx + r) | 0);
    const y0 = Math.max(0, (cy - r) | 0);
    const y1 = Math.min(h - 1, (cy + r) | 0);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const g = nu.strength * 0.32 * Math.exp(-(dx * dx + dy * dy) / (r * r));
        trailA[y * w + x] += g;
        trailB[y * w + x] += g;
      }
    }
  }
  // Rebuild summed + normalised fields (extraction + sensing read from these).
  for (let i = 0; i < w * h; i++) {
    const s = trailA[i] + trailB[i];
    sum[i] = s;
    norm[i] = 1 - Math.exp(-s * FIELD_K);
  }
}

// ── Gravitational accretion + merge ─────────────────────────────────────────
// Nodes carry mass, drift toward one another (softened inverse-square), and when
// two get very close the heavier absorbs the lighter -> a super-cluster whose
// mass/strength (and over time connectivity) climb. Returns merge count so the
// caller can strike an audio "coalescence" chime.
export function accrete(nodes: Node[], dt: number, gravity: number): number {
  let merges = 0;
  const alive = nodes.filter((n) => n.alive);
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i];
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d2 = dx * dx + dy * dy + 0.0008;
      const d = Math.sqrt(d2);
      dx /= d;
      dy /= d;
      const f = (gravity * a.mass * b.mass) / d2;
      a.vx += (dx * f * dt) / a.mass;
      a.vy += (dy * f * dt) / a.mass;
      b.vx -= (dx * f * dt) / b.mass;
      b.vy -= (dy * f * dt) / b.mass;
    }
  }
  for (const n of alive) {
    n.vx *= 0.9;
    n.vy *= 0.9;
    const sp = Math.hypot(n.vx, n.vy);
    const cap = 0.06;
    if (sp > cap) {
      n.vx = (n.vx / sp) * cap;
      n.vy = (n.vy / sp) * cap;
    }
    n.x = Math.min(0.94, Math.max(0.06, n.x + n.vx * dt));
    n.y = Math.min(0.94, Math.max(0.06, n.y + n.vy * dt));
  }
  for (let i = 0; i < alive.length; i++) {
    const a = alive[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < alive.length; j++) {
      const b = alive[j];
      if (!b.alive) continue;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 0.035) {
        const heavy = a.mass >= b.mass ? a : b;
        const light = heavy === a ? b : a;
        const total = heavy.mass + light.mass;
        heavy.x = (heavy.x * heavy.mass + light.x * light.mass) / total;
        heavy.y = (heavy.y * heavy.mass + light.y * light.mass) / total;
        heavy.mass = total;
        heavy.strength = Math.min(1.8, heavy.strength + light.strength * 0.5);
        heavy.vx = (heavy.vx + light.vx) * 0.5;
        heavy.vy = (heavy.vy + light.vy) * 0.5;
        light.alive = false;
        merges++;
      }
    }
  }
  return merges;
}

// ── Global stats over the summed field (calm bed signal) ────────────────────
export function statsCpu(sim: CpuSim): FieldStats {
  const { w, h, sum } = sim;
  const GX = 20;
  const GY = 20;
  const sx = w / GX;
  const sy = h / GY;
  let total = 0;
  let bright = -1;
  let bx = 0.5;
  let by = 0.5;
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let s = 0;
      let cnt = 0;
      const x0 = (gx * sx) | 0;
      const x1 = ((gx + 1) * sx) | 0;
      const y0 = (gy * sy) | 0;
      const y1 = ((gy + 1) * sy) | 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          s += sum[y * w + x];
          cnt++;
        }
      }
      const v = cnt > 0 ? s / cnt : 0;
      total += v;
      if (v > bright) {
        bright = v;
        bx = (gx + 0.5) / GX;
        by = (gy + 0.5) / GY;
      }
    }
  }
  const mean = total / (GX * GY);
  return { energy: Math.min(1, mean / 6), panX: bx, panY: by };
}

// ── CPU render: two channels -> two filament colours (node cores + edges are
// drawn by the shared 2D overlay in page.tsx, identical across GPU + CPU). ───
export function drawCpuField(sim: CpuSim, img: ImageData): void {
  const { w, h, trailA, trailB } = sim;
  const data = img.data;
  for (let i = 0; i < w * h; i++) {
    const a = 1 - Math.exp(-trailA[i] * 0.55); // species A -> cyan/teal
    const b = 1 - Math.exp(-trailB[i] * 0.55); // species B -> violet/magenta
    const o = i * 4;
    let r = 6 + a * 70 + b * 150;
    let g = 4 + a * 190 + b * 60;
    let bl = 22 + a * 200 + b * 210;
    if (r > 255) r = 255;
    if (g > 255) g = 255;
    if (bl > 255) bl = 255;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = bl;
    data[o + 3] = 255;
  }
}
