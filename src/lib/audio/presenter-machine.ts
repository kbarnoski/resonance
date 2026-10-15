/**
 * PRESENTER — "song by song" playback for the kiosk loop (Karel 2026-10-13,
 * for Tramokyo Thu 2026-10-15: "a set list that allows me to play a track and
 * when it completes it transitions to the title screen and holds … or it
 * could just stay on the ending and proceed smoothly directly to the next
 * track … so i can present 1 song at a time, speak, then play"; refined to
 * "autoplay within whatever set is selected versus song by song manual").
 *
 * Pure reducer — no DOM, no timers. The loop client feeds it events (phone
 * commands + track lifecycle) and performs the EFFECT it returns:
 *
 *   advance   the loop's own hand-off (breath → next journey / credits) —
 *             auto-play with nothing cued and the set unchanged: exactly
 *             today's behaviour.
 *   hold      song by song: the track ended (or faded out) — do NOT advance.
 *             on "ending": the journey's last moment stays alive (closing
 *             emblem settled, particles breathing, shaders on their steady
 *             clock, audio silent). on "title": the statement card holds.
 *   go        move to `target` through the normal journey boundary (the
 *             loop's jump path). `fadeCurrent` = the current track is still
 *             sounding: fade it out first.
 *   fade-out  ramp the music out gracefully, then report "fade-complete".
 *   none      nothing to do (e.g. a natural end while a go is in flight).
 *
 * Auto-play stays the default; with playback "auto", nothing cued and no
 * set chosen away from the playing one, every event maps to the loop's
 * existing behaviour.
 */

export type Playback = "auto" | "manual";
export type HoldOn = "ending" | "title";
export type PresenterStatus = "idle" | "playing" | "fading" | "holding" | "going";

/** A journey within a specific program (journeys can live in several sets). */
export interface PresenterRef {
  journeyId: string;
  programId: string;
}

export interface PresenterState {
  playback: Playback;
  holdOn: HoldOn;
  /** The set NEXT / auto-play move through ("Playing from"). null = follow the program playing. */
  setId: string | null;
  /** What NEXT plays (tapped from the phone). null = the next track of the set. */
  cued: PresenterRef | null;
  /** What is (or was last) on screen. */
  current: PresenterRef | null;
  status: PresenterStatus;
}

export type PresenterEvent =
  | { type: "set-playback"; playback: Playback }
  | { type: "set-hold-on"; holdOn: HoldOn }
  | { type: "set-set"; setId: string }
  | { type: "cue"; ref: PresenterRef }
  | { type: "clear-cue" }
  | { type: "next" }
  | { type: "play-now"; ref: PresenterRef }
  | { type: "replay" }
  | { type: "fade-out" }
  | { type: "skip" }
  | { type: "track-started"; ref: PresenterRef }
  | { type: "track-ended" }
  | { type: "fade-complete" }
  /** page (re)loaded: `holding` = it opens on a held title card; otherwise a set start is under way */
  | { type: "boot"; holding: boolean }
  /** a go could not resolve its target: back to what was on screen */
  | { type: "go-failed"; playing: boolean };

export type PresenterEffect =
  | { kind: "none" }
  | { kind: "advance" }
  | { kind: "hold"; on: HoldOn }
  | { kind: "go"; target: PresenterRef; fadeCurrent: boolean }
  | { kind: "fade-out"; ms: number };

/** The sets the presenter can move through: program id → journey ids in order. */
export type PresenterSets = ReadonlyArray<{ id: string; journeyIds: readonly string[] }>;

/** "Fade out now": a graceful music fade (the visuals settle under it). */
export const PRESENTER_FADE_OUT_MS = 7_000;
/** NEXT mid-song: the outgoing track's fade before the boundary. */
export const PRESENTER_NEXT_FADE_MS = 2_500;
/** From a held (already silent) ending: a short beat to warm the next track. */
export const PRESENTER_GO_BEAT_MS = 1_500;

export const PRESENTER_STORAGE_KEY = "resonance-presenter-v1";

export const INITIAL_PRESENTER: PresenterState = {
  playback: "auto",
  holdOn: "ending",
  setId: null,
  cued: null,
  current: null,
  status: "idle",
};

const NONE: PresenterEffect = { kind: "none" };

const sameRef = (a: PresenterRef | null, b: PresenterRef | null) =>
  !!a && !!b && a.journeyId === b.journeyId && a.programId === b.programId;

/**
 * The next track of the chosen set after `current`. If the current journey
 * sits in that set, the one after it (wrapping to the set's first track);
 * otherwise the set's first track. null when nothing resolves.
 */
export function nextInSet(sets: PresenterSets, setId: string | null, current: PresenterRef | null): PresenterRef | null {
  const id = setId ?? current?.programId ?? null;
  const set = sets.find((s) => s.id === id) ?? null;
  if (!set || set.journeyIds.length === 0) return null;
  const at = current ? set.journeyIds.indexOf(current.journeyId) : -1;
  const ni = at < 0 ? 0 : (at + 1) % set.journeyIds.length;
  return { journeyId: set.journeyIds[ni], programId: set.id };
}

/** What NEXT would play right now (the phone's "Up next" / "Ready"). */
export function peekNext(state: PresenterState, sets: PresenterSets): PresenterRef | null {
  return state.cued ?? nextInSet(sets, state.setId, state.current);
}

/** Auto-play at a track's end: a cue or a chosen set (other than the one playing) overrides the loop's own advance. */
function autoTarget(state: PresenterState, sets: PresenterSets): PresenterRef | null {
  if (state.cued) return state.cued;
  if (state.setId && state.current && state.setId !== state.current.programId) {
    return nextInSet(sets, state.setId, state.current);
  }
  return null;
}

function go(state: PresenterState, target: PresenterRef | null, fadeCurrent: boolean, keepCue = false): { state: PresenterState; effect: PresenterEffect } {
  if (!target) return { state, effect: NONE };
  return {
    state: { ...state, cued: keepCue ? state.cued : null, status: "going" },
    effect: { kind: "go", target, fadeCurrent },
  };
}

/** A track finished (naturally, by failure, or by a completed fade-out). */
function ended(state: PresenterState, sets: PresenterSets): { state: PresenterState; effect: PresenterEffect } {
  if (state.status === "going" || state.status === "holding") return { state, effect: NONE };
  if (state.playback === "manual") {
    return { state: { ...state, status: "holding" }, effect: { kind: "hold", on: state.holdOn } };
  }
  const t = autoTarget(state, sets);
  if (t) return go(state, t, false);
  return { state: { ...state, status: "going" }, effect: { kind: "advance" } };
}

export function presenterReduce(
  state: PresenterState,
  event: PresenterEvent,
  sets: PresenterSets,
): { state: PresenterState; effect: PresenterEffect } {
  switch (event.type) {
    case "set-playback": {
      const next = { ...state, playback: event.playback };
      // switching to auto while holding = continue after a short beat
      if (event.playback === "auto" && state.status === "holding") {
        const t = autoTarget(next, sets);
        if (t) return go(next, t, false);
        return { state: { ...next, status: "going" }, effect: { kind: "advance" } };
      }
      return { state: next, effect: NONE };
    }
    case "set-hold-on":
      return { state: { ...state, holdOn: event.holdOn }, effect: NONE };
    case "set-set":
      // choosing a set clears a pick from another set (the phone: "Choose a set" → its next track)
      return { state: { ...state, setId: event.setId, cued: state.cued?.programId === event.setId ? state.cued : null }, effect: NONE };
    case "cue":
      return { state: { ...state, cued: event.ref }, effect: NONE };
    case "clear-cue":
      return { state: { ...state, cued: null }, effect: NONE };
    case "play-now":
      // A TAPPED TRACK ALWAYS PLAYS NOW (Karel 2026-10-15, show day: "if i
      // open a set list and click a track it should move to that track and
      // start playing … should work from touching any track at any time"):
      // from playing, holding, fading, mid-go or idle; the outgoing song fades
      // first, and the set then auto-plays on from the tapped track.
      return go(
        { ...state, playback: "auto", setId: event.ref.programId, cued: null },
        event.ref,
        state.status === "playing" || state.status === "fading",
      );
    case "next":
      return go(state, peekNext(state, sets), state.status === "playing" || state.status === "fading");
    case "replay":
      return go(state, state.current, state.status === "playing" || state.status === "fading", true);
    case "skip":
      // the existing Next ▶ / arrow key: song by song → NEXT; auto → the
      // loop's own skip unless a cue / chosen set redirects it
      if (state.playback === "manual") return presenterReduce(state, { type: "next" }, sets);
      {
        const t = autoTarget(state, sets);
        if (t) return go(state, t, state.status === "playing" || state.status === "fading");
        return { state: { ...state, status: "going" }, effect: { kind: "advance" } };
      }
    case "fade-out":
      if (state.status !== "playing") return { state, effect: NONE };
      // fading out always lands in a hold — so it switches to song by song
      return {
        state: { ...state, playback: "manual", status: "fading" },
        effect: { kind: "fade-out", ms: PRESENTER_FADE_OUT_MS },
      };
    case "fade-complete":
      if (state.status !== "fading") return { state, effect: NONE };
      return ended(state, sets);
    case "track-ended":
      return ended(state, sets);
    case "boot":
      return { state: { ...state, status: event.holding ? "holding" : "going" }, effect: NONE };
    case "go-failed":
      if (state.status !== "going") return { state, effect: NONE };
      return { state: { ...state, status: event.playing ? "playing" : state.current ? "holding" : "idle" }, effect: NONE };
    case "track-started":
      return {
        state: {
          ...state,
          current: event.ref,
          setId: event.ref.programId,
          cued: sameRef(state.cued, event.ref) ? null : state.cued,
          status: "playing",
        },
        effect: NONE,
      };
  }
}

// ─── Persistence (kiosk reloads keep the mode + the cue) ──────────────────

export function serializePresenter(s: PresenterState): string {
  const { playback, holdOn, setId, cued, current } = s;
  // held: the track on screen had ended / was fading out (a reload resumes AFTER it)
  const held = s.status === "holding" || s.status === "fading";
  return JSON.stringify({ playback, holdOn, setId, cued, current, held });
}

const isRef = (x: unknown): x is PresenterRef =>
  !!x && typeof x === "object" &&
  typeof (x as PresenterRef).journeyId === "string" && (x as PresenterRef).journeyId.length > 0 &&
  typeof (x as PresenterRef).programId === "string" && (x as PresenterRef).programId.length > 0;

/**
 * Restore after a reload: the mode, the hold setting, the set and the cue.
 * A reload NEVER comes back holding (show day 2026-10-15: a deploy reload in
 * song-by-song mode reopened on "Title card — HOLDING (press Start)" and sat
 * black until recovered by hand). Song by song resumes PLAYING at its set
 * position instead (bootResume); auto-play runs the loop exactly as today.
 */
export function restorePresenter(raw: string | null | undefined): PresenterState {
  if (!raw) return INITIAL_PRESENTER;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const playback: Playback = o.playback === "manual" ? "manual" : "auto";
    const holdOn: HoldOn = o.holdOn === "title" ? "title" : "ending";
    const setId = typeof o.setId === "string" && o.setId ? o.setId : null;
    const cued = isRef(o.cued) ? o.cued : null;
    const current = isRef(o.current) ? o.current : null;
    // never "holding": the loop's "boot" event sets the truth at once (a set
    // start under way, or a title card held ONLY by an explicit ?titlehold=1)
    return { playback, holdOn, setId, cued, current, status: "idle" };
  } catch {
    return INITIAL_PRESENTER;
  }
}

/**
 * Where a RELOADED kiosk resumes (instead of holding on the title card):
 * song by song with a track on screen → the cued track if any, else the
 * track after it when it had ended / was fading out, else that track again.
 * null = the loop's normal start (auto-play, nothing persisted, an explicit
 * ?start= on the URL, or a position no longer in the sets).
 */
export function bootResume(raw: string | null | undefined, sets: PresenterSets, hasStart: boolean): PresenterRef | null {
  if (hasStart || !raw) return null;
  const s = restorePresenter(raw);
  if (s.playback !== "manual" || !s.current) return null;
  let held = false;
  try { held = (JSON.parse(raw) as { held?: unknown }).held === true; } catch { /* restorePresenter handled it */ }
  const inSets = (r: PresenterRef | null) =>
    !!r && sets.some((x) => x.id === r.programId && x.journeyIds.includes(r.journeyId));
  if (inSets(s.cued)) return s.cued;
  const t = held ? nextInSet(sets, s.current.programId, s.current) : s.current;
  return inSets(t) ? t : null;
}

/** Parse a phone command into a presenter event (null = not a presenter command). */
export function parsePresenterCommand(cmd: string): PresenterEvent | null {
  const ref = (s: string): PresenterRef | null => {
    const [journeyId, programId] = s.split("@");
    return journeyId && programId ? { journeyId, programId } : null;
  };
  if (cmd === "playback:auto" || cmd === "playback:manual") return { type: "set-playback", playback: cmd === "playback:auto" ? "auto" : "manual" };
  if (cmd === "holdon:ending" || cmd === "holdon:title") return { type: "set-hold-on", holdOn: cmd === "holdon:title" ? "title" : "ending" };
  if (cmd.startsWith("set:") && cmd.length > 4) return { type: "set-set", setId: cmd.slice(4) };
  if (cmd === "cue:clear") return { type: "clear-cue" };
  if (cmd.startsWith("cue:")) { const r = ref(cmd.slice(4)); return r ? { type: "cue", ref: r } : null; }
  if (cmd.startsWith("playnow:")) { const r = ref(cmd.slice(8)); return r ? { type: "play-now", ref: r } : null; }
  if (cmd === "next") return { type: "next" };
  if (cmd === "replay") return { type: "replay" };
  if (cmd === "fadeout") return { type: "fade-out" };
  return null;
}
