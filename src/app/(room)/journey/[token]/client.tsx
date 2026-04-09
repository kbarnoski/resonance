"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ShaderVisualizer, SHADERS, type VisualizerMode } from "@/components/audio/visualizer";
import { Visualizer3D, type Visualizer3DMode } from "@/components/audio/visualizer-3d";
import { JourneyCompositor } from "@/components/audio/journey-compositor";
import { JourneyPhaseIndicator } from "@/components/audio/journey-phase-indicator";
import { ShareSheet } from "@/components/ui/share-sheet";
import { getJourneyEngine } from "@/lib/journeys/journey-engine";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getRealtimeImageService } from "@/lib/journeys/realtime-image-service";
import { MODES_3D, MODES_AI } from "@/lib/shaders";
import type { Journey, JourneyFrame, JourneyPhaseId } from "@/lib/journeys/types";
import { Pause, Play, Volume2, VolumeX, Share2, Maximize2, Minimize2, SkipBack, SkipForward } from "lucide-react";

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

interface SharedJourneyClientProps {
  journey: Journey;
  audioUrl: string | null;
  shareToken: string;
  playbackSeed: string | null;
}

export function SharedJourneyClient({
  journey,
  audioUrl,
  shareToken,
  playbackSeed,
}: SharedJourneyClientProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array<ArrayBuffer> | null>(null);
  // Start with isPlaying=true when we have audio (auto-play). Events correct if blocked.
  const [isPlaying, setIsPlaying] = useState(!!audioUrl);
  const [muted, setMuted] = useState(false);
  const [journeyFrame, setJourneyFrame] = useState<JourneyFrame | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [shareSheet, setShareSheet] = useState(false);
  const [ended, setEnded] = useState(false);
  const animRef = useRef<number>(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);

  // Time display — direct DOM updates, no re-renders
  const timeDisplayRef = useRef<HTMLSpanElement>(null);
  const timeDisplayMobileRef = useRef<HTMLSpanElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Frame throttle
  const lastFrameTimeRef = useRef(0);
  const frameRef = useRef<JourneyFrame | null>(null);

  // Phase changes via engine callback
  // Phase guidance is now handled internally by JourneyPhaseIndicator

  // ─── Shader crossfade state (matching VisualizerCore) ───
  const shaderMode = journeyFrame?.shaderMode ?? journey.phases[0]?.shaderModes[0] ?? "cosmos";
  const [renderMode, setRenderMode] = useState<VisualizerMode>(shaderMode as VisualizerMode);
  const [prevRenderMode, setPrevRenderMode] = useState<VisualizerMode | null>(null);
  const crossfadeRef = useRef<number>(0);
  const prevModeRef = useRef(shaderMode);
  const prevLayerRef = useRef<HTMLDivElement>(null);
  const nextLayerRef = useRef<HTMLDivElement>(null);

  // Crossfade animation when shader mode changes (~1.5s ease-in-out)
  useEffect(() => {
    if (shaderMode !== prevModeRef.current) {
      cancelAnimationFrame(crossfadeRef.current);

      setPrevRenderMode(prevModeRef.current as VisualizerMode);
      setRenderMode(shaderMode as VisualizerMode);
      prevModeRef.current = shaderMode;

      // Start crossfade on next frame (after React renders the new layers)
      crossfadeRef.current = requestAnimationFrame(() => {
        let prevStartOpacity = prevLayerRef.current
          ? parseFloat(prevLayerRef.current.style.opacity || "1")
          : 1;
        if (isNaN(prevStartOpacity)) prevStartOpacity = 1;
        if (prevLayerRef.current && prevStartOpacity <= 0.01) {
          prevLayerRef.current.style.opacity = "1";
        }
        if (nextLayerRef.current) nextLayerRef.current.style.opacity = "0";

        let progress = 0;
        const animate = () => {
          progress = Math.min(1, progress + 0.011);
          const eased = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;

          const outOpacity = Math.max(0, (prevStartOpacity <= 0.01 ? 1 : prevStartOpacity) * (1 - eased));
          if (prevLayerRef.current) prevLayerRef.current.style.opacity = String(outOpacity);
          if (nextLayerRef.current) nextLayerRef.current.style.opacity = String(eased);

          if (progress < 1) {
            crossfadeRef.current = requestAnimationFrame(animate);
          } else {
            setPrevRenderMode(null);
          }
        };
        crossfadeRef.current = requestAnimationFrame(animate);
      });

      return () => cancelAnimationFrame(crossfadeRef.current);
    }
  }, [shaderMode]);

  // ─── Dual shader layer (peak journey moments) ───
  const [dualShaderVisible, setDualShaderVisible] = useState<string | null>(null);
  const dualShaderRef = useRef<HTMLDivElement>(null);
  const dualFadeRef = useRef<number>(0);

  const dualShaderTarget = journeyFrame?.dualShaderMode && SHADERS[journeyFrame.dualShaderMode as VisualizerMode]
    ? journeyFrame.dualShaderMode : null;

  useEffect(() => {
    if (dualShaderTarget) {
      setDualShaderVisible(dualShaderTarget);
      cancelAnimationFrame(dualFadeRef.current);
      let progress = 0;
      const fadeIn = () => {
        progress = Math.min(1, progress + 0.006);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        if (dualShaderRef.current) dualShaderRef.current.style.opacity = String(eased * 0.75);
        if (progress < 1) dualFadeRef.current = requestAnimationFrame(fadeIn);
      };
      dualFadeRef.current = requestAnimationFrame(() => {
        if (dualShaderRef.current) dualShaderRef.current.style.opacity = "0";
        dualFadeRef.current = requestAnimationFrame(fadeIn);
      });
    } else {
      cancelAnimationFrame(dualFadeRef.current);
      if (!dualShaderRef.current) {
        setDualShaderVisible(null);
        return;
      }
      const startOpacity = parseFloat(dualShaderRef.current.style.opacity || "0");
      if (startOpacity <= 0.001) {
        setDualShaderVisible(null);
        return;
      }
      let progress = 0;
      const fadeOut = () => {
        progress = Math.min(1, progress + 0.005); // ~200 frames (~3.3s) — gentle exit
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        if (dualShaderRef.current) dualShaderRef.current.style.opacity = String(startOpacity * (1 - eased));
        if (progress < 1) {
          dualFadeRef.current = requestAnimationFrame(fadeOut);
        } else {
          setDualShaderVisible(null);
        }
      };
      dualFadeRef.current = requestAnimationFrame(fadeOut);
    }
    return () => cancelAnimationFrame(dualFadeRef.current);
  }, [dualShaderTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Tertiary shader layer ───
  const [tertiaryShaderVisible, setTertiaryShaderVisible] = useState<string | null>(null);
  const tertiaryShaderRef = useRef<HTMLDivElement>(null);
  const tertiaryFadeRef = useRef<number>(0);

  const tertiaryShaderTarget = journeyFrame?.tertiaryShaderMode && SHADERS[journeyFrame.tertiaryShaderMode as VisualizerMode]
    ? journeyFrame.tertiaryShaderMode : null;

  useEffect(() => {
    if (tertiaryShaderTarget) {
      setTertiaryShaderVisible(tertiaryShaderTarget);
      cancelAnimationFrame(tertiaryFadeRef.current);
      let progress = 0;
      const fadeIn = () => {
        progress = Math.min(1, progress + 0.005);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        if (tertiaryShaderRef.current) tertiaryShaderRef.current.style.opacity = String(eased * 0.60);
        if (progress < 1) tertiaryFadeRef.current = requestAnimationFrame(fadeIn);
      };
      tertiaryFadeRef.current = requestAnimationFrame(() => {
        if (tertiaryShaderRef.current) tertiaryShaderRef.current.style.opacity = "0";
        tertiaryFadeRef.current = requestAnimationFrame(fadeIn);
      });
    } else {
      cancelAnimationFrame(tertiaryFadeRef.current);
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
        progress = Math.min(1, progress + 0.004); // ~250 frames (~4s) — very gentle exit
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
    return () => cancelAnimationFrame(tertiaryFadeRef.current);
  }, [tertiaryShaderTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);

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

  // Setup audio + analyser, auto-play
  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    const node = ctx.createAnalyser();
    node.fftSize = 256;

    async function init() {
      if (audioUrl) {
        try {
          const res = await fetch(audioUrl);
          const data = await res.json();
          if (cancelled) return;
          const resolvedUrl = data.url ?? audioUrl;

          const audio = new Audio(resolvedUrl);
          audio.crossOrigin = "anonymous";
          audioRef.current = audio;

          const source = ctx.createMediaElementSource(audio);
          source.connect(node);
          node.connect(ctx.destination);

          // Sync play state from audio element — source of truth
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
          });

          // Auto-play
          audio.addEventListener("canplay", () => {
            if (cancelled) return;
            audio.play().catch(() => {
              // Auto-play blocked by browser
              setIsPlaying(false);
            });
          }, { once: true });
        } catch {
          node.connect(ctx.destination);
          setIsPlaying(false);
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
  }, [audioUrl]);

  // Start journey engine + subscribe to phase changes
  useEffect(() => {
    // Fresh image budget for each shared journey
    getRealtimeImageService().resetSession();
    const engine = getJourneyEngine();
    const seed = playbackSeed ? parseInt(playbackSeed, 10) : undefined;
    const duration = useAudioStore.getState().duration;
    engine.start(journey, {
      ...(seed != null && !isNaN(seed) ? { seed } : {}),
      trackDuration: duration > 0 ? duration : undefined,
    });

    return () => {
      engine.stop();
    };
  }, [journey, playbackSeed]);

  // Animation loop — throttled frame updates matching main app
  const startTimeRef = useRef(Date.now());
  const JOURNEY_DURATION_MS = 5 * 60 * 1000;

  useEffect(() => {
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
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const seekBy = useCallback((offset: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + offset));
  }, []);

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
    if (isIOS) {
      setIsFullscreen((v) => !v);
      return;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => setIsFullscreen(false));
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        setIsFullscreen((v) => !v);
      });
    }
  }, [isIOS]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
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

  // ─── Shader layer renderer (matching VisualizerCore exactly) ───
  // Two-layer approach: outer for positioning, inner for crossfade opacity (animated via ref).
  // This prevents React style prop conflicts with rAF-driven opacity animation.
  const renderShaderLayer = (layerMode: VisualizerMode, zIndex: number, ref?: React.Ref<HTMLDivElement>, initialOpacity?: number) => {
    if (!analyser || !dataArray) return null;
    const layerIs3D = MODES_3D.has(layerMode);
    const layerIsAI = MODES_AI.has(layerMode);

    const outerStyle: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      zIndex,
      pointerEvents: "none",
    };

    const innerStyle: React.CSSProperties = {
      position: "absolute",
      inset: 0,
      opacity: initialOpacity !== undefined ? initialOpacity : 1,
    };

    if (layerIsAI) {
      const backdropMode = getAiBackdropShader(layerMode);
      const backdropFrag = SHADERS[backdropMode];
      if (backdropFrag) {
        return (
          <div key={layerMode} style={{ ...outerStyle, opacity: 0.6 }}>
            <div ref={ref} style={innerStyle}>
              <ShaderVisualizer analyser={analyser} dataArray={dataArray} fragShader={backdropFrag} smoothMotion />
            </div>
          </div>
        );
      }
      return <div key={layerMode} style={{ ...outerStyle, backgroundColor: "#000" }}><div ref={ref} style={innerStyle} /></div>;
    }
    if (layerIs3D) {
      return (
        <div key={layerMode} style={outerStyle}>
          <div ref={ref} style={innerStyle}>
            <Visualizer3D analyser={analyser} dataArray={dataArray} mode={layerMode as Visualizer3DMode} />
          </div>
        </div>
      );
    }
    const frag = SHADERS[layerMode];
    if (!frag) return <div key={layerMode} style={{ ...outerStyle, backgroundColor: "#000" }}><div ref={ref} style={innerStyle} /></div>;
    return (
      <div key={layerMode} style={outerStyle}>
        <div ref={ref} style={innerStyle}>
          <ShaderVisualizer analyser={analyser} dataArray={dataArray} fragShader={frag} smoothMotion />
        </div>
      </div>
    );
  };

  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/journey/${shareToken}`;

  return (
    <div className="h-dvh w-screen overflow-hidden bg-black relative">
      {analyser && dataArray && (
        <JourneyCompositor
          frame={journeyFrame}
          audioAmplitude={audioFeatures.amplitude}
          audioBass={audioFeatures.bass}
          aiEnabled={journey.aiEnabled}
          aiGenerating={!ended}
          promptSeed={playbackSeed ? parseInt(playbackSeed, 10) : undefined}
          journeyId={journey.id}
        >
          {/* Previous shader (fading out during crossfade) */}
          {prevRenderMode && renderShaderLayer(prevRenderMode, 0, prevLayerRef)}

          {/* Current shader (fading in, or full opacity when no crossfade) */}
          {/* During crossfade: start at opacity 0 to prevent one-frame flash */}
          {renderShaderLayer(renderMode, 1, prevRenderMode ? nextLayerRef : undefined, prevRenderMode ? 0 : undefined)}

          {/* Dual shader — second layer during peak journey moments */}
          {dualShaderVisible && SHADERS[dualShaderVisible as VisualizerMode] && (
            <div ref={dualShaderRef} style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0, mixBlendMode: "screen" }}>
              <ShaderVisualizer
                analyser={analyser}
                dataArray={dataArray}
                fragShader={SHADERS[dualShaderVisible as VisualizerMode]!}
                smoothMotion
              />
            </div>
          )}

          {/* Tertiary shader — third layer for rich multi-shader moments */}
          {tertiaryShaderVisible && SHADERS[tertiaryShaderVisible as VisualizerMode] && (
            <div ref={tertiaryShaderRef} style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0, mixBlendMode: "screen" }}>
              <ShaderVisualizer
                analyser={analyser}
                dataArray={dataArray}
                fragShader={SHADERS[tertiaryShaderVisible as VisualizerMode]!}
                smoothMotion
              />
            </div>
          )}
        </JourneyCompositor>
      )}

      {/* Phase indicator — same component as main app */}
      <JourneyPhaseIndicator
        journey={journey}
        currentPhase={journeyFrame?.phase as JourneyPhaseId ?? null}
      />

      {/* Fullscreen toggle — top-right (matching main app) */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-6 right-6 flex items-center justify-center p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
        style={{
          zIndex: 10,
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      </button>

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
          {/* LEFT: Journey name pill */}
          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span
                className="text-white/70 truncate"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-geist-mono)",
                  maxWidth: "200px",
                }}
              >
                {journey.name}
              </span>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* CENTER: Transport + time */}
          <div className="flex items-center gap-1">
            {audioUrl && (
              <>
                <button
                  onClick={() => seekBy(-10)}
                  className="flex items-center justify-center p-2 text-white/40 hover:text-white/80 transition-colors duration-75"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={togglePlay}
                  className="flex items-center justify-center p-2 text-white/80 hover:text-white transition-colors duration-75"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" fill="currentColor" />
                  ) : (
                    <Play className="h-4 w-4" fill="currentColor" />
                  )}
                </button>
                <button
                  onClick={() => seekBy(10)}
                  className="flex items-center justify-center p-2 text-white/40 hover:text-white/80 transition-colors duration-75"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <span
              ref={timeDisplayRef}
              className="text-white/30"
              style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
            >
              0:00 / 0:00
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-[2]" />

          {/* RIGHT: Share + mute */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
              style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}
              title="Share Journey"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
            {audioUrl && (
              <button
                onClick={toggleMute}
                className="flex items-center justify-center p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile bar */}
        <div
          className="room-bar-mobile flex-col"
          style={{ background: "#000", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {/* Row 1: Journey name */}
          <div className="flex items-center justify-between px-3" style={{ height: "32px" }}>
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg min-w-0"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span
                  className="text-white/70 truncate"
                  style={{
                    fontSize: "0.68rem",
                    fontFamily: "var(--font-geist-mono)",
                    maxWidth: "180px",
                  }}
                >
                  {journey.name}
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Transport + actions */}
          <div className="flex items-center justify-between px-2" style={{ height: "44px" }}>
            {/* Left: transport */}
            <div className="flex items-center">
              {audioUrl && (
                <>
                  <button
                    onClick={() => seekBy(-10)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/80 transition-colors duration-75"
                  >
                    <SkipBack className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white transition-colors duration-75"
                  >
                    {isPlaying ? (
                      <Pause className="h-4.5 w-4.5" fill="currentColor" />
                    ) : (
                      <Play className="h-4.5 w-4.5" fill="currentColor" />
                    )}
                  </button>
                  <button
                    onClick={() => seekBy(10)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/80 transition-colors duration-75"
                  >
                    <SkipForward className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>

            {/* Center: time */}
            <span
              ref={timeDisplayMobileRef}
              className="text-white/25 flex-shrink-0"
              style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
            >
              0:00 / 0:00
            </span>

            {/* Right: share + mute */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={handleShare}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition-colors duration-75"
                title="Share"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {audioUrl && (
                <button
                  onClick={toggleMute}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/50 hover:text-white/80 transition-colors duration-75"
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar — thin overlay at the very bottom of the bar */}
      <div
        className="absolute bottom-0 inset-x-0 cursor-pointer"
        style={{ zIndex: 11, height: "24px", display: "flex", alignItems: "flex-end" }}
        onClick={handleProgressClick}
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

      {/* CTA — top left */}
      <div
        className="absolute top-6 left-6 z-20"
        style={{
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 0.4s ease",
          fontSize: "0.65rem",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="text-white/20 hover:text-white/40 transition-colors">
          Listen on Resonance
        </a>
      </div>

      {/* Share sheet — same component as main app */}
      <ShareSheet
        open={shareSheet}
        onClose={() => setShareSheet(false)}
        url={shareUrl}
        title={`${journey.name} — Resonance`}
        text={`Check out ${journey.name} on Resonance`}
      />
    </div>
  );
}
