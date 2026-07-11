"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  deriveDrive,
  neutralParams,
  paramsFromFace,
  type Blendshape,
  type FaceParams,
} from "./mapping";
import { drawFrame, makeRenderState } from "./render";
import { makeAudio, type FaceAudio } from "./audio";

/* ------------------------------------------------------------------ *
 * 1057 — Face Bloom
 * Your FACE is the psychedelic instrument. MediaPipe Face Landmarker
 * reads 52 live blendshape expression coefficients + a head-pose matrix
 * and sculpts a log-polar form-constant kaleidoscope (Canvas2D) and its
 * just-intonation organ. jawOpen blooms the fold-count, brow raises ring
 * density + warmth, eye-aspect adds entropy, head yaw/roll tour the four
 * form constants and set spiral handedness. Idle = quiet and near-still.
 * Falls back to sliders if camera / MediaPipe is unavailable.
 * ------------------------------------------------------------------ */

// ---- MediaPipe via CDN (no npm dep) ---------------------------------
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface FaceDetectResult {
  faceBlendshapes?: { categories: Blendshape[] }[];
  facialTransformationMatrixes?: { data: number[] }[];
}
interface FaceLandmarkerLike {
  detectForVideo: (v: HTMLVideoElement, ts: number) => FaceDetectResult;
  close: () => void;
}

type TrackStatus =
  | "init"
  | "loading"
  | "tracking"
  | "no-face"
  | "no-camera"
  | "no-cdn";

type Phase = "idle" | "running";

// slider fallback values (also used to nudge the instrument with no camera)
interface SliderState {
  jawOpen: number;
  browUp: number;
  entropy: number;
  yaw: number;
}

export default function FaceBloom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<TrackStatus>("init");
  const [showNotes, setShowNotes] = useState(false);
  const [shimmerOn, setShimmerOn] = useState(false);
  const [sliders, setSliders] = useState<SliderState>({
    jawOpen: 0.2,
    browUp: 0.2,
    entropy: 0.3,
    yaw: 0,
  });

  // refs the render loop reads (so we don't restart effects)
  const audioRef = useRef<FaceAudio | null>(null);
  const rafRef = useRef<number>(0);
  const faceRef = useRef<FaceParams>(neutralParams());
  const usingCamRef = useRef(false);
  const slidersRef = useRef<SliderState>(sliders);
  const shimmerFlickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 2 }));
  const statusRef = useRef<TrackStatus>("init");
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    slidersRef.current = sliders;
  }, [sliders]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    if (shimmerOn) shimmerFlickerRef.current.enable();
    else shimmerFlickerRef.current.kill();
  }, [shimmerOn]);

  // -- try to start face tracking; resolve which input we use --
  const startTracking = useCallback(async () => {
    setStatus("loading");
    let vision: unknown;
    try {
      vision = await import(
        // @ts-expect-error — remote ESM module loaded from CDN at runtime
        /* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs"
      );
    } catch {
      setStatus("no-cdn");
      usingCamRef.current = false;
      return;
    }
    try {
      const v = vision as {
        FilesetResolver: { forVisionTasks: (u: string) => Promise<unknown> };
        FaceLandmarker: {
          createFromOptions: (
            f: unknown,
            o: Record<string, unknown>,
          ) => Promise<FaceLandmarkerLike>;
        };
      };
      const fileset = await v.FilesetResolver.forVisionTasks(WASM_URL);
      const lm = await v.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
      landmarkerRef.current = lm;
    } catch {
      setStatus("no-cdn");
      usingCamRef.current = false;
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video el");
      video.srcObject = stream;
      await video.play();
      usingCamRef.current = true;
      setStatus("tracking");
    } catch {
      setStatus("no-camera");
      usingCamRef.current = false;
    }
  }, []);

  const runDetect = useCallback((tsMs: number) => {
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!lm || !video || video.readyState < 2) return;
    let res: FaceDetectResult;
    try {
      res = lm.detectForVideo(video, tsMs);
    } catch {
      return;
    }
    const shapes = res.faceBlendshapes?.[0]?.categories;
    if (!shapes || shapes.length === 0) {
      faceRef.current = neutralParams();
      if (statusRef.current === "tracking") setStatus("no-face");
      return;
    }
    if (statusRef.current === "no-face") setStatus("tracking");
    const matrix = res.facialTransformationMatrixes?.[0]?.data ?? null;
    faceRef.current = paramsFromFace(shapes, matrix);
  }, []);

  // -- main loop (input merge + audio + render) --
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rs = makeRenderState();
    let last = performance.now();
    // smoothed face params so expression feels like breath
    const sm: FaceParams = neutralParams();
    const reduced = prefersReducedMotion();

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (usingCamRef.current) runDetect(now);

      // pick the live face, or synthesize one from the sliders
      let target: FaceParams;
      if (usingCamRef.current && faceRef.current.present) {
        target = faceRef.current;
      } else {
        const s = slidersRef.current;
        target = {
          jawOpen: s.jawOpen,
          browUp: s.browUp,
          eyeOpen: 1 - s.entropy,
          smile: s.browUp * 0.4,
          yaw: s.yaw,
          roll: s.yaw * 0.3,
          pitch: 0,
          squint: 0,
          // sliders count as "present" so the instrument plays in fallback mode
          present: true,
        };
      }

      // smooth (slower when reduced-motion is requested)
      const k = reduced ? 0.04 : 0.12;
      sm.jawOpen = lerp(sm.jawOpen, target.jawOpen, k);
      sm.browUp = lerp(sm.browUp, target.browUp, k);
      sm.eyeOpen = lerp(sm.eyeOpen, target.eyeOpen, k);
      sm.smile = lerp(sm.smile, target.smile, k);
      sm.yaw = lerp(sm.yaw, target.yaw, k);
      sm.roll = lerp(sm.roll, target.roll, k);
      sm.pitch = lerp(sm.pitch, target.pitch, k);
      sm.squint = lerp(sm.squint, target.squint, k);
      sm.present = target.present;

      const drive = deriveDrive(sm);

      // audio
      const audio = audioRef.current;
      if (audio) {
        audio.setPresence(sm.present ? 1 : 0);
        audio.setSwell(sm.jawOpen);
        audio.setBrightness(sm.browUp);
        audio.setShimmer(sm.smile);
      }

      // shimmer: a deliberate slow squint, routed through safeFlicker, opt-in.
      const flicker = shimmerFlickerRef.current;
      const flickerMul =
        flicker.enabled && sm.squint > 0.55
          ? flicker.value(now / 1000)
          : 1;

      drawFrame(ctx, canvas, drive, rs, dt, flickerMul);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [runDetect]);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    setPhase("running");
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    audioRef.current = await makeAudio(ctx);
    void startTracking();
    cleanupRef.current = startLoop() ?? null;
  }, [phase, startTracking, startLoop]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
      audioRef.current?.dispose();
      audioRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const statusLine: Record<TrackStatus, string> = {
    init: "Press Start, then face the camera and emote.",
    loading: "Loading face tracker…",
    tracking: "Tracking your face — open your jaw, raise your brows, turn your head.",
    "no-face": "No face found — center your face, or play with the sliders below.",
    "no-camera": "Camera blocked — play the instrument with the sliders below.",
    "no-cdn": "Tracker unavailable — play the instrument with the sliders below.",
  };
  const isError = status === "no-camera" || status === "no-cdn";
  const statusColor = isError
    ? "text-violet-300"
    : status === "tracking"
      ? "text-violet-300"
      : "text-foreground";
  const showFallback = phase === "running" && (isError || status === "no-face");

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* hidden video — MediaPipe input only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* overlay UI */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="p-5 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Face Bloom
          </h1>
          <p className="mt-2 max-w-xl text-base text-foreground">
            Your face is the psychedelic instrument. Your expressions sculpt an
            altered-state visual field and its sound — no drug, just emotion.
          </p>
          <p className={`mt-3 font-mono text-base ${statusColor}`}>
            {statusLine[status]}
          </p>
        </header>

        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center px-5">
            <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-full bg-violet-500/90 px-8 py-3 text-lg font-semibold text-black shadow-lg transition-colors hover:bg-violet-400"
              >
                Start — let your face play
              </button>
              <p className="text-center text-base text-muted-foreground">
                Sound and camera start on Start. Open your jaw to bloom the
                kaleidoscope, raise your brows for warmth, turn your head to tour
                the geometry. No camera? Sliders appear so you can still play.
              </p>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="mt-auto p-5 sm:p-8">
            {/* expression → parameter legend */}
            <div className="pointer-events-none mb-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-base text-muted-foreground">
              <span>jawOpen → bloom + swell</span>
              <span>browUp → density + warmth</span>
              <span>eyes → entropy</span>
              <span>head → handedness + form tour</span>
            </div>

            {showFallback && (
              <div className="pointer-events-auto max-w-xl rounded-2xl border border-border bg-zinc-900/80 p-4 backdrop-blur">
                <p className="mb-3 text-base text-foreground">
                  Play with the sliders:
                </p>
                <FallbackSlider
                  label="jawOpen"
                  value={sliders.jawOpen}
                  onChange={(v) => setSliders((s) => ({ ...s, jawOpen: v }))}
                />
                <FallbackSlider
                  label="browUp"
                  value={sliders.browUp}
                  onChange={(v) => setSliders((s) => ({ ...s, browUp: v }))}
                />
                <FallbackSlider
                  label="entropy"
                  value={sliders.entropy}
                  onChange={(v) => setSliders((s) => ({ ...s, entropy: v }))}
                />
                <FallbackSlider
                  label="yaw"
                  value={sliders.yaw}
                  min={-1}
                  max={1}
                  onChange={(v) => setSliders((s) => ({ ...s, yaw: v }))}
                />
              </div>
            )}

            {/* shimmer toggle (photosensitivity-gated, opt-in) */}
            <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShimmerOn((v) => !v)}
                className={`min-h-[44px] rounded-full px-4 py-2.5 text-base font-medium transition-colors ${
                  shimmerOn
                    ? "bg-violet-500/90 text-black"
                    : "bg-muted text-foreground hover:bg-accent"
                }`}
              >
                {shimmerOn ? "Phosphene shimmer: ON" : "Phosphene shimmer: off"}
              </button>
              {shimmerOn && (
                <span className="max-w-xs text-base text-violet-300">
                  Photosensitivity note: a deliberate slow squint adds a soft
                  ≤3 Hz luminance shimmer. Turn off if you are
                  photosensitive.
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* design notes link */}
      <Link
        href="/dream/1057-face-bloom/README.md"
        className="pointer-events-auto absolute right-4 top-4 z-30 min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur transition-colors hover:bg-accent"
      >
        Read the design notes
      </Link>

      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute right-4 top-20 z-30 min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur transition-colors hover:bg-accent"
      >
        {showNotes ? "Hide quick notes" : "Quick notes"}
      </button>

      {showNotes && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/80 p-6 backdrop-blur">
          <div className="max-w-lg rounded-2xl border border-border bg-zinc-900/90 p-6 text-base text-foreground">
            <h2 className="text-xl font-semibold text-foreground">How to play</h2>
            <p className="mt-3">
              MediaPipe Face Landmarker reads 52 live{" "}
              <span className="text-violet-300">blendshape</span> expression
              coefficients plus a head-pose matrix. Those drive a log-polar
              form-constant kaleidoscope (the Bressloff–Cowan retina{"→"}V1
              complex-log map over Klüver{"'"}s four form constants), drawn in
              Canvas2D.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-foreground">
              <li>
                <span className="text-violet-300">Open your jaw</span> — blooms the
                N-fold kaleidoscope (2{"→"}~12) and swells the organ.
              </li>
              <li>
                <span className="text-violet-300">Raise your brows</span> — denser
                rings/spokes and a hotter, brighter palette.
              </li>
              <li>
                <span className="text-violet-300">Narrow your eyes</span> — adds
                entropy / fine detail.
              </li>
              <li>
                <span className="text-violet-300">Turn / tilt your head</span> —
                sets spiral handedness, inward come-up drift, and tours
                tunnel{"→"}spoke{"→"}spiral{"→"}honeycomb.
              </li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              Idle (no face / neutral) is quiet and near-still — it only comes
              alive as you emote. Any flicker is opt-in and clamped to ≤3 Hz.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500/90 px-5 py-2.5 text-base font-semibold text-black hover:bg-violet-400"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1057-face-bloom"]} />
    </main>
  );
}

// ---- fallback slider -------------------------------------------------
function FallbackSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="mb-2 flex items-center gap-3 text-base text-foreground">
      <span className="w-20 font-mono">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-violet-400"
      />
    </label>
  );
}
