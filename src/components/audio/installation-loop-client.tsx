"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VisualizerClient } from "./visualizer-client";
import { useAudioStore, type Track } from "@/lib/audio/audio-store";
import { getAudioEngine, ensureResumed, primeAudioElement, tryPlay } from "@/lib/audio/audio-engine";
import { isDesktopApp, enterKioskMode, exitKioskMode, setCursorVisible } from "@/lib/tauri";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import type { Journey } from "@/lib/journeys/types";
import { InstallationIntro } from "./installation-intro";
import { InstallationCredits } from "./installation-credits";
import { InstallationDebugHud, logInstallFailure } from "./installation-debug-hud";

/** One entry in the curated loop sequence. */
export interface SequenceEntry {
  journey: Journey;
  track: Track | null;
  /** Cue markers for this track (loaded server-side). The loop client
   *  applies these to the journey-engine on each transition so per-cue
   *  effects like Ghost's bass flash actually fire. */
  cues?: Array<{ time: number; label: string }>;
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
// Per Karel: 7s intro that doubles as a countdown into each cycle.
// Auto-starts on page load — no Begin click. Credits are held longer
// so the dedication lands, then we loop straight back to the intro.
const INTRO_MS = 7_000;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Audio unlock helper. Idempotent — safe to call multiple times.
  // Runs on mount (works automatically in the desktop app where Tauri
  // has no autoplay restriction) AND on the first click anywhere on
  // the page (catches browser users where autoplay is blocked).
  const tryUnlockAudio = useCallback(() => {
    try {
      getAudioEngine();
      primeAudioElement();
    } catch { /* engine warming */ }
    void ensureResumed();
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

    // Fire audio unlock on mount — in the desktop app this works
    // immediately (no autoplay restriction); in browser it'll succeed
    // only if the page already had a prior user gesture (e.g.,
    // navigation click). The document-click listener below catches
    // the browser case where audio doesn't unlock on mount.
    tryUnlockAudio();
    const onAnyClick = () => tryUnlockAudio();
    document.addEventListener("click", onAnyClick, { once: false });
    document.addEventListener("touchstart", onAnyClick, { once: false });

    return () => {
      setInstallationMode(false);
      stopJourney();
      if (isDesktopApp()) exitKioskMode().catch(() => {});
      document.removeEventListener("click", onAnyClick);
      document.removeEventListener("touchstart", onAnyClick);
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
    if (phase.kind === "intro") {
      // Reset per-cycle UI state: a fresh audience is arriving. Dots
      // start unfilled, the failure log starts empty so each cycle's
      // diagnostic state is its own.
      setSkippedIndices(new Set());
      try {
        if (typeof window !== "undefined") {
          window.__resonanceInstallFailures = [];
        }
      } catch { /* nothing to reset */ }
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

    // Show dots while the per-journey title overlay is up. In
    // installation mode the title runs 10s (extended in visualizer-
    // client to mask the AI/shader handoff), so dots match.
    setTitleWindow(true);
    const titleHideTimer = setTimeout(() => setTitleWindow(false), 10_000);

    // Warm engine + ensure audio context is resumed (one user gesture
    // anywhere on the page is enough; this is a no-op afterwards).
    try {
      getAudioEngine();
      ensureResumed();
    } catch { /* engine warming */ }

    // Smooth handoff into the new journey. Just pause the previous
    // track (audio-provider will swap src naturally on the new
    // currentTrack). No removeAttribute/load — that was abrupt and
    // caused visible state churn between journeys.
    try {
      getAudioEngine().audioElement.pause();
    } catch { /* engine warming */ }

    const track = trackForIndex(phase.index);
    if (track) setQueue([track], 0);
    startJourney(entry.journey.id);

    // Apply cue markers to the journey-engine. Without this, per-cue
    // events like Ghost's bass_hit flashes never fire because the engine
    // has no events to trigger on. Mirrors what journey-selector does on
    // a normal journey click.
    const cues = entry.cues ?? [];
    if (cues.length > 0 && track?.duration) {
      try {
        const engine = getJourneyEngine();
        engine.setEvents(
          cues.map((c) => ({ time: c.time, type: "bass_hit" as const, intensity: 1.0 })),
          track.duration,
        );
        useAudioStore.getState().setCueMarkers(cues);
      } catch { /* engine warming */ }
    }

    // Helper: advance to the next journey, or wrap to credits.
    // No snapshot/veil hacks — the AI image layer's softened reset
    // (in ai-image-layer.tsx) lets old images linger and fade
    // naturally as new ones come in. The shader's existing A/B
    // crossfade handles shader transitions. The lengthened title
    // overlay (10s in installation mode) draws the eye away from
    // the background handoff.
    const advance = () => {
      if (phase.index + 1 < sequence.length) {
        setPhase({ kind: "journey", index: phase.index + 1 });
      } else {
        setPhase({ kind: "credits" });
      }
    };

    // ─── Pre-load next journey's audio ────────────────────────────
    // ~6 seconds before the current track ends, kick off a fetch of
    // the next journey's audio URL so the swap at advance() time is
    // gapless. Just resolves the signed URL + warms the browser
    // cache via a low-priority HEAD-style fetch.
    let preloadFired = false;
    const preloadCheckId = setInterval(() => {
      if (preloadFired) return;
      const { currentTime, duration } = useAudioStore.getState();
      if (duration <= 0 || currentTime <= 0) return;
      const remaining = duration - currentTime;
      if (remaining > 6 || remaining < 0) return;
      // Within the 6s pre-load window — find the next journey's track
      const nextEntry = sequence[phase.index + 1];
      if (!nextEntry) return;
      const nextTrack = nextEntry.track ?? trackForIndex(phase.index + 1);
      if (!nextTrack?.audioUrl) return;
      preloadFired = true;
      // Fire-and-forget. resolveAudioUrl caches the signed URL in
      // sessionStorage; the subsequent fetch warms the CDN edge so
      // the audio element's load() is near-instant when the swap
      // happens.
      void (async () => {
        try {
          const { resolveAudioUrl } = await import("@/lib/audio/resolve-audio-url");
          const resolved = await resolveAudioUrl(nextTrack.audioUrl, nextTrack.id);
          // Low-priority byte fetch to warm the network path
          fetch(resolved, { priority: "low" as RequestPriority }).catch(() => {});
        } catch { /* preload best-effort; advance will resolve again */ }
      })();
    }, 1000);

    // Listen for audio element errors AND natural end via DOM events.
    // Critical: requestAnimationFrame is paused when the tab is in the
    // background, so RAF-based end detection misses transitions while
    // backgrounded. DOM events fire regardless — `ended` is the only
    // reliable advancement signal for an unattended kiosk.
    let errorListener: (() => void) | null = null;
    let endedListener: (() => void) | null = null;
    let earlyAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const el = getAudioEngine().audioElement;
      endedListener = () => {
        // Audio finished naturally — advance immediately. Works in
        // foreground OR background tabs.
        advance();
      };
      el.addEventListener("ended", endedListener);
      errorListener = () => {
        const errCode = el.error?.code;
        const errMsg = el.error?.message || "(no msg)";
        const codes = ["", "ABORTED", "NETWORK", "DECODE", "SRC_NOT_SUPPORTED"];
        const reason = `${codes[errCode || 0] || errCode}: ${errMsg}`;
        // eslint-disable-next-line no-console
        console.warn(`[installation] audio error on journey ${phase.index} (${entry.journey.name}): ${reason}`);
        logInstallFailure({
          journey: entry.journey.name,
          track: trackForIndex(phase.index)?.title ?? "(none)",
          reason,
        });
        setSkippedIndices((s) => {
          const next = new Set(s);
          next.add(phase.index);
          return next;
        });
        earlyAdvanceTimer = setTimeout(advance, 250);
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
          // Force a play attempt via tryPlay so the rejection (if any)
          // surfaces in the HUD via lastPlayError.
          tryPlay(el);
        }
      } catch { /* engine gone */ }
    }, 250);

    // Subscribe to store; advance when audio finishes or safety expires.
    const startMs = Date.now();
    // Soft early-advance: after 15s currentTime hasn't moved off 0 we
    // give up on this track. Tighter than MAX_JOURNEY_MS but generous
    // enough that slow CDN starts don't false-trigger. Errors fire
    // their own immediate skip via the error listener above.
    const STALLED_THRESHOLD_MS = 15_000;
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
          const t = trackForIndex(phase.index);
          const reason = stalled
            ? `stalled at 0 after ${(elapsed/1000).toFixed(0)}s — track loaded but never advanced`
            : `safety timeout after ${(elapsed/1000).toFixed(0)}s`;
          // eslint-disable-next-line no-console
          console.warn(`[installation] ${entry.journey.name}: ${reason}`);
          logInstallFailure({
            journey: entry.journey.name,
            track: t?.title ?? "(no track)",
            reason,
          });
          setSkippedIndices((s) => {
            const next = new Set(s);
            next.add(phase.index);
            return next;
          });
        }
        advance();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Backup setInterval — fires every 2s in foreground, throttled to
    // ~1Hz when backgrounded but still runs. Catches stalled tracks
    // when RAF is frozen by tab visibility throttling.
    const bgSafetyTick = setInterval(() => {
      const { currentTime, duration, isPlaying } = useAudioStore.getState();
      const audioEnded =
        (duration > 0 && currentTime >= duration - 0.5) ||
        (duration > 0 && currentTime > 1 && !isPlaying);
      const elapsed = Date.now() - startMs;
      const stalled = elapsed > STALLED_THRESHOLD_MS && currentTime < 0.05;
      const timedOut = elapsed >= MAX_JOURNEY_MS;
      if (audioEnded || stalled || timedOut) {
        if (stalled || timedOut) {
          setSkippedIndices((s) => new Set(s).add(phase.index));
        }
        advance();
      }
    }, 2_000);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(bgSafetyTick);
      clearInterval(preloadCheckId);
      clearTimeout(titleHideTimer);
      clearInterval(playWatchdog);
      if (earlyAdvanceTimer) clearTimeout(earlyAdvanceTimer);
      if (endedListener) {
        try {
          getAudioEngine().audioElement.removeEventListener("ended", endedListener);
        } catch { /* engine gone */ }
      }
      if (errorListener) {
        try {
          getAudioEngine().audioElement.removeEventListener("error", errorListener);
        } catch { /* engine gone */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sequence]);

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

    </div>
  );
}
