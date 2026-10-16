// TITLES BETWEEN TRACKS (Karel 2026-10-16: "a feature on the phone UI to
// show/hide titling between tracks … maybe it's simply hiding the text and
// everything else is good"). Hidden = the track-name card never paints; every
// timing (the handoff, the first track's black beat) stays exactly as it is.
// Kiosk-local and persisted, so a reload or a night's run keeps the choice.
// The title screen (piano + RESONANCE) is NOT a track title — never touched.

const KEY = "resonance-kiosk-titles";

export function trackTitlesHidden(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

export function setTrackTitlesHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage.setItem(KEY, "off");
    else window.localStorage.removeItem(KEY);
  } catch { /* storage blocked — titles stay on */ }
}

/** Phone → kiosk: "titles:on" | "titles:off". */
export function parseTitlesCommand(cmd: string): boolean | null {
  if (cmd === "titles:off") return true;
  if (cmd === "titles:on") return false;
  return null;
}
