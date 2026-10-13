/**
 * BREATH — the whole free field slowly inhales and exhales with the music's
 * PHRASING (inno-breath, 2026-10-13). On the inhale the field gently expands
 * and loosens in depth; at the end of a phrase it exhales and settles — it
 * contracts a little, slows, comes to rest — so the form visibly LANDS on the
 * cadences. A section's last phrase (a real cadence) exhales deeper and rests
 * longer than an inner one.
 *
 * Pure + deterministic. Input = the journey's compact v2 deep-analysis profile
 * (particle-profiles.generated.ts): the sections and the tempo — the phrase
 * grid is the PHRASE CONDUCTOR's own (phraseSeconds: whole 4/4 bars, 10-22 s),
 * laid from every section start. Output = a 0.5 s timeline of
 * {amount, breath, settle}; the layer samples it per tick, the engine glides
 * it into the sim shader (shaders.ts "BREATH").
 *
 * Karel's laws, enforced here (and asserted in breath.test.ts):
 *  - SEIZURE SAFETY / NEVER ON THE BEAT: one breath per phrase (≥ MIN_BREATH_SEC
 *    long), gaussian-smoothed (σ 1.5 s) and slew-limited, so any visible change
 *    (half the range) takes ≥ MIN_CHANGE_SEC; nothing follows a beat or onset.
 *  - MOTION + SCALE, NEVER BRIGHTNESS: the state has no luminance channel; the
 *    shader adds a FORCE only (a gentle radial / depth push or pull and a touch
 *    of extra drag at rest) — never a position or velocity set, so turning it
 *    on or off can never jump a mote.
 *  - EMBLEMS / IMAGES UNTOUCHED: the shader gates it by (1 − image form)
 *    (1 − image show); the amount is 0 through the opening emblem and fades out
 *    before the closing one.
 *  - FIGURES STAY LEGIBLE: geometric figures breathe only as a slight scale
 *    (their springs hold the shape); free-flowing souls breathe fully.
 *  - MASTERED (Snowflake "first-snow", Ghost "ghost"): never — null timeline.
 *
 * Off by default (BREATH_DEFAULT): `?breath=1` turns it on for the tab
 * (remembered in sessionStorage), `?breath=0` turns it off.
 */

import { phraseSeconds } from "./phrase-conductor";
import { currentFreedom } from "./harmonic-currents";
import type { SoulId } from "./souls";

export const BREATH_DEFAULT = false;
export const BREATH_SESSION_KEY = "resonance-breath";
/** Locked, mastered journeys — never breathed. */
export const BREATH_LOCKED_JOURNEYS: ReadonlySet<string> = new Set(["first-snow", "ghost"]);

export const BREATH_LAWS = {
  /** timeline grid (s) */
  GRID_SEC: 0.5,
  /** a breath is never shorter than this (short sections join their neighbour) */
  MIN_BREATH_SEC: 8,
  /** gaussian smoothing of the raw breath (s) */
  SMOOTH_SIGMA_SEC: 1.5,
  /** the breath never moves faster than this per second (range −1..1) */
  MAX_RATE_PER_SEC: 0.3,
  /** the settle never moves faster than this per second (range 0..1) */
  SETTLE_RATE_PER_SEC: 0.2,
  /** any visible change (half the breath's range = 1.0) takes at least this long */
  MIN_CHANGE_SEC: 2,
  /** in ↔ out reversals are at least this far apart (a whole breath ≥ 2×) */
  MIN_TURN_SEC: 4,
  /** inhale over the first this-fraction of the phrase … */
  INHALE_FRAC: 0.55,
  /** … exhale until this fraction, then rest (settled) to the phrase's end */
  REST_FRAC: 0.86,
  /** inhale depth = PEAK_BASE + PEAK_INTENSITY × the section's intensity */
  PEAK_BASE: 0.5,
  PEAK_INTENSITY: 0.5,
  /** exhale floor (contraction): a cadence (section end) / an inner phrase end */
  TROUGH_CADENCE: -0.6,
  TROUGH_INNER: -0.3,
  /** settle (extra drag at rest): a cadence / an inner phrase end */
  SETTLE_CADENCE: 1,
  SETTLE_INNER: 0.55,
  /** the opening emblem owns the first 16 s: no breath until it lets go */
  OPENING_END_SEC: 16,
  /** …then the breath rises over this long */
  FADE_IN_SEC: 18,
  /** gone this long before the end (the closing emblem lands at D − 17) */
  END_CLEAR_SEC: 18,
  /** …after fading out over this long */
  FADE_OUT_SEC: 18,
  /** engine glide on top of the eased timeline (s) */
  GLIDE_SEC: 1.2,
  /** SHADER: radial expand / contract force per unit breath (× distance) */
  EXPAND_FORCE: 0.14,
  /** SHADER: depth loosens more than the picture plane (extra along the view axis) */
  DEPTH_BIAS: 0.8,
  /** SHADER: extra drag per unit settle (the field slows, comes to rest) */
  SETTLE_DRAG: 0.5,
} as const;

/** How much each soul breathes: figures a slight scale (their springs hold the
 *  shape), the free volume souls fully. */
export const breathFreedom = (id: SoulId | string): number => 0.35 + 0.65 * currentFreedom(id);

export interface BreathSection {
  start: number;
  end: number;
  trend: string;
  intensity: number;
}

export interface BreathInput {
  duration: number;
  tempo?: { bpm: number } | null;
  sections: readonly BreathSection[];
}

/** Motion state — no luminance field, by law. */
export interface BreathState {
  /** 0..1 overall strength (0 = off) */
  amount: number;
  /** −1 (exhaled: contracted) … +1 (inhaled: expanded, loosened in depth) */
  breath: number;
  /** 0..1 rest: the field slows as a phrase lands */
  settle: number;
}

export const NEUTRAL_BREATH: Readonly<BreathState> = Object.freeze({ amount: 0, breath: 0, settle: 0 });

export interface BreathPhrase {
  start: number;
  end: number;
  /** ends on a section boundary (or the end of the track) */
  cadence: boolean;
  peak: number;
}

export interface BreathTimeline {
  journeyId: string;
  duration: number;
  phraseSec: number;
  phrases: BreathPhrase[];
  /** per GRID_SEC, index i = time i × GRID_SEC */
  breath: number[];
  settle: number[];
  amount: number[];
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ss = (e0: number, e1: number, x: number) => {
  const u = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/** Zero-phase gaussian smoothing on the grid (sigma in samples). */
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

/** Slew limit both ways (forward, then backward) — never faster than `rate` per step. */
function slew(xs: number[], rate: number): number[] {
  const y = xs.slice();
  for (let i = 1; i < y.length; i++) y[i] = clamp(y[i], y[i - 1] - rate, y[i - 1] + rate);
  for (let i = y.length - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - rate, y[i + 1] + rate);
  return y;
}

/** The phrases: every section start + the conductor's tempo-aligned phrase grid
 *  inside each section; a breath shorter than MIN_BREATH_SEC joins its neighbour. */
export function breathPhrases(input: BreathInput): { phraseSec: number; phrases: BreathPhrase[] } {
  const L = BREATH_LAWS;
  const D = Math.max(0, input.duration || 0);
  const P = phraseSeconds(input.tempo?.bpm);
  const secs = [...(input.sections ?? [])].filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end)).sort((a, b) => a.start - b.start);
  const bounds: { t: number; section: boolean }[] = [];
  for (const s of secs) {
    if (s.start > 0 && s.start < D) bounds.push({ t: s.start, section: true });
    for (let t = s.start + P; t < Math.min(s.end, D) - 1e-6; t += P) bounds.push({ t, section: false });
  }
  bounds.sort((a, b) => a.t - b.t || Number(b.section) - Number(a.section));
  // keep boundaries ≥ MIN_BREATH_SEC apart (a section start wins over a grid line)
  const kept: { t: number; section: boolean }[] = [];
  for (const b of bounds) {
    const last = kept.length ? kept[kept.length - 1].t : 0;
    if (b.t - last < L.MIN_BREATH_SEC) {
      if (b.section && kept.length && !kept[kept.length - 1].section && b.t - (kept.length > 1 ? kept[kept.length - 2].t : 0) >= L.MIN_BREATH_SEC) kept[kept.length - 1] = b;
      continue;
    }
    if (D - b.t < L.MIN_BREATH_SEC) continue;
    kept.push(b);
  }
  const edges = [0, ...kept.map((b) => b.t), D];
  const intensityAt = (t: number) => {
    const v = (secs.find((s) => t >= s.start && t < s.end) ?? secs[secs.length - 1])?.intensity;
    return Number.isFinite(v) ? (v as number) : 0.5;
  };
  const phrases: BreathPhrase[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const a = edges[i], b = edges[i + 1];
    const cadence = i + 1 === edges.length - 1 || kept[i].section;
    phrases.push({ start: a, end: b, cadence, peak: r3(L.PEAK_BASE + L.PEAK_INTENSITY * clamp(intensityAt((a + b) / 2), 0, 1)) });
  }
  return { phraseSec: P, phrases };
}

/** The breath timeline for one journey. null for the locked journeys / no analysis. */
export function conductBreath(input: BreathInput, journeyId = ""): BreathTimeline | null {
  const L = BREATH_LAWS;
  const D = Math.max(0, input.duration || 0);
  if (BREATH_LOCKED_JOURNEYS.has(journeyId) || D < 60 || !input.sections?.length) return null;
  const { phraseSec, phrases } = breathPhrases(input);
  if (!phrases.length) return null;
  const G = L.GRID_SEC;
  const N = Math.floor(D / G) + 1;
  const rawB: number[] = [], rawS: number[] = [];
  let pi = 0;
  for (let i = 0; i < N; i++) {
    const t = i * G;
    while (pi < phrases.length - 1 && t >= phrases[pi].end) pi++;
    const ph = phrases[pi];
    const prev = pi > 0 ? phrases[pi - 1] : null;
    const len = Math.max(1e-6, ph.end - ph.start);
    const tIn = ph.start + L.INHALE_FRAC * len, tRest = ph.start + L.REST_FRAC * len;
    const trough = ph.cadence ? L.TROUGH_CADENCE : L.TROUGH_INNER;
    const from = prev ? (prev.cadence ? L.TROUGH_CADENCE : L.TROUGH_INNER) : L.TROUGH_INNER;
    const settleLv = ph.cadence ? L.SETTLE_CADENCE : L.SETTLE_INNER;
    const settleFrom = prev ? (prev.cadence ? L.SETTLE_CADENCE : L.SETTLE_INNER) : 0;
    let b: number, s: number;
    if (t < tIn) {
      b = from + (ph.peak - from) * ss(ph.start, tIn, t);
      s = settleFrom * (1 - ss(ph.start, ph.start + 0.3 * len, t));
    } else {
      b = ph.peak + (trough - ph.peak) * ss(tIn, tRest, t);
      s = settleLv * ss((tIn + tRest) / 2, tRest, t);
    }
    rawB.push(b); rawS.push(s);
  }
  const sig = L.SMOOTH_SIGMA_SEC / G;
  const breath = slew(gaussian(rawB, sig), L.MAX_RATE_PER_SEC * G).map(r3);
  const settle = slew(gaussian(rawS, sig), L.SETTLE_RATE_PER_SEC * G).map((x) => r3(clamp(x, 0, 1)));
  const amount = breath.map((_, i) => {
    const t = i * G;
    return r3(ss(L.OPENING_END_SEC, L.OPENING_END_SEC + L.FADE_IN_SEC, t) * (1 - ss(D - L.END_CLEAR_SEC - L.FADE_OUT_SEC, D - L.END_CLEAR_SEC, t)));
  });
  return { journeyId, duration: D, phraseSec, phrases, breath, settle, amount };
}

/** The state at time t (linear between grid points; neutral outside / for null). */
export function breathAt(tl: BreathTimeline | null, t: number): BreathState {
  if (!tl || !tl.breath.length || !Number.isFinite(t)) return { ...NEUTRAL_BREATH };
  const x = clamp(t / BREATH_LAWS.GRID_SEC, 0, tl.breath.length - 1);
  const i = Math.floor(x), j = Math.min(tl.breath.length - 1, i + 1), f = x - i;
  const lerp = (a: number[]) => a[i] + (a[j] - a[i]) * f;
  return { amount: r3(lerp(tl.amount)), breath: r3(lerp(tl.breath)), settle: r3(lerp(tl.settle)) };
}

/** One line for the glitch-event log. */
export function breathSummary(tl: BreathTimeline): string {
  const cad = tl.phrases.filter((p) => p.cadence && p.end < tl.duration).map((p) => fmt(p.end));
  return `on: ${tl.phrases.length} breaths, phrase ${tl.phraseSec}s${cad.length ? ` · cadences ${cad.join(" ")}` : ""}`;
}

/** Is Breath on for this tab? `?breath=1` / `?breath=0` (kept in sessionStorage
 *  across the kiosk loop's navigations), else the default (off). */
export function breathEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("breath");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(BREATH_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(BREATH_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return BREATH_DEFAULT;
}
