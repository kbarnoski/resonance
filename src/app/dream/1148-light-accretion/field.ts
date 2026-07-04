// field.ts — the persistent 3D accretion field. This is the MEMORY of the
// piece: a density grid that ACCUMULATES light where notes land and fades on a
// ~75-second half-life, so the structure at minute 5 is genuinely different
// from minute 1 (nothing loops). Deterministic — mulberry32 only.

/** Deterministic PRNG (mulberry32). No Math.random / Date.now anywhere in the
 *  build so prototypes render reproducibly. Seed from a fixed constant. */
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

/** Grid resolution per axis. 48^3 ≈ 110k voxels — plenty of structure, cheap to
 *  quantize + upload each frame. Drop to 40 if perf ever demands. */
export const GRID_N = 48;

/** Half-life of stored light, in seconds. Old deposits fade slowly — this is
 *  the long-form memory that makes the cathedral accrete rather than loop. */
const HALF_LIFE_SECONDS = 75;

/** A single audio-driven frame of drive signals. */
export interface Deposit {
  energy: number; // 0..1 overall RMS
  flux: number; // 0..1 onset strength
  centroid: number; // 0..1 spectral brightness
}

export class AccretionField {
  readonly n: number;
  readonly data: Float32Array;
  private quant: Uint8Array;
  private rand: () => number;

  /** Accumulated helical angle (radians). Successive notes spiral around the
   *  central axis, building the cathedral column. */
  private angle = 0;
  /** Running peak density, eased, so quantization auto-scales as light builds. */
  private peak = 0.001;

  constructor(n = GRID_N, seed = 0x1148acc7) {
    this.n = n;
    this.data = new Float32Array(n * n * n);
    this.quant = new Uint8Array(n * n * n);
    this.rand = mulberry32(seed);
  }

  private idx(x: number, y: number, z: number): number {
    return x + this.n * (y + this.n * z);
  }

  /**
   * Deposit a soft 3D gaussian blob of light. The blob's HEIGHT (y) tracks
   * spectral centroid (register); its ANGLE spirals via an accumulating helix so
   * the column twists as it grows; louder / more-percussive onsets deposit
   * bigger, brighter blobs. Deposits accumulate — never cleared.
   */
  deposit(d: Deposit): void {
    const n = this.n;
    const energy = clamp01(d.energy);
    const flux = clamp01(d.flux);
    const centroid = clamp01(d.centroid);

    // Advance the helix. Faster spiral when the music is more active.
    this.angle += 0.35 + flux * 0.9;

    // Height from register: bright notes climb toward the top of the column.
    const yNorm = 0.15 + centroid * 0.7;

    // Radius from the central axis breathes with energy — quiet passages hug
    // the core, loud passages fling light outward into the nave.
    const radius = (0.12 + energy * 0.22) * (0.9 + this.rand() * 0.2);
    const cx = 0.5 + Math.cos(this.angle) * radius;
    const cz = 0.5 + Math.sin(this.angle) * radius;
    const cy = clamp01(yNorm + (this.rand() - 0.5) * 0.05);

    // Blob amplitude + size scale with the onset. Flux (attack) makes it bright.
    const amp = 0.05 + energy * 0.35 + flux * 0.55;
    const sigmaVox = 1.4 + flux * 1.6 + energy * 1.0; // gaussian radius in voxels
    const sigma2 = 2 * sigmaVox * sigmaVox;
    const reach = Math.ceil(sigmaVox * 2.2);

    const gx = cx * (n - 1);
    const gy = cy * (n - 1);
    const gz = cz * (n - 1);
    const ix = Math.round(gx);
    const iy = Math.round(gy);
    const iz = Math.round(gz);

    for (let dz = -reach; dz <= reach; dz++) {
      const z = iz + dz;
      if (z < 0 || z >= n) continue;
      for (let dy = -reach; dy <= reach; dy++) {
        const y = iy + dy;
        if (y < 0 || y >= n) continue;
        for (let dx = -reach; dx <= reach; dx++) {
          const x = ix + dx;
          if (x < 0 || x >= n) continue;
          const fx = x - gx;
          const fy = y - gy;
          const fz = z - gz;
          const dist2 = fx * fx + fy * fy + fz * fz;
          const g = Math.exp(-dist2 / sigma2);
          if (g < 0.01) continue;
          this.data[this.idx(x, y, z)] += amp * g;
        }
      }
    }
  }

  /** Exponential decay toward darkness with a 75s half-life. Genuine memory. */
  decay(dtSeconds: number): void {
    if (dtSeconds <= 0) return;
    const factor = Math.exp((-dtSeconds * Math.LN2) / HALF_LIFE_SECONDS);
    const d = this.data;
    for (let i = 0; i < d.length; i++) d[i] *= factor;
  }

  /**
   * Quantize the float grid to a Uint8 (R8) buffer for upload as a 3D texture.
   * Auto-scales against an eased running peak so the volume looks luminous from
   * the first deposit without ever clipping to flat white once it fills in.
   */
  quantize(): Uint8Array {
    const d = this.data;
    const q = this.quant;
    // Track peak with a slow release so the exposure adapts gracefully.
    let localPeak = 0;
    for (let i = 0; i < d.length; i++) if (d[i] > localPeak) localPeak = d[i];
    this.peak = Math.max(localPeak, this.peak * 0.995, 0.001);
    const inv = 1 / this.peak;
    for (let i = 0; i < d.length; i++) {
      // Gentle gamma so faint accretion is still visible.
      const v = Math.min(1, d[i] * inv);
      q[i] = Math.min(255, Math.round(Math.pow(v, 0.75) * 255));
    }
    return q;
  }

  /** Total stored light (for a small readout of how much has accreted). */
  totalDensity(): number {
    const d = this.data;
    let s = 0;
    for (let i = 0; i < d.length; i++) s += d[i];
    return s;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
