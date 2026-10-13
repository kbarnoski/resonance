// ─────────────────────────────────────────────────────────────────────────────
// stable-motes.ts — SHIMMER-FREE PARTICLES (flags ?stable=1 · ?glow=1).
//
// Why (Karel 2026-10-13: "dont have it flicker in brightness like that cause it
// is seizure"): a mote is a point sprite whose light is a gaussian evaluated
// at PIXEL CENTRES. A small mote (≤ ~3 px — most of the field) is badly
// under-sampled: as it drifts a fraction of a pixel, the pixels it lands on
// see its core or miss it, so its total light jumps frame to frame. A 1 px
// mote is the worst case — one fragment whose value runs 1.3 → 0.05 → discard
// (a corner offset) as it crosses its pixel. Thousands of these in a dense
// form = a shimmering sheet; the cinematic bloom then read that through a
// thresholded mip chain and amplified it into a flickering glow.
//
// The fix, in three layers (each mirrored here in pure TS and measured by
// stable-motes.test.ts — the GLSL in shaders.ts is generated from the same
// constants):
//   1. ANALYTIC COVERAGE (?stable=1) — the mote's two gaussians are convolved
//      with a pixel prefilter (σ² adds, amplitude rescales: exact energy), so
//      no term is ever narrower than PREFILTER_SIGMA_PX. A gaussian that wide
//      sums to the same total on any sub-pixel offset (error ~4·e^(−2π²σ²)).
//      Each term is shifted to reach exactly 0 at the sprite rim (no hard
//      edge — a rim pixel fades in/out instead of popping) and renormalised in
//      closed form so the mote's integrated light is the legacy nominal
//      1.15·K·(size/2)² — the flag changes stability, never brightness.
//   2. TEMPORAL RESOLVE (?stable=1) — the HDR particle layer is blended with
//      its own history (keep ≈ 0.7 per 60 Hz frame, time-based) after the
//      history is clamped into the (slightly widened) 3×3 min/max of the
//      current frame (no
//      ghosts: where a mote has left, the history is clamped to what is
//      there now). Linear in steady state → energy-conserving.
//   3. STABLE GLOW (?glow=1, off by default; cine journeys only) — the bloom
//      reads the RESOLVED (stable) layer's mip chain, is computed once at
//      quarter resolution and low-passed in time (τ = BLOOM_TAU_SEC) BEFORE
//      the soft knee, so the nonlinearity only ever sees a settled signal.
// ─────────────────────────────────────────────────────────────────────────────

export const STABLE_LAWS = {
  /** Pixel prefilter σ (px). 0.65 → minimum footprint FWHM ≈ 1.5 px; grid
   *  sampling error of the gaussian ≈ 0.1 %. */
  PREFILTER_SIGMA_PX: 0.65,
  /** Sprite rim ≥ this many σ of the (prefiltered) CORE; large motes keep
   *  the legacy rim (no extra fill, same footprint). */
  RIM_SIGMAS: 3.0,
  /** Hard cap on the stable sprite diameter (device px). */
  MAX_SPRITE_PX: 40,
  /** History weight per 1/60 s (time-based: keep = KEEP_60^(dt·60)). */
  TAA_KEEP_60: 0.7,
  /** The 3×3 clamp box is widened by this fraction (×(1±s)): a strict box
   *  clamps a tiny mote's own peak pixel every frame it moves (−1.4 % light,
   *  1.7 % frame jitter in the simulation); 0.25 keeps the resolve linear for
   *  sub-pixel motion and still kills light that has left the neighbourhood. */
  TAA_CLAMP_SLACK: 0.25,
  /** Bloom temporal low-pass time constant (s). */
  BLOOM_TAU_SEC: 0.12,
  /** Bloom strength when glow is on (the pre-2026-10-13 cine value). */
  BLOOM_GAIN: 0.55,
} as const;

/** Legacy sprite constants: g(r²) = exp(−7r²) + 0.3·exp(−1.8r²), r = q/R. */
const C1 = 7, C2 = 1.8, W2 = 0.3, OUT_GAIN = 1.15;
/** ∫ legacy g over the unit disc (= nominal energy / R²). */
export const LEGACY_K = (Math.PI / C1) * (1 - Math.exp(-C1)) + W2 * (Math.PI / C2) * (1 - Math.exp(-C2));
const E1 = (Math.PI / C1) * (1 - Math.exp(-C1));
const E2 = W2 * (Math.PI / C2) * (1 - Math.exp(-C2));

/** The light a mote of this nominal diameter carries (both renderers aim at it). */
export function nominalEnergy(size: number): number {
  const rn = 0.5 * Math.min(size, 24);
  return OUT_GAIN * LEGACY_K * rn * rn;
}

// ─── legacy (show build) mote ───────────────────────────────────────────────

/** Legacy fragment: the point sprite diameter after the size<1 rule, and the
 *  value at a pixel offset (qx, qy) from the mote centre (px). */
export function legacySprite(size: number): { ps: number; gain: number } {
  let s = size, gain = 1;
  if (s < 1) { gain = s * s; s = 1; }
  return { ps: Math.min(s, 24), gain };
}
export function legacyFragment(qx: number, qy: number, size: number): number {
  const { ps, gain } = legacySprite(size);
  const dx = (qx * 2) / ps, dy = (qy * 2) / ps;
  const r2 = dx * dx + dy * dy;
  if (r2 > 1) return 0;
  return OUT_GAIN * gain * (Math.exp(-r2 * C1) + W2 * Math.exp(-r2 * C2));
}

// ─── stable mote (analytic coverage) ────────────────────────────────────────

export interface StableMote {
  /** amplitudes of the two shifted gaussians (× vCol × 1.15 in the shader) */
  a1: number; a2: number;
  /** 1/(2σ²) of each term (px⁻²) */
  k1: number; k2: number;
  /** each term's value at the rim (subtracted: the term reaches 0 there) */
  o1: number; o2: number;
  /** sprite rim radius² (px²) and point-sprite diameter (px) */
  rs2: number; ps: number;
}

/** ∫ over a disc of radius rs of (exp(−q²/2σ²) − exp(−rs²/2σ²)). */
function shiftedGaussIntegral(sigma: number, rs: number): number {
  const c = (rs * rs) / (2 * sigma * sigma);
  const e = Math.exp(-c);
  return 2 * Math.PI * sigma * sigma * (1 - e) - Math.PI * rs * rs * e;
}

export function stableMote(size: number, L: { PREFILTER_SIGMA_PX: number; RIM_SIGMAS: number; MAX_SPRITE_PX: number } = STABLE_LAWS): StableMote {
  const rn = 0.5 * Math.min(size, 24);
  const sp2 = L.PREFILTER_SIGMA_PX * L.PREFILTER_SIGMA_PX;
  const s1 = Math.sqrt(rn * rn / (2 * C1) + sp2);
  const s2 = Math.sqrt(rn * rn / (2 * C2) + sp2);
  const rs = Math.min(0.5 * L.MAX_SPRITE_PX, Math.max(rn, L.RIM_SIGMAS * s1));
  const k1 = 1 / (2 * s1 * s1), k2 = 1 / (2 * s2 * s2);
  const o1 = Math.exp(-rs * rs * k1), o2 = Math.exp(-rs * rs * k2);
  const a1 = (E1 * rn * rn) / shiftedGaussIntegral(s1, rs);
  const a2 = (E2 * rn * rn) / shiftedGaussIntegral(s2, rs);
  return { a1, a2, k1, k2, o1, o2, rs2: rs * rs, ps: 2 * rs };
}

export function stableFragment(qx: number, qy: number, m: StableMote): number {
  const q2 = qx * qx + qy * qy;
  if (q2 >= m.rs2) return 0;
  return OUT_GAIN * (m.a1 * (Math.exp(-q2 * m.k1) - m.o1) + m.a2 * (Math.exp(-q2 * m.k2) - m.o2));
}

/** GLSL constants (one source of truth: the laws + the legacy integrals). */
export function stableGlslConsts(): string {
  const f = (x: number) => x.toFixed(6);
  return [
    `const float ST_SP2 = ${f(STABLE_LAWS.PREFILTER_SIGMA_PX * STABLE_LAWS.PREFILTER_SIGMA_PX)};`,
    `const float ST_RIM = ${f(STABLE_LAWS.RIM_SIGMAS)};`,
    `const float ST_MAXR = ${f(0.5 * STABLE_LAWS.MAX_SPRITE_PX)};`,
    `const float ST_E1 = ${f(E1)}; const float ST_E2 = ${f(E2)};`,
    `const float ST_C1 = ${f(C1)}; const float ST_C2 = ${f(C2)};`,
  ].join("\n");
}

// ─── raster simulation (point-sprite coverage rule) ─────────────────────────

/** Rasterise one mote centred at (cx, cy) (px, window space) on a W×H grid.
 *  A point sprite of diameter ps covers the pixels whose CENTRES fall in the
 *  ps×ps square around the mote (GLES 3.0 §3.4). Returns per-pixel light. */
export function rasterMote(kind: "legacy" | "stable", cx: number, cy: number, size: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H);
  const m = kind === "stable" ? stableMote(size) : null;
  const ps = m ? m.ps : legacySprite(size).ps;
  const half = ps / 2;
  for (let y = Math.max(0, Math.floor(cy - half - 1)); y < Math.min(H, Math.ceil(cy + half + 1)); y++) {
    const py = y + 0.5;
    if (py < cy - half || py >= cy + half) continue;
    for (let x = Math.max(0, Math.floor(cx - half - 1)); x < Math.min(W, Math.ceil(cx + half + 1)); x++) {
      const px = x + 0.5;
      if (px < cx - half || px >= cx + half) continue;
      out[y * W + x] = m ? stableFragment(px - cx, py - cy, m) : legacyFragment(px - cx, py - cy, size);
    }
  }
  return out;
}

// ─── temporal resolve (mirror of TAA_FS) ────────────────────────────────────

/** History weight for a frame of dt seconds. */
export function taaKeep(dt: number): number {
  return Math.pow(STABLE_LAWS.TAA_KEEP_60, Math.max(0, dt) * 60);
}

/** One resolve: history clamped into the current 3×3 min/max (widened by
 *  TAA_CLAMP_SLACK), then blended. */
export function taaResolve(cur: Float32Array, hist: Float32Array | null, W: number, H: number, keep: number): Float32Array {
  if (!hist) return cur.slice();
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let mn = Infinity, mx = -Infinity;
      for (let j = -1; j <= 1; j++) {
        const yy = Math.min(H - 1, Math.max(0, y + j));
        for (let i = -1; i <= 1; i++) {
          const v = cur[yy * W + Math.min(W - 1, Math.max(0, x + i))];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      const c = cur[y * W + x];
      const h = Math.min(mx * (1 + STABLE_LAWS.TAA_CLAMP_SLACK), Math.max(mn * (1 - STABLE_LAWS.TAA_CLAMP_SLACK), hist[y * W + x]));
      out[y * W + x] = c + (h - c) * keep;
    }
  }
  return out;
}

/** Bloom low-pass weight for a frame of dt seconds. */
export function bloomKeep(dt: number): number {
  return Math.exp(-Math.max(0, dt) / STABLE_LAWS.BLOOM_TAU_SEC);
}

// ─── the shimmer meter ──────────────────────────────────────────────────────

export interface ShimmerReport {
  /** mean over pixels of Var_t(L_t − L_{t−1}) — the spec's per-pixel meter */
  pixelDeltaVar: number;
  /** mean over pixels of (L_{t+1} − 2L_t + L_{t−1})² — popping vs smooth motion */
  pixelAccel: number;
  /** coefficient of variation of the frame's total light (the pulse you see) */
  energyCv: number;
  /** worst |frame total − nominal| / nominal */
  energyMaxErr: number;
  meanEnergy: number;
}

export function shimmer(frames: Float32Array[], nominal: number): ShimmerReport {
  const n = frames.length, N = frames[0].length;
  let dv = 0, acc = 0;
  for (let p = 0; p < N; p++) {
    let s = 0, s2 = 0;
    for (let t = 1; t < n; t++) { const d = frames[t][p] - frames[t - 1][p]; s += d; s2 += d * d; }
    const m = s / (n - 1);
    dv += s2 / (n - 1) - m * m;
    for (let t = 1; t < n - 1; t++) { const a = frames[t + 1][p] - 2 * frames[t][p] + frames[t - 1][p]; acc += a * a; }
  }
  const tot = frames.map((f) => f.reduce((a, b) => a + b, 0));
  const me = tot.reduce((a, b) => a + b, 0) / n;
  const ve = tot.reduce((a, b) => a + (b - me) * (b - me), 0) / n;
  return {
    pixelDeltaVar: dv / N,
    pixelAccel: acc / (N * Math.max(1, n - 2)),
    energyCv: Math.sqrt(ve) / Math.max(me, 1e-12),
    energyMaxErr: Math.max(...tot.map((e) => Math.abs(e - nominal) / nominal)),
    meanEnergy: me,
  };
}

/** Simulate one mote drifting sub-pixel across a grid for `n` frames. */
export function driftFrames(kind: "legacy" | "stable", size: number, opts: { n?: number; vx?: number; vy?: number; W?: number; H?: number; taa?: boolean; dt?: number } = {}): Float32Array[] {
  const n = opts.n ?? 120, W = opts.W ?? 24, H = opts.H ?? 24;
  const vx = opts.vx ?? 0.071, vy = opts.vy ?? 0.043; // px / frame: slow, irrational-ish drift
  const keep = taaKeep(opts.dt ?? 1 / 60);
  const out: Float32Array[] = [];
  let hist: Float32Array | null = null;
  for (let t = 0; t < n; t++) {
    const cur = rasterMote(kind, W / 2 - 0.5 * n * vx + t * vx, H / 2 - 0.5 * n * vy + t * vy, size, W, H);
    const shown: Float32Array = opts.taa ? taaResolve(cur, hist, W, H, keep) : cur;
    hist = shown;
    out.push(shown);
  }
  return out;
}

// ─── the flags ──────────────────────────────────────────────────────────────

export const STABLE_SESSION_KEY = "resonance:particles:stable";
export const GLOW_SESSION_KEY = "resonance:particles:glow";
type Store = Pick<Storage, "getItem" | "setItem">;

function sessionFlag(param: string, key: string, search?: string, store?: Store | null, def = false): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get(param);
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(key, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(key);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return def;
}

/** Shimmer-free motes + temporal resolve: `?stable=1` / `?stable=0`, kept in
 *  sessionStorage across the kiosk loop's navigations. Default ON — a safety
 *  fix (Karel 2026-10-13: "i see the flickering throughout when white
 *  particles … fix as needed"; flicker meter: Ghost 45 % → 0 %). */
export const STABLE_DEFAULT = true;
export function stableEnabled(search?: string, store?: Store | null): boolean {
  return sessionFlag("stable", STABLE_SESSION_KEY, search, store, STABLE_DEFAULT);
}
/** The temporal resolve half of ?stable (perf A/B on the kiosk's Retina
 *  screen): `?taa=0` keeps the shimmer-free sprites but skips the history
 *  pass. Default on (with ?stable). */
export const TAA_SESSION_KEY = "resonance-taa";
export function taaEnabled(search?: string, store?: Store | null): boolean {
  return sessionFlag("taa", TAA_SESSION_KEY, search, store, true);
}
/** Temporally stable bloom: `?glow=1` / `?glow=0`, sessionStorage-kept; default off. */
export function glowEnabled(search?: string, store?: Store | null): boolean {
  return sessionFlag("glow", GLOW_SESSION_KEY, search, store);
}
export function particleSessionStore(): Store | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}
