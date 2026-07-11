"use client";

// 1065-skin-membrane — "Skin Membrane".
// Press, pull and TEAR a living skin of sound with your hands. A mass-spring
// drumhead (membrane.ts) is the instrument; its physical tension IS the pitch.
// A bank of 8 bandpass resonators tuned to a circular membrane's Bessel-zero
// modal ratios (audio.ts) sings as you bend the skin — mean spring stretch
// glides the fundamental via portamento. Pokes and tears inject noise bursts;
// a quiet continuous excitation keeps steady tension audible. Canvas2D mesh
// (render.ts) shades by areal strain: indigo slack, magenta/gold taut, hot
// rupture rims. Idle = a faint breathing skin. See README.md.
//
// state: salvia / DMT membrane-reality · pole: intense

import { useCallback, useEffect, useRef, useState } from "react";
import { Membrane } from "./membrane";
import { ModalEngine } from "./audio";
import { MembraneRenderer } from "./render";

type Phase = "idle" | "live" | "error";

interface PointerTrack {
  active: boolean;
  gx: number;
  gy: number;
  vx: number; // grid units / s
  vy: number;
  lastX: number;
  lastY: number;
  lastT: number;
}

export default function SkinMembranePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MembraneRenderer | null>(null);
  const membraneRef = useRef<Membrane | null>(null);
  const engineRef = useRef<ModalEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const pointerRef = useRef<PointerTrack>({
    active: false,
    gx: 0,
    gy: 0,
    vx: 0,
    vy: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
  });

  // ── Setup: membrane + renderer live immediately (visual runs before audio).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: MembraneRenderer;
    try {
      renderer = new MembraneRenderer(canvas);
    } catch {
      setNotice("Canvas2D is unavailable in this browser.");
      return;
    }
    rendererRef.current = renderer;
    membraneRef.current = new Membrane();

    const applyResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(window.innerWidth, window.innerHeight, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);

    lastTimeRef.current = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const m = membraneRef.current;
      const r = rendererRef.current;
      if (!m || !r) return;
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;

      // Feed live pointer into the solver each frame.
      const p = pointerRef.current;
      m.setPointer(p.gx, p.gy, p.vx, p.vy, p.active);

      const stats = m.step(dt);

      // Audio coupling.
      const engine = engineRef.current;
      if (engine) {
        engine.update({
          tension: stats.tension,
          excitation: stats.excitation,
          brightness: stats.brightness,
        });
        if (stats.freshTears > 0) {
          engine.strike(Math.min(0.3 + stats.freshTears * 0.18, 1));
        }
      }

      r.draw(m, { tension: stats.tension, brightness: stats.brightness });
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
    };
  }, []);

  // ── Full audio teardown on unmount.
  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      const ctx = ctxRef.current;
      if (engine) engine.stop();
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          /* ignore */
        });
      }
      engineRef.current = null;
      ctxRef.current = null;
    };
  }, []);

  // ── Awaken: create AudioContext on the user gesture (autoplay policy).
  const awaken = useCallback(async () => {
    if (phaseRef.current === "live") return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      const ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();
      const engine = new ModalEngine(ctx);
      engine.start();
      ctxRef.current = ctx;
      engineRef.current = engine;
      setPhase("live");
      setNotice(null);
    } catch {
      setNotice("Audio could not start — the skin still breathes silently. Tap again to retry.");
      setPhase("error");
    }
  }, []);

  // ── Pointer handlers (mouse + touch via Pointer Events). ───────────────────
  const updatePointer = useCallback((clientX: number, clientY: number, active: boolean) => {
    const r = rendererRef.current;
    if (!r) return;
    const [gx, gy] = r.screenToGrid(clientX, clientY);
    const p = pointerRef.current;
    const now = performance.now();
    const dt = Math.max((now - p.lastT) / 1000, 1e-3);
    if (p.active && active) {
      p.vx = (gx - p.lastX) / dt;
      p.vy = (gy - p.lastY) / dt;
    } else {
      p.vx = 0;
      p.vy = 0;
    }
    p.lastX = gx;
    p.lastY = gy;
    p.lastT = now;
    p.gx = gx;
    p.gy = gy;
    p.active = active;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = pointerRef.current;
      p.lastT = performance.now();
      updatePointer(e.clientX, e.clientY, true);
    },
    [updatePointer]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerRef.current.active) return;
      updatePointer(e.clientX, e.clientY, true);
    },
    [updatePointer]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const p = pointerRef.current;
      // Flick: impart a traveling wave from the release velocity.
      const m = membraneRef.current;
      if (m) m.releaseFlick(p.vx, p.vy);
      p.active = false;
      p.vx = 0;
      p.vy = 0;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    []
  );

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[#08061a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Title + description + awaken button overlay. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-3 p-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          Skin Membrane
        </h1>
        <p className="max-w-xl text-base text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
          Press, pull and tear a living skin of sound. Its physical tension{" "}
          <span className="text-foreground">is</span> the pitch — bend the membrane and the tone
          glides.
        </p>
        {phase !== "live" && (
          <button
            type="button"
            onClick={awaken}
            className="pointer-events-auto mt-1 min-h-[44px] rounded-full border border-violet-300/40 bg-violet-500/15 px-6 py-2.5 font-mono text-base text-foreground transition hover:bg-violet-500/30 active:scale-95"
          >
            Awaken the skin
          </button>
        )}
        {phase === "live" && (
          <p className="font-mono text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            drag to press · flick to send a wave · overstretch to tear
          </p>
        )}
        {notice && (
          <p className="pointer-events-auto max-w-md font-mono text-base text-violet-300 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            {notice}
          </p>
        )}
      </div>

      {/* Design notes — corner toggle. */}
      <div className="absolute bottom-0 right-0 p-4 text-right">
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 font-mono text-base text-foreground transition hover:text-foreground"
        >
          {showNotes ? "Close notes" : "Read the design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 max-w-sm rounded-2xl border border-border bg-black/70 p-5 text-left backdrop-blur">
            <p className="text-base text-foreground">
              A 52×52 mass-spring drumhead with structural, shear and bend springs and a pinned
              boundary, integrated with symplectic Euler. Mean spring stretch drives a
              Bessel-zero modal resonator bank — tension is pitch. Springs that overstretch snap
              into hot rupture rims.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Full notes &amp; references in{" "}
              <a
                href="https://github.com/"
                onClick={(e) => {
                  e.preventDefault();
                  setShowNotes(true);
                }}
                className="font-mono text-violet-300 underline decoration-dotted"
              >
                README.md
              </a>{" "}
              (Jakobsen, <span className="italic">Advanced Character Physics</span>; circular-
              membrane modal synthesis).
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
