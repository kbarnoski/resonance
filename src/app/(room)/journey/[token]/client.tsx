"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ShaderVisualizer, SHADERS, type VisualizerMode } from "@/components/audio/visualizer";
import type { Visualizer3DMode } from "@/components/audio/visualizer-3d";

// Lazy-load Visualizer3D so three.js doesn't block first paint on shared journey routes.
const Visualizer3D = dynamic(() => import("@/components/audio/visualizer-3d").then((m) => m.Visualizer3D), {
  ssr: false,
});
import { JourneyCompositor } from "@/components/audio/journey-compositor";
import { JourneyPhaseIndicator } from "@/components/audio/journey-phase-indicator";
import { ShareSheet } from "@/components/ui/share-sheet";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { usePathProgressStore } from "@/lib/journeys/path-progress-store";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { prepareGhostFlashImages, clearGhostFlashImages } from "@/lib/journeys/ghost-flash-images";
import { prepareGhostReference, clearGhostReference } from "@/lib/journeys/ghost-reference";
import { getTierProfile } from "@/lib/audio/device-tier";
import { createClient } from "@/lib/supabase/client";
import { MODES_3D, MODES_AI } from "@/lib/shaders";
import type { Journey, JourneyFrame, JourneyPhaseId } from "@/lib/journeys/types";
import { Pause, Play, Volume2, VolumeX, Share2, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";

function formatTime(s: number): string {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Ambient shaders used as backdrop underneath AI imagery modes (same as main app)
const AI_BACKDROP_SHADERS: VisualizerMode[] = [
  "fog", "nebula", "drift",
  "tide", "ember",
];

function getAiBackdropShader(aiMode: string): VisualizerMode {
  let hash = 0;
  for (let i = 0; i < aiMode.length; i++) hash = (hash * 31 + aiMode.charCodeAt(i)) | 0;
  return AI_BACKDROP_SHADERS[Math.abs(hash) % AI_BACKDROP_SHADERS.length];
}

// Throttle frame state updates — match main app (~30fps)
const FRAME_THROTTLE_MS = 33;

// A/B buffer crossfade constants — must match VisualizerCore
const SHADER_FADE_RATE = 0.008;
const DUAL_SHADER_MAX_OPACITY = 0.85;
const TERTIARY_SHADER_MAX_OPACITY = 0.60;

interface SharedJourneyClientProps {
  journey: Journey;
  audioUrl: string | null;
  shareToken: string;
  playbackSeed: string | null;
  creatorName: string | null;
  musicArtist: string | null;
  analysisEvents: { time: number; type: string; intensity: number }[];
  cueMarkers: { time: number; label: string }[];
  recordingDuration: number;
  /** Optional path context — set when the viewer arrived from a shared
   *  /path/[token] landing. Drives the Continue Path + Return to Path +
   *  Enter Culmination buttons in the end overlay so shared viewers get
   *  the same album-walkthrough flow as in-app users. */
  pathContext?: {
    pathToken: string;
    pathName: string;
    accent: string;
    glow: string;
    steps: Array<{ journeyId: string; shareToken: string | null; name: string }>;
    currentIndex: number;
    culmination: { journeyId: string; shareToken: string | null; name: string } | null;
  } | null;
}

export function SharedJourneyClient({
  journey,
  audioUrl,
  shareToken,
  playbackSeed,
  creatorName,
  musicArtist,
  analysisEvents,
  cueMarkers,
  recordingDuration,
  pathContext = null,
}: SharedJourneyClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [started, setStarted] = useState(false); // user must tap to start (browser auto-play policy)
  const [isPlaying, setIsPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [journeyFrame, setJourneyFrame] = useState<JourneyFrame | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [shareSheet, setShareSheet] = useState(false);
  const [ended, setEnded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(true); // assume auth until checked
  const [journeyIntroVisible, setJourneyIntroVisible] = useState(false);
  const [phaseIndicatorReady, setPhaseIndicatorReady] = useState(false);
  const [replayCount, setReplayCount] = useState(0);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  const resolvedAudioUrlRef = useRef<string | null>(null);

  // Check auth state — show signup CTA for unauthenticated viewers
  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      setIsAuthenticated(!!user);
    });
  }, []);

  // Load Cormorant Garamond for start screen + phase indicator
  useEffect(() => {
    const id = "journey-shared-font";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&display=swap";
    document.head.appendChild(link);
  }, []);

  // Time display — direct DOM updates, no re-renders
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const timeDisplayMobileRef = useRef<HTMLSpanElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Frame throttle
  const lastFrameTimeRef = useRef(0);
  const frameRef = useRef<JourneyFrame | null>(null);

  // Phase changes via engine callback
  // Phase guidance is now handled internally by JourneyPhaseIndicator

  // ─── A/B buffer crossfade (matching VisualizerCore exactly) ───
  // Two persistent shader layers swap roles during transitions. The active layer
  // renders the current shader at full opacity. When mode changes, the INACTIVE
  // layer silently compiles the new shader (at opacity 0). Once ready, a rAF-based
  // crossfade swaps them. No React key remounting, no WebGL context destruction.
  const shaderMode = (journeyFrame?.shaderMode ?? journey.phases[0]?.shaderModes[0] ?? "cosmos") as VisualizerMode;
  const [layerAMode, setLayerAMode] = useState<VisualizerMode>(shaderMode);
  const [layerBMode, setLayerBMode] = useState<VisualizerMode | null>(null);
  const activeLayerRef = useRef<'a' | 'b'>('a');
  const layerADivRef = useRef<HTMLDivElement>(null);
  const layerBDivRef = useRef<HTMLDivElement>(null);
  const primaryFadeRef = useRef<number>(0);
  const primaryPrevModeRef = useRef(shaderMode);
  // Callback refs: set initial opacity exactly once on mount
  const setLayerARef = useCallback((el: HTMLDivElement | null) => {
    layerADivRef.current = el;
    if (el) el.style.opacity = "1";
  }, []);
  const setLayerBRef = useCallback((el: HTMLDivElement | null) => {
    layerBDivRef.current = el;
    if (el) el.style.opacity = "0";
  }, []);

  // Dual shader A/B buffer
  const [dualLayerAMode, setDualLayerAMode] = useState<string | null>(null);
  const [dualLayerBMode, setDualLayerBMode] = useState<string | null>(null);
  const dualActiveRef = useRef<'a' | 'b'>('a');
  const dualLayerADivRef = useRef<HTMLDivElement>(null);
  const dualLayerBDivRef = useRef<HTMLDivElement>(null);
  const dualFadeRef = useRef<number>(0);
  const dualPrevTargetRef = useRef<string | null>(null);
  const setDualLayerARef = useCallback((el: HTMLDivElement | null) => {
    dualLayerADivRef.current = el;
    if (el) el.style.opacity = "0";
  }, []);
  const setDualLayerBRef = useCallback((el: HTMLDivElement | null) => {
    dualLayerBDivRef.current = el;
    if (el) el.style.opacity = "0";
  }, []);

  // ─── A/B ready callbacks ───
  const primaryReadyCbRef = useRef<(() => void) | null>(null);
  const primaryReadyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const primaryWaitingForRef = useRef<'a' | 'b' | null>(null);
  const dualReadyCbRef = useRef<(() => void) | null>(null);
  const dualReadyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dualWaitingForRef = useRef<'a' | 'b' | null>(null);
  const tertiaryNextReadyCbRef = useRef<(() => void) | null>(null);
  const tertiaryNextReadyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleLayerAReady = useCallback(() => {
    if (primaryWaitingForRef.current === 'a') {
      clearTimeout(primaryReadyTimeoutRef.current);
      const cb = primaryReadyCbRef.current;
      if (cb) { primaryReadyCbRef.current = null; primaryWaitingForRef.current = null; cb(); }
    }
  }, []);
  const handleLayerBReady = useCallback(() => {
    if (primaryWaitingForRef.current === 'b') {
      clearTimeout(primaryReadyTimeoutRef.current);
      const cb = primaryReadyCbRef.current;
      if (cb) { primaryReadyCbRef.current = null; primaryWaitingForRef.current = null; cb(); }
    }
  }, []);
  const handleDualLayerAReady = useCallback(() => {
    if (dualWaitingForRef.current === 'a') {
      clearTimeout(dualReadyTimeoutRef.current);
      const cb = dualReadyCbRef.current;
      if (cb) { dualReadyCbRef.current = null; dualWaitingForRef.current = null; cb(); }
    }
  }, []);
  const handleDualLayerBReady = useCallback(() => {
    if (dualWaitingForRef.current === 'b') {
      clearTimeout(dualReadyTimeoutRef.current);
      const cb = dualReadyCbRef.current;
      if (cb) { dualReadyCbRef.current = null; dualWaitingForRef.current = null; cb(); }
    }
  }, []);
  const handleTertiaryShaderReady = useCallback(() => {
    clearTimeout(tertiaryNextReadyTimeoutRef.current);
    const cb = tertiaryNextReadyCbRef.current;
    if (cb) { cb(); tertiaryNextReadyCbRef.current = null; }
  }, []);

  // Primary shader A/B crossfade — triggered when shaderMode changes
  useEffect(() => {
    if (shaderMode === primaryPrevModeRef.current) return;
    primaryPrevModeRef.current = shaderMode;

    cancelAnimationFrame(primaryFadeRef.current);
    clearTimeout(primaryReadyTimeoutRef.current);
    primaryReadyCbRef.current = null;
    primaryWaitingForRef.current = null;

    const active = activeLayerRef.current;
    const inactive: 'a' | 'b' = active === 'a' ? 'b' : 'a';
    const activeDivRef = active === 'a' ? layerADivRef : layerBDivRef;
    const inactiveDivRef = inactive === 'a' ? layerADivRef : layerBDivRef;

    // Snap opacities: active stays visible, inactive stays hidden.
    if (activeDivRef.current) activeDivRef.current.style.opacity = "1";
    if (inactiveDivRef.current) inactiveDivRef.current.style.opacity = "0";

    // Set new shader on the inactive layer (compiles in background at opacity 0)
    if (inactive === 'a') setLayerAMode(shaderMode);
    else setLayerBMode(shaderMode);

    const startCrossfade = () => {
      if (inactiveDivRef.current) inactiveDivRef.current.style.opacity = "0";
      let progress = 0;
      const animate = () => {
        progress = Math.min(1, progress + SHADER_FADE_RATE);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        if (activeDivRef.current) activeDivRef.current.style.opacity = String(1 - eased);
        if (inactiveDivRef.current) inactiveDivRef.current.style.opacity = String(eased);
        if (progress < 1) {
          primaryFadeRef.current = requestAnimationFrame(animate);
        } else {
          activeLayerRef.current = inactive;
        }
      };
      primaryFadeRef.current = requestAnimationFrame(animate);
    };

    primaryWaitingForRef.current = inactive;
    primaryReadyCbRef.current = startCrossfade;
    // Safety timeout — start crossfade even if onReady never fires (GL context lost, 3D mode)
    primaryReadyTimeoutRef.current = setTimeout(() => {
      if (primaryReadyCbRef.current) {
        primaryReadyCbRef.current();
        primaryReadyCbRef.current = null;
        primaryWaitingForRef.current = null;
      }
    }, 3000);

    return () => {
      cancelAnimationFrame(primaryFadeRef.current);
      clearTimeout(primaryReadyTimeoutRef.current);
      primaryReadyCbRef.current = null;
      primaryWaitingForRef.current = null;
    };
  }, [shaderMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Dual shader A/B crossfade ───
  // Tier gate: low-tier devices skip the dual shader entirely (saves a full
  // WebGL render pass per frame). The journey's intended dual still appears
  // on high/medium tiers.
  const dualShaderTarget = getTierProfile().enableDualShader
    && journeyFrame?.dualShaderMode
    && SHADERS[journeyFrame.dualShaderMode as VisualizerMode]
    ? journeyFrame.dualShaderMode : null;

  useEffect(() => {
    if (dualShaderTarget === dualPrevTargetRef.current) return;
    dualPrevTargetRef.current = dualShaderTarget;

    cancelAnimationFrame(dualFadeRef.current);
    clearTimeout(dualReadyTimeoutRef.current);
    dualReadyCbRef.current = null;
    dualWaitingForRef.current = null;

    const active = dualActiveRef.current;
    const inactive: 'a' | 'b' = active === 'a' ? 'b' : 'a';
    const activeDivRef = active === 'a' ? dualLayerADivRef : dualLayerBDivRef;
    const inactiveDivRef = inactive === 'a' ? dualLayerADivRef : dualLayerBDivRef;

    if (dualShaderTarget) {
      // New or changed dual shader — crossfade from active to inactive
      if (inactiveDivRef.current) inactiveDivRef.current.style.opacity = "0";

      if (inactive === 'a') setDualLayerAMode(dualShaderTarget);
      else setDualLayerBMode(dualShaderTarget);

      const startDualCrossfade = () => {
        const activeStartOpacity = activeDivRef.current
          ? parseFloat(activeDivRef.current.style.opacity || "0") : 0;

        let progress = 0;
        const animate = () => {
          progress = Math.min(1, progress + SHADER_FADE_RATE);
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          if (activeDivRef.current) {
            activeDivRef.current.style.opacity = String(Math.max(0, activeStartOpacity * (1 - eased)));
          }
          if (inactiveDivRef.current) {
            inactiveDivRef.current.style.opacity = String(DUAL_SHADER_MAX_OPACITY * eased);
          }
          if (progress < 1) {
            dualFadeRef.current = requestAnimationFrame(animate);
          } else {
            dualActiveRef.current = inactive;
          }
        };
        dualFadeRef.current = requestAnimationFrame(animate);
      };

      dualWaitingForRef.current = inactive;
      dualReadyCbRef.current = startDualCrossfade;
      dualReadyTimeoutRef.current = setTimeout(() => {
        if (dualReadyCbRef.current) {
          dualReadyCbRef.current();
          dualReadyCbRef.current = null;
          dualWaitingForRef.current = null;
        }
      }, 3000);
    } else {
      // Dual shader removed — fade out the active layer
      if (!activeDivRef.current) return;
      const startOpacity = parseFloat(activeDivRef.current.style.opacity || "0");
      if (startOpacity <= 0.001) return;

      let progress = 0;
      const fadeOut = () => {
        progress = Math.min(1, progress + SHADER_FADE_RATE);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        if (activeDivRef.current) {
          activeDivRef.current.style.opacity = String(Math.max(0, startOpacity * (1 - eased)));
        }
        if (progress < 1) {
          dualFadeRef.current = requestAnimationFrame(fadeOut);
        }
      };
      dualFadeRef.current = requestAnimationFrame(fadeOut);
    }

    return () => {
      cancelAnimationFrame(dualFadeRef.current);
      clearTimeout(dualReadyTimeoutRef.current);
      dualReadyCbRef.current = null;
      dualWaitingForRef.current = null;
    };
  }, [dualShaderTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Tertiary shader layer (with onReady gating) ───
  const [tertiaryShaderVisible, setTertiaryShaderVisible] = useState<string | null>(null);
  const tertiaryShaderRef = useRef<HTMLDivElement>(null);
  const tertiaryFadeRef = useRef<number>(0);

  const tertiaryShaderTarget = journeyFrame?.tertiaryShaderMode && SHADERS[journeyFrame.tertiaryShaderMode as VisualizerMode]
    ? journeyFrame.tertiaryShaderMode : null;

  useEffect(() => {
    if (tertiaryShaderTarget) {
      if (tertiaryShaderRef.current) tertiaryShaderRef.current.style.opacity = "0";
      setTertiaryShaderVisible(tertiaryShaderTarget);
      cancelAnimationFrame(tertiaryFadeRef.current);
      clearTimeout(tertiaryNextReadyTimeoutRef.current);
      tertiaryNextReadyCbRef.current = null;

      const startFadeIn = () => {
        let progress = 0;
        const fadeIn = () => {
          progress = Math.min(1, progress + SHADER_FADE_RATE);
          const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          if (tertiaryShaderRef.current) tertiaryShaderRef.current.style.opacity = String(eased * TERTIARY_SHADER_MAX_OPACITY);
          if (progress < 1) tertiaryFadeRef.current = requestAnimationFrame(fadeIn);
        };
        tertiaryFadeRef.current = requestAnimationFrame(() => {
          if (tertiaryShaderRef.current) tertiaryShaderRef.current.style.opacity = "0";
          tertiaryFadeRef.current = requestAnimationFrame(fadeIn);
        });
      };

      tertiaryNextReadyCbRef.current = startFadeIn;
      tertiaryNextReadyTimeoutRef.current = setTimeout(() => {
        if (tertiaryNextReadyCbRef.current) {
          tertiaryNextReadyCbRef.current();
          tertiaryNextReadyCbRef.current = null;
        }
      }, 3000);
    } else {
      cancelAnimationFrame(tertiaryFadeRef.current);
      clearTimeout(tertiaryNextReadyTimeoutRef.current);
      tertiaryNextReadyCbRef.current = null;
      if (!tertiaryShaderRef.current) {
        setTertiaryShaderVisible(null);
        return;
      }
      const startOpacity = parseFloat(tertiaryShaderRef.current.style.opacity || "0");
      if (startOpacity <= 0.001) {
        setTertiaryShaderVisible(null);
        return;
      }
      let progress = 0;
      const fadeOut = () => {
        progress = Math.min(1, progress + SHADER_FADE_RATE);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        if (tertiaryShaderRef.current) tertiaryShaderRef.current.style.opacity = String(startOpacity * (1 - eased));
        if (progress < 1) {
          tertiaryFadeRef.current = requestAnimationFrame(fadeOut);
        } else {
          setTertiaryShaderVisible(null);
        }
      };
      tertiaryFadeRef.current = requestAnimationFrame(fadeOut);
    }
    return () => {
      cancelAnimationFrame(tertiaryFadeRef.current);
      clearTimeout(tertiaryNextReadyTimeoutRef.current);
      tertiaryNextReadyCbRef.current = null;
    };
  }, [tertiaryShaderTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS detection removed — webkit fullscreen API handles all platforms

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 5000);
  }, []);

  useEffect(() => {
    const handleMove = () => resetHideTimer();
    const handleTouch = () => resetHideTimer();
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchstart", handleTouch);
    resetHideTimer();
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchstart", handleTouch);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [resetHideTimer]);

  // Hide the mouse cursor in sync with the bottom controls — same idle timer
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = controlsVisible ? "" : "none";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [controlsVisible]);

  // Pre-resolve audio URL so it's ready when user taps start
  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    fetch(audioUrl)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) resolvedAudioUrlRef.current = data.url ?? audioUrl;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [audioUrl]);

  // Initialize audio + analyser when user taps start
  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const node = ctx.createAnalyser();
    node.fftSize = 256;

    async function init() {
      // Resume context (required after user gesture on some browsers)
      if (ctx.state === "suspended") await ctx.resume();

      const url = resolvedAudioUrlRef.current;
      if (url) {
        try {
          const audio = new Audio(url);
          audio.crossOrigin = "anonymous";
          audioRef.current = audio;

          const source = ctx.createMediaElementSource(audio);
          source.connect(node);
          node.connect(ctx.destination);

          audio.addEventListener("playing", () => {
            endedRef.current = false;
            setEnded(false);
            setIsPlaying(true);
          });
          audio.addEventListener("pause", () => setIsPlaying(false));
          audio.addEventListener("ended", () => {
            endedRef.current = true;
            setEnded(true);
            audio.currentTime = 0;
            setIsPlaying(false);
            // Record completion in the path-progress store so custom
            // paths (Welcome Home album, etc.) can unveil their culmination
            // after every constituent journey is finished.
            try {
              usePathProgressStore.getState().completeJourney(journey.id);
            } catch {}
          });

          // Play once ready
          audio.addEventListener("canplay", () => {
            if (cancelled) return;
            audio.play().catch(() => setIsPlaying(false));
          }, { once: true });
        } catch {
          node.connect(ctx.destination);
        }
      } else {
        node.connect(ctx.destination);
      }

      if (cancelled) return;
      analyserRef.current = node;
      dataArrayRef.current = new Uint8Array(node.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      setAnalyser(node);
      setDataArray(new Uint8Array(node.frequencyBinCount) as Uint8Array<ArrayBuffer>);
    }

    init();

    return () => {
      cancelled = true;
      audioRef.current?.pause();
      ctx.close();
    };
  }, [started]);

  // Start journey engine only after user taps start
  useEffect(() => {
    if (!started) return;
    getRealtimeImageService().resetSession();
    if (journey.enableBassFlash) {
      prepareGhostFlashImages(journey.id);
    }
    // Ghost-only: canonical-portrait reference for PuLID identity lock.
    if (journey.id === "ghost") {
      prepareGhostReference(journey.id);
    }
    const engine = getJourneyEngine();
    const seed = playbackSeed ? parseInt(playbackSeed, 10) : undefined;
    const duration = useAudioStore.getState().duration;
    engine.start(journey, {
      ...(seed != null && !isNaN(seed) ? { seed } : {}),
      trackDuration: duration > 0 ? duration : undefined,
    });

    // Show "Journey Started" intro overlay
    setJourneyIntroVisible(true);
    setPhaseIndicatorReady(false);
    const introTimer = setTimeout(() => setJourneyIntroVisible(false), 6000);
    const phaseTimer = setTimeout(() => setPhaseIndicatorReady(true), 8000);

    return () => {
      engine.stop();
      clearTimeout(introTimer);
      clearTimeout(phaseTimer);
      clearGhostFlashImages();
      clearGhostReference();
    };
  }, [started, journey, playbackSeed]);

  // Wire cue markers + analysis events to engine for bass flash
  useEffect(() => {
    if (!started) return;

    const engine = getJourneyEngine();
    const audio = audioRef.current;
    const dur = (audio && audio.duration > 0) ? audio.duration : recordingDuration;

    if (dur <= 0) return;

    // Auto-detected events from analysis
    const autoEvents = analysisEvents.map((e) => ({
      time: e.time,
      type: e.type as "bass_hit" | "texture_change" | "climax" | "drop" | "silence" | "new_idea",
      intensity: e.intensity,
    }));

    // Cue markers as bass_hit events (only for journeys with enableBassFlash)
    let allEvents = autoEvents;
    if (journey.enableBassFlash && cueMarkers.length > 0) {
      const manualAsEvents = cueMarkers.map((c) => ({
        time: c.time,
        type: "bass_hit" as const,
        intensity: 1.0,
      }));
      allEvents = [...autoEvents, ...manualAsEvents];
    }

    if (allEvents.length > 0) {
      engine.setEvents(allEvents, dur);
    }
  }, [started, analysisEvents, cueMarkers, journey.enableBassFlash, recordingDuration]);

  // Re-wire events once audio duration is known (more accurate than DB duration)
  useEffect(() => {
    if (!started) return;
    const audio = audioRef.current;
    if (!audio) return;

    const onDurationChange = () => {
      if (!audio.duration || !isFinite(audio.duration)) return;
      const engine = getJourneyEngine();

      const autoEvents = analysisEvents.map((e) => ({
        time: e.time,
        type: e.type as "bass_hit" | "texture_change" | "climax" | "drop" | "silence" | "new_idea",
        intensity: e.intensity,
      }));

      let allEvents = autoEvents;
      if (journey.enableBassFlash && cueMarkers.length > 0) {
        const manualAsEvents = cueMarkers.map((c) => ({
          time: c.time,
          type: "bass_hit" as const,
          intensity: 1.0,
        }));
        allEvents = [...autoEvents, ...manualAsEvents];
      }

      if (allEvents.length > 0) {
        engine.setEvents(allEvents, audio.duration);
      }
    };

    audio.addEventListener("durationchange", onDurationChange);
    return () => audio.removeEventListener("durationchange", onDurationChange);
  }, [started, analysisEvents, cueMarkers, journey.enableBassFlash]);

  // Animation loop — throttled frame updates matching main app
  const startTimeRef = useRef(Date.now());
  const JOURNEY_DURATION_MS = 5 * 60 * 1000;

  useEffect(() => {
    if (!started) return;
    startTimeRef.current = Date.now();
    const engine = getJourneyEngine();

    function tick() {
      const audio = audioRef.current;
      let progress: number;
      let ct: number;
      let dur: number;

      if (audio && audio.duration > 0 && isFinite(audio.duration)) {
        ct = audio.currentTime;
        dur = audio.duration;
        progress = ct / dur;
      } else {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        dur = JOURNEY_DURATION_MS / 1000;
        ct = elapsed;
        progress = Math.min(1, elapsed / dur);
      }

      // When song has ended, show 0:00 / duration and full progress, freeze frames
      if (endedRef.current) {
        const endText = `${formatTime(0)} / ${formatTime(dur)}`;
        if (timeDisplayRef.current) timeDisplayRef.current.textContent = endText;
        if (timeDisplayMobileRef.current) timeDisplayMobileRef.current.textContent = endText;
        if (progressBarRef.current) {
          progressBarRef.current.style.width = "100%";
        }
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      // Update time display + progress bar via DOM (no React re-render)
      const timeText = `${formatTime(ct)} / ${formatTime(dur)}`;
      if (timeDisplayRef.current) timeDisplayRef.current.textContent = timeText;
      if (timeDisplayMobileRef.current) timeDisplayMobileRef.current.textContent = timeText;
      if (progressBarRef.current) {
        progressBarRef.current.style.width = `${progress * 100}%`;
      }

      // Throttled frame updates — only push to React at ~30fps
      const now = performance.now();
      const newFrame = engine.getFrame(progress);
      if (newFrame) {
        const prev = frameRef.current;
        const visuallyChanged = !prev
          || prev.shaderMode !== newFrame.shaderMode
          || prev.phase !== newFrame.phase
          || prev.aiPrompt !== newFrame.aiPrompt
          || prev.dualShaderMode !== newFrame.dualShaderMode
          || prev.tertiaryShaderMode !== newFrame.tertiaryShaderMode;

        frameRef.current = newFrame;

        if (visuallyChanged || now - lastFrameTimeRef.current >= FRAME_THROTTLE_MS) {
          lastFrameTimeRef.current = now;
          setJourneyFrame(newFrame);
        }
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [started]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !muted;
      setMuted(!muted);
    }
  };

  const handleShare = () => {
    setShareSheet(true);
  };

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

    const isFS = !!(document.fullscreenElement || doc.webkitFullscreenElement);

    if (isFS) {
      (doc.webkitExitFullscreen ?? document.exitFullscreen).call(document).catch(() => setIsFullscreen(false));
    } else {
      (el.webkitRequestFullscreen ?? el.requestFullscreen).call(el).catch(() => {
        // True fallback for browsers that don't support fullscreen at all
        setIsFullscreen((v) => !v);
      });
    }
  }, []);

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

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  }, []);

  const audioFeatures = { amplitude: 0, bass: 0 };

  if (analyserRef.current && dataArrayRef.current) {
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const arr = dataArrayRef.current;
    let sum = 0;
    let bassSum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i < arr.length / 4) bassSum += arr[i];
    }
    audioFeatures.amplitude = sum / (arr.length * 255);
    audioFeatures.bass = bassSum / ((arr.length / 4) * 255);
  }

  // ─── Shader layer content renderer (matching VisualizerCore) ───
  // No wrapper divs — A/B buffer layers handle their own outer/inner wrappers.
  const renderLayerContent = (layerMode: VisualizerMode, onShaderReady?: () => void) => {
    if (!analyser || !dataArray) return null;
    const layerIs3D = MODES_3D.has(layerMode);
    const layerIsAI = MODES_AI.has(layerMode);

    if (layerIsAI) {
      const backdropMode = getAiBackdropShader(layerMode);
      const backdropFrag = SHADERS[backdropMode];
      return backdropFrag ? (
        <ShaderVisualizer analyser={analyser} dataArray={dataArray} fragShader={backdropFrag} smoothMotion onReady={onShaderReady} />
      ) : <div style={{ position: "absolute", inset: 0, backgroundColor: "#000" }} />;
    }
    if (layerIs3D) {
      return <Visualizer3D analyser={analyser} dataArray={dataArray} mode={layerMode as Visualizer3DMode} />;
    }
    return SHADERS[layerMode] ? (
      <ShaderVisualizer analyser={analyser} dataArray={dataArray} fragShader={SHADERS[layerMode]!} smoothMotion onReady={onShaderReady} />
    ) : null;
  };

  const creditsBlock = (
    <div
      style={{
        fontSize: "0.9rem",
        fontFamily: "var(--font-geist-mono)",
        color: "rgba(255, 255, 255, 0.85)",
        letterSpacing: "0.04em",
        lineHeight: 1.7,
        textAlign: "center",
      }}
    >
      <div>by {creatorName || "Karel Barnoski"}</div>
      {musicArtist && <div>Music by {musicArtist}</div>}
      {journey.photographyCredit && <div>Photography by {journey.photographyCredit}</div>}
      {journey.dedication && (
        <div
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: "italic",
            fontSize: "1rem",
            color: "rgba(255, 255, 255, 0.75)",
            marginTop: "0.5rem",
          }}
        >
          {journey.dedication}
        </div>
      )}
    </div>
  );

  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/journey/${shareToken}`;

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      endedRef.current = false;
      setEnded(false);
      audioRef.current.play();

      // Restart journey engine and show intro overlay
      getRealtimeImageService().resetSession();
      const engine = getJourneyEngine();
      const seed = playbackSeed ? parseInt(playbackSeed, 10) : undefined;
      const dur = audioRef.current.duration > 0 ? audioRef.current.duration : recordingDuration;
      engine.start(journey, {
        ...(seed != null && !isNaN(seed) ? { seed } : {}),
        trackDuration: dur > 0 ? dur : undefined,
      });

      // Re-wire events for bass flash
      if (dur > 0) {
        const autoEvents = analysisEvents.map((e) => ({
          time: e.time,
          type: e.type as "bass_hit" | "texture_change" | "climax" | "drop" | "silence" | "new_idea",
          intensity: e.intensity,
        }));
        let allEvents = autoEvents;
        if (journey.enableBassFlash && cueMarkers.length > 0) {
          const manualAsEvents = cueMarkers.map((c) => ({
            time: c.time, type: "bass_hit" as const, intensity: 1.0,
          }));
          allEvents = [...autoEvents, ...manualAsEvents];
        }
        if (allEvents.length > 0) engine.setEvents(allEvents, dur);
      }

      // Clear old timers to prevent stale state
      if (introTimerRef.current) clearTimeout(introTimerRef.current);
      if (phaseReadyTimerRef.current) clearTimeout(phaseReadyTimerRef.current);
      setReplayCount((c) => c + 1); // force fresh DOM elements for overlays
      setJourneyIntroVisible(true);
      setPhaseIndicatorReady(false);
      introTimerRef.current = setTimeout(() => setJourneyIntroVisible(false), 6000);
      phaseReadyTimerRef.current = setTimeout(() => setPhaseIndicatorReady(true), 8000);
    }
  };

  // ─── Start screen ───
  if (!started) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Start journey"
        className="h-dvh w-screen overflow-hidden bg-black relative flex items-center justify-center"
        style={{ cursor: "pointer" }}
        onClick={() => setStarted(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setStarted(true);
          }
        }}
      >
        <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "32px",
            animation: "fadeIn 1s ease-out both",
            textAlign: "center",
            padding: "0 24px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.6rem",
                fontFamily: "var(--font-geist-mono)",
                color: pathContext ? pathContext.accent : "rgba(255, 255, 255, 0.3)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                marginBottom: "14px",
              }}
            >
              {pathContext && pathContext.currentIndex >= 0
                ? `${pathContext.pathName} · ${pathContext.currentIndex + 1} of ${pathContext.steps.length}`
                : "Shared Journey"}
            </div>
            <div
              style={{
                fontSize: "clamp(2.6rem, 7vw, 4rem)",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                letterSpacing: "0.04em",
                color: "#fff",
                lineHeight: 1.2,
              }}
            >
              {journey.name}
            </div>
            {journey.subtitle && (
              <div
                style={{
                  fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontWeight: 300,
                  fontStyle: "italic",
                  color: "rgba(255, 255, 255, 0.45)",
                  marginTop: "8px",
                }}
              >
                {journey.subtitle}
              </div>
            )}
            <div
              style={{
                fontSize: "0.9rem",
                fontFamily: "var(--font-geist-mono)",
                color: "rgba(255, 255, 255, 0.85)",
                letterSpacing: "0.04em",
                marginTop: "12px",
              }}
            >
              by {creatorName || "Karel Barnoski"}
            </div>
            {musicArtist && (
              <div
                style={{
                  fontSize: "0.9rem",
                  fontFamily: "var(--font-geist-mono)",
                  color: "rgba(255, 255, 255, 0.85)",
                  letterSpacing: "0.04em",
                  marginTop: "4px",
                }}
              >
                Music by {musicArtist}
              </div>
            )}
            {journey.photographyCredit && (
              <div
                style={{
                  fontSize: "0.9rem",
                  fontFamily: "var(--font-geist-mono)",
                  color: "rgba(255, 255, 255, 0.85)",
                  letterSpacing: "0.04em",
                  marginTop: "4px",
                }}
              >
                Photography by {journey.photographyCredit}
              </div>
            )}
            {journey.dedication && (
              <div
                style={{
                  fontSize: "1rem",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: "italic",
                  color: "rgba(255, 255, 255, 0.75)",
                  letterSpacing: "0.04em",
                  marginTop: "10px",
                }}
              >
                {journey.dedication}
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Start journey"
            onClick={(e) => { e.stopPropagation(); setStarted(true); }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "64px",
              height: "64px",
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
            <Play style={{ width: 24, height: 24, marginLeft: 3 }} fill="currentColor" />
          </button>

          <div
            style={{
              fontSize: "0.65rem",
              fontFamily: "var(--font-geist-mono)",
              color: "rgba(255, 255, 255, 0.2)",
            }}
          >
            Tap anywhere to begin
          </div>

          {/* Back to path — sits directly under the pre-start controls
              when launched from a shared path so the listener can bail
              without hunting for a top-corner button. */}
          {pathContext && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a
              href={`/path/${pathContext.pathToken}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white/45 hover:text-white/90 transition-colors"
              style={{
                fontSize: "0.68rem",
                fontFamily: "var(--font-geist-mono)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                border: "1px solid rgba(255,255,255,0.12)",
                marginTop: "8px",
              }}
            >
              ← {pathContext.pathName}
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen overflow-hidden bg-black relative">
      {analyser && dataArray && (
        <JourneyCompositor
          frame={journeyFrame}
          audioAmplitude={audioFeatures.amplitude}
          audioBass={audioFeatures.bass}
          aiEnabled={journey.aiEnabled}
          aiGenerating={!ended}
          enableBassFlash={journey.enableBassFlash}
          promptSeed={playbackSeed ? parseInt(playbackSeed, 10) : undefined}
          journeyId={journey.id}
          localImageUrls={journey.localImageUrls}
        >
          {/* ── Primary shader: A/B buffer ──
              Two persistent layers swap roles. Only opacity changes — no remounting,
              no WebGL context destruction. Callback refs set initial opacity once. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: MODES_AI.has(layerAMode) ? 0.6 : 1 }}>
            <div ref={setLayerARef} style={{ position: "absolute", inset: 0 }}>
              {renderLayerContent(layerAMode, handleLayerAReady)}
            </div>
          </div>
          {layerBMode && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: MODES_AI.has(layerBMode) ? 0.6 : 1 }}>
              <div ref={setLayerBRef} style={{ position: "absolute", inset: 0 }}>
                {renderLayerContent(layerBMode, handleLayerBReady)}
              </div>
            </div>
          )}

          {/* ── Dual shader: A/B buffer ── */}
          {dualLayerAMode && SHADERS[dualLayerAMode as VisualizerMode] && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
              <div ref={setDualLayerARef} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
                <ShaderVisualizer
                  analyser={analyser}
                  dataArray={dataArray}
                  fragShader={SHADERS[dualLayerAMode as VisualizerMode]!}
                  smoothMotion
                  onReady={handleDualLayerAReady}
                />
              </div>
            </div>
          )}
          {dualLayerBMode && SHADERS[dualLayerBMode as VisualizerMode] && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
              <div ref={setDualLayerBRef} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
                <ShaderVisualizer
                  analyser={analyser}
                  dataArray={dataArray}
                  fragShader={SHADERS[dualLayerBMode as VisualizerMode]!}
                  smoothMotion
                  onReady={handleDualLayerBReady}
                />
              </div>
            </div>
          )}

          {/* Tertiary shader — single layer with onReady-gated fade */}
          {tertiaryShaderVisible && SHADERS[tertiaryShaderVisible as VisualizerMode] && (
            <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
              <div ref={tertiaryShaderRef} style={{ position: "absolute", inset: 0, opacity: 0, mixBlendMode: "screen" }}>
                <ShaderVisualizer
                  analyser={analyser}
                  dataArray={dataArray}
                  fragShader={SHADERS[tertiaryShaderVisible as VisualizerMode]!}
                  smoothMotion
                  onReady={handleTertiaryShaderReady}
                />
              </div>
            </div>
          )}
        </JourneyCompositor>
      )}

      {/* "Journey Started" intro overlay — matching main app */}
      {journeyIntroVisible && (
        <div
          key={`intro-${replayCount}`}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 50,
            pointerEvents: "none",
            animation: "journeyIntroAnim 6s ease-in-out forwards",
          }}
        >
          <div className="flex flex-col items-center gap-5" style={{ position: "relative", padding: "4rem 6rem", maxWidth: "90vw" }}>
            <div
              style={{
                position: "absolute",
                inset: "-40%",
                background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, transparent 65%)",
                filter: "blur(40px)",
                pointerEvents: "none",
              }}
            />
            <span
              style={{
                position: "relative",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#fff",
                textShadow: "0 2px 12px rgba(0,0,0,0.9)",
              }}
            >
              Journey Started
            </span>
            <span
              style={{
                position: "relative",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)",
                letterSpacing: "0.04em",
                color: "#fff",
                textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                marginTop: "-0.5rem",
              }}
            >
              {journey.name}
            </span>
            <span
              style={{
                position: "relative",
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.9rem",
                color: "rgba(255, 255, 255, 0.85)",
                letterSpacing: "0.04em",
                textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                marginTop: "0.25rem",
              }}
            >
              by {creatorName || "Karel Barnoski"}
            </span>
            {musicArtist && (
              <span
                style={{
                  position: "relative",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.9rem",
                  color: "rgba(255, 255, 255, 0.85)",
                  letterSpacing: "0.04em",
                  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                }}
              >
                Music by {musicArtist}
              </span>
            )}
            {journey.photographyCredit && (
              <span
                style={{
                  position: "relative",
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.9rem",
                  color: "rgba(255, 255, 255, 0.85)",
                  letterSpacing: "0.04em",
                  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                }}
              >
                Photography by {journey.photographyCredit}
              </span>
            )}
            {journey.dedication && (
              <span
                style={{
                  position: "relative",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "1.05rem",
                  color: "rgba(255, 255, 255, 0.75)",
                  letterSpacing: "0.04em",
                  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                  marginTop: "0.5rem",
                }}
              >
                {journey.dedication}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Phase indicator — same component as main app, gated by intro timing */}
      {phaseIndicatorReady && (
        <JourneyPhaseIndicator
          journey={journey}
          currentPhase={journeyFrame?.phase as JourneyPhaseId ?? null}
        />
      )}

      {/* Bottom bar — solid black, matching main app journey mode */}
      <div
        className="absolute inset-x-0 bottom-0 transition-opacity duration-500 ease-out"
        style={{
          zIndex: 10,
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        {/* Subtle top separator */}
        <div
          className="h-px w-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent)" }}
        />

        {/* Desktop bar */}
        <div
          className="room-bar-desktop items-center px-4"
          style={{ background: "#000", height: "56px" }}
        >
          {/* LEFT: Listen on Resonance */}
          <div className="flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="text-white/25 hover:text-white/50 transition-colors"
              style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)" }}
            >
              Listen on Resonance
            </a>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* CENTER: Play/pause + journey name + mute + time */}
          <div className="flex items-center gap-2">
            {audioUrl && (
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={togglePlay}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] p-2 text-white/80 hover:text-white transition-colors duration-75"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" fill="currentColor" />
                ) : (
                  <Play className="h-4 w-4" fill="currentColor" />
                )}
              </button>
            )}
            <span
              className="text-white/50 truncate"
              style={{
                fontSize: "0.8rem",
                fontFamily: "var(--font-geist-sans)",
                maxWidth: "200px",
              }}
            >
              {journey.name}
            </span>
            {audioUrl && (
              <button
                type="button"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] p-1.5 text-white/35 hover:text-white/70 transition-colors duration-75"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            )}
            <span
              ref={timeDisplayRef}
              className="text-white/25"
              style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
            >
              0:00 / 0:00
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* RIGHT: Share + Fullscreen */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
              style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}
              title="Share Journey"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            <button
              type="button"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              onClick={toggleFullscreen}
              className="flex items-center justify-center p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            {pathContext && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a
                href={`/path/${pathContext.pathToken}`}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
                style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}
                title={`Close — back to ${pathContext.pathName}`}
              >
                <X className="h-3.5 w-3.5" />
                Close
              </a>
            )}
          </div>
        </div>

        {/* Mobile bar */}
        <div
          className="room-bar-mobile flex-col"
          style={{ background: "#000", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Row 1: Listen on Resonance + actions */}
          <div className="flex items-center justify-between px-3" style={{ height: "32px" }}>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="text-white/20 hover:text-white/40 transition-colors"
              style={{ fontSize: "0.62rem", fontFamily: "var(--font-geist-mono)" }}
            >
              Listen on Resonance
            </a>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                aria-label="Share journey"
                onClick={handleShare}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/35 hover:text-white/65 transition-colors duration-75"
                title="Share"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                onClick={toggleFullscreen}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/35 hover:text-white/65 transition-colors duration-75"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              {pathContext && (
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a
                  href={`/path/${pathContext.pathToken}`}
                  className="min-h-[44px] flex items-center gap-1 px-2 rounded-lg text-white/35 hover:text-white/65 transition-colors duration-75"
                  style={{ fontSize: "0.62rem", fontFamily: "var(--font-geist-mono)" }}
                  title={`Close — back to ${pathContext.pathName}`}
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </a>
              )}
            </div>
          </div>

          {/* Row 2: Transport — play + name + mute + time */}
          <div className="flex items-center justify-center gap-2 px-3" style={{ height: "44px" }}>
            {audioUrl && (
              <button
                type="button"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={togglePlay}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white transition-colors duration-75"
              >
                {isPlaying ? (
                  <Pause className="h-4.5 w-4.5" fill="currentColor" />
                ) : (
                  <Play className="h-4.5 w-4.5" fill="currentColor" />
                )}
              </button>
            )}
            <span
              className="text-white/50 truncate"
              style={{
                fontSize: "0.75rem",
                fontFamily: "var(--font-geist-sans)",
                maxWidth: "140px",
              }}
            >
              {journey.name}
            </span>
            {audioUrl && (
              <button
                type="button"
                aria-label={muted ? "Unmute" : "Mute"}
                onClick={toggleMute}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/35 hover:text-white/65 transition-colors duration-75"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            )}
            <span
              ref={timeDisplayMobileRef}
              className="text-white/25 flex-shrink-0"
              style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
            >
              0:00 / 0:00
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar — thin overlay at the very bottom of the bar */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Seek to position"
        className="absolute bottom-0 inset-x-0 cursor-pointer"
        style={{ zIndex: 11, height: "24px", display: "flex", alignItems: "flex-end" }}
        onClick={handleProgressClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
          }
        }}
      >
        <div className="w-full h-[2px] overflow-hidden">
          <div
            ref={progressBarRef}
            className="h-full"
            style={{
              width: "0%",
              background: "linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.5) 100%)",
            }}
          />
        </div>
      </div>

      {/* Share sheet */}
      <ShareSheet
        open={shareSheet}
        onClose={() => setShareSheet(false)}
        url={shareUrl}
        title={`${journey.name} — Resonance`}
        text={`Check out ${journey.name} on Resonance`}
      />

      {/* Journey complete overlay — same treatment as main app */}
      {ended && (
        <div
          key={`complete-${replayCount}`}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            zIndex: 50,
            pointerEvents: "none",
            animation: "journeyEndFadeIn 3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        >
          <div
            className="flex flex-col items-center gap-5"
            style={{
              position: "relative",
              padding: "3rem 4rem",
              pointerEvents: "auto",
              maxWidth: "90vw",
              borderRadius: "20px",
              background: "rgba(0, 0, 0, 0.55)",
              backdropFilter: "blur(32px) saturate(1.1)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >

            {/* Title */}
            <span
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#fff",
              }}
            >
              Journey Complete
            </span>

            {/* Journey name */}
            <span
              style={{
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)",
                letterSpacing: "0.04em",
                color: "#fff",
                marginTop: "-0.5rem",
                textAlign: "center",
              }}
            >
              {journey.name}
            </span>

            {/* Credits */}
            {creditsBlock}

            {/* Path progress — only rendered when viewing as part of a
                shared path so the listener sees where they are in the album. */}
            {pathContext && pathContext.currentIndex >= 0 && (
              <div className="flex flex-col items-center gap-2" style={{ marginTop: "0.25rem" }}>
                <div style={{ width: "3rem", height: "1px", background: "rgba(255,255,255,0.12)" }} />
                <span
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontWeight: 300,
                    fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)",
                    letterSpacing: "0.03em",
                    color: pathContext.accent,
                  }}
                >
                  {pathContext.pathName}
                </span>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {pathContext.steps.map((s, i) => {
                    const done = i <= pathContext.currentIndex;
                    const linkable = !!s.shareToken;
                    const href = linkable ? `/journey/${s.shareToken}?pathToken=${pathContext.pathToken}` : undefined;
                    const label = `${String(i + 1).padStart(2, "0")} · ${s.name}`;
                    const dot = (
                      <span
                        className="block transition-all"
                        style={{
                          width: "14px",
                          height: "14px",
                          borderRadius: "50%",
                          backgroundColor: done ? pathContext.accent : "rgba(255,255,255,0.2)",
                          boxShadow: done ? `0 0 8px ${pathContext.glow}55` : "none",
                        }}
                      />
                    );
                    const tooltip = (
                      <span
                        className="pointer-events-none absolute opacity-0 group-hover:opacity-100 transition-opacity duration-75"
                        style={{
                          bottom: "calc(100% + 10px)",
                          left: "50%",
                          transform: "translateX(-50%)",
                          background: "rgba(0,0,0,0.92)",
                          color: "#fff",
                          padding: "6px 12px",
                          borderRadius: "8px",
                          whiteSpace: "nowrap",
                          fontSize: "0.78rem",
                          fontFamily: "var(--font-geist-mono)",
                          letterSpacing: "0.03em",
                          border: "1px solid rgba(255,255,255,0.12)",
                          zIndex: 60,
                        }}
                      >
                        {label}
                      </span>
                    );
                    return href ? (
                      // eslint-disable-next-line @next/next/no-html-link-for-pages
                      <a
                        key={s.journeyId}
                        href={href}
                        aria-label={s.name}
                        className="group relative inline-flex items-center justify-center"
                        style={{ width: "16px", height: "16px" }}
                      >
                        {dot}
                        {tooltip}
                      </a>
                    ) : (
                      <div
                        key={s.journeyId}
                        className="group relative inline-flex items-center justify-center"
                        style={{ width: "16px", height: "16px" }}
                      >
                        {dot}
                        {tooltip}
                      </div>
                    );
                  })}
                  <span
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      fontSize: "0.65rem",
                      color: "rgba(255,255,255,0.35)",
                      marginLeft: "0.5rem",
                    }}
                  >
                    {pathContext.currentIndex + 1} of {pathContext.steps.length}
                  </span>
                </div>
              </div>
            )}

            {/* Divider */}
            <div style={{ width: "3rem", height: "1px", background: "rgba(255,255,255,0.12)" }} />

            {/* CTA — hidden when in a path since the buttons below do the
                same job (continue album / return to cover). */}
            {!pathContext && (
              <span
                style={{
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
                  color: "rgba(255,255,255,0.55)",
                  textAlign: "center",
                }}
              >
                Create your own journeys with your music.
              </span>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 flex-wrap justify-center" style={{ marginTop: "0.25rem" }}>
              {/* Continue Path — next step in the sequence. Reloads the
                  page to the next journey's share token while preserving
                  pathToken so the breadcrumb keeps working. */}
              {pathContext && pathContext.currentIndex >= 0 && pathContext.currentIndex < pathContext.steps.length - 1 && (() => {
                const next = pathContext.steps[pathContext.currentIndex + 1];
                if (!next.shareToken) return null;
                return (
                  <a
                    href={`/journey/${next.shareToken}?pathToken=${pathContext.pathToken}`}
                    className="px-5 py-2.5 rounded-lg text-white/90 hover:text-white transition-colors duration-150"
                    style={{
                      border: `1px solid ${pathContext.accent}`,
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.02em",
                      textDecoration: "none",
                      background: `${pathContext.accent}15`,
                    }}
                  >
                    Continue Path →
                  </a>
                );
              })()}

              {/* Enter The Culmination — shown on the LAST step if all
                  tracks have been completed on this device. Reads from
                  path-progress-store (localStorage) so anonymous walkers
                  can unlock it too. */}
              {pathContext && pathContext.culmination?.shareToken && pathContext.currentIndex === pathContext.steps.length - 1 && (() => {
                const completedIds = usePathProgressStore.getState().completedJourneyIds;
                // Include the current journey — the completeJourney() call
                // happens inside the ended handler which fires right before
                // this overlay renders, so it's usually already recorded,
                // but include it defensively in case of a race.
                const allDone = pathContext.steps.every((s) => completedIds.includes(s.journeyId) || s.journeyId === journey.id);
                if (!allDone) return null;
                return (
                  <a
                    href={`/journey/${pathContext.culmination.shareToken}?pathToken=${pathContext.pathToken}`}
                    className="px-5 py-2.5 rounded-lg text-white hover:text-white transition-all duration-150"
                    style={{
                      border: `1px solid ${pathContext.accent}`,
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.02em",
                      textDecoration: "none",
                      background: `${pathContext.accent}30`,
                      boxShadow: `0 0 24px ${pathContext.glow}30`,
                    }}
                  >
                    Enter {pathContext.culmination.name} ✦
                  </a>
                );
              })()}

              {/* Return to Welcome Home landing — styled to match the
                  pre-start back pill so both screens feel consistent. */}
              {pathContext && (
                <a
                  href={`/path/${pathContext.pathToken}`}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors duration-150"
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    fontSize: "0.72rem",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    textDecoration: "none",
                  }}
                >
                  ← {pathContext.pathName}
                </a>
              )}

              {!isAuthenticated ? (
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a
                  href="/signup"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 28px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.9)",
                    color: "#000",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.02em",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Sign Up Free
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-html-link-for-pages
                <a
                  href="/"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "10px 28px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.9)",
                    color: "#000",
                    fontSize: "0.8rem",
                    fontWeight: 500,
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.02em",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  Create a Journey
                </a>
              )}
              <button
                onClick={handleReplay}
                className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: "0.8rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.02em",
                }}
              >
                Replay
              </button>
              <button
                onClick={handleShare}
                className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: "0.8rem",
                  fontFamily: "var(--font-geist-mono)",
                  letterSpacing: "0.02em",
                }}
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
