// LIVE HANDOVER (Karel 2026-10-16: "yeah def want that smoothness" — live mode
// must never feel like a slideshow when the world changes). The flight log:
// a live world's first still landed a median 10.2 s after the change (the
// loop: 1.6 s) — the solo-hold gate counted the OLD world's fading still as
// the one on screen and held the new one back, while the old stills were gone
// after their 8 s boundary fade. In live mode (only — the loop and the
// mastered journeys are untouched):
//  - the new world's FIRST still lands as a handover (past the soft gates, like
//    a morph cover), right after the 1.5 s handoff holdoff;
//  - the old world's stills fade over 16 s, so they drift UNDER the new world —
//    the two worlds blend instead of swapping.
let active = false;
export function setLiveHandover(on: boolean): void {
  active = on;
}
export function liveHandover(): boolean {
  return active;
}
export const LIVE_BOUNDARY_FADEOUT_MS = 16_000;
