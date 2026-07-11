"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1430-echo-void — "What if you could only see a space by listening to your own
// echoes — navigate a hidden cathedral-void by pinging it, like biosonar?"
//
//   Nearly-black screen. Tap / space to emit a PING: an expanding spherical
//   wavefront travels at a fixed speed of sound; wherever it crosses a hidden
//   surface, that surface briefly glows AND returns an HRTF-panned echo delayed by
//   2·dist/speed. Drag / arrows steer your heading and the echoes re-pan. Over ~30s
//   of pinging, an unseen cathedral reveals itself to the ear and eye.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { buildCathedral, SPEED } from "./geometry";
import { makeViewProjection } from "./camera";
import { EchoRenderer, type Tier } from "./renderer";
import { EchoAudio } from "./audio";
import { mulberry32, ECHO_SEED } from "./rng";

type Phase = "idle" | "running";

const nowSec = (): number => performance.now() / 1000;

export default function EchoVoidPage() {
  const cath = useMemo(() => buildCathedral(), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EchoRenderer | null>(null);
  const audioRef = useRef<EchoAudio | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const headingRef = useRef({ yaw: 0, pitch: 0.02 });
  const userPingedRef = useRef(false);
  const idleTimerRef = useRef<number>(0);
  const idleRngRef = useRef<() => number>(mulberry32(ECHO_SEED ^ 0x51));
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const dragRef = useRef({ down: false, moved: false, x: 0, y: 0 });
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tier, setTier] = useState<Tier | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const speed = useCallback(
    () => SPEED * (reducedRef.current ? 0.62 : 1),
    [],
  );

  // Emit one ping (from a user gesture or the idle auto-pinger).
  const ping = useCallback(
    (fromUser: boolean) => {
      const a = audioRef.current;
      const r = rendererRef.current;
      const yaw = headingRef.current.yaw;
      if (a) a.ping(yaw, speed());
      if (r) r.ping(nowSec());
      if (fromUser && !userPingedRef.current) {
        userPingedRef.current = true;
        if (idleTimerRef.current) {
          window.clearTimeout(idleTimerRef.current);
          idleTimerRef.current = 0;
        }
      }
    },
    [speed],
  );

  const scheduleIdle = useCallback(() => {
    if (userPingedRef.current) return;
    const delay = 4000 + idleRngRef.current() * 2000;
    idleTimerRef.current = window.setTimeout(() => {
      if (userPingedRef.current) return;
      ping(false);
      scheduleIdle();
    }, delay);
  }, [ping]);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = 0;
    }
    if (keyHandlerRef.current) {
      window.removeEventListener("keydown", keyHandlerRef.current);
      keyHandlerRef.current = null;
    }
    audioRef.current?.close();
    audioRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
  }, []);

  // Cleanup on unmount.
  useEffect(() => teardown, [teardown]);

  const frame = useCallback(() => {
    const r = rendererRef.current;
    const canvas = canvasRef.current;
    if (!r || !canvas) return;
    const t = nowSec();
    let dt = t - lastTimeRef.current;
    if (dt < 0 || dt > 0.1) dt = 0.016;
    lastTimeRef.current = t;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    r.resize(cw, ch, dpr);

    const { yaw, pitch } = headingRef.current;
    const vp = makeViewProjection(yaw, pitch, cw / ch);
    r.step(t, dt, { vp, speed: speed(), reduced: reducedRef.current });

    rafRef.current = requestAnimationFrame(frame);
  }, [speed]);

  const handleBegin = useCallback(async () => {
    if (phase === "running") return;
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Audio must be created + resumed inside the user gesture.
    const audio = new EchoAudio(cath);
    audioRef.current = audio;
    await audio.resume();

    const renderer = new EchoRenderer(canvas, cath);
    rendererRef.current = renderer;
    setTier(renderer.tier);

    // Steer via arrow keys; space pings.
    const onKey = (e: KeyboardEvent) => {
      const h = headingRef.current;
      const step = 0.11;
      if (e.code === "Space") {
        e.preventDefault();
        ping(true);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        h.yaw -= step;
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        h.yaw += step;
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        h.pitch = Math.min(0.6, h.pitch + step * 0.6);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        h.pitch = Math.max(-0.6, h.pitch - step * 0.6);
      }
    };
    window.addEventListener("keydown", onKey);
    keyHandlerRef.current = onKey;

    setPhase("running");
    lastTimeRef.current = nowSec();
    rafRef.current = requestAnimationFrame(frame);

    // A first ping so the space is not born silent/black, then idle auto-pings.
    window.setTimeout(() => {
      if (!userPingedRef.current) ping(false);
    }, 650);
    scheduleIdle();
  }, [phase, cath, frame, ping, scheduleIdle]);

  // ── pointer: tap to ping, drag to steer ────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      down: true,
      moved: false,
      x: e.clientX,
      y: e.clientY,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.down) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const h = headingRef.current;
    h.yaw += dx * 0.005;
    h.pitch = Math.max(-0.6, Math.min(0.6, h.pitch - dy * 0.004));
    d.x = e.clientX;
    d.y = e.clientY;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      d.down = false;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (!d.moved) ping(true);
    },
    [ping],
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={phase === "running" ? onPointerDown : undefined}
        onPointerMove={phase === "running" ? onPointerMove : undefined}
        onPointerUp={phase === "running" ? onPointerUp : undefined}
        onPointerCancel={phase === "running" ? onPointerUp : undefined}
      />

      {/* Title / intro over the void */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Echo Void
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          A hidden cathedral you can only see by listening to your own echoes.
          Ping the dark; the space answers.
        </p>
      </div>

      {/* Tier badge */}
      {tier && (
        <div className="pointer-events-none absolute right-4 top-5 z-20 sm:right-6">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              tier === "webgl2"
                ? "border-violet-400/40 bg-violet-400/10 text-violet-300"
                : "border-violet-400/40 bg-violet-400/10 text-violet-300"
            }`}
          >
            {tier === "webgl2" ? "WebGL2" : "Canvas"}
          </span>
        </div>
      )}

      {/* Gesture gate */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-6 max-w-md text-center">
            <p className="text-base text-muted-foreground">
              Sound and motion. Put on headphones for the spatial echoes, then
              begin.
            </p>
            <button
              type="button"
              onClick={handleBegin}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-semibold text-foreground transition-colors hover:bg-violet-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              Begin — enter the void
            </button>
            <p className="mt-4 text-sm text-muted-foreground">
              tap / space to ping · drag / arrows to steer your heading
            </p>
          </div>
        </div>
      )}

      {/* Live hint while running */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 text-center">
          <p className="text-sm text-muted-foreground">
            tap / space to ping · drag / arrows to steer
          </p>
        </div>
      )}

      {/* Design-notes affordance */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-3 left-3 z-30 min-h-[44px] rounded-full border border-border bg-black/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-16 left-3 z-30 max-w-sm rounded-2xl border border-border bg-black/85 p-4 text-sm leading-relaxed text-muted-foreground backdrop-blur-md">
          <p className="text-base font-semibold text-foreground">Active echolocation</p>
          <p className="mt-2">
            Every ping launches a spherical wavefront at a fixed speed of sound.
            Where it crosses a surface, that surface lights as a cluster of points
            and returns an echo, HRTF-panned to its true bearing and delayed by
            2·distance/speed — so near walls answer first, the far apse last.
            Time emerges from the geometry.
          </p>
          <p className="mt-2 text-muted-foreground">
            Each material rings with{" "}
            <span className="text-violet-300">inharmonic</span> partials (struck
            bell / plate ratios), so the field stays eerie, never sweetly
            consonant.
          </p>
          <p className="mt-2 text-muted-foreground">
            After biosonar (bats, dolphins), Alvin Lucier&apos;s{" "}
            <em>I Am Sitting in a Room</em>, and James Turrell.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["1430-echo-void"]} />
    </main>
  );
}
