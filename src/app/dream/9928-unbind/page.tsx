"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { createVoidScene, type VoidScene } from "./void-gl";
import { makeVoidAudio, type VoidAudio } from "./audio";

/* ── the shared envelope ──────────────────────────────────────────────────
   ONE swell shape. The VISUAL side samples it at t; the AUDIO side samples it
   at (t + offset). Sharp-ish onset so the timing displacement is legible. */
const PULSE_PERIOD = 7.3; // seconds between swells
function pulseEnv(tt: number): number {
  const x = ((tt % PULSE_PERIOD) + PULSE_PERIOD) / PULSE_PERIOD % 1; // 0..1
  const xp = 0.16; // peak position
  if (x < xp) return Math.pow(x / xp, 1.4); // quick rise
  const d = (x - xp) / (1 - xp);
  return Math.exp(-d * 4.0); // long fall
}

/* ── the wandering offset (the un-binding) ────────────────────────────────
   The offset itself drifts sinusoidally over ~26 s, in ±0.5 s. When bound
   (bindMul→0) the offset collapses to 0 and the streams LOCK. */
const OFFSET_MAX = 0.5; // seconds, ±
const OFFSET_PERIOD = 26; // seconds for the offset to wander a full cycle
function offsetTarget(tt: number): number {
  return OFFSET_MAX * Math.sin((2 * Math.PI * tt) / OFFSET_PERIOD);
}

// A seeded PRNG for the auto-drift seed (no Math.random / Date.now at module scope).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Phase = "idle" | "running";

export default function UnbindPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [glOk, setGlOk] = useState<boolean>(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [bindMs, setBindMs] = useState<number>(0);
  const [locked, setLocked] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<VoidScene | null>(null);
  const audioRef = useRef<VoidAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const lastTickRef = useRef<number>(0);
  const clockRef = useRef<number>(0); // the slow, time-scaled clock

  // desync state
  const bindMulRef = useRef<number>(1); // 1 = fully unbound, 0 = locked
  const lockUntilRef = useRef<number>(-1); // clock time to hold the lock until

  // pointer nudge (optional)
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // seeded drift + reduced motion
  const reducedRef = useRef<boolean>(false);
  const timeScaleRef = useRef<number>(1);
  const readoutAccRef = useRef<number>(0);

  const seedPhase = useMemo(() => {
    // deterministic per-mount seed → a stable starting point in the drift
    const r = mulberry32(9928)();
    return r * OFFSET_PERIOD;
  }, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    pointerTargetRef.current = { x: nx, y: -ny };
  }, []);

  const renderLoop = useCallback(() => {
    const scene = sceneRef.current;
    const now = performance.now();
    let dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-away
    const sdt = dt * timeScaleRef.current;
    clockRef.current += sdt;
    const t = clockRef.current + seedPhase;

    // ease the pointer nudge
    const p = pointerRef.current;
    const pt = pointerTargetRef.current;
    p.x += (pt.x - p.x) * Math.min(1, dt * 2.5);
    p.y += (pt.y - p.y) * Math.min(1, dt * 2.5);

    // ── update the bind multiplier (the desync engine) ──
    // Snap toward locked (fast) while inside the hold window; otherwise let it
    // slowly drift back apart (the derealization creeps back in).
    const holding = t < lockUntilRef.current;
    const target = holding ? 0 : 1;
    const rate = holding ? dt * 3.2 : dt * 0.09; // fast to lock, slow to unbind
    bindMulRef.current += (target - bindMulRef.current) * Math.min(1, rate);
    const bindMul = bindMulRef.current;

    // effective wandering offset, collapsed toward 0 as we lock
    const offSec = offsetTarget(t) * bindMul;

    // the SAME envelope, sampled at two times
    const envVisual = pulseEnv(t);
    const envAudio = pulseEnv(t + offSec);

    audioRef.current?.setEnvelope(envAudio);

    if (scene && scene.ok) {
      scene.render({
        time: t,
        pulse: envVisual,
        lock: 1 - bindMul, // brighten subtly as streams lock
        pointerX: p.x,
        pointerY: p.y,
      });
    }

    // throttle the on-screen readout (~8 Hz) to avoid re-render spam
    readoutAccRef.current += dt;
    if (readoutAccRef.current > 0.12) {
      readoutAccRef.current = 0;
      const ms = Math.round(offSec * 1000);
      setBindMs(ms);
      setLocked(bindMul < 0.06);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [seedPhase]);

  // ── mount: raymarch the void immediately (seeded auto-drift, no audio) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    timeScaleRef.current = reducedRef.current ? 0.5 : 1;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createVoidScene(canvas);
    sceneRef.current = scene;
    setGlOk(scene.ok);
    if (!scene.ok) return;

    lastTickRef.current = performance.now();
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [renderLoop, onPointerMove]);

  // ── full audio teardown on unmount ──
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        ac.close().catch(() => {});
      }
      acRef.current = null;
    };
  }, []);

  // ── Start: attach audio on the first user gesture ──
  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeVoidAudio(ac);
      setPhase("running");
    } catch {
      // visuals continue regardless; leave idle so the user can retry
    }
  }, [phase]);

  // ── Re-bind: smoothly ramp the offset to 0 so the streams LOCK ──
  const handleRebind = useCallback(() => {
    // hold the lock for ~3 s, then let it slowly drift back into the void
    lockUntilRef.current = clockRef.current + seedPhase + 3.0;
  }, [seedPhase]);

  const readout = useMemo(() => {
    if (phase !== "running") return "bind: idle";
    if (locked) return "bind: 0 ms · locked";
    const sign = bindMs > 0 ? "+" : bindMs < 0 ? "−" : "";
    return `bind: ${sign}${Math.abs(bindMs)} ms · unbound`;
  }, [phase, locked, bindMs]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {!glOk && (
        <div className="fixed inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
            This piece raymarches a luminous void in WebGL, which your browser
            could not start. The sound still works — press Start to enter the
            drone-lit dark.
          </p>
        </div>
      )}

      {/* top-left chrome */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          altered states · dissociative void
        </p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Unbind
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          The brain fuses what it sees and what it hears into one event. Here
          the two streams slowly drift out of lock — a calm, weightless
          derealization. Press Re-bind and feel them snap back into your body.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <button
              onClick={handleRebind}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Re-bind
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {notesOpen ? "close notes" : "design notes"}
          </button>
        </div>

        {phase === "running" && (
          <p className="mt-3 text-sm text-muted-foreground">
            move the pointer to drift · the drone never stops
          </p>
        )}
      </div>

      {/* the subtle offset readout — the un-binding, made visible */}
      <div className="pointer-events-none fixed bottom-16 right-5 z-30 sm:bottom-6 sm:right-7">
        <span
          className={`font-mono text-xs uppercase tracking-[0.18em] transition-colors ${
            locked ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {readout}
        </span>
      </div>

      {/* design notes */}
      {notesOpen && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-border bg-background/90 p-5 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:max-w-md sm:rounded-lg sm:border">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Design notes
          </h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            One clock drives a single swell envelope. The <em>visual</em> bloom
            samples it at time <span className="font-mono">t</span>; the{" "}
            <em>audio</em> bloom samples the same shape at{" "}
            <span className="font-mono">t + offset</span>. The offset itself
            wanders ±0.5 s over ~26 s, so sound and image are never quite the
            same event — the brain cannot bind two streams that do not
            co-occur, and the felt result is detachment: the dissociative void.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Re-bind smoothly collapses the offset to zero. For a few held
            seconds the streams lock, everything reads as one embodied event,
            then the offset slowly drifts back apart and the void returns. The
            contrast between bound and unbound <em>is</em> the piece.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            This is the therapeutic inverse of cybersickness — a safe, slow,
            opt-out decoupling instead of a nauseating sensory conflict. See
            README.md for the full reference chain (Porcino et al. 2026; van
            Lommel / Greyson NDE-void; sensory-conflict derealization).
          </p>
        </div>
      )}

      <PrototypeNav slugs={["9928-unbind"]} />
    </main>
  );
}
