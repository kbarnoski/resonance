"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  GRID_W,
  GRID_H,
  PROC_W,
  PROC_H,
  runSyntheticField,
  downsampleToGrid,
  applyFeatures,
  type DepthFeatures,
} from "./depth";
import { runScene, drawCanvas2DFallback, type DepthScene } from "./scene";
import { DepthInstrument } from "./audio";

type ModelState =
  | "idle"
  | "synthetic"
  | "camera-only"
  | "loading-model"
  | "live"
  | "error";

const CDN_TRANSFORMERS =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";

export default function DepthRoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const procRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const sceneRef = useRef<DepthScene | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const instRef = useRef<DepthInstrument | null>(null);
  const rafRef = useRef<number>(0);

  const gridRef = useRef<Float32Array>(new Float32Array(GRID_W * GRID_H));
  const prevGridRef = useRef<Float32Array>(new Float32Array(GRID_W * GRID_H));
  const featRef = useRef<DepthFeatures>({
    nearEnergy: 0,
    spread: 0,
    centroidX: 0.5,
    centroidY: 0.5,
    motion: 0,
  });

  const streamRef = useRef<MediaStream | null>(null);
  const depthPipeRef = useRef<unknown>(null);
  const inferBusyRef = useRef(false);
  const lastInferRef = useRef(0);
  const useWebGLRef = useRef(true);

  const [entered, setEntered] = useState(false);
  const [model, setModel] = useState<ModelState>("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const [feat, setFeat] = useState<DepthFeatures>(featRef.current);
  const [showNotes, setShowNotes] = useState(false);

  // ── live monocular depth inference (throttled ~6fps) ──
  const runInference = useCallback((t: number) => {
    const pipe = depthPipeRef.current as
      | ((input: unknown) => Promise<unknown>)
      | null;
    const video = videoRef.current;
    const proc = procRef.current;
    if (!pipe || !video || !proc || inferBusyRef.current) return;
    if (t - lastInferRef.current < 0.16) return; // ~6 fps
    if (video.readyState < 2) return;

    lastInferRef.current = t;
    inferBusyRef.current = true;

    const pctx = proc.getContext("2d", { willReadFrequently: true });
    if (!pctx) {
      inferBusyRef.current = false;
      return;
    }
    pctx.drawImage(video, 0, 0, PROC_W, PROC_H);

    (async () => {
      try {
        // createImageBitmap from the small offscreen canvas
        const bmp = await createImageBitmap(proc);
        const out = (await pipe(bmp)) as {
          depth?: { data?: Uint8Array | Float32Array; width: number; height: number };
        };
        bmp.close?.();
        const dmap = out?.depth;
        if (dmap?.data) {
          const isU8 = dmap.data instanceof Uint8Array;
          downsampleToGrid(
            dmap.data as Float32Array | Uint8Array,
            dmap.width,
            dmap.height,
            gridRef.current,
            isU8,
          );
        }
      } catch {
        // single-frame failure: keep last grid, don't crash the loop
      } finally {
        inferBusyRef.current = false;
      }
    })();
  }, []);

  // ── render + audio loop (runs even before "enter", driving synthetic field) ──
  const startLoop = useCallback(() => {
    const startT = performance.now();
    let lastUiPush = 0;

    const frame = () => {
      const t = (performance.now() - startT) / 1000;

      // 1. fill grid: try live depth, else synthetic
      const pipe = depthPipeRef.current as
        | ((input: unknown) => Promise<unknown>)
        | null;
      const haveLive = !!pipe && model === "live";

      if (haveLive) {
        runInference(t);
        // grid is updated asynchronously by runInference; nothing to do here
      } else {
        runSyntheticField(gridRef.current, t);
      }

      // 2. features
      const f = applyFeatures(gridRef.current, prevGridRef.current);
      featRef.current = f;
      prevGridRef.current.set(gridRef.current);

      // 3. audio
      instRef.current?.update(f);

      // 4. visuals
      if (useWebGLRef.current && sceneRef.current) {
        sceneRef.current.render(
          gridRef.current,
          f.nearEnergy,
          f.motion,
          f.centroidX,
          f.centroidY,
          t,
        );
      } else if (ctx2dRef.current) {
        drawCanvas2DFallback(ctx2dRef.current, gridRef.current, f.nearEnergy);
      }

      // throttle React state updates for the readout
      if (t - lastUiPush > 0.12) {
        lastUiPush = t;
        setFeat(f);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [model, runInference]);

  // ── camera + model bring-up (best effort, fully degradable) ──
  const bringUpSensors = useCallback(async () => {
    // (a) camera
    let gotCamera = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      gotCamera = true;
      setModel("camera-only");
    } catch {
      setModel("synthetic");
      setErrMsg(
        "Camera unavailable or denied — running on a synthetic depth field. The room still breathes.",
      );
    }

    if (!gotCamera) return;

    // (b) Depth Anything V2 via Transformers.js on WebGPU
    setModel("loading-model");
    try {
      const mod = await import(
        /* webpackIgnore: true */ /* @vite-ignore */ CDN_TRANSFORMERS as string
      ).catch(() => null);
      if (!mod) throw new Error("transformers cdn import failed");
      const { pipeline, env } = mod as {
        pipeline: (task: string, model: string, opts: unknown) => Promise<unknown>;
        env: { allowLocalModels: boolean };
      };
      env.allowLocalModels = false;
      const depth = await pipeline(
        "depth-estimation",
        "onnx-community/depth-anything-v2-small",
        { device: "webgpu" },
      );
      depthPipeRef.current = depth;
      setModel("live");
    } catch {
      // model/WebGPU unavailable → stay on camera-only? No: camera-only would
      // give us no depth. Fall back to synthetic so distance still drives sound.
      depthPipeRef.current = null;
      setModel("synthetic");
      setErrMsg(
        "Depth model / WebGPU unavailable — falling back to a synthetic depth field. Distance still plays.",
      );
    }
  }, []);

  // ── enter the room (user gesture: required for AudioContext) ──
  const enter = useCallback(async () => {
    if (entered) return;
    setEntered(true);

    // audio first (gesture-gated)
    try {
      const inst = new DepthInstrument();
      if (inst.ctx.state === "suspended") await inst.ctx.resume();
      inst.start();
      instRef.current = inst;
    } catch {
      setErrMsg("Audio could not start in this browser.");
    }

    // graphics
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const scene = runScene(canvas);
        if (scene) {
          sceneRef.current = scene;
          useWebGLRef.current = true;
        } else {
          throw new Error("no webgl2");
        }
      } catch {
        useWebGLRef.current = false;
        const c2d = canvas.getContext("2d");
        if (c2d) {
          canvas.width = canvas.clientWidth;
          canvas.height = canvas.clientHeight;
          ctx2dRef.current = c2d;
        }
        setErrMsg(
          (m) =>
            m ||
            "WebGL2 unavailable — using a minimal Canvas2D view of the depth field.",
        );
      }
    }

    // sensors (async, degrades on its own)
    bringUpSensors();
  }, [entered, bringUpSensors]);

  // start the render/audio loop once entered
  useEffect(() => {
    if (!entered) return;
    startLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [entered, startLoop]);

  // hands-off auto-start: kick a synthetic demo within ~0.5s so a glance is alive
  useEffect(() => {
    const id = setTimeout(() => {
      if (!entered) {
        // silent visual preview only (no AudioContext without a gesture)
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scene = runScene(canvas);
        if (scene) {
          sceneRef.current = scene;
          useWebGLRef.current = true;
        } else {
          const c2d = canvas.getContext("2d");
          if (c2d) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
            ctx2dRef.current = c2d;
            useWebGLRef.current = false;
          }
        }
        if (model === "idle") setModel("synthetic");
        // run a visuals-only loop
        const startT = performance.now();
        const frame = () => {
          if (entered) return; // real loop takes over on enter
          const t = (performance.now() - startT) / 1000;
          runSyntheticField(gridRef.current, t);
          const f = applyFeatures(gridRef.current, prevGridRef.current);
          prevGridRef.current.set(gridRef.current);
          if (useWebGLRef.current && sceneRef.current) {
            sceneRef.current.render(
              gridRef.current,
              f.nearEnergy,
              f.motion,
              f.centroidX,
              f.centroidY,
              t,
            );
          } else if (ctx2dRef.current) {
            drawCanvas2DFallback(ctx2dRef.current, gridRef.current, f.nearEnergy);
          }
          rafRef.current = requestAnimationFrame(frame);
        };
        rafRef.current = requestAnimationFrame(frame);
      }
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── teardown on unmount ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        streamRef.current?.getTracks().forEach((tk) => tk.stop());
      } catch {
        /* noop */
      }
      sceneRef.current?.dispose();
      sceneRef.current = null;
      instRef.current?.close();
      instRef.current = null;
      depthPipeRef.current = null;
    };
  }, []);

  const statusLabel: Record<ModelState, { text: string; cls: string }> = {
    idle: { text: "asleep", cls: "text-muted-foreground" },
    synthetic: { text: "synthetic depth field", cls: "text-violet-300" },
    "camera-only": { text: "camera live", cls: "text-violet-300/95" },
    "loading-model": { text: "loading Depth Anything V2…", cls: "text-violet-300/95" },
    live: { text: "live depth (Depth Anything V2 · WebGPU)", cls: "text-violet-300/95" },
    error: { text: "error", cls: "text-violet-300" },
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#05060d] text-foreground">
      {/* canvas room */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* offscreen processing canvas + hidden video (camera never shown raw) */}
      <canvas ref={procRef} width={PROC_W} height={PROC_H} className="hidden" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* overlay UI */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="max-w-2xl">
          <h1 className="font-semibold text-3xl md:text-5xl text-foreground">
            Depth Room
          </h1>
          <p className="mt-2 text-base md:text-lg text-foreground">
            Your distance to the screen, read as a live depth field, is the
            instrument — music lives in proximity and motion, not in pitch.
          </p>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="mt-3 min-h-[44px] px-4 py-2.5 text-base text-violet-300 underline underline-offset-4 hover:text-violet-200"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
        </header>

        {/* center: enter gate */}
        {!entered && (
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <button
              onClick={enter}
              className="min-h-[44px] rounded-2xl border border-border bg-muted px-6 py-3 text-xl font-medium text-foreground backdrop-blur-sm transition hover:bg-accent"
            >
              Enter the room
            </button>
            <p className="mt-3 text-base text-muted-foreground">
              Sound starts on your tap (browsers require a gesture). Lean in and
              pull back.
            </p>
            <p className="mt-1 font-mono text-base text-violet-300/95">
              Camera is used live, never recorded or uploaded.
            </p>
          </div>
        )}

        <footer className="max-w-2xl">
          {errMsg && (
            <p className="mb-3 rounded-lg border border-violet-400/40 bg-violet-950/30 px-4 py-2.5 text-base text-violet-300">
              {errMsg}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base">
            <span className="text-muted-foreground">
              state:{" "}
              <span className={statusLabel[model].cls}>
                {statusLabel[model].text}
              </span>
            </span>
            {entered && (
              <>
                <span className="text-muted-foreground">
                  near{" "}
                  <span className="text-violet-300/95">
                    {(feat.nearEnergy * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-muted-foreground">
                  motion{" "}
                  <span className="text-violet-300">
                    {(feat.motion * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-muted-foreground">
                  pan{" "}
                  <span className="text-violet-300/95">
                    {feat.centroidX < 0.45
                      ? "L"
                      : feat.centroidX > 0.55
                        ? "R"
                        : "·"}
                  </span>
                </span>
              </>
            )}
            <Link
              href="/dream"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              ← back to the lab
            </Link>
          </div>
        </footer>
      </div>

      {/* design notes drawer */}
      {showNotes && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/85 p-6 backdrop-blur-md md:p-12">
          <div className="mx-auto max-w-2xl space-y-4 text-base leading-relaxed text-foreground">
            <h2 className="font-semibold text-2xl text-foreground">Design notes</h2>
            <p>
              This is the lab&apos;s first depth-camera piece achieved in pure
              software — no Kinect, no RealSense. A monocular depth model,{" "}
              <span className="text-foreground">Depth Anything V2</span> (Yang et
              al., NeurIPS 2024), runs in your browser on WebGPU via
              Transformers.js to turn a single webcam image into a per-pixel
              distance field, ~6&nbsp;times a second.
            </p>
            <p>
              That field is averaged into a 16×12 grid. From it we read{" "}
              <span className="text-violet-300/95">near-zone energy</span> (how
              close you are), histogram <span className="text-foreground">spread</span>,
              the <span className="text-violet-300/95">centroid</span> of your
              nearest region, and{" "}
              <span className="text-violet-300">motion-in-depth</span>.
            </p>
            <p>
              <span className="text-foreground">The mapping:</span> lean in and a
              bank of granular/additive voices blooms bright and foreground; pull
              back and it thins to a low soft drone bed. Your nearest region pans
              the voices left↔right through an HRTF panner. Movement toward and
              away from the screen adds shimmer and grain density. Pitch is locked
              to a single fixed mode (a drone, its fifth, and a pentatonic
              shimmer stack) so nothing can ever clash — the composition lives in
              proximity, space and motion, never intervals.
            </p>
            <p>
              <span className="text-foreground">Visuals:</span> a fullscreen WebGL2
              fragment shader renders you as a depth-shaded room — near pixels
              glow warm and bloom, far pixels recede into cool dark, with quiet
              iso-contour bands and a soft volumetric haze.
            </p>
            <p className="text-muted-foreground">
              Everything degrades: no camera, no WebGPU, or no model all fall
              back to a synthetic procedural depth field so the room always
              sounds and shows. No WebGL2 falls back to a minimal Canvas2D view.
              The camera is processed entirely on-device, live — never recorded
              or uploaded.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-xl border border-border px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
