"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeCloth, stepCloth, type BallState } from "./cloth";
import { makeRenderer, type Renderer } from "./renderer";
import { makeAudioEngine, type AudioEngine } from "./audio";

// Normalization constants shared between physics and audio mapping.
const DENT_FULL = 0.9; // dent depth that counts as "full" pitch bend
const RIPPLE_FULL = 0.06; // ripple energy that counts as "loud"
const AUTO_DEMO_DELAY = 2.0; // seconds of no input -> auto demo

type Tilt = { gx: number; gz: number };

interface DeviceOrientationConstructor {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export default function MoonTrampolinePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const [sensorOn, setSensorOn] = useState(false);

  // Mutable refs for the animation loop (avoid re-renders).
  const tiltRef = useRef<Tilt>({ gx: 0, gz: 0 });
  const lastInputRef = useRef<number>(0);
  const pointerTiltRef = useRef<Tilt>({ gx: 0, gz: 0 });
  const keyTiltRef = useRef<Tilt>({ gx: 0, gz: 0 });
  const sensorTiltRef = useRef<Tilt>({ gx: 0, gz: 0 });
  const engineRef = useRef<AudioEngine | null>(null);

  // --- Device orientation handler ---
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const gamma = e.gamma ?? 0; // left/right [-90,90]
    const beta = e.beta ?? 0; // front/back [-180,180]
    // Map to a gentle gravity vector (kids-scaled, clamped).
    const gx = Math.max(-1, Math.min(1, gamma / 35)) * 3.2;
    const gz = Math.max(-1, Math.min(1, (beta - 45) / 35)) * 3.2;
    sensorTiltRef.current = { gx, gz };
    lastInputRef.current = performance.now();
    setSensorOn(true);
  }, []);

  // --- Start: must run synchronously inside the tap for iOS perms ---
  const handleStart = useCallback(async () => {
    setStarted(true);
    // Audio
    if (!engineRef.current) {
      engineRef.current = makeAudioEngine();
    }
    if (engineRef.current) {
      await engineRef.current.resume();
    } else {
      setNotice("Audio is not available on this browser, but you can still play.");
    }

    // Device orientation permission (iOS 13+) — must be in the tap.
    const DOE = (
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as unknown as DeviceOrientationConstructor)
        : undefined
    );
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
        } else {
          setNotice("Tilt is off — drag with your finger or use arrow keys. It also plays by itself!");
        }
      } catch {
        setNotice("Tilt is off — drag with your finger or use arrow keys. It also plays by itself!");
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrient);
    } else {
      setNotice("No tilt sensor — drag with your finger or use arrow keys. It also plays by itself!");
    }
  }, [onOrient]);

  // --- Main effect: physics + render + input loop (after start) ---
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: Renderer | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      premultipliedAlpha: false,
    });
    if (gl) {
      try {
        renderer = makeRenderer(gl);
      } catch {
        renderer = null;
      }
    }
    if (!renderer) {
      ctx2d = canvas.getContext("2d");
      if (ctx2d) {
        setNotice("3D graphics aren't available — showing a simple view. Sound still works!");
      }
    }

    const cloth = makeCloth();
    const ball: BallState = {
      x: 0,
      z: 0,
      y: 0,
      radius: 0.7,
      vx: 0.6,
      vz: 0.4,
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      if (renderer) renderer.resize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    lastInputRef.current = performance.now();
    let raf = 0;
    let prev = performance.now();
    let elapsed = 0;
    let lastSpeed = 0;
    let settleTimer = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      let dt = (now - prev) / 1000;
      prev = now;
      if (dt > 0.05) dt = 0.05; // clamp big gaps
      elapsed += dt;

      // --- Resolve tilt source (sensor > pointer > keys > auto-demo) ---
      const sinceInput = (now - lastInputRef.current) / 1000;
      let tilt: Tilt;
      if (sensorOn) {
        tilt = sensorTiltRef.current;
      } else if (sinceInput < AUTO_DEMO_DELAY) {
        tilt = {
          gx: pointerTiltRef.current.gx + keyTiltRef.current.gx,
          gz: pointerTiltRef.current.gz + keyTiltRef.current.gz,
        };
      } else {
        // Auto-demo: drift the ball in a slow circle so it always plays.
        tilt = {
          gx: Math.cos(elapsed * 0.6) * 1.6,
          gz: Math.sin(elapsed * 0.6) * 1.6,
        };
      }
      tiltRef.current = tilt;

      // --- Physics (a couple substeps for stability) ---
      const sub = 2;
      const sdt = dt / sub;
      for (let s = 0; s < sub; s++) {
        stepCloth(cloth, ball, sdt, tilt.gx, tilt.gz);
      }

      // --- Audio mapping ---
      const engine = engineRef.current;
      if (engine) {
        const dentNorm = cloth.maxDent / DENT_FULL;
        const rippleNorm = cloth.rippleEnergy / RIPPLE_FULL;
        const speed = Math.hypot(ball.vx, ball.vz);
        const settled = speed < 0.25 && rippleNorm < 0.15;
        settleTimer = settled ? settleTimer + dt : 0;
        engine.update(dentNorm, rippleNorm, settleTimer > 0.4);
        // Bounce bloom on a sharp increase in speed (a "kick").
        if (speed - lastSpeed > 0.9) {
          engine.bloom(Math.min(1, (speed - lastSpeed) / 3));
        }
        lastSpeed = speed;
      }

      // --- Render ---
      if (renderer) {
        renderer.draw(cloth, ball, elapsed);
      } else if (ctx2d) {
        drawFallback(ctx2d, canvas.width, canvas.height, cloth, ball, elapsed);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (renderer) renderer.dispose();
    };
  }, [started, sensorOn]);

  // --- Pointer drag tilts the tray (always available) ---
  const dragging = useRef(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastInputRef.current = performance.now();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    pointerTiltRef.current = {
      gx: Math.max(-1, Math.min(1, dx / 120)) * 4,
      gz: Math.max(-1, Math.min(1, dy / 120)) * 4,
    };
    lastInputRef.current = performance.now();
  }, []);
  const onPointerUp = useCallback(() => {
    dragging.current = false;
    pointerTiltRef.current = { gx: 0, gz: 0 };
  }, []);

  // --- Keyboard fallback ---
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      const k = keyTiltRef.current;
      if (e.key === "ArrowLeft") k.gx = -4;
      else if (e.key === "ArrowRight") k.gx = 4;
      else if (e.key === "ArrowUp") k.gz = -4;
      else if (e.key === "ArrowDown") k.gz = 4;
      else if (e.key === " ") {
        k.gx = 0;
        k.gz = 0;
      } else return;
      lastInputRef.current = performance.now();
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = keyTiltRef.current;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") k.gx = 0;
      if (e.key === "ArrowUp" || e.key === "ArrowDown") k.gz = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started]);

  // --- Cleanup audio on unmount ---
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      if (typeof window !== "undefined") {
        window.removeEventListener("deviceorientation", onOrient);
      }
    };
  }, [onOrient]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#070712] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Header / nav */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4">
        <Link
          href="/dream"
          className="pointer-events-auto rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur hover:bg-accent"
        >
          ← Gallery
        </Link>
        <span className="pointer-events-none select-none rounded-full bg-violet-500/20 px-4 py-2 text-base text-violet-300">
          Moon Trampoline 🌙
        </span>
      </div>

      {/* Notice */}
      {notice && started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center px-4">
          <p className="max-w-md rounded-2xl bg-black/40 px-4 py-3 text-center text-base text-violet-300 backdrop-blur">
            {notice}
          </p>
        </div>
      )}

      {/* Play hint (always visible once started, no reading required to play) */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
          <p className="rounded-full bg-muted px-5 py-3 text-center text-base text-muted-foreground backdrop-blur">
            Tilt or drag to roll the moon 🌙 — it sings the trampoline awake
          </p>
        </div>
      )}

      {/* Design notes affordance */}
      {started && (
        <div className="absolute bottom-4 right-4 z-10">
          <Link
            href="/dream/995-kids-moon-trampoline/README.md"
            className="rounded-full bg-muted px-3 py-2 text-base text-muted-foreground hover:text-foreground"
            onClick={(e) => e.preventDefault()}
            title="CPU-Verlet Provot cloth + membrane-mode synthesis"
          >
            notes
          </Link>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a1f] to-[#05050f] px-6 text-center">
          <div className="mb-6 text-7xl" aria-hidden>
            🌙
          </div>
          <h1 className="mb-3 text-3xl font-semibold text-foreground sm:text-4xl">
            Moon Trampoline
          </h1>
          <p className="mb-8 max-w-md text-lg text-foreground">
            Tilt your tablet like a tray and roll the glowing moon across a
            springy trampoline of stars. The bouncy cloth rings like a soft
            drum.
          </p>
          <button
            onClick={handleStart}
            className="rounded-full bg-violet-500 px-10 py-5 text-2xl font-semibold text-foreground shadow-lg shadow-violet-900/50 transition hover:bg-violet-400 active:scale-95"
            style={{ minHeight: 72, minWidth: 200 }}
          >
            Start 🌟
          </button>
          <p className="mt-6 max-w-sm text-base text-muted-foreground">
            Best on a phone or tablet you can tilt. It also plays all by itself.
          </p>
        </div>
      )}
    </main>
  );
}

// --- Canvas2D last-resort fallback (flat-ish top view) — not a hook ---
function drawFallback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cloth: ReturnType<typeof makeCloth>,
  ball: BallState,
  tSec: number,
): void {
  ctx.fillStyle = "#070712";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.min(w, h) / 6;
  const cx = w / 2;
  const cy = h / 2;
  const project = (x: number, z: number, y: number) => {
    // simple oblique projection so the dent reads a little
    return {
      sx: cx + x * scale,
      sy: cy + z * scale * 0.7 - y * scale * 0.9,
    };
  };
  // twinkle stars
  ctx.fillStyle = "rgba(255,240,200,0.6)";
  for (let i = 0; i < 60; i++) {
    const sx = (i * 97.3) % w;
    const sy = (i * 53.7) % h;
    const r = 1 + Math.abs(Math.sin(tSec + i));
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // cloth nodes
  const { px, py, pz } = cloth;
  ctx.strokeStyle = "rgba(120,130,255,0.5)";
  for (let k = 0; k < px.length; k++) {
    const p = project(px[k], pz[k], py[k]);
    const dent = Math.max(0, -py[k]);
    ctx.fillStyle = `rgba(255,${Math.floor(235 - dent * 80)},170,0.9)`;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, 1.5 + dent * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // ball
  const bp = project(ball.x, ball.z, -cloth.maxDent);
  const grd = ctx.createRadialGradient(
    bp.sx,
    bp.sy,
    2,
    bp.sx,
    bp.sy,
    ball.radius * scale,
  );
  grd.addColorStop(0, "rgba(255,255,240,0.95)");
  grd.addColorStop(1, "rgba(200,210,255,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(bp.sx, bp.sy, ball.radius * scale, 0, Math.PI * 2);
  ctx.fill();
}
