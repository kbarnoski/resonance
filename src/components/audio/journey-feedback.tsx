"use client";

import { useState, useCallback, useRef, useEffect, useSyncExternalStore } from "react";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import type { Snapshot } from "@/lib/journeys/adaptive-engine";

const STORAGE_KEY = "resonance-journey-feedback";

// ── Buffered storage writes ──
// Glitches are detected frequently; writing to localStorage synchronously
// on each one causes jank. Buffer entries and flush periodically.
let _pendingEntries: Snapshot[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 15_000; // 15 seconds

function flushEntries() {
  if (_pendingEntries.length === 0) return;
  const batch = _pendingEntries;
  _pendingEntries = [];

  // localStorage — single read/write for entire batch
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: Snapshot[] = raw ? JSON.parse(raw) : [];
    entries.push(...batch);
    const trimmed = entries.length > 500 ? entries.slice(-500) : entries;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* full */ }

  // Disk via API — send batch
  fetch("/api/journey-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
  }).catch(() => {});
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flushEntries();
  }, FLUSH_INTERVAL);
}

function appendEntry(entry: Snapshot) {
  _pendingEntries.push(entry);
  scheduleFlush();
}

/** Flush any buffered entries immediately (call on journey end) */
export function flushFeedbackEntries() {
  if (_flushTimer) {
    clearTimeout(_flushTimer);
    _flushTimer = null;
  }
  flushEntries();
}

// ── Module-level glitch counter with React subscription ──
let _glitchCount = 0;
const _listeners = new Set<() => void>();

function subscribeGlitchCount(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}
function getGlitchCountSnapshot() { return _glitchCount; }

/** Reset glitch counter — call when a new journey starts */
export function resetGlitchCount() {
  _glitchCount = 0;
  for (const cb of _listeners) cb();
}

function incrementGlitchCount() {
  _glitchCount++;
  for (const cb of _listeners) cb();
}

// ── Shared FPS tracker (single setInterval, no rAF) ──
// Used by both manual feedback and automatic glitch detection.
const _sharedFps: { current: number | null } = { current: null };
let _fpsFrameTimes: number[] = [];
let _fpsRafId = 0;
let _fpsRefCount = 0;

function startFpsTracker() {
  if (_fpsRefCount++ > 0) return; // already running
  const tick = () => {
    const now = performance.now();
    _fpsFrameTimes.push(now);
    while (_fpsFrameTimes.length > 30) _fpsFrameTimes.shift();
    if (_fpsFrameTimes.length > 1) {
      const elapsed = _fpsFrameTimes[_fpsFrameTimes.length - 1] - _fpsFrameTimes[0];
      _sharedFps.current = Math.round(((_fpsFrameTimes.length - 1) / elapsed) * 1000);
    }
    _fpsRafId = requestAnimationFrame(tick);
  };
  _fpsRafId = requestAnimationFrame(tick);
}

function stopFpsTracker() {
  if (--_fpsRefCount <= 0) {
    _fpsRefCount = 0;
    cancelAnimationFrame(_fpsRafId);
    _fpsFrameTimes = [];
    _sharedFps.current = null;
  }
}

/** Shared FPS ref for glitch detector (avoids duplicate rAF loop) */
export function getSharedFpsRef() { return _sharedFps; }
export { startFpsTracker, stopFpsTracker };

/** Build a full context snapshot of the current moment */
function buildSnapshot(type: Snapshot["type"], fpsRef: { current: number | null }): Snapshot {
  const state = useAudioStore.getState();
  const journey = state.activeJourney;

  const entry: Snapshot = {
    type,
    ts: new Date().toISOString(),
    journeyId: journey?.id ?? null,
    journeyName: journey?.name ?? null,
    realmId: journey?.realmId ?? null,
    currentTime: Math.round(state.currentTime * 10) / 10,
    duration: Math.round(state.duration * 10) / 10,
    progress: 0,
    phase: null,
    phaseLabel: null,
    phaseProgress: 0,
    shader: state.vizMode,
    dualShader: null,
    shaderOpacity: 1,
    aiPromptSnippet: null,
    isLightBg: false,
    bloom: 0,
    halation: 0,
    vignette: 0,
    particleDensity: 0,
    chromaticAberration: 0,
    fps: fpsRef.current,
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    mobile: typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent),
  };

  // Get rich frame data from journey engine
  if (journey && state.duration > 0) {
    const progress = state.currentTime / state.duration;
    entry.progress = Math.round(progress * 1000) / 1000;

    try {
      const engine = getJourneyEngine();
      const frame = engine.getFrame(progress);
      if (frame) {
        entry.phase = frame.phase;
        entry.dualShader = frame.dualShaderMode ?? null;
        entry.shaderOpacity = frame.shaderOpacity;
        entry.bloom = frame.bloomIntensity;
        entry.halation = frame.halation;
        entry.vignette = frame.vignette;
        entry.particleDensity = frame.particleDensity;
        entry.chromaticAberration = frame.chromaticAberration;
        entry.aiPromptSnippet = frame.aiPrompt.slice(0, 120);
        entry.isLightBg = /WHITE BACKGROUND|PALE BACKGROUND/i.test(frame.aiPrompt);
      }
    } catch { /* engine not running */ }

    // Phase label from journey definition
    if (entry.phase && journey.phaseLabels) {
      entry.phaseLabel = journey.phaseLabels[entry.phase as keyof typeof journey.phaseLabels] ?? entry.phase;
    }

    // Phase progress
    for (const p of journey.phases) {
      if (progress >= p.start && progress < p.end) {
        entry.phaseProgress = Math.round(((progress - p.start) / (p.end - p.start)) * 100) / 100;
        break;
      }
    }
  }

  return entry;
}

/** Record a glitch detected automatically by the shader monitor */
export function recordGlitch(
  layerName: string,
  fromOpacity: number,
  toOpacity: number,
  shaderMode: string,
  dualShader: string | null,
  fpsRef: { current: number | null },
) {
  incrementGlitchCount();
  const entry = buildSnapshot("glitch", fpsRef);
  // Override shader info with what the glitch detector observed
  entry.shader = shaderMode;
  entry.dualShader = dualShader;
  // Stash glitch details in the prompt snippet field
  entry.aiPromptSnippet = `${layerName}: ${fromOpacity.toFixed(2)}→${toOpacity.toFixed(2)}`;
  appendEntry(entry);
}

interface JourneyFeedbackProps {
  visible: boolean;
}

export function JourneyFeedback({ visible }: JourneyFeedbackProps) {
  const [flash, setFlash] = useState<"dislike" | "love" | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<"dislike" | "love" | null>(null);

  // Subscribe to glitch count for live display
  const glitchCount = useSyncExternalStore(subscribeGlitchCount, getGlitchCountSnapshot, getGlitchCountSnapshot);

  // Start shared FPS tracker (ref-counted, shared with glitch detector)
  useEffect(() => {
    startFpsTracker();
    return () => stopFpsTracker();
  }, []);

  const recordFeedback = useCallback((type: "dislike" | "love") => {
    const entry = buildSnapshot(type, _sharedFps);
    appendEntry(entry);

    // Visual flash
    setFlash(type);
    setTimeout(() => setFlash(null), 600);
  }, []);

  if (!visible) return null;

  const dislikeActive = flash === "dislike";
  const dislikeHover = hoveredBtn === "dislike" && !dislikeActive;
  const loveActive = flash === "love";
  const loveHover = hoveredBtn === "love" && !loveActive;

  return (
    <div
      className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2"
      style={{ zIndex: 60, pointerEvents: "auto" }}
    >
      {/* Thumbs down — dislike this visual moment */}
      <button
        onClick={() => recordFeedback("dislike")}
        onMouseEnter={() => setHoveredBtn("dislike")}
        onMouseLeave={() => setHoveredBtn(null)}
        className="flex items-center justify-center rounded-full"
        style={{
          width: 36,
          height: 36,
          background: dislikeActive
            ? "rgba(239, 68, 68, 0.4)"
            : dislikeHover
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(0, 0, 0, 0.3)",
          border: `1px solid ${
            dislikeActive
              ? "rgba(239, 68, 68, 0.5)"
              : dislikeHover
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255, 255, 255, 0.12)"
          }`,
          backdropFilter: "blur(8px)",
          transform: dislikeActive ? "scale(1.15)" : "scale(1)",
          transition: "all 150ms ease",
          cursor: "pointer",
        }}
        title="Dislike this moment"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke={dislikeActive ? "rgba(239, 68, 68, 0.9)" : dislikeHover ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.5)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "stroke 150ms ease" }}>
          <path d="M17 14V2" />
          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>

      {/* Heart — love this moment */}
      <button
        onClick={() => recordFeedback("love")}
        onMouseEnter={() => setHoveredBtn("love")}
        onMouseLeave={() => setHoveredBtn(null)}
        className="flex items-center justify-center rounded-full"
        style={{
          width: 36,
          height: 36,
          background: loveActive
            ? "rgba(236, 72, 153, 0.4)"
            : loveHover
              ? "rgba(255, 255, 255, 0.12)"
              : "rgba(0, 0, 0, 0.3)",
          border: `1px solid ${
            loveActive
              ? "rgba(236, 72, 153, 0.5)"
              : loveHover
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255, 255, 255, 0.12)"
          }`,
          backdropFilter: "blur(8px)",
          transform: loveActive ? "scale(1.15)" : "scale(1)",
          transition: "all 150ms ease",
          cursor: "pointer",
        }}
        title="Love this moment"
      >
        <svg width="14" height="14" viewBox="0 0 24 24"
          fill={loveActive ? "rgba(236, 72, 153, 0.8)" : loveHover ? "rgba(255, 255, 255, 0.15)" : "none"}
          stroke={loveActive ? "rgba(236, 72, 153, 0.9)" : loveHover ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.5)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: "all 150ms ease" }}>
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
      </button>

      {/* Glitch counter — auto-detected, increments live */}
      <span
        style={{
          fontFamily: "var(--font-geist-mono)",
          fontSize: "0.65rem",
          color: glitchCount > 0 ? "rgba(239, 68, 68, 0.7)" : "rgba(255, 255, 255, 0.25)",
          letterSpacing: "0.04em",
          minWidth: "16px",
          textAlign: "center",
          transition: "color 300ms ease",
        }}
        title={`${glitchCount} shader glitch${glitchCount !== 1 ? "es" : ""} detected`}
      >
        {glitchCount}
      </span>
    </div>
  );
}
