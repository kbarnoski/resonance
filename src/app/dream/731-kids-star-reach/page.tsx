"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 731 · Kids Star Reach
//
// "What if a 4-year-old could reach UP into a deep night sky with their BARE
//  HANDS — no screen to touch — and scoop handfuls of glowing stars that chime?"
//
// INPUT  : MediaPipe HandLandmarker (front camera, analysis-only, off-glass)
// OUTPUT : raw WebGL2 (GLSL ES 3.00) additive point-glow star field
//          (NOT three.js, NOT Canvas2D-primary) · Canvas2D fallback
// AUDIO  : Web Audio — always-on open-fifth drone + pentatonic bell clusters
// VIBE   : kids (4+) / embodied / awe & wonder / no beat, no loop
//
// References (see README):
//   MediaPipe Hands · Journey (thatgamecompany) · Inigo Quilez (additive
//   point-glow / GLSL field lineage)
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createAudioEngine, type AudioEngine } from "./audio";
import { createStarField, type StarField, type RenderPath, type FieldEventInput } from "./field";
import {
  makeGhostHands,
  startHandTracking,
  type HandState,
  type TrackingResult,
} from "./hands";

type Phase = "tap" | "running";

export default function KidsStarReach() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const audioRef = useRef<AudioEngine | null>(null);
  const fieldRef = useRef<StarField | null>(null);
  const rafRef = useRef<number>(0);

  const ghostRef = useRef(makeGhostHands());
  const trackingRef = useRef<TrackingResult | null>(null);
  const usingRealRef = useRef(false);

  // ms timestamp until which we should keep using ghost hands after losing real
  const ghostUntilRef = useRef(0);
  const lastRealSeenRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("tap");
  const [renderPath, setRenderPath] = useState<RenderPath | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [usingReal, setUsingReal] = useState(false);

  // ── Main loop ──────────────────────────────────────────────────────────────
  const startLoop = useCallback((field: StarField, audio: AudioEngine) => {
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      let hands: [HandState, HandState];
      const pulses: FieldEventInput[] = [];

      const real = usingRealRef.current && trackingRef.current;
      let useGhost = !real;

      if (real && trackingRef.current) {
        const out = trackingRef.current.sample(dt);
        if (out.hands[0].active || out.hands[1].active) {
          lastRealSeenRef.current = now;
        }
        // If no real hand for ~3.5s, fall back to ghost so it stays alive.
        if (now - lastRealSeenRef.current > 3500) {
          useGhost = true;
          ghostUntilRef.current = now + 800;
        }
        if (!useGhost) {
          hands = out.hands;
          for (const e of out.events) {
            pulses.push({ kind: e.kind, x: e.x, y: e.y });
            if (e.kind === "gather") audio.ringCluster(e.height, 5, e.pan);
            else audio.spillArc(e.height, 7, e.pan);
          }
        } else {
          const g = ghostRef.current(dt);
          hands = g.hands;
          for (const e of g.events) {
            pulses.push({ kind: e.kind, x: e.x, y: e.y });
            if (e.kind === "gather") audio.ringCluster(e.height, 5, e.pan);
            else audio.spillArc(e.height, 7, e.pan);
          }
        }
      } else {
        const g = ghostRef.current(dt);
        hands = g.hands;
        for (const e of g.events) {
          pulses.push({ kind: e.kind, x: e.x, y: e.y });
          if (e.kind === "gather") audio.ringCluster(e.height, 5, e.pan);
          else audio.spillArc(e.height, 7, e.pan);
        }
      }

      // continuous drone shimmer from average hand height
      const active = hands[0].active || hands[1].active;
      const avgH =
        active
          ? ((hands[0].active ? hands[0].height : 0) +
             (hands[1].active ? hands[1].height : 0)) /
            ((hands[0].active ? 1 : 0) + (hands[1].active ? 1 : 0) || 1)
          : 0.5;
      audio.update(avgH, active);

      field.frame(hands, pulses, dt, now / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Size the canvas to its box ──────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.offsetWidth * dpr);
    const h = Math.round(canvas.offsetHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      fieldRef.current?.resize(w, h);
    }
  }, []);

  // ── Tap to start: unlock audio + camera INSIDE the gesture (iOS) ────────────
  const handleStart = useCallback(async () => {
    if (phase !== "tap") return;
    setPhase("running");

    sizeCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Audio (created inside the tap for iOS)
    let audio: AudioEngine | null = null;
    try {
      audio = createAudioEngine();
      await audio.resume();
      audioRef.current = audio;
    } catch {
      audio = null;
    }

    // Star field (WebGL2 primary, Canvas2D fallback)
    const { field, path } = createStarField(canvas);
    fieldRef.current = field;
    setRenderPath(path);

    // Start alive immediately with ghost demo + drone
    if (audio) startLoop(field, audio);

    // Attempt camera inside the same gesture (best iOS reliability).
    const video = videoRef.current;
    if (video) {
      const result = await startHandTracking(video, (msg) => {
        setCamNotice(msg);
      });
      if (result) {
        trackingRef.current = result;
        usingRealRef.current = true;
        lastRealSeenRef.current = performance.now();
        setUsingReal(true);
        setCamNotice(null);
      }
    }
  }, [phase, sizeCanvas, startLoop]);

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => sizeCanvas());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [sizeCanvas]);

  // ── Full teardown ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      trackingRef.current?.destroy();
      trackingRef.current = null;
      fieldRef.current?.destroy();
      fieldRef.current = null;
      audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden select-none touch-none"
      style={{ height: "calc(100vh - 3rem)", background: "#02020a" }}
    >
      {/* Hidden analysis-only video — never shown, never recorded/sent */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        aria-hidden="true"
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
        aria-label="A deep night sky full of glowing stars. Reach up with your hands to scoop and spill them."
      />

      {/* Tap-to-start overlay */}
      {phase === "tap" && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center"
          style={{ background: "radial-gradient(ellipse at 50% 35%, #0a1030cc 0%, #02020aee 75%)" }}
        >
          <div className="mb-6 text-7xl leading-none" aria-hidden="true">✨🤲</div>
          <h1 className="mb-3 text-3xl font-bold text-white drop-shadow-xl sm:text-4xl">
            Star Reach
          </h1>
          <p className="mb-10 max-w-md text-lg leading-relaxed text-white/80">
            Reach up into the night sky with your hands. Close a hand to
            <span className="text-white/95"> scoop a handful of stars</span> that
            chime — open wide to
            <span className="text-white/95"> spill them back</span> in a sparkle.
          </p>
          <button
            onClick={() => { void handleStart(); }}
            className="min-h-[72px] min-w-[64px] rounded-3xl border-2 border-sky-300/70 bg-sky-600/40 px-10 py-5 text-2xl font-bold text-white shadow-2xl transition-all hover:bg-sky-500/55 active:scale-95"
            aria-label="Touch to begin Star Reach"
          >
            🌙 Touch to Begin
          </button>
          <p className="mt-6 max-w-sm text-base text-white/75">
            The camera watches your hands only — nothing is recorded or sent.
          </p>
          <Link
            href="/dream"
            className="mt-8 text-base text-white/75 transition-colors hover:text-white"
          >
            ← dream lab
          </Link>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-4 flex justify-center px-4">
            <p className="text-lg text-white/85 drop-shadow sm:text-xl">
              {usingReal
                ? "Close a hand to scoop stars ✦  open wide to spill them"
                : "Watch the sky sing ✦  tap below to use your own hands"}
            </p>
          </div>

          {camNotice && (
            <div className="pointer-events-none absolute left-0 right-0 top-16 flex justify-center px-4">
              <p className="max-w-sm text-center text-base text-rose-300 drop-shadow">
                {camNotice}
              </p>
            </div>
          )}

          {/* Use-my-hands button if real tracking not yet active */}
          {!usingReal && (
            <div className="absolute bottom-7 left-0 right-0 flex flex-col items-center gap-3 px-4">
              <button
                onClick={() => { void handleStart(); }}
                className="min-h-[68px] min-w-[64px] rounded-2xl border-2 border-indigo-300/60 bg-indigo-600/40 px-8 py-4 text-xl font-bold text-white shadow-xl transition-all hover:bg-indigo-500/55 active:scale-95"
                aria-label="Turn on the camera to use your real hands"
              >
                🤲 Use My Hands
              </button>
              <p className="text-base text-white/75">
                Ghost hands are scooping stars — tap to reach in yourself
              </p>
            </div>
          )}

          {/* top-left nav + design notes + render badge */}
          <div className="absolute left-4 top-3 z-10 flex items-center gap-4">
            <Link
              href="/dream"
              className="text-base text-white/75 transition-colors hover:text-white"
            >
              ← dream
            </Link>
            <a
              href="/dream/731-kids-star-reach/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-base text-white/75 transition-colors hover:text-white"
            >
              Read the design notes ↗
            </a>
          </div>

          {renderPath && (
            <div className="pointer-events-none absolute right-4 top-3 z-10">
              <span className="font-mono text-xs uppercase tracking-wider text-white/75">
                {renderPath === "webgl2" ? "WebGL2 ◈" : "Canvas2D ◇"}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
