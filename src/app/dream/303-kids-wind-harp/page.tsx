"use client";

// 303 · Kids Wind-Harp
// ────────────────────────────────────────────────────────────────────────────
// "What if a kid could TILT their iPad and gravity would swing a row of glowing
//  strings like a wind-harp — each string that swings far enough plucks itself
//  and sings, so the child plays music by tipping the world?"
//
// INPUT      device TILT (deviceorientation beta/gamma -> gravity vector),
//            with pointer-drag + auto-sway fallbacks for desktop / no-sensor.
// OUTPUT     raw WebGL2: 7 glowing matte strings over a soft dark gradient.
// TECHNIQUE  Verlet string physics (physics.ts) driven by tilt-gravity +
//            Karplus-Strong plucked-string synthesis (harp-audio.ts) when a
//            string's swing crosses a threshold.
// VIBE       D-Dorian, ambient drone underneath, no fail state.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildHarp,
  stepHarp,
  detectPlucks,
  type HarpString,
} from "./physics";
import { createHarpAudio, SCALE_NAMES, type HarpAudio } from "./harp-audio";
import { createHarpRenderer, type HarpRenderer } from "./harp-gl";

// ── tuning constants (normalised physics space) ──────────────────────────────
const STRING_COUNT = 7;
const NODES_PER_STRING = 14;
const GRAVITY_SCALE = 0.9; // how hard tilt pulls the strings sideways
const DAMPING = 0.985;
const RELAX_ITERS = 3;
const STIFFNESS = 0.012; // restoring pull toward the resting line
const PLUCK_THRESHOLD = 0.045; // midpoint displacement that triggers a pluck
const REFRACTORY_SEC = 0.28;
const AMP_RANGE = 0.13; // swing amplitude that maps to "max" loudness
const GRAVITY_SMOOTH = 0.12; // smoothing on the incoming gravity vector
const TILT_TIMEOUT_MS = 2000; // if no tilt events, fall back automatically

type Mode = "idle" | "running";

export default function KidsWindHarpPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [sensorDenied, setSensorDenied] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  // live engine refs (don't trigger React renders)
  const audioRef = useRef<HarpAudio | null>(null);
  const rafRef = useRef<number>(0);
  const stringsRef = useRef<HarpString[]>([]);
  const glowsRef = useRef<number[]>([]);
  const rendererRef = useRef<HarpRenderer | null>(null);

  // gravity vector (normalised). Target is set by tilt/pointer/auto; the live
  // value eases toward it each frame.
  const gravTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 1 });
  const gravRef = useRef<{ x: number; y: number }>({ x: 0, y: 1 });
  const gotTiltRef = useRef(false);
  const pointerDraggingRef = useRef(false);
  const autoSwayRef = useRef(false); // self-play when nothing else drives it

  // ── device tilt -> gravity target ──────────────────────────────────────────
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta == null && e.gamma == null) return;
    gotTiltRef.current = true;
    autoSwayRef.current = false;
    // gamma: left/right tilt [-90,90]; beta: front/back [-180,180].
    const gamma = (e.gamma ?? 0) / 45; // ~-2..2, sideways
    const beta = (e.beta ?? 0) / 45; // front/back
    // Gravity points "down" in the tilted frame: gamma pushes x, and the
    // device tipping toward the child reduces the downward pull a touch.
    const gx = Math.max(-1.4, Math.min(1.4, gamma));
    const gy = Math.max(0.2, Math.min(1.4, 1 - Math.abs(beta) * 0.25 + 0.4));
    gravTargetRef.current = { x: gx, y: gy };
  }, []);

  // ── pointer drag -> gravity target (desktop fallback) ──────────────────────
  const handlePointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width; // 0..1
    const ny = (clientY - rect.top) / rect.height;
    // drag away from centre tilts the world that way
    const gx = (nx - 0.5) * 2.4;
    const gy = 0.6 + ny * 0.8;
    gravTargetRef.current = { x: gx, y: gy };
  }, []);

  // ── main start gesture: unlock audio + request sensor + run loop ───────────
  const start = useCallback(async () => {
    if (mode === "running") return;

    // 1. AudioContext inside the gesture (iOS/Safari requirement).
    let ctx: AudioContext;
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      return;
    }
    const audio = createHarpAudio(ctx);
    audio.setDroneLevel(0.7);
    audioRef.current = audio;

    // 2. Build physics.
    const strings = buildHarp({
      count: STRING_COUNT,
      nodesPerString: NODES_PER_STRING,
      topY: 0.16,
      botY: 0.9,
      marginX: 0.12,
    });
    stringsRef.current = strings;
    glowsRef.current = new Array(STRING_COUNT).fill(0);

    // 3. WebGL2 renderer.
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      try {
        rendererRef.current = createHarpRenderer(gl);
      } catch {
        rendererRef.current = null;
      }
    }
    sizeCanvas();

    // 4. Sensor permission (must be inside this gesture on iOS 13+).
    gotTiltRef.current = false;
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof DeviceOrientationEvent !== "undefined") {
      if (typeof DOE.requestPermission === "function") {
        try {
          const perm = await DOE.requestPermission();
          if (perm === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
          } else {
            setSensorDenied(true);
            enableFallback();
          }
        } catch {
          setSensorDenied(true);
          enableFallback();
        }
      } else {
        // non-iOS: just listen.
        window.addEventListener("deviceorientation", handleOrientation);
      }
    } else {
      enableFallback();
    }

    // If no tilt events arrive shortly, switch to fallback so the demo is
    // always playable (desktop, locked sensors, etc.).
    window.setTimeout(() => {
      if (!gotTiltRef.current) enableFallback();
    }, TILT_TIMEOUT_MS);

    setMode("running");

    // 5. Animation loop.
    let last = performance.now();
    let acc = 0;
    const FIXED = 1 / 120; // fixed physics step for stability
    let swayPhase = 0;

    const loop = (now: number) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;

      // auto-sway: gravity slowly orbits so the harp plays itself.
      if (autoSwayRef.current && !pointerDraggingRef.current) {
        swayPhase += dtReal * 0.6;
        gravTargetRef.current = {
          x: Math.sin(swayPhase) * 1.15,
          y: 0.85 + Math.cos(swayPhase * 0.7) * 0.25,
        };
      }

      // ease live gravity toward target
      const gt = gravTargetRef.current;
      const g = gravRef.current;
      g.x += (gt.x - g.x) * GRAVITY_SMOOTH;
      g.y += (gt.y - g.y) * GRAVITY_SMOOTH;

      // fixed-step physics
      acc += dtReal;
      let steps = 0;
      while (acc >= FIXED && steps < 8) {
        stepHarp(
          stringsRef.current,
          FIXED,
          g.x * GRAVITY_SCALE,
          g.y * GRAVITY_SCALE,
          DAMPING,
          RELAX_ITERS,
          STIFFNESS,
        );
        acc -= FIXED;
        steps++;
      }

      // plucks
      const events = detectPlucks(
        stringsRef.current,
        PLUCK_THRESHOLD,
        REFRACTORY_SEC,
      );
      const a = audioRef.current;
      for (const ev of events) {
        const amp = Math.max(
          0,
          Math.min(1, (ev.amplitude - PLUCK_THRESHOLD) / AMP_RANGE),
        );
        a?.pluck(ev.index, amp);
        glowsRef.current[ev.index] = 1; // flash glow
      }

      // decay glows
      const glows = glowsRef.current;
      for (let i = 0; i < glows.length; i++) {
        glows[i] *= 0.94;
        // baseline shimmer from current swing so even pre-pluck motion glows
        const sw = stringsRef.current[i]?.swing ?? 0;
        const base = Math.min(0.55, (sw / PLUCK_THRESHOLD) * 0.45);
        if (base > glows[i]) glows[i] = base;
      }

      // render
      const r = rendererRef.current;
      if (r) {
        const aspect = canvas.width / canvas.height || 1;
        r.render(stringsRef.current, glows, aspect, now / 1000);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [mode, handleOrientation]);

  function enableFallback() {
    if (!gotTiltRef.current) {
      autoSwayRef.current = true;
      setUsingFallback(true);
    }
  }

  // ── canvas sizing (DPR capped) ─────────────────────────────────────────────
  function sizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      rendererRef.current?.resize(w, h);
    }
  }

  useEffect(() => {
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── pointer drag fallback wiring ───────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "running") return;

    const down = (e: PointerEvent) => {
      pointerDraggingRef.current = true;
      autoSwayRef.current = false;
      if (!gotTiltRef.current) setUsingFallback(true);
      handlePointer(e.clientX, e.clientY);
    };
    const move = (e: PointerEvent) => {
      if (pointerDraggingRef.current) handlePointer(e.clientX, e.clientY);
    };
    const up = () => {
      pointerDraggingRef.current = false;
      // settle back to gentle downward gravity; resume auto-sway if no sensor
      gravTargetRef.current = { x: 0, y: 1 };
      if (!gotTiltRef.current) {
        window.setTimeout(() => {
          if (!pointerDraggingRef.current && !gotTiltRef.current)
            autoSwayRef.current = true;
        }, 1400);
      }
    };

    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, [mode, handlePointer]);

  // ── unmount cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", handleOrientation);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [handleOrientation]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#06060c] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />

      {/* idle / start overlay */}
      {mode === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#0a0916]/70 to-[#06060c]/90 px-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
              303 · wind-harp
            </span>
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Tip the world.
            </h1>
            <p className="max-w-md text-base text-foreground">
              Tilt your tablet and gravity swings the glowing strings. Swing one
              far enough and it sings.
            </p>
          </div>

          <button
            onClick={start}
            className="min-h-[64px] rounded-full bg-gradient-to-r from-violet-400 to-violet-400 px-10 text-xl font-semibold text-[#1a0e08] shadow-lg shadow-violet-500/20 transition-transform active:scale-95"
          >
            Tilt to play ▸
          </button>

          <p className="max-w-sm text-sm text-muted-foreground">
            On a computer? Drag across the strings, or just watch — the harp
            plays itself.
          </p>
        </div>
      )}

      {/* running hints */}
      {mode === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 px-6 pt-5 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
            tilt · swing · sing
          </p>
          {sensorDenied && (
            <p className="pointer-events-none max-w-md text-sm text-violet-300">
              Tilt sensor is off — drag across the strings instead, or watch it
              play itself.
            </p>
          )}
          {!sensorDenied && usingFallback && (
            <p className="max-w-md text-sm text-muted-foreground">
              No tilt sensor here — drag to swing the strings, or let it play
              itself.
            </p>
          )}
        </div>
      )}

      {/* string legend (low -> high, D-Dorian) */}
      {mode === "running" && (
        <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2">
          <div className="flex gap-3 font-mono text-xs text-muted-foreground">
            {SCALE_NAMES.map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>
        </div>
      )}

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-3 top-3 z-30 rounded-full border border-border bg-black/40 px-3 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-black/85 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-xl space-y-5 text-base leading-relaxed text-foreground">
            <h2 className="text-2xl font-semibold text-foreground">
              Wind-Harp — design notes
            </h2>
            <p>
              <span className="text-foreground">The one question:</span> what if a
              kid could tilt their iPad and gravity would swing a row of glowing
              strings like a wind-harp — each string that swings far enough
              plucks itself and sings?
            </p>
            <p>
              <span className="text-foreground">Physics.</span> Each string is a
              chain of point masses solved with{" "}
              <span className="font-mono text-violet-200">
                Verlet integration
              </span>{" "}
              plus distance constraints (a few relaxation passes per frame).
              Device tilt becomes a gravity vector that pulls the free nodes, so
              tipping the world swings the strings and lets them settle
              naturally.
            </p>
            <p>
              <span className="text-foreground">Sound.</span> When a string&apos;s
              midpoint swings past a threshold it plucks via{" "}
              <span className="font-mono text-violet-200">Karplus-Strong</span>{" "}
              synthesis (noise burst through a tuned, lowpass-fed delay line).
              Bigger swing → louder and brighter. A short refractory time keeps
              it from machine-gunning. The seven strings are tuned to a warm{" "}
              <span className="font-mono text-violet-200">D-Dorian</span> scale,
              with an ambient drone underneath and a limiter on the master so it
              never blasts. There is no way to lose.
            </p>
            <p>
              <span className="text-foreground">References.</span> The{" "}
              <span className="italic">Aeolian harp</span> — a stringed
              instrument played by moving air rather than fingers; here the
              child&apos;s tilt is the wind. Plus the Karplus &amp; Strong
              plucked-string algorithm (1983).
            </p>
            <p className="text-sm text-muted-foreground">
              Tags — INPUT: device tilt (deviceorientation) · OUTPUT: raw WebGL2
              · TECHNIQUE: Verlet rope physics + Karplus-Strong · VIBE: calm,
              modal, no fail state.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="absolute left-3 top-3 z-30 rounded-full border border-border bg-black/40 px-3 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        ← dream
      </Link>
    </main>
  );
}
