"use client";

// Liquid Light — finger-paint a pool of living liquid light that SINGS.
// WebGPU stable-fluids (compute shaders) with a Canvas2D particle fallback.
// Kids-first: no reading required, no fail state, always-on ambient pad,
// hands-free ghost-finger auto-demo from frame one.

import { useEffect, useRef, useState, useCallback } from "react";
import { GpuFluid, type FluidPointer } from "./fluid-gpu";
import { FallbackFluid } from "./fluid-fallback";
import { LiquidAudio } from "./audio";

// Warm, kid-friendly dye palette (rgb 0..1). Cycles as you play.
const PALETTE: Array<[number, number, number]> = [
  [0.65, 0.35, 1.0], // violet
  [0.3, 0.6, 1.0], // sky
  [0.2, 0.9, 0.85], // teal
  [0.4, 1.0, 0.55], // green
  [1.0, 0.85, 0.35], // gold
  [1.0, 0.5, 0.7], // rose
];

type Mode = "gpu" | "fallback";

interface PointerState {
  x: number;
  y: number;
  px: number;
  py: number;
  down: boolean;
  colorIdx: number;
}

export default function LiquidLight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // mutable refs (avoid re-renders in the RAF loop)
  const gpuRef = useRef<GpuFluid | null>(null);
  const fbRef = useRef<FallbackFluid | null>(null);
  const audioRef = useRef<LiquidAudio | null>(null);
  const rafRef = useRef<number>(0);
  const ptr = useRef<PointerState>({
    x: 0.5,
    y: 0.5,
    px: 0.5,
    py: 0.5,
    down: false,
    colorIdx: 0,
  });
  const lastTimeRef = useRef<number>(0);
  const lastUserInputRef = useRef<number>(0);
  const ghostActiveRef = useRef<boolean>(true);
  const ghostPhaseRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  // Resize the canvas backing store to its display size (capped DPR for perf).
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(2, Math.floor(rect.width * dpr));
    const h = Math.max(2, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      sizeRef.current = { w, h };
      fbRef.current?.resize();
    }
  }, []);

  // Convert a client point to normalized 0..1 grid coords.
  const toNorm = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    };
  }, []);

  // ---- pointer handlers ----
  const onDown = useCallback(
    (clientX: number, clientY: number) => {
      const n = toNorm(clientX, clientY);
      const p = ptr.current;
      p.px = n.x;
      p.py = n.y;
      p.x = n.x;
      p.y = n.y;
      p.down = true;
      // cancel ghost; advance color so each new stroke can shift hue
      ghostActiveRef.current = false;
      lastUserInputRef.current = performance.now();
    },
    [toNorm],
  );

  const onMove = useCallback(
    (clientX: number, clientY: number) => {
      const p = ptr.current;
      if (!p.down) return;
      const n = toNorm(clientX, clientY);
      p.x = n.x;
      p.y = n.y;
      lastUserInputRef.current = performance.now();
    },
    [toNorm],
  );

  const onUp = useCallback(() => {
    const p = ptr.current;
    p.down = false;
    p.colorIdx = (p.colorIdx + 1) % PALETTE.length;
    lastUserInputRef.current = performance.now();
  }, []);

  // ---- the animation loop ----
  const frame = useCallback((now: number) => {
    rafRef.current = requestAnimationFrame(frame);
    const last = lastTimeRef.current || now;
    let dt = (now - last) / 1000;
    lastTimeRef.current = now;
    if (dt <= 0 || dt > 0.1) dt = 1 / 60; // clamp hitches

    const p = ptr.current;

    // Ghost finger: resume after ~4s idle; wander a calm lissajous path.
    if (!p.down && now - lastUserInputRef.current > 4000) {
      ghostActiveRef.current = true;
    }
    let active = p.down;
    let gx = p.x;
    let gy = p.y;
    let pdx: number;
    let pdy: number;

    if (p.down) {
      // velocity impulse from finger motion (normalized units)
      pdx = (p.x - p.px) ;
      pdy = (p.y - p.py);
      p.px = p.x;
      p.py = p.y;
    } else if (ghostActiveRef.current) {
      active = true;
      ghostPhaseRef.current += dt;
      const t = ghostPhaseRef.current;
      const nx = 0.5 + 0.32 * Math.sin(t * 0.6) * Math.cos(t * 0.27);
      const ny = 0.5 + 0.3 * Math.sin(t * 0.43 + 1.3);
      pdx = nx - p.x;
      pdy = ny - p.y;
      gx = nx;
      gy = ny;
      // persist ghost position so next frame's delta is continuous
      p.x = nx;
      p.y = ny;
      p.px = nx;
      p.py = ny;
      // cycle ghost color slowly
      p.colorIdx = Math.floor(t * 0.25) % PALETTE.length;
    } else {
      pdx = 0;
      pdy = 0;
    }

    const [cr, cg, cb] = PALETTE[p.colorIdx % PALETTE.length];

    // speed estimate for audio (normalized motion magnitude)
    const motion = Math.hypot(pdx, pdy);
    const speed = Math.min(1, motion * 14);

    // ---- drive simulation ----
    const gpu = gpuRef.current;
    const fb = fbRef.current;
    if (gpu) {
      // velocity injected in grid units; scale impulse up so drags feel strong
      const fp: FluidPointer = {
        x: gx,
        y: gy,
        dx: pdx * gpu.grid * 0.9,
        dy: pdy * gpu.grid * 0.9,
        r: cr,
        g: cg,
        b: cb,
        down: active,
      };
      gpu.step(fp, Math.min(dt * 60, 1.3));
    } else if (fb) {
      const { w, h } = sizeRef.current;
      fb.step(
        gx * w,
        gy * h,
        pdx * w,
        pdy * h,
        cr,
        cg,
        cb,
        active,
        dt,
      );
    }

    // ---- drive audio ----
    const audio = audioRef.current;
    if (audio && audio.isStarted) {
      if (active && speed > 0.005) {
        // hue/register from vertical position (top = high, bottom = low)
        const reg = 1 - Math.min(1, Math.max(0, gy));
        const energy = Math.min(1, speed + 0.2);
        audio.excite(speed, energy, reg);
      } else {
        audio.rest();
      }
    }
  }, []);

  // ---- Start (user gesture: unlock audio + init sim) ----
  const handleStart = useCallback(async () => {
    if (started) return;
    resize();
    const canvas = canvasRef.current;
    if (!canvas) return;

    // audio MUST be created in the gesture
    const audio = new LiquidAudio();
    audio.start();
    audioRef.current = audio;

    // try WebGPU, fall back gracefully
    let chosen: Mode = "fallback";
    try {
      const gpu = await GpuFluid.create(canvas);
      if (gpu) {
        gpuRef.current = gpu;
        chosen = "gpu";
      }
    } catch {
      gpuRef.current = null;
    }

    if (chosen === "fallback") {
      try {
        fbRef.current = new FallbackFluid(canvas);
        setNotice("Playing in lite mode ✨");
      } catch {
        setNotice("Playing in lite mode ✨");
      }
    }

    setMode(chosen);
    setStarted(true);
    lastTimeRef.current = performance.now();
    lastUserInputRef.current = 0; // let ghost run immediately
    ghostActiveRef.current = true;
    rafRef.current = requestAnimationFrame(frame);
  }, [started, resize, frame]);

  // resize listener
  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resize]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      gpuRef.current?.dispose();
      fbRef.current?.dispose();
      audioRef.current?.dispose();
      gpuRef.current = null;
      fbRef.current = null;
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060e] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          onDown(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => onMove(e.clientX, e.clientY)}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          if (ptr.current.down) onUp();
        }}
      />

      {/* Title + notice overlay (non-blocking) */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex flex-col items-center gap-1 px-4 pt-5 text-center">
        <h1 className="text-2xl font-semibold tracking-wide text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-3xl">
          Liquid Light
        </h1>
        {started && (
          <p className="text-base text-muted-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            Drag your finger to swirl the singing light
          </p>
        )}
        {notice && (
          <p className="text-base text-violet-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            {notice}
          </p>
        )}
        {started && mode === "gpu" && (
          <p className="text-base text-muted-foreground">live fluid · WebGPU</p>
        )}
      </div>

      {/* Start gate (the one required control) */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 bg-[#05060e]/70 px-6 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Liquid Light
            </h1>
            <p className="max-w-sm text-base text-muted-foreground">
              Paint a pool of living light with your finger — and listen to it
              sing.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="flex min-h-[64px] items-center justify-center gap-3 rounded-full bg-gradient-to-r from-violet-500 via-violet-500 to-violet-400 px-12 py-5 text-xl font-semibold text-foreground shadow-[0_8px_40px_rgba(168,85,247,0.55)] transition-transform active:scale-95"
            aria-label="Start"
          >
            <span className="text-2xl" aria-hidden>
              ✨
            </span>
            Touch to begin
          </button>
        </div>
      )}
    </main>
  );
}
