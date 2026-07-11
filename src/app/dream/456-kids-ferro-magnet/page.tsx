"use client";

/**
 * 456-kids-ferro-magnet — Rosensweig ferrofluid singing toy
 *
 * Tilt the device (or drag on desktop) to move the glowing magnet
 * beneath a pool of simulated ferrofluid. The fluid rises into spikes
 * (Rosensweig normal-field instability) and chimes when the spikes
 * brush the rim-bells.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  initPhysics,
  stepPhysics,
  detectBellTouches,
  createRenderer,
  type PhysicsState,
  type Renderer,
} from "./ferro";
import { bootAudio, type AudioEngine } from "./audio";

// ── Auto-demo figure-8 path ──────────────────────────────────────────────────
function demoMagnetPos(t: number): { x: number; y: number } {
  // Lissajous figure-8, centred on [0.5, 0.5], stays within ~[0.2..0.8]
  return {
    x: 0.5 + Math.sin(t * 0.42) * 0.24,
    y: 0.5 + Math.sin(t * 0.84) * 0.18,
  };
}

// ── Tilt → normalised XY ─────────────────────────────────────────────────────
function tiltToXY(beta: number, gamma: number): { x: number; y: number } {
  // gamma: left/right tilt [-90, 90] → x
  // beta:  forward/back  [-180,180] → y
  const x = 0.5 + Math.max(-1, Math.min(1, gamma / 45)) * 0.3;
  const y = 0.5 + Math.max(-1, Math.min(1, beta / 45)) * 0.3;
  return { x, y };
}

type Phase = "idle" | "playing";

export default function KidsFerroMagnet() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const physicsRef = useRef<PhysicsState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const lastTouchedRef = useRef<boolean[]>([false, false, false, false, false]);

  // Input tracking
  const hasTiltRef = useRef(false);
  const magnetSmoothRef = useRef({ x: 0.5, y: 0.5 });
  const rawTiltRef = useRef({ x: 0.5, y: 0.5 });
  const pointerActiveRef = useRef(false);
  const pointerPosRef = useRef({ x: 0.5, y: 0.5 });
  const idleTimerRef = useRef<number>(0);
  const autoDemoRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [hasTilt, setHasTilt] = useState(false);
  const [iosNeedsPermission, setIosNeedsPermission] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);

  // ── Detect iOS DeviceOrientation permission requirement ──────────────────
  useEffect(() => {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      setIosNeedsPermission(true);
    }
  }, []);

  // ── Main loop ────────────────────────────────────────────────────────────
  const runLoop = useCallback((ts: number) => {
    const renderer = rendererRef.current;
    const physics = physicsRef.current;
    if (!renderer || !physics) return;

    const dt = Math.min((ts - lastTsRef.current) / 1000, 0.05);
    lastTsRef.current = ts;

    // ── Decide magnet target ──────────────────────────────────────────────
    const elapsedSec = ts / 1000;
    let targetX: number;
    let targetY: number;

    if (pointerActiveRef.current) {
      idleTimerRef.current = ts;
      autoDemoRef.current = false;
      targetX = pointerPosRef.current.x;
      targetY = pointerPosRef.current.y;
    } else if (hasTiltRef.current) {
      idleTimerRef.current = ts;
      autoDemoRef.current = false;
      targetX = rawTiltRef.current.x;
      targetY = rawTiltRef.current.y;
    } else {
      // Auto-demo after 2s idle
      if (!autoDemoRef.current && ts - idleTimerRef.current > 2000) {
        autoDemoRef.current = true;
      }
      if (autoDemoRef.current) {
        const pos = demoMagnetPos(elapsedSec);
        targetX = pos.x;
        targetY = pos.y;
      } else {
        targetX = magnetSmoothRef.current.x;
        targetY = magnetSmoothRef.current.y;
      }
    }

    // Smooth magnet position
    const sm = magnetSmoothRef.current;
    const SMOOTH = 0.14;
    sm.x += (targetX - sm.x) * SMOOTH;
    sm.y += (targetY - sm.y) * SMOOTH;

    physics.magnetX = sm.x;
    physics.magnetY = sm.y;

    // Field strength = inverse of distance from pool centre
    const cx = sm.x - 0.5;
    const cy = sm.y - 0.5;
    const dist = Math.sqrt(cx * cx + cy * cy);
    physics.strength = Math.max(0.15, 1.0 - dist * 2.2);

    // Step physics
    stepPhysics(physics, dt);

    // Bell collision detection
    const audio = audioRef.current;
    if (audio) {
      const ringing = detectBellTouches(physics, lastTouchedRef.current);
      for (const bellIdx of ringing) {
        audio.ringBell(bellIdx);
      }
    }

    // Render
    renderer.draw(physics, elapsedSec);

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  // ── Start ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    // AudioContext must be created inside user gesture (iOS safe)
    if (!audioRef.current) {
      audioRef.current = bootAudio();
    }

    // iOS permission request
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (DeviceOrientationEvent as any).requestPermission();
        if (result === "granted") {
          hasTiltRef.current = true;
          setHasTilt(true);
        }
      } catch {
        // Denied or error — pointer-drag fallback
      }
    }

    setPhase("playing");
  }, []);

  // ── Setup canvas + renderer + orientation listeners ──────────────────────
  useEffect(() => {
    if (phase !== "playing") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to viewport
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // Create WebGL2 renderer
    const rendererMaybe = createRenderer(canvas);
    if (!rendererMaybe) {
      setNoWebGL(true);
      return;
    }
    const renderer: Renderer = rendererMaybe;
    rendererRef.current = renderer;
    renderer.resize(w, h);

    // Init physics
    physicsRef.current = initPhysics();
    lastTouchedRef.current = [false, false, false, false, false];

    // Resize handler
    function onResize() {
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      renderer.resize(nw, nh);
    }
    window.addEventListener("resize", onResize);

    // DeviceOrientation
    function onOrientation(e: DeviceOrientationEvent) {
      if (e.beta !== null && e.gamma !== null) {
        hasTiltRef.current = true;
        setHasTilt(true);
        const pos = tiltToXY(e.beta, e.gamma);
        rawTiltRef.current = pos;
        idleTimerRef.current = performance.now();
      }
    }
    window.addEventListener("deviceorientation", onOrientation);

    // Pointer drag fallback
    function toNormXY(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width,
        y: 1 - (clientY - rect.top) / rect.height,
      };
    }
    function onPointerDown(e: PointerEvent) {
      pointerActiveRef.current = true;
      pointerPosRef.current = toNormXY(e.clientX, e.clientY);
      idleTimerRef.current = performance.now();
    }
    function onPointerMove(e: PointerEvent) {
      if (!pointerActiveRef.current) return;
      pointerPosRef.current = toNormXY(e.clientX, e.clientY);
    }
    function onPointerUp() {
      pointerActiveRef.current = false;
      idleTimerRef.current = performance.now();
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    // Start RAF loop
    idleTimerRef.current = performance.now();
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", onOrientation);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      rendererRef.current?.teardown();
      rendererRef.current = null;
      audioRef.current?.teardown();
      audioRef.current = null;
      physicsRef.current = null;
    };
  }, [phase, runLoop]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (phase === "idle") {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-screen bg-black overflow-hidden select-none">
        {/* Ambient background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 60%, rgba(255,140,30,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Title */}
        <h1 className="text-2xl font-serif text-foreground mb-2 tracking-wide z-10">
          Ferro Magnet
        </h1>
        <p className="text-base text-muted-foreground mb-1 z-10">
          {iosNeedsPermission
            ? "Tilt to move the magnet · or drag"
            : "Tilt or drag to move the magnet"}
        </p>
        <p className="text-sm text-muted-foreground mb-10 z-10">
          Watch the dark pool reach for the light
        </p>

        {/* Start button */}
        <button
          onClick={() => void handleStart()}
          className="z-10 px-8 py-4 rounded-full text-xl font-semibold text-foreground
                     bg-gradient-to-br from-violet-500 to-violet-600
                     shadow-lg shadow-violet-900/60
                     active:scale-95 transition-transform
                     min-w-[200px]"
          style={{ minHeight: 64 }}
        >
          ✦ Start
        </button>

        {/* Drag affordance */}
        <p className="mt-6 text-sm text-muted-foreground z-10">
          No sensor? Drag the pool to play
        </p>

        {/* Design notes link */}
        <Link
          href="#notes"
          className="absolute bottom-8 right-6 text-xs text-violet-300 hover:text-violet-200 z-10"
        >
          Read the design notes ↓
        </Link>

        {/* Design notes anchor */}
        <section
          id="notes"
          className="absolute bottom-0 left-0 right-0 p-6 bg-black/80 text-muted-foreground text-xs leading-relaxed
                     border-t border-border max-h-48 overflow-y-auto"
        >
          <p className="text-foreground text-sm font-semibold mb-1">Design notes</p>
          <p>
            Ferrofluid spikes arise from the Rosensweig normal-field instability (R.E. Rosensweig,
            1969/1985): when a magnetic field exceeds a critical threshold the flat surface bifurcates
            into a hexagonal array of spikes. Approximated here with CPU spring-physics blobs,
            IQ polynomial smooth-min fusion (Inigo Quilez, iquilezles.org), and a WebGL2 fragment
            shader that adds a three-wave hexagonal ripple near the magnet. Tonal world: just-intonation
            D major hexachord (D E F# A B C#) — every combination consonant. Five rim-bells of
            different sizes map to five pitches; larger bell = lower register.
          </p>
          <p className="mt-1 text-muted-foreground/70">Ref: Andrejs Cēbers — ferrofluid pattern formation.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* WebGL canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ cursor: "none" }}
      />

      {/* No-WebGL notice */}
      {noWebGL && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-violet-300 text-base text-center px-8">
            WebGL2 is not available in this browser.
            <br />
            Try Chrome or Safari 15+.
            <br />
            <span className="text-muted-foreground text-sm">
              (Audio is still running — you can hear the drone.)
            </span>
          </p>
        </div>
      )}

      {/* Tilt / drag mode indicator */}
      {!hasTilt && !noWebGL && (
        <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-violet-300 text-sm px-3 py-1 rounded-full bg-black/40">
            Drag the pool to move the magnet
          </span>
        </div>
      )}

      {/* Corner: design notes link */}
      <Link
        href="#"
        onClick={() => setPhase("idle")}
        className="absolute bottom-6 right-5 text-xs text-violet-300 hover:text-violet-200 z-20"
      >
        Read the design notes ↑
      </Link>
    </div>
  );
}
