"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createLandmarker,
  MotionAnalyser,
  ghostLandmarks,
  type Landmark,
  type MotionFrame,
  type PoseLandmarkerInst,
} from "./pose";
import { startAudio, type AudioHandle } from "./audio";
import { startScene, type SceneHandle } from "./scene";

type Phase = "idle" | "loading" | "playing";

export default function KidsShadowDance() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioRef = useRef<AudioHandle | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const poseRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<MotionAnalyser | null>(null);
  const rafRef = useRef<number>(0);

  const lastTimeRef = useRef<number>(0);
  const lastDetectRef = useRef<number>(0); // wall-clock of last real detection
  const lastMotionRef = useRef<number>(0); // wall-clock of last real motion
  const ghostTimeRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [usingGhost, setUsingGhost] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── The per-frame pump ─────────────────────────────────────────────────
  const loop = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000 || 0.016);
    lastTimeRef.current = now;

    const analyser = analyserRef.current;
    const scene = sceneRef.current;
    const audio = audioRef.current;
    if (!analyser) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    let lm: Landmark[] | null = null;
    const pose = poseRef.current;
    const video = videoRef.current;

    // Try the real camera path.
    if (pose && video && video.readyState >= 2) {
      try {
        const res = pose.detectForVideo(video, now);
        lm = res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
        if (lm) lastDetectRef.current = now;
      } catch {
        lm = null;
      }
    }

    // Decide whether to fall back to the synthetic ghost dancer:
    //  - no camera at all, OR
    //  - >2s since a real body produced detectable motion.
    const noBody = !lm || now - lastDetectRef.current > 2000;
    const stale = now - lastMotionRef.current > 2000;
    let frame: MotionFrame;
    if (noBody || stale) {
      ghostTimeRef.current += dt;
      const gl = ghostLandmarks(ghostTimeRef.current);
      frame = analyser.push(gl);
      if (!usingGhost) setUsingGhost(true);
    } else {
      frame = analyser.push(lm);
      if (usingGhost) setUsingGhost(false);
    }

    // Track real motion so we know when the kid stops dancing.
    if (lm && frame.energy > 0.08) lastMotionRef.current = now;

    audio?.update(frame);
    scene?.update(frame, dt);

    rafRef.current = requestAnimationFrame(loop);
  }, [usingGhost]);

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");
    setNotice(null);

    // 1) Audio — created inside the user gesture (iOS gate).
    let audioOk = true;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      audioRef.current = startAudio(ctx);
    } catch {
      audioOk = false;
      setNotice("Sound is off on this device, but you can still dance with the lights.");
    }

    // 2) GPU scene.
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("no canvas");
      sceneRef.current = startScene(canvas);
      sceneRef.current.resize(canvas.clientWidth, canvas.clientHeight);
    } catch {
      setNoWebgl(true);
      setNotice(
        audioOk
          ? "This screen can't show the lights, but the music is playing — keep dancing!"
          : "This device can't run the visuals.",
      );
    }

    analyserRef.current = new MotionAnalyser();
    lastTimeRef.current = performance.now();

    // 3) Camera + pose — best effort. Failure => synthetic ghost dancer.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
      }
      // Load pose model from CDN; on failure we silently use the ghost.
      poseRef.current = await createLandmarker();
      lastDetectRef.current = performance.now();
      lastMotionRef.current = performance.now();
    } catch {
      setUsingGhost(true);
      setNotice(
        "No camera here — watch the ghost dancer show you how it moves!",
      );
    }

    setPhase("playing");
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, loop]);

  // Resize handling.
  useEffect(() => {
    function onResize() {
      const c = canvasRef.current;
      if (c && sceneRef.current) {
        sceneRef.current.resize(c.clientWidth, c.clientHeight);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        poseRef.current?.close();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      sceneRef.current?.dispose();
      audioRef.current?.close();
      ctxRef.current?.close().catch(() => {});
      poseRef.current = null;
      streamRef.current = null;
      sceneRef.current = null;
      audioRef.current = null;
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#07060f] text-foreground">
      {/* Hidden analysis-only video — never recorded, never uploaded. */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* GPU particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {/* Soft vignette so the field feels cinematic */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65)_100%)]" />

      {/* ── Idle / hero overlay ───────────────────────────────────────── */}
      {phase !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="text-6xl">🕺✨</div>
          <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">
            Shadow Dance
          </h1>
          <p className="max-w-md text-base text-foreground sm:text-lg">
            Dance, wave, and stomp. Your whole body scatters a cloud of light
            and makes the music move.
          </p>
          <button
            onClick={start}
            disabled={phase === "loading"}
            aria-label="Start dancing"
            className="mt-2 min-h-[72px] min-w-[200px] rounded-full bg-gradient-to-r from-violet-500 to-violet-400 px-10 text-2xl font-semibold text-[#07060f] shadow-[0_0_40px_rgba(167,139,250,0.5)] transition active:scale-95 disabled:opacity-70"
          >
            {phase === "loading" ? "✨ …" : "Dance! 💃"}
          </button>
          <p className="text-sm text-muted-foreground">
            Best on a phone or tablet. Stand back so it can see you.
          </p>
        </div>
      )}

      {/* ── Notices ───────────────────────────────────────────────────── */}
      {phase === "playing" && notice && (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 px-4">
          <p className="rounded-full bg-black/60 px-4 py-2 text-center text-base text-violet-300 backdrop-blur">
            {notice}
          </p>
        </div>
      )}
      {phase === "playing" && noWebgl && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-base text-violet-300">
            Visuals are off on this screen — the music keeps playing. 🎵
          </p>
        </div>
      )}

      {/* Ghost-dancer hint */}
      {phase === "playing" && usingGhost && !notice && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-20 -translate-x-1/2 px-4">
          <p className="rounded-full bg-black/40 px-4 py-2 text-center text-base text-violet-300 backdrop-blur">
            ✨ Wave your arms to take over the dance!
          </p>
        </div>
      )}

      {/* ── Design notes ──────────────────────────────────────────────── */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        aria-label="Design notes"
        className="absolute right-3 top-3 z-30 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground backdrop-blur transition hover:bg-accent"
      >
        ℹ︎
      </button>
      {showNotes && (
        <div className="absolute right-3 top-14 z-30 w-72 rounded-2xl border border-border bg-black/85 p-4 text-left backdrop-blur">
          <h2 className="text-xl text-foreground">Design notes</h2>
          <p className="mt-2 text-base text-foreground">
            Your body&rsquo;s movement — not pitch — makes the sound. Big moves
            brighten the light cloud, smooth moves add shimmer, and sudden
            stomps thump.
          </p>
          <a
            href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/911-kids-shadow-dance/README.md"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-base text-violet-300 underline"
          >
            Read more →
          </a>
          <p className="mt-3 text-sm text-muted-foreground">
            Camera stays on your device. Nothing is recorded or sent.
          </p>
          <Link
            href="/dream"
            className="mt-2 inline-block text-sm text-muted-foreground underline"
          >
            ← all dreams
          </Link>
        </div>
      )}
    </main>
  );
}
