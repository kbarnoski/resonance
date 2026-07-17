"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  computeSyntheticSignals,
  makeFlowSignals,
  OpticalFlow,
  type FlowSignals,
} from "./flow";
import { Flock, makeClusterStats } from "./flock";
import { MurmurAudio } from "./audio";
import { initGL, type GLRenderer } from "./gl";

const N = 260;
const CLUSTERS = 4;
const SEED = 0x1856;

type Mode = "synthetic" | "camera";

export default function MurmurationPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [mode, setMode] = useState<Mode>("synthetic");
  const [needsTap, setNeedsTap] = useState(false);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Mutable engine handles shared across the animation loop.
  const modeRef = useRef<Mode>("synthetic");
  const audioRef = useRef<MurmurAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const flowRef = useRef<OpticalFlow | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // --- Engines -------------------------------------------------------------
    const flock = new Flock(N, CLUSTERS, SEED);
    const stats = makeClusterStats(CLUSTERS);
    const sig: FlowSignals = makeFlowSignals();
    const camSig: FlowSignals = makeFlowSignals();
    const gpuData = new Float32Array(N * 4);

    let renderer: GLRenderer | null = null;
    try {
      renderer = initGL(canvas);
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setGlNotice(
        "WebGL2 is unavailable here — the murmuration is silent to the eye, but it is still singing.",
      );
    }

    let audio: MurmurAudio | null = null;
    try {
      audio = new MurmurAudio(CLUSTERS);
      audioRef.current = audio;
      setNeedsTap(audio.suspended());
      void audio.resume().then(() => {
        if (audio) setNeedsTap(audio.suspended());
      });
    } catch {
      audio = null;
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer?.resize(w, h, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let last = performance.now();
    const start = last;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp after tab-switch stalls
      const t = (now - start) / 1000;

      // --- Input: synthetic conductor or live optical flow ------------------
      if (modeRef.current === "camera" && flowRef.current && videoRef.current) {
        const ok = flowRef.current.compute(videoRef.current, camSig);
        if (ok) {
          // Ease toward the measured signal for stability.
          sig.energy += (camSig.energy - sig.energy) * 0.35;
          sig.cx += (camSig.cx - sig.cx) * 0.35;
          sig.cy += (camSig.cy - sig.cy) * 0.35;
          sig.dirX = camSig.dirX;
          sig.dirY = camSig.dirY;
        }
      } else {
        computeSyntheticSignals(t, sig);
      }

      // --- Simulation -------------------------------------------------------
      flock.step(sig, dt);
      flock.computeStats(stats);

      // --- Audio ------------------------------------------------------------
      if (audio) {
        audio.update(stats, sig.energy);
        audio.schedule();
      }

      // --- Render -----------------------------------------------------------
      if (renderer) {
        for (let i = 0; i < N; i++) {
          const o = i * 4;
          gpuData[o] = flock.px[i];
          gpuData[o + 1] = flock.py[i];
          gpuData[o + 2] = flock.cluster[i] / (CLUSTERS - 1);
          gpuData[o + 3] = flock.speed[i];
        }
        // Reduced motion: full clear (no trails). Otherwise linger for ribbons.
        const fade = reduce ? 1.0 : 0.16;
        renderer.draw(gpuData, N, { fade, energy: sig.energy });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer?.dispose();
      audio?.dispose();
      audioRef.current = null;
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }
      flowRef.current = null;
    };
    // Engines are created once on mount; the loop reads live state via refs.
  }, []);

  const enableCamera = useCallback(async () => {
    setCamNotice(null);
    // A camera tap is also a user gesture — resume audio if needed.
    await audioRef.current?.resume();
    if (audioRef.current) setNeedsTap(audioRef.current.suspended());

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamNotice(
        "This browser will not hand over a camera — the self-demo keeps conducting.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      let video = videoRef.current;
      if (!video) {
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        videoRef.current = video;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      flowRef.current = new OpticalFlow(64, 48);
      setMode("camera");
    } catch {
      setCamNotice(
        "Camera permission was declined or unavailable — the self-demo keeps conducting.",
      );
    }
  }, []);

  const tapToBegin = useCallback(async () => {
    await audioRef.current?.resume();
    if (audioRef.current) setNeedsTap(audioRef.current.suspended());
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream 1856 · Murmuration
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Conduct a flock of voices
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          A starling murmuration where each bird is a voice — herd it with your
          body and the flock becomes the music.
        </p>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-24 z-20 flex flex-wrap items-center justify-center gap-3 px-6">
        {mode === "synthetic" ? (
          <button
            onClick={enableCamera}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Conduct with camera
          </button>
        ) : (
          <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Live · you are conducting
          </span>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Notices */}
      {(camNotice || glNotice) && (
        <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-1 px-6 text-center">
          {camNotice && <p className="text-sm text-destructive">{camNotice}</p>}
          {glNotice && <p className="text-sm text-destructive">{glNotice}</p>}
        </div>
      )}

      {/* Autoplay gate */}
      {needsTap && (
        <button
          onClick={tapToBegin}
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <span className="min-h-[44px] rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Tap to begin
          </span>
        </button>
      )}

      {/* Design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </span>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Murmuration
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                What if you conduct a living murmuration of sound — a flock of
                birds where each bird is a voice — just by moving in front of
                your camera?
              </p>
              <p>
                Your camera is read as a pure frame-difference motion field (no
                model, no microphone). Where you move becomes an attractor that
                herds a Boids flock; how much you move sets the tempo and
                loudness. The flock is split into four sections — each section&apos;s
                height picks a pentatonic pitch, its coherence opens a filter,
                its position pans the stereo field.
              </p>
              <p>
                <strong className="text-foreground">How to use it:</strong> it is
                already alive and playing under a synthetic conductor. Press
                &ldquo;Conduct with camera,&rdquo; allow the camera, then sweep a
                hand slowly for a calm swell or dance for a dense, bright swarm.
              </p>
              <p>
                <strong className="text-foreground">References:</strong> Craig
                Reynolds, <em>Boids</em> (1987); natural starling murmurations;
                and Mermerci et al., <em>Real-Time Control of a Virtual Orchestra
                by Recognition of Conducting Gestures</em> (arXiv 2604.27957,
                2026) — a KTH dome installation whose key finding is that the
                robust real-time channel a conductor commands is temporal:
                energy, tempo, when the beat lands, delivered by the whole moving
                body.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1856-murmuration"]} />
    </main>
  );
}
