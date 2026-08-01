// Hydraulic erosion (droplet method) — shared core for the "watershed" DEEP fire.
//
// NOVEL TECHNIQUE for the dream lab (grep-verified 0× prior use, cycle 979): a
// real droplet-based hydraulic-erosion geomorphology simulation whose per-frame
// carve / deposit events are exposed as a musical event stream, plus a live water
// (flow-accumulation) field for visualisation. A watershed that composes itself.
//
// References (cite in prototype READMEs):
//   • Musgrave, Kolb & Mace, "The Synthesis and Rendering of Eroded Fractal
//     Terrains", SIGGRAPH 1989 — the founding hydraulic-erosion-on-heightfield idea.
//   • Mei, Decaudin & Hu, "Fast Hydraulic Erosion Simulation and Visualization on
//     GPU", Pacific Graphics 2007 — the shallow-water velocity-field formulation.
//   • Beyer, "Implementation of a method for hydraulic erosion", BSc thesis 2015
//     (the droplet/particle method, later popularised by Sebastian Lague).
//
// Deterministic by contract: seeded PRNG only. No Math.random / Date.now / new Date.

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

// A single significant carve-or-deposit event, emitted for sonification.
export type ErosionEvent = {
  x: number; // grid column at the event
  y: number; // grid row at the event
  height: number; // terrain height (0..~1) at the event, BEFORE the change
  erosion: number; // >=0 amount of ground carved away this event
  deposit: number; // >=0 amount of sediment dropped this event
  speed: number; // droplet speed 0..~1 (fast, steep flow -> bright)
  life: number; // 0..1 fraction of the droplet's life elapsed (near 1 = river mouth)
};

export type TerrainField = {
  size: number;
  height: Float32Array; // size*size heightmap, ~0..1
  water: Float32Array; // size*size flow-accumulation field for viz, decays each step
  seed: number;
};

// ---- terrain generation (seeded fractal value noise) --------------------------

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const ux = smoothstep(fx);
  const uy = smoothstep(fy);
  return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
}

// Build a mountainous heightfield that drains outward (a central dome bias keeps
// water from pooling on the boundary, so a genuine dendritic drainage net forms).
export function makeTerrain(size: number, seed: number): TerrainField {
  const height = new Float32Array(size * size);
  const water = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1;
      let freq = 3.0 / size;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < 6; o++) {
        sum += amp * valueNoise(x * freq, y * freq, seed + o * 1013);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
      }
      let h = sum / norm;
      // ridge sharpening: fold the noise so peaks read as crests, not blobs.
      h = 1 - Math.abs(2 * h - 1);
      h = h * h;
      // dome bias — high in the middle, low at the rim.
      const cx = x / (size - 1) - 0.5;
      const cy = y / (size - 1) - 0.5;
      const d = Math.sqrt(cx * cx + cy * cy) * 1.414; // 0 centre .. ~1 corner
      h = h * 0.7 + (0.62 - d) * 0.75;
      height[y * size + x] = Math.max(0, h);
    }
  }
  return { size, height, water, seed };
}

// ---- droplet erosion ----------------------------------------------------------

export type ErodeParams = {
  droplets: number; // droplets to simulate this call
  inertia: number; // 0 = water instantly follows gradient, 1 = keeps direction
  sedimentCapacity: number; // how much a fast, full droplet can carry
  minSlope: number; // floor on slope so flat capacity doesn't collapse to 0
  deposition: number; // 0..1 fraction of surplus dropped per step
  erosion: number; // 0..1 fraction of deficit carved per step
  evaporation: number; // 0..1 water lost per step
  gravity: number;
  maxLifetime: number; // steps before a droplet dies
  startWater: number;
  startSpeed: number;
  eventThreshold: number; // min |erosion|+|deposit| to emit an event
  maxEvents: number; // cap on events returned per call
};

export const DEFAULT_ERODE: ErodeParams = {
  droplets: 220,
  inertia: 0.05,
  sedimentCapacity: 4,
  minSlope: 0.01,
  deposition: 0.3,
  erosion: 0.3,
  evaporation: 0.02,
  gravity: 4,
  maxLifetime: 48,
  startWater: 1,
  startSpeed: 1,
  eventThreshold: 0.0015,
  maxEvents: 64,
};

type HG = { height: number; gx: number; gy: number };

function heightAndGradient(h: Float32Array, size: number, px: number, py: number): HG {
  const cx = Math.min(size - 2, Math.max(0, Math.floor(px)));
  const cy = Math.min(size - 2, Math.max(0, Math.floor(py)));
  const fx = px - cx;
  const fy = py - cy;
  const i = cy * size + cx;
  const nw = h[i];
  const ne = h[i + 1];
  const sw = h[i + size];
  const se = h[i + size + 1];
  const gx = (ne - nw) * (1 - fy) + (se - sw) * fy;
  const gy = (sw - nw) * (1 - fx) + (se - ne) * fx;
  const height =
    nw * (1 - fx) * (1 - fy) + ne * fx * (1 - fy) + sw * (1 - fx) * fy + se * fx * fy;
  return { height, gx, gy };
}

function deposit(h: Float32Array, size: number, px: number, py: number, amount: number): void {
  const cx = Math.min(size - 2, Math.max(0, Math.floor(px)));
  const cy = Math.min(size - 2, Math.max(0, Math.floor(py)));
  const fx = px - cx;
  const fy = py - cy;
  const i = cy * size + cx;
  h[i] += amount * (1 - fx) * (1 - fy);
  h[i + 1] += amount * fx * (1 - fy);
  h[i + size] += amount * (1 - fx) * fy;
  h[i + size + 1] += amount * fx * fy;
}

// Erode from a small brush around (px,py) so channels widen instead of pin-holing.
function erodeBrush(
  h: Float32Array,
  size: number,
  px: number,
  py: number,
  amount: number,
): void {
  const cx = Math.round(px);
  const cy = Math.round(py);
  const r = 1;
  let wsum = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const w = 1 - Math.sqrt(dx * dx + dy * dy) / (r + 1);
      if (w > 0) wsum += w;
    }
  }
  if (wsum <= 0) return;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const w = 1 - Math.sqrt(dx * dx + dy * dy) / (r + 1);
      if (w <= 0) continue;
      const idx = y * size + x;
      const take = amount * (w / wsum);
      h[idx] -= Math.min(h[idx], take);
    }
  }
}

// Run one erosion pass. Mutates field.height and field.water; returns a bounded
// list of significant carve/deposit events for the caller to sonify.
export function erode(
  field: TerrainField,
  params: ErodeParams,
  rng: () => number,
): ErosionEvent[] {
  const { size, height, water } = field;
  const events: ErosionEvent[] = [];

  // decay the flow-accumulation viz field
  for (let i = 0; i < water.length; i++) water[i] *= 0.9;

  for (let d = 0; d < params.droplets; d++) {
    let px = rng() * (size - 1);
    let py = rng() * (size - 1);
    let dirX = 0;
    let dirY = 0;
    let speed = params.startSpeed;
    let waterAmt = params.startWater;
    let sediment = 0;

    for (let life = 0; life < params.maxLifetime; life++) {
      const nx0 = Math.floor(px);
      const ny0 = Math.floor(py);
      const hg = heightAndGradient(height, size, px, py);

      // update direction with inertia, then move one cell
      dirX = dirX * params.inertia - hg.gx * (1 - params.inertia);
      dirY = dirY * params.inertia - hg.gy * (1 - params.inertia);
      const len = Math.hypot(dirX, dirY);
      if (len < 1e-6) break; // pit / flat — droplet stalls
      dirX /= len;
      dirY /= len;
      px += dirX;
      py += dirY;

      if (px < 1 || px >= size - 1 || py < 1 || py >= size - 1) break; // drained off-map

      const newHeight = heightAndGradient(height, size, px, py).height;
      const dh = newHeight - hg.height; // >0 uphill, <0 downhill

      // mark the flow field for viz along the droplet path
      const wi = ny0 * size + nx0;
      water[wi] = Math.min(1, water[wi] + 0.25 * waterAmt);

      const capacity = Math.max(-dh, params.minSlope) * speed * waterAmt * params.sedimentCapacity;

      let erosionAmt = 0;
      let depositAmt = 0;
      if (sediment > capacity || dh > 0) {
        // too much sediment, or we went uphill -> drop it (deltas, valley floors)
        depositAmt = dh > 0 ? Math.min(dh, sediment) : (sediment - capacity) * params.deposition;
        sediment -= depositAmt;
        deposit(height, size, px - dirX, py - dirY, depositAmt);
      } else {
        // capacity to spare -> carve (channels, canyons)
        erosionAmt = Math.min((capacity - sediment) * params.erosion, -dh);
        if (erosionAmt > 0) {
          erodeBrush(height, size, px - dirX, py - dirY, erosionAmt);
          sediment += erosionAmt;
        }
      }

      if (erosionAmt + depositAmt >= params.eventThreshold && events.length < params.maxEvents) {
        events.push({
          x: px,
          y: py,
          height: hg.height,
          erosion: erosionAmt,
          deposit: depositAmt,
          speed: Math.min(1, speed / 6),
          life: life / params.maxLifetime,
        });
      }

      speed = Math.sqrt(Math.max(0, speed * speed - dh * params.gravity));
      waterAmt *= 1 - params.evaporation;
      if (waterAmt < 0.01) break;
    }
  }

  return events;
}

// Convenience: overall drainage "maturity" 0..1 — how concentrated flow has
// become into channels (rises as the network organises). Cheap Gini-ish measure.
export function drainageMaturity(field: TerrainField): number {
  const w = field.water;
  let sum = 0;
  let max = 1e-6;
  for (let i = 0; i < w.length; i++) {
    sum += w[i];
    if (w[i] > max) max = w[i];
  }
  const mean = sum / w.length;
  return Math.min(1, mean > 0 ? (max - mean) / (max + mean) : 0);
}
