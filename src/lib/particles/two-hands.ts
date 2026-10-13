/**
 * TWO HANDS — call and response (2026-10-13, for Karel the pianist).
 *
 * The two hands of the piano are two voices, and the free motes become two
 * layers that carry them:
 *  - LEFT HAND (low register: bass, chords) moves a DEEP layer — the motes far
 *    in depth — in broad, lazy swells: long waves rolling slowly through it.
 *  - RIGHT HAND (high register: melody) moves a FINE layer near the camera in
 *    delicate, quick-but-smooth eddies.
 *  When the melody answers the bass, the motion visibly passes from the far
 *  layer to the near one (and back): call and response.
 *
 * The living score (living-score.ts) writes each NOTE as a local swirl; the
 * two hands decide which LAYER of the whole field carries the motion. They
 * coexist, and compose additively with the currents / bridge / phrase.
 *
 * Pure + deterministic (two-hands.ts → two-hands.test.ts). The signal reuses
 * the living score's register logic — its OnsetDetector's pitch (the onset's
 * log-frequency centroid) and binPitch / the byte compression table for a
 * per-register rise — so "low" and "high" mean the same thing in both.
 *
 * Karel's laws, enforced here and asserted in the test:
 *  - MOTION ONLY: the output is two force magnitudes + a depth-sorting weight;
 *    no size / alpha / colour / luminance channel exists. The shader adds a
 *    FORCE only — never sets a position or velocity — so toggling never jumps
 *    a mote.
 *  - NEVER ON THE BEAT: each register's activity eases in over ≥ ATTACK_SEC
 *    (0.8 s) and out over ≥ RELEASE_SEC (2.5 s), and the voices are
 *    slew-limited (MAX_RATE_PER_SEC) — a struck chord leans a layer in, it
 *    never kicks it.
 *  - FREE SOULS ONLY: the engine scales by the soul's CURRENT_FREEDOM (the
 *    figures stay legible); images and emblems untouched (the shader gates by
 *    (1 − image form)(1 − image show); the layer's gain is 0 while one is worn).
 *  - EVERY JOURNEY, THE MASTERED TAKES TOO (Karel 2026-10-13: Snowflake
 *    "first-snow" and Ghost "ghost" get the hands as well) — each journey has
 *    its own strength knob (HANDS_JOURNEY_STRENGTH, default 1) so they can be
 *    tuned; their emblems and image moments (Ghost's angel + blossom) stay
 *    untouched by the image-form / image-show gate.
 *
 * Off by default (HANDS_DEFAULT): `?hands=1` turns it on for the tab
 * (remembered in sessionStorage across the kiosk loop), `?hands=0` off. Off,
 * the GLSL is not compiled in (the simulation source is the show build's).
 */

import { OnsetDetector, binPitch, smoothstep, SCORE_TUNING, type Onset } from "./living-score";

export const HANDS_DEFAULT = true; // Karel kept it (2026-10-13)
export const HANDS_SESSION_KEY = "resonance-hands";
/** Per-journey strength (multiplies both voices + the depth sorting; 0 = off
 *  for that journey). Unlisted journeys = 1. The mastered takes are listed so
 *  they can be tuned in one place. */
export const HANDS_JOURNEY_STRENGTH: Readonly<Record<string, number>> = {
  "first-snow": 1,
  ghost: 1,
};
/** This journey's strength 0..2 (default 1). */
export function handsStrength(journeyId: string): number {
  const k = (HANDS_JOURNEY_STRENGTH as Record<string, number | undefined>)[journeyId];
  return k === undefined || !Number.isFinite(k) ? 1 : Math.max(0, Math.min(2, k));
}

export const HANDS_TUNING = {
  // ── register split (living-score pitch units: 0 ≈ 90 Hz … 1 ≈ 4.3 kHz) ──
  /** ONSET split: where the left hand ends and the right begins, on the
   *  OnsetDetector's pitch — a flux-weighted centroid that includes the
   *  partials, so on the shared 256-pt analyser a bass note reads ~0.2-0.46
   *  and a melody note ~0.58+ */
  SPLIT: 0.5,
  /** soft half-width of the onset split (a note on the line belongs to both) */
  SPLIT_SOFT: 0.07,
  /** SPECTRAL split for the per-bin rise: a bin's own pitch (≈ bin 2.5 ≈
   *  470 Hz — the bins really are their frequency, no partial smear) */
  RISE_SPLIT: 0.3,
  RISE_SPLIT_SOFT: 0.08,
  // ── activity ──
  /** onset-rate memory (s): each register's notes per second, leaky */
  RATE_TAU: 1.5,
  /** notes / s at which a register reads ~63 % active */
  RATE_REF: 1.4,
  /** per-register spectral rise: per-bin baseline (s), AGC memory (s), floor */
  REF_TAU: 0.25,
  AGC_SEC: 10,
  RISE_FLOOR: 0.03,
  /** the rise term's own smoothing (s) */
  RISE_TAU: 0.5,
  /** weights of the two cues (onset rate, sustained spectral rise) */
  ONSET_W: 0.75,
  RISE_W: 0.4,
  /** EASE IN / OUT (the law: attack ≥ 0.6 s, release ≥ 2 s) */
  ATTACK_SEC: 0.8,
  RELEASE_SEC: 2.5,
  /** call and response: a leading hand is leaned up, the other down, by this much */
  CONTRAST: 0.6,
  /** the voices never move faster than this per second (no beat-level kick) */
  MAX_RATE_PER_SEC: 0.9,
  /** gate (presence × ladder × held) glide (s) — attack / release */
  GATE_ATTACK_SEC: 0.8,
  GATE_RELEASE_SEC: 2.0,
  // ── gain ladder (kinetic.ts journeyResponse SOLO 1.3 … BIG 2.5) ──
  RESP_LO: 1.3,
  RESP_HI: 2.5,
  /** solo piano: subtle but READABLE; intense: full */
  AMP_SOLO: 0.75,
  AMP_FULL: 1.0,
  /** inside the one-big-change busy zone */
  BUSY_K: 0.6,
  /** field presence below which the hands are silent, and where they are full */
  SHOWN_LO: 0.08,
  SHOWN_HI: 0.5,
  // ── layers (mirrored in the GLSL, shaders.ts HANDS_FORCE_GLSL) ──
  /** membership = HASH_W · stable per-mote hash + DEPTH_W · nearness */
  HASH_W: 0.75,
  DEPTH_W: 0.25,
  /** smoothstep half-width of the membership bias */
  MEMBER_SOFT: 0.35,
  /** depth targets (world units along the eye axis): left hand far, right near */
  STRATA_FAR: -0.9,
  STRATA_NEAR: 0.8,
  /** depth-sorting spring (u/s² per unit) at full presence — gentle */
  STRATA_K: 0.18,
  /** peak accelerations (world u/s²) at voice 1 */
  FORCE_LOW: 0.9,
  FORCE_HIGH: 1.1,
  /** left-hand swell: spatial frequency (rad / unit) + clock speed (rad / s) — period ≈ 15 s */
  LOW_K: 0.55,
  LOW_W: 0.42,
  /** right-hand eddies: curl-noise scale + drift speed — quick but smooth */
  HIGH_K: 2.1,
  HIGH_DRIFT: 0.21,
} as const;

const T = HANDS_TUNING;
const clamp01 = (x: number) => (x > 1 ? 1 : x > 0 ? x : 0);

/** A note's (or a bin's) share of the RIGHT hand: 0 = all left … 1 = all right. */
export function registerShare(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0.5;
  return smoothstep(T.SPLIT - T.SPLIT_SOFT, T.SPLIT + T.SPLIT_SOFT, pitch);
}

/** Layer membership of one mote (mirrors the GLSL exactly): `hash` is its
 *  stable per-mote hash 0..1, `near` its nearness 0 (far) … 1 (near camera).
 *  Returns the weights of the left-hand (low) and right-hand (high) layers. */
export function handsMembership(hash: number, near: number): { low: number; high: number } {
  const bias = (hash - 0.5) * 2 * T.HASH_W + (clamp01(near) - 0.5) * 2 * T.DEPTH_W;
  const high = smoothstep(-T.MEMBER_SOFT, T.MEMBER_SOFT, bias);
  return { low: 1 - high, high };
}

export interface HandsGainInput {
  /** kinetic.ts journeyResponse (the vibe ladder) */
  respK: number;
  /** field presence 0..1 */
  shown: number;
  /** 0..1: an image form / emblem / moment / motif is worn */
  held: number;
  /** inside the one-big-change busy zone */
  busy: boolean;
}

/** The hands' target gain: ladder × visibility × (nothing while an image is worn). */
export function handsGain(g: HandsGainInput): number {
  const ladder = clamp01((g.respK - T.RESP_LO) / (T.RESP_HI - T.RESP_LO));
  const amp = T.AMP_SOLO + (T.AMP_FULL - T.AMP_SOLO) * (Number.isFinite(ladder) ? ladder : 0);
  const vis = smoothstep(T.SHOWN_LO, T.SHOWN_HI, Number.isFinite(g.shown) ? g.shown : 0);
  const held = 1 - clamp01(Number.isFinite(g.held) ? g.held : 1);
  return amp * vis * held * (g.busy ? T.BUSY_K : 1);
}

/** Motion state — no luminance field, by law. */
export interface HandsVoices {
  /** left hand: the deep layer's swell drive 0..1 */
  low: number;
  /** right hand: the near layer's eddy drive 0..1 */
  high: number;
  /** 0..1 depth sorting into the two layers (follows the gate, never the beat) */
  strata: number;
}

export const NEUTRAL_HANDS: Readonly<HandsVoices> = Object.freeze({ low: 0, high: 0, strata: 0 });

/**
 * The register split: feed it the analyser's byte spectrum and the living
 * score's onset (or null) every frame; it keeps each hand's eased activity and
 * the two voices the engine plays.
 */
export class TwoHands {
  /** eased activity per register 0..1 (attack ATTACK_SEC / release RELEASE_SEC) */
  low = 0;
  high = 0;
  /** the slewed gain gate 0..1+ */
  gate = 0;
  /** what the engine plays (activity × contrast × gate, slew-limited) */
  readonly voices: HandsVoices = { low: 0, high: 0, strata: 0 };
  /** onsets heard per register (soft counts — probes / log) */
  heard = { low: 0, high: 0 };
  /** seconds each hand led (voice ahead by ≥ 0.1) — probes / log */
  led = { low: 0, high: 0 };
  private rateL = 0;
  private rateH = 0;
  private riseL = 0;
  private riseH = 0;
  private peakL: number = T.RISE_FLOOR;
  private peakH: number = T.RISE_FLOOR;
  private readonly ref: Float32Array;
  private readonly wHigh: Float32Array;
  private readonly sumL: number;
  private readonly sumH: number;
  private primed = false;
  private lastHash = -1;
  private pendingDt = 0;

  constructor() {
    const N = SCORE_TUNING.END_BIN;
    this.ref = new Float32Array(N);
    this.wHigh = new Float32Array(N);
    let sl = 0, sh = 0;
    for (let k = 0; k < N; k++) {
      const h = smoothstep(T.RISE_SPLIT - T.RISE_SPLIT_SOFT, T.RISE_SPLIT + T.RISE_SPLIT_SOFT, binPitch(k));
      this.wHigh[k] = h;
      sl += 1 - h;
      sh += h;
    }
    this.sumL = Math.max(1e-6, sl);
    this.sumH = Math.max(1e-6, sh);
  }

  /** Advance by dt with this frame's bytes (null = silence / no feed), the
   *  living score's onset (null = none) and the gain target (handsGain).
   *  Returns the voices (the same object, updated in place — no allocation). */
  step(bytes: ArrayLike<number> | null, onset: Onset | null, dt: number, gainTarget: number): HandsVoices {
    const h = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
    // ── onsets → per-register note rate ──
    const dR = Math.exp(-h / T.RATE_TAU);
    this.rateL *= dR;
    this.rateH *= dR;
    if (onset && Number.isFinite(onset.strength) && onset.strength > 0) {
      const s = clamp01(onset.strength), share = registerShare(onset.pitch);
      // an impulse of (strength) notes, spread over the rate memory
      this.rateL += (s * (1 - share)) / T.RATE_TAU;
      this.rateH += (s * share) / T.RATE_TAU;
      this.heard.low += 1 - share;
      this.heard.high += share;
    }
    // ── per-register spectral rise (fresh frames only; a stale feed holds) ──
    this.pendingDt += h;
    let fresh = false;
    if (bytes) {
      let hs = 0;
      for (let i = 0; i < SCORE_TUNING.END_BIN && i < bytes.length; i++) hs = (hs * 31 + bytes[i] * (i + 7)) % 2147483647;
      fresh = hs !== this.lastHash;
      this.lastHash = hs;
    } else {
      fresh = true;
      this.lastHash = -1;
    }
    if (fresh) {
      const fdt = Math.max(1 / 240, this.pendingDt);
      this.pendingDt = 0;
      const C = OnsetDetector.compress();
      const kr = 1 - Math.exp(-fdt / T.REF_TAU);
      let nl = 0, nh = 0, level = 0;
      for (let k = 0; k < this.ref.length; k++) {
        const b = bytes && k < bytes.length ? Math.max(0, Math.min(255, bytes[k] | 0)) : 0;
        const x = C[b];
        if (!this.primed) this.ref[k] = x;
        const r = Math.max(0, x - this.ref[k]);
        nl += r * (1 - this.wHigh[k]);
        nh += r * this.wHigh[k];
        if (x > level) level = x;
        this.ref[k] += (x - this.ref[k]) * kr;
      }
      this.primed = true;
      if (level < SCORE_TUNING.SILENCE_LEVEL) nl = nh = 0;
      nl /= this.sumL;
      nh /= this.sumH;
      const dP = Math.exp(-fdt / T.AGC_SEC);
      this.peakL = Math.max(nl, this.peakL * dP, T.RISE_FLOOR);
      this.peakH = Math.max(nh, this.peakH * dP, T.RISE_FLOOR);
      const kz = 1 - Math.exp(-fdt / T.RISE_TAU);
      this.riseL += (nl / this.peakL - this.riseL) * kz;
      this.riseH += (nh / this.peakH - this.riseH) * kz;
    }
    // ── eased activity: attack ≥ 0.6 s, release ≥ 2 s ──
    const ease = (x: number, target: number) => x + (target - x) * (1 - Math.exp(-h / (target > x ? T.ATTACK_SEC : T.RELEASE_SEC)));
    const tgtL = clamp01(T.ONSET_W * (1 - Math.exp(-this.rateL / T.RATE_REF)) + T.RISE_W * this.riseL);
    const tgtH = clamp01(T.ONSET_W * (1 - Math.exp(-this.rateH / T.RATE_REF)) + T.RISE_W * this.riseH);
    this.low = ease(this.low, tgtL);
    this.high = ease(this.high, tgtH);
    // ── the gate (presence × ladder × held) ──
    const gt = Math.max(0, Number.isFinite(gainTarget) ? gainTarget : 0);
    this.gate += (gt - this.gate) * (1 - Math.exp(-h / (gt > this.gate ? T.GATE_ATTACK_SEC : T.GATE_RELEASE_SEC)));
    // ── call and response: the leading hand leans up, the other down ──
    const d = this.low - this.high;
    const vL = clamp01(this.low * (1 + T.CONTRAST * d)) * this.gate;
    const vH = clamp01(this.high * (1 - T.CONTRAST * d)) * this.gate;
    const cap = T.MAX_RATE_PER_SEC * h;
    const v = this.voices;
    v.low = Math.max(v.low - cap, Math.min(v.low + cap, vL));
    v.high = Math.max(v.high - cap, Math.min(v.high + cap, vH));
    v.strata = Math.max(v.strata - cap, Math.min(v.strata + cap, clamp01(this.gate)));
    if (v.low - v.high >= 0.1) this.led.low += h;
    else if (v.high - v.low >= 0.1) this.led.high += h;
    return v;
  }
}

/** Is TWO HANDS on for this tab? `?hands=1` / `?hands=0` (kept in
 *  sessionStorage across the kiosk loop's navigations), else the default (off). */
export function handsEnabled(search?: string, store?: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  let q: string | null = null;
  try {
    const s = search ?? (typeof location !== "undefined" ? location.search : "");
    q = new URLSearchParams(s).get("hands");
  } catch { q = null; }
  try {
    if (q === "1" || q === "0") store?.setItem(HANDS_SESSION_KEY, q);
  } catch { /* storage blocked */ }
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    const kept = store?.getItem(HANDS_SESSION_KEY);
    if (kept === "1") return true;
    if (kept === "0") return false;
  } catch { /* storage blocked */ }
  return HANDS_DEFAULT;
}

/** Session store for the flag (null where storage is blocked / no window). */
export function handsSessionStore(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

/** Does this journey get the two hands? Flag on and a non-zero strength —
 *  the mastered takes included (Karel 2026-10-13). */
export function handsAllowed(journeyId: string, flagOn: boolean): boolean {
  return flagOn && handsStrength(journeyId) > 0;
}
