"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  GRID_W,
  GRID_H,
  PROC_W,
  PROC_H,
  runSyntheticField,
  runPointerField,
  downsampleToGrid,
  applyFeatures,
  blankFeatures,
  type DepthFeatures,
} from "./depth";
import {
  cellToTriad,
  voiceTriad,
  describeMove,
  triadName,
  triadPitchClasses,
  type Triad,
  type Voicing,
  type Transform,
} from "./harmony";
import { initTonnetzGpu, type TonnetzGpu, type RoomState } from "./gpu";
import { initTonnetzGl, type TonnetzGl } from "./webgl-fallback";
import { HarmonicRoom } from "./audio";

type Renderer = TonnetzGpu | TonnetzGl;

type InputState =
  | "idle"
  | "synthetic"
  | "pointer"
  | "camera-only"
  | "loading-model"
  | "live";

type RenderState = "webgpu" | "webgl2" | "dom" | "none";

const CDN_TRANSFORMERS =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js";

// Map a Tonnetz pitch class to a position in the visual lattice (screen uv 0..1).
// Pitch classes are placed by perfect-fifths along X (circle of fifths) and by
// major-thirds along Y — the classic Tonnetz axes — so triads form compact
// triangles. Returns a soft, looped position that stays on-screen.
function pcToScreen(pc: number, focalX: number, focalY: number): [number, number] {
  const fifthsPos = (pc * 7) % 12; // circle-of-fifths index 0..11
  const x = 0.5 + 0.34 * Math.cos((fifthsPos / 12) * Math.PI * 2);
  const y = 0.5 + 0.34 * Math.sin((fifthsPos / 12) * Math.PI * 2);
  // bias the whole figure gently toward the listener's focal point
  return [x * 0.78 + focalX * 0.22, y * 0.78 + (1 - focalY) * 0.22];
}

export default function HarmonicRoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const procRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const rendererRef = useRef<Renderer | null>(null);
  const roomRef = useRef<HarmonicRoom | null>(null);
  const rafRef = useRef<number>(0);

  const gridRef = useRef<Float32Array>(new Float32Array(GRID_W * GRID_H));
  const prevGridRef = useRef<Float32Array>(new Float32Array(GRID_W * GRID_H));
  const featRef = useRef<DepthFeatures>(blankFeatures());

  const streamRef = useRef<MediaStream | null>(null);
  const depthPipeRef = useRef<unknown>(null);
  const inferBusyRef = useRef(false);
  const lastInferRef = useRef(0);
  const inputRef = useRef<InputState>("idle");
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0.5,
    y: 0.5,
    active: false,
  });

  // harmony state
  const triadRef = useRef<Triad>(cellToTriad(3, 1));
  const voicingRef = useRef<Voicing | null>(null);
  const lastCellRef = useRef<{ col: number; row: number }>({ col: 3, row: 1 });
  const glowRef = useRef(0);
  const lastMoveRef = useRef<Transform>("I");

  const [entered, setEntered] = useState(false);
  const [input, setInput] = useState<InputState>("idle");
  const [renderState, setRenderState] = useState<RenderState>("none");
  const [errMsg, setErrMsg] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<{
    chord: string;
    move: Transform;
    near: number;
    motion: number;
  }>({ chord: triadName(triadRef.current), move: "I", near: 0, motion: 0 });

  // ── live monocular depth inference (throttled ~8fps) ──
  const runInference = useCallback((tSec: number) => {
    const pipe = depthPipeRef.current as
      | ((input: unknown) => Promise<unknown>)
      | null;
    const video = videoRef.current;
    const proc = procRef.current;
    if (!pipe || !video || !proc || inferBusyRef.current) return;
    if (tSec - lastInferRef.current < 0.12) return;
    if (video.readyState < 2) return;
    lastInferRef.current = tSec;
    inferBusyRef.current = true;

    const pctx = proc.getContext("2d", { willReadFrequently: true });
    if (!pctx) {
      inferBusyRef.current = false;
      return;
    }
    pctx.drawImage(video, 0, 0, PROC_W, PROC_H);

    (async () => {
      try {
        const bmp = await createImageBitmap(proc);
        const out = (await pipe(bmp)) as {
          depth?: {
            data?: Uint8Array | Float32Array;
            width: number;
            height: number;
          };
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
        /* single-frame failure: keep last grid */
      } finally {
        inferBusyRef.current = false;
      }
    })();
  }, []);

  // ── the main loop: depth → Tonnetz cell → voice-led chord → audio + visuals ──
  const startLoop = useCallback(
    (audioOn: boolean) => {
      const startT = performance.now();
      let lastUi = 0;
      let lastVoice = 0;

      const frame = () => {
        const t = (performance.now() - startT) / 1000;

        // 1. fill depth grid from the active source
        const src = inputRef.current;
        if (src === "live" && depthPipeRef.current) {
          runInference(t);
        } else if (src === "pointer" && pointerRef.current.active) {
          runPointerField(
            gridRef.current,
            pointerRef.current.x,
            pointerRef.current.y,
            t,
          );
        } else {
          runSyntheticField(gridRef.current, t);
        }

        // 2. features + lattice cell
        const f = applyFeatures(gridRef.current, prevGridRef.current);
        featRef.current = f;
        prevGridRef.current.set(gridRef.current);

        // 3. harmony: when the rounded lattice cell changes, re-voice (≤ ~6x/s)
        const col = Math.round(f.col);
        const row = Math.round(f.row);
        const cellChanged =
          col !== lastCellRef.current.col || row !== lastCellRef.current.row;
        if (cellChanged && t - lastVoice > 0.16) {
          const prevTriad = triadRef.current;
          const nextTriad = cellToTriad(col, row);
          if (
            nextTriad.root !== prevTriad.root ||
            nextTriad.quality !== prevTriad.quality
          ) {
            lastMoveRef.current = describeMove(prevTriad, nextTriad);
            triadRef.current = nextTriad;
            voicingRef.current = voiceTriad(
              nextTriad,
              voicingRef.current,
              f.nearEnergy,
            );
            roomRef.current?.setVoicing(voicingRef.current, f.nearEnergy);
            glowRef.current = 1; // bloom the moving edge
            lastVoice = t;
          }
          lastCellRef.current = { col, row };
        }

        // ensure an initial voicing exists
        if (!voicingRef.current) {
          voicingRef.current = voiceTriad(triadRef.current, null, f.nearEnergy);
          roomRef.current?.setVoicing(voicingRef.current, f.nearEnergy);
        }

        // motion → master shimmer
        roomRef.current?.setMotion(f.motion);

        // 4. visuals
        glowRef.current *= 0.94; // decay bloom
        const pcs = triadPitchClasses(triadRef.current);
        const [ax, ay] = pcToScreen(pcs[0], f.centroidX, f.depthBand);
        const [bx, by] = pcToScreen(pcs[1], f.centroidX, f.depthBand);
        const [cx, cy] = pcToScreen(pcs[2], f.centroidX, f.depthBand);
        const state: RoomState = {
          focalX: f.centroidX,
          focalY: 1 - f.depthBand,
          nearEnergy: f.nearEnergy,
          motion: f.motion,
          ax,
          ay,
          bx,
          by,
          cx,
          cy,
          time: t,
          glow: glowRef.current,
          hueShift: triadRef.current.quality === "maj" ? 1 : 0,
        };
        rendererRef.current?.render(state);

        // 5. throttled HUD
        if (t - lastUi > 0.1) {
          lastUi = t;
          setHud({
            chord: triadName(triadRef.current),
            move: lastMoveRef.current,
            near: f.nearEnergy,
            motion: f.motion,
          });
        }

        rafRef.current = requestAnimationFrame(frame);
      };
      void audioOn;
      rafRef.current = requestAnimationFrame(frame);
    },
    [runInference],
  );

  // ── set up the renderer (WebGPU → WebGL2 → DOM) ──
  const setupRenderer = useCallback(async (): Promise<RenderState> => {
    const canvas = canvasRef.current;
    if (!canvas) return "dom";
    try {
      const gpu = await initTonnetzGpu(canvas);
      if (gpu) {
        rendererRef.current = gpu;
        return "webgpu";
      }
    } catch {
      /* fall through */
    }
    try {
      const gl = initTonnetzGl(canvas);
      if (gl) {
        rendererRef.current = gl;
        setErrMsg(
          (m) => m || "WebGPU unavailable — using the raw-WebGL2 lattice room.",
        );
        return "webgl2";
      }
    } catch {
      /* fall through */
    }
    setErrMsg(
      (m) =>
        m ||
        "Neither WebGPU nor WebGL2 is available — showing the DOM chord view. Audio still plays.",
    );
    return "dom";
  }, []);

  // ── bring up camera + Depth Anything V2 (best effort) ──
  const bringUpSensors = useCallback(async () => {
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
      inputRef.current = "camera-only";
      setInput("camera-only");
    } catch {
      // no camera → pointer if the user moves, else synthetic auto-demo.
      inputRef.current = "synthetic";
      setInput("synthetic");
      setErrMsg(
        (m) =>
          m ||
          "Camera is off — the room plays itself on a synthetic depth field. Move your pointer over the room to walk the harmony.",
      );
      return;
    }

    if (!gotCamera) return;
    inputRef.current = "loading-model";
    setInput("loading-model");
    try {
      const mod = await import(
        /* webpackIgnore: true */ CDN_TRANSFORMERS as string
      ).catch(() => null);
      if (!mod) throw new Error("transformers cdn import failed");
      const { pipeline, env } = mod as {
        pipeline: (
          task: string,
          model: string,
          opts: unknown,
        ) => Promise<unknown>;
        env: { allowLocalModels: boolean };
      };
      env.allowLocalModels = false;
      const depth = await pipeline(
        "depth-estimation",
        "onnx-community/depth-anything-v2-small",
        { device: "webgpu" },
      );
      depthPipeRef.current = depth;
      inputRef.current = "live";
      setInput("live");
    } catch {
      depthPipeRef.current = null;
      inputRef.current = "synthetic";
      setInput("synthetic");
      setErrMsg(
        (m) =>
          m ||
          "Depth model / WebGPU compute unavailable — falling back to a synthetic depth field. Distance still walks the harmony.",
      );
    }
  }, []);

  // ── Start gesture: AudioContext + getUserMedia + WebGPU all created here ──
  const enter = useCallback(async () => {
    if (entered) return;
    setEntered(true);

    // audio (gesture-gated)
    try {
      const room = new HarmonicRoom();
      if (room.ctx.state === "suspended") await room.ctx.resume();
      room.start();
      roomRef.current = room;
    } catch {
      setErrMsg((m) => m || "Audio could not start in this browser.");
    }

    // renderer
    const rs = await setupRenderer();
    setRenderState(rs);

    // begin loop immediately (synthetic walks harmony within ~1s)
    inputRef.current = "synthetic";
    setInput("synthetic");
    startLoop(true);

    // sensors degrade on their own
    bringUpSensors();
  }, [entered, setupRenderer, startLoop, bringUpSensors]);

  // pointer input over the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        active: true,
      };
      // pointer overrides synthetic (but never overrides live camera depth)
      if (inputRef.current === "synthetic") {
        inputRef.current = "pointer";
        setInput("pointer");
      }
    };
    const onLeave = () => {
      pointerRef.current.active = false;
      if (inputRef.current === "pointer") {
        inputRef.current = "synthetic";
        setInput("synthetic");
      }
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // teardown
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        streamRef.current?.getTracks().forEach((tk) => tk.stop());
      } catch {
        /* noop */
      }
      streamRef.current = null;
      try {
        rendererRef.current?.dispose();
      } catch {
        /* noop */
      }
      rendererRef.current = null;
      try {
        roomRef.current?.close();
      } catch {
        /* noop */
      }
      roomRef.current = null;
      depthPipeRef.current = null;
    };
  }, []);

  const inputLabel: Record<InputState, { text: string; cls: string }> = {
    idle: { text: "asleep", cls: "text-white/60" },
    synthetic: { text: "synthetic depth (auto-walk)", cls: "text-violet-300" },
    pointer: { text: "pointer walking the lattice", cls: "text-emerald-300/95" },
    "camera-only": { text: "camera live", cls: "text-amber-300/95" },
    "loading-model": {
      text: "loading Depth Anything V2…",
      cls: "text-amber-300/95",
    },
    live: {
      text: "live body depth (Depth Anything V2 · WebGPU)",
      cls: "text-emerald-300/95",
    },
  };

  const renderLabel: Record<RenderState, string> = {
    webgpu: "WebGPU · WGSL",
    webgl2: "WebGL2 (fallback)",
    dom: "DOM (fallback)",
    none: "—",
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#080507] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={procRef} width={PROC_W} height={PROC_H} className="hidden" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* DOM fallback chord view (only when no GPU surface) */}
      {entered && renderState === "dom" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-3xl px-12 py-10 text-center"
            style={{
              boxShadow: `0 0 ${40 + hud.near * 120}px ${
                10 + hud.near * 40
              }px rgba(255,150,80,${0.18 + hud.near * 0.3})`,
              background:
                "radial-gradient(circle, rgba(255,150,80,0.14), transparent 70%)",
            }}
          >
            <div className="font-serif text-6xl text-amber-300/95">
              {hud.chord}
            </div>
            <div className="mt-2 font-mono text-base text-white/75">
              last move: {hud.move}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="max-w-2xl">
          <h1 className="font-serif text-3xl text-white md:text-5xl">
            Depth Harmonic Room
          </h1>
          <p className="mt-2 text-base text-white/80 md:text-lg">
            Move through the room and your body, read live as a depth field,
            walks a neo-Riemannian Tonnetz — smooth, voice-led chord changes
            where harmony itself is the instrument.
          </p>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="mt-3 min-h-[44px] px-4 py-2.5 text-base text-violet-300 underline underline-offset-4 hover:text-violet-200"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
        </header>

        {!entered && (
          <div className="mx-auto flex max-w-lg flex-col items-center text-center">
            <button
              onClick={enter}
              className="min-h-[44px] rounded-2xl border border-white/20 bg-white/10 px-6 py-3 text-xl font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Enter the room
            </button>
            <p className="mt-3 text-base text-white/75">
              Sound starts on your tap (browsers require a gesture). Step left
              and right, lean in and back — or just watch: it walks itself.
            </p>
            <p className="mt-1 font-mono text-base text-emerald-300/95">
              Camera is processed on-device, live — never recorded or uploaded.
            </p>
          </div>
        )}

        <footer className="max-w-3xl">
          {errMsg && (
            <p className="mb-3 rounded-lg border border-rose-400/40 bg-rose-950/30 px-4 py-2.5 text-base text-rose-300">
              {errMsg}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base">
            <span className="text-white/75">
              input:{" "}
              <span className={inputLabel[input].cls}>
                {inputLabel[input].text}
              </span>
            </span>
            <span className="text-white/75">
              render:{" "}
              <span className="text-amber-300/95">
                {renderLabel[renderState]}
              </span>
            </span>
            {entered && (
              <>
                <span className="text-white/75">
                  chord{" "}
                  <span className="text-amber-300/95">{hud.chord}</span>
                </span>
                <span className="text-white/75">
                  voice-lead{" "}
                  <span className="text-violet-300">{hud.move}</span>
                </span>
                <span className="text-white/75">
                  near{" "}
                  <span className="text-emerald-300/95">
                    {(hud.near * 100).toFixed(0)}%
                  </span>
                </span>
              </>
            )}
            <Link
              href="/dream"
              className="text-white/75 underline underline-offset-4 hover:text-white"
            >
              ← back to the lab
            </Link>
          </div>
        </footer>
      </div>

      {showNotes && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/85 p-6 backdrop-blur-md md:p-12">
          <div className="mx-auto max-w-2xl space-y-4 text-base leading-relaxed text-white/80">
            <h2 className="font-serif text-2xl text-white">Design notes</h2>
            <p>
              <span className="text-white/95">The question:</span> what if the
              distance and position of your body in the room — read live as a
              per-pixel depth field by an ML model in the browser — placed you
              inside a neo-Riemannian{" "}
              <span className="text-amber-300/95">Tonnetz</span> of harmony, so
              that simply moving through space glides you through smooth,
              voice-led chord changes? Harmony is the instrument; you walk it.
            </p>
            <p>
              <span className="text-white/95">Depth.</span>{" "}
              <span className="text-white/95">Depth Anything V2 (small)</span>{" "}
              runs in your browser on WebGPU via Transformers.js, turning a
              single webcam frame into a distance field ~8×/second. It is
              averaged into a 16×12 grid; from it we read{" "}
              <span className="text-emerald-300/95">near-energy</span> (how close
              you are), the <span className="text-white/95">lateral centroid</span>{" "}
              of your nearest region, a{" "}
              <span className="text-white/95">depth band</span>, and{" "}
              <span className="text-violet-300">motion</span>.
            </p>
            <p>
              <span className="text-white/95">
                Tonnetz + voice-leading (the core).
              </span>{" "}
              Lateral position walks an alternating R/L chain around the circle
              of thirds; leaning in/out applies P (major↔minor brightness). Every
              single step is a parsimonious neo-Riemannian transform — Parallel,
              Leittonwechsel or Relative — each of which holds two of the three
              chord tones fixed and moves only one by a semitone or tone. The
              chord is then voiced for four SATB voices, each taking the nearest
              chord tone to where it already sits, and gliding (portamento,
              ~120–300&nbsp;ms) when it must move. That common-tone retention{" "}
              <span className="text-white/95">is</span> the smooth voice-leading.
            </p>
            <p>
              <span className="text-white/95">Sound.</span> Four warm
              detuned-sine/triangle pads through soft lowpass + slow vibrato,
              over a root drone bed. Master chain: gain&nbsp;≤0.28 → lowpass
              ~7&nbsp;kHz → compressor. Never harsh, never sudden-loud.
            </p>
            <p>
              <span className="text-white/95">Visuals.</span> A raw-WebGPU (WGSL)
              warm lattice room — pitch nodes glow, the sounding triad triangle
              blooms with near-energy, your focal glow marks where you stand. If
              WebGPU is missing it falls back to a raw-WebGL2 port; if that too
              is missing, a DOM chord view.
            </p>
            <p className="text-white/75">
              Everything degrades: no camera or no model → a synthetic
              presence-blob on a Lissajous path keeps the harmony walking on its
              own; your pointer over the room also walks the lattice on a laptop.
              The camera is processed entirely on-device, live — never recorded
              or uploaded.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-xl border border-white/20 px-4 py-2.5 text-base text-white hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
