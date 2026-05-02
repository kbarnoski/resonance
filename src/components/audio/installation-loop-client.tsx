"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { VisualizerClient } from "./visualizer-client";
import { useAudioStore, type Track } from "@/lib/audio/audio-store";
import { getAudioEngine, ensureResumed, primeAudioElement } from "@/lib/audio/audio-engine";
import { isDesktopApp, enterKioskMode, exitKioskMode, setCursorVisible } from "@/lib/tauri";
import type { Journey } from "@/lib/journeys/types";
import { InstallationIntro } from "./installation-intro";
import { InstallationCredits } from "./installation-credits";

/** One entry in the curated loop sequence. */
export interface SequenceEntry {
  journey: Journey;
  track: Track | null;
}

interface Props {
  sequence: SequenceEntry[];
  /** Featured-recordings pool used when a journey has no paired track. */
  fallbackTracks: Track[];
}

// ─── Timing ────────────────────────────────────────────────────────────
// Intro is held longer than a normal journey intro because the viewer is
// arriving cold; they need time to read the room.
const INTRO_MS = 14_000;
// Credits get an even longer hold — the dedication should land.
const CREDITS_MS = 16_000;
// Safety net so the loop keeps moving even when a track is missing or
// has no metadata duration. Tuned generously above the longest journey.
const MAX_JOURNEY_MS = 8 * 60 * 1_000;

type Phase =
  | { kind: "intro" }
  | { kind: "journey"; index: number }
  | { kind: "credits" };

export function InstallationLoopClient({ sequence, fallbackTracks }: Props) {
  const setInstallationMode = useAudioStore((s) => s.setInstallationMode);
  const setQueue = useAudioStore((s) => s.setQueue);
  const startJourney = useAudioStore((s) => s.startJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);

  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [chromeVisible, setChromeVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Browser autoplay gate. The desktop app doesn't enforce autoplay so we
  // skip the click prompt there; in a normal browser tab one click anywhere
  // unlocks the audio element + AudioContext for the rest of the session.
  const [started, setStarted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isDesktopApp();
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStart = useCallback(() => {
    // Both must run inside the click gesture: primeAudioElement teaches
    // iOS / Safari that this audio element is "user-allowed", and
    // ensureResumed wakes a suspended AudioContext. After this one
    // gesture, every subsequent setQueue + play in the loop just works.
    try {
      getAudioEngine();
      primeAudioElement();
    } catch { /* engine warming */ }
    void ensureResumed();
    setStarted(true);
  }, []);

  // Pick the right track for this index — paired first, then by-index from
  // the fallback pool, wrapping with modulo so any pool size works.
  const trackForIndex = useCallback(
    (i: number): Track | null => {
      const entry = sequence[i];
      if (entry?.track) return entry.track;
      if (fallbackTracks.length === 0) return null;
      return fallbackTracks[i % fallbackTracks.length] ?? null;
    },
    [sequence, fallbackTracks],
  );

  // ─── Mount: kiosk + installation flag ─────────────────────────────
  useEffect(() => {
    setInstallationMode(true);
    if (isDesktopApp()) enterKioskMode().catch(() => {});

    return () => {
      setInstallationMode(false);
      stopJourney();
      if (isDesktopApp()) exitKioskMode().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Fullscreen state sync ────────────────────────────────────────
  useEffect(() => {
    const handleChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element };
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const isFs = !!(document.fullscreenElement || doc.webkitFullscreenElement);
    if (isFs) {
      (doc.webkitExitFullscreen ?? document.exitFullscreen).call(document).catch(() => {});
    } else {
      (el.webkitRequestFullscreen ?? el.requestFullscreen).call(el).catch(() => {});
    }
  }, []);

  // ─── Cursor + chrome reveal on activity ───────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reveal = () => {
      container.style.cursor = "default";
      setCursorVisible(true).catch(() => {});
      setChromeVisible(true);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
      cursorTimerRef.current = setTimeout(() => {
        container.style.cursor = "none";
        setCursorVisible(false).catch(() => {});
      }, 3000);
      chromeTimerRef.current = setTimeout(() => {
        setChromeVisible(false);
      }, 3000);
    };
    container.addEventListener("mousemove", reveal);
    container.addEventListener("touchstart", reveal);
    // Initial hide after a beat so chrome doesn't flash on mount.
    cursorTimerRef.current = setTimeout(() => {
      container.style.cursor = "none";
      setCursorVisible(false).catch(() => {});
    }, 3000);
    return () => {
      container.removeEventListener("mousemove", reveal);
      container.removeEventListener("touchstart", reveal);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      if (chromeTimerRef.current) clearTimeout(chromeTimerRef.current);
      setCursorVisible(true).catch(() => {});
    };
  }, []);

  // ─── Key handling — capture phase, defense in depth ───────────────
  // Two goals: stop visualizer-client's Escape handler from navigating
  // away to /library, and let F still toggle fullscreen even though the
  // visualizer-client also binds F (we let the bubble continue for F).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Allow F through — visualizer-client handles it (fullscreen).
      if (e.key === "f" || e.key === "F") return;
      // Eat Escape so visualizer-client.handleExit() can't fire.
      // Browser still handles the native fullscreen-exit before our handler.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // Trap everything else so the audience can't accidentally trigger
      // shortcuts (space, arrows, h, l, t, p, v, a, etc.).
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, []);

  // ─── Phase machine ────────────────────────────────────────────────
  useEffect(() => {
    // Hold the loop until the user has tapped to unlock audio. Without
    // this gate, autoplay rejection silently strands the journey on
    // phase 0: no sound, currentTime stuck at 0, only one AI image ever
    // generates.
    if (!started) return;
    if (phase.kind === "intro") {
      const t = setTimeout(() => {
        if (sequence.length === 0) {
          setPhase({ kind: "credits" });
        } else {
          setPhase({ kind: "journey", index: 0 });
        }
      }, INTRO_MS);
      return () => clearTimeout(t);
    }

    if (phase.kind === "credits") {
      stopJourney();
      const t = setTimeout(() => {
        setPhase({ kind: "intro" });
      }, CREDITS_MS);
      return () => clearTimeout(t);
    }

    // Journey phase — load track, start journey, watch for end
    const entry = sequence[phase.index];
    if (!entry) {
      setPhase({ kind: "credits" });
      return;
    }

    // Warm engine + ensure audio context is resumed (one user gesture
    // anywhere on the page is enough; this is a no-op afterwards).
    try {
      getAudioEngine();
      ensureResumed();
    } catch { /* engine warming */ }

    const track = trackForIndex(phase.index);
    if (track) setQueue([track], 0);
    startJourney(entry.journey.id);

    // Subscribe to store; advance when audio finishes or safety expires.
    const startMs = Date.now();
    let raf = 0;
    const tick = () => {
      const { currentTime, duration } = useAudioStore.getState();
      const audioEnded = duration > 0 && currentTime >= duration - 0.5;
      const timedOut = Date.now() - startMs >= MAX_JOURNEY_MS;
      if (audioEnded || timedOut) {
        if (phase.index + 1 < sequence.length) {
          setPhase({ kind: "journey", index: phase.index + 1 });
        } else {
          setPhase({ kind: "credits" });
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sequence, started]);

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <VisualizerClient />

      {/* Fullscreen toggle — small, top-right, fades with cursor. F also
          works (passes through our key trap to visualizer-client). */}
      <button
        type="button"
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        onClick={toggleFullscreen}
        className="absolute top-6 right-6 z-30 flex items-center justify-center rounded-lg text-white/45 hover:text-white/85 transition-all"
        style={{
          width: "44px",
          height: "44px",
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          backdropFilter: "blur(8px)",
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? "auto" : "none",
        }}
        title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </button>

      {phase.kind === "intro" && <InstallationIntro />}
      {phase.kind === "credits" && <InstallationCredits />}

      {/* Browser autoplay gate. One click anywhere unlocks audio for the
          rest of the session, then this layer goes away and the loop
          starts. The desktop app skips this entirely because Tauri
          doesn't enforce autoplay restrictions. */}
      {!started && (
        <button
          type="button"
          aria-label="Begin"
          onClick={handleStart}
          className="absolute inset-0 z-[60] flex items-end justify-center pb-24 cursor-pointer focus:outline-none"
          style={{
            background: "rgba(0, 0, 0, 0.0)",
            animation: "installationGateFadeIn 800ms ease-out forwards",
          }}
        >
          <span
            className="text-white/35"
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.78rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              animation: "installationGatePulse 2400ms ease-in-out infinite",
            }}
          >
            Click anywhere to begin
          </span>
          <style jsx>{`
            @keyframes installationGateFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes installationGatePulse {
              0%, 100% { opacity: 0.5; }
              50% { opacity: 1; }
            }
          `}</style>
        </button>
      )}
    </div>
  );
}
