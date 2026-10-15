/**
 * A set's total running time for the phone remote (Karel 2026-10-15: "each set
 * should show total set time in ui by set name"). Summed from the kiosk's
 * programs[].journeys[].dur (seconds); a missing duration sums what is known
 * and marks the total approximate ("~").
 */
export function formatRunTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function setRunTime(journeys: ReadonlyArray<{ dur?: number | null }> | null | undefined): string | null {
  if (!journeys || journeys.length === 0) return null;
  let total = 0;
  let missing = false;
  for (const j of journeys) {
    if (typeof j.dur === "number" && Number.isFinite(j.dur) && j.dur > 0) total += j.dur;
    else missing = true;
  }
  if (total <= 0) return null;
  return `${missing ? "~" : ""}${formatRunTime(total)}`;
}
