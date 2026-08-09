"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 8904 · Billow
//
//   ONE QUESTION
//   What if a hanging cloth were an instrument — you make it billow, and a fold
//   sweeping across the fabric is a melody you both SEE and HEAR?
//
//   A slack, gravity-loaded rectangular cloth is pinned along its top edge and
//   simulated as a mass-spring sheet (Verlet + constraint relaxation; structural
//   + shear + bend springs). Tilt the device — or drag — to push the fabric so it
//   billows, swings, and folds. Each region's local STRAIN-RATE × SPEED strikes a
//   spectral-bell modal voice, so a fold rippling across sweeps energy across the
//   region-voices = an audible arpeggio. The sheet is rendered as a LIT 3D SURFACE
//   on WebGPU, with a Canvas2D shaded-quad fallback running the identical model.
//
//   A seeded auto-performer (mulberry32 0x8904) gusts the cloth on its own so the
//   travelling fold is legible with zero interaction, even muted. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mulberry32 } from "./prng";
import { Cloth, REGX } from "./cloth";
import { makeRenderer, Renderer } from "./render";
import { BellField } from "./audio";
import { Performer, userForces } from "./performer";

interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export default function BillowPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rngRef = useRef<(() => number) | null>(null);
  const clothRef = useRef<Cloth | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const performerRef = useRef<Performer | null>(null);
  const bellRef = useRef<BellField | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // live user-control state (read inside the RAF loop, never triggers re-render)
  const userWind = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const userUntil = useRef<number>(0); // performance.now()/1000 until which user drives
  const reducedRef = useRef<boolean>(false);
  const baseTiltRef = useRef<{ b: number; g: number } | null>(null);

  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"webgpu" | "canvas2d" | "pending">("pending");
  const [notesOpen, setNotesOpen] = useState(false);
  const [tiltNote, setTiltNote] = useState<string | null>(null);

  // ── input: pointer drag maps position → aimable wind vector ─────────────────
  const applyPointer = useCallback((clientX: number, clientY: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const nx = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (clientY - (r.top + r.height / 2)) / (r.height / 2);
    userWind.current = { x: nx * 3.0, z: -ny * 2.6 };
    userUntil.current = performance.now() / 1000 + 3.5;
  }, []);

  // ── input: device tilt → wind vector (fires only past a small threshold) ────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const b = e.beta ?? 0;
    const g = e.gamma ?? 0;
    if (!baseTiltRef.current) baseTiltRef.current = { b, g };
    const db = b - baseTiltRef.current.b;
    const dg = g - baseTiltRef.current.g;
    if (Math.abs(db) < 3 && Math.abs(dg) < 3) return; // resting → let auto play
    userWind.current = {
      x: Math.max(-3.2, Math.min(3.2, dg / 14)),
      z: Math.max(-2.8, Math.min(2.8, db / 16)),
    };
    userUntil.current = performance.now() / 1000 + 3.5;
  }, []);

  // ── mount: build sim + renderer, run the loop (visuals run pre-Begin too) ───
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rng = mulberry32(0x8904);
    rngRef.current = rng;
    const cloth = new Cloth(rng);
    clothRef.current = cloth;
    performerRef.current = new Performer(rng);

    let disposed = false;
    const canvas = canvasRef.current!;

    const sizeTo = () => {
      const r = rendererRef.current;
      if (!r || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      r.resize(rect.width, rect.height, dpr);
    };

    const ro = new ResizeObserver(() => sizeTo());

    makeRenderer(canvas).then((renderer) => {
      if (disposed) {
        renderer.destroy();
        return;
      }
      rendererRef.current = renderer;
      setMode(renderer.mode);
      if (renderer.mode === "canvas2d") {
        setTiltNote("WebGPU unavailable — Canvas fallback active (sound unchanged).");
      }
      if (canvas.parentElement) ro.observe(canvas.parentElement);
      sizeTo();
    });

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const r = rendererRef.current;
      if (!r) return;
      const nowSec = now / 1000;
      let dt = lastRef.current ? (now - lastRef.current) / 1000 : 1 / 60;
      lastRef.current = now;
      dt = Math.max(1 / 120, Math.min(1 / 45, dt));

      const forces =
        nowSec < userUntil.current
          ? userForces(userWind.current.x, userWind.current.z)
          : performerRef.current!.step(dt, nowSec, reducedRef.current);

      cloth.step(dt, forces);
      bellRef.current?.update(cloth.excite);
      r.render(cloth.pos);
    };
    rafRef.current = requestAnimationFrame(frame);

    window.addEventListener("deviceorientation", onOrient);

    return () => {
      disposed = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("deviceorientation", onOrient);
      rendererRef.current?.destroy();
      rendererRef.current = null;
      bellRef.current?.close();
      bellRef.current = null;
    };
  }, [onOrient]);

  // ── Begin: start audio (needs a gesture) + request iOS tilt permission ──────
  const runBegin = useCallback(async () => {
    if (!bellRef.current && rngRef.current) {
      const bell = new BellField(rngRef.current);
      bellRef.current = bell;
      await bell.resume();
    } else {
      await bellRef.current?.resume();
    }
    const DOE = (window as unknown as { DeviceOrientationEvent?: DeviceOrientationEventStatic })
      .DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") setTiltNote("Tilt not permitted — drag the cloth instead.");
      } catch {
        setTiltNote("Tilt not supported — drag the cloth instead.");
      }
    }
    setStarted(true);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* the lit cloth */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            applyPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) applyPointer(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            userUntil.current = performance.now() / 1000 + 3.5;
          }}
        />
      </div>

      {/* top-left meta / status */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 flex flex-col gap-1">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          8904 · Billow
        </span>
        {mode !== "pending" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            {mode === "webgpu" ? "WebGPU surface" : "Canvas2D surface"} · {REGX}×4 voices
          </span>
        )}
        {tiltNote && <span className="max-w-xs text-sm text-destructive">{tiltNote}</span>}
      </div>

      {/* bottom-right affordances */}
      <div className="absolute bottom-16 right-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setNotesOpen(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {started && (
        <div className="pointer-events-none absolute bottom-16 left-4 z-20 max-w-xs">
          <p className="text-sm text-muted-foreground">
            Tilt your device — or drag the cloth — to raise the wind. Let go and the
            breeze takes over again.
          </p>
        </div>
      )}

      {/* Begin overlay (needed to start AudioContext) */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 flex max-w-lg flex-col items-start gap-4 rounded-lg border border-border bg-background p-6 shadow-lg">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              A cloth you can play
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Billow
            </h1>
            <p className="text-base text-muted-foreground">
              A hanging sheet, pinned along its top and left to drape. Raise the wind
              and a fold sweeps across the fabric — the fold you SEE is the melody you
              HEAR, region by region, like light running along cloth. It plays itself
              until you take the wind.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={runBegin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
              <button
                onClick={() => setNotesOpen(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The cloth is a 32×24 mass-spring lattice (Provot 1995): structural,
                shear, and bend springs, advanced by Verlet integration and a handful
                of constraint-relaxation passes. The top edge is pinned; everything
                below is slack and gravity-loaded, so wind makes it billow and fold.
              </p>
              <p>
                It is partitioned into a 6×4 grid of regions. Each frame we measure a
                region&apos;s mean spring strain, how fast that strain is changing, and
                its vertex speed. A rising fold crosses region after region, and each
                crossing STRIKES a spectral-bell voice — a bank of inharmonic partials
                with a fast attack and long decay. A louder gust rings more partials,
                brighter. No drone: only struck bells.
              </p>
              <p>
                The sheet is drawn as a lit 3D surface. WebGPU renders it as a shaded
                triangle mesh with per-vertex normals; if WebGPU is missing, a Canvas2D
                painter&apos;s-algorithm renderer draws the same mesh as shaded quads.
                Sim and sound are identical on both paths.
              </p>
              <p>
                References: arXiv:2507.11794 &quot;Real-Time Cloth Simulation Using
                WebGPU&quot; (2026); Provot 1995, mass-spring cloth with deformation
                constraints; modal / spectral-bell synthesis.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8904-billow"]} />
    </main>
  );
}
