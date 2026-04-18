"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { X, Type, AudioLines, Share2, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Pause, Play, SkipBack, SkipForward, BookOpen, Library, Globe, Search, Maximize2, Minimize2, LogOut, Mic, Volume2, VolumeX } from "lucide-react";
import { getAudioEngine, ensureResumed, type AnalyserLike } from "@/lib/audio/audio-engine";
import { detectVibe, type Mood } from "@/lib/audio/vibe-detection";
import type { VisualizerMode } from "@/lib/audio/vibe-detection";
import type { AnalysisResult } from "@/lib/audio/types";
import dynamic from "next/dynamic";
import { PoetryOverlay } from "./poetry-overlay";
import { StoryOverlay } from "./story-overlay";
import type { Visualizer3DMode } from "./visualizer-3d";

// Lazy-load Visualizer3D so three.js parse cost is deferred until a 3D shader
// is actually selected. Saves ~200-400ms parse time on first paint of /room
// on older hardware where the bundle is the bottleneck.
const Visualizer3D = dynamic(() => import("./visualizer-3d").then((m) => m.Visualizer3D), {
  ssr: false,
});
import { useAudioStore } from "@/lib/audio/audio-store";
import { SHADERS, MODE_META, MODE_CATEGORIES, MODES_3D, MODES_AI } from "@/lib/shaders";
import { getDeviceTier } from "@/lib/audio/device-tier";
// Performance monitor is now FPS-based, started/stopped by JourneyFeedback component
export type { VisualizerMode } from "@/lib/audio/vibe-detection";

// Ambient shaders used as backdrop underneath AI imagery modes
const AI_BACKDROP_SHADERS: VisualizerMode[] = [
  "fog", "nebula", "drift",
  "tide", "ember",
];

/** Consistent ~2.5s fade duration for all shader transitions (at 60fps) */
const SHADER_FADE_RATE = 0.0065;
const DUAL_SHADER_MAX_OPACITY = 0.85;
const TERTIARY_SHADER_MAX_OPACITY = 0.60;

/** Pick a deterministic backdrop shader for an AI mode */
function getAiBackdropShader(aiMode: string): VisualizerMode {
  let hash = 0;
  for (let i = 0; i < aiMode.length; i++) hash = (hash * 31 + aiMode.charCodeAt(i)) | 0;
  return AI_BACKDROP_SHADERS[Math.abs(hash) % AI_BACKDROP_SHADERS.length];
}

// ─── Shared types ───

export interface VisualizerCoreProps {
  analyser: AnalyserLike;
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
  configRef?: React.MutableRefObject<{ mode: VisualizerMode; textOverlayMode: "off" | "poetry" | "story"; whisperEnabled: boolean } | null>;
  children?: React.ReactNode;
  /** Journey mode override — when set, shader mode comes from journey engine */
  journeyShaderMode?: string | null;
  /** Optional second shader layered during peak journey moments */
  journeyDualShaderMode?: string | null;
  /** Optional third shader layered during peak journey moments */
  journeyTertiaryShaderMode?: string | null;
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
  /** Journey theme mood for typography theming (custom journeys) */
  journeyThemeMood?: string | null;
  /** Story text from custom journey for poetry context */
  journeyStoryText?: string | null;
  /** When true, simplify controls to journey-only actions */
  journeyActive?: boolean;
  /** When true, the journey browser is open */
  journeyBrowsing?: boolean;
  /** Name of the active journey (shown in stop button) */
  journeyName?: string | null;
  /** Callback to stop the active journey */
  onStopJourney?: () => void;
  /** Callback to share the active journey */
  onShareJourney?: () => void;
  /** Whether fullscreen/immersive mode is active */
  isFullscreen?: boolean;
  /** Toggle fullscreen/immersive mode */
  onFullscreenToggle?: () => void;
  /** Switch from journey mode back to pure visualize mode */
  onSwitchToVisualize?: () => void;
  /** Realm accent color for journey pill dot */
  journeyAccent?: string | null;
  /** When true, shaders use smooth sine waves instead of audio reactivity */
  smoothMotion?: boolean;
  /** Sign out handler */
  onSignOut?: () => void;
  /** Cycle to previous shader */
  onPrevShader?: () => void;
  /** Cycle to next shader */
  onNextShader?: () => void;
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

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "ru", label: "Русский" },
] as const;

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// createShaderProgram removed — compilation is now async inside ShaderVisualizer's
// rAF loop using KHR_parallel_shader_compile to avoid blocking the main thread.

// SHADERS, MODE_META, MODES_3D, MODE_CATEGORIES now imported from @/lib/shaders
export { SHADERS, MODE_META, MODE_CATEGORIES, MODES_3D } from "@/lib/shaders";

// ─── ShaderVisualizer (async WebGL compilation) ───
//
// Uses KHR_parallel_shader_compile to compile shaders without blocking
// the main thread. The rAF loop polls for completion status and only
// starts rendering once the program is ready. This prevents the 50-200ms
// freezes that caused visible glitches during shader crossfades.

export function ShaderVisualizer({
  analyser,
  dataArray,
  fragShader,
  style,
  smoothMotion = false,
  onReady,
}: {
  analyser: AnalyserLike;
  dataArray: Uint8Array<ArrayBuffer>;
  fragShader: string;
  style?: React.CSSProperties;
  /** When true, use smooth time-based motion instead of audio reactivity */
  smoothMotion?: boolean;
  /** Fires when the shader has compiled and rendered its first frame */
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smoothRef = useRef({ bass: 0, mid: 0, treble: 0, amplitude: 0 });
  const smoothMotionRef = useRef(smoothMotion);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Keep ref in sync without tearing down GL program
  useEffect(() => {
    smoothMotionRef.current = smoothMotion;
  }, [smoothMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // KHR_parallel_shader_compile: supported in Chrome 76+, Firefox 95+, Safari 15.4+.
    // With this extension, compileShader() and linkProgram() return immediately
    // and compilation happens on a GPU thread. We poll COMPLETION_STATUS_KHR
    // each frame to check if done, avoiding 50-200ms main thread freezes.
    const ext = gl.getExtension("KHR_parallel_shader_compile");

    // Start compilation — non-blocking when extension is available
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fragShader);
    gl.compileShader(fs);

    let animId: number;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let posLoc = -1;
    let uTime: WebGLUniformLocation | null = null;
    let uRes: WebGLUniformLocation | null = null;
    let uBass: WebGLUniformLocation | null = null;
    let uMid: WebGLUniformLocation | null = null;
    let uTreble: WebGLUniformLocation | null = null;
    let uAmplitude: WebGLUniformLocation | null = null;

    let lastFrameTime = performance.now();
    let cumTime = 0;
    const SMOOTHING = 0.06;
    const REACTIVITY = 0.85;
    let lastW = 0;
    let lastH = 0;
    let compilePhase: "compiling" | "linking" | "ready" = "compiling";
    let readyFired = false;

    // Render-resolution scaling. Already capped at 1x DPR (retina is wasted on
    // soft fragment shaders). Older GPUs are still fragment-bound at 1x, so we
    // drop further on medium/low tier — the GPU upscales for free, and post-
    // bloom the softness is invisible.
    const tier = getDeviceTier();
    const tierScale = tier === "low" ? 0.55 : tier === "medium" ? 0.75 : 1.0;
    const dpr = Math.min(devicePixelRatio, 1) * tierScale;
    // Frame-rate cap on weak hardware — halves GPU work vs uncapped rAF. 30fps
    // still reads as "smooth" for abstract shader motion; 45fps on medium is a
    // gentle safety net for hardware that can't quite sustain 60.
    const minFrameMs = tier === "low" ? 1000 / 30 : tier === "medium" ? 1000 / 45 : 0;

    function render() {
      if (!canvas || !gl || gl.isContextLost()) return;

      const now = performance.now();
      // Skip frames under the cap — still request the next rAF to stay synced
      // with vsync, just skip the draw.
      if (minFrameMs > 0 && now - lastFrameTime < minFrameMs) {
        animId = requestAnimationFrame(render);
        return;
      }
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;
      cumTime += dt;
      const time = cumTime;

      // ── Async compilation state machine ──
      // Polls GPU compilation status each frame. Canvas stays blank/transparent
      // during compilation, which is invisible because the crossfade keeps the
      // old shader at full opacity until we signal onReady.
      if (compilePhase === "compiling") {
        if (ext) {
          const vsReady = gl.getShaderParameter(vs, ext.COMPLETION_STATUS_KHR);
          const fsReady = gl.getShaderParameter(fs, ext.COMPLETION_STATUS_KHR);
          if (!vsReady || !fsReady) {
            animId = requestAnimationFrame(render);
            return; // Still compiling on GPU thread, try next frame
          }
        }
        // Compilation finished (or was synchronous without ext) — check status.
        // On failure, signal readiness anyway so the crossfade layer can fall
        // back. Without this the canvas stays blank indefinitely.
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
          console.warn("[shader] Vertex compile failed:", gl.getShaderInfoLog(vs));
          onReadyRef.current?.();
          return;
        }
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
          console.warn("[shader] Fragment compile failed:", gl.getShaderInfoLog(fs));
          onReadyRef.current?.();
          return;
        }
        // Start linking (non-blocking with ext)
        program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        compilePhase = "linking";
        if (ext) {
          animId = requestAnimationFrame(render);
          return; // Poll for link completion next frame
        }
        // Without ext, linkProgram was synchronous — fall through
      }

      if (compilePhase === "linking") {
        if (ext) {
          if (!gl.getProgramParameter(program!, ext.COMPLETION_STATUS_KHR)) {
            animId = requestAnimationFrame(render);
            return; // Still linking on GPU thread
          }
        }
        if (!gl.getProgramParameter(program!, gl.LINK_STATUS)) {
          console.error("Program link:", gl.getProgramInfoLog(program!));
          return;
        }
        // Set up vertex buffer and attribute
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        posLoc = gl.getAttribLocation(program!, "a_position");
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        // Cache uniform locations
        uTime = gl.getUniformLocation(program!, "u_time");
        uRes = gl.getUniformLocation(program!, "u_resolution");
        uBass = gl.getUniformLocation(program!, "u_bass");
        uMid = gl.getUniformLocation(program!, "u_mid");
        uTreble = gl.getUniformLocation(program!, "u_treble");
        uAmplitude = gl.getUniformLocation(program!, "u_amplitude");
        compilePhase = "ready";
      }

      if (compilePhase !== "ready") {
        animId = requestAnimationFrame(render);
        return;
      }

      // Signal readiness on the first rendered frame — triggers crossfade start
      if (!readyFired) {
        readyFired = true;
        onReadyRef.current?.();
      }

      // ── Normal rendering ──
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (w !== lastW || h !== lastH) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        lastW = w;
        lastH = h;
      }

      const s = smoothRef.current;
      if (smoothMotionRef.current) {
        s.bass = 0.3 + 0.12 * Math.sin(time * 0.13);
        s.mid = 0.25 + 0.1 * Math.sin(time * 0.17 + 1.0);
        s.treble = 0.2 + 0.08 * Math.sin(time * 0.23 + 2.0);
        s.amplitude = 0.28 + 0.1 * Math.sin(time * 0.11 + 0.5);
      } else {
        analyser.getByteFrequencyData(dataArray);
        let bassSum = 0, midSum = 0, trebleSum = 0, totalSum = 0;
        const len = dataArray.length;
        for (let i = 0; i < len; i++) {
          const v = dataArray[i];
          totalSum += v;
          if (i <= 5) bassSum += v;
          else if (i <= 30) midSum += v;
          else if (i <= 63) trebleSum += v;
        }
        const rawBass = bassSum / (6 * 255);
        const rawMid = midSum / (25 * 255);
        const rawTreble = trebleSum / (33 * 255);
        const rawAmplitude = totalSum / (len * 255);
        s.bass += (rawBass - s.bass) * SMOOTHING;
        s.mid += (rawMid - s.mid) * SMOOTHING;
        s.treble += (rawTreble - s.treble) * SMOOTHING;
        s.amplitude += (rawAmplitude - s.amplitude) * SMOOTHING;
      }

      gl.useProgram(program!);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uBass, s.bass * REACTIVITY);
      gl.uniform1f(uMid, s.mid * REACTIVITY);
      gl.uniform1f(uTreble, s.treble * REACTIVITY);
      gl.uniform1f(uAmplitude, s.amplitude * REACTIVITY);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animId = requestAnimationFrame(render);
    }

    render();

    return () => {
      cancelAnimationFrame(animId);
      // Full GPU cleanup — prevent memory leaks across 15-20 shader switches per journey
      if (posLoc >= 0) gl.disableVertexAttribArray(posLoc);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // No canvas.width=0 — React unmounts the canvas element on mode change
      // (key={layerMode}), so zeroing dimensions just wastes GPU cycles on
      // framebuffer reallocation for a canvas that's about to be removed.
    };
  }, [analyser, dataArray, fragShader]); // smoothMotion + onReady read via refs

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
  journeyDualShaderMode,
  journeyTertiaryShaderMode,
  journeyPhase,
  journeyVoice,
  journeyPoetryInterval,
  journeyPoetryMood,
  journeyRealmImagery,
  journeyRealmId,
  journeyThemeMood,
  journeyStoryText,
  journeyActive,
  journeyBrowsing,
  journeyName,
  onStopJourney,
  onShareJourney,
  isFullscreen,
  onFullscreenToggle,
  onSwitchToVisualize,
  journeyAccent,
  smoothMotion: smoothMotionProp,
  onSignOut,
  onPrevShader,
  onNextShader,
}: VisualizerCoreProps) {
  // Viz settings from store — persist across open/close
  const storeMode = useAudioStore((s) => s.vizMode) as VisualizerMode;
  // When journey is active, mode comes from journey engine
  const mode = (journeyShaderMode as VisualizerMode) ?? storeMode;

  // Derive typography theme: realm ID for built-in journeys, theme mood for custom, shader category for viz-only
  const typographyTheme = journeyRealmId
    ?? journeyThemeMood
    ?? MODE_META.find((m) => m.mode === mode)?.category
    ?? null;
  const textOverlayMode = useAudioStore((s) => s.textOverlayMode);
  const poetryEnabled = textOverlayMode === "poetry";
  const storyEnabled = textOverlayMode === "story";
  const whisperEnabled = useAudioStore((s) => s.vizWhisper);
  const setMode = useAudioStore((s) => s.setVizMode);
  const setTextOverlayMode = useAudioStore((s) => s.setTextOverlayMode);
  const setWhisperEnabled = useAudioStore((s) => s.setVizWhisper);

  const installationMode = useAudioStore((s) => s.installationMode);

  const inJourneyMode = journeyActive || journeyBrowsing;

  // Completely skip the shader layer tree while the journey browser is open.
  // The old "depths" picker shader and dimmed-fade path are gone — UI-only
  // screens render against flat black. No WebGL work, no main-thread contention,
  // no fragment cost on weak hardware.
  const shadersHidden = journeyBrowsing;

  // Transport state — only read when transport is shown
  const currentTrack = useAudioStore((s) => showTransport ? s.currentTrack : null);
  const isPlaying = useAudioStore((s) => showTransport ? s.isPlaying : false);
  // Round to nearest second — only re-render when display changes, not 15x/sec.
  // The progress bar smoothness comes from CSS transitions, not React re-renders.
  const currentTime = useAudioStore((s) => showTransport ? Math.round(s.currentTime) : 0);
  const duration = useAudioStore((s) => s.duration);
  const storePause = useAudioStore((s) => s.pause);
  const storeResume = useAudioStore((s) => s.resume);
  const storeVolume = useAudioStore((s) => s.volume);
  const setStoreVolume = useAudioStore((s) => s.setVolume);
  const playNext = useAudioStore((s) => s.playNext);
  const playPrev = useAudioStore((s) => s.playPrev);
  const queue = useAudioStore((s) => s.queue);
  const queueIndex = useAudioStore((s) => s.queueIndex);

  const language = useAudioStore((s) => s.language);
  const setLanguage = useAudioStore((s) => s.setLanguage);

  const [vibe, setVibe] = useState<Mood | null>(defaultMood ?? null);
  const [modePaletteOpen, setModePaletteOpen] = useState(false);
  // Mute toggle: remember pre-mute volume so unmute restores it
  const preMuteVolumeRef = useRef(storeVolume > 0 ? storeVolume : 0.8);
  const isMuted = storeVolume === 0;
  const toggleMute = useCallback(() => {
    if (storeVolume === 0) {
      setStoreVolume(preMuteVolumeRef.current || 0.8);
    } else {
      preMuteVolumeRef.current = storeVolume;
      setStoreVolume(0);
    }
  }, [storeVolume, setStoreVolume]);
  const [modeSearch, setModeSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  // ── A/B buffer crossfade ──
  // Two persistent shader layers swap roles during transitions. The active layer
  // renders the current shader at full opacity. When mode changes, the INACTIVE
  // layer silently compiles the new shader (at opacity 0). Once ready, a rAF-based
  // crossfade swaps them. No React key remounting, no WebGL context destruction.
  const actualPrimaryMode = mode as VisualizerMode;
  const [layerAMode, setLayerAMode] = useState<VisualizerMode>(actualPrimaryMode);
  const [layerBMode, setLayerBMode] = useState<VisualizerMode | null>(null);
  const activeLayerRef = useRef<'a' | 'b'>('a');
  const layerADivRef = useRef<HTMLDivElement>(null);
  const layerBDivRef = useRef<HTMLDivElement>(null);
  const primaryFadeRef = useRef<number>(0);
  const primaryPrevModeRef = useRef(actualPrimaryMode);
  // Callback refs: set initial opacity exactly once on mount (survives React re-renders)
  const setLayerARef = useCallback((el: HTMLDivElement | null) => {
    layerADivRef.current = el;
    if (el) el.style.opacity = "1";
  }, []);
  const setLayerBRef = useCallback((el: HTMLDivElement | null) => {
    layerBDivRef.current = el;
    if (el) el.style.opacity = "0";
  }, []);

  // Dual shader A/B buffer — same persistent-layer pattern
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

  // ── A/B ready callbacks ──
  // Each layer signals readiness after async shader compilation. A crossfade only
  // starts when the correct layer (tracked by waitingForRef) reports ready.
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

  // Clear all crossfade timeouts on unmount to prevent stale callbacks
  // firing after the component is gone. Individual effects clear their
  // own timeouts when deps change, but unmount can happen mid-crossfade.
  useEffect(() => {
    return () => {
      clearTimeout(primaryReadyTimeoutRef.current);
      clearTimeout(dualReadyTimeoutRef.current);
      clearTimeout(tertiaryNextReadyTimeoutRef.current);
    };
  }, []);

  // Primary shader A/B crossfade — triggered when actualPrimaryMode changes
  // (from mode change, dimmed→undimmed transition, or journey shader switch)
  useEffect(() => {
    if (actualPrimaryMode === primaryPrevModeRef.current) return;
    primaryPrevModeRef.current = actualPrimaryMode;

    // Cancel any in-progress crossfade
    cancelAnimationFrame(primaryFadeRef.current);
    clearTimeout(primaryReadyTimeoutRef.current);
    primaryReadyCbRef.current = null;
    primaryWaitingForRef.current = null;

    const active = activeLayerRef.current;
    const inactive: 'a' | 'b' = active === 'a' ? 'b' : 'a';
    const activeDivRef = active === 'a' ? layerADivRef : layerBDivRef;
    const inactiveDivRef = inactive === 'a' ? layerADivRef : layerBDivRef;

    // Snap opacities: active stays visible, inactive stays hidden.
    // This handles interruptions — if a crossfade was at 50%, snap back cleanly.
    if (activeDivRef.current) activeDivRef.current.style.opacity = "1";
    if (inactiveDivRef.current) inactiveDivRef.current.style.opacity = "0";

    // Set new shader on the inactive layer (compiles in background at opacity 0)
    if (inactive === 'a') setLayerAMode(actualPrimaryMode);
    else setLayerBMode(actualPrimaryMode);

    // Crossfade animation — starts after inactive layer reports ready
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
  }, [actualPrimaryMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dual shader A/B crossfade — handles both shader-to-shader swaps and removal
  const dualShaderTarget = journeyDualShaderMode && SHADERS[journeyDualShaderMode as VisualizerMode]
    ? journeyDualShaderMode : null;

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

      // Set new shader on inactive layer
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

  // Tertiary shader layer — third layer for even richer visuals during journey moments
  const [tertiaryShaderVisible, setTertiaryShaderVisible] = useState<string | null>(null);
  const tertiaryShaderRef = useRef<HTMLDivElement>(null);
  const tertiaryFadeRef = useRef<number>(0);

  const tertiaryShaderTarget = journeyTertiaryShaderMode && SHADERS[journeyTertiaryShaderMode as VisualizerMode]
    ? journeyTertiaryShaderMode : null;

  useEffect(() => {
    if (tertiaryShaderTarget) {
      // Hide immediately via ref BEFORE React re-renders — prevents flash of black canvas
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

      // Wait for async compilation to finish before fading in
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

  // Sync config ref for parent to read
  useEffect(() => {
    if (configRef) configRef.current = { mode, textOverlayMode, whisperEnabled };
  }, [configRef, mode, textOverlayMode, whisperEnabled]);

  // Detect vibe for poetry mood — never touches mode
  useEffect(() => {
    if (!analysis || analysis.status !== "completed") return;
    const result = detectVibe(analysis as AnalysisResult, analysis.summary);
    setVibe(result.mood);
  }, [analysis]);

  // Renders shader content for a given mode — no wrapper divs, no React keys.
  // Used by A/B buffer layers which handle their own outer/inner wrappers.
  const renderLayerContent = (layerMode: VisualizerMode, onShaderReady?: () => void) => {
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
      <ShaderVisualizer analyser={analyser} dataArray={dataArray} fragShader={SHADERS[layerMode]!} smoothMotion={smoothMotionProp ?? false} onReady={onShaderReady} />
    ) : null;
  };

  return (
    <>
      {/* Shader layers — dimmed when journey browser is open */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1,
          transition: "opacity 1.5s ease-out",
          pointerEvents: "none",
        }}
      >
        {/* ── Primary shader: A/B buffer ──
            Two persistent layers swap roles. Only opacity changes — no remounting,
            no WebGL context destruction. Callback refs set initial opacity once. */}
        {!shadersHidden && (
          <>
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              opacity: (MODES_AI.has(layerAMode) ? "calc(var(--shader-opacity, 1) * 0.6)" : "var(--shader-opacity, 1)") as unknown as number,
            }}>
              <div ref={setLayerARef} style={{ position: "absolute", inset: 0 }}>
                {renderLayerContent(layerAMode, handleLayerAReady)}
              </div>
            </div>
            {layerBMode && (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                opacity: (MODES_AI.has(layerBMode) ? "calc(var(--shader-opacity, 1) * 0.6)" : "var(--shader-opacity, 1)") as unknown as number,
              }}>
                <div ref={setLayerBRef} style={{ position: "absolute", inset: 0 }}>
                  {renderLayerContent(layerBMode, handleLayerBReady)}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Dual shader: A/B buffer ──
            Same persistent-layer pattern. mixBlendMode: screen for overlay effect. */}
        {dualLayerAMode && SHADERS[dualLayerAMode as VisualizerMode] && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", opacity: "var(--shader-opacity, 1)" as unknown as number }}>
            <div ref={setDualLayerARef} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
              <ShaderVisualizer
                analyser={analyser}
                dataArray={dataArray}
                fragShader={SHADERS[dualLayerAMode as VisualizerMode]!}
                smoothMotion={smoothMotionProp ?? false}
                onReady={handleDualLayerAReady}
              />
            </div>
          </div>
        )}
        {dualLayerBMode && SHADERS[dualLayerBMode as VisualizerMode] && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", opacity: "var(--shader-opacity, 1)" as unknown as number }}>
            <div ref={setDualLayerBRef} style={{ position: "absolute", inset: 0, mixBlendMode: "screen" }}>
              <ShaderVisualizer
                analyser={analyser}
                dataArray={dataArray}
                fragShader={SHADERS[dualLayerBMode as VisualizerMode]!}
                smoothMotion={smoothMotionProp ?? false}
                onReady={handleDualLayerBReady}
              />
            </div>
          </div>
        )}

        {/* Tertiary shader — single layer with fade in/out (kept simple) */}
        {tertiaryShaderVisible && SHADERS[tertiaryShaderVisible as VisualizerMode] && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none", opacity: "var(--shader-opacity, 1)" as unknown as number }}>
            <div ref={tertiaryShaderRef} style={{ position: "absolute", inset: 0, opacity: 0, mixBlendMode: "screen" }}>
              <ShaderVisualizer
                analyser={analyser}
                dataArray={dataArray}
                fragShader={SHADERS[tertiaryShaderVisible as VisualizerMode]!}
                smoothMotion={smoothMotionProp ?? false}
                onReady={handleTertiaryShaderReady}
              />
            </div>
          </div>
        )}
      </div>

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
          isPlaying={isPlaying}
          storyContext={journeyStoryText}
        />
      )}

      {storyEnabled && (
        <StoryOverlay
          currentPhase={journeyPhase ?? null}
          whisperEnabled={whisperEnabled}
          voiceOverride={journeyVoice}
          language={language}
          isPlaying={isPlaying}
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
            className="hidden md:block fixed inset-0 z-30"
            onClick={() => { setModePaletteOpen(false); setModeSearch(""); }}
          />
          <div
            className="shader-picker-panel z-40 flex flex-col"
            style={{ backgroundColor: "#000" }}
          >
            {/* Search bar */}
            <div className="flex items-center gap-2 px-4 pt-4 md:pt-3 pb-2" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <Search className="h-4 w-4 md:h-3.5 md:w-3.5 text-white/30 flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="search"
                name="mode"
                autoComplete="off"
                value={modeSearch}
                onChange={(e) => setModeSearch(e.target.value)}
                placeholder="Search modes..."
                autoFocus
                className="bg-transparent text-white/80 placeholder-white/25 outline-none w-full"
                style={{ fontSize: "0.8rem", fontFamily: "var(--font-geist-mono)" }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setModePaletteOpen(false); setModeSearch(""); }
                }}
              />
              <button onClick={() => { setModePaletteOpen(false); setModeSearch(""); }} className="text-white/40 hover:text-white/70 md:hidden p-1">
                <X className="h-4 w-4" />
              </button>
              {modeSearch && (
                <button onClick={() => { setModeSearch(""); searchInputRef.current?.focus(); }} className="text-white/30 hover:text-white/60 hidden md:block">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Scrollable mode list */}
            <div className="overflow-y-auto scrollbar-thin p-3 flex-1">
              {MODE_CATEGORIES.map((category) => {
                const search = modeSearch.toLowerCase();
                const categoryModes = MODE_META.filter((m) => m.category === category && (!search || m.label.toLowerCase().includes(search)));
                if (categoryModes.length === 0) return null;
                const isCollapsed = !search && collapsedCategories.has(category);
                return (
                  <div key={category} className="mb-3 last:mb-0">
                    <button
                      onClick={() => {
                        if (search) return;
                        setCollapsedCategories((prev) => {
                          const next = new Set(prev);
                          if (next.has(category)) next.delete(category);
                          else next.add(category);
                          return next;
                        });
                      }}
                      className="flex items-center gap-1.5 mb-2 group w-full text-left"
                    >
                      <p
                        className="text-white/40 group-hover:text-white/50 transition-colors"
                        style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)", letterSpacing: "0.1em", textTransform: "uppercase" }}
                      >
                        {category}
                      </p>
                      <span className="text-white/30" style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)" }}>
                        {categoryModes.length}
                      </span>
                      {!search && (
                        isCollapsed
                          ? <ChevronDown className="h-3 w-3 text-white/20" />
                          : <ChevronUp className="h-3 w-3 text-white/20" />
                      )}
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
                        {categoryModes.map(({ mode: m, label }) => (
                          <button
                            key={m}
                            onClick={() => { setMode(m); setModePaletteOpen(false); setModeSearch(""); }}
                            className={`flex items-center justify-center rounded-md px-2 py-2.5 transition-all ${
                              mode === m
                                ? "bg-white/15 text-white"
                                : "text-white/50 hover:bg-white/8 hover:text-white/80"
                            }`}
                            style={{ minHeight: "40px" }}
                          >
                            <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-geist-mono)" }}>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ─── Fullscreen toggle — top-right corner (standard position) ─── */}
      {!installationMode && onFullscreenToggle && !journeyBrowsing && (currentTrack || journeyActive) && (
        <button
          onClick={onFullscreenToggle}
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
      )}

      {/* ─── Bottom control bar ─── */}
      {!installationMode && (currentTrack || journeyActive || journeyBrowsing) && <div
        className="absolute inset-x-0 bottom-0 transition-opacity duration-500 ease-out"
        style={{
          zIndex: 90,
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        {/* Subtle top separator — visible when journey selector is open */}
        <div
          className="h-px w-full"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 20%, rgba(255,255,255,0.08) 80%, transparent)" }}
        />

        {/* Desktop bar — full layout, unchanged */}
        <div
          className="room-bar-desktop items-center px-4"
          style={{
            background: "#000",
            height: "56px",
          }}
        >
          {/* LEFT: Mode Identity + Shader + Poetry/Voice */}
          <div className="flex items-center gap-1.5">
            {/* Mode switcher — segmented control */}
            {showJourneyButton && onJourneyToggle && (
              <div
                className="flex items-center rounded-lg"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <button
                  onClick={journeyActive ? undefined : onJourneyToggle}
                  className={`px-3 py-2 rounded-l-[7px] transition-colors duration-75 ${
                    inJourneyMode
                      ? "bg-white/10 text-white/90"
                      : "text-white/35 hover:text-white/60 hover:bg-white/10"
                  }`}
                  style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)", lineHeight: 1, cursor: journeyActive ? "default" : undefined }}
                >
                  Journeys
                </button>
                <button
                  onClick={inJourneyMode ? onSwitchToVisualize : undefined}
                  className={`px-3 py-2 rounded-r-[7px] transition-colors duration-75 ${
                    !inJourneyMode
                      ? "bg-white/10 text-white/90"
                      : "text-white/35 hover:text-white/60 hover:bg-white/10"
                  }`}
                  style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)", lineHeight: 1 }}
                >
                  Visualizations
                </button>
              </div>
            )}
            {/* Journey name pill with close */}
            {journeyActive && journeyName && (
              <div
                className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <button
                  onClick={onStopJourney}
                  className="flex-shrink-0 p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors duration-75"
                  title="End journey"
                >
                  <X className="h-3 w-3" />
                </button>
                <span
                  className="rounded-full flex-shrink-0"
                  style={{
                    width: "6px",
                    height: "6px",
                    backgroundColor: journeyAccent ?? "rgba(255,255,255,0.5)",
                  }}
                />
                <span
                  className="text-white/70 truncate"
                  style={{
                    fontSize: "0.72rem",
                    fontFamily: "var(--font-geist-mono)",
                    maxWidth: "140px",
                  }}
                >
                  {journeyName}
                </span>
              </div>
            )}
            {/* Shader picker — visualize mode only */}
            {!inJourneyMode && (
              <div className="flex items-center gap-1">
                {onPrevShader && (
                  <button
                    onClick={onPrevShader}
                    className="flex items-center justify-center rounded-lg p-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-75"
                    title="Previous shader"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setModePaletteOpen((v) => !v)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 transition-colors duration-75 ${
                    modePaletteOpen ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <span style={{ fontSize: "0.8rem", fontFamily: "var(--font-geist-mono)" }}>
                    {MODE_META.find(m => m.mode === mode)?.label ?? "Mandala"}
                  </span>
                  <ChevronUp className={`h-3.5 w-3.5 transition-transform ${modePaletteOpen ? "rotate-180" : ""}`} />
                </button>
                {onNextShader && (
                  <button
                    onClick={onNextShader}
                    className="flex items-center justify-center rounded-lg p-2 text-white/50 hover:text-white hover:bg-white/10 transition-colors duration-75"
                    title="Next shader"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Poetry + Voice + Language — viz mode only (hidden during journeys) */}
            {(!journeyActive && !inJourneyMode && currentTrack) && (
              <>
                <div className="w-px h-5 bg-white/10 mx-1" />
                <button
                  onClick={() => {
                    if (poetryEnabled || storyEnabled) {
                      setWhisperEnabled(false);
                      setTextOverlayMode("off");
                    } else {
                      setTextOverlayMode("poetry");
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors duration-75 ${poetryEnabled || storyEnabled ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/10"}`}
                  style={{ border: poetryEnabled || storyEnabled ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)" }}
                  title={poetryEnabled || storyEnabled ? "Poetry: On" : "Poetry: Off"}
                >
                  <Type className="h-3.5 w-3.5" />
                  <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}>
                    Poetry
                  </span>
                </button>
                <button
                  onClick={() => setWhisperEnabled(!whisperEnabled)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors duration-75 ${whisperEnabled ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/10"}`}
                  style={{
                    border: whisperEnabled ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)",
                    opacity: poetryEnabled || storyEnabled ? 1 : 0,
                    pointerEvents: poetryEnabled || storyEnabled ? "auto" : "none",
                    transition: "background-color 75ms, color 75ms, border-color 75ms, opacity 75ms",
                  }}
                  title={whisperEnabled ? "Voice: On" : "Voice: Off"}
                >
                  <AudioLines className="h-3.5 w-3.5" />
                  <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}>
                    Voice
                  </span>
                </button>
                {showLiveButton && onLiveToggle && !journeyActive && (
                  <button
                    onClick={onLiveToggle}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-75 ${liveEnabled ? "bg-red-500/20 text-red-400" : "text-white/50 hover:text-white/80 hover:bg-white/10"}`}
                    style={{
                      opacity: poetryEnabled || storyEnabled ? 1 : 0,
                      pointerEvents: poetryEnabled || storyEnabled ? "auto" : "none",
                      transition: "background-color 75ms, color 75ms, opacity 75ms",
                    }}
                    title={liveEnabled ? "Live: On" : "Live: Off"}
                  >
                    <Mic className={`h-3.5 w-3.5 ${liveEnabled ? "animate-pulse" : ""}`} />
                  </button>
                )}
                <div className="relative" style={{
                  opacity: poetryEnabled || storyEnabled ? 1 : 0,
                  pointerEvents: poetryEnabled || storyEnabled ? "auto" : "none",
                  transition: "opacity 75ms",
                }}>
                  <button
                    onClick={() => setLangPickerOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors duration-75 ${langPickerOpen ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/10"}`}
                    style={{ border: langPickerOpen ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)" }}
                    title="Language"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}>
                      Language
                    </span>
                  </button>
                  {langPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setLangPickerOpen(false)} />
                      <div
                        className="absolute bottom-12 left-0 z-40 py-2 rounded-xl overflow-hidden min-w-[140px]"
                        style={{
                          backgroundColor: "#000",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                        }}
                      >
                        {LANGUAGES.map((lang) => (
                          <button
                            key={lang.code}
                            onClick={() => { setLanguage(lang.code); setLangPickerOpen(false); }}
                            className={`w-full text-left px-4 py-1.5 transition-colors ${
                              language === lang.code
                                ? "text-white bg-white/10"
                                : "text-white/60 hover:text-white hover:bg-white/5"
                            }`}
                            style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
                          >
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Spacer — pushes transport to center */}
          <div className="flex-1" />

          {/* CENTER: Now Playing — prev + play/pause + next + track title + time + library */}
          {showTransport && currentTrack && !inJourneyMode && (
            <div className="flex items-center gap-1">
              <button
                onClick={playPrev}
                className="flex items-center justify-center p-2 text-white/40 hover:text-white/80 transition-colors duration-75"
                title="Previous track"
              >
                <SkipBack className="h-3.5 w-3.5" fill="currentColor" />
              </button>
              <button
                onClick={() => {
                  ensureResumed();
                  isPlaying ? storePause() : storeResume();
                }}
                className="flex items-center justify-center p-2 text-white/80 hover:text-white transition-colors duration-75"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" fill="currentColor" />
                ) : (
                  <Play className="h-4 w-4" fill="currentColor" />
                )}
              </button>
              <button
                onClick={playNext}
                className="flex items-center justify-center p-2 text-white/40 hover:text-white/80 transition-colors duration-75"
                title="Next track"
              >
                <SkipForward className="h-3.5 w-3.5" fill="currentColor" />
              </button>
              <button
                onClick={toggleMute}
                className="flex items-center justify-center p-2 text-white/40 hover:text-white/80 transition-colors duration-75"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <span
                className="text-white/60 text-sm truncate max-w-[180px]"
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
              {showLibraryButton && onLibraryToggle && (
                <button
                  onClick={onLibraryToggle}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors duration-75 ml-3 ${libraryOpen ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70 hover:bg-white/10"}`}
                  style={{ border: libraryOpen ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)" }}
                  title="Library"
                >
                  <Library className="h-3.5 w-3.5" />
                  <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}>
                    Library
                  </span>
                </button>
              )}
            </div>
          )}

          {/* CENTER: Track info + mute — journey mode */}
          {journeyActive && currentTrack && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="flex items-center justify-center p-2 text-white/40 hover:text-white/80 transition-colors duration-75"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
              <span
                className="text-white/40 text-sm truncate max-w-[180px]"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              >
                {currentTrack.title}
              </span>
              <span
                className="text-white/25"
                style={{ fontSize: "0.65rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
              >
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          )}

          {/* Spacer — pushes exit to right edge (wider to shift center content left) */}
          <div className="flex-[2]" />

          {/* RIGHT: Share + Studio / Exit */}
          <div className="flex items-center gap-1.5">
            {(journeyActive ? onShareJourney : onShareRoom) && (
              <button
                onClick={journeyActive ? onShareJourney : onShareRoom}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
                style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}
                title={journeyActive ? "Share Journey" : "Share Room"}
              >
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            )}
          {exitLabel === "back" ? (
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
              style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.72rem", fontFamily: "var(--font-geist-mono)" }}
              title="Studio"
            >
              Studio
            </button>
          ) : (
            <button
              onClick={onExit}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="flex items-center justify-center p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/10 transition-colors duration-75"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
          </div>
        </div>

        {/* Mobile bar — two-row layout when playing, single row when browsing */}
        <div
          className="room-bar-mobile flex-col"
          style={{
            background: "#000",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {/* Row 1: Mode identity + track info */}
          <div className="flex items-center justify-between px-3" style={{ height: "32px" }}>
            {/* Left: mode toggle or journey pill */}
            <div className="flex items-center gap-1.5 min-w-0">
              {showJourneyButton && onJourneyToggle && !journeyActive && (
                <div
                  className="flex items-center rounded-lg"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  <button
                    onClick={onJourneyToggle}
                    className={`px-2.5 py-1.5 rounded-l-[7px] transition-colors duration-75 ${
                      inJourneyMode
                        ? "bg-white/10 text-white/90"
                        : "text-white/35 hover:text-white/60 hover:bg-white/10"
                    }`}
                    style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)", lineHeight: 1 }}
                  >
                    Journeys
                  </button>
                  <button
                    onClick={inJourneyMode ? onSwitchToVisualize : undefined}
                    className={`px-2.5 py-1.5 rounded-r-[7px] transition-colors duration-75 ${
                      !inJourneyMode
                        ? "bg-white/10 text-white/90"
                        : "text-white/35 hover:text-white/60 hover:bg-white/10"
                    }`}
                    style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)", lineHeight: 1 }}
                  >
                    Viz
                  </button>
                </div>
              )}
              {journeyActive && journeyName && (
                <div
                  className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-lg min-w-0"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <button
                    onClick={onStopJourney}
                    className="flex-shrink-0 p-1 rounded text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors duration-75"
                    title="End journey"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{
                      width: "6px",
                      height: "6px",
                      backgroundColor: journeyAccent ?? "rgba(255,255,255,0.5)",
                    }}
                  />
                  <span
                    className="text-white/70 truncate"
                    style={{
                      fontSize: "0.68rem",
                      fontFamily: "var(--font-geist-mono)",
                      maxWidth: "120px",
                    }}
                  >
                    {journeyName}
                  </span>
                </div>
              )}
              {/* Mobile shader picker — viz mode only */}
              {!inJourneyMode && (
                <div className="flex items-center gap-0.5">
                  {onPrevShader && (
                    <button
                      onClick={onPrevShader}
                      className="flex items-center justify-center rounded-lg p-1.5 text-white/40 hover:text-white/70 transition-colors duration-75"
                      title="Previous shader"
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => setModePaletteOpen((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors duration-75 ${
                      modePaletteOpen ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                    style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    <span style={{ fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)" }}>
                      {MODE_META.find(m => m.mode === mode)?.label ?? "Mandala"}
                    </span>
                    <ChevronUp className={`h-3 w-3 transition-transform ${modePaletteOpen ? "rotate-180" : ""}`} />
                  </button>
                  {onNextShader && (
                    <button
                      onClick={onNextShader}
                      className="flex items-center justify-center rounded-lg p-1.5 text-white/40 hover:text-white/70 transition-colors duration-75"
                      title="Next shader"
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              {/* Poetry + Voice toggles — viz mode only (hidden during journeys) */}
              {(!journeyActive && !inJourneyMode && currentTrack) && (
                <>
                  <button
                    onClick={() => {
                      if (poetryEnabled || storyEnabled) {
                        setWhisperEnabled(false);
                        setTextOverlayMode("off");
                      } else {
                        setTextOverlayMode("poetry");
                      }
                    }}
                    className={`flex items-center justify-center rounded-lg p-1.5 transition-colors duration-75 ${
                      poetryEnabled || storyEnabled ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                    }`}
                    title={poetryEnabled || storyEnabled ? "Poetry: On" : "Poetry: Off"}
                  >
                    <Type className="h-3.5 w-3.5" />
                  </button>
                  {(poetryEnabled || storyEnabled) && (
                    <>
                      <button
                        onClick={() => setWhisperEnabled(!whisperEnabled)}
                        className={`flex items-center justify-center rounded-lg p-1.5 transition-colors duration-75 ${
                          whisperEnabled ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                        }`}
                        title={whisperEnabled ? "Voice: On" : "Voice: Off"}
                      >
                        <AudioLines className="h-3.5 w-3.5" />
                      </button>
                      {showLiveButton && onLiveToggle && !journeyActive && (
                        <button
                          onClick={onLiveToggle}
                          className={`flex items-center justify-center rounded-lg p-1.5 transition-colors duration-75 ${
                            liveEnabled ? "bg-red-500/20 text-red-400" : "text-white/40 hover:text-white/70"
                          }`}
                          title={liveEnabled ? "Live: On" : "Live: Off"}
                        >
                          <Mic className={`h-3.5 w-3.5 ${liveEnabled ? "animate-pulse" : ""}`} />
                        </button>
                      )}
                      <div className="relative">
                        <button
                          onClick={() => setLangPickerOpen((v) => !v)}
                          className={`flex items-center justify-center rounded-lg p-1.5 transition-colors duration-75 ${
                            langPickerOpen ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                          }`}
                          title="Language"
                        >
                          <Globe className="h-3.5 w-3.5" />
                        </button>
                        {langPickerOpen && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setLangPickerOpen(false)} />
                            <div
                              className="absolute bottom-10 left-0 z-40 py-2 rounded-xl overflow-hidden min-w-[140px]"
                              style={{
                                backgroundColor: "#000",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                              }}
                            >
                              {LANGUAGES.map((lang) => (
                                <button
                                  key={lang.code}
                                  onClick={() => { setLanguage(lang.code); setLangPickerOpen(false); }}
                                  className={`w-full text-left px-4 py-1.5 transition-colors ${
                                    language === lang.code
                                      ? "text-white bg-white/10"
                                      : "text-white/60 hover:text-white hover:bg-white/5"
                                  }`}
                                  style={{ fontSize: "0.75rem", fontFamily: "var(--font-geist-mono)" }}
                                >
                                  {lang.label}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Row 2: Transport controls + actions (only when not in journey browsing without active journey) */}
          {(!journeyBrowsing || journeyActive) && (
            <div className="flex items-center justify-between px-2" style={{ height: "44px" }}>
              {/* Left: prev / play / next */}
              <div className="flex items-center">
                {showTransport && !journeyActive && (
                  <button
                    onClick={playPrev}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/80 transition-colors duration-75"
                    title="Previous track"
                  >
                    <SkipBack className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                )}
                <button
                  onClick={() => {
                    ensureResumed();
                    isPlaying ? storePause() : storeResume();
                  }}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white transition-colors duration-75"
                >
                  {isPlaying ? (
                    <Pause className="h-4.5 w-4.5" fill="currentColor" />
                  ) : (
                    <Play className="h-4.5 w-4.5" fill="currentColor" />
                  )}
                </button>
                {showTransport && !journeyActive && (
                  <button
                    onClick={playNext}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/40 hover:text-white/80 transition-colors duration-75"
                    title="Next track"
                  >
                    <SkipForward className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                )}
              </div>

              {/* Center: track title + time */}
              {currentTrack && (
                <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-center">
                  <span
                    className="text-white/50 truncate"
                    style={{ fontSize: "0.72rem", fontFamily: "var(--font-geist-sans)", maxWidth: "140px" }}
                  >
                    {currentTrack.title}
                  </span>
                  <span
                    className="text-white/25 flex-shrink-0"
                    style={{ fontSize: "0.6rem", fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatTime(currentTime)}
                  </span>
                </div>
              )}

              {/* Right: mute + library + share + studio/exit */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={toggleMute}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition-colors duration-75"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                {showLibraryButton && onLibraryToggle && !journeyActive && (
                  <button
                    onClick={onLibraryToggle}
                    className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors duration-75 ${
                      libraryOpen ? "bg-white/15 text-white" : "text-white/40 hover:text-white/70"
                    }`}
                    title="Library"
                  >
                    <Library className="h-4 w-4" />
                  </button>
                )}
                {(journeyActive ? onShareJourney : onShareRoom) && (
                  <button
                    onClick={journeyActive ? onShareJourney : onShareRoom}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 transition-colors duration-75"
                    title={journeyActive ? "Share Journey" : "Share"}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                )}
                {exitLabel === "back" ? (
                  <button
                    onClick={onExit}
                    className="flex items-center px-3 py-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)" }}
                    title="Studio"
                  >
                    Studio
                  </button>
                ) : (
                  <button
                    onClick={onExit}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 transition-colors duration-75"
                    title="Sign out"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Journey browsing without active journey — single row with just studio/exit */}
          {journeyBrowsing && !journeyActive && (
            <div className="flex items-center justify-end px-2" style={{ height: "44px" }}>
              {exitLabel === "back" ? (
                <button
                  onClick={onExit}
                  className="flex items-center px-3 py-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors duration-75"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", fontSize: "0.68rem", fontFamily: "var(--font-geist-mono)" }}
                  title="Studio"
                >
                  Studio
                </button>
              ) : (
                <button
                  onClick={onExit}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
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
