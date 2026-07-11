"use client";

/**
 * 320 · Kids Light Loom
 * "What if a 4-year-old could BOW glowing strings of light into sustained,
 *  singing tones — not pluck them, but draw them alive by dragging?"
 *
 * FIRST continuous-excitation bowed-string model in the lab.
 * Scale: D-Dorian hexachord (D E F G A C) / just-intonation 5ths over D root.
 * Audio model: approach (b) — sawtooth + noise + LP filter with bow-speed
 *              mapped to brightness/amplitude (Helmholtz stick-slip feel).
 * Visuals: raw THREE.js WebGL (NOT Canvas2D), glowing strings as emissive
 *          line geometry with standing-wave animation.
 *
 * References:
 *   Serafin & Vergez — Real-time friction model of the violin (2000)
 *   Julius O. Smith — Digital Waveguide Bowed Strings (CCRMA)
 *   Helmholtz motion / stick-slip dynamics
 *   Inspired by sibling 140-kids-string-bridge
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { STRING_COLORS, STRING_FREQS, buildLoomAudio } from "./audio";
import type { LoomAudio } from "./audio";
import { buildLoomScene } from "./scene";
import type { LoomScene } from "./scene";
import { buildBowTracker } from "./bow";
import type { BowTracker } from "./bow";

// ── layout constants ──────────────────────────────────────────────────────────
const STRING_COUNT = STRING_FREQS.length; // 6
// Min width of each string's hit band in CSS px (touch target ≥64px)
const HIT_BAND_PX = 72;

// ── auto-demo: bow string 0 gently on start ───────────────────────────────────
const DEMO_DURATION_MS = 3500;

type Mode = "idle" | "running";

export default function KidsLightLoomPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [glError, setGlError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Engine refs (no re-render)
  const audioRef = useRef<LoomAudio | null>(null);
  const sceneRef = useRef<LoomScene | null>(null);
  const bowRef = useRef<BowTracker | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const demoPhaseRef = useRef<number>(0); // 0=playing, 1=done

  // String X positions in CSS pixels (computed from container width)
  const stringXsPxRef = useRef<number[]>([]);

  // ── compute string X positions given container width ──────────────────────
  const computeStringXs = useCallback((containerW: number) => {
    const margin = Math.max(HIT_BAND_PX / 2, containerW * 0.06);
    const xs: number[] = [];
    for (let i = 0; i < STRING_COUNT; i++) {
      const t = STRING_COUNT > 1 ? i / (STRING_COUNT - 1) : 0.5;
      xs.push(margin + t * (containerW - margin * 2));
    }
    stringXsPxRef.current = xs;
    return xs;
  }, []);

  // ── start ──────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const mount = mountRef.current;
    const canvas = canvasRef.current;
    if (!mount || !canvas) return;

    // ── audio ────────────────────────────────────────────────────────────────
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const loom = buildLoomAudio(ctx);
      audioRef.current = loom;
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : "Web Audio not supported"
      );
    }

    // ── three.js scene ───────────────────────────────────────────────────────
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    const loomScene = buildLoomScene(canvas, w, h);
    if (!loomScene) {
      setGlError("WebGL not supported on this device.");
      return;
    }
    sceneRef.current = loomScene;

    // ── bow tracker ──────────────────────────────────────────────────────────
    bowRef.current = buildBowTracker();

    // ── compute string positions ──────────────────────────────────────────────
    computeStringXs(w);

    startTimeRef.current = performance.now();
    demoPhaseRef.current = 0;

    setMode("running");
  }, [computeStringXs]);

  // ── pointer event handlers ─────────────────────────────────────────────────
  const getRect = useCallback((): DOMRect | null => {
    return mountRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const rect = getRect();
      const bow = bowRef.current;
      if (!rect || !bow) return;
      bow.onPointerDown(e.nativeEvent, rect, stringXsPxRef.current, HIT_BAND_PX);
    },
    [getRect]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rect = getRect();
      const bow = bowRef.current;
      if (!rect || !bow) return;
      bow.onPointerMove(e.nativeEvent, rect, stringXsPxRef.current, HIT_BAND_PX);
    },
    [getRect]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      bowRef.current?.onPointerUp(e.nativeEvent);
    },
    []
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      bowRef.current?.onPointerCancel(e.nativeEvent);
    },
    []
  );

  // ── animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "running") return;

    const scene = sceneRef.current;
    const audio = audioRef.current;
    const bow = bowRef.current;
    if (!scene) return;

    let alive = true;

    const tick = () => {
      if (!alive) return;
      rafRef.current = requestAnimationFrame(tick);

      const now = performance.now();
      const elapsed = (now - startTimeRef.current) / 1000; // seconds

      // ── auto-demo bowing ───────────────────────────────────────────────────
      const demoActive = demoPhaseRef.current === 0 && elapsed < DEMO_DURATION_MS / 1000;
      let demoEnergy = 0;
      if (demoActive) {
        // Gentle bow speed oscillating on string 0
        demoEnergy = 0.35 + 0.2 * Math.sin(elapsed * 1.5);
      } else if (demoPhaseRef.current === 0) {
        demoPhaseRef.current = 1;
      }

      // ── per-string update ──────────────────────────────────────────────────
      for (let i = 0; i < STRING_COUNT; i++) {
        const bowState = bow ? bow.getStringState(i) : { energy: 0, bowY: 0.5, active: false };
        let energy = bowState.energy;
        let bowY = bowState.bowY;
        let active = bowState.active;

        // Overlay demo on string 0 if demo is running and no real touch
        if (i === 0 && demoActive && energy < demoEnergy) {
          energy = demoEnergy;
          bowY = 0.5 + 0.15 * Math.sin(elapsed * 2.1);
          active = true;
        }

        // Tiny residual shimmer for all idle strings (visual only)
        const shimmer = 0.03 * (0.5 + 0.5 * Math.sin(elapsed * (0.7 + i * 0.13)));

        // Update audio
        if (audio) {
          audio.setBowSpeed(i, energy, active || (i === 0 && demoActive));
        }

        // Update scene (visual energy includes shimmer for idle strings)
        scene.updateString(i, energy + shimmer, bowY, elapsed);
      }

      // ── render ─────────────────────────────────────────────────────────────
      scene.renderer.render(scene.scene, scene.camera);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [mode]);

  // ── resize observer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "running") return;

    const mount = mountRef.current;
    const canvas = canvasRef.current;
    if (!mount || !canvas) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const scene = sceneRef.current;
        if (scene) {
          scene.renderer.setSize(width, height);
          scene.camera.aspect = width / height;
          scene.camera.updateProjectionMatrix();
        }
        computeStringXs(width);
        void height;
      }
    });
    ro.observe(mount);
    return () => ro.disconnect();
  }, [mode, computeStringXs]);

  // ── cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      audioRef.current?.dispose();
      bowRef.current?.dispose();
    };
  }, []);

  // ── string label colors for UI overlays ───────────────────────────────────
  // D-Dorian hexachord note names
  const NOTE_NAMES = ["D2", "A2", "D3", "G3", "A3", "D4"];

  return (
    <div className="relative w-full h-dvh bg-[#05050f] overflow-hidden select-none touch-none">
      {/* ── WebGL canvas ──────────────────────────────────────────────────── */}
      <div
        ref={mountRef}
        className="absolute inset-0"
        onPointerDown={mode === "running" ? handlePointerDown : undefined}
        onPointerMove={mode === "running" ? handlePointerMove : undefined}
        onPointerUp={mode === "running" ? handlePointerUp : undefined}
        onPointerCancel={mode === "running" ? handlePointerCancel : undefined}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: "none" }}
        />
      </div>

      {/* ── WebGL error ───────────────────────────────────────────────────── */}
      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="text-violet-300 text-xl text-center font-mono">{glError}</p>
        </div>
      )}

      {/* ── Audio error (non-fatal — visuals still run) ────────────────────── */}
      {audioError && mode === "running" && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <p className="text-violet-300 text-base font-mono bg-black/50 rounded px-3 py-1">
            Audio unavailable — {audioError}
          </p>
        </div>
      )}

      {/* ── Start screen ──────────────────────────────────────────────────── */}
      {mode === "idle" && !glError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 z-10 bg-[#05050f]/90 backdrop-blur-sm">
          <div className="text-center px-6">
            <h1 className="text-foreground text-3xl font-bold tracking-wide mb-2">
              Light Loom
            </h1>
            <p className="text-muted-foreground text-lg">
              Drag across the glowing strings to make them sing
            </p>
          </div>

          {/* Colorful string preview dots */}
          <div className="flex gap-4 items-end mb-2">
            {STRING_COLORS.map((col, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 10 + i * 3,
                  height: 10 + i * 3,
                  background: col,
                  boxShadow: `0 0 12px ${col}`,
                }}
              />
            ))}
          </div>

          <button
            onClick={handleStart}
            className="min-h-[60px] px-10 py-3 rounded-full text-foreground text-xl font-bold
                       bg-muted hover:bg-accent active:bg-muted border border-border
                       transition-all duration-200 shadow-lg"
            style={{
              boxShadow: "0 0 32px rgba(180,120,255,0.35)",
            }}
          >
            ▶ Start Playing
          </button>

          <p className="text-muted-foreground text-base font-mono">
            Drag slowly for soft glow · Drag fast for bright sound
          </p>
        </div>
      )}

      {/* ── String note labels (running mode, subtle) ─────────────────────── */}
      {mode === "running" && !glError && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-around items-end pb-3 pointer-events-none z-10">
          {NOTE_NAMES.map((name, i) => (
            <span
              key={i}
              className="text-muted-foreground text-base font-mono transition-all duration-150"
              style={{
                color: STRING_COLORS[i],
                opacity: 0.65,
                textShadow: `0 0 12px ${STRING_COLORS[i]}`,
              }}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      {/* ── Corner: design notes link ──────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-20 flex gap-3 items-center">
        {mode === "running" && (
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="text-muted-foreground text-base font-mono hover:text-muted-foreground transition-colors
                       min-h-[44px] px-4 py-2.5"
          >
            {showNotes ? "× close" : "? notes"}
          </button>
        )}
        <Link
          href="/dream/320-kids-light-loom/README.md"
          className="text-muted-foreground text-base font-mono hover:text-muted-foreground transition-colors
                     min-h-[44px] px-4 py-2.5 flex items-center"
        >
          Read the design notes
        </Link>
      </div>

      {/* ── Info overlay ──────────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute top-14 right-3 w-80 max-w-[90vw] z-20
                     bg-black/80 border border-border rounded-xl p-5 text-sm"
        >
          <h2 className="text-foreground text-xl font-bold mb-3">How it works</h2>
          <ul className="text-muted-foreground text-base space-y-2 list-disc list-inside">
            <li>Drag a finger along any glowing string to bow it</li>
            <li>Slow drag = soft & dark · Fast drag = bright & loud</li>
            <li>Two fingers, two kids — harmonize together</li>
            <li>The string SUSTAINS while you move — try holding the drag</li>
          </ul>
          <h3 className="text-foreground text-base font-semibold mt-4 mb-1">Scale</h3>
          <p className="text-muted-foreground text-base font-mono">
            D-Dorian hexachord: D E F G A C
          </p>
          <p className="text-muted-foreground text-base mt-2">
            Just-intonation 5ths/4ths over D root. No wrong notes.
          </p>
        </div>
      )}
    </div>
  );
}
