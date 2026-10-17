// MIC SENSITIVITY (Karel 2026-10-17: "in live mode how do we adjust mic input
// levels?" → a plain Less · Normal · More on the phone). It changes how much
// sound it takes to reach full intensity: the live conductor's span above the
// room's floor (live-pulse.ts). More = a soft voice already builds the scene;
// Less = only strong playing does. Kiosk-local and persisted, like the titles.

export type MicSensitivity = "less" | "normal" | "more";

const KEY = "resonance-kiosk-micsens";
/** × LIVE_CONDUCT_SPAN: the sound above the room needed for full intensity */
const SPAN_X: Record<MicSensitivity, number> = { less: 2, normal: 1, more: 0.45 };

export function micSensitivity(): MicSensitivity {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "less" || v === "more" ? v : "normal";
  } catch {
    return "normal";
  }
}

export function setMicSensitivity(v: MicSensitivity): void {
  try {
    if (v === "normal") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, v);
  } catch { /* storage blocked — stays normal */ }
}

export function micSpanX(v: MicSensitivity): number {
  return SPAN_X[v];
}

/** Phone → kiosk: "micsens:less" | "micsens:normal" | "micsens:more". */
export function parseMicSensitivityCommand(cmd: string): MicSensitivity | null {
  const m = /^micsens:(less|normal|more)$/.exec(cmd);
  return m ? (m[1] as MicSensitivity) : null;
}
