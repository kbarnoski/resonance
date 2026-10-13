/**
 * RESONANCE TRAILS — when the sound is held (a long note, the sustain pedal,
 * a chord left to ring) the moving motes draw a faint tail of light behind
 * them, like a long exposure of slow motion; the tails shorten as the sound
 * dies away, and short staccato passages draw none. The field visibly RINGS.
 *
 * Pure + deterministic (resonance-trails.test.ts). Three parts:
 *
 *  - SustainMeter: a slowly varying 0..1 estimate of how much the sound is
 *    SUSTAINING, from the journeys' shared 256-pt analyser BYTE spectrum
 *    (the same feed the living score reads). Sustain = presence × calm:
 *      presence — the level relative to the track's own recent peak (a held
 *                 chord at full ring = 1, dying away → 0, silence = 0);
 *      calm     — 1 − busyness, where busyness is the spectral flux (positive
 *                 per-bin rises of the dB spectrum, per second) both against
 *                 the track's own 20 s average and an absolute scale — many
 *                 attacks = busy = no tails.
 *    It is smoothed by an asymmetric EMA (UP_TAU_SEC ≥ 1.5 s rising,
 *    DOWN_TAU_SEC ≥ 3 s falling), then mapped to a trail GAIN with a dead zone
 *    (a staccato passage's residue never draws) and slew-limited so a full
 *    0 → 1 change of the tail length takes ≥ MIN_SWING_SEC.
 *  - The streak geometry (trailGeometry) — the CPU mirror of the draw vertex
 *    shader (shaders.ts "RESONANCE TRAILS"): each point sprite is stretched
 *    along the mote's SCREEN-SPACE velocity (read from the simulation's
 *    velocity texture — no previous-frame buffer, no framebuffer feedback)
 *    into a soft capsule whose light fades from head to tail.
 *  - The streak profile (trailFragment) — the CPU mirror of the fragment
 *    shader, so the test can rasterise a streak and prove the energy law.
 *
 * Karel's laws, enforced here and asserted in resonance-trails.test.ts:
 *  - SEIZURE SAFETY — THE MOTE SPREADS, IT NEVER BRIGHTENS: the streak's
 *    integrated light is normalised analytically to the untrailed mote's
 *    (`scale` = E_disc / E_streak, clamped ≤ 1), and its peak never exceeds
 *    the untrailed peak. No new light enters the frame, so the exposure
 *    governor sees the same field; no flicker can come from a tail.
 *  - NO SHIMMER: a tail is ≥ MIN_HALF_W_PX·2 wide with a soft (gaussian,
 *    feathered-to-zero) cross profile; length is capped (MAX_PX_1080 scaled to
 *    the screen height, soft-saturating, never a hard kink).
 *  - SLOW: the gain moves ≤ MAX_GAIN_RATE per second (≥ MIN_SWING_SEC for a
 *    full change of tail length), on top of the ≥ 1.5 s / ≥ 3 s EMA.
 *  - DOF-AWARE: an out-of-focus bokeh disc does not streak (length × (1 − coc))
 *    — a bokeh smear would be expensive and read as blur, not ringing.
 *  - EMBLEMS / IMAGE FORMS UNTOUCHED: the engine gates the gain by
 *    (1 − max(image form, image show)) and the shader by (1 − image show).
 *  - EVERY JOURNEY, MASTERED TOO (Karel 2026-10-13: Snowflake + Ghost carry it):
 *    each journey has a strength knob (TRAILS_JOURNEY_STRENGTH, default 1);
 *    Ghost's angel + blossom moments are image forms, so the image gate keeps
 *    them untouched.
 *  - KIOSK PERF: ~130 integer ops per analyser frame on the CPU; the GLSL is
 *    only compiled in when the flag is on (off = the show build's exact draw
 *    source); only TRAIL_SHARE of the motes carry a tail (fill-rate budget).
 *
 * Off by default (TRAILS_DEFAULT): `?trails=1` turns it on for the tab
 * (remembered in sessionStorage across the kiosk loop), `?trails=0` off.
 */

export const TRAILS_DEFAULT = false;
export const TRAILS_SESSION_KEY = "resonance-trails";
/** Per-journey strength (multiplies the gain; 0 = off for that journey).
 *  Unlisted journeys = 1. Snowflake + Ghost are listed so they can be tuned. */
export const TRAILS_JOURNEY_STRENGTH: Readonly<Record<string, number>> = {
  "first-snow": 1,
  ghost: 1,
};
export function trailsStrengthFor(journeyId: string): number {
  const k = TRAILS_JOURNEY_STRENGTH[journeyId];
  return typeof k === "number" && Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 1;
}

export const TRAILS_LAWS = {
  // ── sustain meter ──
  /** bins read from the 128-bin analyser (≈ 0 … 12 kHz — the piano) */
  END_BIN: 64,
  /** the analyser's byte dB range (audio-engine: 256-pt, bytes over 70 dB) */
  BYTE_DB_RANGE: 70,
  /** per-bin rises below this many byte steps are analyser jitter, not attacks */
  FLUX_JITTER: 2,
  /** busyness: fast flux average (s) and the track's own slow average (s) */
  FLUX_FAST_SEC: 0.6,
  FLUX_SLOW_SEC: 20,
  /** relative busyness: fast/slow ratio held … busy */
  REL_HELD: 0.55,
  REL_BUSY: 1.35,
  /** busyness = REL_WEIGHT · relative + (1 − REL_WEIGHT) · absolute */
  REL_WEIGHT: 0.35,
  /** absolute busyness: rises per second (byte-normalised, summed over bins) held … busy */
  ABS_HELD: 6,
  ABS_BUSY: 24,
  /** presence: the track's recent peak level decays with this time constant (s) */
  PEAK_DECAY_SEC: 30,
  /** presence: level / peak — no tails at or below FLOOR, full tails at FULL */
  LEVEL_FLOOR: 0.06,
  LEVEL_FULL: 0.45,
  /** the sustain EMA: rising (s, ≥ 1.5) and falling (s, ≥ 3) */
  UP_TAU_SEC: 1.8,
  DOWN_TAU_SEC: 3.2,
  /** gain dead zone: sustain below DEAD draws nothing; full gain at FULL */
  GAIN_DEAD: 0.18,
  GAIN_FULL: 0.85,
  /** the gain never moves faster than this per second */
  MAX_GAIN_RATE: 0.5,
  /** …so a full change of tail length takes at least this long (s) */
  MIN_SWING_SEC: 1.5,
  // ── streak geometry ──
  /** tail length = screen speed (px/s) × this × gain (a long exposure, soft-capped) */
  EXPOSURE_SEC: 0.06,
  /** tail length cap in px at a 1080-px-tall screen (scaled with the height) */
  MAX_PX_1080: 9,
  /** largest sprite a streak may grow to (px; the untrailed cap is 24) */
  SPRITE_CAP_PX: 40,
  /** a trailing mote is at least this half-width (px) — tails ≥ 2.8 px wide */
  MIN_HALF_W_PX: 1.4,
  /** light at the tail's end = 1 − TAIL_FADE · L / (L + R) of the head's */
  TAIL_FADE: 1,
  /** the cross profile softens toward the gaussian tail profile by min(1, this · L / (L + R)) */
  SOFTEN: 2,
  /** share of motes that carry a tail (stable per mote; the edge is feathered) */
  SHARE: 0.45,
  /** engine glide on top of the meter (s) */
  ENGINE_GLIDE_SEC: 0.6,
} as const;

const L = TRAILS_LAWS;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ss = (e0: number, e1: number, x: number) => {
  const u = clamp((x - e0) / Math.max(1e-9, e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// ─── the sustain meter ──────────────────────────────────────────────────────

let ampTable: Float32Array | null = null;
function amps(): Float32Array {
  if (!ampTable) {
    ampTable = new Float32Array(256);
    for (let b = 1; b < 256; b++) ampTable[b] = Math.pow(10, ((b / 255 - 1) * L.BYTE_DB_RANGE) / 20);
  }
  return ampTable;
}

export class SustainMeter {
  private readonly prev = new Uint8Array(L.END_BIN);
  private primed = false;
  private lastHash = -1;
  private pendingDt = 0;
  private fluxFast = 0;
  private fluxSlow = 0;
  private slowPrimed = false;
  private peak = 0;
  private raw = 0;
  /** smoothed sustain 0..1 */
  sustain = 0;
  /** trail gain 0..1 (dead-zoned, slew-limited) — what the engine draws */
  gain = 0;
  /** diagnostics */
  presence = 0;
  busy = 0;

  /** Feed one analyser frame (byte spectrum, or null for silence / paused).
   *  Stale frames (the feed has not updated) keep the last reading. Returns the gain. */
  push(bytes: ArrayLike<number> | null, dt: number): number {
    const h = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
    this.pendingDt += h;
    if (!bytes) {
      this.raw = 0;
      this.primed = false;
      this.lastHash = -1;
      this.pendingDt = 0;
      this.presence = 0;
    } else {
      const n = Math.min(L.END_BIN, bytes.length);
      let hash = 0;
      for (let i = 0; i < n; i++) hash = (hash * 31 + bytes[i] * (i + 7)) % 2147483647;
      if (hash !== this.lastHash) {
        this.lastHash = hash;
        const span = Math.max(1 / 240, this.pendingDt);
        this.pendingDt = 0;
        const A = amps();
        let level = 0, rise = 0;
        for (let i = 0; i < n; i++) {
          const b = bytes[i] | 0;
          level += A[b < 0 ? 0 : b > 255 ? 255 : b];
          const d = b - this.prev[i];
          if (this.primed && d > L.FLUX_JITTER) rise += (d - L.FLUX_JITTER) / 255;
          this.prev[i] = b;
        }
        level /= Math.max(1, n);
        const flux = this.primed ? rise / span : 0;
        this.primed = true;
        // busyness: fast vs the track's own slow average, and an absolute scale
        this.fluxFast += (flux - this.fluxFast) * (1 - Math.exp(-span / L.FLUX_FAST_SEC));
        if (!this.slowPrimed) { this.fluxSlow = Math.max(this.fluxFast, L.ABS_HELD); this.slowPrimed = true; }
        this.fluxSlow += (flux - this.fluxSlow) * (1 - Math.exp(-span / L.FLUX_SLOW_SEC));
        const rel = this.fluxFast / Math.max(1e-3, this.fluxSlow);
        this.busy = L.REL_WEIGHT * ss(L.REL_HELD, L.REL_BUSY, rel) + (1 - L.REL_WEIGHT) * ss(L.ABS_HELD, L.ABS_BUSY, this.fluxFast);
        // presence: level against the track's recent peak (instant up, slow decay)
        this.peak = Math.max(level, this.peak * Math.exp(-span / L.PEAK_DECAY_SEC), 1e-4);
        this.presence = ss(L.LEVEL_FLOOR, L.LEVEL_FULL, level / this.peak);
        this.raw = this.presence * (1 - this.busy);
      }
    }
    return this.step(h);
  }

  /** Advance the smoothing by dt with the current raw reading. */
  private step(h: number): number {
    const tau = this.raw > this.sustain ? L.UP_TAU_SEC : L.DOWN_TAU_SEC;
    this.sustain += (this.raw - this.sustain) * (1 - Math.exp(-h / tau));
    const target = trailGain(this.sustain);
    const maxStep = L.MAX_GAIN_RATE * h;
    this.gain = clamp(target, this.gain - maxStep, this.gain + maxStep);
    return this.gain;
  }
}

/** Sustain (0..1) → trail gain (0..1): a dead zone, then a smooth rise. */
export function trailGain(sustain: number): number {
  return Number.isFinite(sustain) ? ss(L.GAIN_DEAD, L.GAIN_FULL, sustain) : 0;
}

// ─── the streak: profiles + their energy integrals ─────────────────────────

/** The untrailed mote's in-focus profile (shaders.ts DRAW_FS), r² over the unit disc. */
export const coreProfile = (r2: number) => Math.exp(-r2 * 7) + 0.3 * Math.exp(-r2 * 1.8);
/** The out-of-focus bokeh disc (DRAW_FS). */
export const bokehProfile = (r2: number) => (1 - ss(0.15, 1, r2)) * 0.62 + 0.12 * Math.exp(-r2 * 2);
/** The tail's soft cross profile: the core's peak, a wide gaussian feathered to 0 at the rim. */
export const softProfile = (r2: number) => 1.3 * Math.exp(-r2 * 2) * (1 - ss(0.5, 1, r2));

/** ∫ over the unit disc (G2) and across a unit half-width line (G1) of a profile. */
function integrals(p: (r2: number) => number): { g2: number; g1: number } {
  const N = 4000;
  let g2 = 0, g1 = 0;
  for (let i = 0; i < N; i++) {
    const r = (i + 0.5) / N;
    g2 += p(r * r) * 2 * Math.PI * r / N;
    g1 += 2 * p(r * r) / N;
  }
  return { g2, g1 };
}
const IC = integrals(coreProfile), IB = integrals(bokehProfile), IS = integrals(softProfile);
export const TRAIL_INTEGRALS = {
  core: IC, bokeh: IB, soft: IS,
} as const;

export interface TrailIn {
  /** the untrailed sprite's half-size in px (after the < 1 px clamp and the 24 px cap) */
  r0: number;
  /** depth-of-field circle of confusion 0..1 */
  coc: number;
  /** the mote's screen speed (px/s) */
  speedPx: number;
  /** the engine's trail gain 0..1 */
  gain: number;
  /** image presence 0..1 */
  imgShow: number;
  /** screen height (device px) */
  viewH: number;
  /** this mote's carrier weight 0..1 (TRAIL_SHARE) */
  carrier: number;
}
export interface TrailGeom {
  /** tail length (px, head → tail, along −velocity) */
  len: number;
  /** half-width (px) */
  r: number;
  /** tail-end light fall-off (light at the tail end = 1 − fade) */
  fade: number;
  /** cross-profile softening 0..1 */
  soft: number;
  /** sprite side (px) */
  sprite: number;
  /** energy normalisation (≤ 1) */
  scale: number;
}

/** CPU mirror of the draw vertex shader's streak (shaders.ts RESONANCE TRAILS). */
export function trailGeometry(t: TrailIn): TrailGeom {
  const r0 = Math.max(0.5, t.r0);
  const cap = L.MAX_PX_1080 * Math.max(0.25, t.viewH / 1080);
  const raw = Math.max(0, t.speedPx) * L.EXPOSURE_SEC * clamp(t.gain, 0, 1) * (1 - clamp(t.imgShow, 0, 1)) * (1 - clamp(t.coc, 0, 1)) * clamp(t.carrier, 0, 1);
  let len = cap * (1 - Math.exp(-raw / cap));
  const r = Math.max(r0, mix(r0, L.MIN_HALF_W_PX, ss(0, 2, len)));
  len = Math.min(len, Math.max(0, L.SPRITE_CAP_PX - 2 * r));
  const k = len / (len + r);
  const fade = L.TAIL_FADE * k, soft = Math.min(1, L.SOFTEN * k);
  const coc = clamp(t.coc, 0, 1);
  const g2u = mix(IC.g2, IB.g2, coc), g1u = mix(IC.g1, IB.g1, coc);
  const g2t = mix(g2u, IS.g2, soft), g1t = mix(g1u, IS.g1, soft);
  const e0 = r0 * r0 * g2u;
  const e = (1 - fade / 2) * (r * r * g2t + r * len * g1t);
  return { len, r, fade, soft, sprite: 2 * r + len, scale: Math.min(1, e0 / Math.max(1e-9, e)) };
}

/** CPU mirror of the fragment shader: light at offset (x, y) px from the
 *  streak's sprite centre (the head at +len/2 along `dir`, a unit vector),
 *  before the mote's colour. The untrailed mote = len 0, r = r0, soft 0. */
export function trailFragment(x: number, y: number, g: TrailGeom, dir: [number, number], coc: number): number {
  const s = clamp(x * dir[0] + y * dir[1], -0.5 * g.len, 0.5 * g.len);
  const dx = x - s * dir[0], dy = y - s * dir[1];
  const r2 = (dx * dx + dy * dy) / (g.r * g.r);
  if (r2 > 1) return 0;
  let p = mix(coreProfile(r2), bokehProfile(r2), coc);
  p = mix(p, softProfile(r2), g.soft);
  const along = g.len > 1e-6 ? (0.5 * g.len - s) / g.len : 0;
  return p * (1 - g.fade * along) * g.scale;
}

/** GLSL constants for the shader (one source of truth: the integrals above). */
export function trailsGlslConsts(): string {
  const f = (x: number) => x.toFixed(6);
  return [
    `const float TR_EXPO = ${f(L.EXPOSURE_SEC)};`,
    `const float TR_MAX1080 = ${f(L.MAX_PX_1080)};`,
    `const float TR_SPRITE_CAP = ${f(L.SPRITE_CAP_PX)};`,
    `const float TR_MIN_R = ${f(L.MIN_HALF_W_PX)};`,
    `const float TR_TAIL_FADE = ${f(L.TAIL_FADE)};`,
    `const float TR_SOFTEN = ${f(L.SOFTEN)};`,
    `const float TR_SHARE = ${f(L.SHARE)};`,
    `const float TR_G2C = ${f(IC.g2)}; const float TR_G1C = ${f(IC.g1)};`,
    `const float TR_G2B = ${f(IB.g2)}; const float TR_G1B = ${f(IB.g1)};`,
    `const float TR_G2S = ${f(IS.g2)}; const float TR_G1S = ${f(IS.g1)};`,
  ].join("\n");
}

// ─── the flag ───────────────────────────────────────────────────────────────

/** Is Resonance Trails on for this tab? `?trails=1` / `?trails=0` (kept in
 *  sessionStorage across the kiosk loop's navigations), else the default (off). */
export function trailsEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("trails");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(TRAILS_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(TRAILS_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return TRAILS_DEFAULT;
}

/** Session store for the flag (null where storage is blocked / no window). */
export function trailsSessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

/** This journey's trail strength: 0 when the flag is off, else its knob
 *  (mastered journeys included — Karel 2026-10-13). */
export function trailsForJourney(journeyId: string, flagOn: boolean): number {
  return flagOn ? trailsStrengthFor(journeyId) : 0;
}
