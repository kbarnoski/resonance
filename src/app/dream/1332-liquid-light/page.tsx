"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Liquid Light — a 1960s psychedelic oil-wheel light show you POUR with your phone.
//
// THE ONE QUESTION: What if the molten pools of colored oil a projectionist
// pushed across a hot plate by heat and gravity were an instrument you pour by
// TILTING — tilt to make the color flow and bloom?
//
// INPUT     : DeviceOrientationEvent (iOS requestPermission() on the Begin tap).
//             Desktop: pointer-drag pushes the oil. A gentle auto-drift keeps the
//             plate alive when nothing is touching it.
// OUTPUT    : Canvas2D — a coarse dye-advection on a small offscreen buffer, plus
//             additive ('lighter') translucent radial gradients for the oil glow.
// AUDIO     : a warm swirling just-chord drone; lowpass cutoff + a pitch bend
//             track tilt magnitude, over a felt ~0.3 Hz LFO throb. Master ≤ 0.26
//             behind a limiter. (see audio.ts / fluid.ts)
//
// REFERENCE : the Joshua Light Show (Joshua White, Fillmore East, 1960s–) and
//             Mark Boyle & Joan Hills' "Sensual Laboratory" liquid projections.
//
// DEGRADES  : no tilt sensor / denied → pointer-drag works, announced on screen.
//             prefers-reduced-motion → slower churn, softer contrast.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { startLiquidLight, type LiquidAudio } from "./audio";
import { makeFluid, type Fluid } from "./fluid";

type Phase = "idle" | "running";
type Mode = "pointer" | "tilt";

// mutable state kept off React's render path
interface Field {
  // raw input flow vector (gravity / pour direction), each -1..1
  tx: number;
  ty: number;
  // smoothed flow used for advection + audio
  sx: number;
  sy: number;
  dragging: boolean;
  lastAudio: number;
}

export default function LiquidLightPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const fluidRef = useRef<Fluid | null>(null);
  const audioRef = useRef<LiquidAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");
  const reducedRef = useRef(false);
  const orientHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const fieldRef = useRef<Field>({
    tx: 0,
    ty: 0,
    sx: 0,
    sy: 0,
    dragging: false,
    lastAudio: 0,
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("pointer");
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [sensorErr, setSensorErr] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── canvas sizing (devicePixelRatio-aware) ──────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const c = canvas.getContext("2d");
    if (c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2dRef.current = c;
    }
  }, []);

  // ── pointer-drag = pour vector (desktop fallback, always live) ───────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "pointer") return;
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    fieldRef.current.dragging = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [mode]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "pointer") return;
    const origin = dragOriginRef.current;
    if (!origin || !fieldRef.current.dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.max(120, Math.min(rect.width, rect.height) * 0.5);
    const f = fieldRef.current;
    f.tx = Math.max(-1, Math.min(1, (e.clientX - origin.x) / scale));
    f.ty = Math.max(-1, Math.min(1, (e.clientY - origin.y) / scale));
  }, [mode]);

  const onPointerUp = useCallback(() => {
    if (mode !== "pointer") return;
    fieldRef.current.dragging = false;
    dragOriginRef.current = null;
    // release: let the pour ease back to rest (auto-drift takes over)
    fieldRef.current.tx = 0;
    fieldRef.current.ty = 0;
  }, [mode]);

  // ── enable device tilt (iOS needs permission from a user gesture) ────────────
  const enableTilt = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE: any = (window as any).DeviceOrientationEvent;
    if (!DOE) {
      setSensorMsg("No tilt sensor here — drag on the plate to pour the oil.");
      return;
    }
    if (typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm !== "granted") {
          setSensorErr("Tilt permission denied — drag to pour still works.");
          return;
        }
      } catch {
        setSensorErr("Tilt unavailable — drag to pour still works.");
        return;
      }
    }

    let gotEvent = false;
    const handler = (e: DeviceOrientationEvent) => {
      const { beta, gamma } = e;
      if (beta === null && gamma === null) return;
      gotEvent = true;
      setMode((m) => {
        if (m !== "tilt") {
          setSensorMsg(null);
          setSensorErr(null);
        }
        return "tilt";
      });
      const f = fieldRef.current;
      f.tx = Math.max(-1, Math.min(1, (gamma ?? 0) / 38));
      f.ty = Math.max(-1, Math.min(1, (beta ?? 0) / 38));
    };
    window.addEventListener("deviceorientation", handler);
    orientHandlerRef.current = handler;

    setTimeout(() => {
      if (!gotEvent) {
        setSensorMsg("No tilt readings — drag on the plate to pour instead.");
      }
    }, 1400);
  }, []);

  // ── Begin: one gesture unlocks audio AND (iOS) tilt permission ───────────────
  const begin = useCallback(async () => {
    if (phaseRef.current !== "idle") return;

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;
    audioRef.current = startLiquidLight(ctx, { reduced: reducedRef.current });

    phaseRef.current = "running";
    setPhase("running");

    // same tap: ask for tilt on iOS (harmless elsewhere; falls back to drag)
    void enableTilt();
  }, [enableTilt]);

  const stop = useCallback(() => {
    if (orientHandlerRef.current) {
      window.removeEventListener("deviceorientation", orientHandlerRef.current);
      orientHandlerRef.current = null;
    }
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) setTimeout(() => ctx.close().catch(() => {}), 400);
    phaseRef.current = "idle";
    setPhase("idle");
    setMode("pointer");
    setSensorMsg(null);
    setSensorErr(null);
    const f = fieldRef.current;
    f.tx = 0;
    f.ty = 0;
    f.dragging = false;
  }, []);

  // ── the always-on render loop (idle churn before Begin, live pour after) ─────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    resize();
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    fluidRef.current = makeFluid(aspect);

    let alive = true;
    let last = performance.now();

    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(50, now - last);
      last = now;
      const f = fieldRef.current;
      const reduced = reducedRef.current;

      // gentle auto-drift so the plate is never dead — a slow lissajous pour
      const driftAmp = reduced ? 0.14 : 0.24;
      const autoX = Math.sin(now * 0.00013) * driftAmp;
      const autoY = Math.cos(now * 0.00017) * driftAmp;

      // user pour dominates; auto-drift always adds a faint living current
      const userMag = Math.hypot(f.tx, f.ty);
      const blend = Math.min(1, userMag * 2.2);
      const flowX = f.tx + autoX * (1 - blend);
      const flowY = f.ty + autoY * (1 - blend);

      // smooth the flow so pours ease, never jump
      const k = reduced ? 0.05 : 0.09;
      f.sx += (flowX - f.sx) * k;
      f.sy += (flowY - f.sy) * k;

      // heat = pour magnitude → hotter blooms + louder brighter drone
      const heat = Math.min(1, Math.hypot(f.sx, f.sy));

      const fluid = fluidRef.current;
      if (fluid) {
        fluid.step(f.sx, f.sy, heat, reduced, dt);
        const ctx2d = ctx2dRef.current;
        const canvas = canvasRef.current;
        if (ctx2d && canvas) {
          const rect = canvas.getBoundingClientRect();
          fluid.render(ctx2d, rect.width, rect.height);
        }
      }

      // feed the drone (throttled to ~50 ms; ramps stay smooth via setTarget tau)
      const audio = audioRef.current;
      if (audio && now - f.lastAudio > 50) {
        f.lastAudio = now;
        audio.setTilt(heat, f.sx);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [resize]);

  // ── full teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    const orient = orientHandlerRef;
    const audio = audioRef;
    const actx = ctxRef;
    return () => {
      if (orient.current) {
        window.removeEventListener("deviceorientation", orient.current);
        orient.current = null;
      }
      audio.current?.stop();
      audio.current = null;
      const c = actx.current;
      actx.current = null;
      if (c) setTimeout(() => c.close().catch(() => {}), 400);
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* ── title + status (top-left) ────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 max-w-lg p-5">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-white drop-shadow-lg">
          Liquid Light
        </h1>
        <p className="mt-2 text-base text-white/80 drop-shadow-lg">
          Pour a 1960s oil-wheel light show with your phone — tilt to push the
          molten color across the plate and let the pools bloom.
        </p>
        {phase === "running" && (
          <p className="mt-2 text-base text-amber-200 drop-shadow-lg">
            {mode === "tilt" ? "Tilt to pour the oil." : "Drag the plate to pour the oil."}
          </p>
        )}
        {sensorMsg && (
          <p className="mt-1 text-base text-amber-200 drop-shadow-lg">{sensorMsg}</p>
        )}
        {sensorErr && (
          <p className="mt-1 text-base text-rose-300 drop-shadow-lg">{sensorErr}</p>
        )}
      </div>

      {/* ── controls (bottom-center) ─────────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-3 p-5">
        {phase === "idle" ? (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-fuchsia-600/90 px-6 py-2.5 text-base font-medium text-white shadow-lg transition hover:bg-fuchsia-500"
          >
            Begin
          </button>
        ) : (
          <>
            {mode !== "tilt" && (
              <button
                onClick={enableTilt}
                className="min-h-[44px] rounded-full bg-cyan-600/85 px-4 py-2.5 text-base font-medium text-white shadow-lg transition hover:bg-cyan-500"
              >
                Enable tilt
              </button>
            )}
            <button
              onClick={stop}
              className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base font-medium text-white shadow-lg backdrop-blur transition hover:bg-white/20"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* ── design-notes affordance (bottom-right) ───────────────────────────── */}
      <button
        onClick={() => setNotesOpen((v) => !v)}
        className="absolute bottom-5 right-5 z-20 min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base font-medium text-white/80 shadow backdrop-blur transition hover:bg-white/20"
      >
        Read the design notes
      </button>

      {notesOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl bg-neutral-900/90 p-6 shadow-2xl ring-1 ring-white/10">
            <h2 className="font-serif text-2xl font-semibold text-white">
              Liquid Light — design notes
            </h2>
            <p className="mt-3 text-base text-white/80">
              In the 1960s a projectionist would push pools of colored oil across a
              glass plate on a hot overhead projector, letting heat and gravity make
              them bloom and swirl behind the band. This makes that plate an
              instrument you pour: tilt your phone (or drag on desktop) and the oil
              flows the way you lean it.
            </p>
            <p className="mt-3 text-base text-white/80">
              Tilt <em>direction</em> is the gravity the color flows along; tilt{" "}
              <em>magnitude</em> is the heat — the harder you pour, the hotter and
              brighter the pools bloom, and the more the drone opens and bends up.
            </p>
            <p className="mt-3 text-base text-white/80">
              The picture is a coarse dye-advection on a small Canvas2D buffer:
              every frame the last image is smeared along your pour vector and faded,
              then colored emitters re-inject additive glow. No WebGL, no strobe —
              the bloom is smooth, capped luminance.
            </p>
            <p className="mt-3 text-base text-white/70">
              Reference: the <strong>Joshua Light Show</strong> (Joshua White,
              Fillmore East) and <strong>Mark Boyle &amp; Joan Hills&apos;
              &ldquo;Sensual Laboratory&rdquo;</strong> liquid projections.
            </p>
            <p className="mt-3 text-base text-white/70">
              input = tilt / drag · output = canvas2d dye-advection · technique =
              analog oil-wheel liquid light show · palette = saturated oil-slick
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-full bg-fuchsia-600/90 px-4 py-2.5 text-base font-medium text-white transition hover:bg-fuchsia-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
