"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeSim, NUM_FF, type KuramotoSim } from "./kuramoto";
import { makeAudioEngine, type AudioEngine } from "./audio";
import { makeRenderer, type GLRenderer } from "./gl";

// Seconds of no tilt/drag before the auto-demo breeze takes over.
const AUTO_DEMO_IDLE_S = 3;
// How strongly the auto-demo herds fireflies toward gather points.
const AUTO_BREEZE = 0.9;
// Per-firefly flash refractory (ms) — throttles the note machine-gun.
const FLASH_REFRACTORY_MS = 220;

type Phase = "idle" | "playing";

// Stable per-firefly pitch seed (0..1) — assigned once, drives note + hue.
function makeSeeds(n: number): Float32Array {
  const s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.random();
  return s;
}

export default function KidsFireflyChorus() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noWebGL, setNoWebGL] = useState(false);
  const [tiltDenied, setTiltDenied] = useState(false);
  const [usingPointer, setUsingPointer] = useState(false);
  const [orderPct, setOrderPct] = useState(0);

  // Long-lived refs.
  const phaseRef = useRef<Phase>("idle");
  const rafRef = useRef(0);
  const simRef = useRef<KuramotoSim | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<GLRenderer | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // Input state: a smoothed gravity/breeze vector in world units.
  const gravRef = useRef({ x: 0, y: 0 });
  const targetGravRef = useRef({ x: 0, y: 0 });
  const lastInputRef = useRef(0);
  const pointerActiveRef = useRef(false);
  const seedsRef = useRef<Float32Array | null>(null);
  const hueRef = useRef<Float32Array | null>(null);
  const lastFlashMsRef = useRef<Float32Array | null>(null);
  const startMsRef = useRef(0);
  // The canvas that pointer listeners were attached to (for clean removal).
  const boundCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Device tilt → gravity vector ──
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    // gamma: left/right [-90,90]; beta: front/back [-180,180].
    const gx = Math.max(-1, Math.min(1, e.gamma / 35));
    const gy = Math.max(-1, Math.min(1, (e.beta - 35) / 35)); // tilt-forward neutral
    targetGravRef.current = { x: gx * 0.35, y: gy * 0.35 };
    lastInputRef.current = performance.now();
    pointerActiveRef.current = false;
  }, []);

  // ── Pointer drag "breeze" fallback ──
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (phaseRef.current !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // direction from centre → drag point becomes the breeze direction.
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    targetGravRef.current = { x: nx * 0.7, y: ny * 0.7 };
    lastInputRef.current = performance.now();
    pointerActiveRef.current = true;
    setUsingPointer(true);
  }, []);

  const handlePointerUp = useCallback(() => {
    pointerActiveRef.current = false;
    targetGravRef.current = { x: 0, y: 0 };
  }, []);

  const start = useCallback(async () => {
    if (phaseRef.current === "playing") return;
    phaseRef.current = "playing";
    setPhase("playing");

    // 1. Audio context inside the gesture (iOS autoplay-safe).
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume().catch(() => {});
    const engine = makeAudioEngine(ctx);
    audioRef.current = engine;
    engine.resume();

    // 2. Simulation + per-firefly seeds.
    const sim = makeSim();
    simRef.current = sim;
    seedsRef.current = makeSeeds(NUM_FF);
    hueRef.current = new Float32Array(NUM_FF);
    lastFlashMsRef.current = new Float32Array(NUM_FF);
    startMsRef.current = performance.now();
    lastInputRef.current = performance.now();

    // 3. WebGL2 renderer.
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: true,
    }) as WebGL2RenderingContext | null;
    if (gl) {
      glRef.current = gl;
      try {
        rendererRef.current = makeRenderer(gl, NUM_FF);
      } catch {
        setNoWebGL(true);
      }
    } else {
      setNoWebGL(true);
    }

    // 4. Device orientation permission (iOS 13+ needs a gesture).
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", handleOrientation);
        } else {
          setTiltDenied(true);
        }
      } catch {
        setTiltDenied(true);
      }
    } else if ("DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", handleOrientation);
    } else {
      setTiltDenied(true);
    }

    // 5. Pointer fallback listeners (always available).
    if (canvas) {
      boundCanvasRef.current = canvas;
      canvas.addEventListener("pointerdown", handlePointerMove);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointercancel", handlePointerUp);
    }
  }, [handleOrientation, handlePointerMove, handlePointerUp]);

  // ── Render / sim loop ──
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Scratch for instance hue upload.
    let last = performance.now();
    let orderUiAccum = 0;
    // auto-demo drifting gather point.
    let autoT = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      const sim = simRef.current;
      const renderer = rendererRef.current;
      const audio = audioRef.current;
      const seeds = seedsRef.current;
      const hue = hueRef.current;
      const lastFlash = lastFlashMsRef.current;
      if (!sim || !seeds || !hue || !lastFlash) return;

      // ── Input → gravity, with auto-demo when idle ──
      const idle = now - lastInputRef.current;
      if (idle > AUTO_DEMO_IDLE_S * 1000) {
        // Slow synthetic breeze: a gather point that wanders, herding flies in.
        autoT += dt;
        const cxg = 0.5 + 0.25 * Math.sin(autoT * 0.18);
        const cyg = 0.5 + 0.25 * Math.cos(autoT * 0.13);
        // Pull every-fly toward the gather point via a soft global vector that
        // points from the meadow centre-of-mass toward the gather point.
        let mx = 0;
        let my = 0;
        for (let i = 0; i < sim.n; i++) {
          mx += sim.x[i];
          my += sim.y[i];
        }
        mx /= sim.n;
        my /= sim.n;
        targetGravRef.current = {
          x: (cxg - mx) * AUTO_BREEZE,
          y: (cyg - my) * AUTO_BREEZE,
        };
      }

      // Smooth gravity toward target (floaty, no jerks).
      const g = gravRef.current;
      const tg = targetGravRef.current;
      g.x += (tg.x - g.x) * Math.min(1, dt * 4);
      g.y += (tg.y - g.y) * Math.min(1, dt * 4);

      // ── Step Kuramoto sim ──
      const flashes = sim.step(dt, g.x, g.y);

      // ── Sound flashes (throttled, voice-pooled, on-screen) ──
      if (audio) {
        for (let f = 0; f < flashes.length; f++) {
          const ev = flashes[f];
          const i = ev.index;
          if (now - lastFlash[i] < FLASH_REFRACTORY_MS) continue;
          // probabilistic gate to thin dense bursts (synced clusters favoured)
          const p = 0.25 + 0.6 * ev.localR;
          if (Math.random() > p) continue;
          lastFlash[i] = now;
          const pan = (ev.x - 0.5) * 1.6;
          audio.flash(seeds[i], ev.localR, pan, 0.8);
        }
        audio.tick((now - startMsRef.current) / 1000);
      }

      // ── Cluster → hue: derive a stable hue from cluster id; lone flies keep
      //    their own seed hue. Synced flies warm up via localR in-shader. ──
      for (let i = 0; i < sim.n; i++) {
        const c = sim.cluster[i];
        if (c < 0) {
          hue[i] = seeds[i] * 0.5; // solitary: cool green-ish band
        } else {
          // hash the cluster id into a stable hue so a cluster shares colour.
          const h = ((c * 2654435761) >>> 0) / 4294967295;
          hue[i] = 0.3 + h * 0.7;
        }
      }

      // ── Draw ──
      if (renderer && !noWebGL) {
        // pack positions into an interleaved xy array.
        renderer.draw(
          sim.n,
          packXY(sim.x, sim.y),
          sim.bright,
          sim.localR,
          hue,
          sim.orderR,
          canvas.width,
          canvas.height,
          (now - startMsRef.current) / 1000
        );
      }

      // ── Togetherness meter (throttled UI update ~5/s) ──
      orderUiAccum += dt;
      if (orderUiAccum > 0.2) {
        orderUiAccum = 0;
        setOrderPct(Math.round(sim.orderR * 100));
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
    // noWebGL is read inside; including it is correct.
  }, [phase, noWebGL]);

  // ── Cleanup on unmount: listeners, audio, GL ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", handleOrientation);
      const canvas = boundCanvasRef.current;
      if (canvas) {
        canvas.removeEventListener("pointerdown", handlePointerMove);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointercancel", handlePointerUp);
      }
      rendererRef.current?.dispose();
      const gl = glRef.current;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      audioRef.current?.dispose();
    };
  }, [handleOrientation, handlePointerMove, handlePointerUp]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05050f] text-foreground">
      {/* Play canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: phase === "playing" ? "block" : "none" }}
      />

      {/* Back control — outside the play canvas */}
      {phase === "playing" && (
        <Link
          href="/dream"
          className="absolute left-3 top-3 z-30 min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 text-base text-foreground backdrop-blur-md hover:text-foreground"
        >
          ← back
        </Link>
      )}

      {/* Togetherness meter — gentle, legible synchrony cue */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute right-3 top-3 z-30 rounded-2xl border border-border bg-black/40 px-4 py-2.5 backdrop-blur-md">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            together
          </div>
          <div className="mt-1 h-2 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-violet-300/80 transition-[width] duration-200"
              style={{ width: `${orderPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Denied-tilt notice (rose) + pointer hint */}
      {phase === "playing" && tiltDenied && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-violet-400/30 bg-black/55 px-4 py-2.5 text-center backdrop-blur-md">
          <p className="text-base text-violet-300">
            Tilt is off — drag a finger to make a breeze.
          </p>
        </div>
      )}
      {phase === "playing" && !tiltDenied && usingPointer && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-2xl border border-border bg-black/45 px-4 py-2.5 text-center backdrop-blur-md">
          <p className="text-base text-foreground">Drag to drift the fireflies together.</p>
        </div>
      )}

      {/* WebGL2 missing notice (rose) */}
      {phase === "playing" && noWebGL && (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 z-30 -translate-y-1/2 rounded-2xl border border-violet-400/30 bg-black/70 p-5 text-center backdrop-blur-md">
          <p className="text-base text-violet-300">
            This device can&apos;t show the meadow (no WebGL2) — but you can still
            hear the fireflies sing.
          </p>
        </div>
      )}

      {/* Start screen */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-b from-[#070718] to-[#0c0c22] px-6 text-center">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Firefly Chorus
          </h1>
          <p className="mt-3 max-w-md text-base text-foreground">
            A meadow of sleepy fireflies. Tilt the world — or drag a finger — to
            float them together. When they meet, they blink and sing as one.
          </p>
          <button
            onClick={start}
            className="mt-8 min-h-[44px] rounded-full bg-violet-500/20 px-8 py-4 text-xl font-medium text-violet-200 ring-1 ring-violet-300/40 transition-colors hover:bg-violet-500/30 active:scale-95"
            style={{ minWidth: 64 }}
          >
            ✦ start
          </button>
          <p className="mt-6 max-w-sm text-xs text-muted-foreground">
            Sound stays soft and gentle. Tilt needs your OK on some phones.
          </p>
        </div>
      )}
    </main>
  );
}

// Interleave x,y into a reusable scratch buffer (avoids per-frame alloc churn).
let _xyScratch: Float32Array | null = null;
function packXY(x: Float32Array, y: Float32Array): Float32Array {
  const n = x.length;
  if (!_xyScratch || _xyScratch.length < n * 2) {
    _xyScratch = new Float32Array(n * 2);
  }
  const out = _xyScratch;
  for (let i = 0; i < n; i++) {
    out[i * 2] = x[i];
    out[i * 2 + 1] = y[i];
  }
  return out;
}
