"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reconcile, mergeView, type Pending, type RefLite } from "@/lib/audio/presenter-optimistic";
import { ArrowLeft, ArrowRight, ChevronDown, Play } from "lucide-react";
import { TRAMOKYO_MAIN } from "@/lib/journeys/installation-sequence";
import { Button } from "@/components/ui/button";
import { setRunTime } from "@/lib/audio/set-duration";
import { josephSet } from "@/lib/journeys/joseph-set";

/** Joseph's live set (live-theatre-client.tsx): liveset:joseph@N plays track N now. */
const JOSEPH = josephSet().map((t, i) => ({ n: i + 1, id: t.id, title: t.title, dur: t.duration }));
const JOSEPH_TIME = setRunTime(JOSEPH);

/**
 * PRESENTER — the phone's main screen (Karel 2026-10-13, Tramokyo; design
 * approved "you nailed the design"). Choose the SET to play from, then
 * AUTO-PLAY (the loop, within that set) or SONG BY SONG (each track holds on
 * its ending until NEXT). Kiosk side: presenter-machine.ts + the loop client.
 *
 * Protocol (phone → kiosk, over /api/pack/remote):
 *   playback:auto | playback:manual   auto-play / song by song
 *   holdon:ending | holdon:title      what a held song shows
 *   set:<program id>                  the set NEXT / auto-play move through
 *   cue:<journey id>@<program id>     make a track next ("Ready")
 *   cue:clear
 *   next                              NEXT / PLAY (fades a playing song out first)
 *   playnow:<journey id>@<program id> play it NOW (any state), then auto-play on
 *   replay                            play the held / current track again
 *   fadeout                           fade the song out now, then hold
 */

export interface PresenterRefStatus {
  journeyId: string;
  programId: string;
  name: string;
}

export interface PresenterStatus {
  playback: "auto" | "manual";
  holdOn: "ending" | "title";
  status: "idle" | "playing" | "fading" | "holding" | "going";
  setId: string | null;
  current: PresenterRefStatus | null;
  cued: PresenterRefStatus | null;
  next: PresenterRefStatus | null;
}

export interface PresenterProgram {
  id: string;
  label: string;
  journeys: { id: string; name: string; dur?: number | null }[];
}

/** The sets of the main loop, in loop order, with the phone's names. */
const SET_META: Record<string, { name: string; kind: string; order: string }> = {
  "tramokyo-mix": { name: "Rise Above", kind: "show order", order: "in show order" },
  "tramokyo-mix-4": { name: "March Light", kind: "album", order: "in album order" },
  "tramokyo-mix-3": { name: "Surrounded by Light", kind: "album", order: "in album order" },
  "tramokyo-mix-2": { name: "Welcome Home", kind: "album", order: "in album order" },
  "tramokyo-mix-vigil": { name: "Vigil", kind: "studio session", order: "in session order" },
  "tramokyo-mix-ep": { name: "The Snowflake EP", kind: "EP", order: "in EP order" },
  "tramokyo-mix-exp": { name: "Expansion", kind: "set", order: "in set order" },
  "tramokyo-mix-1b": { name: "Featured journeys", kind: "journeys", order: "in set order" },
};
const SET_IDS = TRAMOKYO_MAIN.sets.map((s) => s.id);
const DEFAULT_SET = SET_IDS[0];

// /remote is operator chrome: Geist Sans titles (medium, tighter tracking),
// Geist Mono uppercase labels (docs/design-system.md: Cormorant is for heroes only)
const title = "font-sans font-medium tracking-tight";
const label = "font-mono text-[11px] uppercase tracking-widest text-ink-faint";

function fmt(sec: number | null | undefined): string {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function setName(id: string | null | undefined, programs: PresenterProgram[]): string {
  if (!id) return SET_META[DEFAULT_SET].name;
  return SET_META[id]?.name ?? programs.find((p) => p.id === id)?.label ?? id;
}

/** "Rise Above · 12 of 43" (+ " · 2:36" when asked). */
function position(ref: { journeyId: string; programId: string } | null, programs: PresenterProgram[], withDur = false): string | null {
  if (!ref) return null;
  const p = programs.find((x) => x.id === ref.programId);
  if (!p) return null;
  const i = p.journeys.findIndex((j) => j.id === ref.journeyId);
  if (i < 0) return setName(p.id, programs);
  const dur = withDur && p.journeys[i].dur ? ` · ${fmt(p.journeys[i].dur)}` : "";
  return `${setName(p.id, programs)} · ${i + 1} of ${p.journeys.length}${dur}`;
}

type View = "main" | "pick" | "sets" | "joseph";

/** After a screen change, taps are ignored this long (the double-tap carry-over). */
const SCREEN_TAP_SHIELD_MS = 450;

export function PresenterView({
  presenter,
  programs,
  journeyName,
  currentTime,
  duration,
  stale,
  ageMs = null,
  send,
  onControls,
}: {
  presenter: PresenterStatus | null;
  programs: PresenterProgram[];
  journeyName: string | null;
  currentTime?: number;
  duration?: number;
  stale: boolean;
  /** ms since the kiosk last reported (null = never) — the stale banner */
  ageMs?: number | null;
  send: (cmd: string) => void;
  onControls: () => void;
}) {
  const [view, setViewRaw] = useState<View>("main");
  // TAP SHIELD (phone QA 2026-10-15): a double tap on a list row used to land
  // its second tap on the NEW screen's button in the same spot (a track tap +
  // NEXT = the tapped track skipped). Every screen change ignores taps for a beat.
  const [shield, setShield] = useState(false);
  const shieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (shieldTimer.current) clearTimeout(shieldTimer.current); }, []);
  const setView = (v: View) => {
    setViewRaw(v);
    setShield(true);
    if (shieldTimer.current) clearTimeout(shieldTimer.current);
    shieldTimer.current = setTimeout(() => setShield(false), SCREEN_TAP_SHIELD_MS);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  // OPTIMISTIC (presenter-optimistic.ts): a tap changes the screen in the same
  // frame; the kiosk's report confirms it, and only a disagreeing kiosk (or
  // none after 6 s) ever moves it back
  const [pending, setPending] = useState<Pending>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setPending((p) => (Object.keys(p).length ? reconcile(p, presenter, Date.now()) : p));
  }, [presenter, now]);

  const merged = mergeView(presenter, pending, { setId: DEFAULT_SET });
  const { playback, setId, status, cued } = merged;
  const holding = status === "holding";
  const current = presenter?.current ?? null;
  // what NEXT plays: the cue, else the kiosk's own answer (it knows the set);
  // a set just chosen on the phone answers locally until the kiosk confirms
  const next = useMemo(() => {
    if (cued) return cued;
    if (pending.setId && pending.setId.v !== presenter?.setId) {
      const p = programs.find((x) => x.id === pending.setId!.v);
      const i = current ? (p?.journeys.findIndex((j) => j.id === current.journeyId) ?? -1) : -1;
      const j = p?.journeys[i < 0 ? 0 : (i + 1) % p.journeys.length];
      return j && p ? { journeyId: j.id, programId: p.id, name: j.name } : null;
    }
    return presenter?.next ?? null;
  }, [cued, pending.setId, presenter, programs, current]);

  // how long the hold has lasted ("Holding · 2:14")
  const [holdSince, setHoldSince] = useState<number | null>(null);
  useEffect(() => {
    setHoldSince((h) => (holding ? h ?? Date.now() : null));
  }, [holding]);
  const heldFor = holdSince ? (now - holdSince) / 1000 : 0;

  /** one tap = the screen changes now (same frame) + the command goes out */
  const choose = (cmd: string, o: { playback?: PresenterStatus["playback"]; holdOn?: PresenterStatus["holdOn"]; setId?: string; cued?: RefLite | null; action?: "going" | "fading" }) => {
    const at = Date.now();
    setPending((p) => ({
      ...p,
      ...(o.playback ? { playback: { v: o.playback, at } } : {}),
      ...(o.holdOn ? { holdOn: { v: o.holdOn, at } } : {}),
      ...(o.setId ? { setId: { v: o.setId, at } } : {}),
      ...("cued" in o ? { cued: { v: o.cued ?? null, at } } : {}),
      ...(o.action ? { action: { v: o.action, at, fromStatus: presenter?.status ?? null, fromCurrent: presenter?.current?.journeyId ?? null } } : {}),
    }));
    send(cmd);
  };
  const manual = playback === "manual";
  const trackName = current?.name ?? journeyName ?? "—";

  const shell = (children: React.ReactNode) => (
    <div
      className="min-h-screen bg-background text-ink px-4 py-6 max-w-md mx-auto select-none [-webkit-tap-highlight-color:transparent] [&_button]:touch-manipulation [&_button:active]:transition-none"
      style={{
        // viewport-fit=cover + a Home Screen web app (black-translucent): keep
        // clear of the notch / Dynamic Island and the landscape side insets
        paddingTop: "calc(1.5rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      {stale ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="min-w-0">
            Waiting for kiosk…{" "}
            <span className="text-destructive/80">
              {ageMs === null ? "it hasn't reported yet" : `last heard ${fmt(ageMs / 1000)} ago`} — what&apos;s shown may be out of date
            </span>
          </span>
        </div>
      ) : null}
      {children}
      {shield ? <div aria-hidden className="fixed inset-0 z-50" /> : null}
    </div>
  );
  const linkBtn =
    "inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-mute active:text-ink transition-colors duration-instant";

  // ── CHOOSE A SET ───────────────────────────────────────────────────
  if (view === "sets") {
    const sets = SET_IDS.map((id) => {
      const js = programs.find((p) => p.id === id)?.journeys;
      return { id, n: js?.length ?? 0, time: setRunTime(js) };
    }).filter((s) => s.n > 0);
    return shell(
      <>
        <button type="button" className={linkBtn} onClick={() => setView("main")}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className={`${label} mt-4 mb-1`}>Play from</div>
        <h1 className={`${title} text-3xl text-ink mb-2`}>Choose a set</h1>
        <p className="text-sm text-ink-mute mb-5">Auto-play and Next both move through the set you choose.</p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          {sets.map((s) => {
            const on = s.id === setId;
            return (
              <button
                type="button"
                key={s.id}
                className={`min-h-14 w-full rounded-xl border px-4 py-3 text-left transition-colors duration-instant ${on ? "border-primary bg-primary/10" : "border-border bg-card active:bg-white/[0.06]"}`}
                onClick={() => {
                  choose(`set:${s.id}`, { setId: s.id, cued: null }); // choosing a set clears the pick
                  setView("main");
                }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`${title} min-w-0 truncate text-xl text-ink`}>{setName(s.id, programs)}</span>
                  {s.time ? <span className="shrink-0 font-mono text-xs text-ink-faint">{s.time}</span> : null}
                </div>
                <div className="text-xs text-ink-faint mt-0.5">
                  {s.n} tracks · {SET_META[s.id]?.kind ?? "set"}
                </div>
              </button>
            );
          })}
          {JOSEPH.length ? (
            <button
              type="button"
              className="min-h-14 w-full rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors duration-instant active:bg-white/[0.06]"
              onClick={() => setView("joseph")}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`${title} min-w-0 truncate text-xl text-ink`}>Joseph</span>
                {JOSEPH_TIME ? <span className="shrink-0 font-mono text-xs text-ink-faint">{JOSEPH_TIME}</span> : null}
              </div>
              <div className="text-xs text-ink-faint mt-0.5">{JOSEPH.length} tracks · live set</div>
            </button>
          ) : null}
        </div>
      </>,
    );
  }

  // ── JOSEPH — live set: a tap plays that track now ─────────────────
  if (view === "joseph") {
    return shell(
      <>
        <button type="button" className={linkBtn} onClick={() => setView("sets")}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className={`${label} mt-4 mb-1`}>Play a track</div>
        <h1 className={`${title} text-3xl text-ink mb-2`}>
          Joseph
          {JOSEPH_TIME ? <span className="ml-2 align-middle font-mono text-sm font-normal text-ink-faint">{JOSEPH_TIME}</span> : null}
        </h1>
        <p className="text-sm text-ink-mute mb-5">
          {JOSEPH.length} tracks, in set order. Tap one to play it now — the worlds follow Joseph&apos;s music.
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {JOSEPH.map((j) => (
            <button
              type="button"
              key={j.id}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-colors duration-instant active:bg-white/[0.06]"
              onClick={() => {
                send(`liveset:joseph@${j.n}`);
                setView("main");
              }}
            >
              <span className="w-6 shrink-0 text-right font-mono text-[11px] text-ink-faint">{j.n}</span>
              <span className={`${title} min-w-0 flex-1 truncate text-base text-ink`}>{j.title}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink-faint">{fmt(j.dur)}</span>
            </button>
          ))}
        </div>
      </>,
    );
  }

  // ── PICK A TRACK ───────────────────────────────────────────────────
  if (view === "pick") {
    const p = programs.find((x) => x.id === setId) ?? programs.find((x) => x.id === DEFAULT_SET) ?? null;
    return shell(
      <>
        <div className="flex items-center justify-between">
          <button type="button" className={linkBtn} onClick={() => setView("main")}>
            <ArrowLeft className="size-4" /> Back
          </button>
          <button type="button" className={`${linkBtn} text-primary`} onClick={() => setView("sets")}>
            Change set
          </button>
        </div>
        <div className={`${label} mt-4 mb-1`}>Play a track</div>
        <h1 className={`${title} text-3xl text-ink mb-2`}>
          {setName(p?.id, programs)}
          {setRunTime(p?.journeys) ? <span className="ml-2 align-middle font-mono text-sm font-normal text-ink-faint">{setRunTime(p?.journeys)}</span> : null}
        </h1>
        <p className="text-sm text-ink-mute mb-5">
          {p?.journeys.length ?? 0} tracks, {SET_META[p?.id ?? ""]?.order ?? "in order"}. Tap one to play it now — the set plays on from there.
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          {(p?.journeys ?? []).map((j, i) => {
            const isCurrent = current?.journeyId === j.id && current.programId === p?.id;
            const isNext = next?.journeyId === j.id && next.programId === p?.id;
            return (
              <button
                type="button"
                key={`${j.id}-${i}`}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors duration-instant ${isNext ? "border-primary/60 bg-primary/10" : "border-transparent active:bg-white/[0.06]"}`}
                onClick={() => {
                  if (!p) return;
                  // a tapped track PLAYS NOW (show day 2026-10-15) — no NEXT
                  // press; the set auto-plays on from it
                  choose(`playnow:${j.id}@${p.id}`, { setId: p.id, playback: "auto", cued: null, action: "going" });
                  setView("main");
                }}
              >
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-ink-faint">{i + 1}</span>
                <span className={`${title} min-w-0 flex-1 truncate text-base text-ink`}>{j.name}</span>
                {isCurrent ? (
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-emerald-400">{holding ? "Held" : "Playing"}</span>
                ) : isNext ? (
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-widest text-primary">Next</span>
                ) : j.dur ? (
                  <span className="shrink-0 font-mono text-[11px] text-ink-faint">{fmt(j.dur)}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </>,
    );
  }

  // ── MAIN (playing) / HOLDING ───────────────────────────────────────
  const progress = duration && duration > 0 ? Math.min(1, (currentTime ?? 0) / duration) : 0;
  // THE TITLE CARD HELD from the controls ("Title card — hold", or a kiosk
  // opened with ?titlehold=1): the loop names it "Title card — HOLDING" while
  // the presenter still reports the song before it as playing — the screen
  // said "Now playing <old song>" with NEXT over a held card. It shows the
  // hold and the Start the controls offer (title-release → Rise Above).
  const titleHeld = !holding && !pending.action && /HOLDING/.test(journeyName ?? "");
  const ra = programs.find((x) => x.id === DEFAULT_SET);
  const raFirst = ra?.journeys[0] ? { journeyId: ra.journeys[0].id, programId: ra.id, name: ra.journeys[0].name } : null;
  const statusLine = titleHeld
    ? "Title card · holding"
    : holding
    ? `Holding · ${fmt(heldFor)}`
    : status === "fading"
      ? "Fading out…"
      : status === "going"
        ? "Starting…"
        : `${stale ? "Last report" : "Now playing"} · ${fmt(currentTime)} / ${fmt(duration)}`;

  return shell(
    <>
      {/* header — Playing from <set> ⌄ · Live */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={label}>Playing from</div>
          <button
            type="button"
            className="flex min-h-11 max-w-full items-center gap-1.5 text-left"
            onClick={() => setView("sets")}
          >
            <span className={`${title} truncate text-2xl text-ink`}>{setName(setId, programs)}</span>
            {setRunTime(programs.find((x) => x.id === setId)?.journeys) ? (
              <span className="shrink-0 font-mono text-xs text-ink-faint">{setRunTime(programs.find((x) => x.id === setId)?.journeys)}</span>
            ) : null}
            <ChevronDown className="size-5 shrink-0 text-ink-mute" />
          </button>
        </div>
        <button
          type="button"
          onClick={onControls}
          className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs text-ink-mute active:bg-white/[0.06]"
          title={stale ? "Kiosk not reporting — open controls" : "Kiosk live — open controls"}
        >
          <span className={`h-2 w-2 rounded-full ${stale ? "bg-destructive" : "bg-emerald-500"}`} />
          Live
        </button>
      </div>

      {/* Auto-play | Song by song */}
      <div className="mt-3 mb-5 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
        {(["auto", "manual"] as const).map((m) => (
          <button
            type="button"
            key={m}
            className={`min-h-11 rounded-none text-sm transition-colors duration-instant ${playback === m ? "bg-primary/20 text-ink" : "text-ink-mute active:bg-white/[0.06]"}`}
            onClick={() => choose(`playback:${m}`, { playback: m })}
          >
            {m === "auto" ? "Auto-play" : "Song by song"}
          </button>
        ))}
      </div>

      {/* now playing / holding */}
      <div className="rounded-xl border border-border bg-card p-4 mb-3">
        <div className={`font-mono text-[11px] uppercase tracking-widest ${holding || titleHeld ? "text-primary" : stale ? "text-ink-faint" : "text-emerald-400"}`}>
          {statusLine}
        </div>
        <div className={`${title} mt-1 text-[34px] leading-[1.1] text-ink [overflow-wrap:anywhere]`}>{titleHeld ? "Resonance" : trackName}</div>
        <div className="mt-1 text-sm text-ink-faint">{titleHeld ? "The title card" : position(current, programs) ?? ""}</div>
        {titleHeld ? (
          <p className="mt-3 text-sm text-ink-mute">The title card is up and holding until you press Start.</p>
        ) : holding ? (
          <p className="mt-3 text-sm text-ink-mute">
            Ended. {merged.holdOn === "title" ? "The title card is holding" : "The screen is holding on its last moment"} until you press Play.
          </p>
        ) : (
          <>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-ink-mute" style={{ width: `${progress * 100}%` }} />
            </div>
            {manual ? (
              <p className="mt-3 text-sm text-ink-mute">When it ends, the screen holds on its last moment until you press Next.</p>
            ) : null}
          </>
        )}
      </div>

      {/* Up next / Ready */}
      {titleHeld ? (
        <div className="rounded-xl border border-primary bg-primary/10 p-4 mb-4">
          <div className={`${label} text-primary`}>Ready</div>
          <div className={`${title} mt-1 text-2xl text-ink`}>{raFirst?.name ?? "Rise Above"}</div>
          <div className="mt-0.5 text-sm text-ink-faint">{position(raFirst, programs, true) ?? "Rise Above, from the beginning"}</div>
          <button type="button" className={`${linkBtn} text-primary`} onClick={() => setView("pick")}>
            Choose a different track
          </button>
        </div>
      ) : holding ? (
        <div className="rounded-xl border border-primary bg-primary/10 p-4 mb-4">
          <div className={`${label} text-primary`}>Ready</div>
          <div className={`${title} mt-1 text-2xl text-ink`}>{next?.name ?? "—"}</div>
          <div className="mt-0.5 text-sm text-ink-faint">{position(next, programs, true) ?? ""}</div>
          <button type="button" className={`${linkBtn} text-primary`} onClick={() => setView("pick")}>
            Choose a different track
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 mb-4">
          <div className="min-w-0">
            <div className={label}>{cued ? "Ready" : "Up next"}</div>
            <div className={`${title} truncate text-xl text-ink`}>{next?.name ?? "—"}</div>
          </div>
          <button type="button" className={`${linkBtn} shrink-0 text-primary`} onClick={() => setView("pick")}>
            Change
          </button>
        </div>
      )}

      {/* NEXT / PLAY */}
      {titleHeld ? (
        <Button
          className="h-[104px] w-full flex-col gap-1 rounded-lg active:bg-primary/75 text-lg text-primary-foreground"
          onClick={() => choose("title-release", { action: "going" })}
        >
          <span className="inline-flex items-center gap-2 text-xl"><Play className="size-6" /> Start Rise Above</span>
          <span className="max-w-full truncate text-sm text-primary-foreground/80">{raFirst?.name ?? ""}</span>
        </Button>
      ) : holding ? (
        <Button
          className="h-[104px] w-full flex-col gap-1 rounded-lg active:bg-primary/75 text-lg text-primary-foreground"
          onClick={() => choose("next", { cued: null, action: "going" })}
        >
          <span className="inline-flex items-center gap-2 text-xl"><Play className="size-6" /> Play</span>
          <span className="max-w-full truncate text-sm text-primary-foreground/80">{next?.name ?? ""}</span>
        </Button>
      ) : (
        <Button
          className="h-[88px] w-full gap-3 rounded-lg active:bg-primary/75 text-xl text-primary-foreground"
          onClick={() => choose("next", { cued: null, action: "going" })}
        >
          Next <ArrowRight className="size-6" />
        </Button>
      )}
      <p className="mt-2 mb-4 text-center text-xs text-ink-faint">
        {titleHeld
          ? "The title card flows straight into Rise Above."
          : holding
          ? merged.holdOn === "title" ? "The title card flows straight into its title and music." : "The held ending flows straight into its title and music."
          : `Mid-song, Next fades this one out gracefully, then plays ${next?.name ?? "the next track"}.`}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="glass" className="h-auto min-h-12 text-sm text-ink active:bg-white/[0.14]" onClick={() => setView("pick")}>
          Pick a track
        </Button>
        {titleHeld ? (
          <Button variant="glass" className="h-auto min-h-12 text-sm text-ink" disabled>
            Fade out now
          </Button>
        ) : holding ? (
          <Button variant="glass" className="h-auto min-h-12 text-sm text-ink active:bg-white/[0.14]" onClick={() => choose("replay", { action: "going" })}>
            Replay this one
          </Button>
        ) : (
          <Button
            variant="glass"
            className="h-auto min-h-12 text-sm text-ink"
            disabled={status !== "playing"}
            onClick={() => choose("fadeout", { playback: "manual", action: "fading" })}
          >
            Fade out now
          </Button>
        )}
      </div>

      {/* hold setting — Karel offered both: the ending (default) or the title card */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-faint">A held song shows</span>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
          {(["ending", "title"] as const).map((h) => (
            <button
              type="button"
              key={h}
              className={`min-h-11 rounded-none px-3 text-xs transition-colors duration-instant ${merged.holdOn === h ? "bg-primary/20 text-ink" : "text-ink-mute active:bg-white/[0.06]"}`}
              onClick={() => choose(`holdon:${h}`, { holdOn: h })}
            >
              {h === "ending" ? "Its ending" : "Title card"}
            </button>
          ))}
        </div>
      </div>
    </>,
  );
}
