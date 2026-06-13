"use client";

/**
 * 568-conductor-hands — conduct two incommensurable tempi, one per hand.
 *
 * THE QUESTION: What if you conducted two incommensurable tempi with your two
 * hands — left hand beats one voice, right hand beats another, and because the
 * system locks each to an irrational tempo ratio, the two pulses can NEVER line
 * up: you feel metric dissonance in your own arms?
 *
 * Cycle 2 of the lab's polytempo spine (after 514-polytempo-loom, which plays
 * fixed irrational ratios autonomously). Here the human's conducting GESTURES
 * set the tempi: each hand's downward stroke is a downbeat, the inter-beat
 * interval is that hand's tempo, and voice B is SNAPPED to voice A × an
 * irrational ratio {√2, φ, e/2, π/2} so the two pulses are mathematically
 * incommensurable. Lineage: Conlon Nancarrow's tempo canons, Ligeti's
 * Continuum/Désordre, Steve Reich's phase pieces. Every pitch is consonant;
 * the only tension is metric.
 *
 * INPUT: MediaPipe Hands (loaded from CDN at runtime — not an npm dep).
 * OUTPUT: three.js phase-space. TECHNIQUE: gesture → tempo extraction →
 * polytempo scheduler. The camera/landmark data is LOCAL only — never
 * recorded, uploaded, or networked.
 *
 * Auto-demo: the three.js phase-space animates from frame one with two
 * synthetic conductors at a default irrational ratio (audio stays silent until
 * the Start gesture for autoplay rules). Graceful degradation: camera denied or
 * MediaPipe fails → on-screen tap pads drive the same engine.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PolytempoEngine } from "./audio";
import { BeatTracker, snapToIrrational, type IrrationalRatio } from "./tracking";
import { createScene, type ConductorScene } from "./render";

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/568-conductor-hands/README.md";

// ── MediaPipe Hands (runtime CDN ESM import — NOT an npm dependency) ──────────
interface Landmark {
  x: number;
  y: number;
  z: number;
}
interface HandResult {
  landmarks: Landmark[][];
  handedness: { categoryName: string; score: number }[][];
}
interface HandLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): HandResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numHands?: number;
      },
    ): Promise<HandLandmarkerInst>;
  };
}
const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const WRIST = 0; // MediaPipe Hands landmark index for the wrist

type Mode = "demo" | "camera" | "fallback";

// Default ratio used by the auto-demo (φ).
const DEFAULT_RATIO: IrrationalRatio = { name: "φ", value: 1.6180339887 };

export default function ConductorHandsPage() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("demo");
  const [notice, setNotice] = useState<string | null>(null);
  const [ratio, setRatio] = useState<IrrationalRatio>(DEFAULT_RATIO);
  const [bpmA, setBpmA] = useState<number>(96);

  // ── Long-lived refs (no re-render) ──────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<ConductorScene | null>(null);
  const engineRef = useRef<PolytempoEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarkerInst | null>(null);
  const rafRef = useRef<number>(0);
  const modeRef = useRef<Mode>("demo");
  const startedRef = useRef(false);

  // Beat trackers (left hand → voice A, right hand → voice B).
  const trackerA = useRef(new BeatTracker());
  const trackerB = useRef(new BeatTracker());

  // Phase accumulators for the visual (advance by dt / period each frame).
  const phaseA = useRef(0);
  const phaseB = useRef(0);
  const lastT = useRef(0);
  // Beat-flash timestamps (performance.now) the scene reads.
  const flashA = useRef(0);
  const flashB = useRef(0);
  // Latest gestured periods (seconds) per hand; B's is pre-lock.
  const gesturedA = useRef(60 / 96);
  const gesturedB = useRef(60 / 96 / DEFAULT_RATIO.value);
  // Last tap timestamp per voice (fallback pads, performance.now).
  const lastTap = useRef<[number, number]>([0, 0]);
  // Latest hand landmarks for overlay drawing (mirrored display coords).
  const handsRef = useRef<{ pts: Landmark[]; left: boolean }[]>([]);

  // Latest displayed values, so we only re-render React on a real change.
  const shownRatio = useRef(DEFAULT_RATIO.name);
  const shownBpm = useRef(96);

  // Apply the incommensurability lock: A is the base, B = A × snapped ratio.
  const applyLock = useCallback(() => {
    const periodA = gesturedA.current;
    const periodB = gesturedB.current;
    // Ratio the conductor gestured (B faster = smaller period = larger ratio).
    const gestured = periodA / periodB;
    const snapped = snapToIrrational(gestured);
    const engine = engineRef.current;
    if (engine) {
      engine.setVoicePeriod(0, periodA);
      engine.setVoicePeriod(1, periodA / snapped.value);
    }
    // Gate React updates to actual changes (avoids 60 fps re-renders).
    const newBpm = Math.round(60 / periodA);
    if (snapped.name !== shownRatio.current) {
      shownRatio.current = snapped.name;
      setRatio(snapped);
    }
    if (newBpm !== shownBpm.current) {
      shownBpm.current = newBpm;
      setBpmA(newBpm);
    }
  }, []);

  // ── Synthetic demo conductors (drive gestured periods when no camera) ────────
  const driveDemo = useCallback((tSec: number) => {
    // Voice A drifts slowly around ~96 BPM; B's gestured ratio wanders near φ
    // so the snap occasionally flips between neighbours — visible, alive.
    const periodA = 60 / (96 + Math.sin(tSec * 0.13) * 14);
    const targetRatio = 1.52 + Math.sin(tSec * 0.07) * 0.12;
    gesturedA.current = periodA;
    gesturedB.current = periodA / targetRatio;
    applyLock();
  }, [applyLock]);

  // ── Draw hand landmarks on the PIP overlay ───────────────────────────────────
  const drawOverlay = useCallback(() => {
    const cvs = overlayRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const W = cvs.width;
    const H = cvs.height;
    ctx.clearRect(0, 0, W, H);
    for (const hand of handsRef.current) {
      ctx.fillStyle = hand.left ? "#a78bfa" : "#fbbf24";
      ctx.shadowBlur = 8;
      ctx.shadowColor = ctx.fillStyle;
      for (const p of hand.pts) {
        ctx.beginPath();
        ctx.arc((1 - p.x) * W, p.y * H, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  }, []);

  // ── Per-frame: detect hands → extract beats → advance phase → render ─────────
  const frame = useCallback(() => {
    const now = performance.now();
    const tSec = now / 1000;
    const dt = lastT.current ? Math.min(0.1, tSec - lastT.current) : 0;
    lastT.current = tSec;

    if (modeRef.current === "demo") {
      driveDemo(tSec);
    } else if (
      modeRef.current === "camera" &&
      landmarkerRef.current &&
      videoRef.current &&
      videoRef.current.readyState >= 2
    ) {
      try {
        const res = landmarkerRef.current.detectForVideo(videoRef.current, now);
        const hands: { pts: Landmark[]; left: boolean }[] = [];
        if (res.landmarks) {
          for (let i = 0; i < res.landmarks.length; i++) {
            const lm = res.landmarks[i];
            const handed = res.handedness?.[i]?.[0]?.categoryName ?? "Right";
            // MediaPipe labels by the camera's view; the user sees a mirror, so
            // "Right" in the result is the user's LEFT hand (voice A).
            const isUserLeft = handed === "Right";
            hands.push({ pts: lm, left: isUserLeft });
            const wristY = lm[WRIST].y;
            if (isUserLeft) {
              const period = trackerA.current.push(wristY, now);
              if (period) {
                gesturedA.current = period;
                flashA.current = now;
                applyLock();
              }
            } else {
              const period = trackerB.current.push(wristY, now);
              if (period) {
                gesturedB.current = period;
                flashB.current = now;
                applyLock();
              }
            }
          }
        }
        handsRef.current = hands;
        drawOverlay();
      } catch {
        /* transient detect error — skip this frame */
      }
    }

    // Advance each voice's visual phase by its current beat period.
    const engine = engineRef.current;
    const periodA = engine ? engine.getVoicePeriod(0) : gesturedA.current;
    const periodB = engine
      ? engine.getVoicePeriod(1)
      : gesturedA.current / DEFAULT_RATIO.value;
    phaseA.current += (dt / periodA) * Math.PI * 2;
    phaseB.current += (dt / periodB) * Math.PI * 2;

    sceneRef.current?.update(
      phaseA.current,
      phaseB.current,
      flashA.current,
      flashB.current,
    );

    rafRef.current = requestAnimationFrame(frame);
  }, [applyLock, driveDemo, drawOverlay]);

  // ── Set up the three.js scene + rAF loop immediately (auto-demo) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createScene(canvas);
    sceneRef.current = scene;

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      scene.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      const ov = overlayRef.current;
      if (ov) {
        ov.width = ov.clientWidth;
        ov.height = ov.clientHeight;
      }
    };
    fit();
    window.addEventListener("resize", fit);

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", fit);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [frame]);

  // ── Start: build audio inside the gesture, then try camera + MediaPipe ───────
  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    setNotice(null);

    // Audio must be created inside the user gesture (iOS unlock / autoplay).
    const engine = new PolytempoEngine();
    await engine.resume();
    engine.onBeat = (b) => {
      if (b.voice === 0) flashA.current = performance.now();
      else flashB.current = performance.now();
    };
    engine.setVoicePeriod(0, gesturedA.current);
    engine.setVoicePeriod(1, gesturedA.current / ratio.value);
    engine.start();
    engineRef.current = engine;

    // Try camera + MediaPipe Hands; fall back to tap pads on any failure.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      const vision = (await import(
        /* webpackIgnore: true */ MEDIAPIPE_CDN
      )) as unknown as MediaPipeVision;
      const fileset =
        await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const landmarker = await vision.HandLandmarker.createFromOptions(
        fileset,
        {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
        },
      );
      landmarkerRef.current = landmarker;
      trackerA.current.reset();
      trackerB.current.reset();
      modeRef.current = "camera";
      setMode("camera");
      setNotice(
        "Conduct! Left hand sets voice A, right hand voice B. Beat at the bottom of each downward stroke.",
      );
    } catch {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      modeRef.current = "fallback";
      setMode("fallback");
      setNotice(
        "No camera or hand-tracking — tap the two pads below to conduct each voice instead. Nothing is recorded or sent anywhere.",
      );
    }
  }, [ratio.value]);

  // ── Fallback tap pads: tap interval → that voice's gestured tempo ────────────
  const tapPad = useCallback(
    (voice: 0 | 1) => {
      const now = performance.now();
      const prev = lastTap.current[voice];
      lastTap.current[voice] = now;
      if (voice === 0) flashA.current = now;
      else flashB.current = now;
      if (prev > 0) {
        const interval = now - prev;
        if (interval >= 200 && interval <= 1600) {
          const period = interval / 1000;
          if (voice === 0) gesturedA.current = period;
          else gesturedB.current = period;
          applyLock();
        }
      }
    },
    [applyLock],
  );

  // ── Teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.close();
      landmarkerRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#07061a] font-mono text-white">
      {/* three.js phase-space fills the screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Hidden source video + PIP overlay with hand landmarks */}
      <video ref={videoRef} className="hidden" playsInline muted />
      {mode === "camera" && (
        <div className="absolute bottom-3 left-3 z-10 h-24 w-32 overflow-hidden rounded-lg ring-1 ring-violet-300/40">
          <canvas ref={overlayRef} className="h-full w-full" />
        </div>
      )}

      {/* Title + live ratio readout */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center px-4 pt-5 text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-white drop-shadow">
          Conductor&apos;s Hands
        </h1>
        <p className="mt-1 max-w-xl text-base text-white/80">
          Two hands beat two voices locked to an irrational tempo ratio — their
          pulses can never realign.
        </p>
        <div className="mt-3 flex items-center gap-4 text-base">
          <span className="text-violet-300">
            Voice A {bpmA} BPM
          </span>
          <span className="text-white/75">
            ratio{" "}
            <span className="text-amber-300/95">
              {ratio.name} ≈ {ratio.value.toFixed(3)}
            </span>
          </span>
          <span className="text-amber-300/95">
            Voice B {Math.round(bpmA * ratio.value)} BPM
          </span>
        </div>
      </div>

      {/* Start overlay (auto-demo plays silently behind it) */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#07061a]/70 px-6 text-center">
          <p className="max-w-md text-xl text-white/95">
            Conduct two tempi at once. The system snaps voice B to an irrational
            multiple of voice A, so the two pulses drift forever and never share
            a downbeat — Nancarrow in your own arms.
          </p>
          <p className="max-w-md text-base text-white/75">
            The camera runs locally for hand-tracking only. Nothing is recorded,
            uploaded, or networked.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-2xl bg-violet-500/30 px-8 py-3 text-xl font-semibold text-white ring-2 ring-violet-300/70 transition active:scale-95"
          >
            Start conducting
          </button>
        </div>
      )}

      {/* Degradation / instruction notice */}
      {notice && (
        <div className="absolute left-1/2 top-28 z-10 w-[90%] max-w-md -translate-x-1/2 rounded-2xl bg-black/55 px-4 py-3 text-center">
          <p
            className={
              mode === "fallback"
                ? "text-base text-rose-300"
                : "text-base text-white/80"
            }
          >
            {notice}
          </p>
        </div>
      )}

      {/* Fallback tap pads (always playable without a camera) */}
      {mode === "fallback" && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-end justify-center gap-6 px-4 pb-8">
          <button
            onClick={() => tapPad(0)}
            className="min-h-[44px] rounded-2xl bg-violet-500/25 px-8 py-5 text-xl font-semibold text-violet-300 ring-2 ring-violet-300/60 transition active:scale-95"
          >
            Beat A
          </button>
          <button
            onClick={() => tapPad(1)}
            className="min-h-[44px] rounded-2xl bg-amber-500/20 px-8 py-5 text-xl font-semibold text-amber-300/95 ring-2 ring-amber-300/60 transition active:scale-95"
          >
            Beat B
          </button>
        </div>
      )}

      {/* Design notes link (corner) */}
      <Link
        href={README_URL}
        className="absolute bottom-2 right-3 z-20 text-base text-violet-300 underline decoration-violet-300/50 underline-offset-2"
      >
        Read the design notes
      </Link>
    </main>
  );
}
