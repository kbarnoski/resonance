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
import { useAudioStore } from "@/lib/audio/audio-store";
import { MODES_AI, AI_MODE_PROMPTS } from "@/lib/shaders";
import { getAudioEngine, getAnalyserNode, ensureResumed } from "@/lib/audio/audio-engine";
import { useInstallationMode } from "@/lib/audio/use-installation-mode";
import { useJourney, usePhaseChange } from "@/lib/journeys/use-journey";
import { useStoryGeneration } from "@/lib/journeys/use-story";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { getJourney } from "@/lib/journeys/journeys";
import { createClient } from "@/lib/supabase/client";
import { ShareSheet } from "@/components/ui/share-sheet";
import { Mic, ArrowLeft } from "lucide-react";

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

// ─── Component ───

interface VisualizerClientProps {
  recording?: { id: string; title?: string; audio_url: string } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis?: any | null;
  initialLive?: boolean;
  initialJourney?: string;
}

export function VisualizerClient({
  recording,
  analysis: initialAnalysis,
  initialLive = false,
  initialJourney,
}: VisualizerClientProps) {
  const router = useRouter();

  // Global audio store
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTime = useAudioStore((s) => s.currentTime);
  const duration = useAudioStore((s) => s.duration);
  const storeAnalysis = useAudioStore((s) => s.analysis);
  const play = useAudioStore((s) => s.play);
  const togglePlayPause = useAudioStore((s) => s.togglePlayPause);
  const setAnalysis = useAudioStore((s) => s.setAnalysis);
  const seek = useAudioStore((s) => s.seek);

  const installationMode = useAudioStore((s) => s.installationMode);
  const activeJourney = useAudioStore((s) => s.activeJourney);
  const activeRealm = useAudioStore((s) => s.activeRealm);
  const startJourney = useAudioStore((s) => s.startJourney);
  const aiImageEnabled = useAudioStore((s) => s.aiImageEnabled);

  // Local analyser state (for VisualizerCore)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
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
  const { frame: journeyFrame, active: journeyActive, phase: journeyPhase } = useJourney();
  const audioFeaturesRef = useRef({ bass: 0, mid: 0, treble: 0, amplitude: 0 });

  // Story mode generation
  useStoryGeneration();

  // Journey guidance phrases
  const [guidancePhrase, setGuidancePhrase] = useState<string | null>(null);
  const [guidancePhaseId, setGuidancePhaseId] = useState<string | null>(null);

  usePhaseChange((phase, guidance) => {
    setGuidancePhaseId(phase);
    setGuidancePhrase(guidance);
  });

  // Set initial guidance when journey starts (engine skips first callback)
  useEffect(() => {
    if (journeyActive && activeJourney && !guidancePhrase) {
      const firstPhase = activeJourney.phases[0];
      if (firstPhase?.guidancePhrases?.length) {
        setGuidancePhaseId(firstPhase.id);
        setGuidancePhrase(firstPhase.guidancePhrases[0]);
      }
    }
    if (!journeyActive) {
      setGuidancePhrase(null);
      setGuidancePhaseId(null);
    }
  }, [journeyActive, activeJourney, guidancePhrase]);

  // Detect AI-only viz mode
  const storeVizMode = useAudioStore((s) => s.vizMode);
  const isAiOnlyMode = MODES_AI.has(storeVizMode);

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
  const [controlsVisible, setControlsVisible] = useState(true);
  // Default to journey browser unless entering with a specific recording or journey
  const [journeyOpen, setJourneyOpen] = useState(!recording && !initialJourney);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    localStorage.setItem("resonance-last-experience", "room");
    return () => closeRoom();
  }, [openRoom, closeRoom]);

  // Auto-hide controls after inactivity
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!libraryOpen && !journeyOpen) setControlsVisible(false);
    }, 5000);
  }, [libraryOpen, journeyOpen]);

  useEffect(() => {
    resetControlsTimer();
    const handleMove = () => resetControlsTimer();
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("touchstart", handleMove);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("touchstart", handleMove);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [resetControlsTimer]);

  // Keep controls visible when library or journey browser is open
  useEffect(() => {
    if (libraryOpen || journeyOpen) setControlsVisible(true);
  }, [libraryOpen, journeyOpen]);

  // Initialize: connect to the global audio engine's AnalyserNode
  useEffect(() => {
    try {
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
    const track = useAudioStore.getState().currentTrack;
    if (track?.id === recording.id) {
      // Already loaded (from recording detail handoff) — just ensure analysis is set
      if (initialAnalysis && !useAudioStore.getState().analysis) {
        setAnalysis(initialAnalysis);
      }
      return;
    }
    // Fresh load from URL
    play({
      id: recording.id,
      title: recording.title ?? "Untitled",
      audioUrl: recording.audio_url,
    });
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

  // Load the most recent track from user's library and start playing
  const handleEnterRoom = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recordings")
        .select("id, title, audio_url")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!error && data?.[0]) {
        const row = data[0];
        play({ id: row.id, title: row.title, audioUrl: `/api/audio/${row.id}` }, 0);
      } else {
        // No tracks — open library so user can upload
        setLibraryOpen(true);
      }
    } catch {
      setLibraryOpen(true);
    }
  }, [play]);

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
    setJourneyOpen(false);
    // If no track is loaded, auto-load the most recent one so the user
    // doesn't land on the empty "Enter Room" welcome screen.
    if (!useAudioStore.getState().currentTrack) {
      handleEnterRoom();
    }
  }, [handleEnterRoom]);

  const handleExit = useCallback(() => {
    const state = useAudioStore.getState();
    if (state.activeJourney) {
      state.stopJourney();
      router.push("/library");
    } else if (state.currentTrack) {
      router.push(`/recording/${state.currentTrack.id}`);
    } else {
      router.push("/library");
    }
  }, [router]);

  // Seek by offset
  const seekBy = useCallback((offset: number) => {
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
      setIsFullscreen((v) => !v);
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
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleExit, libraryOpen, journeyOpen, togglePlayPause, seekBy, handleFullscreenToggle]);

  // Show HUD when analysis is available and completed
  const showHud = activeAnalysis?.status === "completed";

  if (!analyser || !dataArray) return null;

  // Always show viz — ambient orb runs on the welcome screen
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
        aiEnabled={(journeyActive && aiImageEnabled) || isAiOnlyMode}
        aiPrompt={aiPrompt}
        aiOnly={isAiOnlyMode}
        aiGenerating={isPlaying}
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
          showLiveButton={false}
          hudVisible={hudVisible}
          onHudToggle={() => setHudVisible((v) => !v)}
          showHudButton={false /* paused — re-enable with: showHud && !journeyActive */}
          libraryOpen={libraryOpen}
          onLibraryToggle={() => setLibraryOpen((v) => !v)}
          showLibraryButton={true}
          sectionFlash={sectionFlash}
          tonnetzVisible={tonnetzVisible}
          onTonnetzToggle={undefined /* paused — re-enable with: journeyActive ? undefined : () => setTonnetzVisible((v) => !v) */}
          onJourneyToggle={() => setJourneyOpen((v) => !v)}
          showJourneyButton={true}
          showTransport={true}
          controlsVisible={controlsVisible}
          configRef={configRef}
          journeyShaderMode={journeyFrame?.shaderMode}
          journeyDualShaderMode={journeyFrame?.dualShaderMode}
          journeyTertiaryShaderMode={journeyFrame?.tertiaryShaderMode}
          journeyPhase={journeyFrame?.phase}
          journeyVoice={journeyFrame?.voice}
          journeyPoetryInterval={journeyFrame?.poetryIntervalSeconds}
          journeyPoetryMood={journeyFrame?.poetryMood}
          journeyRealmImagery={activeRealm?.poetryImagery}
          journeyRealmId={activeRealm?.id}
          journeyStoryText={activeJourney?.storyText}
          journeyActive={journeyActive}
          journeyBrowsing={journeyOpen}
          journeyName={activeJourney?.name ?? null}
          onStopJourney={() => {
            if (useAudioStore.getState().activeJourney) {
              // Stop journey but stay on / open the journey browser
              useAudioStore.getState().stopJourney();
              setJourneyOpen(true);
            } else {
              // No active journey — close browser, return to viz
              setJourneyOpen(false);
            }
          }}
          onShareJourney={journeyActive ? handleShareJourney : undefined}
          isFullscreen={isFullscreen}
          onFullscreenToggle={handleFullscreenToggle}
          onSwitchToVisualize={handleSwitchToVisualize}
          journeyAccent={activeRealm?.palette.accent ?? null}
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

      {/* Dark scrim over ambient viz — fades out when track starts */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          zIndex: 5,
          backgroundColor: "rgba(0,0,0,0.75)",
          opacity: (!currentTrack && !journeyActive && !installationMode) ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      {/* Welcome overlay — shown when no track and no journey */}
      {!currentTrack && !journeyActive && !installationMode && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 6, pointerEvents: "none" }}
        >
          <div className="text-center max-w-lg px-8" style={{ pointerEvents: "auto" }}>
            <h1
              className="text-white/90 mb-4"
              style={{
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 100,
                fontSize: "3.2rem",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              The Room
            </h1>
            <p
              className="text-white/50 mb-10"
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.95rem",
                lineHeight: 1.7,
              }}
            >
              An immersive space for your music. Play a track
              from your library, or start a journey to experience
              AI-driven visuals, ambient soundscapes, and poetry.
            </p>
            <button
              onClick={handleEnterRoom}
              className="px-7 py-3.5 rounded-xl text-white transition-all"
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.9rem",
                border: "1px solid rgba(255,255,255,0.25)",
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.22)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.40)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
              }}
            >
              Enter
            </button>
          </div>
          {/* Back button */}
          <button
            onClick={handleExit}
            className="absolute top-6 left-6 p-2.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
            style={{ pointerEvents: "auto" }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Journey phase indicator — hidden in fullscreen/immersive mode and when browsing */}
      {journeyActive && activeJourney && !isFullscreen && !journeyOpen && (
        <JourneyPhaseIndicator
          journey={activeJourney}
          currentPhase={journeyPhase}
          guidancePhrase={guidancePhrase}
          guidancePhaseId={guidancePhaseId}
        />
      )}

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
    </div>
  );
}
