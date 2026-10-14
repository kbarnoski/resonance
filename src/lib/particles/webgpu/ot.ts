// ─────────────────────────────────────────────────────────────────────────────
// ot.ts — PHASE E: optimal-transport form changes (?ot=1).
//
// Spatial pairing (step 1 of the particle upgrade) matched motes to an image's
// samples by polar quantiles about the centre — a fast approximation of
// optimal transport that is exact only for round, centred forms. Sliced
// optimal transport (Bonneel et al.) gets the real thing: every mote is moved
// along the SHORTEST total path onto the image (W₂-optimal), so a form change
// is a flow — nothing crosses the centre, nothing swaps sides.
//
// Iterated 1-D OT along K directions, each step sort-free (the GPU has no sort
// to spare): along direction θ, a mote's quantile among the motes (histogram
// CDF + a per-mote rank within its bin) is matched to the same quantile of the
// image samples (inverse CDF, linear within the bin), and the mote's target
// moves by the difference along θ. After K slices the targets are distributed
// like the image and each has travelled the least. Space: the image plane's
// NDC (the sim's own: coverNdc of the sample uv); results go back to uv for
// the sim's image spring.
//
// LAWS: computed once per image, SLICES_PER_FRAME at a time over a few frames
// (never inside one frame's budget); targets start at the motes themselves and
// refine, and the image pull already eases in — so the form gathers smoothly;
// motion only. Off by default; ?ot=1 replaces the spatial-pairing assignment
// (the pairing's own uniforms and softness still apply). Snowflake + Ghost:
// unchanged when off.
// ─────────────────────────────────────────────────────────────────────────────

export const OT_LAWS = {
  /** total slices per image */
  SLICES: 32,
  /** slices computed per frame (the job spreads over SLICES / this frames) */
  SLICES_PER_FRAME: 8,
  /** histogram bins per slice */
  BINS: 4096,
  /** the plane-NDC range the histograms span (±; the cover-fit image ≤ ~2.3) */
  RANGE: 4,
} as const;

export function otRequested(search?: string): boolean {
  try { return new URLSearchParams(search ?? (typeof location !== "undefined" ? location.search : "")).get("ot") === "1"; } catch { return false; }
}

/** Slice k's direction (golden-angle spread, deterministic). */
export function sliceDir(k: number): [number, number] {
  const a = k * 2.399963229728653 + 0.37;
  return [Math.cos(a), Math.sin(a)];
}

/** The sim's coverNdc (shaders.ts IMG_UV) and its inverse. */
export function coverNdc(u: number, v: number, imgAspect: number, scrAspect: number): [number, number] {
  let dx = (u - 0.5) * 2 * 1.06, dy = (v - 0.5) * 2 * 1.06;
  if (imgAspect > scrAspect) dx *= imgAspect / scrAspect; else dy *= scrAspect / imgAspect;
  return [dx, dy];
}
export function uncoverNdc(x: number, y: number, imgAspect: number, scrAspect: number): [number, number] {
  let dx = x, dy = y;
  if (imgAspect > scrAspect) dx /= imgAspect / scrAspect; else dy /= scrAspect / imgAspect;
  return [dx / (2 * 1.06) + 0.5, dy / (2 * 1.06) + 0.5];
}

/** Per-mote rank within its bin (the GPU's hash). */
export function rankHash(i: number): number {
  let s = (Math.imul(i, 747796405) + 2891336453) >>> 0;
  const w = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0;
  s = ((w >>> 22) ^ w) >>> 0;
  return (s >>> 8) / 16777216;
}

/** One sort-free 1-D OT slice (CPU mirror of ot-wgsl.ts): Y (n×2) moves along θ. */
export function otSlice(Y: Float32Array, T: Float32Array, dir: readonly [number, number], bins: number = OT_LAWS.BINS, range: number = OT_LAWS.RANGE): void {
  const n = Y.length >> 1;
  const hY = new Uint32Array(bins), hT = new Uint32Array(bins);
  const w = (2 * range) / bins;
  const bin = (x: number) => Math.max(0, Math.min(bins - 1, Math.floor((x + range) / w)));
  for (let i = 0; i < n; i++) {
    hY[bin(Y[i * 2] * dir[0] + Y[i * 2 + 1] * dir[1])]++;
    hT[bin(T[i * 2] * dir[0] + T[i * 2 + 1] * dir[1])]++;
  }
  const cY = new Uint32Array(bins), cT = new Uint32Array(bins);
  for (let b = 1; b < bins; b++) { cY[b] = cY[b - 1] + hY[b - 1]; cT[b] = cT[b - 1] + hT[b - 1]; }
  for (let i = 0; i < n; i++) {
    const y = Y[i * 2] * dir[0] + Y[i * 2 + 1] * dir[1];
    const b = bin(y);
    const q = cY[b] + rankHash(i) * hY[b]; // the mote's place among the motes
    // the bin of the image whose CDF holds q (binary search, monotone)
    let lo = 0, hi = bins - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cT[m] <= q) lo = m; else hi = m - 1; }
    const t = -range + (lo + (hT[lo] > 0 ? (q - cT[lo]) / hT[lo] : 0.5)) * w;
    const d = t - y;
    Y[i * 2] += d * dir[0];
    Y[i * 2 + 1] += d * dir[1];
  }
}

/** The whole transport (CPU mirror): returns the motes' targets (n×2). */
export function slicedOT(X: Float32Array, T: Float32Array, slices: number = OT_LAWS.SLICES): Float32Array {
  const Y = X.slice();
  for (let k = 0; k < slices; k++) otSlice(Y, T, sliceDir(k));
  return Y;
}

/** Σ |X − Y|² / n — the transport cost (tests). */
export function transportCost(X: Float32Array, Y: Float32Array): number {
  let s = 0;
  for (let i = 0; i < X.length; i++) s += (X[i] - Y[i]) ** 2;
  return s / (X.length >> 1);
}
