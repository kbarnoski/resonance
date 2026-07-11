"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeRdSim, type RdSim } from "./gl";
import { makeDisplay, makeCpuRdSim, type CpuRdSim } from "./render";
import { makeInkAudio, type InkAudio } from "./audio";
import {
  REGION_COUNT,
  pickBellTriggers,
  summarizeField,
} from "./sim";

const SIM_SIZE = 256; // GPU grid
const READ_W = 32; // sonification readback grid
const READ_H = 32;
const STEPS_PER_FRAME = 14; // RD iterations per animation frame
const READBACK_MS = 110; // how often we read the field back for audio
const IDLE_MS = 2000; // auto-demo kicks in after this much quiet

// Big, friendly bioluminescent ink colors (linear-ish rgb 0..1).
const INK_COLORS: { name: string; rgb: [number, number, number]; css: string }[] =
  [
    { name: "aqua", rgb: [0.1, 0.9, 0.85], css: "#19e6d8" },
    { name: "violet", rgb: [0.55, 0.35, 1.0], css: "#8c5aff" },
    { name: "rose", rgb: [1.0, 0.35, 0.6], css: "#ff5a99" },
    { name: "lime", rgb: [0.5, 1.0, 0.4], css: "#7fff66" },
  ];

type RenderMode = "webgl2" | "canvas2d" | "";

export default function InkGardenPage() {
  const [started, setStarted] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode>("");
  const [inkIdx, setInkIdx] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string>("");

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const simRef = useRef<RdSim | null>(null);
  const cpuSimRef = useRef<CpuRdSim | null>(null);
  const displayRef = useRef<ReturnType<typeof makeDisplay> | null>(null);
  const audioRef = useRef<InkAudio | null>(null);

  const rafRef = useRef<number>(0);
  const readTimerRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastInputRef = useRef<number>(0);
  const inkRef = useRef<[number, number, number]>(INK_COLORS[0].rgb);

  // sonification state carried between readbacks
  const prevCoverageRef = useRef(0);
  const prevRegionsRef = useRef<number[]>(new Array(REGION_COUNT).fill(0));

  useEffect(() => {
    inkRef.current = INK_COLORS[inkIdx].rgb;
  }, [inkIdx]);

  /* ── seed the field at a normalized (x, y), y-up ──────────────────────── */
  const seedAt = useCallback((nx: number, ny: number, radius = 0.04) => {
    const sim = simRef.current;
    const cpu = cpuSimRef.current;
    if (sim) sim.splat(nx, ny, radius);
    else if (cpu) cpu.splat(nx, ny, radius);
    const audio = audioRef.current;
    if (audio) audio.touchBlip(nx * 2 - 1);
  }, []);

  /* ── pointer handlers ─────────────────────────────────────────────────── */
  const onPointer = useCallback(
    (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = 1 - (e.clientY - r.top) / r.height; // to y-up
      lastInputRef.current = performance.now();
      seedAt(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
    },
    [seedAt],
  );

  /* ── start: build audio + sim, then the loops ─────────────────────────── */
  const handleStart = useCallback(async () => {
    if (started) return;
    try {
      const audio = makeInkAudio();
      await audio.ctx.resume();
      audioRef.current = audio;
    } catch {
      setError("Could not start audio on this device.");
      return;
    }

    // Try GPU path first.
    const glCanvas = glCanvasRef.current;
    let mode: RenderMode = "";
    if (glCanvas) {
      const gl = glCanvas.getContext("webgl2", {
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
      });
      if (gl) {
        const sim = makeRdSim(gl, SIM_SIZE);
        const display = makeDisplay(gl);
        if (sim && display) {
          glRef.current = gl;
          simRef.current = sim;
          displayRef.current = display;
          mode = "webgl2";
          // context-loss handling
          glCanvas.addEventListener(
            "webglcontextlost",
            (ev) => {
              ev.preventDefault();
              setError("Graphics context lost — please reload.");
            },
            { once: true },
          );
        }
      }
    }

    if (mode !== "webgl2") {
      // Canvas2D fallback
      const cpu = makeCpuRdSim(96);
      cpuSimRef.current = cpu;
      mode = "canvas2d";
      setDegraded(true);
    }

    setRenderMode(mode);
    startTimeRef.current = performance.now();
    lastInputRef.current = performance.now() - IDLE_MS; // start with auto-demo
    setStarted(true);
  }, [started]);

  /* ── animation + readback loops (after start) ─────────────────────────── */
  useEffect(() => {
    if (!started) return;
    const wrap = wrapRef.current;
    const glCanvas = glCanvasRef.current;
    const cpuCanvas = cpuCanvasRef.current;
    if (!wrap) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const doResize = () => {
      const r = wrap.getBoundingClientRect();
      if (renderMode === "webgl2" && glCanvas) {
        glCanvas.width = Math.floor(r.width * dpr);
        glCanvas.height = Math.floor(r.height * dpr);
        displayRef.current?.resize(glCanvas.width, glCanvas.height);
      }
      if (renderMode === "canvas2d" && cpuCanvas) {
        const c = cpuSimRef.current;
        if (c) {
          cpuCanvas.width = c.width;
          cpuCanvas.height = c.height;
        }
      }
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);

    wrap.addEventListener("pointerdown", onPointer);
    wrap.addEventListener("pointermove", onPointerMove);

    let autoSeedAcc = 0;

    const loop = () => {
      const now = performance.now();
      const t = (now - startTimeRef.current) / 1000;

      // auto-demo: drop occasional seeds by itself so the screen is alive
      if (now - lastInputRef.current > IDLE_MS) {
        autoSeedAcc += 1;
        if (autoSeedAcc > 28) {
          autoSeedAcc = 0;
          const nx = 0.2 + 0.6 * Math.random();
          const ny = 0.2 + 0.6 * Math.random();
          seedAt(nx, ny, 0.035);
        }
      }

      const sim = simRef.current;
      const cpu = cpuSimRef.current;
      const ink = inkRef.current;
      if (sim && displayRef.current) {
        sim.step(STEPS_PER_FRAME);
        displayRef.current.draw(sim.currentTexture(), sim.width, t, ink);
      } else if (cpu && cpuCanvas) {
        cpu.step(6);
        const ctx2d = cpuCanvas.getContext("2d");
        if (ctx2d) cpu.draw(ctx2d, t, ink);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    function onPointerMove(e: PointerEvent) {
      if (e.buttons > 0) onPointer(e);
    }

    rafRef.current = requestAnimationFrame(loop);

    // readback → sonification (decoupled, ~10Hz)
    const readback = () => {
      const audio = audioRef.current;
      if (!audio) return;
      const sim = simRef.current;
      const cpu = cpuSimRef.current;
      let bField: Float32Array | null = null;
      if (sim) bField = sim.readBackB(READ_W, READ_H);
      else if (cpu) bField = cpu.readBackB(READ_W, READ_H);
      if (!bField) return;

      const summary = summarizeField(
        bField,
        READ_W,
        READ_H,
        prevCoverageRef.current,
        prevRegionsRef.current,
      );
      const nowSec = (performance.now() - startTimeRef.current) / 1000;
      audio.updateFromField(
        summary.coverage,
        summary.activity,
        summary.centroidX,
        nowSec,
      );
      audio.ringBells(pickBellTriggers(summary));

      prevCoverageRef.current = summary.coverage;
      prevRegionsRef.current = summary.regionGrowth.map(
        (g, i) => (prevRegionsRef.current[i] ?? 0) + g,
      );
    };
    readTimerRef.current = window.setInterval(readback, READBACK_MS);

    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(readTimerRef.current);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onPointer);
      wrap.removeEventListener("pointermove", onPointerMove);
    };
  }, [started, renderMode, onPointer, seedAt]);

  /* ── full teardown on unmount ─────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearInterval(readTimerRef.current);
      simRef.current?.dispose();
      simRef.current = null;
      displayRef.current?.dispose();
      displayRef.current = null;
      cpuSimRef.current?.dispose();
      cpuSimRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      const gl = glRef.current;
      if (gl) {
        const lose = gl.getExtension("WEBGL_lose_context");
        lose?.loseContext();
      }
      glRef.current = null;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#03040a] text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="font-semibold text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Ink Garden
        </h1>
        <p className="mt-2 text-base text-foreground">
          Drop a fingertip of magic ink and watch living spots grow and spread
          by themselves — the more the pattern blooms, the fuller the music
          gets.
        </p>

        {/* canvas stage */}
        <div
          ref={wrapRef}
          className="relative mt-5 aspect-square w-full touch-none overflow-hidden rounded-2xl border border-border bg-[#03040a]"
        >
          <canvas ref={glCanvasRef} className="absolute inset-0 h-full w-full" />
          {renderMode === "canvas2d" && (
            <canvas
              ref={cpuCanvasRef}
              className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
            />
          )}

          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50 backdrop-blur-[1px]">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-full bg-gradient-to-r from-violet-300 to-violet-400 px-8 py-2.5 text-base font-semibold text-black shadow-lg transition hover:brightness-110"
              >
                Tap to start
              </button>
              <p className="px-6 text-center text-base text-muted-foreground">
                Sound and living ink begin on tap.
              </p>
            </div>
          )}
        </div>

        {/* ink color swatches — big, generously spaced, no reading needed */}
        {started && (
          <div className="mt-5 flex flex-wrap gap-4">
            {INK_COLORS.map((c, i) => (
              <button
                key={c.name}
                aria-label={`${c.name} ink`}
                onClick={() => setInkIdx(i)}
                style={{ backgroundColor: c.css }}
                className={`h-16 w-16 rounded-full shadow-lg transition ${
                  inkIdx === i
                    ? "ring-4 ring-border scale-110"
                    : "ring-2 ring-border hover:scale-105"
                }`}
              />
            ))}
          </div>
        )}

        {/* status / notices */}
        {error && (
          <p className="mt-3 text-base text-violet-300">{error}</p>
        )}
        {started && degraded && !error && (
          <p className="mt-3 text-base text-violet-300/95">
            Float-texture GPU compute is unavailable here, so the garden is
            running a simpler Canvas2D reaction-diffusion. It still grows and
            still sings.
          </p>
        )}
        {started && !degraded && !error && (
          <p className="mt-3 text-base text-muted-foreground">
            GPU reaction-diffusion live ·{" "}
            <span className="font-mono text-violet-300">
              {SIM_SIZE}×{SIM_SIZE}
            </span>{" "}
            field, sonified at{" "}
            <span className="font-mono text-violet-300">
              {READ_W}×{READ_H}
            </span>
            .
          </p>
        )}

        {/* design notes affordance */}
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="mt-5 text-base text-violet-300 underline underline-offset-4 hover:text-violet-200"
        >
          {showNotes ? "Hide the design notes" : "Read the design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted p-4 text-base text-muted-foreground">
            <p>
              Each fingertip seeds a drop of the activator chemical{" "}
              <span className="text-foreground">B</span> into a Gray-Scott
              reaction-diffusion field. B and a substrate A diffuse and react on
              the GPU; with feed{" "}
              <span className="font-mono text-violet-300">f≈0.0367</span> and kill{" "}
              <span className="font-mono text-violet-300">k≈0.0649</span> the field
              grows soft Turing spots that split and spread — the morphogenesis
              patterns Alan Turing predicted in 1952.
            </p>
            <p>
              We read a tiny{" "}
              <span className="font-mono text-violet-300">32×32</span> downsample
              of the field back to the CPU ten times a second. Total coverage
              opens up a warm I–vi–IV–V chord bed; freshly forming spots ring
              soft bells; the spread rate brightens a gentle filter. Full math,
              the named reference (Karl Sims&apos; reaction-diffusion tutorial),
              and the kids-safety chain live in{" "}
              <span className="text-foreground">README.md</span>.
            </p>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/dream"
            className="text-base text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ← back to the dream lab
          </Link>
        </div>

        <PrototypeNav slugs={["1015-kids-ink-garden"]} />
      </div>
    </main>
  );
}
