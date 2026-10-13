/**
 * LIGHT GRAVITY — the loose, free-floating motes slowly drift toward where the
 * light is in the picture on screen (the still behind the field, or the end of
 * a travel morph): they gather around the sun, the glowing horizon, the
 * bright water, as if pulled toward light, and they let go when the picture
 * changes. The particles and the imagery become one world.
 *
 * Pipeline (nothing here touches the DOM or GL — unit tested in
 * light-gravity.test.ts):
 *   still → bridge-sampler's worker (fetch + decode + 64-px blurred colour
 *   field, OFF the main thread — kiosk law 2026-10-09) → lumaGrid (32 × 18)
 *   → extractAttractors (1-4 weighted centroids of the brightest regions, with
 *   soft radii) → stillToScreen (the image layer's cover crop) →
 *   retargetGravity / sampleGravity (every move glides ≥ GLIDE_SEC) → the
 *   engine's setGravity → the sim shader's "LIGHT GRAVITY" force.
 *
 * Karel's laws, enforced here (and asserted in the test):
 *  - MOTION ONLY: the output has no luminance / colour / alpha field; the
 *    shader adds a force (never sets a position or velocity), so turning it
 *    on, off or moving it can never jump a mote, brighten or flicker.
 *  - NEVER ABRUPT: an attractor's position, radius and weight glide over
 *    GLIDE_SEC (≥ 4 s, smoothstep) from wherever they are; a picture change
 *    fades the old lights out while the new ones fade in.
 *  - NO CLUMPING: the pull is a broad well with a soft repulsive core (motes
 *    orbit and drift around the light, never collapse into a dot), capped per
 *    attractor, weights normalised; only ~70 % of the free motes feel it at
 *    all (per-mote susceptibility in the shader), so density stays spread.
 *  - FREE SOULS ONLY: the engine scales it by the soul's CURRENT_FREEDOM
 *    (harmonic-currents.ts) — figures stay legible.
 *  - EMBLEMS / IMAGES UNTOUCHED: gated by (1 − image form)(1 − image show) —
 *    this also protects Ghost's angel + blossom moments.
 *  - RUNS ON EVERY JOURNEY, the mastered takes included (Karel 2026-10-13:
 *    Snowflake "first-snow" and Ghost "ghost" too). Each journey can be tuned
 *    with GRAVITY_JOURNEY_STRENGTH (default 1). Ghost has no morphs: its
 *    attractors come from its stills alone.
 *
 * Off by default (GRAVITY_DEFAULT): `?gravity=1` turns it on for the tab
 * (remembered in sessionStorage), `?gravity=0` turns it off.
 */

export const GRAVITY_DEFAULT = false;
export const GRAVITY_SESSION_KEY = "resonance-gravity";
/** Per-journey strength (0 = off for that journey, 1 = the law's strength,
 *  up to 2). Unlisted journeys = 1 — the mastered takes included. */
export const GRAVITY_JOURNEY_STRENGTH: Readonly<Record<string, number>> = {
  "first-snow": 1,
  ghost: 1,
};
export const gravityStrengthFor = (journeyId: string): number => {
  const k = GRAVITY_JOURNEY_STRENGTH[journeyId];
  return typeof k === "number" && Number.isFinite(k) ? clamp(k, 0, 2) : 1;
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export const GRAVITY_LAWS = {
  /** the light map's grid (cells) */
  GRID_W: 32,
  GRID_H: 18,
  /** at most this many lights */
  MAX_ATTRACTORS: 4,
  /** a picture whose brightest region is darker than this has no light to gather around */
  MIN_PEAK_LUMA: 0.45,
  /** …nor one evenly lit (brightest − mean below this) */
  MIN_CONTRAST: 0.15,
  /** a cell counts as "light" above mean + REL × (max − mean) (and above the floor) */
  REL_THRESHOLD: 0.55,
  LUMA_FLOOR: 0.35,
  /** a light gathers its region within this reach (image heights) */
  REACH: 0.2,
  /** soft radius of a light (image heights) */
  MIN_RADIUS: 0.05,
  MAX_RADIUS: 0.25,
  /** a light whose weight (√ of its share of the strongest's light mass) is below this is dropped */
  MIN_REL_WEIGHT: 0.3,
  /** every attractor move / fade takes this long (smoothstep) — law: ≥ 4 s */
  GLIDE_SEC: 5,
  /** an attractor this close (screen NDC) to a new light glides there instead of fading */
  MATCH_DIST: 0.6,
  /** engine: peak pull (× screen half-height per s²) at full weight and freedom */
  STRENGTH: 0.18,
  /** engine: the well's reach = max(WELL_K × radius, WELL_MIN) half-heights */
  WELL_K: 2.2,
  WELL_MIN: 0.45,
  /** engine: the soft repulsive core = CORE_K × radius (min CORE_MIN) half-heights */
  CORE_K: 0.6,
  CORE_MIN: 0.08,
  /** engine: the gain glides with this time constant (s) */
  GAIN_TAU_SEC: 2.5,
} as const;

/** A light in the still: image uv (0..1, y UP — GL's origin), radius in image
 *  heights, weight 0..1 (the strongest = the picture's contrast strength). */
export interface LightAttractor { x: number; y: number; r: number; w: number }
/** An attractor on screen: NDC (−1..1, y up), radius in screen half-heights, weight 0..1. */
export interface GravityPoint { x: number; y: number; r: number; w: number }

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Is Light Gravity on for this tab? `?gravity=1` / `?gravity=0` (kept in
 *  sessionStorage across the kiosk loop's navigations), else the default (off). */
export function gravityEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("gravity");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(GRAVITY_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(GRAVITY_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return GRAVITY_DEFAULT;
}

/**
 * The light map: Rec.709 luma 0..1 on a gw × gh grid (box-averaged), rows
 * bottom-up exactly like the input (bridge-sampler's RGBA bytes, rows
 * bottom-up). Pure arithmetic on bytes the worker already produced — no
 * read-back of any kind.
 */
export function lumaGrid(px: Uint8Array, w: number, h: number, gw: number = GRAVITY_LAWS.GRID_W, gh: number = GRAVITY_LAWS.GRID_H): Float32Array {
  const out = new Float32Array(gw * gh);
  if (w < 1 || h < 1 || px.length < w * h * 4) return out;
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.floor((gy * h) / gh), y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / gh));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor((gx * w) / gw), x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / gw));
      let a = 0, n = 0;
      for (let y = y0; y < Math.min(h, y1); y++) for (let x = x0; x < Math.min(w, x1); x++) {
        const k = (y * w + x) * 4;
        a += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2];
        n++;
      }
      out[gy * gw + gx] = n ? a / n / 255 : 0;
    }
  }
  return out;
}

/**
 * The lights of a picture: up to MAX_ATTRACTORS weighted centroids of its
 * brightest regions, strongest first. A dark or evenly lit picture → [].
 * `aspect` = the still's width / height (distances are measured in image
 * heights, so a light's region is round on screen).
 */
export function extractAttractors(grid: ArrayLike<number>, gw: number, gh: number, aspect = 16 / 9): LightAttractor[] {
  const L = GRAVITY_LAWS;
  const n = gw * gh;
  if (n < 1 || grid.length < n) return [];
  let max = 0, sum = 0;
  for (let i = 0; i < n; i++) { const v = Number.isFinite(grid[i]) ? grid[i] : 0; max = Math.max(max, v); sum += v; }
  const mean = sum / n;
  if (max < L.MIN_PEAK_LUMA || max - mean < L.MIN_CONTRAST) return [];
  const thr = Math.max(L.LUMA_FLOOR, mean + L.REL_THRESHOLD * (max - mean));
  const a = aspect > 0 ? aspect : 16 / 9;
  const claimed = new Uint8Array(n);
  const found: (LightAttractor & { mass: number })[] = [];
  const cx = (x: number) => (x + 0.5) / gw, cy = (y: number) => (y + 0.5) / gh;
  for (let k = 0; k < L.MAX_ATTRACTORS; k++) {
    let m = -1, mv = thr;
    for (let i = 0; i < n; i++) if (!claimed[i] && grid[i] >= mv) { mv = grid[i]; m = i; }
    if (m < 0) break;
    const px = cx(m % gw), py = cy(Math.floor(m / gw));
    // the region: unclaimed light cells within REACH of the peak, weighted by
    // how far above the threshold they shine
    let mass = 0, sx = 0, sy = 0;
    const cells: number[] = [];
    for (let i = 0; i < n; i++) {
      if (claimed[i]) continue;
      const x = cx(i % gw), y = cy(Math.floor(i / gw));
      const d = Math.hypot((x - px) * a, y - py);
      if (d > L.REACH) continue;
      const wgt = Math.max(0, grid[i] - thr);
      if (wgt <= 0) continue;
      cells.push(i);
      mass += wgt; sx += x * wgt; sy += y * wgt;
    }
    if (mass <= 0) { claimed[m] = 1; k--; continue; }
    const gx = sx / mass, gy = sy / mass;
    let m2 = 0;
    for (const i of cells) {
      const x = cx(i % gw), y = cy(Math.floor(i / gw));
      m2 += Math.max(0, grid[i] - thr) * (((x - gx) * a) ** 2 + (y - gy) ** 2);
    }
    const r = clamp(Math.sqrt(m2 / mass) * 1.5, L.MIN_RADIUS, L.MAX_RADIUS);
    // claim the region (and a margin) so the next light is a different one
    const claimR = Math.max(L.REACH, r * 1.6);
    for (let i = 0; i < n; i++) {
      const x = cx(i % gw), y = cy(Math.floor(i / gw));
      if (Math.hypot((x - px) * a, y - py) <= claimR) claimed[i] = 1;
    }
    found.push({ x: gx, y: gy, r, w: 0, mass });
  }
  if (!found.length) return [];
  const top = Math.max(...found.map((f) => f.mass));
  // the picture's strength: a soft-contrast light pulls less
  const strength = clamp((max - mean) / 0.4, 0.4, 1);
  return found
    .filter((f) => Math.sqrt(f.mass / top) >= L.MIN_REL_WEIGHT)
    .sort((p, q) => q.mass - p.mass)
    .map((f) => ({ x: r3(f.x), y: r3(f.y), r: r3(f.r), w: r3(strength * Math.sqrt(f.mass / top)) }));
}

/**
 * A light in the still → screen NDC, through the image layer's cover crop
 * (the still fills the screen; the overflowing axis is cropped). Radius from
 * image heights to screen half-heights.
 */
export function stillToScreen(a: LightAttractor, imgAspect: number, scrAspect: number): GravityPoint {
  const ia = imgAspect > 0 ? imgAspect : 16 / 9, sa = scrAspect > 0 ? scrAspect : 16 / 9;
  let x = (a.x - 0.5) * 2, y = (a.y - 0.5) * 2;
  // displayed image height in screen heights
  let hScr = 1;
  if (ia > sa) x *= ia / sa; // wider: the sides are cropped
  else { y *= sa / ia; hScr = sa / ia; } // taller: top + bottom cropped
  return { x: r3(clamp(x, -1.2, 1.2)), y: r3(clamp(y, -1.2, 1.2)), r: r3(a.r * hScr * 2), w: a.w };
}

/** The whole chain for one sampled still (bridge-sampler's RGBA, rows bottom-up). */
export function lightsOfStill(px: Uint8Array, w: number, h: number, imgAspect: number, scrAspect: number): GravityPoint[] {
  const L = GRAVITY_LAWS;
  return extractAttractors(lumaGrid(px, w, h, L.GRID_W, L.GRID_H), L.GRID_W, L.GRID_H, imgAspect).map((a) => stillToScreen(a, imgAspect, scrAspect));
}

// ── the glide: every attractor moves / fades over ≥ GLIDE_SEC ───────────────

interface GravitySlot { from: GravityPoint; to: GravityPoint; t0: number }
export interface GravityGlide { slots: GravitySlot[] }

const ZERO: GravityPoint = { x: 0, y: 0, r: 0.3, w: 0 };
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

export function createGravityGlide(): GravityGlide {
  return { slots: Array.from({ length: GRAVITY_LAWS.MAX_ATTRACTORS }, () => ({ from: { ...ZERO }, to: { ...ZERO }, t0: -1e9 })) };
}

function sampleSlot(s: GravitySlot, now: number): GravityPoint {
  const k = ease((now - s.t0) / GRAVITY_LAWS.GLIDE_SEC);
  const l = (p: number, q: number) => p + (q - p) * k;
  return { x: l(s.from.x, s.to.x), y: l(s.from.y, s.to.y), r: l(s.from.r, s.to.r), w: l(s.from.w, s.to.w) };
}

/** The attractors at `now` (always MAX_ATTRACTORS slots; w = 0 = off). */
export function sampleGravity(g: GravityGlide, now: number): GravityPoint[] {
  return g.slots.map((s) => sampleSlot(s, now));
}

/** Any slot still pulling (or about to)? */
export function gravityActive(g: GravityGlide, now: number): boolean {
  return g.slots.some((s) => s.to.w > 0 || sampleSlot(s, now).w > 1e-3);
}

/**
 * Retarget to a new picture's lights (or [] = let go). Pure: returns a new
 * glide. Every slot starts from exactly where it is now, so nothing steps:
 *  - a light near an existing attractor → that attractor glides to it;
 *  - an attractor with no light left → fades out where it stands;
 *  - a new light → an idle slot fades in there (else the faintest slot glides over).
 */
export function retargetGravity(g: GravityGlide, points: readonly GravityPoint[], now: number): GravityGlide {
  const L = GRAVITY_LAWS;
  const cur = sampleGravity(g, now);
  const pts = points.slice(0, L.MAX_ATTRACTORS).filter((p) => [p.x, p.y, p.r, p.w].every(Number.isFinite) && p.w > 0);
  const N = g.slots.length;
  const slotOf = new Array<number>(pts.length).fill(-1);
  const taken = new Array<boolean>(N).fill(false);
  // greedy nearest matching between live slots and the new lights
  const pairs: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < N; i++) {
    if (cur[i].w <= 1e-3 && g.slots[i].to.w <= 0) continue;
    for (let j = 0; j < pts.length; j++) {
      const d = Math.hypot(cur[i].x - pts[j].x, cur[i].y - pts[j].y);
      if (d < L.MATCH_DIST) pairs.push({ i, j, d });
    }
  }
  pairs.sort((p, q) => p.d - q.d);
  for (const p of pairs) if (!taken[p.i] && slotOf[p.j] < 0) { taken[p.i] = true; slotOf[p.j] = p.i; }
  // unmatched lights: an idle slot (placed there at zero weight), else the faintest free slot glides over
  for (let j = 0; j < pts.length; j++) {
    if (slotOf[j] >= 0) continue;
    let best = -1;
    for (let i = 0; i < N; i++) if (!taken[i] && (best < 0 || cur[i].w < cur[best].w)) best = i;
    if (best < 0) continue;
    taken[best] = true; slotOf[j] = best;
  }
  const slots: GravitySlot[] = g.slots.map((_, i) => {
    const j = slotOf.indexOf(i);
    if (j < 0) return { from: cur[i], to: { ...cur[i], w: 0 }, t0: now }; // let go where it stands
    const idle = cur[i].w <= 1e-3;
    const from = idle ? { ...pts[j], w: cur[i].w } : cur[i];
    return { from, to: { ...pts[j] }, t0: now };
  });
  return { slots };
}

/** Packed for the engine: [x, y, r, w] × MAX_ATTRACTORS. */
export function packGravity(points: readonly GravityPoint[], out = new Float32Array(GRAVITY_LAWS.MAX_ATTRACTORS * 4)): Float32Array {
  out.fill(0);
  for (let i = 0; i < Math.min(points.length, GRAVITY_LAWS.MAX_ATTRACTORS); i++) {
    const p = points[i];
    out[i * 4] = clamp(p.x, -1.5, 1.5); out[i * 4 + 1] = clamp(p.y, -1.5, 1.5);
    out[i * 4 + 2] = clamp(p.r, 0, 2); out[i * 4 + 3] = clamp(p.w, 0, 1);
  }
  return out;
}

/** One-line description for the shared logger (count + positions). */
export function describeGravity(points: readonly GravityPoint[]): string {
  if (!points.length) return "0 lights (let go)";
  return `${points.length} light${points.length > 1 ? "s" : ""}: ` + points.map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)}) r${p.r.toFixed(2)} w${p.w.toFixed(2)}`).join(" ");
}
