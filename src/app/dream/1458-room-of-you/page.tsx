"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /dream/1458-room-of-you — "The Room of You"
//
//   What if your own body WAS the acoustic space? You stand before the camera
//   and your silhouette becomes the shape of a resonant room: moving your body
//   re-tunes an FDN reverb and a soft bell rings out through the you-shaped
//   cathedral. Camera → body geometry → the SOUND of a space (not just pixels).
//
//   Input : getUserMedia camera + hand-rolled pixel features, with a
//           deterministic synthetic-presence fallback (never blank/silent).
//   Output: WebGL2 luminous standing-wave volume (Canvas2D fallback).
//   Audio : a self-built Feedback-Delay-Network reverb re-tuned by body size,
//           excited by soft mallet/bell hits on motion peaks + gentle idle rings.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { createVision, type VisionHandle } from "./vision";
import { createRenderer, type RendererHandle, type RenderState } from "./renderer";
import { createRoom, type Room } from "./fdn";

type Phase = "idle" | "running";

interface Engine {
  ctx: AudioContext;
  room: Room;
  master: GainNode;
  vision: VisionHandle;
  renderer: RendererHandle;
  raf: number;
  onResize: () => void;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function RoomOfYou() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<"camera" | "synthetic">("synthetic");
  const [visionError, setVisionError] = useState<string | null>(null);
  const [glKind, setGlKind] = useState<"webgl2" | "canvas2d">("webgl2");
  const [hud, setHud] = useState({ size: 0, bright: 0, motion: 0 });

  const teardown = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    engineRef.current = null;
    cancelAnimationFrame(eng.raf);
    window.removeEventListener("resize", eng.onResize);
    try {
      eng.vision.stop();
    } catch {
      /* ignore */
    }
    try {
      eng.room.stop();
    } catch {
      /* ignore */
    }
    try {
      eng.master.gain.cancelScheduledValues(eng.ctx.currentTime);
      eng.master.gain.setTargetAtTime(0.0001, eng.ctx.currentTime, 0.1);
    } catch {
      /* ignore */
    }
    try {
      eng.renderer.dispose();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      try {
        void eng.ctx.close();
      } catch {
        /* ignore */
      }
    }, 250);
  }, []);

  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (engineRef.current || starting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStarting(true);

    const reduced = prefersReducedMotion();

    // AudioContext only AFTER this user gesture.
    const CtxCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new CtxCtor();
    try {
      await ctx.resume();
    } catch {
      /* some browsers resume lazily */
    }

    // Master chain: room → master → limiter → destination.
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 24;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(reduced ? 0.16 : 0.2, ctx.currentTime + 2.5);

    const room = createRoom(ctx, reduced);
    room.output.connect(master);

    const vision = createVision();
    const resolvedMode = await vision.start();
    setMode(resolvedMode);
    setVisionError(vision.error);

    const renderer = createRenderer(canvas);
    setGlKind(renderer.kind);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const onResize = () => {
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      renderer.resize(w, h);
    };
    onResize();
    window.addEventListener("resize", onResize);

    const t0 = performance.now();

    // smoothed features
    let sSize = 0,
      sBright = 0.5,
      sFill = 0,
      sWidth = 0,
      sCx = 0.5,
      sCy = 0.5,
      sMotion = 0;
    // strike bookkeeping
    let lastStrike = -10;
    let lastMotion = 0;
    let strikeAge = 5;
    let strikeAmp = 0;
    let lastHud = 0;

    const AUTO_INTERVAL = reduced ? 9 : 6.5; // idle self-demo ring cadence
    const MIN_INTERVAL = 0.28; // rate-limit strikes
    const MOTION_TH = reduced ? 0.14 : 0.08;

    const frame = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const now = (performance.now() - t0) / 1000;
      const p = vision.sample(now);

      // motion-derived "size" combines vertical extent + spread for a stable read.
      const rawSize = Math.min(1, p.height * 0.7 + p.spread * 0.6);
      const rawBright = 1 - p.centroidY; // standing tall/high → brighter

      const k = reduced ? 0.03 : 0.06;
      sSize = lerp(sSize, rawSize, k);
      sBright = lerp(sBright, rawBright, k);
      sFill = lerp(sFill, p.fill, k);
      sWidth = lerp(sWidth, p.width, k);
      sCx = lerp(sCx, p.centroidX, 0.12);
      sCy = lerp(sCy, p.centroidY, 0.12);
      const motion = reduced ? p.motion * 0.5 : p.motion;
      sMotion = lerp(sMotion, motion, 0.2);

      eng.room.setBody({ size: sSize, bright: sBright, fill: sFill, width: sWidth });

      // strike on a rising motion peak, rate-limited.
      const rising = motion > lastMotion + 0.01;
      if (motion > MOTION_TH && rising && now - lastStrike > MIN_INTERVAL) {
        const intensity = Math.min(1, 0.3 + motion * 0.9);
        eng.room.strike(eng.ctx.currentTime, { intensity, size: sSize, bright: sBright, width: sWidth });
        lastStrike = now;
        strikeAge = 0;
        strikeAmp = intensity;
      } else if (now - lastStrike > AUTO_INTERVAL) {
        // idle self-demo: a gentle ring so the piece is never silent.
        const intensity = 0.4;
        eng.room.strike(eng.ctx.currentTime, { intensity, size: Math.max(0.4, sSize), bright: sBright, width: sWidth });
        lastStrike = now;
        strikeAge = 0;
        strikeAmp = intensity;
      }
      lastMotion = motion;
      strikeAge = now - lastStrike;

      const rs: RenderState = {
        motion: sMotion,
        size: sSize,
        bright: sBright,
        centroidX: sCx,
        centroidY: sCy,
        strikeAge,
        strikeAmp,
        reduced,
      };
      eng.renderer.draw(p, rs, now);

      // throttle HUD state updates (~5/s) so React doesn't churn.
      if (now - lastHud > 0.2) {
        lastHud = now;
        setHud({ size: sSize, bright: sBright, motion: sMotion });
      }

      eng.raf = requestAnimationFrame(frame);
    };

    const eng: Engine = { ctx, room, master, vision, renderer, raf: 0, onResize };
    engineRef.current = eng;
    eng.raf = requestAnimationFrame(frame);

    setPhase("running");
    setStarting(false);
  }, [starting]);

  const stop = useCallback(() => {
    teardown();
    setPhase("idle");
  }, [teardown]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full" />

      {/* design-notes link, corner */}
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/1458-room-of-you/README.md"
        className="fixed right-4 top-4 z-30 rounded-full border border-border bg-black/50 px-4 py-2.5 text-sm text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        Read the design notes →
      </Link>

      {phase === "idle" && (
        <div className="relative z-20 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-violet-300/90">a cross-modal meditation</p>
          <h1 className="font-semibold text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">The Room of You</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-foreground">
            Stand before the camera and your silhouette becomes the shape of a resonant room. Move, and the space
            re-tunes; a soft bell rings out through the you-shaped cathedral.
          </p>
          <button
            onClick={begin}
            disabled={starting}
            className="mt-8 min-h-[44px] rounded-full bg-violet-500/90 px-8 py-3.5 text-lg font-medium text-foreground shadow-lg transition-colors hover:bg-violet-400 disabled:opacity-60"
          >
            {starting ? "Opening the room…" : "Begin — and allow the camera"}
          </button>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            If you decline the camera, a synthetic presence inhabits the room for you. Best with headphones, in a dim
            space.
          </p>
        </div>
      )}

      {phase === "running" && (
        <>
          <div className="fixed left-4 top-4 z-30 rounded-2xl border border-border bg-black/45 px-4 py-3 backdrop-blur-md">
            <p
              className={
                mode === "camera"
                  ? "text-sm font-medium text-violet-300/95"
                  : "text-sm font-medium text-violet-300/95"
              }
            >
              {mode === "camera" ? "camera: your body is the room" : "synthetic presence (no camera)"}
            </p>
            {mode === "synthetic" && visionError && (
              <p className="mt-1 text-xs text-violet-300/90">{visionError} — using the synthetic presence</p>
            )}
            {glKind === "canvas2d" && (
              <p className="mt-1 text-xs text-violet-300/90">WebGL2 unavailable — simplified visual, audio intact</p>
            )}
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>room {Math.round(hud.size * 100)}%</span>
              <span>bright {Math.round(hud.bright * 100)}%</span>
              <span>motion {Math.round(hud.motion * 100)}%</span>
            </div>
          </div>

          <button
            onClick={stop}
            className="fixed bottom-20 left-1/2 z-30 min-h-[44px] -translate-x-1/2 rounded-full border border-border bg-black/60 px-6 py-2.5 text-base text-foreground backdrop-blur-md transition-colors hover:text-foreground"
          >
            Stop
          </button>
        </>
      )}

      <PrototypeNav slugs={["1458-room-of-you"]} />
    </main>
  );
}
