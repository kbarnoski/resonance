"use client";

/**
 * 579-silk-choir — pull a luminous sheet of silk and bend a warm choir chord.
 *
 * INPUT: multi-touch / mouse drag on an elastic membrane.
 * TECHNIQUE: 2-D verlet / position-based-dynamics cloth (membrane.ts), run in a
 *   WebGPU compute shader when available (gpu.ts), else a CPU solver.
 * OUTPUT: WebGPU compute + Canvas2D glowing filaments (render.ts).
 * AUDIO: six just-intonation choir voices whose pitch glides CONTINUOUSLY with
 *   each region's tension (audio.ts) — no discrete notes, ever.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeMembrane,
  nearestNode,
  stepMembrane,
  regionTension,
  type Membrane,
} from "./membrane";
import { makeGpuMembrane, type GpuMembrane } from "./gpu";
import { SilkChoir, VOICE_COUNT } from "./audio";
import { drawMembrane } from "./render";

const COLS = 34;
const ROWS = 24;
const WORLD_W = 1000;
const WORLD_H = 700;
const GRAVITY = 220; // gentle billow
const DAMP = 0.985;
const ITERS = 5;

export default function SilkChoirPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [renderer, setRenderer] = useState<"WebGPU" | "Canvas2D" | "…">("…");
  const [error, setError] = useState<string | null>(null);

  const choirRef = useRef<SilkChoir | null>(null);
  const lastInputRef = useRef<number>(0);

  // Unlock audio inside the user gesture (autoplay rules).
  const handleStart = useCallback(() => {
    if (choirRef.current) return;
    try {
      const choir = new SilkChoir();
      choir.start();
      choirRef.current = choir;
      lastInputRef.current = performance.now();
      setStarted(true);
    } catch {
      setError("Audio could not start on this device — the silk still moves.");
      setStarted(true); // still show the living, silent sheet
    }
  }, []);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("This browser has no 2-D canvas.");
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const m: Membrane = makeMembrane({
      cols: COLS,
      rows: ROWS,
      width: WORLD_W,
      height: WORLD_H,
    });

    // Try the WebGPU compute path; fall back silently to CPU verlet.
    let gpu: GpuMembrane | null = null;
    let useGpu = false;
    let disposed = false;
    makeGpuMembrane(m)
      .then((g) => {
        if (disposed) {
          g?.destroy();
          return;
        }
        gpu = g;
        useGpu = !!g;
        setRenderer(g ? "WebGPU" : "Canvas2D");
      })
      .catch(() => setRenderer("Canvas2D"));

    // --- pointer -> world-space grab ---------------------------------------
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const breatheScale = Math.min(cssW / WORLD_W, cssH / WORLD_H) * 0.96;
      const offX = (cssW - WORLD_W * breatheScale) / 2;
      const offY = (cssH - WORLD_H * breatheScale) / 2;
      const x = (clientX - rect.left - offX) / breatheScale;
      const y = (clientY - rect.top - offY) / breatheScale;
      return { x, y };
    };

    const grab = (id: number, clientX: number, clientY: number) => {
      const { x, y } = toWorld(clientX, clientY);
      const node = nearestNode(m, x, y);
      m.grabs.set(id, { node, x, y });
      lastInputRef.current = performance.now();
      demoActive = false;
    };
    const moveGrab = (id: number, clientX: number, clientY: number) => {
      const g = m.grabs.get(id);
      if (!g) return;
      const { x, y } = toWorld(clientX, clientY);
      g.x = x;
      g.y = y;
      lastInputRef.current = performance.now();
    };
    const release = (id: number) => {
      m.grabs.delete(id);
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      grab(e.pointerId, e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!m.grabs.has(e.pointerId)) return;
      moveGrab(e.pointerId, e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      release(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // --- auto-demo: invisibly bend a region when nobody is playing ----------
    let demoActive = false;
    const DEMO_ID = -99;
    let demoPhase = 0;

    const runDemo = (timeMs: number) => {
      const idle = timeMs - lastInputRef.current;
      if (m.grabs.size > 0 && !m.grabs.has(DEMO_ID)) {
        demoActive = false;
        m.grabs.delete(DEMO_ID);
        return;
      }
      if (!demoActive && idle > 3500) {
        demoActive = true;
        demoPhase = timeMs;
      }
      if (demoActive) {
        const t = (timeMs - demoPhase) / 1000;
        // Slowly sweep a grab across the sheet, pulling it down and out so the
        // chord audibly bends, then releasing on a calm loop.
        const cycle = t % 7;
        if (cycle < 5.5) {
          const sweep = (Math.sin(t * 0.6) * 0.5 + 0.5); // 0..1
          const col = Math.floor(sweep * (COLS - 1));
          const row = Math.floor(ROWS * 0.55);
          const node = row * COLS + col;
          const homeX = col * (WORLD_W / (COLS - 1));
          const pull = Math.sin(cycle / 5.5 * Math.PI); // ease in/out
          m.grabs.set(DEMO_ID, {
            node,
            x: homeX + Math.sin(t * 1.3) * 60,
            y: WORLD_H * (0.42 + pull * 0.45),
          });
        } else {
          m.grabs.delete(DEMO_ID); // let it billow back
        }
      }
    };

    // --- main loop ----------------------------------------------------------
    const tensions = new Array(VOICE_COUNT).fill(0);
    const colsPerRegion = COLS / VOICE_COUNT;
    let raf = 0;
    let prevT = performance.now();
    let busy = false;

    const frame = (timeMs: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (timeMs - prevT) / 1000;
      prevT = timeMs;
      if (dt > 0.05) dt = 0.05; // clamp after tab-away
      if (dt <= 0) dt = 1 / 60;

      runDemo(timeMs);

      // Solve the membrane (GPU compute or CPU verlet).
      if (useGpu && gpu && !busy) {
        busy = true;
        gpu
          .step(m, GRAVITY, DAMP, dt * dt, ITERS)
          .catch(() => {
            useGpu = false;
            setRenderer("Canvas2D");
          })
          .finally(() => {
            busy = false;
          });
      } else if (!useGpu) {
        stepMembrane(m, dt, GRAVITY, DAMP, ITERS);
      }

      // Read per-region tension -> drive the choir.
      for (let i = 0; i < VOICE_COUNT; i++) {
        const c0 = Math.floor(i * colsPerRegion);
        const c1 = Math.floor((i + 1) * colsPerRegion);
        tensions[i] = regionTension(m, c0, c1);
      }
      choirRef.current?.setTensions(tensions);

      drawMembrane(ctx, m, cssW, cssH, tensions, timeMs);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      gpu?.destroy();
    };
  }, [started]);

  // Clean up audio on unmount.
  useEffect(() => {
    return () => {
      choirRef.current?.stop();
      choirRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#08070f] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: started ? "block" : "none" }}
      />

      {/* Intro / unlock overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Silk Choir
          </h1>
          <p className="max-w-md text-base text-muted-foreground">
            Pull the silk. The more you stretch it, the higher and brighter the
            voices rise. Let go and they sigh back home.
          </p>
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-full bg-muted px-6 py-2.5 text-base font-medium text-[#08070f] transition hover:bg-card active:scale-95"
          >
            Touch the silk
          </button>
        </div>
      )}

      {/* In-piece chrome */}
      {started && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 select-none">
            <h1 className="text-2xl font-semibold tracking-tight">Silk Choir</h1>
            <p className="mt-1 text-base text-muted-foreground">Pull the silk.</p>
          </div>
          <div className="pointer-events-none absolute right-4 top-4 text-right font-mono text-base text-muted-foreground">
            {renderer}
          </div>
          {error && (
            <p className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 text-base text-violet-300">
              {error}
            </p>
          )}
          <a
            href="/dream/579-silk-choir/README.md"
            className="absolute bottom-4 right-4 font-mono text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
          >
            Read the design notes &rarr;
          </a>
        </>
      )}
    </main>
  );
}
