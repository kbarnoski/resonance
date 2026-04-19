"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { VisualizerCore, type VisualizerMode } from "./visualizer";
import { AnalysisHUD } from "./analysis-hud";
import { VisualizerLibrary } from "./visualizer-library";
import { TonnetzOverlay } from "./tonnetz-overlay";
import { JourneySelector } from "./journey-selector";
import { JourneyCompositor } from "./journey-compositor";
import { JourneyPhaseIndicator } from "./journey-phase-indicator";
import { JourneyFeedback, resetPerfMonitor, flushFeedbackEntries, buildSnapshot, appendEntry, getSharedFpsRef, updateShaderUsageFromJourney } from "./journey-feedback";
import { getTierProfile, getDeviceTier } from "@/lib/audio/device-tier";
import { AdminPanel } from "./admin-panel";
import { useAudioStore } from "@/lib/audio/audio-store";
import { useShallow } from "zustand/react/shallow";
import { MODES_AI, AI_MODE_PROMPTS } from "@/lib/shaders";
import { getAudioEngine, getAnalyserNode, getNativeAnalyser, ensureResumed, type AnalyserLike } from "@/lib/audio/audio-engine";
import { useInstallationMode } from "@/lib/audio/use-installation-mode";
import { useJourney } from "@/lib/journeys/use-journey";
import { useStoryGeneration } from "@/lib/journeys/use-story";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import type { MusicalEvent } from "@/lib/audio/types";
import { getJourney } from "@/lib/journeys/journeys";
import { getCulminationJourney } from "@/lib/journeys/culmination-journeys";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { prepareGhostFlashImages, clearGhostFlashImages } from "@/lib/journeys/ghost-flash-images";
import { usePathProgressStore } from "@/lib/journeys/path-progress-store";
import { getPathForJourney, getNextInPath, isPathCulminationUnlocked, isGrandCulminationUnlocked, JOURNEY_PATHS, GRAND_CULMINATION_ID } from "@/lib/journeys/paths";
import { createClient } from "@/lib/supabase/client";
import { ShareSheet } from "@/components/ui/share-sheet";
import { Mic } from "lucide-react";
import { isDesktopApp, enterKioskMode, exitKioskMode, nativeAudioSeek } from "@/lib/tauri";
import { analyzeAndAdapt, refreshAdaptiveProfile } from "@/lib/journeys/adaptive-engine";

// ─── Speech Recognition types ───

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

type SpeechRecognitionType = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

// ─── Shared style constants ───
// Extracted from inline styles that appeared 17+ times. Module-level so
// they're allocated once and never trigger re-renders.
const MONO_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
  fontSize: "0.9rem",
  color: "rgba(255, 255, 255, 0.85)",
  letterSpacing: "0.04em",
  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
};
const MONO_LABEL_DIM: React.CSSProperties = {
  ...MONO_LABEL,
  color: "rgba(255, 255, 255, 0.4)",
  fontSize: "0.6rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const SERIF_TITLE: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontWeight: 300,
  letterSpacing: "0.04em",
  color: "#fff",
  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
};
const OVERLAY_BG: React.CSSProperties = {
  position: "absolute",
  inset: "-40%",
  background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, transparent 65%)",
  filter: "blur(40px)",
  pointerEvents: "none",
};

// ─── Component ───

interface VisualizerClientProps {
  recording?: { id: string; title?: string; audio_url: string; artist?: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis?: any | null;
  initialLive?: boolean;
  initialJourney?: string;
  autoplay?: boolean;
  isAdmin?: boolean;
  userId?: string;
  cueMarkers?: { time: number; label: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialCustomJourney?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialPath?: any;
}

// Pointer-fine + hover-hover environments are desktops. The CSS media
// query is a tighter signal than userAgent sniffing — a Windows tablet in
// touch mode reads as coarse even if the UA says "Windows".
function isDesktopEnvironment(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    window.matchMedia("(hover: hover)").matches
  );
}

function GestureStartScreen({
  journeyName,
  journeySubtitle,
  creatorName,
  musicArtist,
  photographyCredit,
  dedication,
  pathName,
  pathAccent,
  pathStepIdx,
  pathStepTotal,
  onBegin,
}: {
  journeyName: string;
  journeySubtitle: string | null;
  creatorName: string | null;
  musicArtist: string | null;
  photographyCredit: string | null;
  dedication: string | null;
  pathName?: string;
  pathAccent: string;
  pathStepIdx: number;
  pathStepTotal: number;
  onBegin: () => void;
}) {
  const eyebrow =
    pathName && pathStepIdx >= 0 && pathStepTotal > 0
      ? `${pathName} · ${pathStepIdx + 1} of ${pathStepTotal}`
      : "Journey";
  const eyebrowColor = pathName ? pathAccent : "rgba(255, 255, 255, 0.3)";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Tap to begin journey"
      className="h-dvh w-screen overflow-hidden bg-black relative flex items-center justify-center"
      style={{ cursor: "pointer" }}
      onClick={onBegin}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onBegin();
        }
      }}
    >
      <style>{`@keyframes gestureFadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          animation: "gestureFadeIn 1s ease-out both",
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.6rem",
              fontFamily: "var(--font-geist-mono)",
              color: eyebrowColor,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            {eyebrow}
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
            {journeyName}
          </div>
          {journeySubtitle && (
            <div
              style={{
                fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontWeight: 300,
                fontStyle: "italic",
                color: "rgba(255, 255, 255, 0.45)",
                marginTop: 8,
              }}
            >
              {journeySubtitle}
            </div>
          )}
          {creatorName && (
            <div
              style={{
                fontSize: "0.9rem",
                fontFamily: "var(--font-geist-mono)",
                color: "rgba(255, 255, 255, 0.85)",
                letterSpacing: "0.04em",
                marginTop: 12,
              }}
            >
              by {creatorName}
            </div>
          )}
          {musicArtist && (
            <div
              style={{
                fontSize: "0.9rem",
                fontFamily: "var(--font-geist-mono)",
                color: "rgba(255, 255, 255, 0.85)",
                letterSpacing: "0.04em",
                marginTop: 4,
              }}
            >
              Music by {musicArtist}
            </div>
          )}
          {photographyCredit && (
            <div
              style={{
                fontSize: "0.9rem",
                fontFamily: "var(--font-geist-mono)",
                color: "rgba(255, 255, 255, 0.85)",
                letterSpacing: "0.04em",
                marginTop: 4,
              }}
            >
              Photography by {photographyCredit}
            </div>
          )}
          {dedication && (
            <div
              style={{
                fontSize: "1rem",
                fontFamily: "'Cormorant Garamond', Georgia, serif",
                fontStyle: "italic",
                color: "rgba(255, 255, 255, 0.75)",
                letterSpacing: "0.04em",
                marginTop: 10,
              }}
            >
              {dedication}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Start journey"
          onClick={(e) => {
            e.stopPropagation();
            onBegin();
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
            fontSize: "0.65rem",
            fontFamily: "var(--font-geist-mono)",
            color: "rgba(255, 255, 255, 0.2)",
          }}
        >
          Tap anywhere to begin
        </div>
      </div>
    </div>
  );
}

export function VisualizerClient({
  recording,
  analysis: initialAnalysis,
  initialLive = false,
  initialJourney,
  autoplay = true,
  isAdmin: isAdminProp = false,
  userId,
  cueMarkers: cueMarkersProp = [],
  initialCustomJourney,
  initialPath,
}: VisualizerClientProps) {
  const router = useRouter();

  // Client-side admin fallback — survives HMR/session disruption.
  // Uses the server-provided ADMIN_EMAIL (not NEXT_PUBLIC_) to avoid
  // leaking the admin identity to the client bundle.
  const [clientAdmin, setClientAdmin] = useState(false);
  useEffect(() => {
    if (isAdminProp) return;
    // No client-side email check — rely on server-provided isAdmin prop.
    // This is intentionally a no-op; the state exists for the isAdmin
    // derivation below but the actual check runs server-side only.
  }, [isAdminProp]);
  const isAdmin = isAdminProp || clientAdmin;

  // Global audio store
  // Batch data selectors with useShallow so the component only re-renders
  // when one of these specific fields changes — not on every store mutation.
  const { currentTrack, isPlaying, currentTime, duration, storeAnalysis } = useAudioStore(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      isPlaying: s.isPlaying,
      currentTime: s.currentTime,
      duration: s.duration,
      storeAnalysis: s.analysis,
    }))
  );
  // Actions are stable references — safe as individual selectors
  const play = useAudioStore((s) => s.play);
  const togglePlayPause = useAudioStore((s) => s.togglePlayPause);
  const setAnalysis = useAudioStore((s) => s.setAnalysis);
  const seek = useAudioStore((s) => s.seek);

  const { installationMode, activeJourney, activeRealm, activeTheme, aiImageEnabled, storeCueMarkers } = useAudioStore(
    useShallow((s) => ({
      installationMode: s.installationMode,
      activeJourney: s.activeJourney,
      activeRealm: s.activeRealm,
      activeTheme: s.activeTheme,
      aiImageEnabled: s.aiImageEnabled,
      storeCueMarkers: s.cueMarkers,
    }))
  );
  const startJourney = useAudioStore((s) => s.startJourney);

  // Local analyser state (for VisualizerCore)
  const [analyser, setAnalyser] = useState<AnalyserLike | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array<ArrayBuffer> | null>(null);
  const [shareSheet, setShareSheet] = useState<{ url: string; title: string; text?: string } | null>(null);

  // Fullscreen / immersive mode
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isIOS = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
  }, []);

  // Journey system
  const { frame: rawJourneyFrame, active: journeyActive, phase: journeyPhase, progress: journeyProgress } = useJourney();
  const audioFeaturesRef = useRef({ bass: 0, mid: 0, treble: 0, amplitude: 0 });

  // Journey completion state
  const [journeyCompleted, setJourneyCompleted] = useState(false);
  // When the page loads with a customJourneyId (e.g. refresh during a path
  // journey), we need a user gesture before audio can play on mobile. This
  // flag gates the start so visuals + audio launch together after a tap.
  const [needsGesture, setNeedsGesture] = useState(false);
  const completedJourneyRef = useRef<string | null>(null);

  // Journey intro screen — shows name + subtitle on journey start
  const [journeyIntroVisible, setJourneyIntroVisible] = useState(false);
  // Force-remount counter for overlay DOM nodes — bumped on replay so CSS animations restart
  const [overlayRemountKey, setOverlayRemountKey] = useState(0);
  // Suppress completion detection for a window after replay — prevents the stale
  // currentTime-near-end value from immediately re-firing the end overlay.
  const replayGuardUntilRef = useRef<number>(0);
  const journeyIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Buffer after intro fades out before phase indicator can appear
  const [phaseIndicatorReady, setPhaseIndicatorReady] = useState(true);
  const phaseReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Story mode generation
  useStoryGeneration();

  // Phase guidance is now handled internally by JourneyPhaseIndicator

  // Reset perf monitor + image service + show intro when a new journey starts
  const prevJourneyIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeJourney && activeJourney.id !== prevJourneyIdRef.current) {
      // Show intro BEFORE updating the ref
      if (journeyIntroTimerRef.current) clearTimeout(journeyIntroTimerRef.current);
      if (phaseReadyTimerRef.current) clearTimeout(phaseReadyTimerRef.current);
      setJourneyIntroVisible(true);
      setPhaseIndicatorReady(false);
      // Intro holds 6s, then 2s buffer before phase indicator
      journeyIntroTimerRef.current = setTimeout(() => {
        setJourneyIntroVisible(false);
      }, 6000);
      phaseReadyTimerRef.current = setTimeout(() => {
        setPhaseIndicatorReady(true);
      }, 8000);

      prevJourneyIdRef.current = activeJourney.id;
      setAdminOpen(false);
      resetPerfMonitor();
      getRealtimeImageService().resetSession();

      // Kick off flash-angel image generation for journeys that use the
      // bass flash overlay (currently only Ghost). These images show the
      // figure's face — the only moment the face is visible in the journey.
      if (activeJourney.enableBassFlash) {
        prepareGhostFlashImages(activeJourney.id);
      }

      // Log journey-start lifecycle event
      const startEntry = buildSnapshot("journey-start", getSharedFpsRef());
      startEntry.aiPromptSnippet = `journey-start: ${activeJourney.name}`;
      appendEntry(startEntry);
    }
    if (!activeJourney) {
      prevJourneyIdRef.current = null;
      setJourneyIntroVisible(false);
      setPhaseIndicatorReady(true);
      if (journeyIntroTimerRef.current) clearTimeout(journeyIntroTimerRef.current);
      if (phaseReadyTimerRef.current) clearTimeout(phaseReadyTimerRef.current);
      clearGhostFlashImages();
    }
    return () => {
      if (journeyIntroTimerRef.current) clearTimeout(journeyIntroTimerRef.current);
      if (phaseReadyTimerRef.current) clearTimeout(phaseReadyTimerRef.current);
    };
  }, [activeJourney]);

  // Detect journey completion — when audio ends and journey is active
  useEffect(() => {
    if (!journeyActive || !activeJourney) {
      if (!journeyActive) {
        setJourneyCompleted(false);
        completedJourneyRef.current = null;
      }
      return;
    }
    if (journeyCompleted) return; // Already completed
    if (completedJourneyRef.current === activeJourney.id) return; // Already detected for this journey
    // Suppress firing during the replay guard window — prevents the end
    // overlay from immediately re-appearing after a replay click.
    if (performance.now() < replayGuardUntilRef.current) return;

    // Detect completion: currentTime within completionOffset of end,
    // OR audio stopped while past 95% of the track (handles RAF sync gaps).
    // completionOffset lets journeys with silent endings trigger earlier.
    const offset = activeJourney.completionOffset ?? 0.5;
    const nearEnd = duration > 0 && currentTime > 0 && currentTime >= duration - offset;
    const stoppedLate = duration > 0 && currentTime > 0 && !isPlaying && currentTime >= duration * 0.95;

    if (nearEnd || stoppedLate) {
      console.log(
        `[Journey] COMPLETED — nearEnd=${nearEnd} stoppedLate=${stoppedLate} ` +
        `currentTime=${currentTime.toFixed(1)} duration=${duration.toFixed(1)} isPlaying=${isPlaying}`
      );
      setJourneyCompleted(true);
      completedJourneyRef.current = activeJourney.id;
      // Record completion in path progress store
      usePathProgressStore.getState().completeJourney(activeJourney.id);

      // Log journey-end lifecycle event
      const endEntry = buildSnapshot("journey-end", getSharedFpsRef());
      endEntry.aiPromptSnippet = `journey-end: ${activeJourney.name}`;
      appendEntry(endEntry);

      // Update shader usage stats from actual display history
      const engine = getJourneyEngine();
      const shaderHistory = engine.getShaderHistory();
      updateShaderUsageFromJourney(shaderHistory);

      // Flush any buffered glitch/feedback entries before analysis
      flushFeedbackEntries();
      // Analyze feedback and adapt for next journey
      analyzeAndAdapt();
      refreshAdaptiveProfile();
    }
  }, [journeyActive, activeJourney, currentTime, duration, journeyCompleted, isPlaying]);

  // Detect AI-only viz mode
  const storeVizMode = useAudioStore((s) => s.vizMode);
  const isAiOnlyMode = MODES_AI.has(storeVizMode);

  // Only the owner of a custom journey can open admin/rating panels.
  // Built-in journeys (no userId) are frozen — no tuning in production.
  const isOwnCustomJourney = !!userId && !!activeJourney?.userId && activeJourney.userId === userId;
  const canAdmin = isAdmin || isOwnCustomJourney;
  const canRate = true; // always available — rating panel is a creator tool

  // Mood-based AI prompt for non-journey usage
  const MOOD_AI_PROMPTS: Record<string, string> = useMemo(() => ({
    melancholic: "rain on dark glass, distant city lights through fog, cold blue twilight, solitary beauty, atmospheric",
    intense: "electric energy, white heat, sharp crystalline forms, neon veins of lightning, raw power, dramatic light",
    dreamy: "amber light through clouds, soft focus landscapes, warm honey glow, floating fabric, golden dust particles",
    mystical: "ancient sacred geometry, moonlit water, luminous symbols, cathedral light, transcendent vision",
    chaotic: "shattered prismatic reflections, kaleidoscope fragments, overlapping realities, vivid color collision",
    hypnotic: "infinite spiraling corridors, slow orbital motion, deep space, recurring patterns, tidal breathing",
    flowing: "river of light, silk movement, gentle arcs of color, watercolor bleeding through space, organic motion",
    transcendent: "infinite golden light, dissolving boundaries, vast luminous sky, ascending warmth, sacred radiance",
  }), []);

  // Build AI prompt based on current context
  const aiPrompt = useMemo(() => {
    // AI-only modes have specific prompts
    if (isAiOnlyMode) {
      return AI_MODE_PROMPTS[storeVizMode] ?? "abstract visionary art, luminous, sacred, transcendent";
    }
    // For regular playback, use mood-based prompt
    const mood = useAudioStore.getState().analysis?.mood ?? "flowing";
    return MOOD_AI_PROMPTS[mood] ?? MOOD_AI_PROMPTS.flowing;
  }, [isAiOnlyMode, storeVizMode, MOOD_AI_PROMPTS]);

  // Update audio features for journey engine + compositor
  useEffect(() => {
    if (!analyser || !dataArray) return;

    let animId: number;
    const SMOOTHING = 0.15;
    const features = audioFeaturesRef.current;

    function updateAudio() {
      analyser!.getByteFrequencyData(dataArray!);
      const len = dataArray!.length;
      let bassSum = 0, midSum = 0, trebleSum = 0, totalSum = 0;
      for (let i = 0; i < len; i++) {
        const v = dataArray![i];
        totalSum += v;
        if (i <= 5) bassSum += v;
        else if (i <= 30) midSum += v;
        else if (i <= 63) trebleSum += v;
      }
      const rawBass = bassSum / (6 * 255);
      const rawMid = midSum / (25 * 255);
      const rawTreble = trebleSum / (33 * 255);
      const rawAmp = totalSum / (len * 255);

      features.bass += (rawBass - features.bass) * SMOOTHING;
      features.mid += (rawMid - features.mid) * SMOOTHING;
      features.treble += (rawTreble - features.treble) * SMOOTHING;
      features.amplitude += (rawAmp - features.amplitude) * SMOOTHING;

      // Feed audio features to journey engine
      if (journeyActive) {
        getJourneyEngine().updateAudioFeatures(features);
      }

      animId = requestAnimationFrame(updateAudio);
    }

    animId = requestAnimationFrame(updateAudio);
    return () => cancelAnimationFrame(animId);
  }, [analyser, dataArray, journeyActive]);

  // UI state
  const [hudVisible, setHudVisible] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [tonnetzVisible, setTonnetzVisible] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [isolatePrimary, setIsolatePrimary] = useState(false);
  const [hideImagery, setHideImagery] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  // Default to last room mode preference, unless entering with a specific recording or journey
  const [journeyOpen, setJourneyOpen] = useState(() => {
    if (recording) return false;
    if (initialJourney) return false;
    return useAudioStore.getState().roomMode === "journey";
  });
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iosImmersiveRef = useRef(false);

  // Isolate primary shader — strips dual/tertiary when toggled with R key
  const journeyFrame = useMemo(() => {
    if (!rawJourneyFrame || !isolatePrimary) return rawJourneyFrame;
    return { ...rawJourneyFrame, dualShaderMode: undefined, tertiaryShaderMode: undefined };
  }, [rawJourneyFrame, isolatePrimary]);

  // Installation mode auto-cycling
  useInstallationMode();

  // Visualizer config ref (for share)
  const configRef = useRef<{ mode: VisualizerMode; textOverlayMode: "off" | "poetry" | "story"; whisperEnabled: boolean } | null>(null);

  // Section flash
  const [sectionFlash, setSectionFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSectionChange = useCallback(() => {
    setSectionFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setSectionFlash(false), 800);
  }, []);

  // Share Room handler
  const handleShareRoom = useCallback(() => {
    const config = configRef.current;
    if (!config) return;
    const payload = {
      shaderMode: config.mode,
      textOverlayMode: config.textOverlayMode,
      whisperEnabled: config.whisperEnabled,
      hudVisible,
    };
    const token = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const url = `${window.location.origin}/room/${token}`;
    const trackTitle = currentTrack?.title ?? "The Room";
    setShareSheet({ url, title: `${trackTitle} — Resonance` });
  }, [hudVisible, currentTrack]);

  // Share active journey handler
  const [sharingJourney, setSharingJourney] = useState(false);
  const handleShareJourney = useCallback(async () => {
    if (!activeJourney || sharingJourney) return;
    setSharingJourney(true);
    try {
      const isBuiltIn = !!getJourney(activeJourney.id);
      const endpoint = isBuiltIn ? "/api/journeys/share-builtin" : "/api/journeys/share";
      const body = isBuiltIn
        ? { journeyId: activeJourney.id, recordingId: currentTrack?.id ?? null }
        : { journeyId: activeJourney.id };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to share");
      const { token } = await res.json();
      const url = `${window.location.origin}/journey/${token}`;
      setShareSheet({
        url,
        title: `${activeJourney.name} — Resonance`,
        text: `Check out ${activeJourney.name} on Resonance`,
      });
    } catch (err) {
      console.error("Share journey failed:", err);
    } finally {
      setSharingJourney(false);
    }
  }, [activeJourney, sharingJourney, currentTrack]);

  // Live speech
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [liveText, setLiveText] = useState<string | null>(null);
  const [hasSpeechApi, setHasSpeechApi] = useState(false);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // Active analysis — use store's analysis, or fallback to prop
  const activeAnalysis = storeAnalysis ?? initialAnalysis;

  // Mark Room as open/closed
  const openRoom = useAudioStore((s) => s.openRoom);
  const closeRoom = useAudioStore((s) => s.closeRoom);
  useEffect(() => {
    openRoom();
    localStorage.setItem("resonance-last-experience", "chosen");
    return () => closeRoom();
  }, [openRoom, closeRoom]);

  // Auto-hide controls after inactivity (shorter in iOS immersive mode)
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    const delay = iosImmersiveRef.current ? 2500 : 5000;
    controlsTimerRef.current = setTimeout(() => {
      if (!libraryOpen && !journeyOpen) setControlsVisible(false);
    }, delay);
  }, [libraryOpen, journeyOpen]);

  // Stable listener setup — runs once on mount, reads resetControlsTimer
  // via ref so the listener doesn't re-register when deps change.
  const resetTimerRef = useRef(resetControlsTimer);
  resetTimerRef.current = resetControlsTimer;
  useEffect(() => {
    resetTimerRef.current();
    const handleMove = () => resetTimerRef.current();
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("touchstart", handleMove);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("touchstart", handleMove);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []); // Only on mount — ref keeps it stable

  // Keep controls visible when library or journey browser is open
  useEffect(() => {
    if (libraryOpen || journeyOpen) setControlsVisible(true);
  }, [libraryOpen, journeyOpen]);

  // Hide the mouse cursor in sync with the bottom controls — same idle timer.
  // Any input (mousemove / touchstart) already resets controlsVisible=true above,
  // so this effect just mirrors that state onto document.body.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.cursor;
    document.body.style.cursor = controlsVisible ? "" : "none";
    return () => {
      document.body.style.cursor = prev;
    };
  }, [controlsVisible]);

  // Initialize: connect to the global audio engine's AnalyserNode
  // In desktop mode, use the NativeAnalyserNode instead
  useEffect(() => {
    try {
      if (isDesktopApp()) {
        const native = getNativeAnalyser();
        if (native) {
          setAnalyser(native);
          setDataArray(new Uint8Array(native.frequencyBinCount));
          return;
        }
      }
      const engine = getAudioEngine();
      setAnalyser(engine.analyserNode);
      setDataArray(new Uint8Array(engine.analyserNode.frequencyBinCount));
    } catch {
      // SSR guard
    }
  }, []);

  // If opened via direct URL (/room?recording=X) and this track isn't already
  // loaded in the global store, start it. If the store already has this track
  // (pre-loaded from recording detail), don't interfere — it carries the position.
  useEffect(() => {
    if (!recording) return;
    // If we're in gesture-gate mode (path journey from URL), skip auto-play
    // here — the tap handler will call play() with the user gesture.
    if (initialCustomJourney) {
      if (initialAnalysis) setAnalysis(initialAnalysis);
      return;
    }
    const track = useAudioStore.getState().currentTrack;
    if (track?.id === recording.id) {
      // Already loaded (from recording detail handoff) — just ensure analysis is set
      if (initialAnalysis && !useAudioStore.getState().analysis) {
        setAnalysis(initialAnalysis);
      }
      return;
    }
    // Fresh load from URL
    const trackData = {
      id: recording.id,
      title: recording.title ?? "Untitled",
      audioUrl: recording.audio_url,
      artist: recording.artist ?? undefined,
    };
    if (autoplay) {
      play(trackData);
    } else {
      // Load track without starting playback
      useAudioStore.setState({ currentTrack: trackData, currentTime: 0, isPlaying: false });
    }
    if (initialAnalysis) {
      setAnalysis(initialAnalysis);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Activate journey from prop
  useEffect(() => {
    if (!initialJourney) return;
    startJourney(initialJourney);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Hydrate a custom journey + path context when the user navigates here
  // from /path/[token]. The server fetched the journey + path rows; we turn
  // them into the runtime Journey shape and start the journey with the
  // active path stored so the end overlay can render Continue Path UI.
  useEffect(() => {
    if (!initialCustomJourney) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = initialCustomJourney as Record<string, any>;
    const journey = {
      id: r.id as string,
      name: (r.name as string) ?? "Untitled",
      subtitle: (r.subtitle as string) ?? "",
      description: (r.description as string) ?? "",
      realmId: (r.realm_id as string) ?? "custom",
      aiEnabled: true,
      phases: r.phases ?? [],
      storyText: (r.story_text as string) ?? null,
      recordingId: (r.recording_id as string) ?? null,
      userId: r.user_id as string,
      audioReactive: !!(r.audio_reactive),
      creatorName: (r.creator_name as string) ?? null,
      photographyCredit: (r.photography_credit as string) ?? null,
      dedication: (r.dedication as string) ?? null,
      ...(r.theme ? { theme: r.theme } : {}),
      ...(Array.isArray(r.local_image_urls) && r.local_image_urls.length > 0
        ? { localImageUrls: r.local_image_urls as string[] }
        : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    if (initialPath) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = initialPath as Record<string, any>;
      useAudioStore.getState().setActivePath({
        id: p.id as string,
        name: (p.name as string) ?? "Untitled Path",
        subtitle: (p.subtitle as string) ?? null,
        shareToken: (p.share_token as string) ?? null,
        journeyIds: (p.journey_ids ?? []) as string[],
        culminationJourneyId: (p.culmination_journey_id as string) ?? null,
        accent: (p.accent_color as string) ?? "#d0a070",
        glow: (p.glow_color as string) ?? "#e0b080",
      });
    }

    // On desktop, programmatic AudioContext.resume() still works after
    // the selector-card click that navigated us here, so we can skip the
    // gesture overlay and drop the viewer straight into the journey. On
    // mobile, a page refresh loses the user gesture context so
    // AudioContext.resume() and audio.play() silently fail — keep the
    // tap-to-begin screen there.
    if (isDesktopEnvironment()) {
      ensureResumed();
      if (recording) {
        play({
          id: recording.id,
          title: recording.title ?? "Untitled",
          audioUrl: recording.audio_url,
          artist: recording.artist ?? undefined,
        });
      }
      useAudioStore.getState().setAiImageEnabled(true);
      useAudioStore.getState().startCustomJourney(journey);
    } else {
      setNeedsGesture(true);
    }

    // Prefetch the path's dedicated screen so closing the journey feels
    // instant — the page is already cached by the time the user taps X.
    if (initialPath?.share_token) {
      try { router.prefetch(`/path/${initialPath.share_token}?view=app`); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Push cue markers from server prop to store on mount
  useEffect(() => {
    if (cueMarkersProp.length > 0) {
      useAudioStore.getState().setCueMarkers(cueMarkersProp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Wire auto-detected events to journey engine.
  // Cue markers from Studio are NOT auto-wired — they only apply when a journey
  // explicitly opts in (e.g. Ghost uses enableBassFlash + its own cue markers).
  useEffect(() => {
    if (!activeJourney) return;
    // Skip if duration hasn't settled yet — effect will re-run when it does
    if (duration <= 0) return;
    const engine = getJourneyEngine();

    // Auto-detected events from analysis (texture_change, climax, drop, silence, new_idea)
    // bass_hit events are included but only rendered visually when enableBassFlash is true
    const analysis = useAudioStore.getState().analysis;
    const autoEvents = (analysis?.events ?? []) as MusicalEvent[];

    // Only wire cue markers as bass_hit events for journeys that opt in
    let allEvents = autoEvents;
    if (activeJourney.enableBassFlash && storeCueMarkers.length > 0) {
      const manualAsEvents: MusicalEvent[] = storeCueMarkers.map(c => ({
        time: c.time, type: "bass_hit" as const, intensity: 1.0, label: c.label || "Cue",
      }));
      allEvents = [...autoEvents, ...manualAsEvents];
    }

    if (allEvents.length > 0) {
      engine.setEvents(allEvents, duration);
    }
  }, [activeJourney, duration, storeCueMarkers]);

  // Don't auto-open library — let the welcome screen guide the user

  // Check for speech API
  useEffect(() => {
    setHasSpeechApi(!!getSpeechRecognition());
    if (initialLive && getSpeechRecognition()) {
      setLiveEnabled(true);
    }
  }, [initialLive]);

  // Web Speech API — live mode
  useEffect(() => {
    if (!liveEnabled) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      return;
    }

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.trim();
          if (transcript) setLiveText(transcript);
        }
      }
    };
    recognition.onerror = () => {};
    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch {}
      }
    };
    recognition.start();

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      micStreamRef.current = stream;
      const node = getAnalyserNode();
      if (node) {
        try {
          const engine = getAudioEngine();
          const micSource = engine.audioContext.createMediaStreamSource(stream);
          micSource.connect(node);
        } catch {}
      }
    }).catch(() => {});

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
    };
  }, [liveEnabled, analyser]);

  // Load the full library into the queue so prev/next can navigate
  const loadLibraryQueue = useCallback(async (autoPlay: boolean) => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("recordings")
        .select("id, title, audio_url, duration")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        const tracks = data.map((row) => ({
          id: row.id,
          title: row.title,
          audioUrl: `/api/audio/${row.id}`,
          duration: row.duration ?? undefined,
        }));
        if (autoPlay) {
          useAudioStore.getState().setQueue(tracks, 0);
        } else {
          // Load queue without auto-playing
          useAudioStore.setState({
            queue: tracks,
            queueIndex: 0,
            currentTrack: tracks[0],
            isPlaying: false,
            currentTime: 0,
            duration: tracks[0].duration ?? 0,
            analysis: null,
          });
        }
      } else {
        setLibraryOpen(true);
      }
    } catch {
      setLibraryOpen(true);
    }
  }, []);

  // Load the most recent track from user's library and start playing
  const handleEnterRoom = useCallback(async () => {
    await loadLibraryQueue(true);
  }, [loadLibraryQueue]);

  // End the journey after completion — return to journey picker
  const handleEndJourney = useCallback(() => {
    completedJourneyRef.current = null;
    const state = useAudioStore.getState();
    // Inside a custom path: navigate first, stop after — same
    // approach as handleExit to avoid shader flashes during transition.
    const activePath = state.activePath;
    if (activePath?.shareToken) {
      router.push(`/path/${activePath.shareToken}?view=app`);
      setJourneyCompleted(false);
      setTimeout(() => {
        const s = useAudioStore.getState();
        if (s.activeJourney) s.stopJourney();
        s.setActivePath(null);
      }, 80);
      return;
    }
    setJourneyCompleted(false);
    state.stopJourney();
    setJourneyOpen(true);
  }, [router]);

  // Continue to next journey in the path
  // Looks like a UUID → custom journey in the DB. Built-in journey ids are
  // short slugs like "inferno", "the-wellspring", etc.
  const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  // Fetch + start a custom journey + its recording by UUID, using the
  // signed-in user's context. Clears the current journey first.
  const startCustomById = useCallback(async (journeyId: string) => {
    ensureResumed();
    setJourneyCompleted(false);
    completedJourneyRef.current = null;
    // Arm the replay guard so the completion detector can't fire from
    // a stale currentTime snapshot during the stop→start transition.
    replayGuardUntilRef.current = performance.now() + 2500;
    setOverlayRemountKey((k) => k + 1);
    useAudioStore.getState().setCurrentTime(0);
    seek(0);
    useAudioStore.getState().stopJourney();

    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: jRow } = await sb
        .from("journeys")
        .select("*")
        .eq("id", journeyId)
        .eq("user_id", user.id)
        .single();
      if (!jRow) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = jRow as Record<string, any>;
      const journey = {
        id: r.id as string,
        name: r.name ?? "Untitled",
        subtitle: r.subtitle ?? "",
        description: r.description ?? "",
        realmId: r.realm_id ?? "custom",
        aiEnabled: true,
        phases: r.phases ?? [],
        storyText: r.story_text ?? null,
        recordingId: r.recording_id ?? null,
        userId: r.user_id,
        audioReactive: !!r.audio_reactive,
        creatorName: r.creator_name ?? null,
        photographyCredit: r.photography_credit ?? null,
        dedication: r.dedication ?? null,
        ...(r.theme ? { theme: r.theme } : {}),
        ...(Array.isArray(r.local_image_urls) && r.local_image_urls.length > 0
          ? { localImageUrls: r.local_image_urls as string[] }
          : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      // Culmination random-track swap — same logic as /journey/[token] page
      if (!journey.recordingId && r.theme?.isCulmination && Array.isArray(r.theme.randomTrackPool) && r.theme.randomTrackPool.length > 0) {
        journey.recordingId = r.theme.randomTrackPool[Math.floor(Math.random() * r.theme.randomTrackPool.length)];
      }

      // Load recording
      if (journey.recordingId) {
        const { data: rec } = await sb
          .from("recordings")
          .select("id, title, audio_url, artist")
          .eq("id", journey.recordingId)
          .single();
        if (rec) {
          useAudioStore.getState().play(
            { id: rec.id, title: rec.title, audioUrl: `/api/audio/${rec.id}`, artist: rec.artist ?? undefined },
            0
          );
        }
      }
      setTimeout(() => {
        useAudioStore.getState().startCustomJourney(journey);
      }, 60);
    } catch (err) {
      console.warn("[path] startCustomById failed:", err);
    }
  }, [seek]);

  // Replay the current journey from the beginning.
  // Must be defined AFTER startCustomById — custom-journey replays route
  // through startCustomById since startJourney() only knows built-in slugs.
  const handleReplayJourney = useCallback(() => {
    const journey = useAudioStore.getState().activeJourney;
    if (!journey) return;
    ensureResumed(); // Unlock audio on mobile — must be in gesture context
    // Pre-arm the completion guard — blocks the completion detector from
    // firing based on stale currentTime for the first 2.5s of replay.
    replayGuardUntilRef.current = performance.now() + 2500;
    // Force fresh DOM for overlays so CSS animations restart cleanly
    setOverlayRemountKey((k) => k + 1);
    setJourneyCompleted(false);
    completedJourneyRef.current = null;
    // Reset audio element and store to absolute 0 — the audio element
    // stays at `duration` after 'ended', so state-only resets can't
    // restart playback. Drive the element directly, then play().
    try {
      const el = getAudioEngine().audioElement;
      el.currentTime = 0;
      el.play().catch(() => {});
    } catch {}
    useAudioStore.getState().setCurrentTime(0);
    useAudioStore.getState().resume();
    // Custom journeys (Welcome Home etc.) have UUID ids — startJourney only
    // knows built-in string slugs, so we have to route through the custom
    // path helper for those. Without this branch startJourney silently
    // no-ops and the end overlay leaks into the restart.
    if (isUuid(journey.id)) {
      startCustomById(journey.id);
      return;
    }
    useAudioStore.getState().stopJourney();
    setTimeout(() => {
      useAudioStore.getState().startJourney(journey.id);
    }, 50);
  }, [startCustomById]);

  const handleContinuePath = useCallback((nextJourneyId: string) => {
    if (isUuid(nextJourneyId)) {
      startCustomById(nextJourneyId);
      return;
    }
    ensureResumed();
    setJourneyCompleted(false);
    completedJourneyRef.current = null;
    try {
      const el = getAudioEngine().audioElement;
      el.currentTime = 0;
      el.play().catch(() => {});
    } catch {}
    useAudioStore.getState().setCurrentTime(0);
    useAudioStore.getState().resume();
    useAudioStore.getState().stopJourney();
    setTimeout(() => {
      useAudioStore.getState().startJourney(nextJourneyId);
    }, 50);
  }, [startCustomById]);

  // Enter a culmination journey
  const handleEnterCulmination = useCallback((culminationId: string) => {
    if (isUuid(culminationId)) {
      startCustomById(culminationId);
      return;
    }
    ensureResumed();
    setJourneyCompleted(false);
    completedJourneyRef.current = null;
    seek(0);
    useAudioStore.getState().stopJourney();
    setTimeout(() => {
      useAudioStore.getState().startJourney(culminationId);
    }, 50);
  }, [seek, startCustomById]);

  const handleSwitchToVisualize = useCallback(() => {
    if (useAudioStore.getState().activeJourney) {
      useAudioStore.getState().stopJourney();
      // Override the heavy 3D default — pick a lightweight 2D shader
      // so the first switch feels instant
      const LIGHT_SHADERS = ["cosmos", "fog", "nebula", "drift", "dusk", "tide", "ember"];
      useAudioStore.getState().setVizMode(
        LIGHT_SHADERS[Math.floor(Math.random() * LIGHT_SHADERS.length)]
      );
    }
    setJourneyCompleted(false);
    completedJourneyRef.current = null;
    useAudioStore.setState({ textOverlayMode: "off" });
    useAudioStore.getState().setRoomMode("viz");
    setJourneyOpen(false);
    // If no track is loaded, load the full library (paused) so the user
    // doesn't land on the empty welcome screen.
    if (!useAudioStore.getState().currentTrack) {
      loadLibraryQueue(false);
    }
  }, [loadLibraryQueue]);

  // Sign out handler — available in The Room
  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    useAudioStore.getState().pause();
    await supabase.auth.signOut();
    router.push("/login");
  }, [router]);

  const handleExit = useCallback(() => {
    completedJourneyRef.current = null;
    const state = useAudioStore.getState();
    const activePath = state.activePath;
    // Navigate FIRST so the current journey shader stays painted during
    // the route transition — no black flash, no shader pop. The audio
    // engine stop happens in the next tick, by which point the new route
    // is already rendering.
    if (activePath?.shareToken && state.activeJourney) {
      router.push(`/path/${activePath.shareToken}?view=app`);
    } else {
      router.push("/library");
    }
    setJourneyCompleted(false);
    // Defer journey teardown: the small delay lets the route transition
    // begin before the store mutation causes a re-render of this page.
    setTimeout(() => {
      const s = useAudioStore.getState();
      if (s.activeJourney) s.stopJourney();
      s.setActivePath(null);
    }, 80);
  }, [router]);

  // Seek by offset
  const seekBy = useCallback((offset: number) => {
    if (isDesktopApp()) {
      const state = useAudioStore.getState();
      const newTime = Math.max(0, Math.min(state.duration || 0, state.currentTime + offset));
      nativeAudioSeek(newTime).catch(() => {});
      seek(newTime);
      return;
    }
    const engine = getAudioEngine();
    const audio = engine.audioElement;
    const newTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + offset));
    audio.currentTime = newTime;
    seek(newTime);
  }, [seek]);

  // Fullscreen toggle
  const handleFullscreenToggle = useCallback(() => {
    if (isIOS) {
      // iOS doesn't support Fullscreen API on non-video elements — toggle immersive mode
      setIsFullscreen((prev) => {
        const next = !prev;
        iosImmersiveRef.current = next;
        if (next) {
          // Entering immersive: immediately hide controls for a clean experience
          setControlsVisible(false);
          if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
          // Scroll to hide Safari/Chrome address bar
          window.scrollTo(0, 1);
        } else {
          // Exiting immersive: show controls
          setControlsVisible(true);
          resetControlsTimer();
        }
        return next;
      });
      return;
    }
    if (isDesktopApp()) {
      // Native kiosk mode — no browser chrome, no "Press Escape" overlay
      setIsFullscreen((prev) => {
        const next = !prev;
        (next ? enterKioskMode() : exitKioskMode()).catch(() => {});
        return next;
      });
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => setIsFullscreen(false));
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen API failed — fall back to immersive mode
        setIsFullscreen((v) => !v);
      });
    }
  }, [isIOS]);

  // Sync fullscreen state when user presses Escape or browser exits fullscreen
  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "Escape":
          if (libraryOpen) setLibraryOpen(false);
          else if (journeyOpen) setJourneyOpen(false);
          else handleExit();
          break;
        case " ":
          e.preventDefault();
          ensureResumed();
          togglePlayPause();
          break;
        case "h":
          setHudVisible((v) => !v);
          break;
        case "l":
          setLibraryOpen((v) => !v);
          break;
        case "t":
          setTonnetzVisible((v) => !v);
          break;
        case "ArrowLeft":
          e.preventDefault();
          // Only cycle shaders when a track is playing or a journey is active
          if (useAudioStore.getState().currentTrack || useAudioStore.getState().activeJourney) {
            useAudioStore.getState().cycleVizModePrev();
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (useAudioStore.getState().currentTrack || useAudioStore.getState().activeJourney) {
            useAudioStore.getState().cycleVizMode();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowDown":
          e.preventDefault();
          seekBy(-10);
          break;
        case "p": {
          const state = useAudioStore.getState();
          const hasJourney = !!state.activeJourney;
          const modes: Array<"off" | "poetry" | "story"> = hasJourney
            ? ["off", "poetry", "story"]
            : ["off", "poetry"];
          const currentIdx = modes.indexOf(state.textOverlayMode);
          const nextMode = modes[(currentIdx + 1) % modes.length];
          if (nextMode === "off") state.setVizWhisper(false);
          state.setTextOverlayMode(nextMode);
          break;
        }
        case "v":
          useAudioStore.getState().setVizWhisper(!useAudioStore.getState().vizWhisper);
          break;
        case "f":
          handleFullscreenToggle();
          break;
        case "a":
          if (canAdmin && !useAudioStore.getState().activeJourney) setAdminOpen((v) => !v);
          break;
        case "r":
          if (canRate) setRatingOpen((v) => !v);
          break;
        case "s":
          if (isAdmin) setIsolatePrimary((v) => !v);
          break;
        case "i":
          if (isAdmin) setHideImagery((v) => !v);
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleExit, libraryOpen, journeyOpen, togglePlayPause, seekBy, handleFullscreenToggle, isAdmin, canAdmin, canRate]);

  // Show HUD when analysis is available and completed
  const showHud = activeAnalysis?.status === "completed";

  if (!analyser || !dataArray) return null;

  // Gesture gate for path-launched journeys.
  // - Desktop (fine pointer + hover): skip the overlay entirely; mount effect
  //   below starts the journey immediately. Desktops allow programmatic
  //   AudioContext.resume() on first user click of the selector card, and by
  //   the time we reach this route the gesture is still in scope.
  // - Mobile: show a rich info screen (journey name, subtitle, credits,
  //   path step counter, dedication) with a play button — matches the
  //   public /journey/[token] start screen so viewers see who made what
  //   before they tap in.
  if (needsGesture && initialCustomJourney) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = initialCustomJourney as Record<string, any>;
    const journeyName = (r.name as string) ?? "Journey";
    const journeySubtitle = (r.subtitle as string) ?? null;
    const creatorName = (r.creator_name as string) ?? null;
    const photographyCredit = (r.photography_credit as string) ?? null;
    const dedication = (r.dedication as string) ?? null;
    const musicArtist = recording?.artist ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (initialPath ?? null) as Record<string, any> | null;
    const pathName = p?.name as string | undefined;
    const pathAccent = (p?.accent_color as string) ?? "#d0a070";
    const pathJourneyIds = (p?.journey_ids ?? []) as string[];
    const pathStepIdx = pathJourneyIds.indexOf(r.id as string);
    const pathStepTotal = pathJourneyIds.length;

    const handleGestureBegin = () => {
      setNeedsGesture(false);
      ensureResumed();

      const journey = {
        id: r.id as string,
        name: r.name ?? "Untitled",
        subtitle: r.subtitle ?? "",
        description: r.description ?? "",
        realmId: r.realm_id ?? "custom",
        aiEnabled: true,
        phases: r.phases ?? [],
        storyText: r.story_text ?? null,
        recordingId: r.recording_id ?? null,
        userId: r.user_id,
        audioReactive: !!r.audio_reactive,
        creatorName: r.creator_name ?? null,
        photographyCredit: r.photography_credit ?? null,
        dedication: r.dedication ?? null,
        ...(r.theme ? { theme: r.theme } : {}),
        ...(Array.isArray(r.local_image_urls) && r.local_image_urls.length > 0
          ? { localImageUrls: r.local_image_urls as string[] }
          : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      if (p) {
        useAudioStore.getState().setActivePath({
          id: p.id as string,
          name: (p.name as string) ?? "Untitled Path",
          subtitle: (p.subtitle as string) ?? null,
          shareToken: (p.share_token as string) ?? null,
          journeyIds: pathJourneyIds,
          culminationJourneyId: (p.culmination_journey_id as string) ?? null,
          accent: pathAccent,
          glow: (p.glow_color as string) ?? "#e0b080",
        });
      }

      if (recording) {
        play({
          id: recording.id,
          title: recording.title ?? "Untitled",
          audioUrl: recording.audio_url,
          artist: recording.artist ?? undefined,
        });
      }

      useAudioStore.getState().setAiImageEnabled(true);
      useAudioStore.getState().startCustomJourney(journey);
    };
    return (
      <GestureStartScreen
        journeyName={journeyName}
        journeySubtitle={journeySubtitle}
        creatorName={creatorName}
        musicArtist={musicArtist}
        photographyCredit={photographyCredit}
        dedication={dedication}
        pathName={pathName}
        pathAccent={pathAccent}
        pathStepIdx={pathStepIdx}
        pathStepTotal={pathStepTotal}
        onBegin={handleGestureBegin}
      />
    );
  }


  // Always render — compositor contains the bottom bar; journey selector
  // covers shaders with its own solid black background at z-index 7
  const showViz = true;

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ backgroundColor: "#000" }}
      onMouseMove={resetControlsTimer}
    >
      {/* Journey compositor wraps everything when active */}
      {showViz && <JourneyCompositor
        frame={journeyFrame}
        audioAmplitude={audioFeaturesRef.current.amplitude}
        audioBass={audioFeaturesRef.current.bass}
        aiEnabled={((journeyActive && aiImageEnabled) || isAiOnlyMode) && !hideImagery}
        aiPrompt={aiPrompt}
        aiOnly={isAiOnlyMode}
        aiGenerating={isPlaying}
        journeyId={activeJourney?.id}
        enableBassFlash={activeJourney?.enableBassFlash}
        localImageUrls={activeJourney?.localImageUrls}
      >
        {/* Shader layer */}
        <VisualizerCore
          analyser={analyser}
          dataArray={dataArray}
          analysis={activeAnalysis}
          defaultMood="flowing"
          onExit={handleExit}
          exitLabel="back"
          liveText={liveText}
          liveEnabled={liveEnabled}
          onLiveToggle={hasSpeechApi ? () => setLiveEnabled((v) => !v) : undefined}
          showLiveButton={true}
          hudVisible={hudVisible}
          onHudToggle={() => setHudVisible((v) => !v)}
          showHudButton={false /* paused — re-enable with: showHud && !journeyActive */}
          libraryOpen={libraryOpen}
          onLibraryToggle={() => setLibraryOpen((v) => !v)}
          showLibraryButton={true}
          sectionFlash={sectionFlash}
          tonnetzVisible={tonnetzVisible}
          onTonnetzToggle={undefined /* paused — re-enable with: journeyActive ? undefined : () => setTonnetzVisible((v) => !v) */}
          onJourneyToggle={() => {
            const wasOpen = journeyOpen;
            setJourneyOpen((v) => !v);
            useAudioStore.getState().setRoomMode(wasOpen ? "viz" : "journey");
            // Switching from viz to journey browser — pause audio
            if (!wasOpen && !activeJourney && useAudioStore.getState().isPlaying) {
              useAudioStore.getState().pause();
            }
          }}
          showJourneyButton={true}
          showTransport={true}
          controlsVisible={controlsVisible}
          configRef={configRef}
          journeyShaderMode={journeyFrame?.shaderMode}
          journeyDualShaderMode={getTierProfile().enableDualShader ? journeyFrame?.dualShaderMode : null}
          journeyTertiaryShaderMode={journeyFrame?.tertiaryShaderMode}
          journeyPhase={journeyFrame?.phase}
          journeyVoice={journeyFrame?.voice}
          journeyPoetryInterval={journeyFrame?.poetryIntervalSeconds}
          journeyPoetryMood={journeyFrame?.poetryMood}
          journeyRealmImagery={activeTheme?.poetryImagery ?? activeRealm?.poetryImagery}
          journeyRealmId={activeRealm?.id}
          journeyThemeMood={activeTheme?.poetryMood ?? null}
          journeyStoryText={activeJourney?.storyText}
          journeyActive={journeyActive}
          journeyBrowsing={journeyOpen}
          journeyName={activeJourney?.name ?? null}
          onStopJourney={() => {
            const state = useAudioStore.getState();
            if (state.activeJourney) {
              // If we're inside a user path (Welcome Home, etc.) return to
              // the dedicated path screen instead of opening the journey
              // picker. Navigate first then stop — same pattern as
              // handleExit to avoid the transition shader flash.
              const activePath = state.activePath;
              if (activePath?.shareToken) {
                router.push(`/path/${activePath.shareToken}?view=app`);
                setJourneyCompleted(false);
                completedJourneyRef.current = null;
                setTimeout(() => {
                  const s = useAudioStore.getState();
                  if (s.activeJourney) s.stopJourney();
                  s.setActivePath(null);
                }, 80);
                return;
              }
              // Default: stop journey and open journey picker
              state.stopJourney();
              setJourneyOpen(true);
              setJourneyCompleted(false);
              completedJourneyRef.current = null;
            } else {
              // No active journey — close browser, return to viz
              setJourneyOpen(false);
            }
          }}
          onShareJourney={journeyActive ? handleShareJourney : undefined}
          isFullscreen={isFullscreen}
          onFullscreenToggle={handleFullscreenToggle}
          onSwitchToVisualize={handleSwitchToVisualize}
          journeyAccent={activeTheme?.palette.accent ?? activeRealm?.palette.accent ?? null}
          smoothMotion={activeJourney ? !activeJourney.audioReactive : false}
          onSignOut={handleSignOut}
          onPrevShader={() => useAudioStore.getState().cycleVizModePrev()}
          onNextShader={() => useAudioStore.getState().cycleVizMode()}
        >
          {/* Analysis HUD — top layer (hidden during journeys) */}
          {hudVisible && showHud && !journeyActive && (
            <AnalysisHUD
              analysis={activeAnalysis}
              currentTime={currentTime}
              duration={duration}
              onSectionChange={handleSectionChange}
            />
          )}

          {tonnetzVisible && !journeyActive && activeAnalysis?.notes && activeAnalysis?.chords && (
            <TonnetzOverlay
              notes={activeAnalysis.notes}
              chords={activeAnalysis.chords}
              currentTime={currentTime}
            />
          )}
        </VisualizerCore>
      </JourneyCompositor>}

      {/* Journey phase indicator — hidden during intro + 2s buffer */}
      {journeyActive && activeJourney && !journeyOpen && phaseIndicatorReady && (
        <JourneyPhaseIndicator
          key={`phase-indicator-${activeJourney.id}-${overlayRemountKey}`}
          journey={activeJourney}
          currentPhase={journeyPhase}
        />
      )}

      {/* Admin panel — toggle with 'A' key (any logged-in user) */}
      {canAdmin && !journeyActive && <AdminPanel visible={adminOpen} onClose={() => setAdminOpen(false)} currentShader={storeVizMode} dualShader={undefined} tertiaryShader={undefined} isAdmin={isAdmin} onSwitchShader={(mode) => useAudioStore.getState().setVizMode(mode)} onPrevShader={() => useAudioStore.getState().cycleVizModePrev()} onNextShader={() => useAudioStore.getState().cycleVizMode()} />}

      {/* Rating panel — toggle with 'R' key, own custom journeys or admin */}
      {canRate && (
        <JourneyFeedback
          visible={ratingOpen && journeyActive && !journeyOpen}
          shaderMode={journeyFrame?.shaderMode ?? storeVizMode}
          dualShaderMode={journeyFrame?.dualShaderMode}
          tertiaryShaderMode={journeyFrame?.tertiaryShaderMode}
          aiPrompt={journeyFrame?.aiPrompt}
          isolatePrimary={isolatePrimary}
          hideImagery={hideImagery}
        />
      )}

      {/* Journey intro screen — exact same treatment as completion overlay */}
      {journeyIntroVisible && activeJourney && (
        <div
          key={`intro-${overlayRemountKey}`}
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
              {activeJourney.name}
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
              by {activeJourney.creatorName || "Karel Barnoski"}
            </span>
            {(currentTrack?.artist || recording?.artist) && (
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
                Music by {currentTrack?.artist || recording?.artist}
              </span>
            )}
            {activeJourney.photographyCredit && (
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
                Photography by {activeJourney.photographyCredit}
              </span>
            )}
            {activeJourney.dedication && (
              <span
                style={{
                  position: "relative",
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                  fontStyle: "italic",
                  fontSize: "1rem",
                  color: "rgba(255, 255, 255, 0.75)",
                  letterSpacing: "0.04em",
                  textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                  marginTop: "0.5rem",
                }}
              >
                {activeJourney.dedication}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Journey completion overlay — replay or end — above all visual layers */}
      {journeyCompleted && journeyActive && activeJourney && (() => {
        const builtinPath = getPathForJourney(activeJourney.id);
        const customPathCtx = useAudioStore.getState().activePath;
        const customPathJourneyIds = customPathCtx?.journeyIds ?? [];
        const inCustomPath = customPathCtx && customPathJourneyIds.includes(activeJourney.id);
        const isCustomCulmination = !!customPathCtx && customPathCtx.culminationJourneyId === activeJourney.id;

        // Unified shape so the render below can treat built-in and custom
        // paths identically. We mimic the built-in JourneyPath shape
        // (palette.accent, palette.glow, etc.) so the existing JSX keeps
        // working without per-branch rewrites.
        const pathLike = builtinPath
          ? {
              id: builtinPath.id,
              name: builtinPath.name,
              subtitle: builtinPath.subtitle,
              journeyIds: builtinPath.journeyIds,
              culminationJourneyId: builtinPath.culminationJourneyId,
              palette: { accent: builtinPath.palette.accent, glow: builtinPath.palette.glow },
              isCustom: false as const,
            }
          : (inCustomPath || isCustomCulmination) && customPathCtx
            ? {
                id: customPathCtx.id,
                name: customPathCtx.name,
                subtitle: customPathCtx.subtitle ?? "",
                journeyIds: customPathCtx.journeyIds,
                culminationJourneyId: customPathCtx.culminationJourneyId ?? "",
                palette: { accent: customPathCtx.accent, glow: customPathCtx.glow },
                isCustom: true as const,
              }
            : null;

        const progressState = usePathProgressStore.getState();
        const completedIds = progressState.completedJourneyIds;
        const isBuiltinCulmination = JOURNEY_PATHS.some(p => p.culminationJourneyId === activeJourney.id);
        const isCulmination = isBuiltinCulmination || isCustomCulmination;
        const isGrandCulm = activeJourney.id === GRAND_CULMINATION_ID;

        const pathProgress = pathLike ? {
          completed: pathLike.journeyIds.filter(id => completedIds.includes(id)).length,
          total: pathLike.journeyIds.length,
        } : null;
        const justCompletedPath = pathLike && pathProgress && pathProgress.completed === pathProgress.total;

        // Next journey id in the path sequence — works for both built-in
        // (uses string ids + legacy getNextInPath) and custom (UUIDs).
        let nextInPath: string | null = null;
        if (pathLike && !justCompletedPath) {
          if (!pathLike.isCustom && builtinPath) {
            nextInPath = getNextInPath(builtinPath, completedIds);
          } else {
            nextInPath = pathLike.journeyIds.find((id) => !completedIds.includes(id)) ?? null;
          }
        }

        // Legacy local name for the existing JSX — keep `path` referring to
        // pathLike so the big JSX block below compiles without edits.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const path = pathLike as any;

        // Grand culmination unlock check
        const justUnlockedGrand = isCulmination && progressState.grandCulminationUnlocked
          && !progressState.grandCulminationCompleted;

        return (
          <div
            key={`complete-${overlayRemountKey}`}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              zIndex: 50,
              pointerEvents: "none",
              animation: "journeyEndFadeIn 3s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          >
            <div className="flex flex-col items-center gap-5" style={{ position: "relative", padding: "4rem 6rem", pointerEvents: "auto", maxWidth: "90vw" }}>
              {/* Soft blurred background */}
              <div
                style={{
                  position: "absolute",
                  inset: "-40%",
                  background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, transparent 65%)",
                  filter: "blur(40px)",
                  pointerEvents: "none",
                }}
              />

              {/* Title */}
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
                {isGrandCulm ? "The Spirit" : isCulmination ? activeJourney.name : "Journey Complete"}
              </span>

              {/* Journey name + subtitle */}
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
                  textAlign: "center",
                }}
              >
                {isCulmination || isGrandCulm ? activeJourney.subtitle : activeJourney.name}
              </span>
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
                by {activeJourney.creatorName || "Karel Barnoski"}
              </span>
              {(currentTrack?.artist || recording?.artist) && (
                <span
                  style={{
                    position: "relative",
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.9rem",
                    color: "rgba(255, 255, 255, 0.85)",
                    letterSpacing: "0.04em",
                    textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                    marginTop: "-0.75rem",
                  }}
                >
                  Music by {currentTrack?.artist || recording?.artist}
                </span>
              )}
              {activeJourney.photographyCredit && (
                <span
                  style={{
                    position: "relative",
                    fontFamily: "var(--font-geist-mono)",
                    fontSize: "0.9rem",
                    color: "rgba(255, 255, 255, 0.85)",
                    letterSpacing: "0.04em",
                    textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                    marginTop: "-0.75rem",
                  }}
                >
                  Photography by {activeJourney.photographyCredit}
                </span>
              )}
              {activeJourney.dedication && (
                <span
                  style={{
                    position: "relative",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontStyle: "italic",
                    fontSize: "1.05rem",
                    color: "rgba(255, 255, 255, 0.75)",
                    letterSpacing: "0.04em",
                    textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                    marginTop: "0.25rem",
                  }}
                >
                  {activeJourney.dedication}
                </span>
              )}

              {/* Path progress section — for regular journeys in a path */}
              {path && !isCulmination && !isGrandCulm && pathProgress && (
                <div className="flex flex-col items-center gap-2" style={{ position: "relative", marginTop: "0.5rem" }}>
                  <div
                    style={{
                      width: "3rem",
                      height: "1px",
                      background: "rgba(255,255,255,0.15)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontWeight: 300,
                      fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)",
                      letterSpacing: "0.03em",
                      color: justCompletedPath ? path.palette.accent : "rgba(255,255,255,0.45)",
                      textShadow: "0 1px 6px rgba(0,0,0,0.8)",
                    }}
                  >
                    {path.name}{justCompletedPath ? " — complete" : ""}
                  </span>
                  {/* Progress dots — instant hover tooltip, click to jump
                      to any journey in the path. Works for both built-in
                      and custom paths. */}
                  <div className="flex items-center gap-2 flex-wrap" style={{ position: "relative" }}>
                    {path.journeyIds.map((jid: string, i: number) => {
                      const done = completedIds.includes(jid);
                      const builtin = getJourney(jid);
                      const name = builtin?.name ?? `Step ${i + 1}`;
                      const label = `${String(i + 1).padStart(2, "0")} · ${name}`;
                      return (
                        <button
                          key={jid}
                          type="button"
                          onClick={() => handleContinuePath(jid)}
                          aria-label={name}
                          className="group relative inline-flex items-center justify-center"
                          style={{
                            width: "16px",
                            height: "16px",
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          <span
                            className="block transition-all"
                            style={{
                              width: "14px",
                              height: "14px",
                              borderRadius: "50%",
                              backgroundColor: done ? path.palette.accent : "rgba(255,255,255,0.2)",
                              boxShadow: done ? `0 0 8px ${path.palette.glow}55` : "none",
                            }}
                          />
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
                        </button>
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
                      {pathProgress.completed} of {pathProgress.total}
                    </span>
                  </div>

                  {/* Culmination unlock message */}
                  {justCompletedPath && (
                    <span
                      style={{
                        fontFamily: "'Cormorant Garamond', Georgia, serif",
                        fontStyle: "italic",
                        fontWeight: 300,
                        fontSize: "clamp(0.85rem, 1.8vw, 1rem)",
                        color: "rgba(255,255,255,0.5)",
                        marginTop: "0.25rem",
                      }}
                    >
                      Something deeper awaits.
                    </span>
                  )}
                </div>
              )}

              {/* Culmination completion — path fulfilled message */}
              {isCulmination && path && (
                <div className="flex flex-col items-center gap-2" style={{ position: "relative", marginTop: "0.5rem" }}>
                  <div
                    style={{
                      width: "3rem",
                      height: "1px",
                      background: "rgba(255,255,255,0.15)",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      fontWeight: 300,
                      fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)",
                      letterSpacing: "0.03em",
                      color: path.palette.accent,
                      textShadow: "0 1px 6px rgba(0,0,0,0.8)",
                    }}
                  >
                    {path.name} — fulfilled
                  </span>
                </div>
              )}

              {/* Grand culmination special pre-message */}
              {justUnlockedGrand && (
                <span
                  style={{
                    position: "relative",
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontStyle: "italic",
                    fontWeight: 300,
                    fontSize: "clamp(0.9rem, 2vw, 1.2rem)",
                    color: "rgba(255,255,255,0.55)",
                    marginTop: "0.25rem",
                  }}
                >
                  Every path has led to this.
                </span>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3" style={{ position: "relative", marginTop: "0.25rem" }}>
                <button
                  onClick={handleReplayJourney}
                  className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    fontSize: "0.8rem",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.02em",
                    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                  }}
                >
                  Replay
                </button>

                {/* Continue Path — next journey in sequence */}
                {nextInPath && (
                  <button
                    onClick={() => handleContinuePath(nextInPath)}
                    className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                    style={{
                      border: `1px solid ${path?.palette.accent ?? "rgba(255,255,255,0.2)"}`,
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.02em",
                      textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                    }}
                  >
                    Continue Path
                  </button>
                )}

                {/* Enter Culmination — when path just completed */}
                {justCompletedPath && path && (
                  <button
                    onClick={() => handleEnterCulmination(path.culminationJourneyId)}
                    className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                    style={{
                      border: `1px solid ${path.palette.accent}`,
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.02em",
                      textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                      color: path.palette.accent,
                    }}
                  >
                    Enter {getCulminationJourney(path.culminationJourneyId)?.name ?? "Culmination"}
                  </button>
                )}

                {/* Enter Grand Culmination — when all 5 path culminations done */}
                {justUnlockedGrand && (
                  <button
                    onClick={() => handleEnterCulmination(GRAND_CULMINATION_ID)}
                    className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                    style={{
                      border: "1px solid rgba(160,128,208,0.6)",
                      fontSize: "0.8rem",
                      fontFamily: "var(--font-geist-mono)",
                      letterSpacing: "0.02em",
                      textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                      color: "#c0a0f0",
                    }}
                  >
                    Enter The Spirit
                  </button>
                )}

                <button
                  onClick={handleEndJourney}
                  className="px-5 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors duration-150"
                  style={{
                    border: "1px solid rgba(255,255,255,0.2)",
                    fontSize: "0.8rem",
                    fontFamily: "var(--font-geist-mono)",
                    letterSpacing: "0.02em",
                    textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                  }}
                >
                  End
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Live listening indicator — hidden in fullscreen/immersive mode */}
      {liveEnabled && !isFullscreen && (
        <div
          className="absolute top-6 right-6 flex items-center gap-2 transition-opacity duration-300"
          style={{ opacity: controlsVisible ? 1 : 0 }}
        >
          <Mic className="h-3.5 w-3.5 animate-pulse text-red-400/80" />
          <span className="text-white/40 text-xs" style={{ fontFamily: "var(--font-geist-mono)" }}>
            Listening
          </span>
        </div>
      )}

      {/* Library drawer */}
      <VisualizerLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
      />

      {/* Journey selector */}
      <JourneySelector
        open={journeyOpen}
        onClose={() => setJourneyOpen(false)}
      />

      {/* Share sheet */}
      <ShareSheet
        open={!!shareSheet}
        onClose={() => setShareSheet(null)}
        url={shareSheet?.url ?? ""}
        title={shareSheet?.title ?? ""}
        text={shareSheet?.text ?? "Check out this experience on Resonance"}
      />

      {/* Build identity footer — dim, bottom-left, fades with the controls.
          Lets you and Johnny verify which build is actually running on a
          given machine. /api/version returns the same data as JSON. */}
      <div
        style={{
          position: "absolute",
          left: "12px",
          bottom: "8px",
          zIndex: 5,
          fontFamily: "var(--font-geist-mono)",
          fontSize: "9px",
          letterSpacing: "0.05em",
          color: "rgba(255,255,255,0.18)",
          textTransform: "uppercase",
          pointerEvents: "none",
          opacity: controlsVisible ? 1 : 0.4,
          transition: "opacity 0.4s ease",
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        v0.1.0 · {process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev"} · tier {getDeviceTier()}
      </div>
    </div>
  );
}
