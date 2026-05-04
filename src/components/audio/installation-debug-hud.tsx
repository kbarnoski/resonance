"use client";

import { useEffect, useState } from "react";
import { useAudioStore } from "@/lib/audio/audio-store";
import {
  getAudioEngine,
  isAudioElementUnlocked,
  getLastPrimingError,
  getLastPlayError,
} from "@/lib/audio/audio-engine";

interface DebugSnapshot {
  ctxState: string;
  unlocked: boolean;
  primingError: string | null;
  playError: string | null;
  paused: boolean;
  src: string;
  audioErr: string | null;
  readyState: number;
  networkState: number;
  curTime: number;
  duration: number;
  isPlaying: boolean;
  trackTitle: string;
  trackUrl: string;
  journeyName: string;
  journeyPhase: string;
}

// Persistent global log of journey-track failures so the HUD can show
// what went wrong even after the loop moved past the broken journey.
interface FailureRecord {
  journey: string;
  track: string;
  reason: string;
  at: number;
}
declare global {
  interface Window {
    __resonanceInstallFailures?: FailureRecord[];
  }
}
function getFailureLog(): FailureRecord[] {
  if (typeof window === "undefined") return [];
  return window.__resonanceInstallFailures ?? [];
}
export function logInstallFailure(rec: Omit<FailureRecord, "at">): void {
  if (typeof window === "undefined") return;
  if (!window.__resonanceInstallFailures) window.__resonanceInstallFailures = [];
  window.__resonanceInstallFailures.push({ ...rec, at: Date.now() });
}

/**
 * Small live debug overlay shown only when ?debug=1 is on the URL or
 * in dev. Reads audio + journey state directly from the engine + store
 * every 250ms so we can see what's actually happening without console
 * access — invaluable for diagnosing "no audio" / "no images" remotely.
 */
export function InstallationDebugHud() {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);

  useEffect(() => {
    const tick = () => {
      let ctxState = "n/a";
      let paused = true;
      let src = "";
      let primingError: string | null = null;
      let audioErr: string | null = null;
      let readyState = 0;
      let networkState = 0;
      try {
        const engine = getAudioEngine();
        ctxState = engine.audioContext.state;
        const el = engine.audioElement;
        paused = el.paused;
        src = el.src.slice(0, 80);
        readyState = el.readyState;
        networkState = el.networkState;
        if (el.error) {
          // MediaError codes:
          //   1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED
          const codes = ["", "ABORTED", "NETWORK", "DECODE", "SRC_NOT_SUPPORTED"];
          audioErr = `${codes[el.error.code] || el.error.code}: ${el.error.message || "(no msg)"}`;
        }
        primingError = getLastPrimingError();
      } catch {
        ctxState = "engine init failed";
      }
      const s = useAudioStore.getState();
      setSnap({
        ctxState,
        unlocked: isAudioElementUnlocked(),
        primingError,
        playError: getLastPlayError(),
        paused,
        src,
        audioErr,
        readyState,
        networkState,
        curTime: s.currentTime,
        duration: s.duration,
        isPlaying: s.isPlaying,
        trackTitle: s.currentTrack?.title ?? "—",
        trackUrl: s.currentTrack?.audioUrl ?? "—",
        journeyName: s.activeJourney?.name ?? "—",
        journeyPhase: s.journeyPhase ?? "—",
      });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, []);

  if (!snap) return null;

  const row = (label: string, value: string | number | boolean, ok?: boolean) => (
    <div className="flex justify-between gap-4">
      <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
      <span style={{ color: ok === false ? "#f87171" : ok === true ? "#86efac" : "rgba(255,255,255,0.85)" }}>
        {String(value)}
      </span>
    </div>
  );

  return (
    <div
      className="absolute z-[70] pointer-events-none"
      style={{
        top: "12px",
        left: "12px",
        padding: "10px 12px",
        background: "rgba(0, 0, 0, 0.7)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "6px",
        fontFamily: "var(--font-geist-mono)",
        fontSize: "10px",
        lineHeight: 1.55,
        minWidth: "320px",
        maxWidth: "420px",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          color: "rgba(196, 181, 253, 0.85)",
          fontSize: "9px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: "6px",
        }}
      >
        Installation Debug
      </div>
      {row("audio ctx", snap.ctxState, snap.ctxState === "running")}
      {row("audio unlocked", snap.unlocked, snap.unlocked)}
      {snap.primingError && row("priming err", snap.primingError.slice(0, 50), false)}
      {snap.playError && row("PLAY REJECT", snap.playError.slice(0, 60), false)}
      {snap.audioErr && row("AUDIO ERROR", snap.audioErr.slice(0, 60), false)}
      {row("readyState", snap.readyState, snap.readyState >= 2)}
      {row("networkState", snap.networkState)}
      {row("paused", snap.paused, !snap.paused)}
      {row("isPlaying (store)", snap.isPlaying, snap.isPlaying)}
      {row("currentTime", `${snap.curTime.toFixed(1)} / ${snap.duration.toFixed(1)}`)}
      {row("track", snap.trackTitle.slice(0, 40))}
      {row("src", snap.src ? snap.src.slice(0, 50) + "…" : "—")}
      {row("journey", snap.journeyName.slice(0, 40))}
      {row("phase", snap.journeyPhase)}

      {/* Persistent failure log */}
      {(() => {
        const failures = getFailureLog();
        if (failures.length === 0) return null;
        return (
          <div
            style={{
              marginTop: "10px",
              paddingTop: "8px",
              borderTop: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div
              style={{
                color: "rgba(248, 113, 113, 0.85)",
                fontSize: "9px",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: "4px",
              }}
            >
              Failed Journeys ({failures.length})
            </div>
            {failures.slice(-6).map((f, i) => (
              <div key={i} style={{ color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>
                <div style={{ color: "rgba(255,255,255,0.8)" }}>{f.journey}</div>
                <div style={{ paddingLeft: "8px", color: "rgba(255,255,255,0.45)" }}>
                  track: {f.track.slice(0, 40)}
                </div>
                <div style={{ paddingLeft: "8px", color: "rgba(248,113,113,0.85)" }}>
                  reason: {f.reason}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
