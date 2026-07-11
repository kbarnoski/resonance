"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";
import {
  createLandmarker,
  demoDrive,
  driveFromResult,
  neutralDrive,
  type FaceDrive,
  type FaceLandmarkerLike,
} from "./face";
import { Mandala, type MandalaDrive } from "./mandala";
import { FaceAudio, makeAudio } from "./audio";
import { README } from "./readme";

/* ------------------------------------------------------------------ *
 * 1482 — Face Mandala
 * Your own face conducts a living psychedelic mandala. MediaPipe
 * FaceLandmarker v2 reads live blendshapes + head pose and bends an
 * ecstatic kaleidoscopic bloom (three.js InstancedMesh scene-graph)
 * and its affect-coupled synth. Falls back to a synthetic self-demo
 * if camera / CDN / WebGL are unavailable.
 * ------------------------------------------------------------------ */

type Phase = "idle" | "running";
type Track = "loading" | "tracking" | "no-face" | "self-demo";

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

export default function FaceMandala() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [track, setTrack] = useState<Track>("loading");
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState("jaw 0.00 · smile 0.00");

  // refs the render loop reads
  const mandalaRef = useRef<Mandala | null>(null);
  const audioRef = useRef<FaceAudio | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const trackRef = useRef<Track>("loading");
  const usingCamRef = useRef(false);
  const liveDriveRef = useRef<FaceDrive>(neutralDrive());
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.2 }));
  const startedAtRef = useRef(0);

  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  // -- try camera + MediaPipe; on any failure, run the self-demo --
  const startTracking = useCallback(async () => {
    try {
      landmarkerRef.current = await createLandmarker();
    } catch {
      usingCamRef.current = false;
      setTrack("self-demo");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      await video.play();
      usingCamRef.current = true;
      setTrack("tracking");
    } catch {
      usingCamRef.current = false;
      setTrack("self-demo");
    }
  }, []);

  const runDetect = useCallback((tsMs: number) => {
    const lm = landmarkerRef.current;
    const video = videoRef.current;
    if (!lm || !video || video.readyState < 2) return;
    try {
      const res = lm.detectForVideo(video, tsMs);
      const d = driveFromResult(res);
      liveDriveRef.current = d;
      if (!d.present && trackRef.current === "tracking") setTrack("no-face");
      else if (d.present && trackRef.current === "no-face") setTrack("tracking");
    } catch {
      /* transient detect error — keep last drive */
    }
  }, []);

  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mandala = new Mandala(canvas);
    mandalaRef.current = mandala;

    const reduced = prefersReducedMotion();
    const flicker = flickerRef.current;
    // A very gentle opt-in breathing shimmer, clamped to <=3 Hz.
    if (!reduced) flicker.enable();

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      mandala.resize(canvas.clientWidth, canvas.clientHeight, dpr);
    };
    fit();
    const onResize = () => fit();
    window.addEventListener("resize", onResize);

    // smoothed drive so expression feels like breath
    const sm: FaceDrive = neutralDrive();
    let lastPulse = 0;
    let lastBlinkT = 0;
    let readoutClock = 0;
    startedAtRef.current = performance.now();

    const frame = (now: number) => {
      const tSec = (now - startedAtRef.current) / 1000;

      if (usingCamRef.current) runDetect(now);

      // choose live face or the synthetic self-demo
      const target =
        usingCamRef.current && liveDriveRef.current.present
          ? liveDriveRef.current
          : demoDrive(tSec, reduced);

      const k = reduced ? 0.05 : 0.14;
      sm.jawOpen = lerp(sm.jawOpen, target.jawOpen, k);
      sm.smile = lerp(sm.smile, target.smile, k);
      sm.browInnerUp = lerp(sm.browInnerUp, target.browInnerUp, k);
      sm.browDown = lerp(sm.browDown, target.browDown, k);
      sm.pucker = lerp(sm.pucker, target.pucker, k);
      sm.yaw = lerp(sm.yaw, target.yaw, k);
      sm.pitch = lerp(sm.pitch, target.pitch, k);
      sm.roll = lerp(sm.roll, target.roll, k);
      sm.present = target.present;

      // blink → throttled pulse + bell strike
      const blink = Math.max(target.blinkL, target.blinkR);
      lastPulse = Math.max(lastPulse * (reduced ? 0.9 : 0.86), 0);
      if (blink > 0.5 && tSec - lastBlinkT > 0.35) {
        lastBlinkT = tSec;
        lastPulse = 1;
        audioRef.current?.strike(0.5 + sm.jawOpen * 0.5);
      }

      // audio update
      audioRef.current?.update(
        sm.jawOpen,
        sm.smile,
        sm.browInnerUp,
        sm.browDown,
        sm.pucker,
        sm.present ? 1 : 0.4,
      );

      const bright = reduced ? 1 : flicker.value(tSec);
      const drive: MandalaDrive = {
        bloom: sm.jawOpen,
        warmth: sm.smile,
        lift: sm.browInnerUp,
        contract: sm.browDown,
        focus: sm.pucker,
        yaw: sm.yaw,
        pitch: sm.pitch,
        roll: sm.roll,
        bright,
        pulse: lastPulse,
        present: sm.present,
      };
      mandala.update(drive, tSec);

      // throttled live readout
      readoutClock += 1;
      if (readoutClock % 12 === 0) {
        const mode =
          trackRef.current === "self-demo"
            ? "self-demo"
            : trackRef.current === "no-face"
              ? "no face"
              : "live";
        setReadout(
          `${mode} · jaw ${sm.jawOpen.toFixed(2)} · smile ${sm.smile.toFixed(
            2,
          )} · brow ${sm.browInnerUp.toFixed(2)}`,
        );
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => window.removeEventListener("resize", onResize);
  }, [runDetect]);

  const cleanupLoopRef = useRef<(() => void) | null>(null);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    setPhase("running");
    setTrack("loading");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioRef.current = await makeAudio(ctx);
    } catch {
      /* audio may be unavailable; visuals still run */
    }
    cleanupLoopRef.current = startLoop() ?? null;
    void startTracking();
  }, [phase, startLoop, startTracking]);

  // full teardown on unmount — no leaks
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      cleanupLoopRef.current?.();
      audioRef.current?.dispose();
      audioRef.current = null;
      try {
        landmarkerRef.current?.close?.();
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null;
      mandalaRef.current?.dispose();
      mandalaRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const isDemo = track === "self-demo";
  const statusLine: Record<Track, string> = {
    loading: "Loading face tracker…",
    tracking: "Tracking — open your jaw to bloom, smile for gold, raise brows, tilt your head.",
    "no-face": "No face found — center your face, or just watch it breathe.",
    "self-demo": "Camera / face tracking unavailable — running self-demo.",
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* hidden camera preview — MediaPipe input only */}
      <video ref={videoRef} className="hidden" playsInline muted />

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        <header className="p-5 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Face Mandala
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Your own face conducts a living psychedelic mandala — your mouth,
            brows, and gaze bend an ecstatic kaleidoscopic bloom in real 3D.
          </p>
          {phase === "running" && (
            <p
              className={`mt-3 font-mono text-base ${
                isDemo ? "text-violet-300" : "text-violet-300/95"
              }`}
            >
              {statusLine[track]}
            </p>
          )}
        </header>

        {phase === "idle" && (
          <div className="flex flex-1 items-center justify-center px-5">
            <div className="pointer-events-auto flex max-w-md flex-col items-center gap-4">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start camera
              </button>
              <p className="text-center text-base text-muted-foreground">
                Sound and camera start on Start. Open your jaw to bloom the
                mandala, smile for warmth, raise your brows for an upper tier,
                purse your lips to sharpen the petals, tilt your head to steer it
                in 3D. No camera? A self-demo plays automatically.
              </p>
            </div>
          </div>
        )}

        {phase === "running" && (
          <div className="mt-auto p-5 sm:p-8">
            <div className="pointer-events-none mb-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-base text-muted-foreground">
              <span className="text-violet-300">jaw → bloom + swell</span>
              <span className="text-violet-300/95">smile → gold glow</span>
              <span className="text-violet-300/95">brow → upper tier</span>
              <span>pucker → sharper petals · head → tilt</span>
            </div>
            <p className="font-mono text-base text-muted-foreground">{readout}</p>
          </div>
        )}
      </div>

      {phase === "running" && (
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="pointer-events-auto absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
        >
          {showNotes ? "Hide design notes" : "Read the design notes"}
        </button>
      )}

      {showNotes && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {README}
            </pre>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1482-face-mandala"]} />
    </main>
  );
}
