"use client";

import { useCallback, useEffect, useState } from "react";
import { JOURNEYS } from "@/lib/journeys/journeys";

interface KioskStatus {
  context?: "loop" | "room";
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
    try {
      await fetch("/api/pack/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
    } catch { /* hotspot blip */ }
    setTimeout(() => setSending(null), 600);
  }, []);

  const inLoop = status?.context === "loop";
  const stale = ageMs === null || ageMs > 10_000;

  const btn =
    "rounded-xl px-4 py-3.5 text-sm text-white/85 bg-white/[0.06] border border-white/10 active:bg-white/[0.15] transition-colors";

  return (
    <div className="min-h-screen bg-black text-white px-5 py-8 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-xl text-white/90"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 300 }}
        >
          Resonance Remote
        </h1>
        <span
          className={`h-2.5 w-2.5 rounded-full ${stale ? "bg-red-500/80" : "bg-emerald-400/90"}`}
          title={stale ? "Kiosk not reporting" : "Kiosk live"}
        />
      </div>

      <div className="rounded-xl p-4 mb-6 bg-white/[0.04] border border-white/10">
        <div className="text-[11px] uppercase tracking-widest text-white/35 mb-1.5">
          {stale ? "waiting for kiosk…" : inLoop ? "attract loop" : "dj mode"}
        </div>
        <div className="text-base text-white/90 mb-0.5">
          {status?.journey ?? "—"}
        </div>
        <div className="text-sm text-white/50">
          {status?.track ?? "no track"}
          {status?.duration ? (
            <span className="text-white/30">
              {" "}· {fmt(status.currentTime)} / {fmt(status.duration)}
              {status.isPlaying === false ? " · paused" : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <button className={btn} onClick={() => void send("toggle-play")}>
          {status?.isPlaying === false ? "Play" : "Pause"}
        </button>
        {inLoop ? (
          <button className={btn} onClick={() => void send("skip")}>
            Skip journey
          </button>
        ) : (
          <button className={btn} onClick={() => void send("journey:random")}>
            Random journey
          </button>
        )}
        {inLoop ? (
          <button className={`${btn} col-span-2`} onClick={() => void send("break")}>
            Break in — DJ mode
          </button>
        ) : (
          <button className={`${btn} col-span-2`} onClick={() => void send("loop")}>
            Resume attract loop
          </button>
        )}
      </div>

      <div className="mb-2 text-[11px] uppercase tracking-widest text-white/35">
        Launch journey {inLoop ? "(breaks into DJ mode first)" : ""}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-8">
        {JOURNEYS.map((j) => (
          <button
            key={j.id}
            className={`${btn} py-2.5 text-left ${sending === `journey:${j.id}` ? "bg-white/[0.18]" : ""}`}
            onClick={() => {
              if (inLoop) void send("break");
              void send(`journey:${j.id}`);
            }}
          >
            <span className="block truncate">{j.name}</span>
          </button>
        ))}
      </div>

      <div className="mb-2 text-[11px] uppercase tracking-widest text-white/35">Volume</div>
      <div className="grid grid-cols-5 gap-2">
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => (
          <button
            key={v}
            className={`${btn} px-0 py-2.5 text-center ${status?.volume !== undefined && Math.abs(status.volume - v) < 0.1 ? "border-white/40" : ""}`}
            onClick={() => void send(`volume:${v}`)}
          >
            {Math.round(v * 100)}
          </button>
        ))}
      </div>
    </div>
  );
}
