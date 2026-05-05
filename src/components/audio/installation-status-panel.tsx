"use client";

import { useEffect, useRef, useState } from "react";
import { getAudioEngine, getLastPlayError, getLastPrimingError } from "@/lib/audio/audio-engine";

/**
 * Operator status overlay for installation mode. Hidden by default;
 * toggled with Cmd+Shift+S (or Ctrl+Shift+S on Linux/Windows). Shows
 * runtime state at a glance — uptime, current phase + journey, audio
 * playback state, AudioContext state, last error strings, sampled FPS.
 *
 * Local-only (on-screen overlay). Phone-accessible monitoring would
 * require a heartbeat POST + Supabase row + separate status route —
 * a meaningful additional task; flag as Tier 2 if needed.
 */

interface Props {
  phaseKind: string;
  phaseLabel: string;
  journeyName: string | null;
  startedAt: number;
}

export function InstallationStatusPanel({ phaseKind, phaseLabel, journeyName, startedAt }: Props) {
  const [visible, setVisible] = useState(false);
  const [, setTick] = useState(0);
  const fpsRef = useRef({ frames: 0, sampledAt: performance.now(), fps: 0 });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const refresh = setInterval(() => setTick((t) => t + 1), 1_000);
    let raf = 0;
    const onFrame = () => {
      const r = fpsRef.current;
      r.frames += 1;
      const now = performance.now();
      const elapsed = now - r.sampledAt;
      if (elapsed >= 1_000) {
        r.fps = Math.round((r.frames * 1_000) / elapsed);
        r.frames = 0;
        r.sampledAt = now;
      }
      raf = requestAnimationFrame(onFrame);
    };
    raf = requestAnimationFrame(onFrame);
    return () => {
      clearInterval(refresh);
      cancelAnimationFrame(raf);
    };
  }, [visible]);

  if (!visible) return null;

  const uptimeS = Math.floor((Date.now() - startedAt) / 1_000);
  const h = Math.floor(uptimeS / 3_600);
  const m = Math.floor((uptimeS % 3_600) / 60);
  const s = uptimeS % 60;
  const uptimeStr = `${h}h ${m}m ${s}s`;

  let audioLine = "no engine";
  let ctxState = "—";
  try {
    const engine = getAudioEngine();
    const el = engine.audioElement;
    const t = isFinite(el.currentTime) ? el.currentTime.toFixed(1) : "0.0";
    const d = isFinite(el.duration) ? el.duration.toFixed(1) : "?";
    audioLine = `${el.paused ? "PAUSED" : "playing"} · ${t}/${d}s${el.ended ? " · ended" : ""}`;
    ctxState = engine.audioContext.state;
  } catch { /* engine not yet initialized */ }

  const playErr = getLastPlayError();
  const primingErr = getLastPrimingError();

  return (
    <div
      className="fixed top-4 right-4 z-[100] bg-black/85 text-white text-xs p-4 rounded-lg border border-white/20 max-w-sm pointer-events-none"
      style={{
        fontFamily: "var(--font-geist-mono)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div className="text-white/55 uppercase tracking-wider mb-2" style={{ letterSpacing: "0.18em" }}>
        Installation status · ⌘⇧S to hide
      </div>
      <Row label="Uptime" value={uptimeStr} />
      <Row label="Phase" value={phaseLabel || phaseKind} />
      <Row label="Journey" value={journeyName ?? "—"} />
      <Row label="Audio" value={audioLine} />
      <Row label="AudioCtx" value={ctxState} />
      <Row label="FPS" value={String(fpsRef.current.fps)} />
      {playErr && <Row label="Last play err" value={playErr} muted />}
      {primingErr && <Row label="Last prime err" value={primingErr} muted />}
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-white/55">{label}</span>
      <span className={muted ? "text-amber-300/85" : "text-white"} style={{ wordBreak: "break-word", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
