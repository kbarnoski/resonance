// ─────────────────────────────────────────────────────────────────────────────
// statement-piano-plan.ts — the clock of the set-start statement card's
// particle piano (Karel's 1919 upright with candles and fire, 2026-10-09).
//
// The card is where every set's first journey spins up behind black, and that
// spin-up stalls the GPU up to ~290 ms (project_kiosk_stall_lessons): a stall
// must land on a STILL frame. So the piano gathers EARLY, then the engine
// STOPS before the pre-start — the canvas keeps showing its last frame, a
// still image that costs nothing — and it fades with the text on CSS opacity
// alone. No engine work, texture upload or start/stop inside the window.
//
// All times are ms from the card's start (InstallationIntro "experience").
// ─────────────────────────────────────────────────────────────────────────────

/** The statement card's length (installation-machine EXPERIENCE_INTRO_MS). */
export const CARD_MS = 13_000;
/** Journey 0 pre-starts this long after the card begins (loop client: expMs - 4500). */
export const PRESTART_MS = CARD_MS - 4_500;
/** The statement text holds this long after the pre-start, then fades (1.8 s). */
export const CYCLE_FADE_AFTER_PRESTART_MS = 3_500;
export const TEXT_FADE_MS = 1_800;

/** The image (decoded + sampled in the worker at page load) uploads while the card is still black. */
export const UPLOAD_AT_MS = 550;
/** The field starts gathering with the text's own fade-in (700 ms on black, 1.4 s in). */
export const START_AT_MS = 700;
/** Gathered by here (image pull follower settles in ~2 s). */
export const FORMED_BY_MS = 3_000;
/** Engine STOPS here — the canvas holds the formed piano as a still frame. */
export const STOP_AT_MS = PRESTART_MS - 300;
/** No engine work at all inside [WINDOW_START, WINDOW_END). */
export const WINDOW_START_MS = PRESTART_MS - 300;
export const WINDOW_END_MS = PRESTART_MS + CYCLE_FADE_AFTER_PRESTART_MS;
/** The piano fades out with the text (CSS opacity on the stopped canvas). */
export const FADE_AT_MS = WINDOW_END_MS;
/** …and only then hands the engine back to the journey (layer may start it). */
export const RELEASE_AT_MS = FADE_AT_MS + TEXT_FADE_MS + 100;
/** A start later than this can't gather + be seen before the stop: skip the piano this card.
 *  (the boot card: the session's program warm-up ends ~3.9–4.5 s in — measured) */
export const LATEST_START_MS = STOP_AT_MS - 2_500;
/** How often the boot card re-checks whether the programs are warm. */
export const READY_POLL_MS = 100;

/** Canvas opacity while shown (behind the text: rich, never fighting the title). */
export const PIANO_OPACITY = 0.8;
/** Image plane size (1 = full frame) and placement (camera offset: negative y = the form sits higher). */
export const PIANO_OFFSET_Y = 0;
/** The piano's height as a share of the screen. */
export const PIANO_HEIGHT = 0.86;
/** Fully literal: the motes sit ON the photograph (no swirl or drift while held). */
export const PIANO_FORM = 1;

/** Image-plane scale that makes an image of aspect `img` stand PIANO_HEIGHT of a
 *  screen of aspect `scr` (the engine's plane covers the screen, ×1.06). */
export function pianoPlaneScale(img: number, scr: number, height = PIANO_HEIGHT): number {
  const halfH = 1.06 * (img > scr ? 1 : scr / img); // plane half-height, in screen half-heights, at scale 1
  return Math.max(0.2, Math.min(1.2, height / halfH));
}

/** May the card touch the engine (start / stop excepted at their own instants) at card time t? */
export function engineWorkAllowed(tMs: number): boolean {
  return tMs < WINDOW_START_MS || tMs >= WINDOW_END_MS;
}

export type PianoStep = "upload" | "start" | "stop" | "fade" | "release";
export interface PianoEvent { at: number; step: PianoStep }

/**
 * The card's schedule. `ready` = the engine's programs are warm and the image
 * is decoded + sampled by `readyAt` (ms); if that is too late to gather before
 * the stop, the piano is skipped (only the fade-free release remains).
 */
export function pianoSchedule(readyAt: number): PianoEvent[] {
  const startAt = Math.max(START_AT_MS, readyAt);
  if (startAt > LATEST_START_MS) return [{ at: RELEASE_AT_MS, step: "release" }];
  const uploadAt = Math.max(UPLOAD_AT_MS, readyAt);
  return [
    { at: uploadAt, step: "upload" },
    { at: startAt, step: "start" },
    { at: STOP_AT_MS, step: "stop" },
    { at: FADE_AT_MS, step: "fade" },
    { at: RELEASE_AT_MS, step: "release" },
  ];
}

/** True when an engine call of this kind is legal at card time t (the runtime guard). */
export function stepAllowed(step: PianoStep, tMs: number): boolean {
  if (step === "stop") return true; // stopping only ever removes GPU work (a late timer still stops)
  if (step === "fade") return tMs >= FADE_AT_MS; // CSS only
  return engineWorkAllowed(tMs);
}
