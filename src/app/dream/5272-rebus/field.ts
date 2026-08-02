/* ── 5272-rebus · two-layer predictive-coding field ──────────────────────
 *
 *  The REBUS model (Carhart-Harris & Friston 2019) made literal on a grid.
 *
 *  Two layers live on the same ~160×100 lattice:
 *    · SENSORY (bottom-up)  — the live mic spectrum painted into the field,
 *                             plus a little seeded noise. Noisy, jittery.
 *    · PREDICTION (top-down) — a generative Gray-Scott reaction-diffusion
 *                             field. Left alone it self-organises: geometric
 *                             spots → branching organic worms. This is the
 *                             cortex's prior/hallucination generator.
 *
 *  Each frame the prediction tries to "explain" the sensory input:
 *      error      = sensory − prediction
 *      prediction += rate · precision · error
 *  where `precision` is the GATING parameter g. At g≈1 (sober) the bottom-up
 *  error is trusted with high precision, so the prediction is yanked back
 *  onto the sensory signal every frame → the display is faithful and jittery.
 *  As g drops (the "dose" arc), that gating relaxes: the correction fades, the
 *  reaction-diffusion prior runs free, and structured imagery blooms out of
 *  what was noise. The displayed image is the precision-weighted blend
 *      display = g·sensory + (1−g)·prediction
 *  so you literally watch top-down prediction take over the sensory field.
 *
 *  All randomness is seeded (mulberry32) — no Math.random anywhere.
 */

export const FIELD_W = 160;
export const FIELD_H = 100;
const N = FIELD_W * FIELD_H;

/** Tiny deterministic PRNG. Written here so the piece self-demos identically
 *  every load — no Math.random / Date.now. Seeded 0x5272 by the caller. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gray-Scott parameters — a "mitosis / branching worm" regime that reads as
// geometric near threshold and organic at the peak.
const DU = 0.16;
const DV = 0.08;
const FEED = 0.037;
const KILL = 0.06;
const CORR_RATE = 0.85; // bottom-up correction strength at full precision

export interface Field {
  u: Float32Array;
  v: Float32Array;
  un: Float32Array;
  vn: Float32Array;
  disp: Float32Array; // precision-weighted blend, 0..1, for the renderer
  noise: Float32Array; // static seeded per-cell grain for the sensory layer
  rnd: () => number;
  bellPhase: number; // rate-limits shimmer-bell feature detection
}

export interface FieldMetrics {
  coherence: number; // 0..1 — how much structured, blended imagery is present
  activity: number; // 0..1 — mean prediction energy
  bell: number; // 0..1 — strength of an emergent feature this frame (else 0)
}

export function createField(seed: number): Field {
  const rnd = mulberry32(seed);
  const u = new Float32Array(N);
  const v = new Float32Array(N);
  const noise = new Float32Array(N);

  // U starts saturated, V near zero with a scatter of seed cells — the
  // classic Gray-Scott initial condition, but seeded so it's reproducible.
  for (let i = 0; i < N; i++) {
    u[i] = 1;
    v[i] = 0;
    noise[i] = rnd();
  }
  const seeds = 220;
  for (let s = 0; s < seeds; s++) {
    const cx = (rnd() * FIELD_W) | 0;
    const cy = (rnd() * FIELD_H) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = (cx + dx + FIELD_W) % FIELD_W;
        const y = (cy + dy + FIELD_H) % FIELD_H;
        v[y * FIELD_W + x] = 0.5;
      }
    }
  }

  return {
    u,
    v,
    un: new Float32Array(N),
    vn: new Float32Array(N),
    disp: new Float32Array(N),
    noise,
    rnd,
    bellPhase: 0,
  };
}

/** One toroidal Gray-Scott diffusion+reaction pass, u/v → un/vn. */
function runReactionPass(f: Field): void {
  const { u, v, un, vn } = f;
  const W = FIELD_W;
  const H = FIELD_H;
  for (let y = 0; y < H; y++) {
    const yUp = ((y - 1 + H) % H) * W;
    const yDn = ((y + 1) % H) * W;
    const yC = y * W;
    for (let x = 0; x < W; x++) {
      const xL = (x - 1 + W) % W;
      const xR = (x + 1) % W;
      const c = yC + x;

      // Laplacian: orthogonal 0.2, diagonal 0.05, centre −1.
      const lu =
        u[yC + xL] * 0.2 +
        u[yC + xR] * 0.2 +
        u[yUp + x] * 0.2 +
        u[yDn + x] * 0.2 +
        u[yUp + xL] * 0.05 +
        u[yUp + xR] * 0.05 +
        u[yDn + xL] * 0.05 +
        u[yDn + xR] * 0.05 -
        u[c];
      const lv =
        v[yC + xL] * 0.2 +
        v[yC + xR] * 0.2 +
        v[yUp + x] * 0.2 +
        v[yDn + x] * 0.2 +
        v[yUp + xL] * 0.05 +
        v[yUp + xR] * 0.05 +
        v[yDn + xL] * 0.05 +
        v[yDn + xR] * 0.05 -
        v[c];

      const uvv = u[c] * v[c] * v[c];
      let nu = u[c] + (DU * lu - uvv + FEED * (1 - u[c]));
      let nv = v[c] + (DV * lv + uvv - (FEED + KILL) * v[c]);
      if (nu < 0) nu = 0;
      else if (nu > 1) nu = 1;
      if (nv < 0) nv = 0;
      else if (nv > 1) nv = 1;
      un[c] = nu;
      vn[c] = nv;
    }
  }
  // swap buffers
  f.u = un;
  f.v = vn;
  f.un = u;
  f.vn = v;
}

/**
 * Advance the predictive-coding loop one animation frame.
 *
 * @param sensory  bottom-up layer, 0..1 per cell (mic- or synthetically-built)
 * @param g        gating / precision, 1 = sober (faithful) … 0 = peak (bloom)
 */
export function stepField(
  f: Field,
  sensory: Float32Array,
  g: number,
): FieldMetrics {
  // Evolution speed rises as gating relaxes: the prior gets to run.
  const iters = 2 + Math.round((1 - g) * 6);
  for (let it = 0; it < iters; it++) runReactionPass(f);

  const v = f.v;
  const disp = f.disp;
  const corr = CORR_RATE * g; // precision-weighted correction gain
  const inv = 1 - g;

  let sum = 0;
  let coh = 0;
  let bell = 0;
  let bellX = 0;
  const W = FIELD_W;
  const H = FIELD_H;

  for (let y = 0; y < H; y++) {
    const yC = y * W;
    for (let x = 0; x < W; x++) {
      const c = yC + x;
      // prediction += rate · precision · (sensory − prediction)
      let nv = v[c] + corr * (sensory[c] - v[c]);
      if (nv < 0) nv = 0;
      else if (nv > 1) nv = 1;
      v[c] = nv;

      const d = g * sensory[c] + inv * nv;
      disp[c] = d;
      sum += nv;

      // coherence: local contrast that is ALSO blended in from the prior.
      // High when strong structured features are present in the display.
      if (x > 0 && y > 0) {
        const gx = disp[c] - disp[c - 1];
        const gy = disp[c] - disp[c - W];
        const grad = gx * gx + gy * gy;
        coh += grad * inv;
        // emergent-feature pick: a bright, high-contrast prediction cell
        const feat = nv * grad * inv;
        if (feat > bell) {
          bell = feat;
          bellX = x / W;
        }
      }
    }
  }

  const activity = Math.min(1, (sum / N) * 3.2);
  const coherence = Math.min(1, (coh / N) * 42);

  // Rate-limit shimmer bells so they ring on genuine emergent features only,
  // never every frame. bellPhase decays; a feature must clear a threshold.
  f.bellPhase = Math.max(0, f.bellPhase - 0.02);
  let bellOut = 0;
  const bellStrength = Math.min(1, bell * 55);
  if (bellStrength > 0.45 && f.bellPhase <= 0 && inv > 0.25) {
    bellOut = bellStrength * (0.4 + bellX * 0.6);
    f.bellPhase = 0.6;
  }

  return { coherence, activity, bell: bellOut };
}

/**
 * Build the bottom-up SENSORY layer from a real FFT magnitude spectrum.
 * Columns map to log-spaced frequency bins; a soft vertical envelope +
 * seeded grain give it noisy body. Mirrored horizontally so structure that
 * later blooms out of it has a faint kaleidoscopic symmetry.
 */
export function applyMicSensory(
  f: Field,
  freq: Uint8Array,
  out: Float32Array,
): void {
  const W = FIELD_W;
  const H = FIELD_H;
  const bins = freq.length;
  const half = W / 2;
  for (let x = 0; x < W; x++) {
    const mx = x < half ? x : W - 1 - x; // mirror
    const t = mx / half; // 0..1
    const bin = Math.min(bins - 1, Math.floor(Math.pow(t, 1.7) * bins));
    const amp = freq[bin] / 255;
    for (let y = 0; y < H; y++) {
      const c = y * W + x;
      const env = 0.5 + 0.5 * Math.sin((y / H) * Math.PI); // brightest mid-band
      const grain = (f.noise[c] - 0.5) * 0.28;
      let s = amp * env * 0.7 + grain + 0.05;
      if (s < 0) s = 0;
      else if (s > 0.6) s = 0.6;
      out[c] = s;
    }
  }
}

/**
 * Synthetic fallback SENSORY layer (mic denied / not yet granted).
 * A gentle drifting spectrum of a few slow partials so the piece self-demos
 * the whole sober→bloom→return story hands-free. Deterministic in `t`.
 */
export function applySyntheticSensory(
  f: Field,
  t: number,
  out: Float32Array,
): void {
  const W = FIELD_W;
  const H = FIELD_H;
  const half = W / 2;
  for (let x = 0; x < W; x++) {
    const mx = x < half ? x : W - 1 - x;
    const fx = mx / half; // 0..1
    const spec =
      0.5 +
      0.28 * Math.sin(t * 0.6 + fx * 7.0) +
      0.18 * Math.sin(t * 0.37 - fx * 13.0) +
      0.12 * Math.sin(t * 0.9 + fx * 3.0);
    for (let y = 0; y < H; y++) {
      const c = y * W + x;
      const env = 0.5 + 0.5 * Math.sin((y / H) * Math.PI);
      const grain = (f.noise[c] - 0.5) * 0.3;
      let s = spec * env * 0.5 + grain + 0.05;
      if (s < 0) s = 0;
      else if (s > 0.6) s = 0.6;
      out[c] = s;
    }
  }
}
