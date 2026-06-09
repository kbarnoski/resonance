"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 444 · Kids Aurora Hands
//
// "What if a 4-year-old could cup, swirl, and scatter a huge living galaxy of
//  light with their bare HANDS in the air — and the galaxy sings?"
//
// INPUT  : MediaPipe HandLandmarker (camera, up to 2 hands)
// OUTPUT : WebGPU compute particle galaxy (WebGL2 fallback)
// AUDIO  : Continuous pentatonic chord-cloud — NEVER silent, NEVER percussive
// VIBE   : Kids / calm / cosmic / continuous
//
// References:
//   MediaPipe HandLandmarker (Google) · NVIDIA Flex interactive particles
//   three.js + MediaPipe hand-tracking particle demos (2026)
//   Refik Anadol latent/particle-flow lineage
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioEngine, type AudioEngine, type HandAudioState } from "./audio";
import { createGalaxyRenderer, type GalaxyRenderer, type RenderPath } from "./gpu";
import { makeGhostHands, startHandTracking, type HandState, type Attractor } from "./hands";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "tap" | "running" | "cameraFail";

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function KidsAuroraHands() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef  = useRef<HTMLVideoElement>(null);
  const audioRef  = useRef<AudioEngine | null>(null);
  const gpuRef    = useRef<GalaxyRenderer | null>(null);
  const rafRef    = useRef<number>(0);

  // Ghost hands (always running as fallback)
  const ghostRef  = useRef(makeGhostHands());

  // Real hand tracking (null until camera granted + model loaded)
  const trackingRef = useRef<Awaited<ReturnType<typeof startHandTracking>>>(null);
  const usingRealRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("tap");
  const [camMessage, setCamMessage] = useState<string | null>(null);
  const [renderPath, setRenderPath] = useState<RenderPath | null>(null);

  // ── Main render + audio loop (started once user taps) ─────────────────────

  const startLoop = useCallback((renderer: GalaxyRenderer, audio: AudioEngine) => {
    let lastTime = performance.now();

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // Get hand data: real tracking if available, ghost otherwise
      let hands: [HandState, HandState];
      let attractors: Attractor[];

      if (usingRealRef.current && trackingRef.current) {
        const out = trackingRef.current.sample(dt);
        hands = out.hands;
        attractors = out.attractors;
      } else {
        const out = ghostRef.current(dt);
        hands = out.hands;
        attractors = out.attractors;
      }

      // Update GPU particles
      renderer.frame(attractors, dt, now / 1000);

      // Update audio
      const audioHands: [HandAudioState, HandAudioState] = [
        {
          x: hands[0].x,
          height: hands[0].height,
          openness: hands[0].openness,
          speed: hands[0].speed,
          active: hands[0].active,
        },
        {
          x: hands[1].x,
          height: hands[1].height,
          openness: hands[1].openness,
          speed: hands[1].speed,
          active: hands[1].active,
        },
      ];
      audio.update(audioHands, dt);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Tap-to-start: create audio + gpu, start ghost demo immediately ─────────

  const handleTapStart = useCallback(async () => {
    if (phase !== "tap") return;
    setPhase("running");

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(canvas.offsetWidth  * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);

    // Create audio (inside gesture for iOS)
    let audio: AudioEngine;
    try {
      audio = createAudioEngine();
      await audio.resume();
      audioRef.current = audio;
    } catch {
      // Audio failed — still show visuals
      audio = {
        ctx: new AudioContext(),
        update() { /* no-op */ },
        resume: async () => { /* no-op */ },
        destroy() { /* no-op */ },
      };
    }

    // Create GPU renderer (tries WebGPU, falls back to WebGL2)
    const { renderer, path } = await createGalaxyRenderer(canvas);
    gpuRef.current = renderer;
    setRenderPath(path);

    // Start the loop immediately with ghost hands
    startLoop(renderer, audio);
  }, [phase, startLoop]);

  // ── Camera upgrade button ──────────────────────────────────────────────────

  const handleCameraUpgrade = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    // Camera init is NOT inside a fresh gesture click handler on mobile
    // but we keep this button at ≥64px so it's easy to tap
    const result = await startHandTracking(video, (msg) => {
      setCamMessage(msg);
      setPhase("cameraFail");
    });

    if (result) {
      trackingRef.current = result;
      usingRealRef.current = true;
      setPhase("running");
      setCamMessage(null);
    }
  }, []);

  // ── Resize handler ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.offsetWidth  * dpr);
      const h = Math.round(canvas.offsetHeight * dpr);
      canvas.width  = w;
      canvas.height = h;
      gpuRef.current?.resize(w, h);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      gpuRef.current?.destroy();
      gpuRef.current = null;
      audioRef.current?.destroy();
      audioRef.current = null;
      trackingRef.current?.destroy();
      trackingRef.current = null;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="relative w-full overflow-hidden select-none touch-none"
      style={{ height: "calc(100vh - 3rem)", background: "#040210" }}
    >
      {/* ── Hidden video element for MediaPipe analysis only (never shown) ── */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        aria-hidden="true"
      />

      {/* ── Galaxy canvas ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
        aria-label="Living galaxy of light — wave your hands!"
      />

      {/* ── Tap-to-start overlay (iOS audio unlock + initial splash) ── */}
      {phase === "tap" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-20"
          style={{ background: "radial-gradient(ellipse at 50% 40%, #12063a99 0%, #04021099 100%)" }}
        >
          <div className="mb-6 text-8xl leading-none" aria-hidden="true">🌌</div>
          <h1 className="text-3xl font-bold text-white/95 mb-3 drop-shadow-xl">
            Aurora Galaxy
          </h1>
          <p className="text-xl text-white/80 max-w-sm leading-relaxed mb-10">
            Wave your hands to shape a galaxy of light — it sings when you move!
          </p>
          <button
            onClick={() => { void handleTapStart(); }}
            className="min-h-[72px] px-10 py-5 rounded-3xl text-2xl font-bold text-white
                       bg-violet-600/50 border-2 border-violet-300/70
                       hover:bg-violet-500/60 active:scale-95 transition-all shadow-2xl
                       drop-shadow-lg"
            aria-label="Tap to start the galaxy"
          >
            ✨ Touch to Start
          </button>

          <Link
            href="/dream"
            className="mt-10 text-base text-white/60 hover:text-white/85 transition-colors"
          >
            ← dream lab
          </Link>
        </div>
      )}

      {/* ── Running HUD ── */}
      {phase === "running" && (
        <>
          {/* Render path badge (top-right, small) */}
          {renderPath && (
            <div className="absolute top-3 right-4 z-10 pointer-events-none">
              <span className="text-xs text-white/40 font-mono tracking-wider uppercase">
                {renderPath === "webgpu" ? "WebGPU ✦" : renderPath === "webgl2" ? "WebGL2 ◈" : ""}
              </span>
            </div>
          )}

          {/* Camera upgrade button (≥64px, clearly labelled) */}
          {!usingRealRef.current && (
            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 z-10">
              <button
                onClick={() => { void handleCameraUpgrade(); }}
                className="min-h-[68px] px-8 py-4 rounded-2xl text-xl font-bold text-white
                           bg-indigo-600/40 border-2 border-indigo-300/60
                           hover:bg-indigo-500/55 active:scale-95 transition-all shadow-xl"
                aria-label="Turn on camera for hand tracking"
              >
                ✋ Use My Hands
              </button>
              <p className="text-base text-white/60">
                Ghost hands are playing — tap above to use your real hands!
              </p>
            </div>
          )}

          {/* Live hand tracking hint */}
          {usingRealRef.current && (
            <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none z-10 px-4">
              <p className="text-xl text-white/80 text-center drop-shadow">
                Open hands to scatter ✦  Bring them together to gather ✦
              </p>
            </div>
          )}

          {/* Back + design notes */}
          <div className="absolute top-3 left-4 z-10 flex items-center gap-4">
            <Link
              href="/dream"
              className="text-base text-white/55 hover:text-white/85 transition-colors"
            >
              ← dream
            </Link>
            <a
              href="/dream/444-kids-aurora-hands/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-base text-white/40 hover:text-white/70 transition-colors"
            >
              Read the design notes ↗
            </a>
          </div>
        </>
      )}

      {/* ── Camera fail / ghost-hands notice ── */}
      {phase === "cameraFail" && (
        <>
          <div className="absolute top-4 left-0 right-0 flex justify-center z-10 px-4 pointer-events-none">
            <p className="text-xl text-rose-300 text-center drop-shadow max-w-sm">
              {camMessage ?? "Camera unavailable — ghost hands are dancing!"}
            </p>
          </div>

          {/* Back + design notes */}
          <div className="absolute top-3 left-4 z-10 flex items-center gap-4">
            <Link
              href="/dream"
              className="text-base text-white/55 hover:text-white/85 transition-colors"
            >
              ← dream
            </Link>
            <a
              href="/dream/444-kids-aurora-hands/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-base text-white/40 hover:text-white/70 transition-colors"
            >
              Read the design notes ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
