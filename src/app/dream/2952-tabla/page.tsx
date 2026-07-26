"use client";

// 2952-tabla — "Tabla Mesh".
// Strike a REAL vibrating drumhead with your fingers and PRESS with your palm
// to bend the pitch up mid-ring — the tabla 'ga'/'ghe' glide — because the
// sound is a genuine 2-D digital waveguide MESH membrane (Van Duyne & Smith
// 1993), not a sample. Tap = strike; rim = bright 'na', centre = deep 'ge';
// press-and-hold raises local tension so the ringing tone slides up. The audio
// mesh runs at audio rate in an AudioWorklet (Blob URL) with a ScriptProcessor
// fallback; a separate coarser eye-tuned membrane draws the ripples you see.
// A seeded mulberry32(0x2952) player auto-plays a theka on load. See README.md.
//
// state: tactile / earthy hand-drum · pole: restrained

import { useCallback, useEffect, useRef, useState } from "react";
import { MembraneMesh, type MeshConfig } from "./mesh";
import { MembraneRenderer } from "./render";
import { TablaEngine } from "./engine";
import { makeAutopilot, type Autopilot, type AutoEvent } from "./rng";

// A separate, coarser membrane tuned for the EYE: slower waves, heavier damping
// so ripples are visible frame-to-frame. Driven by the same strike/press events
// as the audio mesh, so what you see tracks what you hear.
const VISUAL_CFG: MeshConfig = {
  size: 52,
  baseC2: 0.16,
  maxTension: 0.3,
  loss: 0.955,
  tensionEase: 0.06,
  tensionRelax: 0.97,
};
const VISUAL_SUBSTEPS = 2;
const SEED = 0x2952;

type Mode = "auto" | "hands";

interface Pointer {
  x: number; // disk coord
  y: number;
  downMs: number;
  pressing: boolean;
}

export default function TablaMeshPage() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MembraneRenderer | null>(null);
  const visMeshRef = useRef<MembraneMesh | null>(null);
  const engineRef = useRef<TablaEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const autopilotRef = useRef<Autopilot | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  const modeRef = useRef<Mode>("auto");
  modeRef.current = mode;

  const pointersRef = useRef<Map<number, Pointer>>(new Map());
  const applyRef = useRef<(e: AutoEvent) => void>(() => {});
  const pointerSpeedRef = useRef(0);
  const lastPointerRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // ── Visual mesh + renderer live immediately; visuals run before audio. ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: MembraneRenderer;
    try {
      renderer = new MembraneRenderer(canvas, VISUAL_CFG.size);
    } catch {
      setAudioError("Canvas2D is unavailable in this browser.");
      return;
    }
    rendererRef.current = renderer;
    const mesh = new MembraneMesh(VISUAL_CFG);
    visMeshRef.current = mesh;
    autopilotRef.current = makeAutopilot(SEED);

    const applyResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(window.innerWidth, window.innerHeight, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);

    // Route an event to BOTH the visual mesh and (if live) the audio engine.
    const apply = (ev: AutoEvent) => {
      const vm = visMeshRef.current;
      const eng = engineRef.current;
      if (ev.kind === "strike") {
        if (vm) vm.strike(ev.x, ev.y, ev.vel, ev.width);
        if (eng) eng.strike(ev.x, ev.y, ev.vel, ev.width);
      } else if (ev.kind === "press") {
        if (vm) vm.setPress(ev.x, ev.y, ev.amount, ev.radius);
        if (eng) eng.press(ev.x, ev.y, ev.amount, ev.radius);
      } else {
        if (vm) vm.releasePress();
        if (eng) eng.releasePress();
      }
    };
    applyRef.current = apply;

    lastTsRef.current = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const vm = visMeshRef.current;
      const r = rendererRef.current;
      if (!vm || !r) return;
      const dtMs = Math.min(now - lastTsRef.current, 50);
      lastTsRef.current = now;

      if (modeRef.current === "auto") {
        const ap = autopilotRef.current;
        if (ap) for (const ev of ap.step(dtMs)) apply(ev);
      } else {
        // Hands-on: the most-recent held finger applies a growing palm-press.
        let primary: Pointer | undefined;
        pointersRef.current.forEach((p) => {
          if (p.pressing) primary = p;
        });
        if (primary) {
          const held = now - primary.downMs;
          const amount = Math.min(1, held / 550);
          apply({ kind: "press", x: primary.x, y: primary.y, amount, radius: 0.3 });
        } else {
          apply({ kind: "release" });
        }
      }

      vm.updateControl();
      for (let s = 0; s < VISUAL_SUBSTEPS; s++) vm.step();

      // press indicators for the renderer
      const centers: { x: number; y: number }[] = [];
      if (modeRef.current === "hands") {
        pointersRef.current.forEach((p) => {
          if (p.pressing && now - p.downMs > 120) centers.push({ x: p.x, y: p.y });
        });
      }
      r.draw(vm, centers);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
    };
  }, []);

  // ── Audio teardown on unmount. ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      const ctx = ctxRef.current;
      if (eng) eng.dispose();
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          /* ignore */
        });
      }
      engineRef.current = null;
      ctxRef.current = null;
    };
  }, []);

  // ── Start audio (user gesture → resume AudioContext). ──────────────────────
  const handleStart = useCallback(async () => {
    if (engineRef.current) {
      try {
        await ctxRef.current?.resume();
      } catch {
        /* ignore */
      }
      setStarted(true);
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      setAudioError("Web Audio is unavailable — the membrane still plays visually.");
      setStarted(true);
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not open an audio context — visuals continue silently.");
      return;
    }
    try {
      const engine = new TablaEngine(ctx);
      await engine.init();
      ctxRef.current = ctx;
      engineRef.current = engine;
      setAudioError(null);
      setStarted(true);
    } catch {
      setAudioError("The membrane audio failed to start — visuals continue silently.");
      setStarted(true);
    }
  }, []);

  // ── Pointer input → strikes + palm-press. ──────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = rendererRef.current;
    if (!r) return;
    const d = r.screenToDisk(e.clientX, e.clientY);
    if (!d) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setMode("hands");
    const now = performance.now();

    // strike velocity from recent pointer speed (a quick flick hits harder)
    const vel = Math.min(1, 0.55 + pointerSpeedRef.current * 0.5);
    const rad = Math.sqrt(d.x * d.x + d.y * d.y);
    const width = 3.2 - 2.2 * Math.min(1, rad); // rim = brighter/narrower
    applyRef.current({ kind: "strike", x: d.x, y: d.y, vel, width });

    pointersRef.current.set(e.pointerId, { x: d.x, y: d.y, downMs: now, pressing: true });
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const now = performance.now();
    const last = lastPointerRef.current;
    if (last) {
      const dt = Math.max(now - last.t, 1);
      const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
      // px/ms → 0..1-ish
      pointerSpeedRef.current = Math.min(1, (dist / dt) * 0.25);
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY, t: now };

    const p = pointersRef.current.get(e.pointerId);
    if (!p) return;
    const r = rendererRef.current;
    if (!r) return;
    const d = r.screenToDisk(e.clientX, e.clientY);
    if (d) {
      p.x = d.x;
      p.y = d.y;
    }
  }, []);

  const endPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => {
      const next = m === "auto" ? "hands" : "auto";
      if (next === "auto") {
        pointersRef.current.clear();
        applyRef.current({ kind: "release" });
      }
      return next;
    });
  }, []);

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      />

      {/* Header: title + description + actions. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          2-D waveguide mesh · Hindustani tabla
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          Tabla Mesh
        </h1>
        <p className="max-w-xl text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
          Strike a real vibrating drumhead — a genuine 2-D digital waveguide membrane, not a
          sample. Rim strikes ring bright, the centre speaks deep, and pressing your palm bends the
          pitch up mid-ring, the tabla <span className="italic">ga</span> glide.
        </p>
        <div className="pointer-events-auto mt-1 flex flex-wrap items-center justify-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start the drum
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleMode}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {mode === "auto" ? "Take over — play by hand" : "Return to autopilot"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>
        {audioError && (
          <p className="pointer-events-auto max-w-md text-sm text-destructive drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            {audioError}
          </p>
        )}
      </div>

      {/* Footer hint. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {mode === "auto"
            ? started
              ? "autopilot — a seeded theka playing itself"
              : "press start, then take over to play by hand"
            : "tap to strike · rim = na, centre = ge · press & hold to bend (ga)"}
        </p>
      </div>

      {/* Design notes modal. */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Tabla Mesh</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The drumhead is a real 2-D digital waveguide mesh (Van Duyne &amp; Smith, 1993): a
              grid of scattering junctions joined by unit delays, run here in its equivalent
              finite-difference form <span className="font-mono">u_tt = c² ∇²u</span> at audio rate
              in an AudioWorklet, with a ScriptProcessor fallback. A circular clamped boundary makes
              the square grid a round head.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A tap injects a Gaussian impulse — near the rim it is narrow (bright upper partials,
              like <span className="italic">na</span>), near the centre it is broad (the deep{" "}
              <span className="italic">ge</span>). Pressing raises the local squared wave speed{" "}
              <span className="font-mono">c²</span> under your palm, lifting the pitch of the still-
              ringing modes: the <span className="italic">ga</span> glide. Full notes and references
              (including C.V. Raman&apos;s work on the harmonic tabla) are in the README.
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
