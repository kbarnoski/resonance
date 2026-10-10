// ─────────────────────────────────────────────────────────────────────────────
// statement-piano-plan.ts — the clock of the set-start statement card and its
// particle piano (Karel's 1919 upright, candles and fire burning, 2026-10-09).
//
// Karel 2026-10-09: "the piano in title screen should fade out as the text
// does. it should also appear in the beginning with the resonance logo and text
// fading in. so nice smooth transitions and no weird movements."
//
//   • the piano is FORMED INVISIBLY (its motes are placed straight onto the
//     photograph while the card is black), then appears WITH the logo + text —
//     one opacity, one curve, the same frame; no particles flying in;
//   • it burns (living fire) while visible — the only motion on the card;
//   • it fades out WITH the text (same opacity, same curve), and both are gone
//     before journey 0 pre-starts: the spin-up (Snowflake: 60–80 ms frames for
//     ~3.2 s; other set starts one ~290 ms GPU stall — kiosk rig 2026-10-09)
//     lands on BLACK, then the title arrives as before;
//   • the music starts when it always has (the pre-start), now on black.
//
// All times are ms from the card's start (InstallationIntro "experience").
// ─────────────────────────────────────────────────────────────────────────────

/** The statement card's length (installation-machine EXPERIENCE_INTRO_MS). */
export const CARD_MS = 15_000;
/** Journey 0 pre-starts — and its track starts — this long after the card begins (loop client: expMs - 4500). */
export const PRESTART_MS = CARD_MS - 4_500;
/** Journey 0's spin-up after its pre-start (Snowflake measured ≤ 3.2 s) — nothing may move on screen. */
export const SPINUP_MS = 3_500;
/** The journey title mounts this long after the pre-start (was 5.3 s behind a still text hold). */
export const TITLE_AFTER_PRESTART_MS = 3_800;

/** The logo + text + piano fade in together (installation-intro: 1.4 s ease-out). */
export const REVEAL_AT_MS = 700;
export const REVEAL_MS = 1_400;
/** …and fade out together (1.8 s ease-out), ending before the pre-start. */
export const TEXT_FADE_MS = 1_800;
/** Engine stops, image cleared, engine handed back — invisible by now. */
export const STOP_AT_MS = PRESTART_MS - 300;
export const FADE_OUT_AT_MS = STOP_AT_MS - TEXT_FADE_MS;
/** The loop client schedules the text fade-out this long before its pre-start. */
export const TEXT_OUT_BEFORE_PRESTART_MS = PRESTART_MS - FADE_OUT_AT_MS;

/** The image (decoded + sampled in the worker at page load) uploads on black. */
export const UPLOAD_AT_MS = 300;
/** The engine starts and the motes are placed on the photograph — still on black. */
export const FORM_AT_MS = UPLOAD_AT_MS + 50;
/** At least this long between forming and revealing (the snap frame + the fire waking). */
export const FORM_LEAD_MS = 350;

/** The card never touches the engine inside [WINDOW_START, WINDOW_END) (the spin-up). */
export const WINDOW_START_MS = PRESTART_MS - 300;
export const WINDOW_END_MS = PRESTART_MS + SPINUP_MS;
/** The hand-back: the same instant as the stop (journey 0 mounts at the pre-start, after it). */
export const RELEASE_AT_MS = STOP_AT_MS;
/** The engine hold's safety expiry (a forgotten hold must still hand back — after the release, never before). */
export const HOLD_MAX_MS = RELEASE_AT_MS + 3_000;
/** The boot card: the session's program warm-up ends ~3.85 s in (measured); the text + piano
 *  wait for it together, up to here — later, the text appears alone (no piano this card). */
export const LATEST_REVEAL_MS = FADE_OUT_AT_MS - 3_000;
/** How often the boot card re-checks whether the programs are warm. */
export const READY_POLL_MS = 100;
/** Living fire (draw-only flicker, licks and rising embers — shaders.ts uFire): its strength
 *  and the image line above which the photograph is fire (the cabinet's top board, in uv). */
export const FIRE_STRENGTH = 1;
export const FIRE_LINE_V = 0.575;

/** Piano opacity while shown (behind the text: rich, never fighting the title). */
export const PIANO_OPACITY = 0.8;
/** Placement (camera offset: negative y = the form sits higher). */
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

/**
 * THE card layer (logo + text, the piano, its halo): one target opacity and
 * one transition for all of them, from the intro stage + whether the card has
 * been revealed — so they fade in and out on the same curve, in the same frame.
 */
export function cardLayer(stage: string, revealed: boolean): { shown: boolean; transition: string } {
  const shown = revealed && stage === "experience";
  return { shown, transition: shown ? `opacity ${REVEAL_MS}ms ease-out` : `opacity ${TEXT_FADE_MS}ms ease-out` };
}

/** May the card touch the engine at card time t? */
export function engineWorkAllowed(tMs: number): boolean {
  return tMs < WINDOW_START_MS || tMs >= WINDOW_END_MS;
}

export type PianoStep = "upload" | "form" | "reveal" | "release";
export interface PianoEvent { at: number; step: PianoStep }

/**
 * The card's schedule for a piano ready (programs warm + image decoded) at
 * `readyAt`. A normal card reveals at 0.7 s; the boot card reveals as soon as
 * it has formed. Too late to be seen: the text is revealed alone (no piano).
 */
export function pianoSchedule(readyAt: number): PianoEvent[] {
  const uploadAt = Math.max(UPLOAD_AT_MS, readyAt);
  const formAt = Math.max(FORM_AT_MS, uploadAt + 50);
  const revealAt = Math.max(REVEAL_AT_MS, formAt + FORM_LEAD_MS);
  if (revealAt > LATEST_REVEAL_MS) return textOnlySchedule(Math.min(readyAt, LATEST_REVEAL_MS));
  return [
    { at: uploadAt, step: "upload" },
    { at: formAt, step: "form" },
    { at: revealAt, step: "reveal" },
    { at: RELEASE_AT_MS, step: "release" },
  ];
}

/** No piano this card: the logo + text appear alone (at 0.7 s, or now if later), the engine is handed back. */
export function textOnlySchedule(nowMs: number): PianoEvent[] {
  return [{ at: Math.max(REVEAL_AT_MS, Math.min(nowMs, LATEST_REVEAL_MS)), step: "reveal" }, { at: RELEASE_AT_MS, step: "release" }];
}

/** True when this step is legal at card time t (the runtime guard). */
export function stepAllowed(step: PianoStep, tMs: number): boolean {
  // the release only ever REMOVES work; the reveal is CSS only
  if (step === "release" || step === "reveal") return true;
  return engineWorkAllowed(tMs);
}
