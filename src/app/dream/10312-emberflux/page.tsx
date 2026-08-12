"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10312 · Emberflux — tilt a molten surface and conduct where it boils.
//
//   ONE QUESTION
//   What if you could tilt a warm molten surface and conduct where it BOILS — a
//   real Rayleigh–Bénard convection layer that self-organizes into overturning
//   cells, reorganizes over time, and SINGS its own overturning?
//
//   A true 2D Boussinesq thermal fluid. Heat enters from the hot bottom
//   boundary; buoyant hot fluid rises in bright plumes, cool fluid sinks in dark
//   lanes; above the critical Rayleigh number the layer self-organizes into a
//   honeycomb of convection cells. Tilt is the conductor — it rotates gravity so
//   the plumes lean and the boiling drifts toward the low side.
//
//   SUBSTRATE  WebGPU compute (storage-buffer ping-pong) → WebGL2 fragment-shader
//   ping-pong → warm CSS notice with the audio drone still playing. No Canvas2D.
//
//   REFS  Henri Bénard (1900); Lord Rayleigh, "On convection currents in a
//   horizontal layer of fluid," Phil. Mag. 1916; Stein & Nordlund, "Simulations
//   of Solar Granulation I," ApJ 1998 — the Sun's surface IS convection.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mulberry32 } from "./rng";
import { makeWebglBackend } from "./webgl";
import { makeWebgpuBackend } from "./webgpu";
import { EmberAudio } from "./audio";
import type { Backend, SimStep } from "./sim";

type Phase = "idle" | "running" | "error";
type Tier = "webgpu" | "webgl";

export default function EmberfluxPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [tier, setTier] = useState<Tier | null>(null);
  const [conducting, setConducting] = useState<"tilt" | "auto">("auto");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backendRef = useRef<Backend | null>(null);
  const audioRef = useRef<EmberAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const reducedRef = useRef(false);
  const startTsRef = useRef(0);
  const lastTsRef = useRef(0);

  // Tilt (device orientation) — smoothed gravity lean.
  const tiltActiveRef = useRef(false);
  const tiltLastRef = useRef(0);
  const tiltAngleRef = useRef(0); // radians, smoothed
  const orientHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  // Auto-conductor (seeded) — drives gravity + buoyancy so it boils on load.
  const autoRngRef = useRef<() => number>(mulberry32(0x10312));
  const autoPhaseRef = useRef<number[]>([]);

  // Overturn detection state (sized to the probe grid on first read).
  const prevVRef = useRef<Float32Array | null>(null);
  const coolRef = useRef<Float32Array | null>(null);
  const uiTickRef = useRef(0);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (orientHandlerRef.current) {
      window.removeEventListener("deviceorientation", orientHandlerRef.current);
      orientHandlerRef.current = null;
    }
    if (backendRef.current) {
      backendRef.current.destroy();
      backendRef.current = null;
    }
    if (audioRef.current) {
      void audioRef.current.stop();
      audioRef.current = null;
    }
    const c = ctxRef.current;
    ctxRef.current = null;
    if (c && c.state !== "closed") {
      window.setTimeout(() => { c.close().catch(() => {}); }, 600);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const onOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma == null && e.beta == null) return;
    tiltActiveRef.current = true;
    tiltLastRef.current = performance.now();
    // gamma = left/right tilt (−90..90); lean gravity toward the low side.
    const g = (e.gamma ?? 0) * (Math.PI / 180);
    const clamped = Math.max(-0.7, Math.min(0.7, g));
    tiltAngleRef.current += (clamped - tiltAngleRef.current) * 0.15;
  }, []);

  const start = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);
    setNotice(null);

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.round(canvas.offsetWidth * dpr));
    canvas.height = Math.max(2, Math.round(canvas.offsetHeight * dpr));

    // Audio context — created inside the gesture (autoplay policy).
    let audioCtx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AC();
      if (audioCtx.state === "suspended") await audioCtx.resume();
    } catch {
      setError("Web Audio is unavailable in this browser.");
      return;
    }
    ctxRef.current = audioCtx;
    audioRef.current = new EmberAudio(audioCtx, mulberry32(0x10312 ^ 0x5eed));
    audioRef.current.start();

    // iOS 13+ requires an explicit permission request from the tap handler.
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setNotice("Motion access denied — auto-conducting instead. Tilt won't steer.");
        }
      }
    } catch {
      /* not iOS, or already granted */
    }
    orientHandlerRef.current = onOrientation;
    window.addEventListener("deviceorientation", onOrientation);

    // Substrate ladder: WebGPU compute → WebGL2 → CSS notice (drone stays up).
    let backend: Backend | null = null;
    try {
      backend = await makeWebgpuBackend(canvas, mulberry32(0x10312));
    } catch {
      backend = null;
    }
    if (!backend) {
      try {
        backend = makeWebglBackend(canvas, mulberry32(0x10312));
      } catch {
        setPhase("error");
        setError(
          "Neither WebGPU nor WebGL2 could start a float simulation on this device. The convective drone is still playing.",
        );
        return;
      }
    }
    backendRef.current = backend;
    setTier(backend.kind);

    // Seed auto-conductor drift phases.
    const r = autoRngRef.current;
    autoPhaseRef.current = [r() * 6.283, r() * 6.283, r() * 6.283, r() * 6.283];

    startTsRef.current = performance.now();
    lastTsRef.current = startTsRef.current;
    setPhase("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [onOrientation]);

  const loop = useCallback((ts: number) => {
    const be = backendRef.current;
    const audio = audioRef.current;
    if (!be) return;
    const elapsed = (ts - startTsRef.current) / 1000;
    lastTsRef.current = ts;
    const reduced = reducedRef.current;

    // Tilt is active only if we've had a recent orientation event.
    const tiltFresh = tiltActiveRef.current && ts - tiltLastRef.current < 1500;

    // ── Gravity + buoyancy: tilt if present, else seeded auto-conductor ──────
    const ph = autoPhaseRef.current;
    const slow = reduced ? 0.4 : 1.0;
    let angle: number;
    let buoy: number;
    if (tiltFresh) {
      angle = tiltAngleRef.current;
      buoy = 1.85;
    } else {
      // Seeded slow drift so the layer forms and REORGANIZES with no input.
      angle =
        0.42 * Math.sin(elapsed * 0.11 * slow + (ph[0] ?? 0)) +
        0.22 * Math.sin(elapsed * 0.047 * slow + (ph[1] ?? 0));
      buoy =
        1.75 +
        0.45 * Math.sin(elapsed * 0.06 * slow + (ph[2] ?? 0)) +
        0.2 * Math.sin(elapsed * 0.021 * slow + (ph[3] ?? 0));
    }
    const gx = Math.sin(angle);
    const gy = -Math.cos(angle);

    const step: SimStep = {
      gx,
      gy,
      buoy,
      dt: reduced ? 0.62 : 1.0,
    };
    be.step(step);

    // ── Audio from the probe: vigor → drone, overturns → chimes ──────────────
    const pg = be.probe();
    if (pg && audio) {
      const n = pg.cols * pg.rows;
      if (!prevVRef.current || prevVRef.current.length !== n) {
        prevVRef.current = new Float32Array(n);
        coolRef.current = new Float32Array(n);
      }
      const prevV = prevVRef.current;
      const cool = coolRef.current!;
      let ke = 0;
      let strikes = 0;
      const THR = 0.09;
      for (let j = 0; j < n; j++) {
        const t = pg.data[j * 3];
        const v = pg.data[j * 3 + 1];
        const sp = pg.data[j * 3 + 2];
        ke += sp * sp;
        // Rising-edge overturn: a warm plume tip punches upward past THR.
        if (
          strikes < 3 &&
          v > THR &&
          prevV[j] <= THR &&
          t > 0.5 &&
          elapsed - cool[j] > 0.45
        ) {
          const col = j % pg.cols;
          const pan = (col / (pg.cols - 1)) * 2 - 1;
          const intensity = Math.min(1, Math.max(0.3, v * 4)) * Math.min(1, t);
          audio.strike(pan, intensity);
          cool[j] = elapsed;
          strikes += 1;
        }
        prevV[j] = v;
      }
      const vigor = Math.min(1, (ke / n) * 6);
      audio.setVigor(vigor);
    }

    // Occasionally refresh the conducting badge without re-rendering each frame.
    uiTickRef.current += 1;
    if (uiTickRef.current % 20 === 0) {
      setConducting(tiltFresh ? "tilt" : "auto");
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const tierLabel = tier === "webgpu" ? "webgpu · compute" : "webgl2 · ping-pong";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Emberflux
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Tilt a warm molten surface and conduct where it boils — a real
            Rayleigh–Bénard convection layer that self-organizes into overturning
            cells, reorganizes over time, and sings its own overturning.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
      </div>

      {/* Idle / start */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <p className="max-w-md text-base text-muted-foreground">
            Heat rises from the bottom in bright plumes; cool fluid sinks in dark
            lanes; the layer settles into a honeycomb of cells and keeps
            reorganizing. Tilt your phone to lean gravity and drift the boil. No
            tilt sensor? A seeded auto-conductor drives it for you.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
          <p className="max-w-md text-sm text-muted-foreground">
            Best with headphones. A low convective drone, inharmonic overturn
            chimes — slow glow, no flashing.
          </p>
          {error && <p className="max-w-sm text-sm text-destructive">{error}</p>}
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {tierLabel}
          </div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            {conducting === "tilt" ? "tilt — conducting" : "no tilt — auto-conducting"}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
          <button
            onClick={teardown}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="max-w-md text-base text-destructive">{error}</p>
          <p className="max-w-md text-sm text-muted-foreground">
            This piece needs WebGPU or WebGL2 with float render targets to run the
            fluid.
          </p>
        </div>
      )}

      {phase === "running" && notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 mx-6 max-w-xl">
          <p className="text-sm text-destructive">{notice}</p>
        </div>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              how it works
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              A convection layer you conduct
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is a true 2D Boussinesq Rayleigh–Bénard fluid in
                vorticity–streamfunction form. Temperature and vorticity are
                advected by the flow, diffuse slightly, and the buoyancy source
                β·(g × ∇T) injects vorticity wherever hot fluid sits under cool.
                A Poisson solve (Jacobi iterations) recovers the streamfunction ψ,
                and velocity is read back as u = ∂ψ/∂y, v = −∂ψ/∂x — divergence
                free by construction. A hot bottom row and cold top row drive the
                layer past its critical Rayleigh number, so overturning cells
                emerge and keep reorganizing rather than freezing.
              </p>
              <p>
                Tilt is the conductor: device orientation rotates the gravity
                vector, so the plumes lean and the boil drifts toward the low
                side. With no tilt sensor, a seeded auto-conductor drifts gravity
                and buoyancy so the cells form within about a second and never
                stop rearranging.
              </p>
              <p>
                The layer sings its own overturning. A warm convective drone
                (two inharmonic oscillators plus a brown-noise boil bed) tracks
                total kinetic energy; when a plume tip punches upward through a
                cell, a struck-metal chime rings on inharmonic free-bar partials
                (1 : 2.76 : 5.40 : 8.93, octave-stretched and per-hit detuned),
                panned by the cell&apos;s position. Deliberately not a scale.
              </p>
              <p>
                Substrate: WebGPU compute is primary (storage-buffer ping-pong),
                degrading to a WebGL2 fragment-shader ping-pong that runs the
                identical math on float textures, and finally to a warm notice
                with the drone still playing. Never Canvas2D.
              </p>
              <p>
                References: Henri Bénard&apos;s 1900 cellular convection
                experiments; Lord Rayleigh, &ldquo;On convection currents in a
                horizontal layer of fluid,&rdquo; Phil. Mag. 1916; Stein &amp;
                Nordlund, &ldquo;Simulations of Solar Granulation I,&rdquo; ApJ
                1998 — the Sun&apos;s surface is convection you can watch. Full
                write-up in the README.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10312-emberflux"]} />
    </div>
  );
}
