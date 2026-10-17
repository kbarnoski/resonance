"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reconcile, mergeView, type Pending, type RefLite } from "@/lib/audio/presenter-optimistic";
import { ChevronLeft, ChevronRight, Mic, Music2, Play, Settings, SkipForward } from "lucide-react";
import { TRAMOKYO_MAIN } from "@/lib/journeys/installation-sequence";
import { setRunTime } from "@/lib/audio/set-duration";

/**
 * THE PHONE REMOTE — "dead simple … my mother would know first time" (Karel
 * 2026-10-16; he liked "when the big button was a play button and also gave me
 * chance to select something from the catalog"). Three screens, no tab bar:
 *
 *   HOME          what's on + ONE big button (Next / Play / Change the scene)
 *                 + "Choose music"
 *   CHOOSE MUSIC  Live, then every set (Joseph's is just another set) → its songs
 *   SETTINGS      the gear: titles, after each song, volume, title card, tools
 *
 * Every play action lands back on Home. Plain words only — the kiosk's own
 * vocabulary (presenter, live set, world, DJ mode, cue) never reaches the screen.
 *
 * Protocol (phone → kiosk, /api/pack/remote) is unchanged: next, playnow:<j>@<set>,
 * title-release, title-hold, playback:auto|manual, holdon:ending|title, fadeout,
 * titles:on|off, liveset:joseph@N, skip, live:mic|both, loop, volume:<v>,
 * mark:<ts>, reload, break, journey:<id>.
 */

export interface PresenterRefStatus { journeyId: string; programId: string; name: string }
export interface PresenterStatus {
  playback: "auto" | "manual";
  holdOn: "ending" | "title";
  status: "idle" | "playing" | "fading" | "holding" | "going";
  setId: string | null;
  current: PresenterRefStatus | null;
  cued: PresenterRefStatus | null;
  next: PresenterRefStatus | null;
}
export interface PresenterProgram { id: string; label: string; journeys: { id: string; name: string; dur?: number | null }[] }
export interface JosephTrackRow { n: number; id: string; title: string; duration: number }
export interface JosephNow { index: number; count: number; title: string | null; state: string; currentTime: number; duration: number; next: string | null }
export interface LiveInput { ok: boolean; inputs: string[]; note: string | null; level: number }

/** The sets, in loop order, with the names people know them by. */
const SET_NAMES: Record<string, string> = {
  "tramokyo-mix": "Rise Above",
  "tramokyo-mix-4": "March Light",
  "tramokyo-mix-3": "Surrounded by Light",
  "tramokyo-mix-2": "Welcome Home",
  "tramokyo-mix-vigil": "Vigil",
  "tramokyo-mix-ep": "The Snowflake EP",
  "tramokyo-mix-exp": "Expansion",
  "tramokyo-mix-1b": "Featured journeys",
};
const SET_IDS = TRAMOKYO_MAIN.sets.map((s) => s.id);
const DEFAULT_SET = SET_IDS[0];
const JOSEPH = "joseph";

const title = "font-sans font-medium tracking-tight";
const label = "font-mono text-[11px] uppercase tracking-widest text-ink-faint";

function fmt(sec: number | null | undefined): string {
  if (!sec || sec < 0 || !Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function setName(id: string | null | undefined, programs: PresenterProgram[]): string {
  if (!id) return SET_NAMES[DEFAULT_SET] ?? "Rise Above";
  if (id === JOSEPH) return "Joseph";
  return SET_NAMES[id] ?? programs.find((p) => p.id === id)?.label ?? id;
}
/** "Rise Above · 12 of 43" */
function position(ref: { journeyId: string; programId: string } | null, programs: PresenterProgram[]): string | null {
  if (!ref) return null;
  const p = programs.find((x) => x.id === ref.programId);
  if (!p) return null;
  const i = p.journeys.findIndex((j) => j.id === ref.journeyId);
  return i < 0 ? setName(p.id, programs) : `${setName(p.id, programs)} · ${i + 1} of ${p.journeys.length}`;
}

type Screen = { k: "home" } | { k: "music" } | { k: "set"; id: string } | { k: "settings" };

/** After a screen change, taps are ignored this long (a double tap must not land on the new screen). */
const SCREEN_TAP_SHIELD_MS = 450;

export function SimpleRemote({
  context,
  presenter,
  programs,
  journeyName,
  isPlaying,
  currentTime,
  duration,
  volume,
  titles,
  micsens,
  joseph,
  josephTracks,
  liveInput,
  liveSrc,
  midi,
  stale,
  ageMs,
  sendError,
  extras,
  send,
}: {
  context: "loop" | "room" | "live" | null;
  presenter: PresenterStatus | null;
  programs: PresenterProgram[];
  journeyName: string | null;
  isPlaying: boolean | undefined;
  currentTime?: number;
  duration?: number;
  volume?: number;
  titles: "on" | "off" | null;
  micsens: "less" | "normal" | "more" | null;
  /** Joseph's set playing now (null = not) */
  joseph: JosephNow | null;
  josephTracks: JosephTrackRow[];
  /** live (the mic): what it hears */
  liveInput: LiveInput | null;
  liveSrc: "mic" | "laptop" | "both" | "set" | null;
  midi: string | null;
  stale: boolean;
  ageMs: number | null;
  sendError: string | null;
  extras: { id: string; name: string }[];
  send: (cmd: string) => void;
}) {
  const [screen, setScreenRaw] = useState<Screen>({ k: "home" });
  const [shield, setShield] = useState(false);
  const shieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (shieldTimer.current) clearTimeout(shieldTimer.current); }, []);
  const go = (s: Screen) => {
    setScreenRaw(s);
    setShield(true);
    if (shieldTimer.current) clearTimeout(shieldTimer.current);
    shieldTimer.current = setTimeout(() => setShield(false), SCREEN_TAP_SHIELD_MS);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  // OPTIMISTIC (presenter-optimistic.ts): a tap shows at once; the kiosk confirms
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

  // titles Show / Hide — optimistic too (the kiosk's report wins once it agrees, or after 6 s)
  const [titlesTap, setTitlesTap] = useState<{ v: "on" | "off"; at: number } | null>(null);
  useEffect(() => {
    if (titlesTap && (titles === titlesTap.v || now - titlesTap.at > 6000)) setTitlesTap(null);
  }, [titles, titlesTap, now]);
  const titlesOn = (titlesTap?.v ?? titles ?? "on") === "on";
  // mic sensitivity Less / Normal / More — optimistic like the titles
  const [sensTap, setSensTap] = useState<{ v: "less" | "normal" | "more"; at: number } | null>(null);
  useEffect(() => {
    if (sensTap && (micsens === sensTap.v || now - sensTap.at > 6000)) setSensTap(null);
  }, [micsens, sensTap, now]);
  const sensNow = sensTap?.v ?? micsens ?? "normal";

  // ── where the screen is ──────────────────────────────────────────
  const inLoop = context === "loop";
  const plainLive = context === "live" && !joseph;
  const current = presenter?.current ?? null;
  const holding = inLoop && merged.status === "holding";
  const going = inLoop && (merged.status === "going" || merged.status === "fading");
  // the title card held (from Settings, or a kiosk opened with ?titlehold=1)
  const titleHeld = inLoop && !holding && !pending.action && /HOLDING/.test(journeyName ?? "");
  const next = useMemo(() => merged.cued ?? presenter?.next ?? null, [merged.cued, presenter?.next]);
  const ra = programs.find((x) => x.id === DEFAULT_SET);
  const raFirst = ra?.journeys[0] ?? null;
  const playingSetId = joseph ? JOSEPH : plainLive ? "live" : inLoop ? current?.programId ?? merged.setId : null;

  const shell = (children: React.ReactNode) => (
    <div
      className="mx-auto min-h-screen max-w-md bg-background text-ink select-none [-webkit-tap-highlight-color:transparent] [&_button]:touch-manipulation"
      style={{
        paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      {sendError ? (
        <div role="alert" className="mb-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {sendError}
        </div>
      ) : null}
      {children}
      {shield ? <div aria-hidden className="fixed inset-0 z-50" /> : null}
    </div>
  );
  const backBar = (to: Screen, heading: string) => (
    <>
      <button type="button" className="-ml-2 inline-flex min-h-12 items-center gap-1 pr-4 text-lg text-primary active:opacity-60" onClick={() => go(to)}>
        <ChevronLeft className="size-6" /> Back
      </button>
      <h1 className={`${title} mt-1 mb-5 text-[32px] leading-tight text-ink`}>{heading}</h1>
    </>
  );
  const bigPrimary = "flex min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-primary px-4 text-primary-foreground transition-opacity duration-instant active:opacity-75 disabled:opacity-40";
  const bigSecondary = "flex min-h-16 w-full items-center justify-center gap-2.5 rounded-2xl border border-border bg-card text-xl text-ink active:bg-white/[0.08]";
  const row = "flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left active:bg-white/[0.08]";

  // ═══ SETTINGS ═══════════════════════════════════════════════════
  if (screen.k === "settings") {
    const seg = <T extends string>(value: T, opts: { v: T; name: string }[], on: (v: T) => void) => (
      <div className={`grid ${opts.length === 3 ? "grid-cols-3" : "grid-cols-2"} overflow-hidden rounded-xl border border-border bg-card`}>
        {opts.map((o) => (
          <button
            type="button"
            key={o.v}
            aria-pressed={value === o.v}
            className={`min-h-12 px-2 text-base transition-colors duration-instant ${value === o.v ? "bg-primary/25 text-ink" : "text-ink-mute active:bg-white/[0.06]"}`}
            onClick={() => on(o.v)}
          >
            {o.name}
          </button>
        ))}
      </div>
    );
    const item = (name: string, control: React.ReactNode, hint?: string) => (
      <div className="border-b border-border py-4">
        <div className="mb-2.5 text-lg text-ink">{name}</div>
        {control}
        {hint ? <div className="mt-2 text-sm text-ink-faint">{hint}</div> : null}
      </div>
    );
    const tool = "flex min-h-14 w-full items-center justify-center rounded-xl border border-border bg-card px-4 text-lg text-ink active:bg-white/[0.08] disabled:opacity-40";
    const hearsLaptop = liveSrc === "both";
    const shownExtras = extras.filter((j) => !programs.some((p) => p.journeys.some((pj) => pj.id === j.id)));
    return shell(
      <>
        {backBar({ k: "home" }, "Settings")}
        {item(
          "Song titles on screen",
          seg(titlesOn ? "on" : "off", [{ v: "on", name: "Show" }, { v: "off", name: "Hide" }], (v) => {
            setTitlesTap({ v, at: Date.now() });
            send(`titles:${v}`);
          }),
        )}
        {item(
          "Mic sensitivity",
          seg(sensNow, [{ v: "less", name: "Less" }, { v: "normal", name: "Normal" }, { v: "more", name: "More" }], (v) => {
            setSensTap({ v, at: Date.now() });
            send(`micsens:${v}`);
          }),
          "For Live. More: a soft voice builds the picture. Less: only strong sound does.",
        )}
        {item(
          "After each song",
          seg(merged.playback, [{ v: "auto", name: "Keep playing" }, { v: "manual", name: "Pause" }], (v) => choose(`playback:${v}`, { playback: v })),
          merged.playback === "manual" ? "Each song stops at its end. Press Play on the main screen for the next one." : undefined,
        )}
        {item(
          "A paused song shows",
          seg(merged.holdOn, [{ v: "ending", name: "Its last moment" }, { v: "title", name: "The title card" }], (v) => choose(`holdon:${v}`, { holdOn: v })),
        )}
        {item(
          "Volume",
          <div className="grid grid-cols-5 gap-2">
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
              const on = volume !== undefined && Math.abs(volume - v) < 0.1;
              return (
                <button
                  type="button"
                  key={v}
                  aria-pressed={on}
                  className={`min-h-12 rounded-xl border text-base ${on ? "border-primary bg-primary/25 text-ink" : "border-border bg-card text-ink-mute active:bg-white/[0.08]"}`}
                  onClick={() => send(`volume:${v}`)}
                >
                  {Math.round(v * 100)}
                </button>
              );
            })}
          </div>,
        )}
        {inLoop
          ? item(
              "This song",
              <button type="button" className={tool} disabled={merged.status !== "playing"} onClick={() => choose("fadeout", { playback: "manual", action: "fading" })}>
                Fade out this song
              </button>,
            )
          : null}
        {inLoop
          ? item(
              "Title card",
              titleHeld ? (
                <button type="button" className={tool} onClick={() => { choose("title-release", { action: "going" }); go({ k: "home" }); }}>
                  ▶ Start the music
                </button>
              ) : (
                <button
                  type="button"
                  className={tool}
                  onClick={() => {
                    // confirmed — a pocket tap would stop the show
                    if (window.confirm("Fade out and hold the title card until you press Start?")) send("title-hold");
                  }}
                >
                  Hold the title card
                </button>
              ),
              "Puts Resonance on screen and waits — for an introduction.",
            )
          : null}
        {plainLive
          ? item(
              "Also hear the laptop's own sound",
              <button
                type="button"
                role="switch"
                aria-checked={hearsLaptop}
                className="relative flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-card px-4 text-base text-ink-mute"
                onClick={() => send(`live:${hearsLaptop ? "mic" : "both"}`)}
              >
                <span>{hearsLaptop ? "On" : "Off"}</span>
                <span className={`relative block h-7 w-12 rounded-full transition-colors duration-fast ${hearsLaptop ? "bg-primary" : "bg-white/[0.14]"}`}>
                  <span className={`absolute left-0 top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-fast ${hearsLaptop ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                </span>
              </button>,
              "Needs BlackHole installed on the laptop.",
            )
          : null}
        {item(
          "Something looks wrong?",
          <div className="grid gap-2">
            {/* MARK (Karel 2026-10-12): logs the journey + exact second for Claude to find */}
            <button type="button" className={tool} onClick={() => send(`mark:${Date.now()}`)}>
              ⚑ Mark a glitch
            </button>
            <button
              type="button"
              className={tool}
              onClick={() => {
                if (window.confirm("Reload the screen? It restarts what it was showing.")) send("reload");
              }}
            >
              Reload the screen
            </button>
          </div>,
        )}
        {shownExtras.length ? (
          <details className="mt-4 rounded-xl border border-border bg-card px-4 py-1">
            <summary className="flex min-h-14 cursor-pointer items-center text-lg text-ink-mute">Extra journeys</summary>
            <p className="mb-3 text-sm text-ink-faint">Plays one journey on its own{inLoop ? ". “Play my music” on the main screen brings your sets back." : "."}</p>
            <div className="mb-3 grid gap-2">
              {shownExtras.map((j) => (
                <button
                  type="button"
                  key={j.id}
                  className="flex min-h-12 w-full items-center rounded-lg border border-border px-3 text-left text-base text-ink active:bg-white/[0.08]"
                  onClick={() => {
                    if (inLoop) {
                      send("break");
                      // the loop drops journey: — give the break a beat to land first
                      setTimeout(() => send(`journey:${j.id}`), 3500);
                    } else {
                      send(`journey:${j.id}`);
                    }
                    go({ k: "home" });
                  }}
                >
                  <span className="truncate">{j.name}</span>
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </>,
    );
  }

  // ═══ ONE SET — its songs ═════════════════════════════════════════
  if (screen.k === "set") {
    const isJoseph = screen.id === JOSEPH;
    const p = programs.find((x) => x.id === screen.id) ?? null;
    const songs = isJoseph
      ? josephTracks.map((t) => ({ key: t.id, name: t.title, dur: t.duration, playing: joseph?.index === t.n, play: () => send(`liveset:joseph@${t.n}`) }))
      : (p?.journeys ?? []).map((j, i) => ({
          key: `${j.id}-${i}`,
          name: j.name,
          dur: j.dur ?? null,
          playing: inLoop && current?.journeyId === j.id && current.programId === screen.id,
          play: () => choose(`playnow:${j.id}@${screen.id}`, { setId: screen.id, playback: "auto", cued: null, action: "going" }),
        }));
    const time = setRunTime(isJoseph ? josephTracks.map((t) => ({ dur: t.duration })) : p?.journeys);
    return shell(
      <>
        {backBar({ k: "music" }, setName(screen.id, programs))}
        <p className="-mt-3 mb-5 text-base text-ink-faint">
          {songs.length} songs{time ? ` · ${time}` : ""}{isJoseph ? " · music by C Minus" : ""}
        </p>
        {songs.length ? (
          <>
            <button
              type="button"
              className={`${bigPrimary} mb-6 min-h-[88px] flex-row gap-3 text-2xl`}
              onClick={() => {
                songs[0].play();
                go({ k: "home" });
              }}
            >
              <Play className="size-7 fill-current" /> Play from the start
            </button>
            <div className={`${label} mb-2`}>Or tap a song</div>
            <ol className="grid gap-1.5">
              {songs.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    aria-current={s.playing ? "true" : undefined}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left active:bg-white/[0.08] ${s.playing ? "border-emerald-500/50 bg-emerald-500/10" : "border-transparent"}`}
                    onClick={() => {
                      s.play();
                      go({ k: "home" });
                    }}
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-faint">{i + 1}</span>
                    <span className={`${title} min-w-0 flex-1 truncate text-lg text-ink`}>{s.name}</span>
                    {s.playing ? (
                      <span className="shrink-0 text-sm text-emerald-400">Playing</span>
                    ) : s.dur ? (
                      <span className="shrink-0 font-mono text-xs text-ink-faint">{fmt(s.dur)}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-lg text-ink-mute">The songs appear here as soon as the screen answers.</p>
        )}
      </>,
    );
  }

  // ═══ CHOOSE MUSIC ═══════════════════════════════════════════════
  if (screen.k === "music") {
    const sets = [
      ...SET_IDS.map((id) => {
        const js = programs.find((x) => x.id === id)?.journeys ?? [];
        return { id, n: js.length, time: setRunTime(js) };
      }).filter((s) => s.n > 0 || !programs.length),
      { id: JOSEPH, n: josephTracks.length, time: setRunTime(josephTracks.map((t) => ({ dur: t.duration }))) },
    ];
    return shell(
      <>
        {backBar({ k: "home" }, "Choose music")}
        <button
          type="button"
          className={`${row} mb-5 ${plainLive ? "border-emerald-500/50" : ""}`}
          onClick={() => {
            send("live:mic");
            go({ k: "home" });
          }}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Mic className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`${title} block text-xl text-ink`}>Live</span>
            <span className="block text-base text-ink-mute">The screen follows the sound in the room</span>
          </span>
          {plainLive ? <span className="shrink-0 text-sm text-emerald-400">Playing</span> : <ChevronRight className="size-5 shrink-0 text-ink-faint" />}
        </button>
        <div className={`${label} mb-2`}>My music</div>
        <div className="grid gap-2">
          {sets.map((s) => (
            <button type="button" key={s.id} className={`${row} ${playingSetId === s.id ? "border-emerald-500/50" : ""}`} onClick={() => go({ k: "set", id: s.id })}>
              <span className="min-w-0 flex-1">
                <span className={`${title} block truncate text-xl text-ink`}>{setName(s.id, programs)}</span>
                <span className="block text-base text-ink-faint">
                  {s.n ? `${s.n} songs` : "songs"}
                  {s.time ? ` · ${s.time}` : ""}
                </span>
              </span>
              {playingSetId === s.id ? <span className="shrink-0 text-sm text-emerald-400">Playing</span> : null}
              <ChevronRight className="size-5 shrink-0 text-ink-faint" />
            </button>
          ))}
        </div>
      </>,
    );
  }

  // ═══ HOME ═══════════════════════════════════════════════════════
  const stateWord = stale
    ? "Waiting for the screen…"
    : plainLive
      ? "Live"
      : joseph
        ? joseph.state === "ended" ? "Finished" : "Playing"
        : titleHeld || holding || isPlaying === false
          ? "Paused"
          : going
            ? "Starting…"
            : "Playing";

  let cardLabel = "";
  let bigTitle = "—";
  let subline: string | null = null;
  let progress: number | null = null;
  let level: number | null = null;
  if (plainLive) {
    cardLabel = "Live";
    bigTitle = "Listening to the room";
    subline = liveInput && !liveInput.ok ? liveInput.note ?? "The microphone isn't answering" : "Talk, sing or play — the screen follows the sound";
    level = liveInput?.level ?? 0;
  } else if (joseph) {
    cardLabel = "Joseph";
    bigTitle = joseph.title ?? "—";
    subline = `Music by C Minus · ${joseph.index} of ${joseph.count}`;
    progress = joseph.duration > 0 ? Math.min(1, joseph.currentTime / joseph.duration) : 0;
  } else if (titleHeld) {
    cardLabel = "Title card";
    bigTitle = "Resonance";
    subline = "On screen, waiting for you";
  } else if (inLoop) {
    cardLabel = setName(current?.programId ?? merged.setId, programs);
    bigTitle = current?.name ?? journeyName ?? "—";
    subline = holding ? (merged.holdOn === "title" ? "Finished — the title card is showing" : "Finished — holding on its last moment") : position(current, programs);
    progress = !holding && duration && duration > 0 ? Math.min(1, (currentTime ?? 0) / duration) : null;
  } else if (context === "room") {
    cardLabel = "Extra journey";
    bigTitle = journeyName ?? "—";
  } else {
    cardLabel = "Resonance";
    bigTitle = "Not playing";
  }

  // the ONE big button
  let primary: { icon: "play" | "next" | "scene"; text: string; under: string | null; act: () => void };
  if (plainLive) primary = { icon: "scene", text: "Change the scene", under: null, act: () => send("skip") };
  else if (joseph)
    primary = joseph.state === "ended"
      ? { icon: "play", text: "Play again", under: josephTracks[0]?.title ?? null, act: () => send("liveset:joseph@1") }
      : { icon: "next", text: "Next song", under: joseph.next, act: () => send("skip") };
  else if (titleHeld) primary = { icon: "play", text: "Play", under: raFirst?.name ?? null, act: () => choose("title-release", { action: "going" }) };
  else if (holding) primary = { icon: "play", text: "Play", under: next?.name ?? null, act: () => choose("next", { cued: null, action: "going" }) };
  else if (inLoop) primary = { icon: "next", text: "Next song", under: next?.name ?? null, act: () => choose("next", { cued: null, action: "going" }) };
  else primary = { icon: "play", text: "Play my music", under: null, act: () => send("loop") };

  return shell(
    <>
      {/* status + settings */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stale ? "animate-pulse bg-destructive" : "bg-emerald-500"}`} />
          <span className="truncate text-base text-ink-mute">
            {stateWord}
            {stale && ageMs !== null ? <span className="text-ink-faint"> · last heard {fmt(ageMs / 1000)} ago</span> : null}
          </span>
        </div>
        <button
          type="button"
          aria-label="Settings"
          className="-mr-2 flex size-12 shrink-0 items-center justify-center rounded-full text-ink-mute active:bg-white/[0.08]"
          onClick={() => go({ k: "settings" })}
        >
          <Settings className="size-6" />
        </button>
      </div>

      {/* what's on */}
      <div className="mb-4 rounded-2xl border border-border bg-card p-5">
        <div className={label}>{cardLabel}</div>
        <div className={`${title} mt-1.5 text-[34px] leading-[1.1] text-ink [overflow-wrap:anywhere]`}>{bigTitle}</div>
        {subline ? <div className="mt-1.5 text-base text-ink-mute">{subline}</div> : null}
        {progress !== null ? (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full bg-ink-mute" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : null}
        {level !== null ? (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]" aria-label="Sound level">
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-fast" style={{ width: `${Math.min(100, Math.round(level * 250))}%` }} />
          </div>
        ) : null}
        {plainLive && midi ? <div className="mt-2 text-sm text-ink-faint">{midi}</div> : null}
      </div>

      {/* THE big button */}
      <button type="button" className={`${bigPrimary} mb-3`} disabled={stale} onClick={primary.act}>
        <span className="inline-flex items-center gap-3 text-[26px] font-medium">
          {primary.icon === "play" ? <Play className="size-8 fill-current" /> : null}
          {primary.text}
          {primary.icon === "next" ? <SkipForward className="size-7 fill-current" /> : null}
        </span>
        {primary.under ? <span className="max-w-full truncate text-base text-primary-foreground/80">{primary.under}</span> : null}
      </button>

      {/* the catalogue */}
      <button type="button" className={bigSecondary} onClick={() => go({ k: "music" })}>
        <Music2 className="size-6" /> Choose music
      </button>
    </>,
  );
}
