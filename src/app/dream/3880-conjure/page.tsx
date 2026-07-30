"use client";

/* ── 3880 · Conjure ────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if you could CONJURE a chord out of thin air with your
 *  hand — hold a coherent hand-shape and it voices a rich chord; let the
 *  shape go sloppy and it decoheres into noise?
 *
 *  INPUT: MediaPipe HandLandmarker (21-point hand tracking, CDN-loaded) —
 *  the lab's first hand-LANDMARK instrument (a prior piece used Pose/body).
 *  OUTPUT: a WebGPU compute-shader particle field (mandatory Canvas2D
 *  fallback, identical model) sculpted by the hand, plus a 6-partial
 *  additive/FM chord synth.
 *
 *  See README.md for the full technique writeup and references.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeHandLandmarker,
  type HandLandmarkerLike,
  type HandLandmark,
} from "./handLoader";
import { createGestureTracker, type GestureTracker } from "./gesture";
import { createSyntheticHand, type SyntheticHand } from "./demo";
import { createAnchorTracker, type AnchorTracker } from "./anchors";
import { makeConjureSynth, type ConjureSynth } from "./synth";
import { buildGpu, stepGpu, destroyGpu, type GpuState } from "./gpu";
import { createFallback, stepFallback, type FallbackState } from "./fallback2d";

type Mode = "idle" | "running";
type Driver = "auto" | "you";

interface Engine {
  ac: AudioContext | null;
  synth: ConjureSynth | null;
  gpu: GpuState | null;
  ctx2d: CanvasRenderingContext2D | null;
  fb: FallbackState | null;
  landmarker: HandLandmarkerLike | null;
  stream: MediaStream | null;
  gesture: GestureTracker;
  anchors: AnchorTracker;
  synthetic: SyntheticHand;
  raf: number;
  driver: Driver;
  time: number;
  lastMs: number;
  lastLandmarks: HandLandmark[] | null;
  reduce: boolean;
}

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export default function ConjurePage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [driver, setDriver] = useState<Driver>("auto");
  const [using2D, setUsing2D] = useState(false);
  const [gpuNotice, setGpuNotice] = useState<string | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const modeRef = useRef<Mode>("idle");

  const coherenceBarRef = useRef<HTMLDivElement | null>(null);
  const coherenceLabelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const dpr = Math.min(1.6, window.devicePixelRatio || 1);
    canvas.width = Math.max(2, Math.floor(box.clientWidth * dpr));
    canvas.height = Math.max(2, Math.floor(box.clientHeight * dpr));
  }, []);

  const drawHud = useCallback((eng: Engine) => {
    const canvas = hudRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sk = eng.lastLandmarks;
    if (!sk || sk.length < 21) return;
    const col = `hsl(268 85% 72%)`;
    ctx.lineWidth = 2;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (const [a, b] of BONES) {
      ctx.moveTo(sk[a].x * w, sk[a].y * h);
      ctx.lineTo(sk[b].x * w, sk[b].y * h);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    for (const p of sk) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const renderLoop = useCallback(
    (nowMs: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const dt = eng.lastMs ? Math.min(0.05, (nowMs - eng.lastMs) / 1000) : 1 / 60;
      eng.lastMs = nowMs;
      eng.time += dt;

      let landmarks: HandLandmark[] | null = null;
      let real = false;

      if (eng.landmarker && eng.stream && videoRef.current && videoRef.current.readyState >= 2) {
        let res: ReturnType<HandLandmarkerLike["detectForVideo"]> | null = null;
        try {
          res = eng.landmarker.detectForVideo(videoRef.current, nowMs);
        } catch {
          res = null;
        }
        if (res && res.landmarks && res.landmarks.length > 0) {
          landmarks = res.landmarks[0].map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));
          real = true;
          if (eng.driver !== "you") {
            eng.driver = "you";
            setDriver("you");
          }
        } else if (eng.driver === "you") {
          // camera is live and has previously seen a real hand: a frame
          // with no hand now means the hand genuinely left — let it decohere.
          landmarks = null;
          real = true;
        }
      }
      if (!real) {
        landmarks = eng.synthetic.sample(nowMs);
      }
      eng.lastLandmarks = landmarks;

      const frame = eng.gesture.update(landmarks, nowMs);
      eng.anchors.update(landmarks, dt);
      eng.synth?.setFrame(frame, nowMs);

      const canvas = canvasRef.current;
      const w = canvas?.width || 1;
      const h = canvas?.height || 1;
      const aspect = w / h;
      const fade = eng.reduce ? 0.88 : 0.92 - frame.coherence * 0.04;

      const fieldParams = {
        time: eng.time,
        aspect,
        coherence: frame.coherence,
        brightness: frame.openness,
        pan: frame.tilt,
        presence: frame.present ? 1 : 0,
        reduce: eng.reduce ? 1 : 0,
        fade,
      };

      if (eng.gpu) {
        stepGpu(eng.gpu, fieldParams, eng.anchors.current);
      } else if (eng.ctx2d && eng.fb) {
        stepFallback(eng.ctx2d, eng.fb, fieldParams, eng.anchors.current, w, h);
      }

      drawHud(eng);

      if (coherenceBarRef.current) {
        coherenceBarRef.current.style.width = `${Math.round(frame.coherence * 100)}%`;
      }
      if (coherenceLabelRef.current) {
        coherenceLabelRef.current.textContent = frame.present
          ? frame.coherence > 0.62
            ? "coherent — chord blooming"
            : frame.coherence > 0.3
              ? "wavering"
              : "decohering — noise rising"
          : "no hand — decohering";
      }
      eng.raf = requestAnimationFrame(renderLoop);
    },
    [drawHud],
  );

  const stopEverything = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.stream) eng.stream.getTracks().forEach((t) => t.stop());
    if (eng.landmarker) {
      try {
        eng.landmarker.close();
      } catch {
        /* ignore */
      }
    }
    if (eng.synth) eng.synth.dispose();
    if (eng.gpu) destroyGpu(eng.gpu);
    const ac = eng.ac;
    if (ac && ac.state !== "closed") {
      window.setTimeout(() => {
        if (ac.state !== "closed") void ac.close();
      }, 350);
    }
    engineRef.current = null;
  }, []);

  const tryCamera = useCallback(async () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamNotice(
        "No camera here — the auto-pilot hand keeps conjuring on its own so you can still see + hear the whole idea.",
      );
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
    } catch {
      setCamNotice(
        "Camera off or blocked — the auto-pilot hand keeps conjuring on its own.",
      );
      return;
    }
    const eng2 = engineRef.current;
    if (!eng2) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    eng2.stream = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* ignore */
      }
    }
    try {
      const lm = await makeHandLandmarker();
      const eng3 = engineRef.current;
      if (!eng3) {
        lm.close();
        return;
      }
      eng3.landmarker = lm;
      setCamNotice(null);
    } catch {
      setCamNotice(
        "Hand-tracking model couldn't load (offline?) — the auto-pilot hand keeps conjuring on its own.",
      );
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (modeRef.current === "running") return;
    setGpuNotice(null);
    setCamNotice(null);
    setAudioNotice(null);
    setDriver("auto");

    sizeCanvas();
    const canvas = canvasRef.current;

    let gpu: GpuState | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fb: FallbackState | null = null;
    if (canvas && typeof navigator !== "undefined" && navigator.gpu) {
      try {
        gpu = await buildGpu(canvas);
      } catch {
        gpu = null;
        setGpuNotice("WebGPU init failed — using the Canvas2D fallback field.");
      }
    } else {
      setGpuNotice("WebGPU unavailable in this browser — using the Canvas2D fallback field.");
    }
    if (!gpu && canvas) {
      const g2 = canvas.getContext("2d");
      if (g2) {
        ctx2d = g2;
        fb = createFallback();
        setUsing2D(true);
      }
    }

    let ac: AudioContext | null = null;
    let synth: ConjureSynth | null = null;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      await ac.resume();
      synth = makeConjureSynth(ac, 0.19);
    } catch {
      setAudioNotice("Web Audio is unavailable in this browser, so the chord cannot sound. The visual field still runs.");
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const eng: Engine = {
      ac,
      synth,
      gpu,
      ctx2d,
      fb,
      landmarker: null,
      stream: null,
      gesture: createGestureTracker(),
      anchors: createAnchorTracker(),
      synthetic: createSyntheticHand(),
      raf: 0,
      driver: "auto",
      time: 0,
      lastMs: 0,
      lastLandmarks: null,
      reduce,
    };
    engineRef.current = eng;

    setMode("running");
    void tryCamera();

    eng.raf = requestAnimationFrame(renderLoop);
  }, [renderLoop, sizeCanvas, tryCamera]);

  const handleStop = useCallback(() => {
    stopEverything();
    setMode("idle");
    setDriver("auto");
    setUsing2D(false);
  }, [stopEverything]);

  // window resize only matters for the 2D fallback (GPU trail is fixed at start)
  useEffect(() => {
    if (mode !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      if (eng?.ctx2d) sizeCanvas();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, sizeCanvas]);

  // full teardown on unmount
  useEffect(() => {
    return () => stopEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = mode === "running";

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Link href="/dream" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
          ← back to the dream lab
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Conjure
        </h1>
        <p className="mt-3 text-base leading-relaxed text-foreground">
          Hold a clean, steady hand-shape in the air and a rich chord blooms
          out of thin air; let your hand go sloppy — or leave the frame — and
          the chord decoheres into detuned noise. Coherence is the stake.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              type="button"
              onClick={() => void handleStart()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}
          {running && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              driving: <span className="text-primary">{driver === "auto" ? "auto-pilot" : "you"}</span>
            </span>
          )}
        </div>

        {!running && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tap start — no camera required, an auto-pilot hand conjures for you
          </p>
        )}
        {audioNotice && <p className="mt-3 text-base leading-relaxed text-destructive">{audioNotice}</p>}
        {camNotice && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{camNotice}</p>}
        {gpuNotice && <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{gpuNotice}</p>}

        <div className="relative mt-5 aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <canvas
            ref={hudRef}
            className="absolute right-2 top-2 h-[26%] w-[26%] rounded-md border border-border bg-black/30"
          />
          {!running && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-base text-muted-foreground">
              Press Start to conjure.
            </div>
          )}
        </div>
        {/* hidden video feeds MediaPipe only; never shown */}
        <video ref={videoRef} className="hidden" playsInline muted />

        {running && (
          <div className="mt-4 rounded-lg border border-border bg-background/50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                coherence
              </span>
              <span ref={coherenceLabelRef} className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                auto-pilot
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
              <div ref={coherenceBarRef} className="h-full bg-primary transition-[width]" style={{ width: "0%" }} />
            </div>
            {using2D && (
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                webgpu absent · canvas 2d fallback
              </p>
            )}
          </div>
        )}

        <p className="mt-8 text-sm text-muted-foreground">
          input: 21-point MediaPipe hand landmarks · output: WebGPU particle field
          (Canvas2D fallback) + additive/FM chord synth · technique: coherence-gated
          gesture instrument
        </p>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Conjure</span> is the dream
                lab&apos;s first <span className="text-foreground">hand-landmark</span>{" "}
                instrument (21-point MediaPipe HandLandmarker) — earlier pieces
                tracked full-body Pose, never per-finger geometry.
              </p>
              <p>
                Hand <span className="text-foreground">height</span> drives the
                chord&apos;s root pitch <span className="text-foreground">continuously</span>{" "}
                (a plain exponential map — never snapped to a scale). Finger{" "}
                <span className="text-foreground">spread</span> and{" "}
                <span className="text-foreground">pinch</span> voice which chord
                extensions bloom in; palm <span className="text-foreground">openness</span>{" "}
                brightens an FM-modulated lowpass filter; hand{" "}
                <span className="text-foreground">tilt</span> pans the mix.
              </p>
              <p>
                A <span className="text-foreground">coherence</span> score —
                half per-finger straightness + evenly-fanned template match,
                half frame-to-frame configuration stability — is the stake:
                high coherence lets the chord&apos;s upper voices bloom in tune;
                low coherence (a sloppy shape, or the hand leaving frame)
                detunes every partial and swells a noise band underneath.
              </p>
              <p>
                Visuals are a WebGPU compute-shader particle field: each of
                ~18,000 particles is permanently assigned to one of the 21
                hand landmarks and pulled toward it with a strength that
                scales with coherence, versus curl-noise turbulence that
                scales with its inverse — so the field gathers into a
                luminous skeleton tracking the hand, or scatters into
                turbulence, as one continuous GPU simulation. A Canvas2D
                fallback runs the identical model at a lower particle count
                when WebGPU is unavailable.
              </p>
              <p>
                No camera in this environment? A seeded synthetic hand path
                (deterministic — <code>mulberry32(0x3880)</code> +{" "}
                <code>performance.now()</code>) auto-pilots the whole
                instrument, cycling a clean conjure shape into a sloppy one
                and back, so the bloom/decohere arc is visible and audible
                hands-off. The first real detected hand flips the badge from{" "}
                <em>auto-pilot</em> to <em>you</em>.
              </p>
              <p>
                References: &ldquo;A Novelty Real-Time Gesture Recognition Model
                for Air-Hand Piano Playing Using MediaPipe&rdquo; (IEEE 2024,
                10793028); 2026 real-time gesture→virtual-instrument work
                (IJFMR 2026); the browser GestureSynth lineage
                (MediaPipe + Tone.js + Three.js air-instruments). See
                README.md for the full writeup.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
