"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { SlimeGPU } from "./gpu";
import { SlimeFallback } from "./fallback";
import { SlimeAudio } from "./audio";
import { README } from "./readme-text";
import {
  buildEdges,
  diffEdges,
  eigenToFreqs,
  laplacianEigenvalues,
  mulberry32,
  MAX_NODES,
  type Edge,
  type FoodNode,
} from "./graph";

const HIT_RADIUS = 0.045; // normalized: how close a tap must be to grab a seed
const TAP_MOVE = 0.02; // normalized movement below which a tap counts as a "tap"
const HARMONY_MS = 250;

interface PointerState {
  nodeId: number;
  isNew: boolean;
  moved: boolean;
}

/** Deterministic default seeds so the dish is alive the moment you start. */
function seedDefaults(): FoodNode[] {
  const rng = mulberry32(0x5117_e5ee);
  const nodes: FoodNode[] = [];
  for (let i = 0; i < 3; i++) {
    nodes.push({
      id: i + 1,
      x: 0.32 + rng() * 0.36,
      y: 0.34 + rng() * 0.32,
    });
  }
  return nodes;
}

export default function SlimeCantorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<"init" | "gpu" | "fallback">("init");
  const [notice, setNotice] = useState<string | null>(null);
  const [connected, setConnected] = useState(0);
  const [nodeCount, setNodeCount] = useState(3);

  // Engine refs (imperative; avoid render churn in the loop).
  const gpuRef = useRef<SlimeGPU | null>(null);
  const fbRef = useRef<SlimeFallback | null>(null);
  const audioRef = useRef<SlimeAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<FoodNode[]>(seedDefaults());
  const pointersRef = useRef<Map<number, PointerState>>(new Map());
  const nextIdRef = useRef(4);
  const prevEdgesRef = useRef<Edge[]>([]);
  const lastHarmonyRef = useRef(0);
  const harmonyBusyRef = useRef(false);
  const reducedRef = useRef(false);

  // ── canvas sizing ──────────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.min(1600, Math.round(rect.width * dpr)));
    const h = Math.max(1, Math.min(1600, Math.round(rect.height * dpr)));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    sizeCanvas();
    const ro = new ResizeObserver(() => sizeCanvas());
    if (canvasRef.current) ro.observe(canvasRef.current);
    window.addEventListener("resize", sizeCanvas);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sizeCanvas);
    };
  }, [sizeCanvas]);

  // ── harmony update (throttled) ───────────────────────────────────────────────
  const applyHarmony = useCallback((samples: Float32Array | null) => {
    if (!samples) return;
    const audio = audioRef.current;
    const n = nodesRef.current.length;
    const edges = buildEdges(samples, n);
    const eigs = laplacianEigenvalues(edges, n);
    const freqs = edges.length > 0 ? eigenToFreqs(eigs) : [];

    let meanW = 0;
    for (const e of edges) meanW += e.w;
    if (edges.length) meanW /= edges.length;
    const energy = Math.min(1, meanW / 1.5);

    if (audio) audio.setSpectrum(freqs, energy);

    const { added, removed } = diffEdges(prevEdgesRef.current, edges);
    if (audio) {
      const top = freqs.length ? freqs[freqs.length - 1] : 523;
      for (let i = 0; i < added.length; i++) audio.ringBell(top);
      const low = freqs.length ? freqs[0] : 110;
      for (let i = 0; i < removed.length; i++) audio.damp(low);
    }
    prevEdgesRef.current = edges;
    setConnected(edges.length);
  }, []);

  // ── main loop ───────────────────────────────────────────────────────────────
  const runLoop = useCallback(
    (tMs: number) => {
      const time = tMs / 1000;
      const gpu = gpuRef.current;
      const fb = fbRef.current;
      const nodes = nodesRef.current;

      if (gpu && !gpu.isLost) {
        gpu.setFood(nodes);
        gpu.step(time);
        if (
          time - lastHarmonyRef.current > HARMONY_MS / 1000 &&
          !harmonyBusyRef.current
        ) {
          lastHarmonyRef.current = time;
          harmonyBusyRef.current = true;
          gpu
            .readEdges()
            .then((s) => applyHarmony(s))
            .finally(() => {
              harmonyBusyRef.current = false;
            });
        }
      } else if (fb) {
        fb.setFood(nodes);
        fb.step(time);
        if (time - lastHarmonyRef.current > HARMONY_MS / 1000) {
          lastHarmonyRef.current = time;
          applyHarmony(fb.readEdges());
        }
      }
      rafRef.current = requestAnimationFrame(runLoop);
    },
    [applyHarmony],
  );

  // ── start (first gesture) ─────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sizeCanvas();

    // Audio first so the resume rides the user gesture.
    const audio = new SlimeAudio();
    audioRef.current = audio;
    await audio.start();

    const reduced = reducedRef.current;
    let gpu: SlimeGPU | null = null;
    try {
      gpu = await SlimeGPU.create(canvas, { reducedMotion: reduced });
    } catch {
      gpu = null;
    }
    if (gpu) {
      gpu.onLost = (msg) => {
        setNotice(
          `The GPU context was lost (${msg}). The audio keeps playing; reload to restart the visuals.`,
        );
      };
      gpuRef.current = gpu;
      gpu.setFood(nodesRef.current);
      setMode("gpu");
    } else {
      try {
        fbRef.current = new SlimeFallback(canvas, reduced);
        fbRef.current.setFood(nodesRef.current);
        setMode("fallback");
        setNotice(
          "WebGPU isn't available in this browser, so this is a lighter Canvas2D slime. The harmony works exactly the same.",
        );
      } catch {
        setNotice("Could not start a renderer in this browser.");
      }
    }

    setStarted(true);
    rafRef.current = requestAnimationFrame(runLoop);
  }, [started, sizeCanvas, runLoop]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      gpuRef.current?.destroy();
      audioRef.current?.close();
    };
  }, []);

  // ── pointer input (multitouch) ────────────────────────────────────────────────
  const toNorm = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const commitNodes = useCallback((nodes: FoodNode[]) => {
    nodesRef.current = nodes;
    setNodeCount(nodes.length);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const { x, y } = toNorm(e);
      const nodes = nodesRef.current;

      // Nearest existing seed within hit radius?
      let hit = -1;
      let best = HIT_RADIUS;
      for (let i = 0; i < nodes.length; i++) {
        const d = Math.hypot(nodes[i].x - x, nodes[i].y - y);
        if (d < best) {
          best = d;
          hit = i;
        }
      }

      if (hit >= 0) {
        pointersRef.current.set(e.pointerId, {
          nodeId: nodes[hit].id,
          isNew: false,
          moved: false,
        });
      } else if (nodes.length < MAX_NODES) {
        const id = nextIdRef.current++;
        commitNodes([...nodes, { id, x, y }]);
        pointersRef.current.set(e.pointerId, {
          nodeId: id,
          isNew: true,
          moved: false,
        });
      }
    },
    [started, toNorm, commitNodes],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ps = pointersRef.current.get(e.pointerId);
      if (!ps) return;
      e.preventDefault();
      const { x, y } = toNorm(e);
      const nodes = nodesRef.current;
      const idx = nodes.findIndex((n) => n.id === ps.nodeId);
      if (idx < 0) return;
      const d = Math.hypot(nodes[idx].x - x, nodes[idx].y - y);
      if (d > TAP_MOVE) ps.moved = true;
      const nn = nodes.slice();
      nn[idx] = { ...nn[idx], x, y };
      commitNodes(nn);
    },
    [toNorm, commitNodes],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const ps = pointersRef.current.get(e.pointerId);
      if (!ps) return;
      pointersRef.current.delete(e.pointerId);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      // A clean tap on an existing seed removes it (toggle off).
      if (!ps.isNew && !ps.moved) {
        commitNodes(nodesRef.current.filter((n) => n.id !== ps.nodeId));
      }
    },
    [commitNodes],
  );

  const clearFood = useCallback(() => {
    pointersRef.current.clear();
    commitNodes([]);
    prevEdgesRef.current = [];
  }, [commitNodes]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Art canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none", backgroundColor: "#04201c" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Chrome overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-8">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            1916 · Slime Cantor
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            The topology is the harmony
          </h1>
          <p className="text-base text-muted-foreground">
            Place food seeds with your fingers. A living slime grows veins
            between them; the network&apos;s graph-Laplacian eigenvalues become
            an ever-morphing drone.
          </p>
        </header>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start · tap to place food
            </button>
          ) : (
            <button
              onClick={clearFood}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Clear food
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
          {started && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {mode === "gpu" ? "webgpu" : "canvas2d"} · {nodeCount} seeds ·{" "}
              {connected} veins
            </span>
          )}
        </div>
      </div>

      {/* Play hint before start */}
      {started && (
        <p className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          tap empty agar to add · drag to move · tap a seed to remove
        </p>
      )}

      {/* Graceful-degradation / device-lost notice */}
      {notice && (
        <div className="pointer-events-auto absolute bottom-24 left-1/2 w-[min(92vw,32rem)] -translate-x-1/2 rounded-lg border border-border bg-background/90 p-4 shadow-lg backdrop-blur-sm">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {notice}
          </p>
          <button
            onClick={() => setNotice(null)}
            className="mt-3 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README}
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1916-slime-cantor"]} />
    </main>
  );
}
