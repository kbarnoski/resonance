"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VisualizerClient } from "./visualizer-client";
import { useAudioStore, type Track } from "@/lib/audio/audio-store";
import { getAudioEngine, ensureResumed, primeAudioElement } from "@/lib/audio/audio-engine";
import { isDesktopApp, enterKioskMode, exitKioskMode, setCursorVisible } from "@/lib/tauri";
import type { Journey } from "@/lib/journeys/types";
import { InstallationIntro } from "./installation-intro";
import { InstallationCredits } from "./installation-credits";
import { InstallationDebugHud } from "./installation-debug-hud";

/** One entry in the curated loop sequence. */
export interface SequenceEntry {
  journey: Journey;
  track: Track | null;
}

interface Props {
  sequence: SequenceEntry[];
  /** Featured-recordings pool used when a journey has no paired track. */
  fallbackTracks: Track[];
  /** When true, render the live audio + journey debug overlay. Driven by
   *  ?debug=1 on the page URL. */
  debug?: boolean;
}

// ─── Timing ────────────────────────────────────────────────────────────
// Intro is held longer than a normal journey intro because the viewer is
// arriving cold; they need time to read the room — but not so long that
// a user who clicked "begin" feels stuck.
const INTRO_MS = 10_000;
// Credits get an even longer hold — the dedication should land.
const CREDITS_MS = 16_000;
// Safety net so the loop keeps moving even when a track is missing or
// has no metadata duration. Tuned generously above the longest journey.
const MAX_JOURNEY_MS = 8 * 60 * 1_000;

type Phase =
  | { kind: "intro" }
  | { kind: "journey"; index: number }
  | { kind: "credits" };

export function InstallationLoopClient({ sequence, fallbackTracks, debug }: Props) {
  const setInstallationMode = useAudioStore((s) => s.setInstallationMode);
  const setQueue = useAudioStore((s) => s.setQueue);
  const startJourney = useAudioStore((s) => s.startJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);

  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  // Title-card window: matches the visualizer-client's built-in journey
  // intro overlay (~6s when each journey starts). Drives the dot stepper
  // visibility — dots only show during this window + during credits.
  const [titleWindow, setTitleWindow] = useState(false);
  // Indices of journeys that were skipped due to audio load failure —
  // shown as red dots so the operator knows which recordings need fixing.
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(() => new Set());
  // Browser autoplay gate. The desktop app doesn't enforce autoplay so we
  // skip the click prompt there; in a normal browser tab one click anywhere
  // unlocks the audio element + AudioContext for the rest of the session.
  const [started, setStarted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return isDesktopApp();
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Pick the right track for this index — paired first, then a
  // distributed pick from the fallback pool. We avoid using `i %
  // length` directly because consecutive unpaired journeys would all
  // land on adjacent tracks and a single bad track would cluster
  // failures. Use a simple hash-shuffle instead so picks scatter.
  const trackForIndex = useCallback(
    (i: number): Track | null => {
      const entry = sequence[i];
      if (entry?.track) return entry.track;
      if (fallbackTracks.length === 0) return null;
      // Stable distributed index: multiply by a coprime to the pool
      // length so picks don't repeat for many cycles.
      const idx = ((i * 7) + 3) % fallbackTracks.length;
      return fallbackTracks[idx] ?? fallbackTracks[0] ?? null;
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

  // ─── Cursor reveal on activity ─────────────────────────────────────
  // No on-screen chrome (no fullscreen toggle) — installation mode
  // expects the operator to use browser ⌘⌃F or the desktop kiosk; we
  // only manage the cursor itself.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reveal = () => {
      container.style.cursor = "default";
      setCursorVisible(true).catch(() => {});
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      cursorTimerRef.current = setTimeout(() => {
        container.style.cursor = "none";
        setCursorVisible(false).catch(() => {});
      }, 3000);
    };
    container.addEventListener("mousemove", reveal);
    container.addEventListener("touchstart", reveal);
    cursorTimerRef.current = setTimeout(() => {
      container.style.cursor = "none";
      setCursorVisible(false).catch(() => {});
    }, 3000);
    return () => {
      container.removeEventListener("mousemove", reveal);
      container.removeEventListener("touchstart", reveal);
      if (cursorTimerRef.current) clearTimeout(cursorTimerRef.current);
      setCursorVisible(true).catch(() => {});
    };
  }, []);

  // ─── Key handling — capture phase, defense in depth ───────────────
  // Two goals: stop visualizer-client's Escape handler from navigating
  // away to /library, and let F still toggle fullscreen even though the
  // visualizer-client also binds F (we let the bubble continue for F).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Always let browser shortcuts through (reload, devtools, address
      // bar, tab switching, etc). Anything with a modifier key is the
      // operator, not the audience — never trap those.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Allow F through — visualizer-client handles it (fullscreen).
      if (e.key === "f" || e.key === "F") return;
      // Eat Escape so visualizer-client.handleExit() can't fire.
      // Browser still handles native fullscreen-exit before our handler.
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
      // Hide the dot stepper during the installation intro — the intro
      // already names what the experience is; dots come later at the
      // per-journey title moment.
      setTitleWindow(false);
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
      // Show dots during ending titling so the audience sees the full
      // progress — every dot lit as we wrap.
      setTitleWindow(true);
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

    // Show dots while the per-journey title overlay is up (matches the
    // visualizer-client's 6s journey intro animation). Hide them again
    // when the journey moves into its body so the canvas reads as pure
    // visual / unframed during playback.
    setTitleWindow(true);
    const titleHideTimer = setTimeout(() => setTitleWindow(false), 6000);

    // Warm engine + ensure audio context is resumed (one user gesture
    // anywhere on the page is enough; this is a no-op afterwards).
    try {
      getAudioEngine();
      ensureResumed();
    } catch { /* engine warming */ }

    const track = trackForIndex(phase.index);
    if (track) setQueue([track], 0);
    startJourney(entry.journey.id);

    // Listen for audio element errors directly so we can advance to the
    // next JOURNEY (not just the next track in the queue) when a track
    // fails to load. Critical for kiosk reliability — one bad recording
    // shouldn't strand the entire loop.
    let errorListener: (() => void) | null = null;
    let earlyAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const el = getAudioEngine().audioElement;
      errorListener = () => {
        // eslint-disable-next-line no-console
        console.warn("[installation] audio error on journey", phase.index, "— advancing");
        setSkippedIndices((s) => {
          const next = new Set(s);
          next.add(phase.index);
          return next;
        });
        earlyAdvanceTimer = setTimeout(() => {
          if (phase.index + 1 < sequence.length) {
            setPhase({ kind: "journey", index: phase.index + 1 });
          } else {
            setPhase({ kind: "credits" });
          }
        }, 250);
      };
      el.addEventListener("error", errorListener);
    } catch { /* engine warming */ }

    // ─── Audio play watchdog ──────────────────────────────────────
    // Periodically reconcile the gap between store intent (isPlaying=true)
    // and element reality (paused). Catches every race where the audio
    // element ends up paused while the store still wants playback —
    // including the desync caught by the HUD on Mycelium Dream where the
    // element loaded fully (readyState=4) but stayed paused after a
    // journey transition.
    const playWatchdog = setInterval(() => {
      try {
        const el = getAudioEngine().audioElement;
        const s = useAudioStore.getState();
        if (s.isPlaying && el.paused && el.readyState >= 2 && !el.error) {
          // Audio is ready, store wants playback, but element is paused.
          // Force a play attempt. Audio is unlocked from the click gate
          // so this won't get rejected by autoplay policy.
          el.play().catch((err) => {
            // eslint-disable-next-line no-console
            console.warn("[installation] watchdog play() rejected:", err);
          });
        }
      } catch { /* engine gone */ }
    }, 500);

    // Subscribe to store; advance when audio finishes or safety expires.
    const startMs = Date.now();
    // Soft early-advance: if the element is in error state OR after 8s
    // currentTime hasn't moved off 0, treat it as a stalled track and
    // skip. The hard MAX_JOURNEY_MS safety net stays as a final backstop.
    const STALLED_THRESHOLD_MS = 8_000;
    let raf = 0;
    const tick = () => {
      const { currentTime, duration, isPlaying } = useAudioStore.getState();
      // Track ended either when currentTime reaches duration OR when
      // the store flips isPlaying back to false (audio-provider's
      // onEnded pauses in installation single-track mode now).
      const audioEnded =
        (duration > 0 && currentTime >= duration - 0.5) ||
        (duration > 0 && currentTime > 1 && !isPlaying);
      const elapsed = Date.now() - startMs;
      const stalled = elapsed > STALLED_THRESHOLD_MS && currentTime < 0.05;
      const timedOut = elapsed >= MAX_JOURNEY_MS;
      if (audioEnded || stalled || timedOut) {
        if (stalled || timedOut) {
          // eslint-disable-next-line no-console
          console.warn("[installation] track failed (stalled/timed out) — advancing");
          setSkippedIndices((s) => {
            const next = new Set(s);
            next.add(phase.index);
            return next;
          });
        }
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
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(titleHideTimer);
      clearInterval(playWatchdog);
      if (earlyAdvanceTimer) clearTimeout(earlyAdvanceTimer);
      if (errorListener) {
        try {
          getAudioEngine().audioElement.removeEventListener("error", errorListener);
        } catch { /* engine gone */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sequence, started]);

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <VisualizerClient />

      {debug && <InstallationDebugHud />}

      {phase.kind === "intro" && <InstallationIntro />}
      {phase.kind === "credits" && <InstallationCredits />}

      {/* Path dots — only visible during the per-journey title window
          (~6s when each journey starts) and during ending credits.
          Hidden during ongoing journey playback so the canvas reads as
          pure visual. Completed journeys fill with the accent color,
          current journey is a glowing white dot, upcoming are dim. */}
      {titleWindow && sequence.length > 0 && (phase.kind === "journey" || phase.kind === "credits") && (
        <div
          className="absolute z-30 left-1/2 -translate-x-1/2 flex items-center gap-2"
          style={{
            bottom: "calc(36px + env(safe-area-inset-bottom, 0px))",
            opacity: 0.9,
            transition: "opacity 600ms ease",
            pointerEvents: "none",
            animation: "installationDotsFade 600ms ease-out forwards",
          }}
        >
          {sequence.map((_, i) => {
            // In credits, every dot is "done" (full progress).
            const currentIndex = phase.kind === "journey" ? phase.index : sequence.length;
            const done = i < currentIndex;
            const current = phase.kind === "journey" && i === currentIndex;
            const skipped = skippedIndices.has(i);
            const size = current ? 10 : 6;
            const background = skipped
              ? "rgba(248, 113, 113, 0.55)" // muted red — track failed
              : done
                ? "rgba(196, 181, 253, 0.9)"
                : current
                  ? "rgba(255, 255, 255, 0.95)"
                  : "rgba(255, 255, 255, 0.18)";
            return (
              <span
                key={i}
                aria-hidden
                title={skipped ? "Track failed — skipped" : undefined}
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  borderRadius: "50%",
                  background,
                  boxShadow: current
                    ? "0 0 14px rgba(196, 181, 253, 0.65)"
                    : "none",
                  transition: "all 400ms ease",
                }}
              />
            );
          })}
          <style jsx>{`
            @keyframes installationDotsFade {
              from { opacity: 0; }
              to { opacity: 0.9; }
            }
          `}</style>
        </div>
      )}

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
