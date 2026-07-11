"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildGrove, GroveEngine, TREE_COUNT } from "./audio";
import {
  buildGpu,
  buildMvp,
  GpuCtx,
  hueToRgb,
  PARTICLE_COUNT,
  TREE_STRIDE_FLOATS,
  WORKGROUP_DISPATCH,
} from "./gpu";
import { buildGl, GlCtx, GlTreeView } from "./webgl-fallback";
import {
  createLandmarker,
  demoWalk,
  PoseLandmarkerInst,
  walkFromLandmarks,
  WalkSignal,
} from "./pose";

type Phase = "idle" | "loading" | "running";
type Backend = "webgpu" | "webgl" | "none";
type Input = "pose" | "auto" | "pointer";

// Listener-position scaling: lateral pans across the grove width, depth walks in.
const LISTEN_X_RANGE = 5.0; // ± metres
const DEPTH_NEAR_Z = 0.5; // listener z when body is large/near
const DEPTH_FAR_Z = -5.0; // listener z when body is small/far (deeper into grove)
const EMA = 0.12; // smoothing on the walk signals

export default function SpatialGrove() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<Backend>("webgpu");
  const [input, setInput] = useState<Input>("pose");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<{ x: number; z: number; near: number }>({
    x: 0,
    z: 0,
    near: 0,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const groveRef = useRef<GroveEngine | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const animRef = useRef(0);
  const inputRef = useRef<Input>("pose");
  // smoothed walk signal + pointer override
  const walkRef = useRef<WalkSignal>({ lateral: 0, depth: 0.5, present: false });
  const pointerRef = useRef<{ x: number; z: number } | null>(null);
  const listenerRef = useRef({ x: 0, z: -1.5 });

  // ── teardown ──────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (groveRef.current) {
      groveRef.current.stop();
      groveRef.current = null;
    }
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        /* noop */
      }
      landmarkerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── render + sense loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    const grove = groveRef.current;
    if (!canvas || !grove) return;

    let cancelled = false;
    let gpu: GpuCtx | null = null;
    let gl: GlCtx | null = null;
    let activeBackend: Backend = "none";
    let lastTime = performance.now();
    let hudTimer = 0;
    let lastDetect = -1;

    const trees = grove.state.trees.map((t) => ({ x: t.x, y: t.y, z: t.z }));

    function sizeCanvas(cv: HTMLCanvasElement) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.floor(cv.clientWidth * dpr);
      const h = Math.floor(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
    }

    // Pack the per-tree storage buffer for the GPU path.
    const treeData = new Float32Array(TREE_COUNT * TREE_STRIDE_FLOATS);
    function packTrees(g: GroveEngine) {
      for (let i = 0; i < g.state.trees.length; i++) {
        const t = g.state.trees[i];
        const glow = Math.min(1, t.brightness * 0.8 + t.bloom * 0.6);
        const [r, gg, b] = hueToRgb(t.hue);
        const o = i * TREE_STRIDE_FLOATS;
        treeData[o] = t.x;
        treeData[o + 1] = t.y;
        treeData[o + 2] = t.z;
        treeData[o + 3] = 1.5; // canopy radius
        treeData[o + 4] = r;
        treeData[o + 5] = gg;
        treeData[o + 6] = b;
        treeData[o + 7] = glow;
      }
      return treeData;
    }

    function treeViews(g: GroveEngine): GlTreeView[] {
      return g.state.trees.map((t) => ({
        x: t.x,
        y: t.y,
        z: t.z,
        hue: t.hue,
        glow: Math.min(1, t.brightness * 0.8 + t.bloom * 0.6),
      }));
    }

    async function init(cv: HTMLCanvasElement, g: GroveEngine) {
      sizeCanvas(cv);
      try {
        gpu = await buildGpu(cv, trees);
        activeBackend = "webgpu";
      } catch {
        gpu = null;
      }
      if (cancelled) {
        gpu?.destroy();
        return;
      }
      if (!gpu) {
        try {
          gl = buildGl(cv, trees);
          activeBackend = "webgl";
        } catch {
          gl = null;
          activeBackend = "none";
        }
      }
      if (!cancelled) setBackend(activeBackend);

      const loop = (now: number) => {
        if (cancelled) return;
        sizeCanvas(cv);
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        const tSec = now / 1000;

        // ── INPUT: resolve the walk signal for this frame ──
        let raw: WalkSignal;
        const mode = inputRef.current;
        if (mode === "pointer" && pointerRef.current) {
          // pointer override drives listener directly; bypass EMA below
          listenerRef.current.x = pointerRef.current.x;
          listenerRef.current.z = pointerRef.current.z;
          raw = { lateral: 0, depth: 0.5, present: true };
        } else if (mode === "pose" && landmarkerRef.current && videoRef.current) {
          const v = videoRef.current;
          if (v.readyState >= 2 && now !== lastDetect) {
            lastDetect = now;
            try {
              const res = landmarkerRef.current.detectForVideo(v, now);
              const lm = res.landmarks?.[0];
              raw = lm ? walkFromLandmarks(lm) : { lateral: 0, depth: 0.5, present: false };
            } catch {
              raw = { lateral: 0, depth: 0.5, present: false };
            }
          } else {
            raw = walkRef.current;
          }
          // if pose is producing nothing usable, gently fall to auto-demo motion
          if (!raw.present) raw = demoWalk(tSec);
        } else {
          raw = demoWalk(tSec);
        }

        if (mode !== "pointer") {
          // EMA-smooth, then map to listener world coords
          const w = walkRef.current;
          w.lateral += (raw.lateral - w.lateral) * EMA;
          w.depth += (raw.depth - w.depth) * EMA;
          w.present = raw.present;
          listenerRef.current.x = w.lateral * LISTEN_X_RANGE;
          listenerRef.current.z = DEPTH_FAR_Z + w.depth * (DEPTH_NEAR_Z - DEPTH_FAR_Z);
        }

        const lx = listenerRef.current.x;
        const lz = listenerRef.current.z;
        g.setListener(lx, lz);
        g.update(now);

        // ── HUD ~10Hz ──
        hudTimer += dt;
        if (hudTimer > 0.1) {
          hudTimer = 0;
          setReadout({ x: lx, z: lz, near: g.state.nearest });
        }

        // ── RENDER ──
        const aspect = cv.width / Math.max(cv.height, 1);
        const mvp = buildMvp(lx, lz, aspect);

        if (activeBackend === "webgpu" && gpu) {
          const cu = new Float32Array([dt, tSec, PARTICLE_COUNT, 0]);
          gpu.device.queue.writeBuffer(gpu.computeUniBuf, 0, cu.buffer);
          gpu.device.queue.writeBuffer(gpu.treeBuf, 0, packTrees(g).buffer);
          const rUni = new Float32Array(20);
          rUni.set(mvp, 0);
          rUni[16] = 0.05; // point half-size in NDC
          gpu.device.queue.writeBuffer(gpu.renderUniBuf, 0, rUni.buffer);

          const cmd = gpu.device.createCommandEncoder();
          const cp = cmd.beginComputePass();
          cp.setPipeline(gpu.computePipeline);
          cp.setBindGroup(0, gpu.computeBG);
          cp.dispatchWorkgroups(WORKGROUP_DISPATCH);
          cp.end();

          const rp = cmd.beginRenderPass({
            colorAttachments: [
              {
                view: gpu.ctx.getCurrentTexture().createView(),
                loadOp: "clear",
                clearValue: { r: 0.015, g: 0.012, b: 0.03, a: 1 },
                storeOp: "store",
              },
            ],
          });
          rp.setPipeline(gpu.renderPipeline);
          rp.setBindGroup(0, gpu.renderBG);
          rp.draw(PARTICLE_COUNT * 6);
          rp.end();
          gpu.device.queue.submit([cmd.finish()]);
        } else if (activeBackend === "webgl" && gl) {
          gl.step(treeViews(g), dt, tSec);
          gl.draw(mvp);
        }

        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    }

    init(canvas, grove);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      gpu?.destroy();
      gl?.destroy();
    };
  }, [phase]);

  // ── start (inside the gesture: AudioContext + camera) ───────────────────────
  async function handleStart() {
    if (phase === "loading") return;
    setError(null);
    setPhase("loading");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      audioCtxRef.current = ctx;

      const grove = buildGrove(ctx);
      groveRef.current = grove;

      // Try camera + MediaPipe Pose. Any failure → auto-demo, audio keeps going.
      let chosen: Input = "auto";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        streamRef.current = stream;
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        await video.play();
        videoRef.current = video;

        const lm = await createLandmarker();
        landmarkerRef.current = lm;
        chosen = "pose";
      } catch {
        // camera denied / no camera / MediaPipe CDN failed → graceful auto-demo
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        chosen = "auto";
        setError(
          "No camera or pose model — walking the grove on its own (auto-demo). Drag to steer.",
        );
      }
      inputRef.current = chosen;
      setInput(chosen);
      setPhase("running");
    } catch (e) {
      setError("Could not start audio: " + (e instanceof Error ? e.message : String(e)));
      setPhase("idle");
    }
  }

  // ── pointer steering (manual fallback / override) ───────────────────────────
  function pointerToListener(e: React.PointerEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width; // 0..1
    const ny = (e.clientY - rect.top) / rect.height; // 0 top .. 1 bottom
    const x = (nx - 0.5) * 2 * LISTEN_X_RANGE;
    // top of screen = deep into grove, bottom = near
    const depth = 1 - ny;
    const z = DEPTH_FAR_Z + depth * (DEPTH_NEAR_Z - DEPTH_FAR_Z);
    pointerRef.current = { x, z };
  }
  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    inputRef.current = "pointer";
    setInput("pointer");
    pointerToListener(e);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (inputRef.current === "pointer" && pointerRef.current) pointerToListener(e);
  }

  const isRunning = phase === "running";

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full bg-black"
        style={{ touchAction: "none", cursor: isRunning ? "crosshair" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
      />

      {/* top-left: title + nav */}
      <div className="absolute top-4 left-4 max-w-md pointer-events-none">
        <Link
          href="/dream"
          className="pointer-events-auto text-base text-muted-foreground hover:text-foreground transition-colors"
        >
          ← dream lab
        </Link>
        <h1 className="font-semibold text-2xl md:text-3xl text-foreground mt-2 tracking-tight">
          Spatial Grove
        </h1>
        <p className="text-base text-muted-foreground mt-1 leading-relaxed">
          Walk through a living grove of {TREE_COUNT} generative song-trees — your body pans you
          across them, your distance walks you deeper. Each tree a fixed, spatialized voice you
          wander among.
        </p>
      </div>

      {/* backend notices */}
      {isRunning && backend === "webgl" && (
        <div className="absolute top-4 right-4 text-base text-violet-300/90 pointer-events-none text-right max-w-[15rem]">
          (WebGPU unavailable — running the lighter WebGL2 grove; audio unchanged)
        </div>
      )}
      {isRunning && backend === "none" && (
        <div className="absolute top-4 right-4 text-base text-violet-300 pointer-events-none text-right max-w-[15rem]">
          (No WebGPU or WebGL2 here — the grove still plays in your ears)
        </div>
      )}

      {/* idle / loading overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h2 className="font-semibold text-2xl md:text-4xl text-foreground mb-3 tracking-tight">
            Spatial Grove
          </h2>
          <p className="text-base text-muted-foreground max-w-md mb-2 leading-relaxed">
            A fixed field of HRTF-spatialized song-trees. Step left and right to pan across the
            grove; lean in or step back to walk deeper among the voices. Each tree drifts slowly
            over minutes — never the same grove twice.
          </p>
          <p className="text-base text-muted-foreground max-w-md mb-7 leading-relaxed">
            After Cardiff &amp; Miller&apos;s <span className="italic">Forty Part Motet</span>{" "}
            (inverted: the field is fixed, you move) · spatial-audio-objects after AudioMiXR &amp;
            MoXaRt · slow generative drift after Eno.
          </p>

          <button
            onClick={handleStart}
            disabled={phase === "loading"}
            className="px-6 py-3 min-h-[44px] rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/30 transition-colors text-base disabled:opacity-60"
          >
            {phase === "loading" ? "entering the grove…" : "Enter the grove"}
          </button>

          <p className="text-base text-muted-foreground max-w-md mt-5 leading-relaxed">
            Allow the camera to walk with your body. No camera? It walks a slow figure-8 on its own,
            and you can drag to steer.
          </p>

          {error && <p className="text-base text-violet-300 mt-4 max-w-md">{error}</p>}
        </div>
      )}

      {/* running: live readout + controls */}
      {isRunning && (
        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowNotes((s) => !s)}
                className="px-4 py-2.5 min-h-[44px] rounded-full bg-muted text-foreground hover:bg-accent text-base transition-colors"
              >
                Design notes
              </button>
              <span className="px-3 py-2 rounded-full bg-violet-500/20 text-violet-200 text-base">
                input:{" "}
                {input === "pose" ? "body / pose" : input === "pointer" ? "drag-steer" : "auto-demo"}
              </span>
            </div>
            <p className="text-base text-muted-foreground">
              drag anywhere to steer the listener · walk near a tree to bloom its voice
            </p>
          </div>

          {/* live listener readout */}
          <div className="font-mono text-base text-muted-foreground text-right leading-relaxed">
            <div>
              listener X{" "}
              <span className="text-violet-300">{readout.x.toFixed(2)}</span>
            </div>
            <div>
              listener Z{" "}
              <span className="text-violet-300">{readout.z.toFixed(2)}</span>
            </div>
            <div className="text-muted-foreground">nearest tree #{readout.near}</div>
          </div>
        </div>
      )}

      {/* design notes panel */}
      {showNotes && isRunning && (
        <div className="absolute bottom-28 left-4 max-w-lg p-5 rounded-2xl bg-black/80 border border-border backdrop-blur">
          <h3 className="text-xl text-foreground mb-2 font-semibold">Design notes</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-2">
            {TREE_COUNT} song-trees sit at <span className="text-violet-300">fixed</span> world
            positions in a shallow arc. Each owns a{" "}
            <span className="text-violet-300">PannerNode (HRTF)</span> and plays a slow, sparse motif
            on a soft mode (Lydian / pentatonic). Only the AudioListener moves — your lateral body
            position pans you across the grove, your apparent size (shoulder-width depth proxy) walks
            you deeper. Walk near a tree and its voice blooms in your ears and its canopy brightens.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed mb-2">
            <span className="text-violet-300">Long-form memory:</span> every tree drifts over minutes
            — transposing a scale step, re-densifying its rhythm, or swapping timbre brightness — so
            minute 5 is not minute 1.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            Visuals: a {backend === "webgpu" ? "WebGPU compute" : "WebGL2"} particle field
            ({PARTICLE_COUNT.toLocaleString()} points on WebGPU) swirls each particle around its home
            tree; nearest canopy blooms. Inverts Cardiff &amp; Miller&apos;s{" "}
            <span className="italic">Forty Part Motet</span> (2001); spatial-audio-objects after
            AudioMiXR (2502.02929) &amp; MoXaRt (2603.10465). Backend:{" "}
            <span className="text-violet-300">
              {backend === "webgpu" ? "WebGPU compute" : backend === "webgl" ? "WebGL2 fallback" : "audio-only"}
            </span>
            .
          </p>
        </div>
      )}
    </div>
  );
}
