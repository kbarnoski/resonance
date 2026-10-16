"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INSTALLATION_PROGRAMS, TRAMOKYO_MIX_ID } from "@/lib/journeys/installation-sequence";
import { Button } from "@/components/ui/button";
import { josephSet } from "@/lib/journeys/joseph-set";
import { createRepeatGuard } from "@/lib/audio/remote-send-guard";
import { PresenterView, type PresenterStatus } from "./presenter-view";
import { TitlesRow } from "./titles-row";
import { ArrowRight, ListMusic, Mic, Settings2 } from "lucide-react";

// "Start from" jump points — the beginning is program 0's intro; every
// program also gets its own starting point. New programs (backlog:
// Surrounded by Light, March Light) appear here automatically once they
// land in INSTALLATION_PROGRAMS.
const START_POINTS: { cmd: string; label: string; standalone?: boolean }[] = [
  // The beginning = Rise Above, the main loop's opening set (Karel 2026-10-09).
  { cmd: `program:${TRAMOKYO_MIX_ID}`, label: "From the beginning (Rise Above)" },
  // Each set of the main loop, in loop order — it plays on from there.
  { cmd: "program:tramokyo-mix-4", label: "March Light set" },
  { cmd: "program:tramokyo-mix-3", label: "Surrounded by Light set" },
  { cmd: "program:tramokyo-mix-2", label: "Welcome Home set" },
  { cmd: "program:tramokyo-mix-vigil", label: "Vigil set" },
  { cmd: "program:tramokyo-mix-ep", label: "Snowflake EP set" },
  { cmd: "program:tramokyo-mix-exp", label: "Expansion set" },
  { cmd: "program:tramokyo-mix-1b", label: "Featured set" },
  // album / program versions (each plays through, then the loop returns to
  // Rise Above) — under their own heading: "Vigil" / "Expansion set" read
  // as duplicates of the main-loop sets above them
  ...INSTALLATION_PROGRAMS.map((p) => ({
    cmd: `program:${p.id}`,
    label: p.presenting.replace(/^the /, ""),
    standalone: true,
  })),
];

interface KioskProgram {
  id: string;
  label: string;
  journeys: { id: string; name: string; dur?: number | null }[];
}

interface KioskStatus {
  context?: "loop" | "room" | "live";
  programs?: KioskProgram[] | null;
  journey?: string | null;
  track?: string | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
  /** Live Theatre: the Nord's USB MIDI line (null when MIDI isn't in use) */
  midi?: string | null;
  /** Presenter (auto-play / song by song) — loop context only */
  presenter?: PresenterStatus | null;
  /** LIVE SET (Joseph, live-theatre-client.tsx) — live context only */
  liveset?: LiveSetStatus | null;
  /** Live Theatre: what the kiosk listens to (its ?livesrc=), "set" in a live set */
  liveSrc?: LiveSrc | "set" | null;
  /** titles between tracks (track-titles.ts) — absent on an older kiosk build */
  titles?: "on" | "off";
  /** Live Theatre input (audio-engine LiveInputStatus + the live level) */
  liveinput?: { src: LiveSrc; ok: boolean; inputs: string[]; missing: string[]; note: string | null; level: number } | null;
}

interface LiveSetStatus {
  set: string;
  index: number; // 1-based
  count: number;
  title: string | null;
  state: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  next: string | null;
  world: string | null;
  tracks?: { n: number; id: string; title: string; duration: number }[];
}

/** The Joseph live set as the phone lists it (the kiosk's own list once it reports one). */
const JOSEPH_TRACKS_LOCAL = josephSet().map((t, i) => ({ n: i + 1, id: t.id, title: t.title, duration: t.duration }));


/** Phone status poll while the page is visible (GET is an in-memory read; the
 *  set + track lists only travel when they change — programsRev). */
const STATUS_POLL_MS = 500;
const PROGRAMS_CACHE_KEY = "resonance-remote-programs-v1";
const POLL_TIMEOUT_MS = 4_000;
const SEND_TIMEOUT_MS = 6_000;

/** AbortSignal.timeout where the phone's browser has it (iOS 16+), else none. */
function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

function keyQuery(): string {
  if (typeof window === "undefined") return "";
  const k = new URLSearchParams(window.location.search).get("key");
  return k ? `key=${encodeURIComponent(k)}` : "";
}

type LiveSrc = "mic" | "laptop" | "both";

export function RemoteClient({
  initialStatus = null,
  initialAgeMs = null,
  extras = [],
}: {
  initialStatus?: Record<string, unknown> | null;
  initialAgeMs?: number | null;
  extras?: { id: string; name: string }[];
}) {
  // first paint already has the kiosk's lists (server-rendered from the bus)
  const [status, setStatus] = useState<KioskStatus | null>(initialStatus as KioskStatus | null);
  const [ageMs, setAgeMs] = useState<number | null>(initialAgeMs);
  // when this phone last heard the bus at all: a dropped hotspot / stopped
  // laptop must read as "waiting for kiosk…", not as the last status frozen
  const [heardAt, setHeardAt] = useState<number>(() => Date.now());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const repeatOk = useRef(createRepeatGuard());
  const programsRef = useRef<KioskStatus["programs"]>((initialStatus as KioskStatus | null)?.programs ?? null);
  const revRef = useRef<number>(0);
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // LIVE source (Karel 2026-10-15: "play any sound on the laptop and it feeds
  // resonance in live mode … either mic or the sound from laptop. i need both")
  const [liveSrc, setLiveSrc] = useState<LiveSrc>("mic");

  useEffect(() => {
    // no lists from the server (kiosk not reporting yet)? the last ones this
    // phone saw — never an empty picker
    if (!programsRef.current) {
      try {
        const cached = window.localStorage.getItem(PROGRAMS_CACHE_KEY);
        if (cached) {
          programsRef.current = JSON.parse(cached);
          setStatus((st) => ({ ...(st ?? {}), programs: programsRef.current }));
        }
      } catch { /* storage blocked */ }
    }
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const q = [keyQuery(), `have=${revRef.current}`].filter(Boolean).join("&");
        // a dropped hotspot can hang a request for a minute: give up and retry
        const res = await fetch(`/api/pack/remote?${q}`, { cache: "no-store", signal: timeoutSignal(POLL_TIMEOUT_MS) });
        if (res.ok && !stopped) {
          const data = await res.json();
          const st = (data.status ?? null) as KioskStatus | null;
          if (st && st.programs !== undefined) {
            revRef.current = Number(data.programsRev) || 0;
            // Live Theatre / DJ mode report no lists (null): keep the last ones —
            // the set lists stay on the phone (a tap there returns to the loop
            // at that track) and the cache is never wiped to an empty picker
            if (Array.isArray(st.programs) && st.programs.length > 0) {
              programsRef.current = st.programs;
              try { window.localStorage.setItem(PROGRAMS_CACHE_KEY, JSON.stringify(st.programs)); } catch { /* ok */ }
            }
          }
          setStatus(st ? { ...st, programs: programsRef.current } : programsRef.current ? { programs: programsRef.current } : null);
          setAgeMs(data.statusAgeMs ?? null);
          setHeardAt(Date.now());
        }
      } catch { /* hotspot blip */ }
      inFlight = false;
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(() => void poll(), STATUS_POLL_MS);
    };
    // fast while looked at, silent in the pocket; instant catch-up on return
    const onVis = () => {
      if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void poll(); }
    };
    document.addEventListener("visibilitychange", onVis);
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const send = useCallback(async (command: string, guardKey: string = command) => {
    // a double tap sends once (remote-send-guard.ts); a toggle keys on what it
    // showed, so Pause → Play right after the label flips still goes through
    if (!repeatOk.current(guardKey, Date.now())) return;
    setSending(command);
    setSendError(null);
    try {
      const q = keyQuery();
      const res = await fetch(`/api/pack/remote${q ? `?${q}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        signal: timeoutSignal(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        setSendError(`Command not accepted (HTTP ${res.status}) — try again`);
      }
    } catch {
      // Surfaced instead of silently swallowed — on a hotspot LAN a
      // dropped command looks identical to a slow kiosk otherwise.
      setSendError("Command didn't reach the kiosk — check the hotspot connection");
    }
    setTimeout(() => setSending(null), 600);
  }, []);

  // the kiosk's own answer wins (a reloaded phone, or a switch from another phone)
  useEffect(() => {
    const k = status?.liveSrc;
    if (k === "mic" || k === "laptop" || k === "both") setLiveSrc(k);
  }, [status?.liveSrc]);
  const effAgeMs = ageMs === null ? null : ageMs + Math.max(0, nowTick - heardAt);
  const stale = effAgeMs === null || effAgeMs > 10_000;

  // Glass Button overrides — keep the remote's touch-first sizing and the
  // readable ink level; active state preserved for tap feedback.
  const btn =
    "h-auto min-h-11 px-4 py-3.5 text-sm font-normal text-ink active:bg-white/[0.15]";

  return (
    <RemoteTabs
      status={status}
      stale={stale}
      ageMs={effAgeMs}
      sending={sending}
      sendError={sendError}
      send={send}
      liveSrc={liveSrc}
      setLiveSrc={setLiveSrc}
      btn={btn}
      extras={extras}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────
// TABS (Karel 2026-10-16: "for the phone remote need it to be super simple to
// use … best ui design patterns"). Three modes, one bottom tab bar:
//   Sets   — every set, Joseph's included ("just another set"), one presenter
//   Live   — live visuals from the mic (the Nord, the room); laptop sound optional
//   More   — titles, volume, glitch mark, title card, extras, recovery
// A tab only BROWSES — commands go out from the buttons inside it. The tab of
// the kiosk's current mode carries a dot, and the app opens on it.
// ─────────────────────────────────────────────────────────────────────────

type Tab = "sets" | "live" | "more";

function modeOf(st: KioskStatus | null): Tab | null {
  if (!st?.context) return null;
  if (st.context === "loop") return "sets";
  if (st.context === "live") return st.liveset ? "sets" : "live";
  return "more";
}

const SRC_NAME: Record<LiveSrc, string> = { mic: "the mic", laptop: "laptop sound", both: "mic + laptop sound" };

const label = "font-mono text-[11px] uppercase tracking-widest text-ink-faint";
const title = "font-sans font-medium tracking-tight";

function RemoteTabs({
  status,
  stale,
  ageMs,
  sending,
  sendError,
  send,
  liveSrc,
  setLiveSrc,
  btn,
  extras,
}: {
  status: KioskStatus | null;
  stale: boolean;
  ageMs: number | null;
  sending: string | null;
  sendError: string | null;
  send: (command: string, guardKey?: string) => Promise<void>;
  liveSrc: LiveSrc;
  setLiveSrc: (s: LiveSrc) => void;
  btn: string;
  extras: { id: string; name: string }[];
}) {
  const mode = modeOf(status);
  const [tab, setTab] = useState<Tab>(() => mode ?? "sets");
  // the kiosk changed mode (here or from another phone): follow it
  const lastMode = useRef<Tab | null>(mode);
  useEffect(() => {
    if (mode && mode !== lastMode.current) setTab(mode);
    lastMode.current = mode;
  }, [mode]);
  const go = (t: Tab) => {
    setTab(t);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };
  const fire = (c: string) => void send(c);

  const inLoop = status?.context === "loop";
  const inLive = status?.context === "live";
  const ls = inLive && status?.liveset?.set === "joseph" ? status.liveset : null;
  const playingSomething = !stale && ((inLoop && status?.isPlaying !== false) || inLive || status?.context === "room");

  // ── now on screen (every tab) ──────────────────────────────────────
  const nowLine = stale
    ? "Waiting for kiosk…"
    : ls
      ? `Joseph · ${ls.index} of ${ls.count} · ${ls.title ?? ""}`
      : inLive
        ? `Live · listening to ${SRC_NAME[(status?.liveSrc as LiveSrc) in SRC_NAME ? (status?.liveSrc as LiveSrc) : "mic"]}`
        : inLoop
          ? `My sets · ${status?.journey ?? "—"}`
          : `DJ mode · ${status?.journey ?? "—"}`;

  const strip = (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex min-h-11 max-w-md items-center gap-2 px-4 py-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${stale ? "animate-pulse bg-destructive" : "bg-emerald-500"}`} />
        <span className="min-w-0 truncate text-sm text-ink-mute">{nowLine}</span>
      </div>
    </div>
  );

  const errorBox = sendError ? (
    <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{sendError}</div>
  ) : null;

  const page = (children: React.ReactNode) => (
    <div className="mx-auto max-w-md px-4 pt-5" style={{ paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))" }}>
      {errorBox}
      {children}
    </div>
  );

  const confirmInterrupt = (what: string) => !playingSomething || window.confirm(what);

  const jTracks = ls?.tracks?.length ? ls.tracks : JOSEPH_TRACKS_LOCAL;

  // ── SETS ───────────────────────────────────────────────────────────
  const setsTab = (
    <>
      {!stale && !inLoop && !ls ? (
        page(
          <div className="rounded-xl border border-primary bg-primary/10 p-4">
            <div className={`${label} text-primary`}>Not playing your sets</div>
            <p className="mt-1 mb-3 text-sm text-ink-mute">The screen is in {inLive ? "live mode" : "DJ mode"}. Bring back your sets where they left off.</p>
            <Button
              className="h-14 w-full rounded-lg text-lg text-primary-foreground active:bg-primary/75"
              onClick={() => { if (window.confirm("Stop this and play your sets?")) fire("loop"); }}
            >
              Play my sets
            </Button>
          </div>,
        )
      ) : null}
      {sendError && (stale || inLoop || ls) ? page(null) : null}
      <PresenterView
        presenter={status?.presenter ?? null}
        programs={status?.programs ?? []}
        journeyName={status?.journey ?? null}
        currentTime={status?.currentTime}
        duration={status?.duration}
        stale={stale}
        ageMs={ageMs}
        titles={status?.titles ?? null}
        josephTracks={jTracks}
        joseph={ls ? { index: ls.index, count: ls.count, title: ls.title, state: ls.state, currentTime: ls.currentTime, duration: ls.duration, next: ls.next } : null}
        send={fire}
      />
    </>
  );

  // ── LIVE — live visuals from the mic ─────────────────────────────
  const plainLive = inLive && !ls;
  const li = status?.liveinput ?? null;
  const hearsLaptop = (plainLive ? status?.liveSrc ?? liveSrc : liveSrc) === "both";
  const liveTab = page(
    <>
      <div className={`${label} mb-1`}>Live</div>
      <h1 className={`${title} mb-1 text-3xl text-ink`}>{plainLive ? "You're live" : "Go live"}</h1>
      <p className="mb-4 text-sm text-ink-mute">Visuals follow the sound in the room — your Nord, voices, a plugged-in mic.</p>
      {plainLive ? (
        <>
          <div className="mb-4 rounded-xl border border-border bg-card p-4">
            <div className={`font-mono text-[11px] uppercase tracking-widest ${li?.ok === false ? "text-destructive" : "text-emerald-400"}`}>
              {li ? (li.ok ? "Listening" : "Not listening") : "Starting…"}
            </div>
            <div className="mt-1 text-sm text-ink">{li?.inputs?.length ? li.inputs.join(" + ") : SRC_NAME[liveSrc]}</div>
            {li?.note ? <div className="mt-1 text-xs text-ink-faint">{li.note}</div> : null}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-label="Input level">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-fast" style={{ width: `${Math.min(100, Math.round((li?.level ?? 0) * 250))}%` }} />
            </div>
            {status?.midi ? <div className="mt-2 text-xs text-ink-faint">{status.midi}</div> : null}
          </div>
          <Button className="mb-2 h-[88px] w-full gap-3 rounded-lg text-xl text-primary-foreground active:bg-primary/75" onClick={() => fire("skip")}>
            New world <ArrowRight className="size-6" />
          </Button>
          <Button variant="glass" className={`${btn} mb-6 w-full`} onClick={() => { if (window.confirm("Stop live and go back to your sets?")) fire("loop"); }}>
            ■ Stop live — back to my sets
          </Button>
        </>
      ) : (
        <Button
          className="mb-6 h-[88px] w-full gap-3 rounded-lg text-xl text-primary-foreground active:bg-primary/75"
          onClick={() => {
            const src = hearsLaptop ? "both" : "mic";
            if (confirmInterrupt("Stop what's playing and go live?")) fire(`live:${src}`);
          }}
        >
          ● Go live
        </Button>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-ink-mute">Also hear laptop sound</div>
          <div className="text-xs text-ink-faint">Needs BlackHole installed</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hearsLaptop}
          className="relative flex min-h-11 min-w-14 shrink-0 items-center justify-center"
          onClick={() => {
            const next: LiveSrc = hearsLaptop ? "mic" : "both";
            setLiveSrc(next);
            if (plainLive) fire(`live:${next}`);
          }}
        >
          <span className={`block h-7 w-12 rounded-full transition-colors duration-fast ${hearsLaptop ? "bg-primary" : "bg-white/[0.14]"}`} />
          <span className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white transition-transform duration-fast ${hearsLaptop ? "translate-x-[10px]" : "-translate-x-[10px]"}`} />
        </button>
      </div>
    </>,
  );

  // ── MORE ───────────────────────────────────────────────────────────
  const holdOn = status?.presenter?.holdOn ?? "ending";
  const moreTab = page(
    <>
      <div className={`${label} mb-1`}>Settings &amp; tools</div>
      <h1 className={`${title} mb-5 text-3xl text-ink`}>More</h1>

      <div className={`${label} mb-2`}>Screen</div>
      <div className="mb-3"><TitlesRow titles={status?.titles ?? null} send={fire} /></div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-faint">A held song shows</span>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card">
          {(["ending", "title"] as const).map((h) => (
            <button
              type="button"
              key={h}
              className={`min-h-11 rounded-none px-3 text-xs transition-colors duration-instant ${holdOn === h ? "bg-primary/20 text-ink" : "text-ink-mute active:bg-white/[0.06]"}`}
              onClick={() => fire(`holdon:${h}`)}
            >
              {h === "ending" ? "Its ending" : "Title card"}
            </button>
          ))}
        </div>
      </div>

      <div className={`${label} mb-2`}>Volume</div>
      <div className="mb-6 grid grid-cols-5 gap-2">
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
          <Button
            variant="glass"
            key={v}
            className={`${btn} px-0 py-2.5 text-center ${status?.volume !== undefined && Math.abs(status.volume - v) < 0.1 ? "border-white/40" : ""}`}
            onClick={() => fire(`volume:${v}`)}
          >
            {Math.round(v * 100)}
          </Button>
        ))}
      </div>

      {inLoop ? (
        <>
          <div className={`${label} mb-2`}>Title card</div>
          <div className="mb-6">
            {(status?.journey ?? "").includes("HOLDING") ? (
              <Button variant="glass" className={`${btn} w-full bg-white/[0.14]`} onClick={() => fire("title-release")}>
                ▶ Start Rise Above
              </Button>
            ) : (
              <Button
                variant="glass"
                className={`${btn} w-full`}
                onClick={() => {
                  // confirmed — a pocket tap would stop the show
                  if (window.confirm("Fade out and hold the title card until you press Start?")) fire("title-hold");
                }}
              >
                Title card — hold
              </Button>
            )}
          </div>
          <div className={`${label} mb-2`}>Skip</div>
          <div className="mb-6 grid grid-cols-2 gap-2">
            <Button variant="glass" className={btn} onClick={() => fire("prev")}>◀ Previous</Button>
            <Button variant="glass" className={btn} onClick={() => fire("skip")}>Next ▶</Button>
            <Button variant="glass" className={btn} onClick={() => fire("set-prev")}>◀ Set</Button>
            <Button variant="glass" className={btn} onClick={() => fire("set-next")}>Set ▶</Button>
          </div>
        </>
      ) : null}

      <div className={`${label} mb-2`}>Something looks wrong?</div>
      {/* MARK (Karel 2026-10-12): tap the moment something looks wrong —
          the kiosk logs the journey + exact second for Claude to find */}
      <Button variant="glass" className={`${btn} mb-6 w-full`} onClick={() => fire(`mark:${Date.now()}`)}>
        ⚑ Mark glitch
      </Button>

      <div className={`${label} mb-2`}>Start from</div>
      <div className="mb-6 grid gap-2">
        {START_POINTS.map((sp) => (
          <Button
            variant="glass"
            key={sp.cmd}
            className={`${btn} w-full ${sending === sp.cmd ? "bg-white/[0.18]" : ""}`}
            onClick={() => {
              // Confirmed — a pocket tap mid-journey would restart the show.
              if (window.confirm(`Jump to “${sp.label}”?`)) fire(sp.cmd);
            }}
          >
            {sp.label}
          </Button>
        ))}
      </div>

      <details className="mb-6 rounded-xl border border-border bg-card px-4 py-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-ink-mute">Extras — DJ mode</summary>
        <p className="mb-3 text-xs text-ink-faint">Plays one journey outside your sets{inLoop ? ", then Resume brings the loop back" : ""}.</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {extras.filter((j) => !(status?.programs ?? []).some((p) => p.journeys.some((pj) => pj.id === j.id))).map((j) => (
            <Button
              variant="glass"
              key={j.id}
              className={`${btn} py-2.5 justify-start text-left ${sending === `journey:${j.id}` ? "bg-white/[0.18]" : ""}`}
              onClick={() => {
                if (inLoop) {
                  void send("break");
                  // the loop drops journey: — give the break a beat to land first
                  setTimeout(() => void send(`journey:${j.id}`), 3500);
                } else {
                  void send(`journey:${j.id}`);
                }
              }}
            >
              <span className="block truncate">{j.name}</span>
            </Button>
          ))}
        </div>
        {inLoop ? (
          <Button variant="glass" className={`${btn} mb-3 w-full`} onClick={() => fire("break")}>Break in — DJ mode</Button>
        ) : status?.context === "room" ? (
          <Button variant="glass" className={`${btn} mb-3 w-full`} onClick={() => fire("loop")}>Resume my sets</Button>
        ) : null}
      </details>

      <div className={`${label} mb-2`}>Recovery</div>
      <Button
        variant="glass"
        className={`${btn} mb-6 w-full ${sending === "reload" ? "bg-white/[0.18]" : ""}`}
        onClick={() => {
          // The one recovery that fixes most wedges — confirmed so a
          // pocket tap can't restart the show mid-journey.
          if (window.confirm("Reload the kiosk display? It restarts what it was showing.")) fire("reload");
        }}
      >
        Reload kiosk display
      </Button>
    </>,
  );

  const TABS: { id: Tab; name: string; Icon: typeof ListMusic }[] = [
    { id: "sets", name: "Sets", Icon: ListMusic },
    { id: "live", name: "Live", Icon: Mic },
    { id: "more", name: "More", Icon: Settings2 },
  ];

  return (
    <div className="min-h-screen bg-background text-ink select-none [-webkit-tap-highlight-color:transparent] [&_button]:touch-manipulation">
      {strip}
      <div style={{ paddingBottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}>
        {tab === "sets" ? setsTab : tab === "live" ? liveTab : moreTab}
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        aria-label="Modes"
      >
        <div className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map(({ id, name, Icon }) => {
            const on = tab === id;
            return (
              <button
                type="button"
                key={id}
                aria-current={on ? "page" : undefined}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors duration-instant ${on ? "text-ink" : "text-ink-faint active:text-ink-mute"}`}
                onClick={() => go(id)}
              >
                <span className="relative">
                  <Icon className="size-6" strokeWidth={on ? 2 : 1.5} />
                  {mode === id && !stale ? (
                    <span className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" aria-label="on screen now" />
                  ) : null}
                </span>
                {name}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
