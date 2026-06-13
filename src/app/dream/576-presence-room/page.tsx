"use client";

/**
 * 576-presence-room — Presence Room
 *
 * "What if you could lean and turn your head and the music physically moved
 * around you — your own face is the listener, and the warmth surrounds wherever
 * you look?"
 *
 * Your webcam tracks your head pose (MediaPipe FaceLandmarker, loaded from CDN
 * at runtime). That pose drives the Web Audio AudioListener — position and
 * forward orientation — so a sustained just-intonation drone of HRTF-panned
 * voices re-spatialises around you in real time. Lean toward a voice and it
 * blooms. There is nothing to get wrong; you just exist inside the sound.
 *
 * INPUT     : webcam → MediaPipe FaceLandmarker head pose
 * OUTPUT    : raw hand-written WebGL2 fullscreen fragment shader (warm haze + orbs)
 * TECHNIQUE : head-pose → Web Audio AudioListener position/orientation, warm
 *             drone voices as HRTF PannerNodes (head-tracked binaural)
 * VIBE      : warm, enveloping, meditative — no challenge, no score
 *
 * Graceful degradation (06:30 phone glance):
 *   Camera denied / FaceLandmarker fails / no webcam → rose notice + pointer-drag
 *   "look around" + a silent auto-demo that pans the virtual head on a Lissajous
 *   path so the field audibly moves within seconds. The auto-demo cancels on any
 *   real interaction and resumes after ~5s idle.
 *
 * Privacy: camera frames are analysed in-browser only — never recorded or sent.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PresenceEngine, VOICES } from "./audio";
import {
  HeadPoseTracker,
  demoPose,
  dragPose,
  type HeadPose,
  type Landmark,
} from "./face";
import { createRenderer, type Renderer } from "./render";

// ── README link ──────────────────────────────────────────────────────────────

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/576-presence-room/README.md";

// ── MediaPipe (CDN runtime import; typed minimally, no `any`) ─────────────────

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";
const MEDIAPIPE_WASM =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

interface FaceLandmarkerResult {
  faceLandmarks: Landmark[][];
}
interface FaceLandmarkerInst {
  detectForVideo(video: HTMLVideoElement, ts: number): FaceLandmarkerResult;
  close(): void;
}
interface MediaPipeVision {
  FilesetResolver: {
    forVisionTasks(wasmPath: string): Promise<unknown>;
  };
  FaceLandmarker: {
    createFromOptions(
      fileset: unknown,
      opts: {
        baseOptions: { modelAssetPath: string; delegate?: "GPU" | "CPU" };
        runningMode: "VIDEO" | "IMAGE";
        numFaces?: number;
      },
    ): Promise<FaceLandmarkerInst>;
  };
}

// ── Project a voice's ring position to screen space for the orbs ──────────────
// Voices live on a ring around the listener. We rotate each voice's azimuth by
// the negative of the look-yaw so the orb the listener faces sits centre-screen.
function computeOrbScreen(pose: HeadPose): Array<[number, number]> {
  return VOICES.map((v) => {
    const rel = v.azimuth - pose.yaw; // azimuth relative to where you look
    const x = Math.sin(rel) * 0.72;
    const y = -Math.sin(v.elevation) * 0.8 + pose.pitch * 0.5;
    return [x, y] as [number, number];
  });
}

type Phase = "idle" | "loading" | "running";

export default function PresenceRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<PresenceEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const trackerRef = useRef<HeadPoseTracker>(new HeadPoseTracker());
  const landmarkerRef = useRef<FaceLandmarkerInst | null>(null);
  const rafRef = useRef<number>(0);

  // Fallback / interaction state (refs so the rAF loop reads fresh values).
  const liveFaceRef = useRef(false); // true once a real face is tracked
  const dragRef = useRef<{ active: boolean; nx: number; ny: number } | null>(
    null,
  );
  const lastInteractRef = useRef<number>(0); // ms timestamp of last real input

  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  // ── Main render + audio loop ────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const tracker = trackerRef.current;

    const frame = () => {
      const tSec = performance.now() / 1000;
      const nowMs = performance.now();

      // 1) Decide pose source: live face > active drag > auto-demo (if idle).
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      let gotFace = false;
      if (lm && video && video.readyState >= 2) {
        try {
          const res = lm.detectForVideo(video, nowMs);
          const pts = res.faceLandmarks?.[0];
          if (pts && pts.length > 0) {
            tracker.updateFromLandmarks(pts);
            gotFace = true;
            liveFaceRef.current = true;
            lastInteractRef.current = nowMs;
          }
        } catch {
          // transient detector hiccup — fall through to other sources.
        }
      }

      if (!gotFace) {
        const drag = dragRef.current;
        if (drag && drag.active) {
          tracker.updateFromTarget(dragPose(drag.nx, drag.ny));
          lastInteractRef.current = nowMs;
        } else {
          const idleFor = nowMs - lastInteractRef.current;
          // Auto-demo when nothing real has happened for ~5s (and from the start).
          if (idleFor > 5000 || lastInteractRef.current === 0) {
            tracker.updateFromTarget(demoPose(tSec));
          }
          // else: hold the last pose (recently interacted, now still).
        }
      }

      const pose = tracker.current;

      // 2) Drive audio listener + blooms.
      engineRef.current?.applyPose(pose);

      // 3) Render.
      const r = rendererRef.current;
      if (r) {
        const look: [number, number] = [
          Math.sin(pose.yaw) * 0.8,
          pose.pitch * 0.8,
        ];
        const presence = liveFaceRef.current ? 1 : 0.7;
        r.draw({
          time: tSec,
          look,
          presence,
          orbScreen: computeOrbScreen(pose),
          bloom: engineRef.current?.bloomOut ?? [],
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── Try to bring up the camera + FaceLandmarker (best-effort) ───────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const vision = (await import(
        /* webpackIgnore: true */ MEDIAPIPE_CDN
      )) as unknown as MediaPipeVision;
      const fileset = await vision.FilesetResolver.forVisionTasks(
        MEDIAPIPE_WASM,
      );
      const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 1,
      });
      landmarkerRef.current = landmarker;
      lastInteractRef.current = performance.now();
      setTracking(true);
      setNotice(null);
    } catch {
      // No camera / denied / CDN blocked → fallback already covers it.
      setTracking(false);
      setNotice(
        "Camera or face-tracking unavailable — drag anywhere to look around, or just listen as the room drifts on its own.",
      );
    }
  }, []);

  // ── Primary action: Enter the room ──────────────────────────────────────────
  const enter = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    // WebGL2 renderer (audio still runs if this is null).
    const canvas = canvasRef.current;
    if (canvas) {
      const r = createRenderer(canvas);
      rendererRef.current = r;
      if (!r) {
        setNotice(
          "WebGL2 isn't available here, so the visuals are off — the spatial sound still works. Headphones recommended.",
        );
      }
    }

    // Audio first so the auto-demo is audible immediately.
    const engine = new PresenceEngine();
    engineRef.current = engine;
    try {
      await engine.start();
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    setPhase("running");
    startLoop();

    // Best-effort camera; fallback is fine if it fails.
    startCamera();
  }, [phase, startLoop, startCamera]);

  // ── Pointer-drag "look around" (fallback + always available) ────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      active: true,
      nx: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      ny: ((e.clientY - rect.top) / rect.height) * 2 - 1,
    };
    lastInteractRef.current = performance.now();
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    d.nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    d.ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    lastInteractRef.current = performance.now();
  }, []);
  const onPointerUp = useCallback(() => {
    if (dragRef.current) dragRef.current.active = false;
    lastInteractRef.current = performance.now();
  }, []);

  // ── Resize the canvas with the window ───────────────────────────────────────
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      const s = video?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
      rendererRef.current?.dispose();
      engineRef.current?.stop();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white/95">
      {/* WebGL2 canvas (full-bleed) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Hidden camera feed (analysed in-browser, never shown large) */}
      <video
        ref={videoRef}
        className="pointer-events-none absolute bottom-3 right-3 z-10 w-24 origin-bottom-right -scale-x-100 rounded-lg opacity-40"
        style={{ display: tracking ? "block" : "none" }}
        playsInline
        muted
      />

      {/* Read the design notes — corner link */}
      <Link
        href={README_URL}
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 text-base text-white/55 underline-offset-4 hover:text-violet-300 hover:underline"
      >
        Read the design notes
      </Link>

      {/* Intro / overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white/95 sm:text-4xl">
            Presence Room
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            Lean and turn your head — the warm chord physically moves around you.
            Your own face is the listener; the music surrounds wherever you look.
          </p>
          <button
            type="button"
            onClick={enter}
            disabled={phase === "loading"}
            className="min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-white/95 transition hover:bg-violet-400 disabled:opacity-60"
          >
            {phase === "loading" ? "Entering…" : "Enter the room"}
          </button>
          <p className="text-base text-white/55">
            Headphones recommended (binaural). Camera stays in your browser.
          </p>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-6 pb-6 text-center">
          {notice && (
            <p className="max-w-md text-base leading-relaxed text-rose-300">
              {notice}
            </p>
          )}
          <p className="text-base text-white/55">
            {tracking
              ? "Tracking your head — move and the room moves with you."
              : "Drag to look around. Headphones recommended (binaural)."}
          </p>
        </div>
      )}
    </main>
  );
}
