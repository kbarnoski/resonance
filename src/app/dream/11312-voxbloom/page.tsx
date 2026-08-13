"use client";

// ─────────────────────────────────────────────────────────────────────────────
// VOXBLOOM — sing into a rotating 3-D sculpture of your own voice. Every harmonic
// is a glowing shell of points that blooms outward when you are loud and collapses
// inward when you are quiet. Primary path is a WebGPU compute+render pipeline;
// devices without WebGPU degrade gracefully to a three.js Points cloud driven by
// the same band→radius mapping. A seeded self-demo keeps the sculpture alive on
// mount, before any microphone permission.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createAudioEngine, type AudioEngine } from "./audioEngine";
import { buildGpu, type GpuHandle } from "./webgpuRenderer";
import { buildThree, type ThreeHandle } from "./threeRenderer";
import {
  NUM_BANDS,
  aggregateBands,
  bandEnergy,
  syntheticBands,
  buildMvp,
} from "./geometry";

type Backend = "init" | "webgpu" | "three";
type MicState = "off" | "on" | "denied";

export default function VoxBloom() {
  const [backend, setBackend] = useState<Backend>("init");
  const [micState, setMicState] = useState<MicState>("off");
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const animRef = useRef(0);

  // Orbit camera state (refs so the frame closure always sees the latest).
  const azRef = useRef(0.6);
  const elRef = useRef(0.25);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const reducedRef = useRef(false);

  // ── the whole engine + render loop lives in one mount effect ────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let gpu: GpuHandle | null = null;
    let three: ThreeHandle | null = null;

    const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = reduceQuery.matches;
    const onReduce = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    reduceQuery.addEventListener("change", onReduce);

    // Audio comes up first and the self-demo starts immediately — no permission.
    const engine = createAudioEngine();
    engineRef.current = engine;
    engine.startDemo();

    const realBands = new Float32Array(NUM_BANDS);
    const synthBands = new Float32Array(NUM_BANDS);
    let lastTime = performance.now();
    let startTime = lastTime;

    function sizeCanvas(cv: HTMLCanvasElement) {
      const dpr = Math.min(window.devicePixelRatio, 2);
      cv.width = Math.max(1, Math.floor(cv.clientWidth * dpr));
      cv.height = Math.max(1, Math.floor(cv.clientHeight * dpr));
    }

    function computeBands(now: number): Float32Array {
      engine.sample();
      aggregateBands(engine.freqData, realBands);
      // Fall back to a gentle synthetic spectrum whenever the graph is silent
      // or still suspended (muted phone, pre-gesture) so the sculpture is alive.
      if (bandEnergy(realBands) < 0.06) {
        syntheticBands((now - startTime) / 1000, synthBands);
        return synthBands;
      }
      return realBands;
    }

    function stepOrbit(dt: number) {
      const speed = reducedRef.current ? 0 : 0.14; // ≈0.022 Hz, well under 1 Hz
      if (!dragRef.current) {
        azRef.current += speed * dt;
        const t = (performance.now() - startTime) / 1000;
        elRef.current = 0.2 + (reducedRef.current ? 0 : 0.16 * Math.sin(t * 0.11));
      }
    }

    async function start(cv: HTMLCanvasElement) {
      sizeCanvas(cv);

      // Pick the path ONCE at startup.
      if (navigator.gpu) {
        try {
          gpu = await buildGpu(cv);
          if (cancelled) {
            gpu.destroy();
            gpu = null;
            return;
          }
          setBackend("webgpu");
        } catch {
          gpu = null;
        }
      }
      if (!gpu) {
        three = buildThree(cv);
        if (cancelled) {
          three.destroy();
          three = null;
          return;
        }
        setBackend("three");
      }

      lastTime = performance.now();
      startTime = lastTime;

      const frame = (now: number) => {
        if (cancelled) return;
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const bands = computeBands(now);
        stepOrbit(dt);

        if (gpu) {
          const aspect = cv.width / Math.max(cv.height, 1);
          const mvp = buildMvp(azRef.current, elRef.current, aspect, 3.5);
          gpu.render(bands, mvp, dt);
        } else if (three) {
          three.render(bands, azRef.current, elRef.current, dt);
        }
        animRef.current = requestAnimationFrame(frame);
      };
      animRef.current = requestAnimationFrame(frame);
    }

    void start(canvas);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      reduceQuery.removeEventListener("change", onReduce);
      gpu?.destroy();
      three?.destroy();
      void engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // ── mic handoff ─────────────────────────────────────────────────────────────
  const handleStartMic = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      await engine.startMic();
      setMicState("on");
    } catch {
      // Denied or unavailable — keep the self-demo running, note it on-brand.
      engine.startDemo();
      setMicState("denied");
    }
  }, []);

  const handleStopMic = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.stopMic();
    engine.startDemo();
    setMicState("off");
  }, []);

  // ── orbit drag ──────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    azRef.current += (e.clientX - dragRef.current.x) * 0.007;
    elRef.current = Math.max(
      -1.3,
      Math.min(1.3, elRef.current - (e.clientY - dragRef.current.y) * 0.007),
    );
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="relative w-full overflow-hidden bg-background" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none", cursor: "grab", background: "#020305" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* ── top-left: title + description + primary action ──────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-5 sm:p-6">
        <div className="pointer-events-auto max-w-md">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · Voice Sculpture
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Voxbloom
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Sing, hum, or speak — each harmonic of your voice is a shell of light
            that blooms outward when you are loud and folds back to the core when
            you are quiet. Drag to orbit.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {micState !== "on" ? (
              <button
                onClick={handleStartMic}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start microphone
              </button>
            ) : (
              <button
                onClick={handleStopMic}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop microphone
              </button>
            )}
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>

          {micState === "denied" && (
            <p className="mt-3 text-sm text-destructive">
              Microphone unavailable — the seeded self-demo keeps blooming so you
              can still watch the sculpture breathe.
            </p>
          )}
        </div>
      </div>

      {/* ── bottom status strip ─────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-5 sm:p-6">
        <Link
          href="/dream"
          className="pointer-events-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
        <div className="text-right font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <div>
            {backend === "init"
              ? "starting…"
              : backend === "webgpu"
                ? "WebGPU · 60k points"
                : "WebGL · 24k points"}
          </div>
          <div className="mt-1 normal-case tracking-normal">
            {micState === "on" ? "listening to you" : "self-demo · minor pentatonic"}
          </div>
        </div>
      </div>

      {/* ── design notes overlay ────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Voxbloom — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The sculpture is {NUM_BANDS} concentric spherical shells of points.
                Every point owns a fixed direction and a frequency band; only its
                radius moves.
              </p>
              <p>
                A WebGPU compute shader lerps each point&apos;s radius toward
                <span className="font-mono"> floor + amplitude²·bloom</span> — attack
                faster than decay — so loud harmonics bloom into bright outer shells
                and quiet ones collapse inward. A render pass draws every point as an
                additive cyan→white phosphor sprite.
              </p>
              <p>
                Without WebGPU it degrades to a three.js Points cloud running the same
                band→radius mapping on the CPU, with the same slow auto-orbit — never
                a flat 2-D drawing.
              </p>
              <p>
                A seeded self-demo (a soft minor-pentatonic arpeggio over a slow pad)
                keeps it alive on load, before any microphone permission. Motion is
                slow drift only, and reduced-motion preferences stop the orbit.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
