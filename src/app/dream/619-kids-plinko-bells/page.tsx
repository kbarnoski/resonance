"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildPegs,
  spawnMarble,
  stepPhysics,
  BINS,
  type Marble,
  type Peg,
} from "./physics";
import { createRenderer, type Renderer, type SceneState } from "./gl";
import { createAudioEngine, type AudioEngine, BIN_HUES } from "./audio";

const MAX_MARBLES = 120;
const AUTO_RAIN_MS = 750; // idle auto-rain interval
const IDLE_BEFORE_DEMO_MS = 5000; // resume demo after this much no interaction
const FIRST_DEMO_MS = 2200; // first auto-rain after load

export default function KidsPlinkoBells() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const audioRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const marblesRef = useRef<Marble[]>([]);
  const pegsRef = useRef<Peg[]>(buildPegs());
  const binHeightsRef = useRef<number[]>(new Array(BINS).fill(0));
  const binFlashRef = useRef<number[]>(new Array(BINS).fill(0));
  const binCountsRef = useRef<number[]>(new Array(BINS).fill(0));
  const hueCycleRef = useRef(0);

  const lastInteractRef = useRef(0);
  const lastRainRef = useRef(0);
  const rafRef = useRef(0);
  const lastTRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [backend, setBackend] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const dropMarble = useCallback((nearX?: number) => {
    if (marblesRef.current.length >= MAX_MARBLES) return;
    const hue = BIN_HUES[hueCycleRef.current % BIN_HUES.length];
    hueCycleRef.current++;
    const m = spawnMarble(hue);
    if (typeof nearX === "number") {
      m.x = Math.max(0.1, Math.min(0.9, nearX));
    }
    marblesRef.current.push(m);
  }, []);

  // Animation + physics loop
  const runFrame = useCallback((t: number) => {
    rafRef.current = requestAnimationFrame(runFrame);
    const renderer = rendererRef.current;
    const audio = audioRef.current;
    if (!renderer) return;

    const last = lastTRef.current || t;
    const dt = (t - last) / 1000;
    lastTRef.current = t;
    const now = t;

    // auto-rain when idle
    const sinceInteract = now - lastInteractRef.current;
    const wantDemo =
      lastInteractRef.current === 0
        ? now > FIRST_DEMO_MS
        : sinceInteract > IDLE_BEFORE_DEMO_MS;
    if (wantDemo && now - lastRainRef.current > AUTO_RAIN_MS) {
      lastRainRef.current = now;
      dropMarble();
    }

    // step physics
    const landings = stepPhysics(marblesRef.current, pegsRef.current, dt);
    for (const l of landings) {
      if (audio) audio.ringBell(l.bin, l.velocity);
      binCountsRef.current[l.bin] += 1;
      binFlashRef.current[l.bin] = 1;
    }

    // normalize bin heights from counts (relative to current max), with decay
    const counts = binCountsRef.current;
    let maxC = 1;
    for (const c of counts) if (c > maxC) maxC = c;
    for (let b = 0; b < BINS; b++) {
      const target = counts[b] / maxC;
      const h = binHeightsRef.current[b];
      binHeightsRef.current[b] = h + (target - h) * Math.min(1, dt * 3);
      binFlashRef.current[b] = Math.max(0, binFlashRef.current[b] - dt * 2.2);
    }

    // slowly bleed counts so it can play forever without a wall of bars
    if (Math.random() < dt * 0.4) {
      for (let b = 0; b < BINS; b++) {
        counts[b] = Math.max(0, counts[b] - 1);
      }
    }

    // remove landed marbles after a short settle
    marblesRef.current = marblesRef.current.filter(
      (m) => !(m.landed && (m.binIndex >= 0) && Math.random() < 0.06),
    );
    if (marblesRef.current.length > MAX_MARBLES) {
      marblesRef.current.splice(0, marblesRef.current.length - MAX_MARBLES);
    }

    const scene: SceneState = {
      marbles: marblesRef.current,
      pegs: pegsRef.current,
      binHeights: binHeightsRef.current,
      binFlash: binFlashRef.current,
      time: now / 1000,
    };
    try {
      renderer.draw(scene);
    } catch (e) {
      setError("Render error: " + (e instanceof Error ? e.message : "unknown"));
    }
  }, [dropMarble]);

  // Set up renderer + resize once started
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: Renderer;
    try {
      renderer = createRenderer(canvas);
    } catch (e) {
      setError(
        "Could not start graphics: " +
          (e instanceof Error ? e.message : "unknown"),
      );
      return;
    }
    rendererRef.current = renderer;
    setBackend(renderer.backend);

    const applyResize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(rect.width, rect.height, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);

    lastTRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      window.removeEventListener("resize", applyResize);
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [started, runFrame]);

  const handleStart = useCallback(async () => {
    try {
      const audio = createAudioEngine();
      audioRef.current = audio;
      await audio.resume();
      audio.startPad();
      setStarted(true);
    } catch (e) {
      setError(
        "Audio could not start: " +
          (e instanceof Error ? e.message : "unknown") +
          ". Tap again or reload.",
      );
    }
  }, []);

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      lastInteractRef.current = performance.now() || 1;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      // drop a small cluster for a satisfying tap
      dropMarble(nx);
      dropMarble(nx + (Math.random() - 0.5) * 0.04);
      void audioRef.current?.resume();
    },
    [dropMarble],
  );

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#06070d] text-foreground">
      {/* Scene */}
      <div
        ref={wrapRef}
        onPointerDown={started ? handlePointer : undefined}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: started ? "pointer" : "default" }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <Link
          href="/dream"
          className="pointer-events-auto rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur hover:bg-accent"
        >
          ← back
        </Link>
        {backend && (
          <span className="rounded-full bg-black/40 px-3 py-1.5 font-mono text-base text-muted-foreground backdrop-blur">
            {backend === "webgl2" ? "WebGL2" : "Canvas2D"}
          </span>
        )}
      </div>

      {/* Drop hint (no reading required: a big glowing arrow) */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 top-[7%] flex flex-col items-center">
          <div className="animate-bounce text-5xl" aria-hidden>
            ⬇️
          </div>
          <span className="mt-1 text-base text-muted-foreground">tap to drop</span>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-[#06070d]/85 px-6 text-center backdrop-blur">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Marble Bells
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            Drop glowing marbles into the pegs. Chance plays a warm chord — the
            middle bins ring loudest.
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-400 text-6xl shadow-[0_0_60px_rgba(217,70,239,0.5)] transition active:scale-95"
            aria-label="Tap to begin"
          >
            ▶︎
          </button>
          <span className="text-base text-muted-foreground">tap to begin</span>
        </div>
      )}

      {/* Error notice */}
      {error && (
        <div className="absolute inset-x-0 bottom-0 z-20 m-4 rounded-xl bg-black/70 p-4 text-base text-violet-300 backdrop-blur">
          {error}
        </div>
      )}
    </main>
  );
}
