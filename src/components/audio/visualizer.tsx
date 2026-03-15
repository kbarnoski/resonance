"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { X, Type, AudioLines, ArrowLeft, Activity, Library, Hexagon, Share2, ChevronUp, Compass, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { getAudioEngine, ensureResumed } from "@/lib/audio/audio-engine";
import { detectVibe, type Mood } from "@/lib/audio/vibe-detection";
import type { VisualizerMode } from "@/lib/audio/vibe-detection";
import type { AnalysisResult } from "@/lib/audio/types";
import { PoetryOverlay } from "./poetry-overlay";
import { Visualizer3D, type Visualizer3DMode } from "./visualizer-3d";
import { useAudioStore } from "@/lib/audio/audio-store";
import { SHADERS, MODE_META, MODE_CATEGORIES, MODES_3D, MODES_AI } from "@/lib/shaders";
export type { VisualizerMode } from "@/lib/audio/vibe-detection";

// ─── Shared types ───

export interface VisualizerCoreProps {
  analyser: AnalyserNode;
  dataArray: Uint8Array<ArrayBuffer>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis?: any | null;
  defaultMood?: Mood;
  onExit: () => void;
  exitLabel: "back" | "close";
  liveText?: string | null;
  liveEnabled?: boolean;
  onLiveToggle?: () => void;
  showLiveButton?: boolean;
  hudVisible?: boolean;
  onHudToggle?: () => void;
  showHudButton?: boolean;
  libraryOpen?: boolean;
  onLibraryToggle?: () => void;
  showLibraryButton?: boolean;
  sectionFlash?: boolean;
  tonnetzVisible?: boolean;
  onTonnetzToggle?: () => void;
  onShareRoom?: () => void;
  onJourneyToggle?: () => void;
  showJourneyButton?: boolean;
  showTransport?: boolean;
  controlsVisible?: boolean;
  configRef?: React.MutableRefObject<{ mode: VisualizerMode; poetryEnabled: boolean; whisperEnabled: boolean } | null>;
  children?: React.ReactNode;
  /** Journey mode override — when set, shader mode comes from journey engine */
  journeyShaderMode?: string | null;
  /** Journey phase for poetry */
  journeyPhase?: string | null;
  /** Journey voice override */
  journeyVoice?: string | null;
  /** Journey poetry interval override */
  journeyPoetryInterval?: number | null;
  /** Journey poetry mood override */
  journeyPoetryMood?: Mood | null;
  /** Journey realm imagery for poetry prompts */
  journeyRealmImagery?: string | null;
  /** Journey realm ID for typography theming */
  journeyRealmId?: string | null;
}

interface VisualizerProps {
  audioElement: HTMLAudioElement | null;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis?: any | null;
}

const audioNodeCache = new WeakMap<
  HTMLAudioElement,
  { ctx: AudioContext; analyser: AnalyserNode }
>();

// ─── Shader code now lives in src/lib/shaders/ ───

// Inline shader code removed — now imported from src/lib/shaders/

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

function createShaderProgram(gl: WebGLRenderingContext, fragSource: string): WebGLProgram | null {
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vs, VERTEX_SHADER);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error("Vertex shader:", gl.getShaderInfoLog(vs));
    return null;
  }

  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fs, fragSource);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error("Fragment shader:", gl.getShaderInfoLog(fs));
    return null;
  }

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("Program link:", gl.getProgramInfoLog(prog));
    return null;
  }

  return prog;
}

// SHADERS, MODE_META, MODES_3D, MODE_CATEGORIES now imported from @/lib/shaders
export { SHADERS, MODE_META, MODE_CATEGORIES, MODES_3D } from "@/lib/shaders";

// ─── ShaderVisualizer (unchanged WebGL canvas) ───

export function ShaderVisualizer({
  analyser,
  dataArray,
  fragShader,
  style,
}: {
  analyser: AnalyserNode;
  dataArray: Uint8Array<ArrayBuffer>;
  fragShader: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothRef = useRef({ bass: 0, mid: 0, treble: 0, amplitude: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const program = createShaderProgram(gl, fragShader);
    if (!program) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uBass = gl.getUniformLocation(program, "u_bass");
    const uMid = gl.getUniformLocation(program, "u_mid");
    const uTreble = gl.getUniformLocation(program, "u_treble");
    const uAmplitude = gl.getUniformLocation(program, "u_amplitude");

    let animId: number;
    const startTime = performance.now();
    const SMOOTHING = 0.06;

    function render() {
      if (!canvas || !gl) return;
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      gl.viewport(0, 0, canvas.width, canvas.height);

      const time = (performance.now() - startTime) / 1000;

      analyser.getByteFrequencyData(dataArray);

      // Extract frequency bands
      let bassSum = 0, midSum = 0, trebleSum = 0, totalSum = 0;
      const len = dataArray.length; // 128 bins (fftSize=256)
      for (let i = 0; i < len; i++) {
        const v = dataArray[i];
        totalSum += v;
        if (i <= 5) bassSum += v;        // bins 0-5: ~0-860Hz
        else if (i <= 30) midSum += v;    // bins 6-30: ~860-5160Hz
        else if (i <= 63) trebleSum += v; // bins 31-63: ~5160-11kHz
      }
      const rawBass = bassSum / (6 * 255);
      const rawMid = midSum / (25 * 255);
      const rawTreble = trebleSum / (33 * 255);
      const rawAmplitude = totalSum / (len * 255);

      // Exponential smoothing
      const s = smoothRef.current;
      s.bass += (rawBass - s.bass) * SMOOTHING;
      s.mid += (rawMid - s.mid) * SMOOTHING;
      s.treble += (rawTreble - s.treble) * SMOOTHING;
      s.amplitude += (rawAmplitude - s.amplitude) * SMOOTHING;

      gl.useProgram(program);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uBass, s.bass);
      gl.uniform1f(uMid, s.mid);
      gl.uniform1f(uTreble, s.treble);
      gl.uniform1f(uAmplitude, s.amplitude);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyser, dataArray, fragShader]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={style}
    />
  );
}

function formatTime(s: number): string {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── VisualizerCore — shared component, does NOT know if it's modal or route ───

export function VisualizerCore({
  analyser,
  dataArray,
  analysis,
  defaultMood,
  onExit,
  exitLabel,
  liveText,
  liveEnabled,
  onLiveToggle,
  showLiveButton,
  hudVisible,
  onHudToggle,
  showHudButton,
  libraryOpen,
  onLibraryToggle,
  showLibraryButton,
  sectionFlash,
  tonnetzVisible,
  onTonnetzToggle,
  onShareRoom,
  onJourneyToggle,
  showJourneyButton,
  showTransport,
  controlsVisible = true,
  configRef,
  children,
  journeyShaderMode,
  journeyPhase,
  journeyVoice,
  journeyPoetryInterval,
  journeyPoetryMood,
  journeyRealmImagery,
  journeyRealmId,
}: VisualizerCoreProps) {
  // Viz settings from store — persist across open/close
  const storeMode = useAudioStore((s) => s.vizMode) as VisualizerMode;
  // When journey is active, mode comes from journey engine
  const mode = (journeyShaderMode as VisualizerMode) ?? storeMode;

  // Derive typography theme: realm ID for journeys, shader category for viz-only
  const typographyTheme = journeyRealmId
    ?? MODE_META.find((m) => m.mode === mode)?.category
    ?? null;
  const poetryEnabled = useAudioStore((s) => s.vizPoetry);
  const whisperEnabled = useAudioStore((s) => s.vizWhisper);
  const setMode = useAudioStore((s) => s.setVizMode);
  const setPoetryEnabled = useAudioStore((s) => s.setVizPoetry);
  const setWhisperEnabled = useAudioStore((s) => s.setVizWhisper);

  const installationMode = useAudioStore((s) => s.installationMode);

  // Transport state — only read when transport is shown
  const currentTrack = useAudioStore((s) => showTransport ? s.currentTrack : null);
  const isPlaying = useAudioStore((s) => showTransport ? s.isPlaying : false);
  const currentTime = useAudioStore((s) => showTransport ? s.currentTime : 0);
  const duration = useAudioStore((s) => showTransport ? s.duration : 0);
  const storePause = useAudioStore((s) => s.pause);
  const storeResume = useAudioStore((s) => s.resume);
  const storeSeek = useAudioStore((s) => s.seek);

  const progress = showTransport && duration > 0 ? currentTime / duration : 0;

  const seekBy = useCallback((offset: number) => {
    if (!showTransport) return;
    const engine = getAudioEngine();
    const audio = engine.audioElement;
    const newTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + offset));
    audio.currentTime = newTime;
    storeSeek(newTime);
  }, [showTransport, storeSeek]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!showTransport || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    const engine = getAudioEngine();
    engine.audioElement.currentTime = newTime;
    storeSeek(newTime);
  }, [showTransport, duration, storeSeek]);

  const [vibe, setVibe] = useState<Mood | null>(defaultMood ?? null);
  const [modePaletteOpen, setModePaletteOpen] = useState(false);

  // Fade-to-black transition when viz mode changes
  const [fadeActive, setFadeActive] = useState(false);
  const [renderMode, setRenderMode] = useState<VisualizerMode>(mode);
  const prevModeRef = useRef(mode);

  useEffect(() => {
    if (mode !== prevModeRef.current) {
      setFadeActive(true);
      // Switch actual mode at midpoint (1s in)
      const switchTimer = setTimeout(() => {
        setRenderMode(mode);
      }, 1000);
      // Clear fade after full duration (2s)
      const clearTimer = setTimeout(() => {
        setFadeActive(false);
      }, 2000);
      prevModeRef.current = mode;
      return () => {
        clearTimeout(switchTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [mode]);

  // Sync config ref for parent to read
  useEffect(() => {
    if (configRef) configRef.current = { mode, poetryEnabled, whisperEnabled };
  }, [configRef, mode, poetryEnabled, whisperEnabled]);

  // Detect vibe for poetry mood — never touches mode
  useEffect(() => {
    if (!analysis || analysis.status !== "completed") return;
    const result = detectVibe(analysis as AnalysisResult, analysis.summary);
    setVibe(result.mood);
  }, [analysis]);

  const is3D = MODES_3D.has(renderMode);
  const isAI = MODES_AI.has(renderMode);

  return (
    <>
      {isAI ? (
        /* AI-only mode: dark canvas background, no shader — AI image layer handles visuals */
        <div className="absolute inset-0 bg-black" />
      ) : is3D ? (
        <Visualizer3D
          analyser={analyser}
          dataArray={dataArray}
          mode={renderMode as Visualizer3DMode}
        />
      ) : (
        <ShaderVisualizer
          analyser={analyser}
          dataArray={dataArray}
          fragShader={SHADERS[renderMode]!}
        />
      )}

      {/* Fade-to-black transition overlay */}
      {fadeActive && (
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundColor: "#000",
            animation: "vizFadeTransition 2s ease-in-out forwards",
          }}
        />
      )}
      <style>{`
        @keyframes vizFadeTransition {
          0% { opacity: 0; }
          40% { opacity: 1; }
          60% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {poetryEnabled && (
        <PoetryOverlay
          mood={vibe ?? "flowing"}
          keySignature={analysis?.key_signature}
          tempo={analysis?.tempo}
          summary={analysis?.summary?.overview}
          whisperEnabled={whisperEnabled}
          liveText={liveText}
          liveEnabled={liveEnabled}
          phase={journeyPhase}
          voiceOverride={journeyVoice}
          intervalOverride={journeyPoetryInterval}
          moodOverride={journeyPoetryMood}
          realmImagery={journeyRealmImagery}
          typographyTheme={typographyTheme}
        />
      )}

      {/* Section flash overlay */}
      {sectionFlash && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at center, rgba(255,255,255,0.15) 0%, transparent 70%)",
            animation: "sectionFlashPulse 800ms ease-out forwards",
          }}
        />
      )}

      {children}

      {/* ─── Mode palette + controls — hidden in installation mode ─── */}
      {!installationMode && modePaletteOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setModePaletteOpen(false)}
          />
          <div
            className="absolute bottom-16 left-4 z-40 p-4 rounded-xl max-h-[70vh] overflow-y-auto scrollbar-thin"
            style={{
              backdropFilter: "blur(24px) saturate(1.3)",
              WebkitBackdropFilter: "blur(24px) saturate(1.3)",
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            {MODE_CATEGORIES.map((category) => {
              const categoryModes = MODE_META.filter((m) => m.category === category);
              if (categoryModes.length === 0) return null;
              return (
                <div key={category} className="mb-3 last:mb-0">
                  <p
                    className="text-white/30 mb-2"
                    style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                  >
                    {category}
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {categoryModes.map(({ mode: m, label }) => (
                      <button
                        key={m}
                        onClick={() => { setMode(m); setModePaletteOpen(false); }}
                        className={`flex flex-col items-center gap-1 rounded-lg px-3 py-2 transition-all ${
                          mode === m
                            ? "bg-white/15 text-white"
                            : "text-white/50 hover:bg-white/8 hover:text-white/80"
                        }`}
                      >
                        <span style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)" }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Bottom control bar ─── */}
      {!installationMode && <div
        className="absolute inset-x-0 bottom-0 transition-opacity duration-500 ease-out"
        style={{
          zIndex: 10,
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        {/* Progress bar — 2px, full width, top edge */}
        {showTransport && currentTrack && (
          <div
            className="h-[2px] cursor-pointer overflow-hidden"
            onClick={handleProgressClick}
          >
            <div
              className="h-full transition-all duration-300 ease-linear"
              style={{
                width: `${progress * 100}%`,
                background: "linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.5) 100%)",
              }}
            />
          </div>
        )}

        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)",
          }}
        >
          <div className="flex items-center gap-1.5">
            {/* Mode picker */}
            <button
              onClick={() => setModePaletteOpen((v) => !v)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 transition-all ${
                modePaletteOpen ? "bg-white/15 text-white" : "bg-black/40 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-geist-mono)" }}>
                {MODE_META.find(m => m.mode === mode)?.label ?? "Mandala"}
              </span>
              <ChevronUp className={`h-3.5 w-3.5 transition-transform ${modePaletteOpen ? "rotate-180" : ""}`} />
            </button>

            <div className="w-px h-5 bg-white/10 mx-1" />

            {/* Toggle buttons — icon only */}
            <button
              onClick={() => { if (poetryEnabled) setWhisperEnabled(false); setPoetryEnabled(!poetryEnabled); }}
              className={`p-2.5 rounded-lg transition-colors ${poetryEnabled ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}
              title="Poetry"
            >
              <Type className="h-4 w-4" />
            </button>
            {poetryEnabled && (
              <button
                onClick={() => setWhisperEnabled(!whisperEnabled)}
                className={`p-2.5 rounded-lg transition-colors ${whisperEnabled ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}
                title="Whisper"
              >
                <AudioLines className="h-4 w-4" />
              </button>
            )}
            {showLiveButton && onLiveToggle && (
              <button
                onClick={onLiveToggle}
                className={`p-2.5 rounded-lg transition-colors ${liveEnabled ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}
                title="Live"
              >
                <AudioLines className="h-4 w-4" />
              </button>
            )}
            {showHudButton && onHudToggle && (
              <button
                onClick={onHudToggle}
                className={`p-2.5 rounded-lg transition-colors ${hudVisible ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}
                title="HUD"
              >
                <Activity className="h-4 w-4" />
              </button>
            )}
            {showLibraryButton && onLibraryToggle && (
              <button
                onClick={onLibraryToggle}
                className={`p-2.5 rounded-lg transition-colors ${libraryOpen ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}
                title="Library"
              >
                <Library className="h-4 w-4" />
              </button>
            )}
            {onTonnetzToggle && (
              <button
                onClick={onTonnetzToggle}
                className={`p-2.5 rounded-lg transition-colors ${tonnetzVisible ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"}`}
                title="Tonnetz"
              >
                <Hexagon className="h-4 w-4" />
              </button>
            )}
            {showJourneyButton && onJourneyToggle && (
              <button
                onClick={onJourneyToggle}
                className="p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                title="Journeys"
              >
                <Compass className="h-4 w-4" />
              </button>
            )}
            {onShareRoom && (
              <button
                onClick={onShareRoom}
                className="p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                title="Share Room"
              >
                <Share2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Transport controls — only when showTransport + track loaded */}
          {showTransport && currentTrack && (
            <div className="flex items-center gap-3">
              <span
                className="text-white/70 text-sm truncate max-w-[160px]"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                {currentTrack.title}
              </span>
              <span
                className="text-white/30"
                style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => seekBy(-10)}
                  className="p-1.5 text-white/40 hover:text-white/70 transition-colors"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    ensureResumed();
                    isPlaying ? storePause() : storeResume();
                  }}
                  className="p-2 text-white/80 hover:text-white transition-colors"
                >
                  {isPlaying ? (
                    <Pause className="h-4.5 w-4.5" fill="currentColor" />
                  ) : (
                    <Play className="h-4.5 w-4.5" fill="currentColor" />
                  )}
                </button>
                <button
                  onClick={() => seekBy(10)}
                  className="p-1.5 text-white/40 hover:text-white/70 transition-colors"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <button
            onClick={onExit}
            className="p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
            title={exitLabel === "back" ? "Back" : "Close"}
          >
            {exitLabel === "back" ? (
              <ArrowLeft className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>}
    </>
  );
}

// ─── Visualizer (modal wrapper, used by recording-detail) ───

export function Visualizer({ audioElement, onClose, analysis }: VisualizerProps) {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [dataArray, setDataArray] = useState<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    if (!audioElement) return;

    const cached = audioNodeCache.get(audioElement);
    if (cached) {
      if (cached.ctx.state === "suspended") cached.ctx.resume();
      setAnalyser(cached.analyser);
      setDataArray(new Uint8Array(cached.analyser.frequencyBinCount));
      return;
    }

    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audioElement);
    const analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    analyserNode.connect(ctx.destination);

    audioNodeCache.set(audioElement, { ctx, analyser: analyserNode });
    setAnalyser(analyserNode);
    setDataArray(new Uint8Array(analyserNode.frequencyBinCount));
  }, [audioElement]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {analyser && dataArray && (
        <VisualizerCore
          analyser={analyser}
          dataArray={dataArray}
          analysis={analysis}
          onExit={onClose}
          exitLabel="close"
        />
      )}
    </div>
  );
}
