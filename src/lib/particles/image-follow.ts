// ─────────────────────────────────────────────────────────────────────────────
// image-follow.ts — the pure maths behind every image-form hand-off (emblems,
// motifs, Ghost's angel + blossom moment), shared by the engine and the layer
// so a unit test can step them frame by frame (Karel 2026-10-09: "the
// grasshopper emblem didnt transition smoothly. it just dropped").
//
//  • critStep / springTau: the engine's critically damped followers (image
//    pull + presence, placement, plane scale, mirror) — the engine calls these.
//  • emblemEnvelope: when the journey's emblem forms / shows (layer).
//  • imageSlotStep: when an image form may be RELEASED and when the next one
//    may LOAD (layer). Loading swaps the image + its per-mote sample table, so
//    on a still-visible image it pops every mote's colour and target at once.
// ─────────────────────────────────────────────────────────────────────────────

export interface Crit { x: number; v: number }

/** Critically damped step toward `target` at angular rate `w` (engine image pull / presence), clamped 0..1. */
export function critStep(s: Crit, target: number, w: number, h: number): void {
  s.v += (w * w * (target - s.x) - 2 * w * s.v) * h;
  s.x += s.v * h;
  if (s.x < 0 || s.x > 1) { s.x = Math.max(0, Math.min(1, s.x)); s.v = 0; }
}

/** The engine's general spring (ω = 2/τ, step capped at 50 ms). `vel[i]` holds its velocity. */
export function springTau(vel: Float64Array, i: number, x: number, target: number, tau: number, dt: number): number {
  const w = 2 / tau, h = Math.min(dt, 0.05);
  vel[i] += (w * w * (target - x) - 2 * w * vel[i]) * h;
  return x + vel[i] * h;
}

const ss = (e0: number, e1: number, x: number) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };

export interface EmblemEnvelope { form: number; show: number; occ: 0 | 1 | 2; age: number }
/** The emblem under the title (0.8–16 s), mid-way in long pieces, and in the last 17 s. */
export function emblemEnvelope(t: number, D: number): EmblemEnvelope {
  let form = ss(0.8, 3.8, t) * (1 - ss(11, 15, t));
  let show = ss(1.0, 4.0, t) * (1 - ss(12, 16, t));
  let occ: 0 | 1 | 2 = 0;
  let age = ss(4, 11, t);
  if (D > 40 && t > D - 17) {
    const e = t - (D - 17);
    form = Math.max(form, ss(0, 3.5, e));
    show = Math.max(show, ss(0.3, 4, e));
    occ = 2;
    age = ss(4, 11, e);
  }
  if (D > 200 && t > D * 0.5 && t < D * 0.5 + 15) {
    const m = t - D * 0.5;
    form = Math.max(form, ss(0, 3.5, m) * (1 - ss(9, 13, m)));
    show = Math.max(show, ss(0.3, 4, m) * (1 - ss(10, 14, m)));
    occ = 1;
    age = ss(4, 10, m);
  }
  return { form, show, occ, age };
}

/** Image level below which a new image may load unseen. */
export const IMAGE_CLEAR = 0.01;
/** Fixed release wait (ms) — the old rule, still used by mastered journeys. */
export const RELEASE_MS = 1400;
/** Strict mode never waits longer than this for the image to clear. */
export const RELEASE_MAX_MS = 4000;

export interface ImageSlot { key: string | null; releasing: boolean; releaseAt: number }
export type SlotAction = "release" | "unload" | "load" | null;

/**
 * One tick of the image slot. `wantKey` = the image the conductor wants worn
 * now (null = none); `level` = the engine's image pull/presence still in
 * flight (max of the two followers); `strict` = wait for the old image to have
 * truly cleared before loading the next (non-mastered journeys). The flash
 * (`urgent`) keeps its fast path — it meets the flash image on the beat.
 * Returns the action taken (the caller performs it).
 */
export function imageSlotStep(slot: ImageSlot, wantKey: string | null, level: number, nowMs: number, strict: boolean, urgent = false): SlotAction {
  if (wantKey && wantKey !== slot.key && slot.key && !slot.releasing) {
    slot.releasing = true;
    slot.releaseAt = nowMs;
    return "release";
  }
  if (slot.releasing) {
    const waited = nowMs - slot.releaseAt;
    // (the flash keeps its old pace: it must meet the flash image on the beat)
    const done = strict && !urgent ? (waited > RELEASE_MS && level < IMAGE_CLEAR) || waited > RELEASE_MAX_MS : waited > RELEASE_MS;
    if (done) { slot.releasing = false; slot.key = null; return "unload"; }
    return null;
  }
  if (wantKey && wantKey !== slot.key && !slot.key && (!strict || urgent || level < IMAGE_CLEAR)) {
    slot.key = wantKey;
    return "load";
  }
  return null;
}

/**
 * The emblem hand-off rules, for EVERY journey (Karel 2026-10-09: "fix those
 * emblems too" — Snowflake and Ghost included; mastered-lock fingerprints this
 * object, so any later change to it is deliberate):
 *  • strictRelease — the next image loads only once the last has cleared;
 *  • underlay — the journey's own opening form is set UNDER the opening
 *    emblem while the field fully wears it, so the emblem dissolves straight
 *    into it (no stale leftover form re-aimed as it releases);
 *  • microDriftGuard — no breathing micro-drift before the journey has a form.
 */
export const EMBLEM_HANDOFF = { strictRelease: true, underlay: true, microDriftGuard: true } as const;

/** Underlay the opening form now? Only once the field fully WEARS the emblem
 *  (image presence ≥ 0.95 → the world form is ≤ 19 % visible underneath). */
export function underlayDue(o: { emblemWorn: boolean; releasing: boolean; hasForm: boolean; emForm: number; imageShow: number }): boolean {
  return EMBLEM_HANDOFF.underlay && o.emblemWorn && !o.releasing && !o.hasForm && o.emForm > 0.6 && o.imageShow >= 0.95;
}
