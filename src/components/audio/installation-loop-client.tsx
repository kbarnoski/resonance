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
import { InstallationStatusPanel } from "./installation-status-panel";
import {
  INTRO_MS,
  CREDITS_MS,
  MAX_JOURNEY_MS,
  distributedTrackIndex,
} from "./installation-machine";

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
  /** Public-demo mode for unauthenticated visitors. Kept as a prop so
   *  the loop client can adjust behavior in the future (e.g., display
   *  a small "sign up for the full experience" affordance) without
   *  re-plumbing. AI imagery itself is NOT disabled — anon visitors
   *  get the full audiovisual experience; the existing per-IP rate
   *  limits on the fal proxy + image-validate endpoints bound the
   *  cost exposure. */
  anonMode?: boolean;
  /** When true, run through the cycle a single time and stop at the
   *  credits screen instead of looping back to the intro. Used by the
   *  /demo URL — gives reviewers a clean end-of-experience moment
   *  without the loop continuing in the background. */
  playOnce?: boolean;
  /** Index into `sequence` to start the cycle at. Defaults to 0
   *  (Ascension). Driven by ?start=N or ?start=journey-id on the
   *  URL — useful for debugging late-cycle journeys (e.g. Ghost
   *  audio drops mid-play) without sitting through the prior 4. */
  startIndex?: number;
}

// ─── Timing ────────────────────────────────────────────────────────────
// Constants live in ./installation-machine so they can be unit-tested
// and cross-referenced without parsing the loop client's setTimeout
// chains. Imported above as INTRO_MS, CREDITS_MS, MAX_JOURNEY_MS.

type Phase =
  | { kind: "intro" }
  | { kind: "journey"; index: number }
  | { kind: "credits" };

export function InstallationLoopClient({ sequence, fallbackTracks, debug, playOnce, startIndex = 0 }: Props) {
  // anonMode is still accepted on the props interface for future use
  // (e.g., a "sign up" CTA), but doesn't currently change behavior.
  const setInstallationMode = useAudioStore((s) => s.setInstallationMode);
  const setQueue = useAudioStore((s) => s.setQueue);
  const startJourney = useAudioStore((s) => s.startJourney);
  const stopJourney = useAudioStore((s) => s.stopJourney);

  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  // Stable ref mirror so long-lived effects (heartbeat poster) can read
  // current phase without depending on it (which would re-run the entire
  // effect on every phase change).
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  // Title-card window: matches the visualizer-client's built-in journey
  // intro overlay (~6s when each journey starts). Drives the dot stepper
  // visibility — dots only show during this window + during credits.
  const [titleWindow, setTitleWindow] = useState(false);
  // Indices of journeys that were skipped due to audio load failure —
  // shown as red dots so the operator knows which recordings need fixing.
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(() => new Set());
  // Installation intro stages — bg-black holds opaque the entire time
  // the visualizer is alone behind it, then fades on the same clock as
  // the journey title's inner fade-in. No window where the shader is
  // visible without the title.
  //
  //   cycle           — bg opaque, "Resonance" cycle text shown
  //   fading-cycle    — cycle text fades to 0 over 1.5s; bg stays opaque.
  //                     Pre-start journey 0 fires here. Visualizer
  //                     compiles + crossfades behind the opaque bg.
  //   journey         — title mounts (3.8s inner fade-in). bg fades 1→0
  //                     over the same 3.8s. Title and shader arrive
  //                     together.
  //   fading-journey  — title fades out over 1.8s; bg already gone.
  //   gone            — everything unmounted; phase change to journey 0
  type IntroStage = "cycle" | "fading-cycle" | "journey" | "fading-journey" | "gone";
  // Initial stage. Kiosk path (/installation) starts at "cycle" so
  // the InstallationIntro fades the cycle text in. Gesture path
  // (/demo, where playOnce=true) starts at "fading-cycle" so the
  // cycle text wrapper is opacity 0 from frame 1 — the user has
  // already read the same content on the Begin overlay; if we
  // initialized at "cycle" the inner-text animation would run to
  // opacity 1 underneath the Begin overlay, then visibly transition
  // to 0 once the user tapped (the "duplicate fades out" bug).
  const [introStage, setIntroStage] = useState<IntroStage>(
    () => (playOnce ? "fading-cycle" : "cycle"),
  );
  // Font readiness gate. We wait until every Cormorant Garamond
  // variant the intro/title text uses (300 regular, 300 italic, 400)
  // is loaded BEFORE starting the timing chain. Without this gate the
  // black-to-title pause was variable: cache hit = near-instant,
  // cache miss = several hundred ms while JourneyTextInner waited for
  // the font and rendered null — bg kept fading on its CSS clock and
  // the user saw "a longer pause of black". Now the timing is
  // deterministic from the moment fonts.ready resolves.
  const [fontsReady, setFontsReady] = useState(false);
  // /demo always shows a Begin button (review/share UX — user is
  // intentionally previewing, not displaying a kiosk). /installation
  // auto-starts (it's the gallery kiosk; no operator standing there).
  // Differentiated by the playOnce prop: /demo sets it true, the
  // kiosk path leaves it undefined.
  const needsGesture = !!playOnce;
  const [started, setStarted] = useState(false);
  // Set true 1.5s after `started` flips, so the Begin overlay can
  // fade-out via opacity transition before being removed from the DOM.
  const [startScreenUnmounted, setStartScreenUnmounted] = useState(false);
  useEffect(() => {
    if (!started) {
      setStartScreenUnmounted(false);
      return;
    }
    const t = setTimeout(() => setStartScreenUnmounted(true), 1500);
    return () => clearTimeout(t);
  }, [started]);
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mount timestamp for uptime calculations (status panel + heartbeat).
  const startedAtMsRef = useRef(Date.now());

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
      const idx = distributedTrackIndex(i, fallbackTracks.length);
      return fallbackTracks[idx] ?? fallbackTracks[0] ?? null;
    },
    [sequence, fallbackTracks],
  );

  // ─── Mount: kiosk + installation flag ─────────────────────────────
  useEffect(() => {
    setInstallationMode(true);
    // Tell the journey engine to skip 3D shader modes — they create
    // R3F Canvases with their own WebGL contexts and this route runs
    // 4 simultaneous contexts (layer A + B + dual A + B). Adding 3D
    // pushed us past the browser's context limit and caused repeated
    // context loss + force-remount bursts mid-journey. The flag is
    // reset on unmount so single-shader routes that share the engine
    // singleton (/room/[token]) don't inherit it.
    try { getJourneyEngine().setMultiLayerMode(true); } catch { /* engine warming */ }
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

    // ─── Mount-level audio play watchdog ──────────────────────────
    // Runs from page load, NOT from the journey-phase setup. This is
    // the critical fix for the "Ascension audio never loaded → skipped
    // to inferno" bug: pre-starting journey 0 happens during the cycle
    // intro at t=INTRO_MS, but the journey-phase setup (which used to
    // own the watchdog) doesn't run until t=INTRO_MS+14.8s. That's a
    // ~15-second window where audio could be paused (autoplay-block
    // rejection produces no `error` event, so the early-error listener
    // doesn't catch it) and nothing is trying to recover.
    //
    // Now: every 250ms we check whether the audio element should be
    // playing and isn't, and call tryPlay. As soon as the user clicks
    // anywhere (which unlocks the AudioContext via the listener
    // above), the next watchdog tick succeeds.
    const mountWatchdog = setInterval(() => {
      try {
        const el = getAudioEngine().audioElement;
        // Skip if:
        // - element is playing (not paused)
        // - element has ended naturally (calling play() now would
        //   reject with AbortError "interrupted by end of playback".
        //   Console screenshot from the user showed 100s of these
        //   AbortErrors stacking up after Ghost finished. The
        //   watchdog kept retrying forever.)
        // - element isn't ready yet (no track loaded)
        // - element is in error state
        // - we're at the very end of a track (avoid play() racing
        //   with the natural end-of-playback signal)
        if (
          el.paused &&
          !el.ended &&
          el.readyState >= 2 &&
          !el.error &&
          (el.duration === 0 || el.currentTime < el.duration - 0.5)
        ) {
          tryPlay(el);
        }
      } catch { /* engine warming */ }
    }, 250);

    return () => {
      clearInterval(mountWatchdog);
      setInstallationMode(false);
      try { getJourneyEngine().setMultiLayerMode(false); } catch { /* engine gone */ }
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

  // ─── Font readiness ────────────────────────────────────────────
  // Pre-load every Cormorant Garamond variant the intro/title uses,
  // then verify each is actually available with document.fonts.check
  // before flipping fontsReady. Hard-refresh (Cmd+Shift+R) was still
  // showing a font swap because document.fonts.load() can resolve
  // before the @font-face rule from the page-level <link> stylesheet
  // has been registered — load() doesn't queue anything for a font
  // that isn't declared yet, and document.fonts.ready resolves
  // immediately when there are no pending loads. The check() poll
  // closes that race: we wait for the font to actually be available
  // for rendering, not just for a Promise to resolve.
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts?.check) {
      setFontsReady(true);
      return;
    }

    let cancelled = false;
    const variants = [
      "300 1em 'Cormorant Garamond'",
      "italic 300 1em 'Cormorant Garamond'",
      "400 1em 'Cormorant Garamond'",
    ];

    // Trigger explicit loads — important on hard refresh where the
    // browser hasn't started fetching from @font-face yet.
    variants.forEach((spec) => {
      try { document.fonts.load(spec).catch(() => {}); } catch { /* ok */ }
    });

    const allReady = () =>
      variants.every((spec) => {
        try { return document.fonts.check(spec); } catch { return true; }
      });

    const start = Date.now();
    const FAILSAFE_MS = 5000;

    const poll = () => {
      if (cancelled) return;
      if (allReady()) {
        // One more frame after check() returns true so the browser has
        // a chance to apply the @font-face rule to layout — without
        // this rAF beat, hard-refresh occasionally still flashed a
        // pre-applied paint.
        requestAnimationFrame(() => { if (!cancelled) setFontsReady(true); });
        return;
      }
      if (Date.now() - start > FAILSAFE_MS) {
        // Font CDN down or network broken — proceed anyway. The user
        // sees the fallback font; the experience doesn't strand.
        setFontsReady(true);
        return;
      }
      requestAnimationFrame(poll);
    };

    poll();

    return () => { cancelled = true; };
  }, []);

  // (No visibility handler — the cycle keeps playing in background
  // tabs. Audio + the journey-end DOM events both work even when
  // hidden, so the loop advances through the full sequence. A prior
  // implementation paused on hide + reset on long-hide-return; user
  // explicitly asked for the cycle to "run regardless" of tab focus.)

  // ─── Sleep/wake recovery ────────────────────────────────────────
  // Laptops sleep. On wake: AudioContext is suspended (browsers do
  // this automatically when the GPU/audio subsystem is paused), the
  // <audio> element may be paused even though store state says
  // isPlaying, and any in-flight fal request likely timed out. Detect
  // the wake by watching for a real-time gap between ticks (>30s) and
  // re-prime audio. WebGL context loss recovers via the listeners
  // added directly to the canvas; nothing to do here for that.
  useEffect(() => {
    let lastTick = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;
      if (gap > 30_000) {
        // eslint-disable-next-line no-console
        console.warn(
          `[installation] Sleep/wake detected — gap ${(gap / 1000).toFixed(0)}s, re-priming audio`,
        );
        try {
          ensureResumed();
          const el = getAudioEngine().audioElement;
          const { isPlaying: shouldPlay } = useAudioStore.getState();
          if (shouldPlay && el.paused && !el.ended) tryPlay(el);
        } catch { /* engine not ready */ }
      }
    }, 2_000);
    return () => clearInterval(id);
  }, []);

  // ─── Heartbeat poster ───────────────────────────────────────────
  // If the kiosk URL has `?heartbeat_token=...`, POST a snapshot of
  // current state to /api/installation/heartbeat every 60s. The
  // /installation/status?token=... page reads the same row so an
  // operator can verify health from a phone without going on-site.
  //
  // Token is the auth — anyone with the URL can read or write that
  // row. Operators generate one per kiosk (16-byte hex), stamp it
  // into the kiosk URL, share the matching status URL with whoever
  // needs visibility.
  const heartbeatTokenRef = useRef<string | null>(null);
  const fpsRef = useRef({ frames: 0, sampledAt: performance.now(), fps: 0 });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tk = params.get("heartbeat_token");
    if (!tk || !/^[a-f0-9]{16,64}$/i.test(tk)) return;
    heartbeatTokenRef.current = tk;

    let raf = 0;
    const onFrame = () => {
      const r = fpsRef.current;
      r.frames += 1;
      const now = performance.now();
      const elapsed = now - r.sampledAt;
      if (elapsed >= 2_000) {
        r.fps = Math.round((r.frames * 1_000) / elapsed);
        r.frames = 0;
        r.sampledAt = now;
      }
      raf = requestAnimationFrame(onFrame);
    };
    raf = requestAnimationFrame(onFrame);

    const post = async () => {
      const token = heartbeatTokenRef.current;
      if (!token) return;
      let audioPaused: boolean | undefined;
      let audioCurrentTime: number | undefined;
      let audioDuration: number | undefined;
      let audioContextState: string | undefined;
      let lastPlayError: string | null | undefined;
      let lastPrimingError: string | null | undefined;
      try {
        const engine = getAudioEngine();
        audioPaused = engine.audioElement.paused;
        audioCurrentTime = engine.audioElement.currentTime;
        audioDuration = engine.audioElement.duration;
        audioContextState = engine.audioContext.state;
        const mod = await import("@/lib/audio/audio-engine");
        lastPlayError = mod.getLastPlayError();
        lastPrimingError = mod.getLastPrimingError();
      } catch { /* engine not yet initialized */ }

      const phase = phaseRef.current;
      const phaseLabel =
        phase.kind === "intro"
          ? "intro"
          : phase.kind === "journey"
            ? `journey ${phase.index + 1}/${sequence.length}`
            : "credits";
      const journeyName =
        phase.kind === "journey"
          ? sequence[phase.index]?.journey.name ?? null
          : phase.kind === "credits"
            ? "credits"
            : sequence[startIndex]?.journey.name ?? null;

      const payload = {
        uptimeS: Math.floor((Date.now() - startedAtMsRef.current) / 1_000),
        phaseLabel,
        journeyName,
        audioPaused,
        audioCurrentTime,
        audioDuration,
        audioContextState,
        fps: fpsRef.current.fps,
        lastPlayError: lastPlayError ?? null,
        lastPrimingError: lastPrimingError ?? null,
        userAgent: navigator.userAgent.slice(0, 200),
        viewport: `${window.innerWidth}×${window.innerHeight}`,
      };

      try {
        await fetch("/api/installation/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, payload }),
          keepalive: true,
        });
      } catch { /* network blip — next tick will retry */ }
    };

    // Fire immediately so the dashboard isn't blank for 60s.
    post();
    const id = setInterval(post, 60_000);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(raf);
    };
  }, [sequence, startIndex]);

  // ─── Health-beacon webhook ──────────────────────────────────────
  // If the kiosk URL has `?webhook_url=https://...`, POST a health
  // summary to that webhook every 10 minutes. Payload is shaped so a
  // single POST works with Slack (`text`), Discord (`content`), and
  // generic JSON consumers (`kioskState`).
  //
  // This is the push half of the alerting story (the heartbeat row +
  // status page is the pull half). Operator can subscribe a Slack
  // channel and get periodic confirmation the kiosk is healthy
  // without having to refresh anything.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const webhookUrl = params.get("webhook_url");
    if (!webhookUrl) return;
    // Only HTTPS; no exposing private network IPs.
    if (!/^https:\/\/[^/]+/.test(webhookUrl)) return;

    const post = async () => {
      let audioState = "no engine";
      let ctxState = "—";
      try {
        const engine = getAudioEngine();
        const t = isFinite(engine.audioElement.currentTime) ? engine.audioElement.currentTime.toFixed(0) : "0";
        const d = isFinite(engine.audioElement.duration) ? engine.audioElement.duration.toFixed(0) : "?";
        audioState = `${engine.audioElement.paused ? "PAUSED" : "playing"} ${t}/${d}s`;
        ctxState = engine.audioContext.state;
      } catch { /* engine not yet initialized */ }
      const phase = phaseRef.current;
      const phaseLabel =
        phase.kind === "intro"
          ? "intro"
          : phase.kind === "journey"
            ? `journey ${phase.index + 1}/${sequence.length}`
            : "credits";
      const journeyName =
        phase.kind === "journey"
          ? sequence[phase.index]?.journey.name ?? null
          : phase.kind === "credits"
            ? "credits"
            : null;
      const uptimeS = Math.floor((Date.now() - startedAtMsRef.current) / 1_000);
      const h = Math.floor(uptimeS / 3_600);
      const m = Math.floor((uptimeS % 3_600) / 60);
      const summary =
        `Resonance kiosk · phase=${phaseLabel}` +
        (journeyName ? ` (${journeyName})` : "") +
        ` · audio=${audioState} · audioCtx=${ctxState} · uptime=${h}h${m}m`;
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: summary,
            content: summary,
            kioskState: { phaseLabel, journeyName, audioState, ctxState, uptimeS },
          }),
          keepalive: true,
        });
      } catch { /* webhook unavailable, next interval will retry */ }
    };

    // Fire one beacon on boot so operators know the kiosk came online.
    post();
    const id = setInterval(post, 10 * 60 * 1_000);
    return () => clearInterval(id);
  }, [sequence]);

  // ─── Auto-reload watchdog ───────────────────────────────────────
  // Last-resort recovery for unattended kiosk operation. If no phase
  // change in 2x MAX_JOURNEY_MS (16 minutes), the loop is wedged
  // beyond what local recovery can fix (a JS error broke the phase
  // machine, audio totally failed to load and didn't trigger advance,
  // sleep/wake recovery silently failed, etc.) and location.reload()
  // is the only thing that gets the venue display back to a working
  // state without a callout.
  //
  // 16 minutes is well above any legitimate phase: longest journey is
  // capped at 8 min by MAX_JOURNEY_MS, intro is 7s, credits is 16s.
  // On /demo we skip the watchdog when the user hasn't pressed Begin
  // yet — that's a legitimate idle state, not a wedge.
  const lastPhaseChangeRef = useRef(Date.now());
  useEffect(() => {
    lastPhaseChangeRef.current = Date.now();
  }, [phase]);
  useEffect(() => {
    const id = setInterval(() => {
      if (playOnce && !started) return;
      const elapsed = Date.now() - lastPhaseChangeRef.current;
      if (elapsed > 2 * MAX_JOURNEY_MS) {
        // eslint-disable-next-line no-console
        console.warn(
          `[installation] Wedged for ${(elapsed / 60_000).toFixed(1)}min — reloading`,
        );
        window.location.reload();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [playOnce, started]);

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
    // Block the entire timing chain on fonts being loaded. The
    // bg-black overlay shows "cycle" stage by default (set in state
    // initializer), so the user sees pure black during the wait.
    // Once fontsReady flips true, this effect re-runs and the timer
    // chain starts deterministically — no more variable
    // black-pause-while-the-font-loads.
    if (!fontsReady) return;
    // /demo path: don't start the cycle until the user has tapped
    // the Begin button. Without this gate, the cycle visuals start
    // but audio is paused (autoplay-blocked) and the watchdog
    // can't recover from a NotAllowedError tryPlay rejection.
    if (needsGesture && !started) return;

    if (phase.kind === "intro") {
      // Unfreeze the journey engine — credits screen had it frozen so
      // shaders wouldn't keep mutating during the bg fade-in. Now the
      // new cycle is starting, normal shader switching resumes.
      try { getJourneyEngine().setFrozen(false); } catch { /* engine gone */ }
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
      // Initial intro stage. For the kiosk auto-start path we begin
      // at "cycle" so the InstallationIntro fades the cycle text in.
      // For the gesture-started path the user has already read the
      // cycle intro on the Begin overlay — we skip directly to
      // "fading-cycle" so the bg-black is opaque but the cycle text
      // doesn't mount a second time (the duplicate-titling bug the
      // user saw on mobile when both overlays rendered cycle text).
      setIntroStage(needsGesture && started ? "fading-cycle" : "cycle");

      // Refs to scoped timers so an early error listener can abort them.
      let fadeCycleStart: ReturnType<typeof setTimeout> | null = null;
      let mountJourney: ReturnType<typeof setTimeout> | null = null;
      let fadeJourneyStart: ReturnType<typeof setTimeout> | null = null;
      let finalPhaseChange: ReturnType<typeof setTimeout> | null = null;
      let earlyErrorListener: (() => void) | null = null;

      // Phase machine for the cycle intro.
      //
      // The bg-black layer is OPAQUE the entire time the visualizer is
      // alone behind it. The bg only starts fading once the journey
      // title has mounted, and the bg fade-out + the title's inner
      // fade-in run on the same clock — they finish together. The
      // shader emerges into view alongside the title, never alone.
      //
      // This kills the "orb shader briefly visible between intro and
      // ascension title" bug: there is no longer a window where the
      // visualizer is visible without the title to anchor it.
      //
      //   t=0     → cycle text fades in (1.4s) over opaque bg
      //   t=7s    → cycle text fades out (1.5s) AND pre-start journey 0
      //             (audio + shader + AI begin loading behind opaque bg).
      //             fading-cycle stage.
      //   t=8.5s  → cycle text fully gone. bg STILL OPAQUE — short
      //             black hold (2s) while the visualizer's shader
      //             compile + A/B crossfade settles. Long enough that
      //             the orb-flash window is closed; short enough that
      //             it doesn't read as a stall.
      //   t=10.5s → mount journey title (3.8s inner fade-in) AND start
      //             fading bg (3.8s — same clock). Title and shader
      //             arrive together.
      //   t=14.3s → title fully visible, bg fully gone. Shader sustains.
      //   t=19s   → title fades out (1.8s) — fading-journey stage.
      //             (4.7s peak hold; bumped twice per user feedback —
      //             once +1s, then +1.5s more — so gallery audiences
      //             can read the credits + dedication.)
      //   t=20.8s → phase change to journey 0.

      // Timing offsets. Kiosk auto-start path (/installation) waits
      // 7s for the cycle-text intro then begins; gesture-started
      // path (/demo) skips that wait because the user has already
      // read the cycle intro on the Begin overlay.
      const isGesture = needsGesture && started;
      const preStartDelay = isGesture ? 0 : INTRO_MS;
      const mountDelay = isGesture ? 2000 : INTRO_MS + 3500;
      const fadeOutDelay = isGesture ? 10_000 : INTRO_MS + 11_500;
      const phaseChangeDelay = isGesture ? 11_800 : INTRO_MS + 13_300;

      // Pre-start journey 0. The shader needs lead time to compile
      // + start its A/B crossfade before bg starts revealing it.
      fadeCycleStart = setTimeout(() => {
        if (sequence.length === 0) {
          setPhase({ kind: "credits" });
          return;
        }
        setIntroStage("fading-cycle");
        const entry = sequence[startIndex];
        if (!entry) {
          setPhase({ kind: "credits" });
          return;
        }
        useAudioStore.getState().setSuppressNextJourneyIntro(true);
        const track = trackForIndex(startIndex);
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
                const t = trackForIndex(startIndex);
                if (!t?.audioUrl) return;
                try { sessionStorage.removeItem(`audio-url-${t.id}`); } catch { /* ok */ }
                const { resolveAudioUrl } = await import("@/lib/audio/resolve-audio-url");
                const fresh = await resolveAudioUrl(t.audioUrl, t.id);
                el.src = fresh;
                el.load();
              } catch { /* best-effort */ }
            })();
          };
          // Initial play attempt — this seeds the watchdog. If the
          // browser is unlocked (desktop / prior gesture), audio
          // starts playing right away. If not, the mount-level
          // watchdog will retry every 250ms until the user clicks.
          tryPlay(el);
          el.addEventListener("error", earlyErrorListener);
        } catch { /* engine warming */ }
      }, preStartDelay);

      // Mount journey title + start bg fade, same clock. After the
      // pre-start there's a short black hold while the visualizer's
      // shader compile + A/B crossfade settle (gesture path: 2s
      // total; kiosk path: 3.5s including the 1.5s cycle-text
      // fade-out window). Then both fade in over 3.8s — title and
      // shader as one composition.
      mountJourney = setTimeout(() => {
        setIntroStage("journey");
      }, mountDelay);

      // Title peak hold ~4.2s before fade-out (gallery audiences
      // need time to read the credits + dedication).
      fadeJourneyStart = setTimeout(() => {
        setIntroStage("fading-journey");
      }, fadeOutDelay);

      // Phase change → overlay fully unmounted; journey is the
      // sole visual layer.
      finalPhaseChange = setTimeout(() => {
        setIntroStage("gone");
        setPhase({ kind: "journey", index: startIndex });
      }, phaseChangeDelay);

      return () => {
        if (fadeCycleStart) clearTimeout(fadeCycleStart);
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
      // Dots stay hidden during credits — they've already faded out
      // alongside Ghost's title and shouldn't pop back in over the
      // dedication screen. Previously we set titleWindow=true here
      // ("every dot lit as we wrap"), but the user found the second
      // appearance distracting.
      setTitleWindow(false);
      stopJourney();
      // Freeze the journey engine so primary/dual/tertiary shaders
      // stop switching while the credits black layer fades in. Without
      // this, dramatic shader motion peeks through the partially-
      // transparent overlay during the first 1-2s of the 3s fade.
      try { getJourneyEngine().setFrozen(true); } catch { /* engine gone */ }
      // CRITICAL: do NOT scrub el.currentTime back to 0 here. Setting
      // currentTime=0 un-sets the audio element's `ended` flag, which
      // makes the watchdog think audio is paused-but-ready-and-not-
      // ended → tryPlay() fires → Ghost restarts from the beginning
      // exactly when the intro screen appears. (The previous attempt
      // at this fix introduced that regression.) Just pause + clear
      // the queue. The audio element keeps currentTime at duration
      // so el.ended stays true and the watchdog stays out of the way.
      try {
        getAudioEngine().audioElement.pause();
      } catch { /* engine gone */ }
      setQueue([], 0);
      // Credits hold:
      //   - kiosk loop: CREDITS_MS (16s); cycle restarts
      //   - /demo:      14s; phase goes to intro, started flips back
      //                 to false so the start screen re-mounts. The
      //                 reviewer sees the full intro again with the
      //                 play button — no replay click required.
      const delay = playOnce ? 14_000 : CREDITS_MS;
      const t = setTimeout(() => {
        // One more pause right before the phase change — defense
        // against any pending audio-provider effect that re-fires
        // play() during the credits→intro transition.
        try { getAudioEngine().audioElement.pause(); } catch { /* ok */ }
        if (playOnce) {
          setStarted(false);
          setStartScreenUnmounted(false);
        }
        setPhase({ kind: "intro" });
      }, delay);
      return () => clearTimeout(t);
    }

    // Journey phase — load track, start journey, watch for end
    const entry = sequence[phase.index];
    if (!entry) {
      setPhase({ kind: "credits" });
      return;
    }

    // Show dots while the per-journey title overlay is up — but ONLY
    // when there's actually a title overlay being shown. For journey 0
    // (Ascension), the title was already displayed during the cycle
    // intro and visualizer-client's journey intro is suppressed via
    // the suppressNextJourneyIntro store flag — so re-showing the
    // indicator now makes it fade in/out a second time with no title
    // to anchor it. Skip the titleWindow flash for journey 0.
    let titleHideTimer: ReturnType<typeof setTimeout> | null = null;
    // Skip the title flash for the FIRST journey of the cycle —
    // InstallationIntro already showed its title during the cycle
    // intro overlay, and re-showing it now produces a visible duplicate
    // (dots fade in/out twice, journey title appears twice). For the
    // normal kiosk path this is journey 0; with ?start=N it's journey N.
    // Compare against startIndex, not 0, to handle both cases.
    if (phase.index !== startIndex) {
      setTitleWindow(true);
      // visualizer-client's journey-title overlay runs `journeyIntroAnim
      // 8.5s` in installation mode. Its keyframe holds opacity 1 from
      // 40% (3.4s) through 70% (5.95s) and fades out 70%→100%
      // (5.95s→8.5s). Trigger the dot fade-out at exactly the 70%
      // breakpoint so the dots and title fade out as one unit.
      titleHideTimer = setTimeout(() => setTitleWindow(false), 5_950);
    }

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
      // No explicit pause() — calling pause() flips isPlaying to false
      // in the store, and the tick loop's audioEnded check used to
      // race on that. setQueue + startJourney is enough for the
      // audio-provider to swap src; pausing first only created bugs.
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
        // VERIFY the track actually played to its natural end before
        // advancing. The "ended" DOM event can fire spuriously when
        // src is replaced mid-play (e.g., by our early-error retry
        // path), or when the browser aborts a load. Without this
        // verification, a spurious ended event during cycle intro
        // would cascade into a bogus skip-to-next-journey at the
        // moment the journey-phase tick loop started.
        const dur = el.duration;
        const t = el.currentTime;
        if (!isFinite(dur) || dur <= 0) return; // duration unknown — ignore
        if (t < dur - 2) {
          // eslint-disable-next-line no-console
          console.warn(
            `[installation] ${entry.journey.name}: ignoring spurious 'ended' (t=${t.toFixed(1)} / dur=${dur.toFixed(1)})`,
          );
          return;
        }
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
        // Same gates as the mount-level watchdog: skip if ended or
        // near-end. Calling play() on an ended element rejects with
        // AbortError "interrupted by end of playback" — the user's
        // console showed 100s of these stacking up after Ghost ended.
        if (
          el.paused &&
          !el.ended &&
          el.readyState >= 2 &&
          !el.error &&
          (el.duration === 0 || el.currentTime < el.duration - 0.5)
        ) {
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
      const { currentTime, duration } = useAudioStore.getState();
      // Track-ended check: ONLY based on currentTime reaching duration.
      // Used to also include `currentTime > 1 && !isPlaying`, but that
      // clause fired on any momentary isPlaying=false (autoplay-block
      // re-rejection, audio-provider onEnded pause, brief pause during
      // src swap) and produced spurious skips. The DOM "ended" event
      // listener above handles the natural-end signal more reliably,
      // and the stalled/timedOut paths still catch dead tracks.
      const audioEnded = duration > 0 && currentTime >= duration - 0.5;
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
      const { currentTime, duration } = useAudioStore.getState();
      // Same tightening as the RAF tick above — only natural-end.
      const audioEnded = duration > 0 && currentTime >= duration - 0.5;
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
      if (titleHideTimer) clearTimeout(titleHideTimer);
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
  }, [phase, sequence, fontsReady, playOnce, needsGesture, started]);

  // Operator status panel — toggled with ⌘⇧S. Captured here so the
  // panel can show the live phase + journey name without needing to
  // re-derive them from the audio store.
  const statusPhaseLabel =
    phase.kind === "intro"
      ? "intro"
      : phase.kind === "journey"
        ? `journey ${phase.index + 1}/${sequence.length}`
        : "credits";
  const statusJourneyName =
    phase.kind === "journey"
      ? sequence[phase.index]?.journey.name ?? null
      : phase.kind === "credits"
        ? "credits"
        : sequence[startIndex]?.journey.name ?? null;
  return (
    <div ref={containerRef} className="h-full w-full relative">
      {/* Visualizer wrapper — fades the entire shader/AI/post-process
          stack to black during credits so the user sees a "movie
          fades to black" transition instead of a shader peeking
          through a partially-transparent overlay. The page bg
          (bg-black on the installation page) shows through at
          opacity 0. Snap back to opacity 1 instantly on intro
          mount — the InstallationIntro bg-black covers it during
          the cycle stage, so the snap is invisible. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: phase.kind === "credits" ? 0 : 1,
          transition: phase.kind === "credits" ? "opacity 3000ms ease-out" : "none",
        }}
      >
        <VisualizerClient />
      </div>

      <InstallationStatusPanel
        phaseKind={phase.kind}
        phaseLabel={statusPhaseLabel}
        journeyName={statusJourneyName}
        startedAt={startedAtMsRef.current}
      />

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
      {/* Pre-fonts black overlay. Until the loop client confirms all
          three Cormorant Garamond variants (300 regular, 300 italic,
          400) are loaded, render a plain black screen and nothing else.
          The InstallationIntro component is unmounted entirely during
          this window — its cycle text would otherwise paint in the
          Georgia fallback (different glyph metrics from Cormorant) and
          re-render in Cormorant once the font swapped, which the user
          read as "the title and initial text" jumping size. */}
      {!fontsReady && (
        <div
          className="absolute inset-0 z-50 bg-black pointer-events-none"
          aria-hidden
        />
      )}
      {fontsReady && introStage !== "gone" && (phase.kind === "intro" || (phase.kind === "journey" && phase.index === startIndex && (introStage === "journey" || introStage === "fading-journey"))) && (
        <InstallationIntro
          stage={introStage}
          journey={sequence[startIndex]?.journey ?? null}
          trackArtist={sequence[startIndex]?.track?.artist ?? null}
        />
      )}
      {phase.kind === "credits" && <InstallationCredits />}

      {/* /demo Begin overlay — captures the gesture iOS Safari needs
          to unlock audio, plus serves as a clean "start when ready"
          UX for desktop reviewers. Hidden on /installation (kiosk
          mode auto-starts). Hidden until fontsReady so the title
          text doesn't paint in Georgia → swap mid-display.
          Stays mounted (with opacity transitioning to 0) for 1.5s
          after the user taps so the hand-off to the journey-0
          shader feels like a fade, not a hard cut. */}
      {needsGesture && fontsReady && !startScreenUnmounted && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Begin"
          onClick={() => {
            if (started) return;
            tryUnlockAudio();
            setStarted(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (started) return;
              tryUnlockAudio();
              setStarted(true);
            }
          }}
          className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black px-8 text-center"
          style={{
            cursor: started ? "default" : "pointer",
            pointerEvents: started ? "none" : "auto",
            opacity: started ? 0 : 1,
            // First mount: fade in over 1.5s. After tap: opacity goes
            // to 0 with a 1500ms ease-out transition so the bg-black
            // softly cross-fades into the InstallationIntro behind it.
            animation: started
              ? "none"
              : "introFadeIn 1500ms ease-out forwards",
            transition: started ? "opacity 1500ms ease-out" : undefined,
          }}
        >
          <style jsx>{`
            @keyframes introFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          {/* Full cycle intro context on the start screen: hero title,
              subtitle, the description paragraph, and the by-Karel
              credit block. The phase machine SKIPS the cycle text
              after the user taps (sets introStage to "fading-cycle"
              directly) so this content doesn't render twice. */}
          <div
            className="text-white/90"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontWeight: 300,
              fontSize: "clamp(3.5rem, 8vw, 6rem)",
              letterSpacing: "-0.02em",
              lineHeight: 1.05,
              marginBottom: "0.5rem",
            }}
          >
            Resonance
          </div>
          <div
            className="text-white/65"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "clamp(1.3rem, 2.8vw, 2rem)",
              letterSpacing: "0.01em",
              marginBottom: "2.5rem",
            }}
          >
            A contemplative listening room
          </div>
          <p
            className="text-white/55 max-w-2xl mx-auto"
            style={{
              fontFamily: "var(--font-geist-sans)",
              fontWeight: 400,
              fontSize: "clamp(1.05rem, 1.8vw, 1.3rem)",
              lineHeight: 1.65,
              marginBottom: "2.5rem",
            }}
          >
            A five-part journey. Composed music drives a slow audiovisual
            landscape of generative shaders and original AI-rendered imagery
            — created live, never the same twice. Recline. Stay as long or
            as briefly as you wish.
          </p>
          <div
            className="text-white/55"
            style={{
              fontFamily: "var(--font-geist-mono)",
              fontSize: "0.85rem",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              marginBottom: "0.5rem",
            }}
          >
            by
          </div>
          <div
            className="text-white/85"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)",
              letterSpacing: "0.02em",
              marginBottom: "3rem",
            }}
          >
            Karel Barnoski
          </div>
          {/* Play button — same circular shape + fill the shared
              journey start screen uses, for visual consistency. */}
          <button
            type="button"
            aria-label="Begin"
            onClick={(e) => {
              e.stopPropagation();
              tryUnlockAudio();
              setStarted(true);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "rgba(255, 255, 255, 0.9)",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <div
            style={{
              marginTop: "1.5rem",
              fontSize: "0.65rem",
              fontFamily: "var(--font-geist-mono)",
              color: "rgba(255, 255, 255, 0.3)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            Tap anywhere to begin
          </div>
        </div>
      )}

      {/* Progress stepper — locked to the journey title as a single
          visual unit. Fades in / out with EXACTLY the same timings the
          title uses so they read as one composition.
            • Cycle intro (journey 0):
                fade-in  3800ms (matches installationContentFade inner
                                 anim used by the journey title)
                fade-out 1800ms (matches the outer overlay opacity
                                 transition during fading-journey)
            • Per-journey title (journeys 1-4, installation 8.5s):
                fade-in  3400ms (matches journeyIntroAnim 0→40% of 8.5s)
                fade-out 2550ms (matches journeyIntroAnim 70→100% of 8.5s)
            • Credits: dots stay hidden — they faded out with the last
              journey's title and shouldn't pop back in over the
              dedication screen. */}
      {sequence.length > 0 && (() => {
        const inIntroJourney = phase.kind === "intro" && introStage === "journey";
        const inIntroFadingJourney = phase.kind === "intro" && introStage === "fading-journey";
        const inJourneyTitle = phase.kind === "journey" && titleWindow;
        const inJourneyPostTitle = phase.kind === "journey" && !titleWindow;
        const inCredits = phase.kind === "credits";

        // Mount during the broader window so opacity transitions have
        // both a "from" and "to" frame to animate against without
        // re-mount flicker. Unmount outside (saves DOM during long
        // post-title playback).
        const shouldMount =
          inIntroJourney ||
          inIntroFadingJourney ||
          phase.kind === "journey" ||
          inCredits;
        if (!shouldMount) return null;

        // show = stepper should be visible (opacity 1). inCredits is
        // intentionally NOT here — dots fade out with the journey
        // title and stay hidden through the dedication screen.
        const show = inIntroJourney || inJourneyTitle;

        // Pick the transition duration based on which fade we're in.
        // Each branch matches what the journey title uses at the same
        // moment, so the two visual elements fade as one unit.
        let transition: string;
        if (inIntroJourney) {
          transition = "opacity 3800ms ease-out";
        } else if (inIntroFadingJourney) {
          transition = "opacity 1800ms ease-out";
        } else if (inJourneyTitle) {
          transition = "opacity 3400ms ease-in-out";
        } else if (inJourneyPostTitle) {
          transition = "opacity 2550ms ease-in-out";
        } else {
          transition = "opacity 1200ms ease-out";
        }

        const currentIndex =
          phase.kind === "intro"
            ? startIndex
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
              transition,
            }}
          >
            <div className="flex items-center gap-1.5">
              {sequence.map((_, i) => {
                const done = i < currentIndex;
                const current = !isInIntro
                  ? phase.kind === "journey" && i === currentIndex
                  : i === startIndex;
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
                      // Uniform width across all 5 segments — current
                      // segment differentiated by background + glow
                      // alone, not by size.
                      width: "56px",
                      height: "4px",
                      borderRadius: "2px",
                      background,
                      border,
                      boxShadow: current
                        ? "0 0 12px rgba(255, 255, 255, 0.55), 0 0 4px rgba(196, 181, 253, 0.4)"
                        : "none",
                      transition: "background 400ms ease, box-shadow 400ms ease",
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
