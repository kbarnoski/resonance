/**
 * HARMONIC CURRENTS — the field's free-flowing motion becomes a VOLUMETRIC
 * CURRENT whose character follows the harmony and structure of the track
 * (inno-currents, 2026-10-13; Karel: "insane epic innovation", design intent
 * first).
 *
 *  - TENSION (dense sections, minor / diminished / suspended harmony, a key
 *    change, the climb to a crest or the climax) → the current GATHERS into
 *    slow, deep, counter-turning vortices whose axis is the camera's up — seen
 *    side-on, never as a circle on screen — and the motes sort into layered
 *    depth strata (far / mid / near);
 *  - RELEASE (breaths, resolution after the climax, outros) → it OPENS into
 *    wide laminar drifts: sheets sliding past each other, a long swell rolling
 *    through, like wind over water.
 *  - PARALLAX VOLUME, always: a mote's current speed grows with its nearness to
 *    the camera, so near and far motes slide past each other at different
 *    speeds — real depth, the cinematic part.
 *
 * Pure + deterministic. Input = the journey's compact v2 deep-analysis profile
 * (particle-profiles.generated.ts — the same data the phrase conductor reads,
 * including each section's localKey and chord-quality shares). Output = a 1 s
 * timeline of {amount, tension, layering}; the layer samples it per tick, adds
 * a very slow TIDE from the calm-frame levels, and the engine glides it into
 * the sim shader (shaders.ts "HARMONIC CURRENTS").
 *
 * Karel's laws, enforced here (and asserted in harmonic-currents.test.ts):
 *  - NEVER PER-BEAT: the tension curve is gaussian-smoothed (σ 5 s) and then
 *    slew-limited to ≤ MAX_RATE_PER_SEC both ways, so the slowest character
 *    change a viewer can see takes ≥ MIN_SWING_SEC (a full swing ≥ ~14 s).
 *    The tide is a 20 s / 90 s EMA difference — slower still.
 *  - MOTION, NOT BRIGHTNESS: the state has no luminance channel; the shader
 *    adds a force only (no position or velocity is ever set), so turning it
 *    on, off or changing character can never jump a mote.
 *  - ABSTRACT, NO RINGS: vortices turn about the camera's UP axis (slightly
 *    tilted in depth), drawn as converging spirals with curl turbulence; their
 *    centres wander on the currents' own STEADY clock, never the music's.
 *  - EMBLEMS / IMAGES UNTOUCHED: the shader gates the current by (1 − image
 *    form)(1 − image show); the amount is 0 through the opening emblem and
 *    fades out before the closing one.
 *  - FIGURES STAY LEGIBLE: only free-flowing souls feel it fully
 *    (CURRENT_FREEDOM); geometric figures feel nothing.
 *  - MASTERED (Snowflake "first-snow", Ghost "ghost"): never — null timeline.
 *
 * Off by default (CURRENTS_DEFAULT): `?currents=1` turns it on for the tab
 * (remembered in sessionStorage), `?currents=0` turns it off.
 */

import type { SoulId } from "./souls";

export const CURRENTS_DEFAULT = true; // Karel kept it (2026-10-13)
export const CURRENTS_SESSION_KEY = "resonance-currents";
/** Locked, mastered journeys — never carried by a current. */
export const CURRENTS_LOCKED_JOURNEYS: ReadonlySet<string> = new Set(["first-snow", "ghost"]);

export const CURRENTS_LAWS = {
  /** timeline grid (s) */
  GRID_SEC: 1,
  /** gaussian smoothing of the raw tension (s) */
  SMOOTH_SIGMA_SEC: 5,
  /** the tension never moves faster than this per second (full swing ≥ 1/rate s) */
  MAX_RATE_PER_SEC: 0.07,
  /** a visible character change (≥ 0.5 of the range) takes at least this long */
  MIN_SWING_SEC: 8,
  /** the opening emblem owns the first 16 s: no current until it lets go */
  OPENING_END_SEC: 16,
  /** …then the current rises over this long */
  FADE_IN_SEC: 18,
  /** gone this long before the end (the closing emblem lands at D − 17) */
  END_CLEAR_SEC: 18,
  /** …after fading out over this long */
  FADE_OUT_SEC: 18,
  /** outros open: tension released over the last this-many seconds */
  OUTRO_SEC: 45,
  /** calm-frame tide: fast / slow EMA time constants (s) */
  TIDE_FAST_SEC: 20,
  TIDE_SLOW_SEC: 90,
  /** tide's reach: ± tension, ± fraction of amount */
  TIDE_TENSION: 0.1,
  TIDE_AMOUNT: 0.12,
} as const;

/** How much each soul's motion is carried by the current (0 = a figure, left
 *  alone; 1 = free-flowing volume). Unlisted souls = 0. */
export const CURRENT_FREEDOM: Readonly<Partial<Record<SoulId, number>>> = {
  // the volume souls — motes, dust, smoke, ink, embers: fully carried
  smoke: 1, motes: 1, petals: 1, embers: 1, duststorm: 1, pollen: 1, fireflies: 1,
  ink: 1, nebula: 1, fountain: 0.8, wisp: 1, petalfall: 0.8,
  // organic flows — leaning with it, keeping their own shape
  murmuration: 0.45, aurora: 0.45, waves: 0.4, smokering: 0.35, attractor: 0.35, ribbons: 0.3, tendrils: 0.3,
  // cosmic / hearth figures — a breath of it
  vortex: 0.2, starburst: 0.2, flame: 0.2,
};
export const currentFreedom = (id: SoulId | string): number => (CURRENT_FREEDOM as Record<string, number | undefined>)[id] ?? 0;

export interface CurrentSection {
  start: number;
  end: number;
  trend: string;
  intensity: number;
  onsetRate?: number;
  localKey?: string | null;
  major?: number;
  minor?: number;
  suspended?: number;
  diminished?: number;
}

export interface CurrentInput {
  duration: number;
  sections: readonly CurrentSection[];
  /** [time s, intensity 0..1] on the analysis grid (5 s) */
  curve: readonly (readonly [number, number])[];
  climaxTime?: number | null;
}

/** Motion state — no luminance field, by law. */
export interface CurrentState {
  /** 0..1 overall current strength (0 = off) */
  amount: number;
  /** 0 = release (laminar drift) … 1 = tension (gathering vortices) */
  tension: number;
  /** 0..1 depth stratification (far / mid / near layers) */
  layering: number;
}

export const NEUTRAL_CURRENT: Readonly<CurrentState> = Object.freeze({ amount: 0, tension: 0, layering: 0 });

export interface CurrentMark { t: number; kind: "gather" | "open"; strength: number; label: string }

export interface CurrentTimeline {
  journeyId: string;
  duration: number;
  /** per GRID_SEC, index i = time i s */
  tension: number[];
  amount: number[];
  /** the strongest gatherings (tension peaks) and openings (the release after them) */
  marks: CurrentMark[];
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ss = (e0: number, e1: number, x: number) => {
  const u = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Harmonic colour of a section: minor / diminished / suspended pull, major settles. */
function harmonicRaw(s: CurrentSection): number {
  return (s.minor ?? 0) * 0.9 + (s.diminished ?? 0) * 1.4 + (s.suspended ?? 0) * 0.6 - (s.major ?? 0) * 0.4;
}

function curveAt(curve: CurrentInput["curve"], t: number): number {
  if (!curve.length) return 0.5;
  if (t <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    if (t <= curve[i][0]) {
      const [t0, v0] = curve[i - 1], [t1, v1] = curve[i];
      return v0 + ((v1 - v0) * (t - t0)) / Math.max(1e-6, t1 - t0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Local extrema of the dynamics curve (dominant over ±15 s, prominence ≥ 0.05). */
function curveExtrema(curve: CurrentInput["curve"], kind: "max" | "min"): { t: number; prom: number }[] {
  const sign = kind === "max" ? 1 : -1;
  const out: { t: number; prom: number }[] = [];
  for (let i = 1; i < curve.length - 1; i++) {
    const x = sign * curve[i][1];
    let dominant = true, left = 0, right = 0;
    for (let j = 0; j < curve.length; j++) {
      const dt = curve[j][0] - curve[i][0];
      if (j === i || Math.abs(dt) > 25) continue;
      const y = sign * curve[j][1];
      if (Math.abs(dt) <= 15 && (y > x || (y === x && j < i))) { dominant = false; break; }
      if (dt < 0) left = Math.max(left, x - y); else right = Math.max(right, x - y);
    }
    const prom = Math.min(left, right);
    if (dominant && prom >= 0.05) out.push({ t: curve[i][0], prom });
  }
  return out;
}

/** Zero-phase gaussian smoothing on a 1 s grid. */
function gaussian(xs: number[], sigma: number): number[] {
  const R = Math.ceil(sigma * 3);
  const w: number[] = [];
  for (let k = -R; k <= R; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  return xs.map((_, i) => {
    let a = 0, n = 0;
    for (let k = -R; k <= R; k++) {
      const j = i + k;
      if (j < 0 || j >= xs.length) continue;
      a += xs[j] * w[k + R]; n += w[k + R];
    }
    return n ? a / n : xs[i];
  });
}

/** Slew limit both ways (forward, then backward) — symmetric, never faster than `rate` per step. */
function slew(xs: number[], rate: number): number[] {
  const y = xs.slice();
  for (let i = 1; i < y.length; i++) y[i] = clamp(y[i], y[i - 1] - rate, y[i - 1] + rate);
  for (let i = y.length - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - rate, y[i + 1] + rate);
  return y;
}

/** The currents timeline for one journey. null for the locked journeys / no analysis. */
export function conductCurrents(input: CurrentInput, journeyId = "", allowLocked = false): CurrentTimeline | null {
  const L = CURRENTS_LAWS;
  const D = Math.max(0, input.duration || 0);
  if ((!allowLocked && CURRENTS_LOCKED_JOURNEYS.has(journeyId)) || D < 60 || !input.sections?.length) return null;
  const secs = [...input.sections].sort((a, b) => a.start - b.start);
  const curve = (input.curve ?? []).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));

  // per-track normalisations (a track is tense or open relative to itself,
  // with a little of the absolute reading so a uniformly dark piece stays darker)
  const hr = secs.map(harmonicRaw);
  const hMin = Math.min(...hr), hMax = Math.max(...hr);
  const harm = hr.map((h) => (hMax - hMin > 0.05 ? 0.65 * ((h - hMin) / (hMax - hMin)) : 0.325) + 0.35 * clamp(0.3 + h * 1.5, 0, 1));
  const cv = curve.map((p) => p[1]);
  const cMin = cv.length ? Math.min(...cv) : 0, cMax = cv.length ? Math.max(...cv) : 1;
  const dens = (t: number) => (cMax - cMin > 0.05 ? (curveAt(curve, t) - cMin) / (cMax - cMin) : 0.5);
  const on = secs.map((s) => s.onsetRate ?? 0);
  const oMin = Math.min(...on), oMax = Math.max(...on);
  const onN = on.map((o) => (oMax - oMin > 0.3 ? (o - oMin) / (oMax - oMin) : 0.5));

  // key changes: a modulation lifts the tension from just before the new key
  // until well after it has settled
  const mods: number[] = [];
  for (let i = 1; i < secs.length; i++) {
    const a = secs[i - 1].localKey, b = secs[i].localKey;
    if (a && b && a !== b) mods.push(secs[i].start);
  }
  const crests = curveExtrema(curve, "max");
  const breaths = curveExtrema(curve, "min");
  const climax = input.climaxTime != null && Number.isFinite(input.climaxTime) && input.climaxTime > 0 && input.climaxTime < D ? input.climaxTime : null;

  const N = Math.floor(D / L.GRID_SEC) + 1;
  const raw: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i * L.GRID_SEC;
    let si = secs.findIndex((s) => t >= s.start && t < s.end);
    if (si < 0) si = t < secs[0].start ? 0 : secs.length - 1;
    const s = secs[si];
    const u = clamp((t - s.start) / Math.max(1, s.end - s.start), 0, 1);
    let x = 0.34 * harm[si] + 0.4 * dens(t) + 0.12 * onN[si];
    // a building section leans in as it goes; a receding one lets go
    if (s.trend === "building") x += -0.04 + 0.16 * u;
    else if (s.trend === "receding") x += 0.04 - 0.16 * u;
    for (const m of mods) x += 0.3 * ss(m - 6, m + 4, t) * (1 - ss(m + 10, m + 34, t));
    for (const c of crests) x += clamp(c.prom / 0.2, 0.3, 1) * 0.15 * ss(c.t - 14, c.t, t) * (1 - ss(c.t + 2, c.t + 16, t));
    for (const b of breaths) x -= clamp(b.prom / 0.2, 0.3, 1) * 0.22 * ss(b.t - 8, b.t, t) * (1 - ss(b.t + 3, b.t + 15, t));
    if (climax !== null) {
      // the climb into the climax gathers; the resolution after it opens wide
      x += 0.28 * ss(climax - 32, climax, t) * (1 - ss(climax + 2, climax + 14, t));
      x -= 0.2 * ss(climax + 6, climax + 22, t) * (1 - ss(climax + 40, climax + 70, t));
    }
    raw.push(x);
  }
  // stretch to the track's own range (10th → 90th percentile), half-weighted
  const sorted = [...raw].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.1)], p90 = sorted[Math.floor(sorted.length * 0.9)];
  const stretched = raw.map((x) => (p90 - p10 > 0.05 ? 0.5 * clamp(0.1 + (0.8 * (x - p10)) / (p90 - p10), 0, 1) + 0.5 * clamp(x, 0, 1) : clamp(x, 0, 1)));
  // the opening drifts open; the outro opens into the widest laminar drift
  const shaped = stretched.map((x, i) => {
    const t = i * L.GRID_SEC;
    const open = 1 - 0.6 * (1 - ss(L.OPENING_END_SEC, L.OPENING_END_SEC + 30, t));
    const outro = 1 - 0.8 * ss(D - L.OUTRO_SEC, D - L.END_CLEAR_SEC, t);
    return clamp(x * open * outro, 0, 1);
  });
  const tension = slew(gaussian(shaped, L.SMOOTH_SIGMA_SEC), L.MAX_RATE_PER_SEC * L.GRID_SEC).map(r3);
  const amount = tension.map((_, i) => {
    const t = i * L.GRID_SEC;
    return r3(ss(L.OPENING_END_SEC, L.OPENING_END_SEC + L.FADE_IN_SEC, t) * (1 - ss(D - L.END_CLEAR_SEC - L.FADE_OUT_SEC, D - L.END_CLEAR_SEC, t)));
  });

  // marks: tension peaks (≥ 0.55, dominant over ±30 s) and the opening after each
  const marks: CurrentMark[] = [];
  for (let i = 1; i < N - 1; i++) {
    const v = tension[i];
    if (v < 0.55 || amount[i] < 0.5) continue;
    let dom = true;
    for (let j = Math.max(0, i - 30); j <= Math.min(N - 1, i + 30) && dom; j++) if (tension[j] > v || (tension[j] === v && j < i)) dom = false;
    if (!dom) continue;
    marks.push({ t: i * L.GRID_SEC, kind: "gather", strength: v, label: `gathering at ${fmt(i * L.GRID_SEC)}` });
    let lo = i;
    for (let j = i; j <= Math.min(N - 1, i + 60); j++) if (tension[j] < tension[lo]) lo = j;
    if (v - tension[lo] >= 0.25 && amount[lo] > 0.3 && !marks.some((m) => m.kind === "open" && Math.abs(m.t - lo * L.GRID_SEC) < 10)) marks.push({ t: lo * L.GRID_SEC, kind: "open", strength: r3(v - tension[lo]), label: `opening at ${fmt(lo * L.GRID_SEC)} (−${Math.round((v - tension[lo]) * 100)} %)` });
  }
  marks.sort((a, b) => a.t - b.t);
  return { journeyId, duration: D, tension, amount, marks };
}

/** The state at time t (linear between grid points; neutral outside / for null). */
export function currentAt(tl: CurrentTimeline | null, t: number): CurrentState {
  if (!tl || !tl.tension.length || !Number.isFinite(t)) return { ...NEUTRAL_CURRENT };
  const x = clamp(t / CURRENTS_LAWS.GRID_SEC, 0, tl.tension.length - 1);
  const i = Math.floor(x), j = Math.min(tl.tension.length - 1, i + 1), f = x - i;
  const tension = tl.tension[i] + (tl.tension[j] - tl.tension[i]) * f;
  const amount = tl.amount[i] + (tl.amount[j] - tl.amount[i]) * f;
  return { amount: r3(amount), tension: r3(tension), layering: r3(0.3 + 0.7 * tension) };
}

/** The clearest tension → release on a timeline: the biggest drop within 60 s
 *  of a gathering (what to film). */
export function clearestRelease(tl: CurrentTimeline | null): { from: number; to: number; drop: number } | null {
  if (!tl) return null;
  let best: { from: number; to: number; drop: number } | null = null;
  const T = tl.tension, G = CURRENTS_LAWS.GRID_SEC;
  for (let i = 0; i < T.length; i++) {
    if (tl.amount[i] < 0.6) continue;
    for (let j = i + 1; j < Math.min(T.length, i + 60 / G); j++) {
      if (tl.amount[j] < 0.6) break;
      const d = T[i] - T[j];
      if (!best || d > best.drop) best = { from: i * G, to: j * G, drop: r3(d) };
    }
  }
  return best;
}

/**
 * THE TIDE — a very slow breath from the calm-frame levels (already smoothed
 * ~6 s per bin): the difference of a 20 s and a 90 s average of the overall
 * level. A long swell in the playing leans the current a touch tenser and
 * stronger; a long hush opens it. Never faster than the 20 s average moves.
 */
export interface Tide { fast: number; slow: number; primed: boolean }
export const createTide = (): Tide => ({ fast: 0, slow: 0, primed: false });
export function tideStep(tide: Tide, level: number, dt: number): number {
  const L = CURRENTS_LAWS;
  const lv = Number.isFinite(level) ? clamp(level, 0, 1) : tide.fast;
  const h = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.5);
  if (!tide.primed) { tide.fast = tide.slow = lv; tide.primed = true; }
  tide.fast += (lv - tide.fast) * (1 - Math.exp(-h / L.TIDE_FAST_SEC));
  tide.slow += (lv - tide.slow) * (1 - Math.exp(-h / L.TIDE_SLOW_SEC));
  return clamp((tide.fast - tide.slow) * 4, -1, 1);
}
/** The timeline's state, leaned by the tide (−1..1). */
export function withTide(s: CurrentState, tide: number): CurrentState {
  const L = CURRENTS_LAWS;
  const k = clamp(tide, -1, 1);
  const tension = clamp(s.tension + L.TIDE_TENSION * k, 0, 1);
  return { amount: r3(clamp(s.amount * (1 + L.TIDE_AMOUNT * k), 0, 1)), tension: r3(tension), layering: r3(0.3 + 0.7 * tension) };
}

/** Is Harmonic Currents on for this tab? `?currents=1` / `?currents=0` (kept in
 *  sessionStorage across the kiosk loop's navigations), else the default (off). */
export function currentsEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("currents");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(CURRENTS_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(CURRENTS_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return CURRENTS_DEFAULT;
}
