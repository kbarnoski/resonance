"use client";

import { useCallback, useEffect, useState } from "react";
import { JOURNEYS } from "@/lib/journeys/journeys";
import { PAIRED_TRACKS } from "@/lib/journeys/paired-tracks";
import { INSTALLATION_PROGRAMS, TRAMOKYO_MIX_ID } from "@/lib/journeys/installation-sequence";
import { Button } from "@/components/ui/button";
import { PresenterView, type PresenterStatus } from "./presenter-view";

// "Start from" jump points — the beginning is program 0's intro; every
// program also gets its own starting point. New programs (backlog:
// Surrounded by Light, March Light) appear here automatically once they
// land in INSTALLATION_PROGRAMS.
const START_POINTS: { cmd: string; label: string }[] = [
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
  ...INSTALLATION_PROGRAMS.map((p) => ({
    cmd: `program:${p.id}`,
    label: p.presenting.replace(/^the /, ""),
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
}

function fmt(sec: number | undefined): string {
  if (!sec || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function RemoteClient() {
  const [status, setStatus] = useState<KioskStatus | null>(null);
  const [ageMs, setAgeMs] = useState<number | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  // the presenter is the main screen; every other control lives behind the Live pill
  const [controlsOpen, setControlsOpen] = useState(false);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/pack/remote${typeof window !== "undefined" && new URLSearchParams(window.location.search).get("key") ? `?key=${new URLSearchParams(window.location.search).get("key")}` : ""}`);
        if (!res.ok || stopped) return;
        const data = await res.json();
        setStatus(data.status ?? null);
        setAgeMs(data.statusAgeMs ?? null);
      } catch { /* hotspot blip */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 2000);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  const send = useCallback(async (command: string) => {
    setSending(command);
    setSendError(null);
    try {
      const res = await fetch(`/api/pack/remote${typeof window !== "undefined" && new URLSearchParams(window.location.search).get("key") ? `?key=${new URLSearchParams(window.location.search).get("key")}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
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

  const inLoop = status?.context === "loop";
  const inLive = status?.context === "live";
  const stale = ageMs === null || ageMs > 10_000;

  // Glass Button overrides — keep the remote's touch-first sizing and the
  // readable ink level; active state preserved for tap feedback.
  const btn =
    "h-auto min-h-11 px-4 py-3.5 text-sm font-normal text-ink active:bg-white/[0.15]";

  // PRESENTER main screen (auto-play / song by song) whenever the kiosk is
  // in (or waiting to report) the loop; Live Theatre and DJ mode keep the
  // full controls below
  if (!controlsOpen && !inLive && (inLoop || stale)) {
    return (
      <>
        {sendError ? (
          <div className="mx-auto max-w-md px-4 pt-4">
            <div className="rounded-xl px-4 py-3 text-sm text-destructive bg-destructive/10 border border-destructive/25">
              {sendError}
            </div>
          </div>
        ) : null}
        <PresenterView
          presenter={status?.presenter ?? null}
          programs={status?.programs ?? []}
          journeyName={status?.journey ?? null}
          currentTime={status?.currentTime}
          duration={status?.duration}
          stale={stale}
          send={(c) => void send(c)}
          onControls={() => setControlsOpen(true)}
        />
      </>
    );
  }

  return (
    <div
      className="min-h-screen bg-background text-ink px-5 py-8 max-w-md mx-auto"
      style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {inLoop && controlsOpen ? (
        <button
          type="button"
          className="mb-3 inline-flex min-h-11 items-center text-sm text-ink-mute active:text-ink"
          onClick={() => setControlsOpen(false)}
        >
          ← Presenter
        </button>
      ) : null}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-sans text-xl font-medium tracking-tight text-ink">
          Resonance Remote
        </h1>
        <span
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-fast ${stale ? "bg-destructive" : "bg-emerald-500"}`}
          title={stale ? "Kiosk not reporting" : "Kiosk live"}
        />
      </div>

      <div className="rounded-xl p-4 mb-6 bg-card border border-border">
        <div className="font-mono text-[11px] uppercase tracking-widest text-ink-faint mb-1.5">
          {stale ? "waiting for kiosk…" : inLive ? "live theatre — listening" : inLoop ? "attract loop" : "dj mode"}
        </div>
        <div className="font-sans text-2xl font-medium tracking-tight text-ink mb-0.5">
          {status?.journey ?? "—"}
        </div>
        <div className="text-sm text-ink-mute">
          {status?.track ?? "no track"}
          {status?.duration ? (
            <span className="text-ink-faint">
              {" "}· {fmt(status.currentTime)} / {fmt(status.duration)}
              {status.isPlaying === false ? " · paused" : ""}
            </span>
          ) : null}
        </div>
        {inLive && status?.midi ? (
          <div className="mt-1.5 text-xs text-ink-faint">{status.midi}</div>
        ) : null}
      </div>

      {sendError ? (
        <div className="rounded-xl px-4 py-3 mb-6 text-sm text-destructive bg-destructive/10 border border-destructive/25">
          {sendError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 mb-6">
        {inLoop && (
          <>
            <Button variant="glass" className={btn} onClick={() => void send("prev")}>
              ◀ Previous
            </Button>
            <Button variant="glass" className={btn} onClick={() => void send("skip")}>
              Next ▶
            </Button>
            <Button variant="glass" className={btn} onClick={() => void send("set-prev")}>
              ◀ Set
            </Button>
            <Button variant="glass" className={btn} onClick={() => void send("set-next")}>
              Set ▶
            </Button>
          </>
        )}
        {inLoop && (
          // Karel 2026-10-10: put the title card (piano + "Resonance") up and
          // HOLD it for the introduction; Start begins Rise Above from it
          (status?.journey ?? "").includes("HOLDING") ? (
            <Button variant="glass" className={`${btn} col-span-2 bg-white/[0.14]`} onClick={() => void send("title-release")}>
              ▶ Start Rise Above
            </Button>
          ) : (
            <Button
              variant="glass"
              className={`${btn} col-span-2`}
              onClick={() => {
                // confirmed — a pocket tap would stop the show
                if (window.confirm("Fade out and hold the title card until you press Start?")) void send("title-hold");
              }}
            >
              Title card — hold
            </Button>
          )
        )}
        {inLive ? (
          // LIVE THEATRE (Karel 2026-10-11): the kiosk listens to the Nord and
          // wanders the catalogue; Next opens another world now
          <Button variant="glass" className={`${btn} col-span-2`} onClick={() => void send("skip")}>
            Next world ▶
          </Button>
        ) : (
          <>
            <Button
              variant="glass"
              className={`${btn} col-span-2`}
              onClick={() => void send("toggle-play")}
            >
              {status?.isPlaying === false ? "Play" : "Pause"}
            </Button>
            <Button
              variant="glass"
              className={`${btn} col-span-2`}
              onClick={() => {
                // confirmed — a pocket tap would stop the show
                if (window.confirm("Go LIVE? The kiosk listens to your playing and wanders every world until you press Back to loop.")) void send("live");
              }}
            >
              ● Live — I&apos;m playing
            </Button>
          </>
        )}

        {/* MARK (Karel 2026-10-12): tap the moment something looks wrong —
            the kiosk logs the journey + exact second for Claude to find */}
        <Button variant="glass" className={`${btn} col-span-2`} onClick={() => void send(`mark:${Date.now()}`)}>
          ⚑ Mark glitch
        </Button>
        {inLoop ? (
          <Button variant="glass" className={`${btn} col-span-2`} onClick={() => void send("break")}>
            Break in — DJ mode
          </Button>
        ) : (
          <Button variant="glass" className={`${btn} col-span-2`} onClick={() => void send("loop")}>
            {inLive ? "■ Back to loop" : "Resume attract loop"}
          </Button>
        )}
      </div>

      {/* Program sections — track lists straight from the kiosk's built
          programs (Welcome Home, Snowflake EP, and any future program —
          Surrounded by Light / March Light — appear automatically).
          Names only, numbered; a tap jumps the loop to that journey. */}
      {(status?.programs ?? []).map((prog) => (
        <div key={prog.id}>
          <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
            {prog.label}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {prog.journeys.map((j, i) => (
              <Button
                variant="glass"
                key={`${j.id}-${i}`}
                className={`${btn} py-2.5 justify-start text-left ${sending === `jump:${j.id}@${prog.id}` ? "bg-white/[0.18]" : ""}`}
                onClick={() => void send(`jump:${j.id}@${prog.id}`)}
              >
                <span className="mr-2 shrink-0 font-mono text-[10px] text-ink-faint">
                  {i + 1}
                </span>
                <span className="block truncate">{j.name}</span>
              </Button>
            ))}
          </div>
        </div>
      ))}

      <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        Extras — DJ mode {inLoop ? "(plays one journey, then Resume the loop)" : ""}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-8">
        {/* Paired journeys only (2026-09-19 audit): deterministic mode
            404s unpaired resolves, which used to strand a silent journey.
            The break→journey pair is also sequenced — both commands in
            one poll batch made the loop-context kiosk drop journey:. */}
        {/* Karel 2026-09-20: journeys IN the show are tapped from their
            program sections above (loop jump → continues in setlist
            order). This DJ section offers only the extras, so choosing
            a show track can never strand playback outside the loop. */}
        {JOURNEYS.filter((j) => {
          if (!(j.recordingId || PAIRED_TRACKS[j.id])) return false;
          const inShow = (status?.programs ?? []).some((p) =>
            p.journeys.some((pj) => pj.id === j.id),
          );
          return !inShow;
        }).map((j) => (
          <Button
            variant="glass"
            key={j.id}
            className={`${btn} py-2.5 justify-start text-left ${sending === `journey:${j.id}` ? "bg-white/[0.18]" : ""}`}
            onClick={() => {
              if (inLoop) {
                void send("break");
                // The kiosk drains the bus every ~2s and drops journey:
                // while still in loop context — give the break a beat to
                // land and navigate before the journey command arrives.
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

      <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">Volume</div>
      <div className="grid grid-cols-5 gap-2 mb-8">
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
          <Button
            variant="glass"
            key={v}
            className={`${btn} px-0 py-2.5 text-center ${status?.volume !== undefined && Math.abs(status.volume - v) < 0.1 ? "border-white/40" : ""}`}
            onClick={() => void send(`volume:${v}`)}
          >
            {Math.round(v * 100)}
          </Button>
        ))}
      </div>

      <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">Start from</div>
      <div className="mb-8 grid gap-2">
        {START_POINTS.map((sp) => (
          <Button
            variant="glass"
            key={sp.label}
            className={`${btn} w-full ${sending === sp.cmd ? "bg-white/[0.18]" : ""}`}
            onClick={() => {
              // Confirmed — a pocket tap mid-journey would restart the show.
              if (window.confirm(`Jump the loop to “${sp.label}”?`)) {
                void send(sp.cmd);
              }
            }}
          >
            {sp.label}
          </Button>
        ))}
      </div>

      <div className="mb-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">Recovery</div>
      <Button
        variant="glass"
        className={`${btn} w-full ${sending === "reload" ? "bg-white/[0.18]" : ""}`}
        onClick={() => {
          // The one recovery that fixes most wedges — confirmed so a
          // pocket tap can't restart the show mid-journey.
          if (window.confirm("Reload the kiosk display? The attract loop restarts from its intro.")) {
            void send("reload");
          }
        }}
      >
        Reload kiosk display
      </Button>
    </div>
  );
}
