// physarum.ts — shared Physarum (slime-mold) model parameters, types, and a
// self-contained CPU fallback simulation for machines without WebGPU.
//
// The Jones (2010) agent model: each agent is {x, y, heading}. Per step it
// senses the trail field at three points (forward, forward-left, forward-right
// at a sense angle / sense distance), rotates its heading toward the strongest
// reading, walks forward at a constant speed, wraps at the field edges, and
// deposits a fixed amount of trail. A separate diffuse+decay pass (3x3 box blur
// times a decay factor < 1) makes the network breathe and re-route.
//
// "Nutrient" attractors are extra brightness injected into the trail field at
// the points the player seeds — agents flow up that gradient, so filaments grow
// between the wells you place. This is the cosmic-web reading of the model
// (Elek/Burchett 2020): the slime grows the dark-matter-like filament graph.

// ── Tunable model parameters (shared by GPU + CPU paths) ────────────────────

export const PARAMS = {
  senseAngle: 0.52, // radians: angular offset of the L/R sensors
  senseDist: 11.0, // pixels ahead the sensors read
  turnSpeed: 0.42, // radians steered per step toward the strongest sensor
  moveSpeed: 1.05, // pixels stepped forward per frame
  depositAmount: 1.0, // trail injected per agent per step (CPU units)
  decay: 0.94, // trail multiplier per diffuse pass (< 1)
  diffuse: 0.62, // 0..1 blend toward the 3x3 box-blur neighbourhood
  nutrientPull: 1.9, // extra weight nutrients add to the sensed value
} as const;

// A seeded nutrient well in field space (0..1 normalised coords).
export interface Nutrient {
  x: number;
  y: number;
  strength: number; // current brightness (decays / grows over time)
}

// The coarse reduction read back from the field each cycle — this IS what the
// audio engine listens to. Computed identically on GPU readback and CPU.
export interface FieldStats {
  energy: number; // mean trail brightness, 0..~1 (network total activity)
  variance: number; // spatial variance (network "busyness" / branchiness)
  panX: number; // x of the brightest region, 0..1 (slow stereo pan)
  panY: number; // y of the brightest region, 0..1
}

// ── CPU fallback simulation ─────────────────────────────────────────────────
// Smaller grid, fewer agents, same Jones rules + same FieldStats contract so
// the audio coupling is identical to the GPU path.

export interface CpuSim {
  w: number;
  h: number;
  n: number;
  trail: Float32Array; // w*h
  tmp: Float32Array; // w*h scratch for diffuse
  ax: Float32Array; // agent x (pixels)
  ay: Float32Array; // agent y (pixels)
  ah: Float32Array; // agent heading (radians)
}

export function makeCpuSim(w: number, h: number, n: number): CpuSim {
  const trail = new Float32Array(w * h);
  const tmp = new Float32Array(w * h);
  const ax = new Float32Array(n);
  const ay = new Float32Array(n);
  const ah = new Float32Array(n);
  // Seed agents in a soft disc near the centre, headings outward-ish.
  const cx = w * 0.5;
  const cy = h * 0.5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * Math.min(w, h) * 0.32;
    ax[i] = cx + Math.cos(a) * r;
    ay[i] = cy + Math.sin(a) * r;
    ah[i] = Math.random() * Math.PI * 2;
  }
  return { w, h, n, trail, tmp, ax, ay, ah };
}

function sampleTrail(
  sim: CpuSim,
  nutrients: Nutrient[],
  px: number,
  py: number,
): number {
  const { w, h, trail } = sim;
  let x = Math.floor(px);
  let y = Math.floor(py);
  // wrap
  x = ((x % w) + w) % w;
  y = ((y % h) + h) % h;
  let v = trail[y * w + x];
  // Nutrients add an attractive halo so agents climb toward seeded wells.
  for (let k = 0; k < nutrients.length; k++) {
    const nu = nutrients[k];
    const dx = px - nu.x * w;
    const dy = py - nu.y * h;
    const d2 = dx * dx + dy * dy;
    const r = 40.0;
    v += nu.strength * PARAMS.nutrientPull * Math.exp(-d2 / (r * r));
  }
  return v;
}

export function stepCpuAgents(sim: CpuSim, nutrients: Nutrient[]): void {
  const { n, ax, ay, ah, w, h, trail } = sim;
  const { senseAngle, senseDist, turnSpeed, moveSpeed, depositAmount } = PARAMS;
  for (let i = 0; i < n; i++) {
    const hd = ah[i];
    const x = ax[i];
    const y = ay[i];
    const fC = sampleTrail(sim, nutrients, x + Math.cos(hd) * senseDist, y + Math.sin(hd) * senseDist);
    const lA = hd - senseAngle;
    const rA = hd + senseAngle;
    const fL = sampleTrail(sim, nutrients, x + Math.cos(lA) * senseDist, y + Math.sin(lA) * senseDist);
    const fR = sampleTrail(sim, nutrients, x + Math.cos(rA) * senseDist, y + Math.sin(rA) * senseDist);

    let nh = hd;
    if (fC > fL && fC > fR) {
      // straight on
    } else if (fC < fL && fC < fR) {
      // random turn (escape a local valley)
      nh += (Math.random() < 0.5 ? -1 : 1) * turnSpeed;
    } else if (fL > fR) {
      nh -= turnSpeed;
    } else if (fR > fL) {
      nh += turnSpeed;
    }

    let nx = x + Math.cos(nh) * moveSpeed;
    let ny = y + Math.sin(nh) * moveSpeed;
    // wrap
    if (nx < 0) nx += w; else if (nx >= w) nx -= w;
    if (ny < 0) ny += h; else if (ny >= h) ny -= h;
    ax[i] = nx;
    ay[i] = ny;
    ah[i] = nh;

    const ix = nx | 0;
    const iy = ny | 0;
    trail[iy * w + ix] += depositAmount;
  }
}

export function diffuseCpu(sim: CpuSim, nutrients: Nutrient[]): void {
  const { w, h, trail, tmp } = sim;
  const { decay, diffuse } = PARAMS;
  for (let y = 0; y < h; y++) {
    const yu = (y - 1 + h) % h;
    const yd = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const sum =
        trail[yu * w + xl] + trail[yu * w + x] + trail[yu * w + xr] +
        trail[y * w + xl] + trail[y * w + x] + trail[y * w + xr] +
        trail[yd * w + xl] + trail[yd * w + x] + trail[yd * w + xr];
      const box = sum / 9;
      const cur = trail[y * w + x];
      tmp[y * w + x] = (cur * (1 - diffuse) + box * diffuse) * decay;
    }
  }
  trail.set(tmp);
  // Bake a little nutrient glow directly into the field so wells stay luminous
  // and visible even where no agent has reached yet.
  for (let k = 0; k < nutrients.length; k++) {
    const nu = nutrients[k];
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
        trail[y * w + x] += nu.strength * 0.35 * Math.exp(-(dx * dx + dy * dy) / (r * r));
      }
    }
  }
}

// CPU FieldStats over the trail field — same contract as the GPU readback.
export function statsCpu(sim: CpuSim): FieldStats {
  const { w, h, trail } = sim;
  // Downsample to a coarse grid for variance, track the brightest cell.
  const GX = 24;
  const GY = 24;
  const cell = new Float32Array(GX * GY);
  const sx = w / GX;
  const sy = h / GY;
  let total = 0;
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let s = 0;
      const x0 = (gx * sx) | 0;
      const x1 = ((gx + 1) * sx) | 0;
      const y0 = (gy * sy) | 0;
      const y1 = ((gy + 1) * sy) | 0;
      let cnt = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          s += trail[y * w + x];
          cnt++;
        }
      }
      const v = cnt > 0 ? s / cnt : 0;
      cell[gy * GX + gx] = v;
      total += v;
    }
  }
  const mean = total / (GX * GY);
  let varSum = 0;
  let bright = -1;
  let bx = 0.5;
  let by = 0.5;
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      const v = cell[gy * GX + gx];
      const d = v - mean;
      varSum += d * d;
      if (v > bright) {
        bright = v;
        bx = (gx + 0.5) / GX;
        by = (gy + 0.5) / GY;
      }
    }
  }
  const variance = varSum / (GX * GY);
  // Normalise to friendly 0..1-ish ranges for the audio mapping.
  return {
    energy: Math.min(1, mean / 6),
    variance: Math.min(1, Math.sqrt(variance) / 6),
    panX: bx,
    panY: by,
  };
}

// Render the CPU trail field into an ImageData buffer with a luminous cosmic
// palette (deep void → violet → cyan-white filaments → gold cores).
export function drawCpuField(
  sim: CpuSim,
  img: ImageData,
  nutrients: Nutrient[],
): void {
  const { w, h, trail } = sim;
  const data = img.data;
  for (let i = 0; i < w * h; i++) {
    // Soft tone-map of the trail value.
    const t = trail[i];
    const v = 1 - Math.exp(-t * 0.55);
    const [r, g, b] = cosmicPalette(v);
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  // Overlay nutrient cores as bright points.
  for (let k = 0; k < nutrients.length; k++) {
    const nu = nutrients[k];
    const cx = (nu.x * w) | 0;
    const cy = (nu.y * h) | 0;
    const r = 3;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const f = Math.max(0, 1 - Math.hypot(dx, dy) / (r + 1)) * Math.min(1, nu.strength);
        const o = (y * w + x) * 4;
        data[o] = Math.min(255, data[o] + 255 * f);
        data[o + 1] = Math.min(255, data[o + 1] + 230 * f);
        data[o + 2] = Math.min(255, data[o + 2] + 150 * f);
      }
    }
  }
}

export function cosmicPalette(v: number): [number, number, number] {
  // v in 0..1. Deep indigo void → violet → cyan → warm white/gold.
  const c = Math.max(0, Math.min(1, v));
  if (c < 0.35) {
    const s = c / 0.35;
    return [6 + s * 40, 4 + s * 18, 22 + s * 90];
  } else if (c < 0.7) {
    const s = (c - 0.35) / 0.35;
    return [46 + s * 30, 22 + s * 150, 112 + s * 120];
  } else {
    const s = (c - 0.7) / 0.3;
    return [76 + s * 179, 172 + s * 78, 232 + s * 23];
  }
}
