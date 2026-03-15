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
import { useJourney } from "@/lib/journeys/use-journey";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
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

  // Journey system
  const { frame: journeyFrame, active: journeyActive, phase: journeyPhase } = useJourney();
  const audioFeaturesRef = useRef({ bass: 0, mid: 0, treble: 0, amplitude: 0 });

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
  const [hudVisible, setHudVisible] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [tonnetzVisible, setTonnetzVisible] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Installation mode auto-cycling
  useInstallationMode();

  // Visualizer config ref (for share)
  const configRef = useRef<{ mode: VisualizerMode; poetryEnabled: boolean; whisperEnabled: boolean } | null>(null);

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
      poetryEnabled: config.poetryEnabled,
      whisperEnabled: config.whisperEnabled,
      hudVisible,
    };
    const token = btoa(JSON.stringify(payload))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const url = `${window.location.origin}/room/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      // Brief visual feedback — could be a toast, but we'll keep it simple
    });
  }, [hudVisible]);

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
    return () => closeRoom();
  }, [openRoom, closeRoom]);

  // Auto-hide controls after inactivity
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      if (!libraryOpen) setControlsVisible(false);
    }, 4000);
  }, [libraryOpen]);

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

  // Keep controls visible when library is open
  useEffect(() => {
    if (libraryOpen) setControlsVisible(true);
  }, [libraryOpen]);

  // Initialize: connect to the global audio engine's AnalyserNode
  useEffect(() => {
    try {
      const engine = getAudioEngine();
      setAnalyser(engine.analyserNode);
      setDataArray(new Uint8Array(engine.analyserNode.frequencyBinCount));
    } catch {
      // SSR guard
    }
  }, [currentTrack]);

  // If opened via direct URL (/visualizer?recording=X) and this track isn't already
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

  // Auto-open library when no track is loaded so users see featured content
  useEffect(() => {
    if (recording || useAudioStore.getState().currentTrack) return;
    // Small delay to let the UI settle
    const t = setTimeout(() => setLibraryOpen(true), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

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

  const handleExit = useCallback(() => {
    const track = useAudioStore.getState().currentTrack;
    if (track) {
      // Navigate to the current track's detail page so WaveSurfer syncs
      router.push(`/recording/${track.id}`);
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

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case "Escape":
          if (libraryOpen) setLibraryOpen(false);
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
          seekBy(-10);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekBy(10);
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleExit, libraryOpen, togglePlayPause, seekBy]);

  // Show HUD when analysis is available and completed
  const showHud = activeAnalysis?.status === "completed";

  if (!analyser || !dataArray) return null;

  const showViz = !!(currentTrack || journeyActive || isAiOnlyMode);

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
          showLiveButton={hasSpeechApi}
          hudVisible={hudVisible}
          onHudToggle={() => setHudVisible((v) => !v)}
          showHudButton={showHud}
          libraryOpen={libraryOpen}
          onLibraryToggle={() => setLibraryOpen((v) => !v)}
          showLibraryButton={true}
          sectionFlash={sectionFlash}
          tonnetzVisible={tonnetzVisible}
          onTonnetzToggle={() => setTonnetzVisible((v) => !v)}
          onShareRoom={handleShareRoom}
          onJourneyToggle={() => setJourneyOpen((v) => !v)}
          showJourneyButton={true}
          showTransport={true}
          controlsVisible={controlsVisible}
          configRef={configRef}
          journeyShaderMode={journeyFrame?.shaderMode}
          journeyPhase={journeyFrame?.phase}
          journeyVoice={journeyFrame?.voice}
          journeyPoetryInterval={journeyFrame?.poetryIntervalSeconds}
          journeyPoetryMood={journeyFrame?.poetryMood}
          journeyRealmImagery={activeRealm?.poetryImagery}
          journeyRealmId={activeRealm?.id}
        >
          {/* Analysis HUD — top layer */}
          {hudVisible && showHud && (
            <AnalysisHUD
              analysis={activeAnalysis}
              currentTime={currentTime}
              duration={duration}
              onSectionChange={handleSectionChange}
            />
          )}

          {tonnetzVisible && activeAnalysis?.notes && activeAnalysis?.chords && (
            <TonnetzOverlay
              notes={activeAnalysis.notes}
              chords={activeAnalysis.chords}
              currentTime={currentTime}
            />
          )}
        </VisualizerCore>
      </JourneyCompositor>}

      {/* Welcome overlay — shown when no track and no journey */}
      {!currentTrack && !journeyActive && !installationMode && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 6, pointerEvents: "none" }}
        >
          <div className="text-center max-w-md px-8" style={{ pointerEvents: "auto" }}>
            <h1
              className="text-white/80 mb-3"
              style={{
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 100,
                fontSize: "2.4rem",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              The Room
            </h1>
            <p
              className="text-white/30 mb-8"
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.8rem",
                lineHeight: 1.6,
              }}
            >
              An immersive space for your music. Play a track
              from your library, or start a journey to experience
              AI-driven visuals, ambient soundscapes, and poetry.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setLibraryOpen(true)}
                className="px-5 py-2.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.8rem",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                Browse Library
              </button>
              <button
                onClick={() => setJourneyOpen(true)}
                className="px-5 py-2.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  fontSize: "0.8rem",
                  border: "1px solid rgba(255,255,255,0.15)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                Start a Journey
              </button>
            </div>
            <div
              className="mt-10 flex flex-col gap-2 text-left"
              style={{
                fontFamily: "var(--font-geist-mono)",
                fontSize: "0.65rem",
                color: "rgba(255,255,255,0.2)",
              }}
            >
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-16 text-right">space</span>
                <span>Play / Pause</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-16 text-right">l</span>
                <span>Open Library</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/30 w-16 text-right">h</span>
                <span>Analysis HUD</span>
              </div>
            </div>
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

      {/* Journey phase indicator */}
      {journeyActive && activeJourney && (
        <JourneyPhaseIndicator
          journey={activeJourney}
          currentPhase={journeyPhase}
        />
      )}

      {/* Live listening indicator */}
      {liveEnabled && (
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

      {/* Empty state — no track loaded */}
      {!currentTrack && !libraryOpen && !installationMode && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 15 }}
        >
          <div className="text-center">
            <p
              className="text-white/20 mb-2"
              style={{
                fontSize: "1.25rem",
                fontFamily: "var(--font-geist-sans)",
                fontWeight: 200,
                letterSpacing: "-0.01em",
              }}
            >
              The Room
            </p>
            <p
              className="text-white/10"
              style={{ fontSize: "0.7rem", fontFamily: "var(--font-geist-mono)" }}
            >
              Press L to open your library
            </p>
          </div>
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
    </div>
  );
}
