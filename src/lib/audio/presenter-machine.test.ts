import { describe, it, expect } from "vitest";
import {
  INITIAL_PRESENTER,
  presenterReduce,
  nextInSet,
  peekNext,
  restorePresenter,
  serializePresenter,
  bootResume,
  parsePresenterCommand,
  PRESENTER_FADE_OUT_MS,
  type PresenterEvent,
  type PresenterState,
  type PresenterSets,
} from "./presenter-machine";

const SETS: PresenterSets = [
  { id: "ra", journeyIds: ["ghost", "first-snow", "first-light", "yellow-bird"] },
  { id: "ml", journeyIds: ["the-first", "yellow-bird", "spectre"] },
];

function run(state: PresenterState, ...events: PresenterEvent[]) {
  let s = state;
  const effects = [];
  for (const e of events) {
    const r = presenterReduce(s, e, SETS);
    s = r.state;
    effects.push(r.effect);
  }
  return { state: s, effects, last: effects[effects.length - 1] };
}

const started = (journeyId: string, programId = "ra"): PresenterEvent => ({ type: "track-started", ref: { journeyId, programId } });

describe("presenter — auto-play (default) is today's loop", () => {
  it("defaults to auto-play, hold on the ending", () => {
    expect(INITIAL_PRESENTER.playback).toBe("auto");
    expect(INITIAL_PRESENTER.holdOn).toBe("ending");
  });
  it("a track end hands off to the loop's own advance", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "track-ended" });
    expect(r.last).toEqual({ kind: "advance" });
  });
  it("the operator skip is the loop's own skip", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "skip" });
    expect(r.last).toEqual({ kind: "advance" });
  });
  it("a cue redirects auto-play's next hand-off, then clears", () => {
    const r = run(
      INITIAL_PRESENTER,
      started("ghost"),
      { type: "cue", ref: { journeyId: "spectre", programId: "ml" } },
      { type: "track-ended" },
    );
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "spectre", programId: "ml" }, fadeCurrent: false });
    expect(r.state.cued).toBeNull();
  });
  it("a chosen set: auto-play moves into it at the track's end", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "set-set", setId: "ml" }, { type: "track-ended" });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "the-first", programId: "ml" }, fadeCurrent: false });
  });
  it("once inside the chosen set, auto-play is the loop's own advance again", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "set-set", setId: "ml" }, { type: "track-ended" }, started("the-first", "ml"), { type: "track-ended" });
    expect(r.state.setId).toBe("ml");
    expect(r.last).toEqual({ kind: "advance" });
  });
});

describe("presenter — song by song", () => {
  const manual = run(INITIAL_PRESENTER, { type: "set-playback", playback: "manual" }, started("first-snow")).state;

  it("holds on the ending — never auto-advances", () => {
    const r = run(manual, { type: "track-ended" });
    expect(r.last).toEqual({ kind: "hold", on: "ending" });
    expect(r.state.status).toBe("holding");
    // repeated end signals (ended event + tick + bg tick) never advance
    const again = run(r.state, { type: "track-ended" }, { type: "track-ended" });
    expect(again.effects).toEqual([{ kind: "none" }, { kind: "none" }]);
  });
  it("hold on the title card when set", () => {
    const r = run(manual, { type: "set-hold-on", holdOn: "title" }, { type: "track-ended" });
    expect(r.last).toEqual({ kind: "hold", on: "title" });
  });
  it("NEXT from the hold plays the next track of the set, no fade", () => {
    const r = run(manual, { type: "track-ended" }, { type: "next" });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "first-light", programId: "ra" }, fadeCurrent: false });
    expect(r.state.status).toBe("going");
  });
  it("a natural end while a go is in flight does nothing", () => {
    const r = run(manual, { type: "next" }, { type: "track-ended" });
    expect(r.last).toEqual({ kind: "none" });
  });
  it("cue then NEXT plays the cued track; the cue clears on start", () => {
    const cue = { journeyId: "spectre", programId: "ml" };
    const r = run(manual, { type: "cue", ref: cue }, { type: "track-ended" });
    expect(peekNext(r.state, SETS)).toEqual(cue);
    const g = run(r.state, { type: "next" });
    expect(g.last).toEqual({ kind: "go", target: cue, fadeCurrent: false });
    const s = run(g.state, started("spectre", "ml"));
    expect(s.state.cued).toBeNull();
    expect(s.state.setId).toBe("ml");
    expect(s.state.status).toBe("playing");
  });
  it("cueing ahead during a track: it still plays to its end and holds", () => {
    const r = run(manual, { type: "cue", ref: { journeyId: "spectre", programId: "ml" } }, { type: "track-ended" });
    expect(r.last).toEqual({ kind: "hold", on: "ending" });
    expect(r.state.cued).toEqual({ journeyId: "spectre", programId: "ml" });
  });
  it("NEXT mid-song fades the current one out first", () => {
    const r = run(manual, { type: "next" });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "first-light", programId: "ra" }, fadeCurrent: true });
  });
  it("play now = go at once (fading the playing song), then auto-play on from it", () => {
    const r = run(manual, { type: "play-now", ref: { journeyId: "yellow-bird", programId: "ml" } });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "yellow-bird", programId: "ml" }, fadeCurrent: true });
    expect(r.state.playback).toBe("auto");
    expect(r.state.setId).toBe("ml");
  });
  it("replay goes back into the held journey and keeps the cue", () => {
    const r = run(manual, { type: "cue", ref: { journeyId: "spectre", programId: "ml" } }, { type: "track-ended" }, { type: "replay" });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "first-snow", programId: "ra" }, fadeCurrent: false });
    expect(r.state.cued).toEqual({ journeyId: "spectre", programId: "ml" });
  });
  it("the operator skip is NEXT", () => {
    const r = run(manual, { type: "skip" });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "first-light", programId: "ra" }, fadeCurrent: true });
  });
  it("NEXT on the set's last track wraps to its first", () => {
    const r = run(manual, started("yellow-bird"), { type: "track-ended" }, { type: "next" });
    expect(r.last).toEqual({ kind: "go", target: { journeyId: "ghost", programId: "ra" }, fadeCurrent: false });
  });
  it("switching to auto-play while holding continues to the next track", () => {
    const r = run(manual, { type: "track-ended" }, { type: "set-playback", playback: "auto" });
    expect(r.last).toEqual({ kind: "advance" });
    const c = run(manual, { type: "cue", ref: { journeyId: "spectre", programId: "ml" } }, { type: "track-ended" }, { type: "set-playback", playback: "auto" });
    expect(c.last).toEqual({ kind: "go", target: { journeyId: "spectre", programId: "ml" }, fadeCurrent: false });
  });
  it("switching to auto-play mid-track applies at once and the track then advances", () => {
    // lab 2026-10-13: playback:auto sent while playing
    const r = run(manual, { type: "set-playback", playback: "auto" });
    expect(r.last).toEqual({ kind: "none" });
    expect(r.state.playback).toBe("auto");
    expect(r.state.status).toBe("playing");
    expect(JSON.parse(serializePresenter(r.state)).playback).toBe("auto");
    expect(run(r.state, { type: "track-ended" }).last).toEqual({ kind: "advance" });
    // and via the phone command
    const cmd = parsePresenterCommand("playback:auto")!;
    expect(presenterReduce(manual, cmd, SETS).state.playback).toBe("auto");
  });
  it("switching to song by song mid-track changes nothing until it ends", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "set-playback", playback: "manual" });
    expect(r.last).toEqual({ kind: "none" });
    expect(run(r.state, { type: "track-ended" }).last).toEqual({ kind: "hold", on: "ending" });
  });
});

describe("presenter — fade out now", () => {
  it("fades the playing track gracefully, then holds", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "fade-out" });
    expect(r.last).toEqual({ kind: "fade-out", ms: PRESENTER_FADE_OUT_MS });
    expect(r.state.playback).toBe("manual");
    expect(r.state.status).toBe("fading");
    const done = run(r.state, { type: "fade-complete" });
    expect(done.last).toEqual({ kind: "hold", on: "ending" });
  });
  it("a natural end during the fade holds once", () => {
    const r = run(INITIAL_PRESENTER, started("ghost"), { type: "fade-out" }, { type: "track-ended" }, { type: "fade-complete" });
    expect(r.effects.slice(-2)).toEqual([{ kind: "hold", on: "ending" }, { kind: "none" }]);
  });
  it("is ignored unless a track is playing", () => {
    expect(run(INITIAL_PRESENTER, { type: "fade-out" }).last).toEqual({ kind: "none" });
  });
});

describe("presenter — sets", () => {
  it("choosing a set clears a pick from another set, keeps one inside it", () => {
    const cue = (journeyId: string, programId: string): PresenterEvent => ({ type: "cue", ref: { journeyId, programId } });
    expect(run(INITIAL_PRESENTER, cue("spectre", "ml"), { type: "set-set", setId: "ra" }).state.cued).toBeNull();
    expect(run(INITIAL_PRESENTER, cue("spectre", "ml"), { type: "set-set", setId: "ml" }).state.cued).toEqual({ journeyId: "spectre", programId: "ml" });
    // the phone's pick from another set: set first, then the cue
    expect(run(INITIAL_PRESENTER, { type: "set-set", setId: "ml" }, cue("spectre", "ml")).state).toMatchObject({ setId: "ml", cued: { journeyId: "spectre" } });
  });
  it("nextInSet follows the current journey inside the chosen set, else starts it", () => {
    expect(nextInSet(SETS, "ml", { journeyId: "yellow-bird", programId: "ra" })).toEqual({ journeyId: "spectre", programId: "ml" });
    expect(nextInSet(SETS, "ml", { journeyId: "ghost", programId: "ra" })).toEqual({ journeyId: "the-first", programId: "ml" });
    expect(nextInSet(SETS, null, { journeyId: "ghost", programId: "ra" })).toEqual({ journeyId: "first-snow", programId: "ra" });
    expect(nextInSet(SETS, "missing", null)).toBeNull();
  });
});

// Lab 2026-10-13 (mode matrix steps 9–13): "going" stuck after Next from the
// title hold; "idle" while playing after live→loop. The phone shows the truth.
describe("presenter — status is always the truth", () => {
  const manual = run(INITIAL_PRESENTER, { type: "set-playback", playback: "manual" }, started("first-snow")).state;

  it("boot: a held card reads holding; a set start reads going until the music starts", () => {
    expect(run(INITIAL_PRESENTER, { type: "boot", holding: false }).state.status).toBe("going");
    const back = restorePresenter(serializePresenter(manual));
    expect(back.status).toBe("idle"); // a reload alone never holds
    expect(run(back, { type: "boot", holding: true }).state.status).toBe("holding");
    // then the pre-start (music begins) → playing
    expect(run(INITIAL_PRESENTER, { type: "boot", holding: false }, started("ghost")).state.status).toBe("playing");
  });
  it("Next from the held title card: going only until the track starts", () => {
    const r = run(restorePresenter(serializePresenter(manual)), { type: "boot", holding: true }, { type: "next" });
    expect(r.state.status).toBe("going");
    const p = run(r.state, started("first-light"));
    expect(p.state.status).toBe("playing");
    expect(p.state.current).toEqual({ journeyId: "first-light", programId: "ra" });
  });
  it("auto after a reload: never idle once a track has started", () => {
    const back = restorePresenter(serializePresenter(run(INITIAL_PRESENTER, started("ghost")).state));
    expect(back.status).toBe("idle");
    const r = run(back, { type: "boot", holding: false }, started("first-snow"));
    expect(r.state.status).toBe("playing");
  });
  it("auto hand-off: going through the end, playing at the next track (every time)", () => {
    let s = run(INITIAL_PRESENTER, started("ghost")).state;
    for (const next of ["first-snow", "first-light", "yellow-bird"]) {
      const e = run(s, { type: "track-ended" });
      expect(e.state.status).toBe("going");
      s = run(e.state, started(next)).state;
      expect(s.status).toBe("playing");
    }
  });
  it("a go whose target vanished falls back to what is on screen", () => {
    const g = run(manual, { type: "track-ended" }, { type: "next" });
    expect(run(g.state, { type: "go-failed", playing: false }).state.status).toBe("holding");
    const m = run(manual, { type: "next" });
    expect(run(m.state, { type: "go-failed", playing: true }).state.status).toBe("playing");
    expect(run(manual, { type: "go-failed", playing: false }).last).toEqual({ kind: "none" });
  });
  it("restore: song by song with nothing shown yet is not 'holding'", () => {
    expect(restorePresenter(JSON.stringify({ playback: "manual" })).status).toBe("idle");
  });
});

describe("presenter — persistence", () => {
  it("round-trips mode, hold setting, set, cue and current", () => {
    const s = run(
      INITIAL_PRESENTER,
      { type: "set-playback", playback: "manual" },
      { type: "set-hold-on", holdOn: "title" },
      started("first-snow"),
      { type: "cue", ref: { journeyId: "spectre", programId: "ml" } },
    ).state;
    const back = restorePresenter(serializePresenter(s));
    // a reload never comes back holding (show day 2026-10-15) — bootResume plays on
    expect(back).toEqual({ ...s, status: "idle" });
  });
  it("auto-play restores idle (the loop runs as today)", () => {
    expect(restorePresenter(serializePresenter(INITIAL_PRESENTER))).toEqual(INITIAL_PRESENTER);
  });
  it("garbage restores the default", () => {
    expect(restorePresenter("{nope")).toEqual(INITIAL_PRESENTER);
    expect(restorePresenter(null)).toEqual(INITIAL_PRESENTER);
    expect(restorePresenter(JSON.stringify({ playback: "manual", cued: { journeyId: "" } })).cued).toBeNull();
  });
});

describe("presenter — phone commands", () => {
  it("parses the protocol", () => {
    expect(parsePresenterCommand("playback:manual")).toEqual({ type: "set-playback", playback: "manual" });
    expect(parsePresenterCommand("holdon:title")).toEqual({ type: "set-hold-on", holdOn: "title" });
    expect(parsePresenterCommand("set:tramokyo-mix-4")).toEqual({ type: "set-set", setId: "tramokyo-mix-4" });
    expect(parsePresenterCommand("cue:ghost@tramokyo-mix")).toEqual({ type: "cue", ref: { journeyId: "ghost", programId: "tramokyo-mix" } });
    expect(parsePresenterCommand("cue:clear")).toEqual({ type: "clear-cue" });
    expect(parsePresenterCommand("playnow:ghost@tramokyo-mix")).toEqual({ type: "play-now", ref: { journeyId: "ghost", programId: "tramokyo-mix" } });
    expect(parsePresenterCommand("next")).toEqual({ type: "next" });
    expect(parsePresenterCommand("replay")).toEqual({ type: "replay" });
    expect(parsePresenterCommand("fadeout")).toEqual({ type: "fade-out" });
    expect(parsePresenterCommand("cue:ghost")).toBeNull();
    expect(parsePresenterCommand("skip")).toBeNull();
  });
});

// Show day 2026-10-15 (Karel): "clicking between tracks in the remote currently
// resulted in a black screen … if i open a set list and click a track it should
// move to that track and start playing. i shouldnt have to go to main view and
// click the next button. should work from touching any track at any time."
describe("presenter — a tapped track always plays", () => {
  const tap = (journeyId: string, programId: string): PresenterEvent => ({ type: "play-now", ref: { journeyId, programId } });
  const target = { journeyId: "spectre", programId: "ml" };
  const manual = run(INITIAL_PRESENTER, { type: "set-playback", playback: "manual" }, started("first-snow")).state;

  it("from a held ending (song by song): plays, and the set auto-plays on", () => {
    const held = run(manual, { type: "track-ended" });
    expect(held.state.status).toBe("holding");
    const r = run(held.state, tap("spectre", "ml"));
    expect(r.last).toEqual({ kind: "go", target, fadeCurrent: false });
    expect(r.state).toMatchObject({ status: "going", playback: "auto", setId: "ml", cued: null });
    // the tapped track starts → playing; at its end the set goes on (no hold)
    const p = run(r.state, started("spectre", "ml"));
    expect(p.state.status).toBe("playing");
    expect(run(p.state, { type: "track-ended" }).last).toEqual({ kind: "advance" });
  });
  it("from the held title card after a boot hold: plays", () => {
    const booted = run(restorePresenter(serializePresenter(manual)), { type: "boot", holding: true }).state;
    expect(run(booted, tap("spectre", "ml")).last).toEqual({ kind: "go", target, fadeCurrent: false });
  });
  it("in song-by-song mode mid-song: fades the playing one and plays (no NEXT press)", () => {
    const r = run(manual, tap("spectre", "ml"));
    expect(r.last).toEqual({ kind: "go", target, fadeCurrent: true });
    expect(r.state.playback).toBe("auto");
  });
  it("in auto-play mid-song: fades and plays", () => {
    const s = run(INITIAL_PRESENTER, started("ghost")).state;
    expect(run(s, tap("spectre", "ml")).last).toEqual({ kind: "go", target, fadeCurrent: true });
  });
  it("during a fade-out: plays (the fade becomes the hand-off)", () => {
    const f = run(manual, { type: "fade-out" });
    expect(f.state.status).toBe("fading");
    const r = run(f.state, tap("spectre", "ml"));
    expect(r.last).toEqual({ kind: "go", target, fadeCurrent: true });
    // the superseded fade's completion changes nothing
    expect(run(r.state, { type: "fade-complete" }).last).toEqual({ kind: "none" });
  });
  it("mid-transition (a go in flight): the newest tap wins", () => {
    const g = run(manual, { type: "next" });
    expect(g.state.status).toBe("going");
    const r = run(g.state, tap("spectre", "ml"));
    expect(r.last).toEqual({ kind: "go", target, fadeCurrent: false });
    expect(run(r.state, started("spectre", "ml")).state.current).toEqual(target);
  });
  it("at boot / idle / during credits (advance in flight): plays", () => {
    expect(run(INITIAL_PRESENTER, tap("spectre", "ml")).last).toEqual({ kind: "go", target, fadeCurrent: false });
    const adv = run(INITIAL_PRESENTER, started("ghost"), { type: "track-ended" });
    expect(adv.last).toEqual({ kind: "advance" });
    expect(run(adv.state, tap("spectre", "ml")).last).toEqual({ kind: "go", target, fadeCurrent: false });
  });
  it("the same track again: replays it", () => {
    expect(run(manual, tap("first-snow", "ra")).last).toEqual({ kind: "go", target: { journeyId: "first-snow", programId: "ra" }, fadeCurrent: true });
  });
  it("a stale cue never survives a tap", () => {
    const s = run(manual, { type: "cue", ref: { journeyId: "ghost", programId: "ra" } }).state;
    const r = run(s, tap("spectre", "ml"));
    expect(r.state.cued).toBeNull();
    expect(peekNext(run(r.state, started("spectre", "ml")).state, SETS)).toEqual({ journeyId: "the-first", programId: "ml" });
  });
});

describe("presenter — a reload never strands the show on the title card", () => {
  const manual = run(INITIAL_PRESENTER, { type: "set-playback", playback: "manual" }, started("first-snow")).state;

  it("manual + a cued track: restores idle (not holding) and resumes AT the cue", () => {
    const s = run(manual, { type: "cue", ref: { journeyId: "spectre", programId: "ml" } }).state;
    const raw = serializePresenter(s);
    expect(restorePresenter(raw).status).toBe("idle");
    expect(bootResume(raw, SETS, false)).toEqual({ journeyId: "spectre", programId: "ml" });
  });
  it("manual mid-song: resumes that song", () => {
    expect(bootResume(serializePresenter(manual), SETS, false)).toEqual({ journeyId: "first-snow", programId: "ra" });
  });
  it("manual held on an ending (or fading out): resumes at the NEXT track of the set", () => {
    const held = run(manual, { type: "track-ended" }).state;
    expect(bootResume(serializePresenter(held), SETS, false)).toEqual({ journeyId: "first-light", programId: "ra" });
    const fading = run(manual, { type: "fade-out" }).state;
    expect(bootResume(serializePresenter(fading), SETS, false)).toEqual({ journeyId: "first-light", programId: "ra" });
  });
  it("auto-play, an explicit ?start=, nothing stored, or a vanished track: the loop's normal start", () => {
    expect(bootResume(serializePresenter(run(INITIAL_PRESENTER, started("ghost")).state), SETS, false)).toBeNull();
    expect(bootResume(serializePresenter(manual), SETS, true)).toBeNull();
    expect(bootResume(null, SETS, false)).toBeNull();
    expect(bootResume("{nope", SETS, false)).toBeNull();
    const gone = run(INITIAL_PRESENTER, { type: "set-playback", playback: "manual" }, started("deleted", "ra")).state;
    expect(bootResume(serializePresenter(gone), SETS, false)).toBeNull();
  });
  it("a resumed set plays from boot (going), not holding", () => {
    const back = restorePresenter(serializePresenter(run(manual, { type: "track-ended" }).state));
    const r = run(back, { type: "boot", holding: false }, started("first-light"));
    expect(r.state.status).toBe("playing");
  });
});
