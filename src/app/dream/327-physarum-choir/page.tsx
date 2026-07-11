"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 327 · Physarum Choir
//   You don't play notes — you plant TONES AS FOOD, and a living slime-mold
//   network decides, over seconds, which ones to connect. The chord you hear
//   IS which food nodes the network has currently joined: the slime composes
//   the harmony out of its own topology.
//
//   INPUT     audio-file — Karel's real piano recording seeds the food nodes
//             (onset+pitch tap → pitch-mapped positions). Click to plant more.
//   OUTPUT    a WebGPU compute trail-field: ~1M Physarum agents deposit a
//             chemoattractant, sense ahead L/C/R, turn toward the strongest,
//             growing self-organizing veins between the tone sources. Canvas2D
//             CPU fallback at reduced agent count if WebGPU is unavailable.
//   TECHNIQUE Physarum (Jones/Jenson) agent sim whose node-connectivity graph
//             drives a just-intonation harmony engine.
//   VIBE      systems / emergent / organic / Anadol-adjacent.
//
//   Honest note: physarum already lives in this lab at 260-kids-slime-garden
//   (a WebGL CPU sim). What's new here is the WebGPU *compute* implementation
//   and the connectivity-graph → harmony mapping. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveSource, type Seed } from "./source";
import { ChoirEngine } from "./audio";
import {
  makeWebgpuBackend,
  makeCpuBackend,
  type SlimeBackend,
  type FoodNode,
} from "./gpu";

type Phase = "idle" | "loading" | "running";

export default function PhysarumChoirPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backendKind, setBackendKind] = useState<"webgpu" | "cpu" | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceReal, setSourceReal] = useState<boolean | null>(null);
  const [connectedCount, setConnectedCount] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [noAudio, setNoAudio] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const backendRef = useRef<SlimeBackend | null>(null);
  const engineRef = useRef<ChoirEngine | null>(null);
  const foodsRef = useRef<FoodNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  // Size the canvas to its container (square-ish field looks best).
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    canvas.height = Math.max(2, Math.floor(rect.height * dpr));
  }, []);

  // Convert a click on the canvas into a planted food node + a fresh voice.
  const onCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const backend = backendRef.current;
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!backend || !engine || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // pick a scale degree from the vertical position (higher = higher degree)
    const degree = Math.max(0, Math.min(7, Math.round((1 - y) * 7)));
    const octave = y < 0.4 ? 2 : 1;
    const seed: Seed = { x, y, degree, octave };
    const food: FoodNode = { x, y, seed };
    foodsRef.current = foodsRef.current.concat(food);
    backend.addFood(food);
    engine.buildVoices([seed]); // append a single new voice for this node
    setTotalNodes(foodsRef.current.length);
  }, []);

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    // 1) audio engine + source (Karel's recording or synth/auto-seed fallback)
    let engine: ChoirEngine;
    try {
      engine = new ChoirEngine();
    } catch {
      setNoAudio(true);
      setPhase("idle");
      return;
    }
    engineRef.current = engine;

    const source = await resolveSource(engine.ctx);
    setSourceLabel(source.label);
    setSourceReal(source.real);

    const seeds = source.seeds;
    const foods: FoodNode[] = seeds.map((s) => ({ x: s.x, y: s.y, seed: s }));
    foodsRef.current = foods;
    setTotalNodes(foods.length);

    engine.buildVoices(seeds);
    engine.startBed(source.buffer);
    engine.start();

    // 2) slime backend — WebGPU compute, else CPU/Canvas2D fallback
    fitCanvas();
    const canvas = canvasRef.current!;
    let backend: SlimeBackend;
    try {
      backend = await makeWebgpuBackend(canvas, foods);
    } catch {
      try {
        backend = makeCpuBackend(canvas, foods);
      } catch {
        // last resort: keep audio, show notice; no visuals would be a dead page
        setNoAudio(true);
        setPhase("running");
        setBackendKind(null);
        return;
      }
    }
    backendRef.current = backend;
    setBackendKind(backend.kind);

    setPhase("running");

    // 3) drive sim + harmony from connectivity
    const loop = () => {
      const b = backendRef.current;
      const eng = engineRef.current;
      if (!b || !eng) return;
      b.step();
      // sample connectivity a few times a second (cheap, smoothed in the engine)
      frameRef.current++;
      if (frameRef.current % 4 === 0) {
        const conn = b.sampleConnections();
        eng.setConnections(conn);
        let n = 0;
        for (let i = 0; i < conn.length; i++) if (conn[i] > 0.18) n++;
        setConnectedCount(n);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, fitCanvas]);

  // resize handling while running
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => fitCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, fitCanvas]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        backendRef.current?.dispose();
      } catch {
        /* ignore */
      }
      backendRef.current = null;
      try {
        engineRef.current?.dispose();
      } catch {
        /* ignore */
      }
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#060509] text-foreground">
      {/* the living field */}
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: phase === "running" ? "crosshair" : "default" }}
        aria-label="Physarum slime-mold trail field connecting tone-source food nodes"
      />

      {/* idle / intro overlay */}
      {phase !== "running" && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
            Physarum Choir
          </h1>
          <p className="mt-4 max-w-xl text-base text-foreground">
            Don&apos;t play notes — plant <em>tones as food</em>. A living
            slime-mold network decides, over seconds, which ones to connect. The
            chord you hear <em>is</em> the topology it grows.
          </p>
          <button
            onClick={start}
            disabled={phase === "loading"}
            className="mt-8 min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/15 px-6 py-2.5 text-base text-foreground transition hover:bg-violet-500/25 disabled:opacity-60"
          >
            {phase === "loading" ? "Growing the network…" : "Plant the first tones"}
          </button>
          {noAudio && (
            <p className="mt-6 max-w-md text-base text-violet-300">
              This browser doesn&apos;t support the Web Audio API, so the choir
              can&apos;t play here. Try a recent Chrome, Safari, or Firefox.
            </p>
          )}
          <a
            href="/dream/327-physarum-choir/README.md"
            className="mt-10 text-base text-muted-foreground underline-offset-4 hover:underline"
          >
            Read the design notes
          </a>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm">
            <h1 className="font-serif text-xl text-foreground">Physarum Choir</h1>
            <p className="mt-1 text-base text-muted-foreground">
              The slime is composing — each vein it grows to a tone swells that
              voice in. Click to plant another tone.
            </p>
            <div className="mt-3 space-y-1 font-mono text-sm">
              {sourceReal === true && (
                <p className="text-violet-300/95">{sourceLabel}</p>
              )}
              {sourceReal === false && (
                <p className="text-violet-300/95">♪ {sourceLabel}</p>
              )}
              {backendKind === "webgpu" && (
                <p className="text-violet-300">
                  WebGPU compute · ~1M agents
                </p>
              )}
              {backendKind === "cpu" && (
                <p className="text-violet-300/95">
                  Canvas2D / CPU fallback — no WebGPU compute here, reduced agent
                  count
                </p>
              )}
              {backendKind === null && (
                <p className="text-violet-300">
                  No GPU and no 2D canvas — audio only
                </p>
              )}
              <p className="text-muted-foreground">
                connected voices: {connectedCount} / {totalNodes}
              </p>
            </div>
          </div>

          <a
            href="/dream/327-physarum-choir/README.md"
            className="absolute bottom-4 right-4 z-10 text-base text-muted-foreground underline-offset-4 hover:underline"
          >
            Read the design notes
          </a>
        </>
      )}
    </main>
  );
}
