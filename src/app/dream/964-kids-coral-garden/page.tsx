"use client";

// **For**: kids (4+)
//
// Coral Garden — tilt the tablet to grow a glowing reef that SINGS the melody
// it traces. Differential growth (Anders Hoff / Inconvergent; Entagma;
// arXiv:2504.18040 "Cabbage" 2025), pure Canvas2D + Web Audio. Calm bedtime vibe.

import { useCallback, useEffect, useRef, useState } from "react";
import { CoralGarden, DEFAULT_CONFIG } from "./growth";
import { CoralAudio } from "./audio";
import { drawBackground, drawTrail, drawGarden } from "./render";

const STEP_MIN_MS = 380;
const STEP_MAX_MS = 520;
const GOODNIGHT_AFTER_MS = 12 * 60 * 1000;

type Phase = "idle" | "playing";

// Permission helper type for iOS DeviceOrientation.
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function CoralGardenPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noCanvas, setNoCanvas] = useState(false);

  // engine refs (avoid stale closures inside rAF)
  const gardenRef = useRef<CoralGarden | null>(null);
  const audioRef = useRef<CoralAudio | null>(null);
  const rafRef = useRef(0);
  const lastStepRef = useRef(0);
  const nextStepMsRef = useRef(STEP_MIN_MS);
  const startMsRef = useRef(0);
  const activeStrandRef = useRef(-1);

  // input refs
  const tiltRef = useRef({ x: 0, y: -0.4 }); // target gravity vector
  const smoothTiltRef = useRef({ x: 0, y: -0.4 });
  const hasSensorRef = useRef(false);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const seededRef = useRef(false);

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // --- the animation loop ---
  const loop = useCallback((now: number) => {
    const canvas = canvasRef.current;
    const garden = gardenRef.current;
    const audio = audioRef.current;
    if (!canvas || !garden) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNoCanvas(true);
      return; // audio keeps playing; rAF stops
    }

    const { w, h } = sizeRef.current;

    // idle auto-demo: gently oscillate gravity when no sensor + not dragging
    if (!hasSensorRef.current && !draggingRef.current) {
      const t = now * 0.00018;
      tiltRef.current = {
        x: Math.sin(t) * 0.5,
        y: -0.35 + Math.cos(t * 0.7) * 0.4,
      };
    }

    // smooth the gravity vector toward target (immediate-feeling, not jumpy)
    const s = smoothTiltRef.current;
    s.x += (tiltRef.current.x - s.x) * 0.12;
    s.y += (tiltRef.current.y - s.y) * 0.12;
    garden.gravity = { x: s.x, y: s.y };

    // differential growth steps on a calm clock
    if (now - lastStepRef.current >= nextStepMsRef.current) {
      lastStepRef.current = now;
      nextStepMsRef.current =
        STEP_MIN_MS + Math.random() * (STEP_MAX_MS - STEP_MIN_MS);

      garden.step();

      // melody: most-active growing tip -> pentatonic note by vertical position
      const tip = garden.mostActiveTip();
      if (tip && audio) {
        activeStrandRef.current = tip.strandIndex;
        const yNorm = tip.node.y / h;
        audio.playTip(yNorm);
      }
      // branch events -> brighter bell one octave up
      if (audio && garden.branchEvents > 0) {
        const t2 = garden.mostActiveTip();
        const yNorm = t2 ? t2.node.y / h : 0.5;
        audio.playBranch(yNorm);
      }

      // goodnight fade after ~12 minutes
      if (audio && !audio.isGoodnight() && now - startMsRef.current > GOODNIGHT_AFTER_MS) {
        audio.startGoodnight();
      }
    }

    // render — multiple sim steps may pass between draws, but we draw every frame
    if (!seededRef.current) {
      drawBackground(ctx, w, h, now);
    } else {
      drawTrail(ctx, w, h);
      // periodically repaint the deep background faintly to avoid pure-black wells
      drawBackground(ctx, w, h, now);
      drawTrail(ctx, w, h);
    }
    drawGarden(ctx, garden, now, activeStrandRef.current);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta === null && e.gamma === null) return;
    hasSensorRef.current = true;
    // gamma: left-right [-90,90]; beta: front-back [-180,180]
    const gx = (e.gamma ?? 0) / 45; // -> ~[-2,2]
    const gy = (e.beta ?? 0) / 60 - 0.4; // tilt forward to pull down
    tiltRef.current = {
      x: Math.max(-1.2, Math.min(1.2, gx)),
      y: Math.max(-1.2, Math.min(1.2, gy)),
    };
  }, []);

  // pointer drag tips gravity; tap empty space plants a seed
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    const garden = gardenRef.current;
    const audio = audioRef.current;
    if (!canvas || !garden) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * sizeRef.current.w;
    const y = ((e.clientY - rect.top) / rect.height) * sizeRef.current.h;
    draggingRef.current = true;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };

    // plant a new seed at the tap (secondary garnish) + chime
    if (garden.nodeCount < garden.config.maxNodes * 0.85) {
      garden.seed(x, y, Math.random() * Math.PI * 2, Math.random() * 360);
      if (audio) audio.playChime(y / sizeRef.current.h);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !lastPointerRef.current) return;
    if (hasSensorRef.current) return; // sensor wins
    const dx = (e.clientX - lastPointerRef.current.x) / 120;
    const dy = (e.clientY - lastPointerRef.current.y) / 120;
    tiltRef.current = {
      x: Math.max(-1.2, Math.min(1.2, dx)),
      y: Math.max(-1.2, Math.min(1.2, dy - 0.3)),
    };
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    lastPointerRef.current = null;
  }, []);

  // size the canvas to its container
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sizeRef.current = { w, h, dpr };
    if (gardenRef.current) {
      gardenRef.current.width = w;
      gardenRef.current.height = h;
    }
  }, []);

  const start = useCallback(async () => {
    // gesture-gate: boot audio + request iOS sensor permission inside the tap
    try {
      audioRef.current = new CoralAudio();
      audioRef.current.resume();
    } catch {
      // audio unavailable — visuals still run
    }

    const DOE = (typeof DeviceOrientationEvent !== "undefined"
      ? (DeviceOrientationEvent as OrientationCtor)
      : null);
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", handleOrientation);
        }
      } catch {
        // denied / unsupported — fall back to pointer + auto-demo
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", handleOrientation);
    }

    setPhase("playing");

    // build the garden after layout settles
    window.requestAnimationFrame(() => {
      resize();
      const { w, h } = sizeRef.current;
      const garden = new CoralGarden(w, h, DEFAULT_CONFIG);
      // 2 calm seed strands near the lower-middle, growing upward
      garden.seed(w * 0.4, h * 0.7, -Math.PI / 2 + 0.2, 200);
      garden.seed(w * 0.6, h * 0.72, -Math.PI / 2 - 0.2, 330);
      gardenRef.current = garden;
      seededRef.current = true;
      startMsRef.current = performance.now();
      lastStepRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    });
  }, [handleOrientation, loop, resize]);

  // resize listener while playing
  useEffect(() => {
    if (phase !== "playing") return;
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase, resize]);

  // full teardown
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", handleOrientation);
      if (audioRef.current) {
        audioRef.current.close();
        audioRef.current = null;
      }
    };
  }, [handleOrientation]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0a2e] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {noCanvas && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center">
          <p className="text-violet-300 text-xl">
            The drawing canvas is not available here, but the coral is still
            singing. Listen with the lights low.
          </p>
        </div>
      )}

      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#0a0a2e] via-[#1a0f3a] to-[#04222e] p-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="text-6xl" aria-hidden>
              🪸
            </span>
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Coral Garden
            </h1>
            <p className="max-w-sm text-base text-foreground">
              Tilt the tablet to grow a glowing reef. The coral sings the song it
              draws.
            </p>
          </div>
          <button
            onClick={() => void start()}
            className="flex h-[88px] min-w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-300 px-10 py-4 text-2xl font-semibold text-[#1a0f3a] shadow-[0_0_40px_rgba(244,114,182,0.6)] active:scale-95"
          >
            Start
          </button>
          <p className="text-muted-foreground text-xs">
            Best with sound on. Calm and quiet, made for bedtime.
          </p>
        </div>
      )}

      {phase === "playing" && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center p-4">
          <p className="text-muted-foreground text-xs">
            Tilt to grow · tap the water to plant · the reef is singing
          </p>
        </div>
      )}
    </main>
  );
}
