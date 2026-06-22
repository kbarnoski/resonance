"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioFrame,
  Player,
  buildBuiltInPiece,
  buildPlayer,
  decodeFile,
  NUM_BANDS,
} from "./audio";
import {
  GpuCtx,
  buildGpu,
  buildMvp,
  packComputeUniform,
  PARTICLE_COUNT,
  WORKGROUP_DISPATCH,
} from "./gpu";
import { GlCtx, buildGl } from "./webgl-fallback";

type Phase = "idle" | "loading" | "running";
type Backend = "webgpu" | "webgl" | "none";

const BAND_NAMES = ["sub", "bass", "low-mid", "mid", "hi-mid", "presence", "brilliance", "air"];

export default function PathsComputeBloom() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [backend, setBackend] = useState<Backend>("webgpu");
  const [trackName, setTrackName] = useState("built-in tape piano");
  const [dragOver, setDragOver] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveBands, setLiveBands] = useState<number[]>(() => new Array(NUM_BANDS).fill(0));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<Player | null>(null);
  const pendingBufferRef = useRef<AudioBuffer | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const animRef = useRef(0);
  const azRef = useRef(0.5);
  const elRef = useRef(0.2);
  const distRef = useRef(4.6);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const timeRef = useRef(0);
  const bloomRef = useRef(0);

  // ── teardown ───────────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── render loop (starts when phase === running) ──────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    const player = playerRef.current;
    if (!canvas || !player) return;

    let cancelled = false;
    let gpu: GpuCtx | null = null;
    let gl: GlCtx | null = null;
    let lastTime = performance.now();
    let hudTimer = 0;
    let activeBackend: Backend = "none";

    function sizeCanvas(cv: HTMLCanvasElement) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.floor(cv.clientWidth * dpr);
      const h = Math.floor(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
    }

    async function init(cv: HTMLCanvasElement, p: Player) {
      sizeCanvas(cv);
      // try WebGPU first
      try {
        gpu = await buildGpu(cv);
        activeBackend = "webgpu";
      } catch {
        gpu = null;
      }
      if (cancelled) {
        gpu?.destroy();
        return;
      }
      if (!gpu) {
        // fall back to WebGL2
        try {
          gl = buildGl(cv);
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
        timeRef.current += dt;

        // read the live player ref so a track swapped mid-run is picked up
        const activePlayer = playerRef.current ?? p;
        const frame: AudioFrame = activePlayer.getFrame();
        if (frame.onset) bloomRef.current = Math.max(bloomRef.current, frame.onsetEnv);
        bloomRef.current *= 0.9;

        // HUD ~12Hz
        hudTimer += dt;
        if (hudTimer > 0.08) {
          hudTimer = 0;
          setLiveBands(Array.from(frame.bands).slice(0, NUM_BANDS));
        }

        const aspect = cv.width / Math.max(cv.height, 1);
        const mvp = buildMvp(azRef.current, elRef.current, aspect, distRef.current);

        if (activeBackend === "webgpu" && gpu) {
          gpu.device.queue.writeBuffer(
            gpu.computeUniBuf,
            0,
            packComputeUniform(dt, timeRef.current, bloomRef.current, frame.energy, frame.bands),
          );
          const rUni = new Float32Array(20);
          rUni.set(mvp, 0);
          rUni[16] = 0.012; // point half-size in NDC
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
                clearValue: { r: 0.015, g: 0.01, b: 0.03, a: 1 },
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
          gl.step(frame, dt, timeRef.current);
          gl.draw(mvp);
        }

        animRef.current = requestAnimationFrame(loop);
      };
      animRef.current = requestAnimationFrame(loop);
    }

    init(canvas, player);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      gpu?.destroy();
      gl?.destroy();
    };
  }, [phase]);

  // ── start ────────────────────────────────────────────────────────────────────────
  async function handleStart() {
    if (phase === "loading") return;
    setError(null);
    setPhase("loading");
    try {
      // AudioContext must be created/resumed inside the gesture (iOS).
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      audioCtxRef.current = ctx;

      // use a dropped buffer if one was decoded before Start, else built-in piece
      const buffer = pendingBufferRef.current ?? (await buildBuiltInPiece());
      pendingBufferRef.current = null;

      const player = buildPlayer(ctx, buffer);
      player.start();
      playerRef.current = player;
      setPhase("running");
    } catch (e) {
      setError("Could not start audio: " + (e instanceof Error ? e.message : String(e)));
      setPhase("idle");
    }
  }

  // ── file intake ────────────────────────────────────────────────────────────────
  const ingestFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("audio") && !/\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(file.name)) {
        setError("That doesn't look like an audio file.");
        return;
      }
      setTrackName(file.name);
      setError(null);
      try {
        if (playerRef.current && audioCtxRef.current) {
          // already running → swap track live
          const buffer = await decodeFile(file, audioCtxRef.current);
          playerRef.current.stop();
          const player = buildPlayer(audioCtxRef.current, buffer);
          player.start();
          playerRef.current = player;
        } else {
          // before Start → decode with a throwaway context, stash buffer
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const tmp = new AC();
          const buffer = await decodeFile(file, tmp);
          await tmp.close();
          pendingBufferRef.current = buffer;
        }
      } catch {
        setError("Could not decode that audio file.");
        setTrackName("built-in tape piano");
      }
    },
    [],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) ingestFile(file);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) ingestFile(file);
    e.target.value = "";
  }

  // ── pointer orbit ────────────────────────────────────────────────────────────────
  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    azRef.current += (e.clientX - dragRef.current.x) * 0.006;
    elRef.current = Math.max(-1.4, Math.min(1.4, elRef.current - (e.clientY - dragRef.current.y) * 0.006));
    dragRef.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    dragRef.current = null;
  }
  function onWheel(e: React.WheelEvent) {
    distRef.current = Math.max(2.6, Math.min(8, distRef.current + e.deltaY * 0.002));
  }

  const isRunning = phase === "running";

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100vh - 3rem)" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full bg-black"
        style={{ touchAction: "none", cursor: isRunning ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

      {/* top-left: title + nav */}
      <div className="absolute top-4 left-4 max-w-sm pointer-events-none">
        <Link
          href="/dream"
          className="pointer-events-auto text-base text-white/55 hover:text-white/80 transition-colors"
        >
          ← dream lab
        </Link>
        <h1 className="font-serif text-2xl md:text-3xl text-white/95 mt-2 tracking-tight">
          Compute Bloom
        </h1>
        <p className="text-base text-white/75 mt-1 leading-relaxed">
          A piano performance blooms a living particle ecosystem — {PARTICLE_COUNT.toLocaleString()}{" "}
          points pushed by the music&apos;s spectral bands on the GPU.
        </p>
      </div>

      {/* WebGPU-unavailable notice */}
      {isRunning && backend === "webgl" && (
        <div className="absolute top-4 right-4 text-base text-rose-300/90 pointer-events-none text-right max-w-[14rem]">
          (WebGPU unavailable on this device — running the lighter WebGL2 bloom)
        </div>
      )}
      {isRunning && backend === "none" && (
        <div className="absolute top-4 right-4 text-base text-rose-300 pointer-events-none text-right max-w-[14rem]">
          (No WebGPU or WebGL2 here — audio still playing)
        </div>
      )}

      {/* idle / loading overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h2 className="font-serif text-2xl md:text-4xl text-white/95 mb-3 tracking-tight">
            Compute Bloom
          </h2>
          <p className="text-base text-white/75 max-w-md mb-2 leading-relaxed">
            Bring your own recording — or play the built-in piece. A WebGPU compute shader
            integrates half a million particles, pushed outward by bass and scattered into
            sparkle by the highs.
          </p>
          <p className="text-base text-white/55 max-w-md mb-7 leading-relaxed">
            Curl-noise flow after Bridson 2007; latent-particle aesthetic after Refik Anadol.
          </p>

          <button
            onClick={handleStart}
            disabled={phase === "loading"}
            className="px-6 py-3 min-h-[44px] rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/30 transition-colors text-base disabled:opacity-60"
          >
            {phase === "loading" ? "warming the tape…" : "Start the bloom"}
          </button>

          <div
            className={`mt-6 px-5 py-4 rounded-2xl border transition-colors ${
              dragOver
                ? "border-violet-400/70 bg-violet-500/10"
                : "border-white/20 bg-white/[0.03]"
            }`}
          >
            <p className="text-base text-white/75 mb-2">Drop an audio file here</p>
            <label className="inline-block px-4 py-2.5 min-h-[44px] rounded-full bg-white/10 text-white/90 hover:bg-white/20 cursor-pointer text-base transition-colors">
              or pick a track
              <input type="file" accept="audio/*" className="hidden" onChange={onPick} />
            </label>
            <p className="text-base text-white/55 mt-2">now: {trackName}</p>
          </div>

          {error && <p className="text-base text-rose-300 mt-4 max-w-md">{error}</p>}
        </div>
      )}

      {/* bottom controls while running */}
      {isRunning && (
        <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="px-4 py-2.5 min-h-[44px] inline-flex items-center rounded-full bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/30 cursor-pointer text-base transition-colors">
                drop / pick a track
                <input type="file" accept="audio/*" className="hidden" onChange={onPick} />
              </label>
              <button
                onClick={() => setShowNotes((s) => !s)}
                className="px-4 py-2.5 min-h-[44px] rounded-full bg-white/10 text-white/80 hover:bg-white/20 text-base transition-colors"
              >
                Design notes
              </button>
            </div>
            <p className="text-base text-white/55">
              now playing: <span className="text-white/80">{trackName}</span> · drag to orbit ·
              scroll to zoom
            </p>
          </div>

          {/* live FFT bands */}
          <div className="flex items-end gap-1 h-16">
            {liveBands.map((v, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="w-3 rounded-t bg-violet-400/70"
                  style={{ height: `${Math.max(2, v * 56)}px` }}
                />
                <span className="text-xs text-white/55 hidden sm:block">{BAND_NAMES[i]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* design notes panel */}
      {showNotes && isRunning && (
        <div className="absolute bottom-24 left-4 max-w-md p-5 rounded-2xl bg-black/80 border border-white/15 backdrop-blur">
          <h3 className="text-xl text-white/95 mb-2 font-serif">Design notes</h3>
          <p className="text-base text-white/75 leading-relaxed mb-2">
            An <span className="text-violet-300">AnalyserNode</span> FFT splits the spectrum into{" "}
            {NUM_BANDS} bands. A WebGPU compute pass integrates {PARTICLE_COUNT.toLocaleString()}{" "}
            particles each frame: sub-bass and bass swell the core outward, low-mids pull a gentle
            gravity back, and the highs scatter sparkle at the rim. Onset spikes bloom the whole
            cloud; velocity damping gives it memory, so a loud passage stays expanded.
          </p>
          <p className="text-base text-white/55 leading-relaxed">
            Velocity field: curl-noise advection (Bridson, SIGGRAPH 2007). Aesthetic after Refik
            Anadol&apos;s latent-flow particle works. Backend:{" "}
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
