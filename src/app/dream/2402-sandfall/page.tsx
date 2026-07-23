"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { CpuSim, SandSim, SimStats, WORLD_W, WORLD_H, clamp } from "./sim";
import { GpuSim } from "./gpu";
import { SandAudio } from "./audio";

// ---------------------------------------------------------------------------
// 2402-sandfall — a WebGPU-compute granular sandfall instrument.
// Pour tens of thousands of grains; the collisions and flow of the pile drive
// the sound. First compute-shader sim in the lab, with a full CPU fallback.
// ---------------------------------------------------------------------------

const GPU_MAX = 40000;
const CPU_MAX = 3000;
const DEMO_LOOP = 900; // frames (~15 s at 60fps)

type Mode = "init" | "gpu" | "cpu";

interface View extends SimStats {
  mode: Mode;
}

/** Deterministic silent auto-demo: pours a sweeping stream, then shakes the
 *  bin so the pile avalanches, then clears and repeats. Driven purely by the
 *  frame counter — identical on every load, no wall-clock, no Math.random. */
function runDemo(sim: SandSim, frame: number, emit: number) {
  const t = frame % DEMO_LOOP;
  if (t < 340) {
    const x = WORLD_W * (0.5 + 0.28 * Math.sin(t * 0.045));
    const y = WORLD_H * 0.07;
    sim.pour(x, y, Math.cos(t * 0.045) * 0.4, 0, emit);
  } else if (t === 430) {
    sim.shake(-1);
  } else if (t === 475) {
    sim.shake(1);
  } else if (t === 760) {
    sim.reset();
  }
}

export default function SandfallPage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<SandSim | null>(null);
  const audioRef = useRef<SandAudio | null>(null);
  const rafRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const demoRef = useRef<boolean>(true);
  const pourRef = useRef<boolean>(false);
  const posRef = useRef({ x: WORLD_W / 2, y: WORLD_H * 0.07, vx: 0, vy: 0 });
  const lastRef = useRef({ x: WORLD_W / 2, y: 0 });

  const [view, setView] = useState<View>({
    mode: "init",
    count: 0,
    energy: 0,
    flow: 0,
    fall: 0,
    contact: 0,
  });
  const [started, setStarted] = useState(false);
  const [autoDemo, setAutoDemo] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);

  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    try {
      audioRef.current = new SandAudio();
      setStarted(true);
    } catch {
      // No Web Audio — the visual instrument keeps running silently.
      audioRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.stop();
    audioRef.current = null;
    setStarted(false);
  }, []);

  const leaveDemo = useCallback(() => {
    if (demoRef.current) {
      demoRef.current = false;
      setAutoDemo(false);
    }
  }, []);

  const handleShake = useCallback(
    (dir: number) => {
      leaveDemo();
      startAudio();
      simRef.current?.shake(dir);
    },
    [leaveDemo, startAudio],
  );

  const handleClear = useCallback(() => {
    simRef.current?.reset();
  }, []);

  // Boot: feature-detect WebGPU, else CPU fallback. Owns the canvas element,
  // the resize observer, pointer input and the animation loop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    let disposed = false;
    let ro: ResizeObserver | null = null;
    let canvas: HTMLCanvasElement | null = null;

    const sizeCanvas = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.round(rect.width * dpr));
      const h = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas!.getBoundingClientRect();
      return {
        x: clamp((clientX - rect.left) / rect.width, 0, 1) * WORLD_W,
        y: clamp((clientY - rect.top) / rect.height, 0, 1) * WORLD_H,
      };
    };

    const onDown = (e: PointerEvent) => {
      leaveDemo();
      startAudio();
      pourRef.current = true;
      const p = toWorld(e.clientX, e.clientY);
      posRef.current = { x: p.x, y: p.y, vx: 0, vy: 0 };
      lastRef.current = { x: p.x, y: p.y };
      canvas?.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!pourRef.current) return;
      const p = toWorld(e.clientX, e.clientY);
      const vx = clamp((p.x - lastRef.current.x) * 6, -1.2, 1.2);
      posRef.current = { x: p.x, y: p.y, vx, vy: 0 };
      lastRef.current = { x: p.x, y: p.y };
    };
    const onUp = () => {
      pourRef.current = false;
    };

    const frame = () => {
      if (disposed) return;
      const sim = simRef.current;
      if (sim) {
        frameRef.current++;
        const emit = sim.kind === "gpu" ? 42 : 10;
        if (demoRef.current) {
          runDemo(sim, frameRef.current, emit);
        } else if (pourRef.current) {
          const p = posRef.current;
          sim.pour(p.x, p.y, p.vx, p.vy, emit);
        }
        sim.step();
        sim.render();
        audioRef.current?.update(sim.stats);
        if (frameRef.current % 6 === 0) {
          const s = sim.stats;
          setView({
            mode: sim.kind,
            count: s.count,
            energy: s.energy,
            flow: s.flow,
            fall: s.fall,
            contact: s.contact,
          });
        }
      }
      rafRef.current = requestAnimationFrame(frame);
    };

    const boot = async () => {
      let sim: SandSim;
      const gpuCanvas = document.createElement("canvas");
      gpuCanvas.className = "block h-full w-full touch-none";
      try {
        sim = await GpuSim.create(gpuCanvas, GPU_MAX);
        canvas = gpuCanvas;
      } catch {
        const cpuCanvas = document.createElement("canvas");
        cpuCanvas.className = "block h-full w-full touch-none";
        sim = new CpuSim(cpuCanvas, CPU_MAX);
        canvas = cpuCanvas;
      }
      if (disposed) {
        sim.destroy();
        return;
      }
      simRef.current = sim;
      wrap.replaceChildren(canvas);
      sizeCanvas();
      setView((v) => ({ ...v, mode: sim.kind }));

      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      canvas.addEventListener("pointerleave", onUp);
      ro = new ResizeObserver(sizeCanvas);
      ro.observe(canvas);

      rafRef.current = requestAnimationFrame(frame);
    };

    void boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      ro?.disconnect();
      if (canvas) {
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        canvas.removeEventListener("pointerleave", onUp);
      }
      audioRef.current?.stop();
      audioRef.current = null;
      simRef.current?.destroy();
      simRef.current = null;
    };
  }, [leaveDemo, startAudio]);

  const pct = (v: number, max: number) =>
    `${clamp((v / max) * 100, 0, 100).toFixed(0)}%`;

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <header className="mb-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Sandfall · GPU granular instrument
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Sandfall
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Pour a stream of grains into the bin and the pile itself becomes the
            music — motion is loudness, falling is pitch, collisions are grain.
            Shake it and the whole slope avalanches into a rushing swell.
          </p>
        </header>

        {/* Status row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            {view.mode === "gpu"
              ? "WebGPU compute"
              : view.mode === "cpu"
                ? "CPU fallback"
                : "detecting…"}
          </span>
          <span className="rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs text-muted-foreground">
            grains <span className="text-foreground">{view.count}</span>
          </span>
          {autoDemo && (
            <span className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
              auto-demo
            </span>
          )}
          {started && (
            <span className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
              sound on
            </span>
          )}
        </div>

        {view.mode === "cpu" && (
          <p className="mb-3 text-sm text-destructive">
            WebGPU unavailable — running CPU fallback ({CPU_MAX.toLocaleString()}{" "}
            grains instead of {GPU_MAX.toLocaleString()}). Same pour, avalanche
            and audio loop.
          </p>
        )}

        {/* Field */}
        <div
          ref={wrapRef}
          className="relative aspect-[3/2] w-full overflow-hidden rounded-md border border-border"
          style={{ background: "#0a0a12" }}
        />

        {/* Live coupling meters — the sound tracks these */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["motion → loudness", view.energy, 1.0],
              ["flow → rush", view.flow, 0.35],
              ["fall → pitch bend", view.fall, 0.9],
              ["contact → grain", view.contact, 1.5],
            ] as const
          ).map(([label, val, max]) => (
            <div
              key={label}
              className="rounded-md border border-border bg-background/60 p-2"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-100"
                  style={{ width: pct(val, max) }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={started ? stopAudio : startAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {started ? "Stop sound" : "Pour with sound"}
          </button>
          <button
            onClick={() => handleShake(-1)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Shake ⟵
          </button>
          <button
            onClick={() => handleShake(1)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Shake ⟶
          </button>
          <button
            onClick={handleClear}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
          <button
            onClick={() => setNotesOpen(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Click-drag anywhere on the field to aim the pouring stream. On load a
          silent, seeded auto-demo pours and topples a pile on its own — press
          Pour with sound and drag to take over.
        </p>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-1 text-xl font-medium">Sand that sings</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This is the lab&rsquo;s first GPU compute-shader simulation. A
              granular field of up to {GPU_MAX.toLocaleString()} grains steps
              entirely on the GPU: a Jacobi Position-Based-Dynamics solver on a
              fixed-capacity uniform grid resolves collisions each frame, so the
              pile piles, slumps and avalanches like real sand.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The sound is <em>derived from the simulation</em>, not a separate
              track. The field&rsquo;s aggregate motion, flowing fraction, fall
              speed and collision contact are reduced on the GPU into a tiny
              stats buffer, read back each frame to drive three coupled voices —
              a detuned pentatonic drone (louder with motion, bending down as
              grains fall), a band of noise that swells into a rush during an
              avalanche, and a high hiss of sandy contact.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Reference: MLS-MPM / SPH WebGPU fluid &amp; granular work — the
              Codrops &ldquo;WebGPU Fluid Simulations&rdquo; writeup (Feb 2025,
              ~100k particles on an iGPU via MLS-MPM) and the 2026 consensus that
              compute shaders are the single most important capability WebGPU
              adds to the browser.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Degradation is a hard requirement: with no WebGPU the same pour /
              avalanche / audio loop runs as a Canvas2D CPU sim at{" "}
              {CPU_MAX.toLocaleString()} grains. With no AudioContext the visual
              demo continues silently. Everything is seeded (mulberry32, 0x2402)
              and frame-stepped, so the silent review demo is identical on every
              load.
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2402-sandfall"]} />
    </main>
  );
}
