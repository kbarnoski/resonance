"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  type Nutrient,
  type FieldStats,
  makeCpuSim,
  stepCpuAgents,
  diffuseCpu,
  statsCpu,
  drawCpuField,
  type CpuSim,
} from "./physarum";
import {
  type GpuPhysarum,
  buildGpu,
  writeNutrients,
  stepGpu,
  renderGpu,
  requestStats,
  destroyGpu,
  MAX_NUTRIENTS,
} from "./gpu";
import { createAudio, type AudioEngine } from "./audio";

const GPU_FIELD = 512;
const GPU_AGENTS = 300_000;
const CPU_FIELD = 256;
const CPU_AGENTS = 45_000;

type Path = "gpu" | "cpu";
type Phase = "intro" | "running";

// Pre-seeded nutrient wells so the web is alive on load.
function seedNutrients(): Nutrient[] {
  const seeds: Nutrient[] = [
    { x: 0.32, y: 0.34, strength: 1.0 },
    { x: 0.68, y: 0.4, strength: 0.9 },
    { x: 0.5, y: 0.66, strength: 1.0 },
    { x: 0.24, y: 0.7, strength: 0.7 },
    { x: 0.76, y: 0.72, strength: 0.7 },
  ];
  return seeds;
}

export default function CosmicWebPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nutrientsRef = useRef<Nutrient[]>(seedNutrients());
  const pointerRef = useRef<{ x: number; y: number; down: boolean }>({ x: 0.5, y: 0.5, down: false });
  const statsRef = useRef<FieldStats>({ energy: 0, variance: 0, panX: 0.5, panY: 0.5 });
  const audioRef = useRef<AudioEngine | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [path, setPath] = useState<Path | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({ energy: 0, variance: 0, agents: 0 });

  // Pointer → seed nutrients ───────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || phase !== "running") return;
    const toNorm = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
    };
    const place = (cx: number, cy: number) => {
      const { x, y } = toNorm(cx, cy);
      const list = nutrientsRef.current;
      // Reinforce an existing nearby well, else add (capped).
      const near = list.find((n) => Math.hypot(n.x - x, n.y - y) < 0.04);
      if (near) {
        near.strength = Math.min(1.6, near.strength + 0.4);
      } else {
        list.push({ x, y, strength: 1.1 });
        if (list.length > MAX_NUTRIENTS) list.shift();
      }
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointerRef.current.down = true;
      place(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!pointerRef.current.down) return;
      // throttle drag-seeding so we don't spam wells
      if (Math.random() < 0.12) place(e.clientX, e.clientY);
    };
    const onUp = () => { pointerRef.current.down = false; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [phase]);

  // Main sim loop (GPU with CPU fallback) ────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let cancelled = false;
    let gpu: GpuPhysarum | null = null;
    let cpu: CpuSim | null = null;
    let cpuCanvas: HTMLCanvasElement | null = null;
    let cpu2d: CanvasRenderingContext2D | null = null;
    let cpuImg: ImageData | null = null;
    let frame = 0;
    let autoTimer = 0;
    let lastT = performance.now();

    // autonomous nutrient drift so a hands-off glance keeps evolving.
    const drift = (dt: number) => {
      autoTimer += dt;
      const list = nutrientsRef.current;
      // slowly decay strengths so old wells fade and the network re-routes
      for (const n of list) n.strength = Math.max(0.25, n.strength - dt * 0.012);
      // every ~7s add or relocate a well
      if (autoTimer > 7) {
        autoTimer = 0;
        if (list.length < MAX_NUTRIENTS && Math.random() < 0.6) {
          list.push({
            x: 0.12 + Math.random() * 0.76,
            y: 0.12 + Math.random() * 0.76,
            strength: 0.7 + Math.random() * 0.5,
          });
        } else if (list.length > 0) {
          const n = list[(Math.random() * list.length) | 0];
          n.x = Math.min(0.92, Math.max(0.08, n.x + (Math.random() - 0.5) * 0.18));
          n.y = Math.min(0.92, Math.max(0.08, n.y + (Math.random() - 0.5) * 0.18));
          n.strength = 0.8 + Math.random() * 0.6;
        }
      }
    };

    const onStats = (s: FieldStats) => {
      statsRef.current = s;
    };

    const runGpu = (g: GpuPhysarum) => {
      const tick = (now: number) => {
        if (cancelled || !gpu) return;
        const dt = Math.min((now - lastT) / 1000, 0.1);
        lastT = now;
        drift(dt);
        writeNutrients(g, nutrientsRef.current);
        // a few sim sub-steps for faster network growth
        stepGpu(g, nutrientsRef.current.length, now * 0.001);
        renderGpu(g);
        frame++;
        if (frame % 4 === 0) requestStats(g, onStats);
        const a = audioRef.current;
        if (a) a.update(statsRef.current, now * 0.001);
        if (frame % 12 === 0) {
          setHud({
            energy: statsRef.current.energy,
            variance: statsRef.current.variance,
            agents: g.agentCount,
          });
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const runCpu = () => {
      cpu = makeCpuSim(CPU_FIELD, CPU_FIELD, CPU_AGENTS);
      cpuCanvas = document.createElement("canvas");
      cpuCanvas.width = CPU_FIELD;
      cpuCanvas.height = CPU_FIELD;
      cpu2d = cpuCanvas.getContext("2d");
      const dctx = canvas.getContext("2d");
      if (!cpu2d || !dctx) {
        setErr("Canvas 2D unavailable.");
        return;
      }
      cpuImg = cpu2d.createImageData(CPU_FIELD, CPU_FIELD);
      const fitCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(canvas.offsetWidth * dpr);
        canvas.height = Math.round(canvas.offsetHeight * dpr);
      };
      fitCanvas();

      const tick = (now: number) => {
        if (cancelled || !cpu || !cpu2d || !cpuImg) return;
        const dt = Math.min((now - lastT) / 1000, 0.1);
        lastT = now;
        drift(dt);
        const nl = nutrientsRef.current;
        // two sub-steps for livelier growth
        stepCpuAgents(cpu, nl);
        diffuseCpu(cpu, nl);
        statsRef.current = statsCpu(cpu);
        drawCpuField(cpu, cpuImg, nl);
        cpu2d.putImageData(cpuImg, 0, 0);
        // scale the small sim canvas up to the display canvas
        dctx.imageSmoothingEnabled = true;
        dctx.drawImage(cpuCanvas!, 0, 0, canvas.width, canvas.height);
        frame++;
        const a = audioRef.current;
        if (a) a.update(statsRef.current, now * 0.001);
        if (frame % 8 === 0) {
          setHud({
            energy: statsRef.current.energy,
            variance: statsRef.current.variance,
            agents: CPU_AGENTS,
          });
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    // Try WebGPU, fall back to CPU.
    const resizeGpuCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };

    (async () => {
      if (navigator.gpu) {
        try {
          resizeGpuCanvas();
          const g = await buildGpu(canvas, GPU_FIELD, GPU_AGENTS);
          if (cancelled) { destroyGpu(g); return; }
          gpu = g;
          setPath("gpu");
          runGpu(g);
          return;
        } catch (e) {
          setErr(e instanceof Error ? `WebGPU unavailable — using CPU fallback (${e.message})` : "WebGPU failed; CPU fallback");
        }
      }
      if (cancelled) return;
      setPath("cpu");
      runCpu();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (gpu) destroyGpu(gpu);
    };
  }, [phase]);

  // Mute toggle
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = a.ctx.currentTime;
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setTargetAtTime(muted ? 0 : 0.85, t, 0.3);
  }, [muted]);

  // Teardown audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        const eng = createAudio();
        await eng.resume();
        audioRef.current = eng;
      } catch {
        // audio device may be absent (headless) — sim still runs silently
      }
    }
    setPhase("running");
  }, []);

  return (
    <div className="relative w-full bg-black" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#05030f", cursor: phase === "running" ? "crosshair" : "default", touchAction: "none" }}
      />

      {phase === "intro" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.35em] text-violet-300/90">
            Resonance · dream 1066
          </p>
          <h1 className="mb-4 font-serif text-3xl text-foreground md:text-5xl">The Cosmic Web</h1>
          <p className="mb-3 max-w-xl text-base leading-relaxed text-foreground md:text-lg">
            The same slime-mold algorithm astronomers used to map dark-matter
            filaments, turned into a playable cosmic-ambient instrument. Seed
            luminous nutrients into the void; a living filament network grows
            between them, and the web&apos;s connectivity sings.
          </p>
          <p className="mb-8 max-w-lg text-base leading-relaxed text-muted-foreground">
            Click and drag to plant nutrient wells. The network&apos;s total
            energy opens the drone; its branchiness rings sparse bells; the
            brightest region pans the field. It drifts and sounds on its own.
          </p>

          <button
            onClick={begin}
            className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-300/10 px-8 py-2.5 text-base font-medium text-foreground transition hover:border-violet-300/80 hover:bg-violet-300/20"
          >
            Enter the cosmic web
          </button>

          <a
            href="/dream/1066-cosmic-web/README.md"
            target="_blank"
            rel="noreferrer"
            className="mt-6 text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </a>
          <Link href="/dream" className="mt-8 text-base text-muted-foreground hover:text-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1 select-none">
            <span className="font-serif text-xl text-foreground">The Cosmic Web</span>
            {path === "gpu" && (
              <span className="font-mono text-base text-violet-300/95">WebGPU compute · {hud.agents.toLocaleString()} agents</span>
            )}
            {path === "cpu" && (
              <span className="font-mono text-base text-violet-300/95">CPU fallback · {hud.agents.toLocaleString()} agents</span>
            )}
            {!path && <span className="font-mono text-base text-muted-foreground">initialising…</span>}
            <span className="font-mono text-base text-muted-foreground">
              energy {hud.energy.toFixed(2)} · busy {hud.variance.toFixed(2)}
            </span>
          </div>

          <div className="absolute right-4 top-4 flex flex-col items-end gap-2 select-none">
            <button
              onClick={() => setMuted((m) => !m)}
              className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition hover:border-border hover:text-foreground"
            >
              {muted ? "unmute" : "mute"}
            </button>
            <a
              href="/dream/1066-cosmic-web/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-base text-muted-foreground hover:text-foreground"
            >
              design notes ↗
            </a>
            <Link href="/dream" className="text-base text-muted-foreground hover:text-foreground">← back</Link>
          </div>

          <p className="pointer-events-none absolute bottom-4 left-4 select-none font-mono text-base text-muted-foreground">
            click &amp; drag to seed nutrient wells · filaments grow between them
          </p>

          {err && (
            <p className="absolute bottom-4 right-4 max-w-xs rounded border border-violet-300/30 px-3 py-2 text-base text-violet-300/95">
              {err}
            </p>
          )}
        </>
      )}
    </div>
  );
}
