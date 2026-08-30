"use client";

import { useCallback, useEffect, useState } from "react";
import { JOURNEYS } from "@/lib/journeys/journeys";
import { INSTALLATION_PROGRAMS, TRAMOKYO_MIX_ID } from "@/lib/journeys/installation-sequence";
import { Button } from "@/components/ui/button";

// "Start from" jump points — the beginning is program 0's intro; every
// program also gets its own starting point. New programs (backlog:
// Surrounded by Light, March Light) appear here automatically once they
// land in INSTALLATION_PROGRAMS.
const START_POINTS: { cmd: string; label: string }[] = [
  // The beginning = the shuffled Tramokyo Mix (cold open included).
  { cmd: `program:${TRAMOKYO_MIX_ID}`, label: "From the beginning" },
  ...INSTALLATION_PROGRAMS.map((p) => ({
    cmd: `program:${p.id}`,
    label: p.presenting.replace(/^the /, ""),
  })),
];

interface KioskProgram {
  id: string;
  label: string;
  journeys: { id: string; name: string }[];
}

interface KioskStatus {
  context?: "loop" | "room";
  programs?: KioskProgram[] | null;
  journey?: string | null;
  track?: string | null;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  volume?: number;
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

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/pack/remote");
        if (!res.ok || stopped) return;
        const data = await res.json();
        setStatus(data.status ?? null);
        setAgeMs(data.statusAgeMs ?? null);
      } catch { /* hotspot blip */ }
    };
    void poll();
    const id = setInterval(() => void poll(), 3000);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  const send = useCallback(async (command: string) => {
    setSending(command);
    setSendError(null);
    try {
      const res = await fetch("/api/pack/remote", {
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
  const stale = ageMs === null || ageMs > 10_000;

  // Glass Button overrides — keep the remote's touch-first sizing and the
  // readable ink level; active state preserved for tap feedback.
  const btn =
    "h-auto min-h-11 px-4 py-3.5 text-sm font-normal text-ink active:bg-white/[0.15]";

  return (
    <div
      className="min-h-screen bg-background text-white px-5 py-8 max-w-md mx-auto"
      style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-xl text-white/90"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
        >
          Resonance Remote
        </h1>
        <span
          className={`h-2.5 w-2.5 rounded-full transition-colors duration-fast ${stale ? "bg-destructive" : "bg-emerald-500"}`}
          title={stale ? "Kiosk not reporting" : "Kiosk live"}
        />
      </div>

      <div className="rounded-xl p-4 mb-6 bg-white/[0.04] border border-white/10">
        <div className="text-[11px] uppercase tracking-widest text-ink-faint mb-1.5">
          {stale ? "waiting for kiosk…" : inLoop ? "attract loop" : "dj mode"}
        </div>
        <div className="text-base text-white/90 mb-0.5">
          {status?.journey ?? "—"}
        </div>
        <div className="text-sm text-white/50">
          {status?.track ?? "no track"}
          {status?.duration ? (
            <span className="text-ink-faint">
              {" "}· {fmt(status.currentTime)} / {fmt(status.duration)}
              {status.isPlaying === false ? " · paused" : ""}
            </span>
          ) : null}
        </div>
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
          </>
        )}
        <Button
          variant="glass"
          className={`${btn} col-span-2`}
          onClick={() => void send("toggle-play")}
        >
          {status?.isPlaying === false ? "Play" : "Pause"}
        </Button>

        {inLoop ? (
          <Button variant="glass" className={`${btn} col-span-2`} onClick={() => void send("break")}>
            Break in — DJ mode
          </Button>
        ) : (
          <Button variant="glass" className={`${btn} col-span-2`} onClick={() => void send("loop")}>
            Resume attract loop
          </Button>
        )}
      </div>

      {/* Program sections — track lists straight from the kiosk's built
          programs (Welcome Home, Snowflake EP, and any future program —
          Surrounded by Light / March Light — appear automatically).
          Names only, numbered; a tap jumps the loop to that journey. */}
      {(status?.programs ?? []).map((prog) => (
        <div key={prog.id}>
          <div className="mb-2 text-[11px] uppercase tracking-widest text-ink-faint">
            {prog.label}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {prog.journeys.map((j, i) => (
              <Button
                variant="glass"
                key={j.id}
                className={`${btn} py-2.5 justify-start text-left ${sending === `jump:${j.id}` ? "bg-white/[0.18]" : ""}`}
                onClick={() => void send(`jump:${j.id}`)}
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

      <div className="mb-2 text-[11px] uppercase tracking-widest text-ink-faint">
        Featured journeys {inLoop ? "(breaks into DJ mode first)" : ""}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-8">
        {JOURNEYS.map((j) => (
          <Button
            variant="glass"
            key={j.id}
            className={`${btn} py-2.5 justify-start text-left ${sending === `journey:${j.id}` ? "bg-white/[0.18]" : ""}`}
            onClick={() => {
              if (inLoop) void send("break");
              void send(`journey:${j.id}`);
            }}
          >
            <span className="block truncate">{j.name}</span>
          </Button>
        ))}
      </div>

      <div className="mb-2 text-[11px] uppercase tracking-widest text-ink-faint">Volume</div>
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

      <div className="mb-2 text-[11px] uppercase tracking-widest text-ink-faint">Start from</div>
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

      <div className="mb-2 text-[11px] uppercase tracking-widest text-ink-faint">Recovery</div>
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
