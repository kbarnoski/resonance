// visibility-epoch.ts — "was the page hidden at any point since t?"
// (2026-10-06) When the kiosk window is hidden (another app or Space in
// front, e.g. Karel typing in the terminal), Chrome stops requestAnimationFrame
// while timers keep running. Returning made a giant rAF gap that the flight
// recorder logged as a FRAME-GAP "freeze" (60–245 s) and the particle watchdog
// read as a GPU stall — switching particles off for the whole session.
let lastChange = Number.NEGATIVE_INFINITY;
let started = false;

function start(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  if (typeof document.addEventListener === "function") document.addEventListener("visibilitychange", () => { lastChange = performance.now(); });
}

/** True if the page is hidden now or its visibility changed after `since`
 *  (performance.now() ms) — a rAF gap spanning that is not a stall. */
export function hiddenSince(since: number): boolean {
  start();
  if (typeof document === "undefined") return false;
  return document.visibilityState !== "visible" || lastChange > since;
}

export function ensureVisibilityTracking(): void {
  start();
}
