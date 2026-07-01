"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  type Node,
  type FieldStats,
  makeNode,
  makeCpuSim,
  stepCpuAgents,
  diffuseCpu,
  statsCpu,
  drawCpuField,
  updateConnectivity,
  measureDegree,
  accrete,
  type CpuSim,
} from "./physarum";
import {
  type GpuPhysarum,
  buildGpu,
  writeNodes,
  stepGpu,
  renderGpu,
  requestField,
  destroyGpu,
  MAX_NODES,
  READ_W,
  READ_H,
} from "./gpu";
import { createAudio, type AudioEngine, type NodeSnapshot } from "./audio";
import { DESIGN_NOTES } from "./notes";

const GPU_FIELD = 512;
const GPU_AGENTS = 220_000;
const CPU_FIELD = 256;
const CPU_AGENTS = 22_000;
const CONN_THRESHOLD = 0.9; // trail value a ray must exceed to count as a filament

type Path = "gpu" | "cpu";
type Phase = "intro" | "running";

// Pre-seeded cosmic nodes so the web is alive the instant you enter.
function seedNodes(): Node[] {
  return [
    makeNode(0.32, 0.36, 1.0, 1.0),
    makeNode(0.66, 0.4, 0.9, 0.9),
    makeNode(0.5, 0.66, 1.0, 1.1),
    makeNode(0.26, 0.7, 0.7, 0.7),
    makeNode(0.74, 0.72, 0.8, 0.8),
  ];
}

export default function CosmicConnectomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>(seedNodes());
  const statsRef = useRef<FieldStats>({ energy: 0, variance: 0, panX: 0.5, panY: 0.5 });
  const audioRef = useRef<AudioEngine | null>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [path, setPath] = useState<Path | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ energy: 0, nodes: 0, totalDeg: 0, maxDeg: 0, agents: 0 });

  // Tap-to-seed a node/nutrient well (single discrete clicks/taps — NOT drag).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || phase !== "running") return;
    const onTap = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const list = nodesRef.current;
      const alive = list.filter((n) => n.alive);
      if (alive.length >= MAX_NODES) {
        // absorb into the weakest well instead of exceeding the cap
        const weak = alive.reduce((a, b) => (a.mass < b.mass ? a : b));
        weak.strength = Math.min(1.8, weak.strength + 0.4);
        weak.mass += 0.4;
      } else {
        list.push(makeNode(x, y, 1.1, 0.9));
      }
    };
    el.addEventListener("pointerdown", onTap);
    return () => el.removeEventListener("pointerdown", onTap);
  }, [phase]);

  // Main sim loop (GPU primary, CPU fallback) ────────────────────────────────
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
    let sinceSeed = 0;
    let sinceAccrete = 0;
    let lastT = performance.now();

    // Autonomous accretion: the web evolves itself with zero interaction.
    // Gravity drifts + merges nodes; occasionally a fresh well condenses.
    const evolve = (dt: number) => {
      const list = nodesRef.current;
      // slow strength decay so lonely wells fade and the web re-routes
      for (const n of list) if (n.alive) n.strength = Math.max(0.3, n.strength - dt * 0.01);

      sinceAccrete += dt;
      if (sinceAccrete > 0.1) {
        const merges = accrete(list, sinceAccrete, 0.9);
        sinceAccrete = 0;
        if (merges > 0) {
          const a = audioRef.current;
          if (a) {
            // strike a bell at the heaviest surviving cluster
            const heavy = list.filter((n) => n.alive).reduce((p, c) => (c.mass > p.mass ? c : p), list.find((n) => n.alive)!);
            a.coalesce(heavy.x, heavy.mass);
          }
        }
      }

      // every ~9s a new well condenses out of the void (if room)
      sinceSeed += dt;
      if (sinceSeed > 9) {
        sinceSeed = 0;
        const alive = list.filter((n) => n.alive);
        if (alive.length < MAX_NODES) {
          list.push(makeNode(0.14 + Math.random() * 0.72, 0.14 + Math.random() * 0.72, 0.7 + Math.random() * 0.4, 0.6 + Math.random() * 0.4));
        }
      }
      // prune dead nodes occasionally to keep the array small
      if (frame % 300 === 0) nodesRef.current = list.filter((n) => n.alive);
    };

    // Run connectivity + stats on a low-res summed field (GPU readback OR CPU).
    const analyseField = (field: Float32Array, fw: number, fh: number) => {
      const list = nodesRef.current;
      for (const n of list) {
        if (!n.alive) continue;
        const d = measureDegree(field, fw, fh, n.x, n.y, CONN_THRESHOLD);
        n.degree = n.degree * 0.7 + d * 0.3;
      }
    };

    const pushAudio = (now: number) => {
      const a = audioRef.current;
      if (!a) return;
      const list = nodesRef.current;
      const snaps: NodeSnapshot[] = list
        .filter((n) => n.alive)
        .map((n) => ({ id: n.id, x: n.x, degree: n.degree, mass: n.mass, alive: true }));
      let totalDeg = 0;
      for (const s of snaps) totalDeg += s.degree;
      a.update(snaps, statsRef.current.energy, totalDeg, now * 0.001);
    };

    const refreshHud = () => {
      const alive = nodesRef.current.filter((n) => n.alive);
      let total = 0;
      let mx = 0;
      for (const n of alive) {
        total += n.degree;
        if (n.degree > mx) mx = n.degree;
      }
      setHud({
        energy: statsRef.current.energy,
        nodes: alive.length,
        totalDeg: total,
        maxDeg: mx,
        agents: gpu ? gpu.agentCount * 2 : CPU_AGENTS * 2,
      });
    };

    const runGpu = (g: GpuPhysarum) => {
      const tick = (now: number) => {
        if (cancelled || !gpu) return;
        const dt = Math.min((now - lastT) / 1000, 0.1);
        lastT = now;
        evolve(dt);
        const alive = nodesRef.current.filter((n) => n.alive).length;
        writeNodes(g, nodesRef.current);
        stepGpu(g, alive, now * 0.001);
        renderGpu(g);
        frame++;
        if (frame % 4 === 0) {
          requestField(g, (field) => {
            analyseField(field, READ_W, READ_H);
            // cheap global energy from the same coarse field
            let s = 0;
            for (let i = 0; i < field.length; i++) s += field[i];
            statsRef.current.energy = Math.min(1, s / field.length / 6);
          });
        }
        pushAudio(now);
        if (frame % 12 === 0) refreshHud();
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
        setErr("Canvas 2D unavailable on this machine.");
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
        evolve(dt);
        const nl = nodesRef.current;
        stepCpuAgents(cpu, nl);
        diffuseCpu(cpu, nl);
        statsRef.current = statsCpu(cpu);
        // SAME connectivity extraction as GPU path, on the full summed field
        if (frame % 3 === 0) updateConnectivity(cpu.sum, cpu.w, cpu.h, nl, CONN_THRESHOLD);
        drawCpuField(cpu, cpuImg, nl);
        cpu2d.putImageData(cpuImg, 0, 0);
        dctx.imageSmoothingEnabled = true;
        dctx.drawImage(cpuCanvas!, 0, 0, canvas.width, canvas.height);
        frame++;
        pushAudio(now);
        if (frame % 8 === 0) refreshHud();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const resizeGpuCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };

    (async () => {
      const nav = navigator as unknown as { gpu?: unknown };
      if (nav.gpu) {
        try {
          resizeGpuCanvas();
          const g = await buildGpu(canvas, GPU_FIELD, GPU_AGENTS);
          if (cancelled) {
            destroyGpu(g);
            return;
          }
          gpu = g;
          setPath("gpu");
          runGpu(g);
          return;
        } catch (e) {
          setErr(e instanceof Error ? `WebGPU unavailable — running CPU fallback (${e.message})` : "WebGPU failed; CPU fallback");
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
          <p className="mb-3 font-mono text-base uppercase tracking-[0.35em] text-violet-300">
            Resonance · dream 1089
          </p>
          <h1 className="mb-4 font-serif text-3xl text-white md:text-5xl">Cosmic Connectome</h1>
          <p className="mb-3 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
            The graph-connectivity of a living cosmic-web filament network is the
            thing you hear. A richly-connected super-cluster rings a full chord; a
            lonely node, a single tone. The web thickens into music as it accretes
            over minutes.
          </p>
          <p className="mb-8 max-w-lg text-base leading-relaxed text-white/75">
            Tap to seed nutrient wells. A two-species slime-mold simulation grows
            filaments between them; each node&apos;s measured connectivity — how
            many filaments radiate from it — picks its just-intonation chord.
            Gravity merges nodes into super-clusters, and the swell blooms.
          </p>

          <button
            onClick={begin}
            className="min-h-[44px] rounded-full border border-violet-300/40 bg-violet-300/10 px-8 py-2.5 text-base font-medium text-white transition hover:border-violet-300/80 hover:bg-violet-300/20"
          >
            Enter the cosmic web
          </button>

          <button
            onClick={() => setShowNotes(true)}
            className="mt-6 text-base text-white/75 underline-offset-4 hover:text-white hover:underline"
          >
            Read the design notes
          </button>
          <Link href="/dream" className="mt-8 text-base text-white/55 hover:text-white/80">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1 select-none">
            <span className="font-serif text-xl text-white/95">Cosmic Connectome</span>
            {path === "gpu" && (
              <span className="font-mono text-base text-emerald-300/95">● WebGPU compute · {hud.agents.toLocaleString()} agents</span>
            )}
            {path === "cpu" && (
              <span className="font-mono text-base text-amber-300/95">● CPU fallback · {hud.agents.toLocaleString()} agents</span>
            )}
            {!path && <span className="font-mono text-base text-white/55">initialising…</span>}
            <span className="font-mono text-base text-white/75">
              {hud.nodes} nodes · Σ connectivity {hud.totalDeg.toFixed(1)}
            </span>
            <span className="font-mono text-base text-white/55">
              peak degree {hud.maxDeg.toFixed(1)} · energy {hud.energy.toFixed(2)}
            </span>
          </div>

          <div className="absolute right-4 top-4 flex flex-col items-end gap-2 select-none">
            <button
              onClick={() => setMuted((m) => !m)}
              className="min-h-[44px] rounded-full border border-white/25 px-4 py-2.5 text-base text-white/80 transition hover:border-white/60 hover:text-white"
            >
              {muted ? "unmute" : "mute"}
            </button>
            <button
              onClick={() => setShowNotes(true)}
              className="text-base text-white/75 hover:text-white"
            >
              design notes ↗
            </button>
            <Link href="/dream" className="text-base text-white/55 hover:text-white/85">
              ← back
            </Link>
          </div>

          <p className="pointer-events-none absolute bottom-4 left-4 select-none font-mono text-base text-white/55">
            tap to seed a node · filaments grow between them · gravity merges clusters · it evolves on its own
          </p>

          {err && (
            <p className="absolute bottom-4 right-4 max-w-xs rounded border border-amber-300/30 px-3 py-2 text-base text-amber-300/95">
              {err}
            </p>
          )}
        </>
      )}

      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 px-4 py-8"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-violet-300/25 bg-[#0b0716] p-6 md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-serif text-2xl text-white">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full border border-white/25 px-4 py-2.5 text-base text-white/80 hover:border-white/60 hover:text-white"
              >
                close
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-base leading-relaxed text-white/80">
              {DESIGN_NOTES}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
