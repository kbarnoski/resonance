// LIVE SET DRIVE (Karel 2026-10-16, the Joseph set: "up the intensity of the
// reactivity another level without overdoing it? it has a lot of beats and want
// those to hit and sync"). While a live set plays, every world answers the SET'S
// music, not its own track's vibe tier: the response is at least the groove
// tier, one notch up (x1.25, capped at 3.0 — just past "big & intense"), and the
// clock-rate slew is 1.5x quicker (~270 ms, was ~400 ms) so a surge lands ON the
// beat. 2026-10-16 round 2 ("the repeated brightening strobe effect is not good.
// the normal loop effect of brightness was good"): the lift now reaches ONLY the
// speed range + particle react (kinetic.ts motionResponse) — the drive level that
// shaders read as u_amplitude stays at the loop's. Motion only, never luminance; the per-shader calm gains, the uniform slew
// limits and the release decay are all unchanged — it swells harder, never jitters.

let active = false;

export function setLiveSetDrive(on: boolean): void {
  active = on;
}
export function liveSetDriveActive(): boolean {
  return active;
}

export const LIVE_SET_RESPONSE_FLOOR = 2.0; // the groove tier
export const LIVE_SET_RESPONSE_STEP = 1.25;
export const LIVE_SET_RESPONSE_MAX = 3.0;
export const LIVE_SET_RATE_SMOOTH_X = 1.5;

/** A world's response multiplier while a live set drives it. */
export function liveSetResponse(own: number): number {
  return Math.min(LIVE_SET_RESPONSE_MAX, Math.max(own, LIVE_SET_RESPONSE_FLOOR) * LIVE_SET_RESPONSE_STEP);
}
