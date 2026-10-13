/**
 * The phone's OPTIMISTIC presenter state (2026-10-13, Karel: "responsive with
 * professional performance and no delays"). Every tap changes the screen in
 * the same frame; the kiosk's report confirms it a moment later. A pending
 * choice is dropped only when the kiosk CONFIRMS it (then nothing moves) or
 * after PENDING_MAX_MS without confirmation (the kiosk disagrees / never got
 * it — then, and only then, the screen shows the kiosk's truth).
 */

export interface RefLite { journeyId: string; programId: string; name: string }

export interface PresenterReport {
  playback: "auto" | "manual";
  holdOn: "ending" | "title";
  status: "idle" | "playing" | "fading" | "holding" | "going";
  setId: string | null;
  current: RefLite | null;
  cued: RefLite | null;
  next: RefLite | null;
}

export interface Pending {
  playback?: { v: PresenterReport["playback"]; at: number };
  holdOn?: { v: PresenterReport["holdOn"]; at: number };
  setId?: { v: string; at: number };
  cued?: { v: RefLite | null; at: number };
  /** a transport tap (next / replay / fade out): what the screen shows until the kiosk moves */
  action?: { v: "going" | "fading"; at: number; fromStatus: PresenterReport["status"] | null; fromCurrent: string | null };
}

export const PENDING_MAX_MS = 6_000;

const sameRef = (a: RefLite | null | undefined, b: RefLite | null | undefined) =>
  (!a && !b) || (!!a && !!b && a.journeyId === b.journeyId && a.programId === b.programId);

/** Drop what the kiosk has confirmed, or what has waited too long. */
export function reconcile(p: Pending, r: PresenterReport | null, now: number): Pending {
  const out: Pending = {};
  const live = (x: { at: number } | undefined) => !!x && now - x.at < PENDING_MAX_MS;
  if (live(p.playback) && r?.playback !== p.playback!.v) out.playback = p.playback;
  if (live(p.holdOn) && r?.holdOn !== p.holdOn!.v) out.holdOn = p.holdOn;
  if (live(p.setId) && r?.setId !== p.setId!.v) out.setId = p.setId;
  if (live(p.cued) && !sameRef(r?.cued, p.cued!.v)) out.cued = p.cued;
  if (live(p.action)) {
    const a = p.action!;
    const moved = !!r && (r.status !== a.fromStatus || (r.current?.journeyId ?? null) !== a.fromCurrent);
    if (!moved) out.action = a;
  }
  return out;
}

/** What the phone shows: pending choices over the kiosk's report. */
export function mergeView(r: PresenterReport | null, p: Pending, defaults: { setId: string }): {
  playback: PresenterReport["playback"];
  holdOn: PresenterReport["holdOn"];
  status: PresenterReport["status"];
  setId: string;
  cued: RefLite | null;
} {
  return {
    playback: p.playback?.v ?? r?.playback ?? "auto",
    holdOn: p.holdOn?.v ?? r?.holdOn ?? "ending",
    status: p.action?.v ?? r?.status ?? "idle",
    setId: p.setId?.v ?? r?.setId ?? defaults.setId,
    cued: p.cued ? p.cued.v : r?.cued ?? null,
  };
}
