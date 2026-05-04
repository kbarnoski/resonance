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
  // Installation intro stages — three independent layers (bg, cycle
  // text, journey text) sequenced so the bg fades BEFORE the journey
  // title shows. That way the journey title lands over the live
  // shader/AI imagery, not on a black panel.
  //
  //   cycle           — bg opaque, "Resonance" cycle text shown
  //   fading-cycle    — cycle text fades to 0 over 1.5s; bg stays opaque
  //   fading-bg       — cycle text unmounted; bg fades to 0 over 2.5s,
  //                     revealing the shader/AI imagery (which has been
  //                     rendering behind the bg since pre-start)
  //   journey         — bg gone; journey title fades in via own 2.4s
  //                     animation, floats over the live visuals
  //   fading-journey  — journey title fades out over 1.8s
  //   gone            — everything unmounted; phase change to journey 0
  type IntroStage = "cycle" | "fading-cycle" | "fading-bg" | "journey" | "fading-journey" | "gone";
  const [introStage, setIntroStage] = useState<IntroStage>("cycle");
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
      // Reset intro overlay to cycle text at the top of every loop.
      setIntroStage("cycle");

      // Refs to scoped timers so an early error listener can abort them.
      let fadeCycleStart: ReturnType<typeof setTimeout> | null = null;
      let fadeBgStart: ReturnType<typeof setTimeout> | null = null;
      let mountJourney: ReturnType<typeof setTimeout> | null = null;
      let fadeJourneyStart: ReturnType<typeof setTimeout> | null = null;
      let finalPhaseChange: ReturnType<typeof setTimeout> | null = null;
      let earlyErrorListener: (() => void) | null = null;

      // Phase machine for the cycle intro — staged so layers (bg,
      // cycle text, journey text) hand off cleanly with no morph AND
      // the shader has lead time to compile + crossfade behind the
      // still-opaque bg, so when bg fades the shader emerges smoothly
      // (no shader-pop the moment bg becomes transparent).
      //
      //   t=0      → cycle text fades in (1.4s) over opaque bg
      //   t=7s     → cycle text fades out (1.5s) — fading-cycle stage.
      //              Pre-start journey 0 NOW: audio/shader/AI begin
      //              loading behind the still-opaque bg. Audio is
      //              briefly under the fading cycle text (most journey
      //              starts are quiet ambient anyway).
      //   t=8.5s   → cycle text fully gone. bg starts fading (4.5s,
      //              slow). Shader has had 1.5s to compile + start its
      //              A/B crossfade — emerges gradually as bg fades, no
      //              pop. fading-bg stage.
      //   t=13s    → bg fully gone. Pure shader/AI visible alone.
      //   t=14s    → journey title mounts (1s pure-shader beat first)
      //              and fades in slowly (3.8s) over the live shader/AI
      //              imagery, with its own radial-gradient backdrop for
      //              legibility (matches the in-journey intro overlay).
      //   t=20s    → journey title fades out (1.8s) — fading-journey
      //   t=21.8s  → phase change to journey 0; overlay fully unmounted
      //
      // No competing texts: installation intro shows "Ascension" title
      // exclusively; visualizer-client's journey intro is suppressed
      // for journey 0 via the store flag set during pre-start.

      // t=INTRO_MS (7s): begin cycle text fade-out AND pre-start
      // journey 0. The shader needs lead time to compile + start its
      // A/B crossfade before bg starts revealing it.
      fadeCycleStart = setTimeout(() => {
        if (sequence.length === 0) {
          setPhase({ kind: "credits" });
          return;
        }
        setIntroStage("fading-cycle");
        const entry = sequence[0];
        useAudioStore.getState().setSuppressNextJourneyIntro(true);
        const track = trackForIndex(0);
        if (track) setQueue([track], 0);
        startJourney(entry.journey.id);
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

        // Early error listener: if Ascension's audio fails during the
        // cycle intro window, retry up to 3 times with progressively
        // fresh URLs (clearing sessionStorage cache each time so the
        // resolver can't return a stale signed URL). Never skip from
        // here — phase change to journey 0 happens at INTRO_MS+14.8s
        // regardless, and the journey-phase setup has its own stalled
        // detection (30s) and reload attempt (12s) to handle a track
        // that genuinely cannot be loaded.
        try {
          const el = getAudioEngine().audioElement;
          let earlyRetries = 0;
          const MAX_EARLY_RETRIES = 3;
          earlyErrorListener = () => {
            const errCode = el.error?.code;
            const errMsg = el.error?.message || "(no msg)";
            // eslint-disable-next-line no-console
            console.warn(`[installation] early audio error (code ${errCode}: ${errMsg}) — retry ${earlyRetries + 1}/${MAX_EARLY_RETRIES}`);
            if (earlyRetries >= MAX_EARLY_RETRIES) return;
            earlyRetries++;
            void (async () => {
              try {
                const t = trackForIndex(0);
                if (!t?.audioUrl) return;
                try { sessionStorage.removeItem(`audio-url-${t.id}`); } catch { /* ok */ }
                const { resolveAudioUrl } = await import("@/lib/audio/resolve-audio-url");
                const fresh = await resolveAudioUrl(t.audioUrl, t.id);
                el.src = fresh;
                el.load();
              } catch { /* best-effort */ }
            })();
          };
          el.addEventListener("error", earlyErrorListener);
        } catch { /* engine warming */ }
      }, INTRO_MS);

      // t=INTRO_MS+1.5s: cycle text gone. Begin bg fade (4.5s — slow,
      // gradual reveal of the already-running shader behind it).
      fadeBgStart = setTimeout(() => {
        setIntroStage("fading-bg");
      }, INTRO_MS + 1500);

      // t=INTRO_MS+7s: bg has been gone ~1s. Pure shader/AI has had a
      // moment to read on its own. Mount journey title (fades in 3.8s
      // via its own animation) over the live imagery, with its own
      // radial-gradient backdrop for readability.
      mountJourney = setTimeout(() => {
        setIntroStage("journey");
      }, INTRO_MS + 7000);

      // t=INTRO_MS+13s: title has been fully visible ~2s. Begin fade.
      fadeJourneyStart = setTimeout(() => {
        setIntroStage("fading-journey");
      }, INTRO_MS + 13_000);

      // t=INTRO_MS+14.8s: phase change → overlay fully unmounted,
      // journey is sole visual layer
      finalPhaseChange = setTimeout(() => {
        setIntroStage("gone");
        setPhase({ kind: "journey", index: 0 });
      }, INTRO_MS + 14_800);

      return () => {
        if (fadeCycleStart) clearTimeout(fadeCycleStart);
        if (fadeBgStart) clearTimeout(fadeBgStart);
        if (mountJourney) clearTimeout(mountJourney);
        if (fadeJourneyStart) clearTimeout(fadeJourneyStart);
        if (finalPhaseChange) clearTimeout(finalPhaseChange);
        if (earlyErrorListener) {
          try {
            getAudioEngine().audioElement.removeEventListener("error", earlyErrorListener);
          } catch { /* engine gone */ }
        }
      };
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
    // Match the visualizer-client journey intro's 6s window in
    // installation mode — keeps dots in sync with the title overlay.
    const titleHideTimer = setTimeout(() => setTitleWindow(false), 6_000);

    // No special intro handoff here — the intro phase pre-started
    // journey 0 1.5s before the phase change, so by now the journey
    // shader is established. Installation intro snap-removes via the
    // phase.kind condition in the render below.

    // Warm engine + ensure audio context is resumed (one user gesture
    // anywhere on the page is enough; this is a no-op afterwards).
    try {
      getAudioEngine();
      ensureResumed();
    } catch { /* engine warming */ }

    // Detect "already started" — the intro phase pre-starts journey 0
    // synchronously, so when phase officially changes to journey 0, the
    // store already has activeJourney = entry.journey. Skip the start
    // path; just set up listeners and timers.
    const alreadyStarted =
      useAudioStore.getState().activeJourney?.id === entry.journey.id;

    if (!alreadyStarted) {
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
      // On error, try fresh URL recovery up to 3 times before logging
      // the failure and advancing. Most errors during installation are
      // stale signed URLs, network blips, or codec hiccups — fresh
      // resolve usually fixes them. Only after exhausting retries do
      // we surface the failure + advance.
      let phaseRetries = 0;
      const MAX_PHASE_RETRIES = 3;
      errorListener = () => {
        const errCode = el.error?.code;
        const errMsg = el.error?.message || "(no msg)";
        const codes = ["", "ABORTED", "NETWORK", "DECODE", "SRC_NOT_SUPPORTED"];
        const reason = `${codes[errCode || 0] || errCode}: ${errMsg}`;
        if (phaseRetries < MAX_PHASE_RETRIES) {
          phaseRetries++;
          // eslint-disable-next-line no-console
          console.warn(`[installation] error on ${entry.journey.name}: ${reason} — retry ${phaseRetries}/${MAX_PHASE_RETRIES}`);
          void (async () => {
            try {
              const t = trackForIndex(phase.index);
              if (!t?.audioUrl) return;
              try { sessionStorage.removeItem(`audio-url-${t.id}`); } catch { /* ok */ }
              const { resolveAudioUrl } = await import("@/lib/audio/resolve-audio-url");
              const fresh = await resolveAudioUrl(t.audioUrl, t.id);
              el.src = fresh;
              el.load();
            } catch { /* best-effort */ }
          })();
          return;
        }
        // eslint-disable-next-line no-console
        console.warn(`[installation] ${entry.journey.name}: ${reason} — retries exhausted, advancing`);
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
    // and element reality (paused). In installation mode we drop the
    // isPlaying gate — there's no operator pause UI, so any time the
    // element is paused-and-ready we should be playing. Catches the
    // case where startJourney's isPlaying flip raced the canplay event
    // and play() never got called (which would otherwise strand the
    // journey at currentTime=0 until the stalled detector skipped it).
    const playWatchdog = setInterval(() => {
      try {
        const el = getAudioEngine().audioElement;
        if (el.paused && el.readyState >= 2 && !el.error) {
          tryPlay(el);
        }
      } catch { /* engine gone */ }
    }, 250);

    // ─── Mid-stall re-load attempt ────────────────────────────────
    // If after 12s the audio element still hasn't started (readyState
    // low or currentTime stuck at 0), force a fresh URL resolve + load
    // before the stalled detector gives up at 30s. Catches expired
    // signed URLs and CDN cold-starts that occasionally bite the
    // 2nd/3rd journeys in a long-running kiosk session.
    const reloadAttempt = setTimeout(async () => {
      try {
        const el = getAudioEngine().audioElement;
        if (el.currentTime > 0.1) return; // already playing — fine
        const t = trackForIndex(phase.index);
        if (!t?.audioUrl) return;
        // Force-reload regardless of el.error: clearing src and
        // re-resolving lets us recover from a stale signed URL even
        // if the element is currently in an error state. Without this,
        // an element that errored during cycle intro would be stuck
        // and only the stalled detector at 30s could move us off.
        // eslint-disable-next-line no-console
        console.warn(`[installation] ${entry.journey.name}: stuck at 0 after 12s (error=${el.error?.code ?? "none"}) — force-reload`);
        try { sessionStorage.removeItem(`audio-url-${t.id}`); } catch { /* ok */ }
        const { resolveAudioUrl } = await import("@/lib/audio/resolve-audio-url");
        const fresh = await resolveAudioUrl(t.audioUrl, t.id);
        el.src = fresh;
        el.load();
        // Audio-provider's canplay will tryPlay; watchdog is also live.
      } catch { /* best-effort */ }
    }, 12_000);

    // Subscribe to store; advance when audio finishes or safety expires.
    const startMs = Date.now();
    // Soft early-advance: after 30s currentTime hasn't moved off 0 we
    // give up on this track. Generous so slow CDN starts + the mid-
    // stall re-load attempt (at 12s) both have time to recover. Errors
    // fire their own immediate skip via the error listener above.
    const STALLED_THRESHOLD_MS = 30_000;
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
      clearTimeout(reloadAttempt);
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

      {/* Debug HUD intentionally disabled in render. Re-enable by
          flipping back to `{debug && <InstallationDebugHud />}` —
          the prop wiring + page param are still in place. */}
      {false && debug && <InstallationDebugHud />}

      {/* Installation intro overlay — staged. Cycle text, bg, and
          journey title are three independent layers, each conditionally
          mounted with its own opacity transition. The intro component
          handles all visual choreography; we just hand it the current
          stage. The overlay stays mounted through the journey-0 phase
          while the journey-title fade-out is still happening. */}
      {introStage !== "gone" && (phase.kind === "intro" || (phase.kind === "journey" && phase.index === 0 && (introStage === "journey" || introStage === "fading-journey"))) && (
        <InstallationIntro
          stage={introStage}
          journey={sequence[0]?.journey ?? null}
          trackArtist={sequence[0]?.track?.artist ?? null}
        />
      )}
      {phase.kind === "credits" && <InstallationCredits />}

      {/* Progress stepper — present during ANY title moment so it's
          part of the same visual beat as the journey name. Visible
          during the cycle intro's journey-title stage (Ascension over
          live shader), during each per-journey title window, and during
          ending credits. Mounted across the full intro journey + per-
          journey-phase span so the opacity transition can fade it in
          and out smoothly without remount-flicker. Five horizontal
          pill segments give an unmistakable "N of 5" read; current
          segment glows white, completed fill violet, upcoming stay as
          thin outlines. */}
      {sequence.length > 0 && (() => {
        // Compute "show" — true whenever a journey title is being
        // shown anywhere (cycle intro's Ascension title, per-journey
        // title window, or credits).
        const showInIntro =
          phase.kind === "intro" &&
          (introStage === "journey" || introStage === "fading-journey");
        const showInJourney = phase.kind === "journey" && titleWindow;
        const showInCredits = phase.kind === "credits";
        const show = showInIntro || showInJourney || showInCredits;

        // Mount whenever the stepper is in any "could-be-visible" range.
        // Outside this range it returns null (saves DOM during long
        // playback windows).
        const mountInIntro =
          phase.kind === "intro" &&
          (introStage === "journey" || introStage === "fading-journey" || introStage === "fading-bg");
        const mountInJourney = phase.kind === "journey";
        const mountInCredits = phase.kind === "credits";
        if (!mountInIntro && !mountInJourney && !mountInCredits) return null;

        // Index drives which segment glows. During the cycle intro the
        // journey is implicitly Ascension (index 0). In a journey phase
        // it's that phase's index. In credits all segments are "done".
        const currentIndex =
          phase.kind === "intro"
            ? 0
            : phase.kind === "journey"
              ? phase.index
              : sequence.length;
        const isInIntro = phase.kind === "intro";
        const journeyName =
          phase.kind === "credits"
            ? null
            : sequence[currentIndex]?.journey.name ?? "";

        return (
          <div
            className="absolute z-30 left-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{
              bottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
              pointerEvents: "none",
              opacity: show ? 1 : 0,
              transition: "opacity 1200ms ease-out",
            }}
          >
            <div className="flex items-center gap-1.5">
              {sequence.map((_, i) => {
                const done = i < currentIndex;
                const current = !isInIntro
                  ? phase.kind === "journey" && i === currentIndex
                  : i === 0;
                const skipped = skippedIndices.has(i);
                const background = skipped
                  ? "rgba(248, 113, 113, 0.55)"
                  : done
                    ? "rgba(196, 181, 253, 0.9)"
                    : current
                      ? "rgba(255, 255, 255, 0.95)"
                      : "rgba(255, 255, 255, 0.10)";
                const border = !done && !current && !skipped
                  ? "1px solid rgba(255, 255, 255, 0.30)"
                  : "none";
                return (
                  <span
                    key={i}
                    aria-hidden
                    title={skipped ? "Track failed — skipped" : undefined}
                    style={{
                      width: current ? "72px" : "44px",
                      height: "4px",
                      borderRadius: "2px",
                      background,
                      border,
                      boxShadow: current
                        ? "0 0 12px rgba(255, 255, 255, 0.55), 0 0 4px rgba(196, 181, 253, 0.4)"
                        : "none",
                      transition: "width 500ms ease, background 400ms ease, box-shadow 400ms ease",
                    }}
                  />
                );
              })}
            </div>
            <div
              className="mt-3 text-white/55"
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                textShadow: "0 1px 8px rgba(0,0,0,0.85)",
              }}
            >
              {phase.kind === "credits"
                ? `${sequence.length} of ${sequence.length} · Complete`
                : `${currentIndex + 1} of ${sequence.length} · ${journeyName}`}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
