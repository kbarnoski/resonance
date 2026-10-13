/**
 * OFFLINE EXPORT MODE (?export=1) — set only by scripts/export-journey.mjs
 * (docs/export-4k.md), which renders a journey frame-by-frame on a virtual
 * clock. Kept in sessionStorage like the lab flag (the kiosk loop's
 * navigations drop the query). Never on for a real viewer.
 *
 * What it changes (render QUALITY only, never the composition): the
 * realtime performance ceilings — shader DPR ceiling, the 6.5 Mpx imagery
 * ceiling, the 45/30 fps imagery/parallax draw caps — are lifted, since an
 * offline render has all the time it needs per frame.
 */
let cached: boolean | null = null;

export function isExportMode(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") return false;
  let on = false;
  try {
    if (new URLSearchParams(window.location.search).get("export") === "1") {
      window.sessionStorage.setItem("resonance-export", "1");
    }
    on = window.sessionStorage.getItem("resonance-export") === "1";
  } catch {
    on = false;
  }
  cached = on;
  return on;
}

/** Test hook. */
export function resetExportModeCache(): void {
  cached = null;
}
