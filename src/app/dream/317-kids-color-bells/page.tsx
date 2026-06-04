"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { buildBellAudio, HUE_COLORS, HUE_LABELS } from "./audio";
import type { BellAudio } from "./audio";
import { sampleCenterRegion } from "./color";
import { drawScene } from "./scene";
import type { BeadItem, SceneState } from "./scene";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOLD_MS = 500;       // ms the child must hold the color steady before ring
const MAX_BEADS = 24;      // max beads in the song basket
const BEAD_PLAY_MS = 600;  // ms between bead plays during playback
const SAMPLE_BOX_FRAC = 0.32; // same as RETICLE_FRAC in scene.ts

// ─── Demo sequence: ring these color indices in order on auto-demo ────────────
const DEMO_SEQ = [0, 2, 4, 3, 1, 5, 0, 3] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type AppMode = "idle" | "camera" | "touch";

// ─── Helper: request camera ───────────────────────────────────────────────────

async function requestCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
}

// ─── Helper: sample video center region ──────────────────────────────────────

function sampleVideoCenter(
  video: HTMLVideoElement,
  offscreen: HTMLCanvasElement
): ReturnType<typeof sampleCenterRegion> | null {
  if (video.readyState < 2 || video.videoWidth === 0) return null;
  const W = video.videoWidth;
  const H = video.videoHeight;
  offscreen.width = W;
  offscreen.height = H;
  const ctx = offscreen.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, W, H);
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, W, H);
  } catch {
    return null; // cross-origin taint guard
  }
  return sampleCenterRegion(imageData, SAMPLE_BOX_FRAC);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KidsColorBells() {
  // ── Refs ────────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<BellAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const beadsRef = useRef<BeadItem[]>([]);
  const sceneStateRef = useRef<SceneState>({
    splashColor: null,
    splashAlpha: 0,
    splashStartMs: 0,
    activeBinIdx: -1,
    playingBeadIdx: -1,
    holdProgress: 0,
  });

  // Hold-tracking: consecutive frames in the same bin
  const holdStartRef = useRef<number>(0);
  const holdBinRef = useRef<number>(-1);

  // Playback state
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Demo state
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bead ID counter
  const beadIdRef = useRef<number>(0);

  // ── React state (UI only) ────────────────────────────────────────────────────
  const [mode, setMode] = useState<AppMode>("idle");
  const [beadCount, setBeadCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [showNotes, setShowNotes] = useState(false);

  // ── Ring a bell + add a bead ─────────────────────────────────────────────────
  const ringColor = useCallback((colorIdx: number) => {
    if (!audioRef.current) return;
    audioRef.current.ringBell(colorIdx);

    // Splash
    sceneStateRef.current = {
      ...sceneStateRef.current,
      splashColor: HUE_COLORS[colorIdx] ?? "#ffffff",
      splashAlpha: 1,
      splashStartMs: performance.now(),
    };

    // Add bead (cap at MAX_BEADS)
    if (beadsRef.current.length < MAX_BEADS) {
      beadsRef.current = [
        ...beadsRef.current,
        { colorIdx, id: beadIdRef.current++ },
      ];
      setBeadCount(beadsRef.current.length);
    }
  }, []);

  // ── Start audio engine ───────────────────────────────────────────────────────
  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    try {
      audioRef.current = buildBellAudio();
    } catch (e) {
      console.warn("AudioContext failed", e);
    }
  }, []);

  // ── Play back the bead song ──────────────────────────────────────────────────
  const playSong = useCallback(() => {
    if (isPlaying || beadsRef.current.length === 0 || !audioRef.current) return;
    setIsPlaying(true);
    sceneStateRef.current = { ...sceneStateRef.current, playingBeadIdx: 0 };

    let i = 0;
    function playNext() {
      const beads = beadsRef.current;
      if (i >= beads.length) {
        sceneStateRef.current = { ...sceneStateRef.current, playingBeadIdx: -1 };
        setIsPlaying(false);
        return;
      }
      const bead = beads[i];
      sceneStateRef.current = { ...sceneStateRef.current, playingBeadIdx: i };
      audioRef.current?.ringBell(bead.colorIdx);
      i++;
      playbackTimerRef.current = setTimeout(playNext, BEAD_PLAY_MS);
    }
    playNext();
  }, [isPlaying]);

  // ── Clear the basket ─────────────────────────────────────────────────────────
  const clearBasket = useCallback(() => {
    if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    setIsPlaying(false);
    beadsRef.current = [];
    setBeadCount(0);
    sceneStateRef.current = { ...sceneStateRef.current, playingBeadIdx: -1 };
  }, []);

  // ── Run auto-demo sequence ───────────────────────────────────────────────────
  const runDemo = useCallback(() => {
    let idx = 0;
    function nextDemoNote() {
      if (idx >= DEMO_SEQ.length || !audioRef.current) return;
      ringColor(DEMO_SEQ[idx]);
      idx++;
      demoTimerRef.current = setTimeout(nextDemoNote, 800);
    }
    demoTimerRef.current = setTimeout(nextDemoNote, 1200);
  }, [ringColor]);

  // ── Start camera mode ────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    startAudio();
    try {
      const stream = await requestCamera();
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {/* autoplay may be blocked */});
      }
      setMode("camera");
      setCameraError("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(msg.includes("Permission") || msg.includes("NotAllowed")
        ? "Camera permission denied — tap a color button below to play!"
        : "Camera not available — tap a color button below to play!");
      setMode("touch");
      runDemo();
    }
  }, [startAudio, runDemo]);

  // ── Big START handler ────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    startAudio();
    void startCamera();
  }, [startAudio, startCamera]);

  // ── Touch-mode color button handler ─────────────────────────────────────────
  const handleTouchColor = useCallback((colorIdx: number) => {
    if (!audioRef.current) startAudio();
    ringColor(colorIdx);
  }, [startAudio, ringColor]);

  // ── Main render loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure offscreen canvas exists
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement("canvas");
    }
    const offscreen = offscreenRef.current;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    let cancelled = false;

    function loop(ts: number) {
      if (cancelled) return;

      const video = videoRef.current;
      const cameraLive = mode === "camera" && !!video && video.readyState >= 2;

      // ── Camera sampling ──────────────────────────────────────────────────────
      if (cameraLive && video) {
        const sample = sampleVideoCenter(video, offscreen);
        if (sample) {
          const { binIdx, confident } = sample;
          const state = sceneStateRef.current;

          if (confident && binIdx >= 0) {
            sceneStateRef.current = { ...state, activeBinIdx: binIdx };

            if (holdBinRef.current !== binIdx) {
              // New color — reset hold timer
              holdBinRef.current = binIdx;
              holdStartRef.current = ts;
              sceneStateRef.current = { ...sceneStateRef.current, holdProgress: 0 };
            } else {
              // Same color — measure progress
              const elapsed = ts - holdStartRef.current;
              const progress = Math.min(1, elapsed / HOLD_MS);
              sceneStateRef.current = { ...sceneStateRef.current, holdProgress: progress };

              if (elapsed >= HOLD_MS) {
                // Fire! Reset hold timer so it doesn't re-fire immediately
                holdStartRef.current = ts + HOLD_MS * 10; // push far future
                holdBinRef.current = -1;
                sceneStateRef.current = { ...sceneStateRef.current, holdProgress: 0 };
                ringColor(binIdx);
              }
            }
          } else {
            holdBinRef.current = -1;
            holdStartRef.current = ts;
            sceneStateRef.current = {
              ...sceneStateRef.current,
              activeBinIdx: -1,
              holdProgress: 0,
            };
          }
        }
      }

      // ── Draw scene ────────────────────────────────────────────────────────────
      if (canvas) {
        drawScene(
          canvas,
          videoRef.current,
          offscreen,
          beadsRef.current,
          sceneStateRef.current,
          ts,
          cameraLive
        );
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mode, ringColor]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.close();
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden select-none">
      {/* Hidden video element for camera feed */}
      <video
        ref={videoRef}
        className="hidden"
        playsInline
        muted
        autoPlay
      />

      {/* Full-screen canvas — camera + visuals */}
      {mode !== "idle" && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: "none" }}
        />
      )}

      {/* ── IDLE START SCREEN ─────────────────────────────────────────────── */}
      {mode === "idle" && (
        <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-4">
          {/* Title */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold text-white tracking-tight">
              🎐 Color Bells
            </h1>
            <p className="text-base text-white/75 max-w-xs leading-relaxed">
              Show something colorful to the camera — a red toy, a blue cup — and a bell rings!
            </p>
          </div>

          {/* Color preview row */}
          <div className="flex gap-3">
            {HUE_COLORS.map((color, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full shadow-lg"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Start button */}
          <button
            onClick={handleStart}
            className="min-h-[72px] min-w-[200px] rounded-3xl bg-white text-black text-2xl font-bold px-10 py-4 shadow-2xl active:scale-95 transition-transform"
          >
            ▶ Start
          </button>

          {/* Design notes link */}
          <button
            onClick={() => setShowNotes(true)}
            className="text-base text-white/60 underline underline-offset-4 hover:text-white/90 transition-colors"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* ── DESIGN NOTES OVERLAY ─────────────────────────────────────────── */}
      {showNotes && (
        <div className="fixed inset-0 z-50 bg-black/90 overflow-y-auto flex items-start justify-center p-6">
          <div className="max-w-md w-full space-y-4 pt-4">
            <h2 className="text-2xl font-bold text-white">Design Notes</h2>
            <p className="text-base text-white/75 leading-relaxed">
              <strong className="text-white">The room is your instrument.</strong> Color Bells samples the average RGB of a central reticle region from the live camera feed — no ML, no body tracking, just a simple pixel average that maps to a note.
            </p>
            <p className="text-base text-white/75 leading-relaxed">
              <strong className="text-white">Scale:</strong> D major hexachord (D E F♯ G A B). Warm colors (red, orange, yellow) map to lower notes; cool colors (green, blue, violet) ascend the scale.
            </p>
            <p className="text-base text-white/75 leading-relaxed">
              <strong className="text-white">References:</strong> Toshio Iwai — SimTunes (1996), where grid cells&apos; colors directly triggered instruments. Also the color-organ lineage: Castel&apos;s clavecin oculaire, Len Lye and Oskar Fischinger&apos;s visual music — color as pitch.
            </p>
            <p className="text-base text-white/75 leading-relaxed">
              <strong className="text-white">Ambition:</strong> Novel camera region-color sampling technique (never used in the lab) + 4 integrated subsystems: camera sampler, FM bell audio engine, Canvas2D scene, song-memory state machine.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 text-base text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE MODE UI OVERLAY ────────────────────────────────────────── */}
      {mode !== "idle" && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-black/40 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">🎐 Color Bells</h1>
              {/* Camera status indicator */}
              {mode === "camera" ? (
                <span className="text-sm font-semibold text-emerald-400 bg-emerald-400/10 rounded-full px-2 py-0.5">
                  Camera on
                </span>
              ) : (
                <span className="text-sm font-semibold text-amber-400 bg-amber-400/10 rounded-full px-2 py-0.5">
                  Touch mode
                </span>
              )}
            </div>
            <button
              onClick={() => setShowNotes(true)}
              className="text-sm text-white/60 hover:text-white/90 underline underline-offset-2 transition-colors min-h-[44px] px-2"
            >
              Notes
            </button>
          </div>

          {/* Camera error notice */}
          {cameraError && (
            <div className="absolute top-16 left-0 right-0 z-10 flex justify-center px-4">
              <p className="text-rose-300 text-base text-center bg-black/50 rounded-xl px-4 py-2 max-w-sm">
                {cameraError}
              </p>
            </div>
          )}

          {/* Touch color buttons — shown in touch/fallback mode */}
          {mode === "touch" && (
            <div className="absolute left-0 right-0 z-10 flex justify-center gap-3 px-4"
              style={{ top: cameraError ? "7.5rem" : "5rem" }}
            >
              {HUE_COLORS.map((color, i) => (
                <button
                  key={i}
                  onClick={() => handleTouchColor(i)}
                  className="flex-1 max-w-[68px] min-h-[68px] rounded-2xl shadow-lg active:scale-90 transition-transform flex items-center justify-center"
                  style={{ backgroundColor: color }}
                  title={HUE_LABELS[i]}
                  aria-label={HUE_LABELS[i] ?? `Color ${i}`}
                />
              ))}
            </div>
          )}

          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 pb-6 px-4">
            {/* Bead area label */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/60">
                {beadCount === 0
                  ? "Find a color to start your song!"
                  : `${beadCount} color${beadCount !== 1 ? "s" : ""} collected`}
              </span>
            </div>

            {/* Song controls */}
            {beadCount > 0 && (
              <div className="flex gap-3">
                <button
                  onClick={playSong}
                  disabled={isPlaying}
                  className="min-h-[64px] min-w-[140px] rounded-2xl bg-white text-black text-xl font-bold px-6 py-3 shadow-xl disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isPlaying ? "♪ Playing..." : "▶ Play song"}
                </button>
                <button
                  onClick={clearBasket}
                  className="min-h-[64px] min-w-[64px] rounded-2xl bg-white/10 text-white text-xl px-4 py-3 shadow-xl active:scale-95 transition-transform"
                  title="Clear basket"
                  aria-label="Clear basket"
                >
                  🧺
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Back link */}
      {mode !== "idle" && (
        <div className="absolute top-3 right-4 z-20">
          <Link
            href="/dream"
            className="text-xs text-white/40 hover:text-white/70 transition-colors min-h-[44px] flex items-center"
          >
            ← Dream
          </Link>
        </div>
      )}
    </div>
  );
}
