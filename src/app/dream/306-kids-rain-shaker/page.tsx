"use client";

// 306 · Kids Rain-Shaker
// ────────────────────────────────────────────────────────────────────────────
// "What if a kid could SHAKE the phone like a rainstick or a maraca, and the
//  harder they shake the warmer the shower of rain and bells that falls?"
//
// INPUT      device MOTION via the `devicemotion` event
//            (accelerationIncludingGravity) — shake ENERGY, not tilt.
//            Fallbacks: fast pointer/mouse movement = shake; and a gentle
//            auto-demo that rains by itself (same energy→rain→bell pipeline).
// OUTPUT     raw WebGL2 (rain-gl.ts): warm falling bead/rain particles whose
//            count & speed track shake energy, over a dark→dawn gradient, with
//            a warm glow bloom per bell strike. Thin Canvas-free HUD via React.
// TECHNIQUE  accelerometer shake-energy detection (shake.ts): gravity high-pass
//            → magnitude → smoothed envelope → threshold "hit" events with a
//            refractory window. Envelope drives bead density; hits strike bells.
// AUDIO      rain-audio.ts: always-on D-Dorian pad, a rainstick bead trickle
//            whose density tracks energy, FM bell chimes on each hit, all
//            through a DynamicsCompressor limiter so it can never blast.
// VIBE       warm, playful, rainy-day. No fail, no timer, no score.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createShakeDetector, type ShakeDetector } from "./shake";
import { createRainAudio, SCALE_NAMES, type RainAudio } from "./rain-audio";
import { createRainRenderer, type RainRenderer } from "./rain-gl";

const MOTION_TIMEOUT_MS = 2000; // no devicemotion events → fall back

type Mode = "idle" | "running";

export default function KidsRainShakerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [sensorDenied, setSensorDenied] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);

  // live engine refs (kept out of React state — mutated in the loops)
  const audioRef = useRef<RainAudio | null>(null);
  const rendererRef = useRef<RainRenderer | null>(null);
  const shakeRef = useRef<ShakeDetector | null>(null);
  const rafRef = useRef<number>(0);

  const gotMotionRef = useRef(false);
  const autoDemoRef = useRef(false);

  // stable indirection so every input path (motion / pointer / auto-demo) can
  // fire bell strikes without re-binding event handlers when callbacks change.
  const strikeRef = useRef<(strength: number) => void>(() => {});

  // pointer-shake fallback bookkeeping (synthesises an acceleration vector
  // from fast pointer movement so it feeds the IDENTICAL detector pipeline)
  const lastPtrRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // ── device motion → shake detector ─────────────────────────────────────────
  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || (a.x == null && a.y == null && a.z == null)) return;
    gotMotionRef.current = true;
    autoDemoRef.current = false;
    setUsingFallback(false);
    const det = shakeRef.current;
    if (!det) return;
    const hit = det.pushSample(a.x ?? 0, a.y ?? 0, a.z ?? 0, performance.now());
    if (hit) strikeRef.current(hit.strength);
  }, []);

  // ── main start gesture: unlock audio + request sensor + run loop ───────────
  const start = useCallback(async () => {
    if (mode === "running") return;

    // 1. AudioContext INSIDE the gesture (iOS/Safari requirement).
    let ctx: AudioContext;
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      return;
    }
    audioRef.current = createRainAudio(ctx);

    // 2. Shake detector.
    shakeRef.current = createShakeDetector();

    // 3. WebGL2 renderer (graceful: notice + audio still runs if unavailable).
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      try {
        rendererRef.current = createRainRenderer(gl);
      } catch {
        rendererRef.current = null;
        setNoWebgl(true);
      }
    } else {
      setNoWebgl(true);
    }
    sizeCanvas();

    // 4. Motion permission (must be inside this gesture on iOS 13+).
    gotMotionRef.current = false;
    const DME = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof DeviceMotionEvent !== "undefined") {
      if (typeof DME.requestPermission === "function") {
        try {
          const perm = await DME.requestPermission();
          if (perm === "granted") {
            window.addEventListener("devicemotion", handleMotion);
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
        window.addEventListener("devicemotion", handleMotion);
      }
    } else {
      enableFallback();
    }

    // If no motion events arrive shortly, auto-demo so it always plays.
    window.setTimeout(() => {
      if (!gotMotionRef.current) enableFallback();
    }, MOTION_TIMEOUT_MS);

    setMode("running");

    // 5. Loop: drive audio + visuals from the shake-energy envelope.
    let last = performance.now();
    let demoPhase = 0;

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const det = shakeRef.current;

      // auto-demo: synthesise gentle, breathing shake samples so the SAME
      // detector pipeline produces rain + occasional bells with no sensor.
      if (autoDemoRef.current && det) {
        demoPhase += dt;
        // slow swell of "shake" with periodic stronger gusts
        const base = 5 + 4 * Math.sin(demoPhase * 0.8);
        const gust = 9 * Math.max(0, Math.sin(demoPhase * 0.37));
        const jitter = (Math.random() - 0.5) * 3;
        // feed as an acceleration deviation on x (gravity high-pass removes DC)
        const mag = base + gust + jitter;
        // 9.81 ≈ resting gravity on z (removed by the high-pass)
        const hit = det.pushSample(mag, 0.4 * mag, 9.81, now);
        if (hit) strikeRef.current(hit.strength);
      }

      const energy = det ? det.energy() : 0;

      // audio: bead density from envelope; bells already struck via hit events
      const audio = audioRef.current;
      if (audio) {
        audio.setEnergy(energy);
        audio.tick(dt);
      }

      // visuals
      const r = rendererRef.current;
      if (r) {
        r.step(dt, energy);
        r.render(now / 1000, energy);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [mode, handleMotion]);

  function enableFallback() {
    if (!gotMotionRef.current) {
      autoDemoRef.current = true;
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

  // ── pointer-shake fallback: fast pointer movement → synthetic acceleration ──
  useEffect(() => {
    if (mode !== "running") return;
    const move = (e: PointerEvent) => {
      const det = shakeRef.current;
      if (!det) return;
      const now = performance.now();
      const prev = lastPtrRef.current;
      lastPtrRef.current = { x: e.clientX, y: e.clientY, t: now };
      if (!prev) return;
      const dt = Math.max(1, now - prev.t) / 1000;
      // velocity in px/s → pseudo-acceleration; fast flicks = big shakes
      const vx = (e.clientX - prev.x) / dt;
      const vy = (e.clientY - prev.y) / dt;
      const speed = Math.hypot(vx, vy); // px/s
      if (speed > 220) {
        // a moving pointer means a human is here: stop the auto-demo
        autoDemoRef.current = false;
        if (!gotMotionRef.current) setUsingFallback(true);
        // map px/s into m/s²-ish magnitude the detector expects, on top of g
        const m = Math.min(40, speed / 90);
        const hit = det.pushSample(m, m * 0.6, 9.81, now);
        if (hit) strikeRef.current(hit.strength);
      }
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [mode]);

  // ── strike a bell + bloom a glow (shared by all input paths) ────────────────
  function handleHit(strength: number) {
    audioRef.current?.strike(strength);
    // bloom a warm glow somewhere in the upper-middle of the shower
    const r = rendererRef.current;
    if (r) {
      const x = 0.2 + Math.random() * 0.6;
      const y = 0.18 + Math.random() * 0.35;
      r.flash(x, y, strength);
    }
  }

  // keep the strike indirection pointing at the latest handleHit so the
  // long-lived event handlers don't capture a stale closure.
  useEffect(() => {
    strikeRef.current = handleHit;
  });

  // ── unmount / stop cleanup ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("devicemotion", handleMotion);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      shakeRef.current = null;
    };
  }, [handleMotion]);

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
              306 · rain-shaker
            </span>
            <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">
              Shake it like rain.
            </h1>
            <p className="max-w-md text-base text-foreground">
              Hold the phone and shake. Soft shakes make a gentle trickle —
              shake harder and warm rain and bells come tumbling down.
            </p>
          </div>

          <button
            onClick={start}
            className="min-h-[64px] rounded-full bg-gradient-to-r from-violet-400 to-violet-400 px-10 text-xl font-semibold text-[#160a18] shadow-lg shadow-violet-500/25 transition-transform active:scale-95"
          >
            Shake to play ▸
          </button>

          <p className="max-w-sm text-base text-muted-foreground">
            On a computer? Swish the mouse fast — or just watch, it rains by
            itself.
          </p>
        </div>
      )}

      {/* running hints */}
      {mode === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 px-6 pt-5 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
            shake · trickle · chime
          </p>
          {sensorDenied && (
            <p className="max-w-md text-base text-violet-300">
              Motion sensor is off — swish the mouse fast instead, or watch it
              rain by itself.
            </p>
          )}
          {!sensorDenied && usingFallback && (
            <p className="max-w-md text-base text-violet-300">
              No motion sensor here — swish the mouse fast to shake, or let it
              rain by itself.
            </p>
          )}
          {noWebgl && (
            <p className="max-w-md text-base text-violet-300">
              Graphics need WebGL2 — the rain is hidden, but the sound still
              plays.
            </p>
          )}
        </div>
      )}

      {/* D-Dorian legend (low → high) */}
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
        className="absolute right-3 top-3 z-30 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 font-mono text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-black/85 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-xl space-y-5 text-base leading-relaxed text-foreground">
            <h2 className="text-2xl font-semibold text-foreground">
              Rain-Shaker — design notes
            </h2>
            <p>
              <span className="text-foreground">The one question:</span> what if a
              kid could shake the phone like a rainstick or a maraca, and the
              harder they shake the warmer the shower of rain and bells that
              falls?
            </p>
            <p>
              <span className="text-foreground">Motion.</span> Each{" "}
              <span className="font-mono text-violet-200">devicemotion</span>{" "}
              event (~60 Hz) gives an acceleration vector that still contains
              gravity. We keep a slow running average per axis (the gravity
              estimate) and subtract it — a{" "}
              <span className="font-mono text-violet-200">high-pass</span> that
              leaves only the dynamic shake. Its magnitude feeds a smoothed{" "}
              <span className="font-mono text-violet-200">shake-energy</span>{" "}
              envelope (fast attack, slow release). Threshold crossings, with a
              short refractory window, become discrete shake-hits.
            </p>
            <p>
              <span className="text-foreground">Sound &amp; light.</span> The
              continuous envelope sets how many warm rain beads fall and how
              fast (raw WebGL2 point-sprites over a dark→dawn gradient); each
              shake-hit strikes an FM bell chime and blooms a glow. The bells
              are tuned to{" "}
              <span className="font-mono text-violet-200">D-Dorian</span> (D E F
              G A B C — explicitly not C-major-pentatonic), under an always-on
              ambient pad, all through a limiter so vigorous shaking can never
              blast. No fail, no timer, no score.
            </p>
            <p>
              <span className="text-foreground">References.</span> The{" "}
              <span className="italic">rainstick</span> (Andean/Chilean
              cactus-spine instrument played by tilting and shaking) and the{" "}
              <span className="italic">maraca / shaker</span> percussion
              tradition; the embodied motion→sound mapping echoes
              movement-sonification research (CHI 2026, &ldquo;Designing
              Interactive Movement Sonification&rdquo;).
            </p>
            <p className="text-sm text-muted-foreground">
              Tags — INPUT: device MOTION (devicemotion / accelerometer) ·
              OUTPUT: raw WebGL2 · TECHNIQUE: accelerometer shake-energy
              detection · VIBE: warm, playful, rainy-day.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="absolute left-3 top-3 z-30 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 font-mono text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        ← dream
      </Link>
    </main>
  );
}
