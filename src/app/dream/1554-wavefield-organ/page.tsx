"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1554-wavefield-organ — "Tilt your phone to steer real physical wave-sources
// across a vibrating plate, and watch (and hear) a genuine 2D wave-equation
// field bloom into Chladni / cymatics interference figures you play with your
// whole body."
//
// INPUT     device tilt (DeviceOrientationEvent gamma/beta) — WASD / arrows on
//           desktop. Tilt DIRECTION steers the six forced wave-sources across
//           the plate; tilt MAGNITUDE sets the propagation speed c.
// OUTPUT    a WebGPU compute point-field (webgpu.ts) as the primary surface,
//           with a first-class Canvas-2D fallback running the SAME wave-PDE on
//           the CPU (wave.ts). Points advect down the gradient of u² so they
//           pool on the nodal lines — the Chladni figure.
// TECHNIQUE a real finite-difference 2D wave equation, d²u/dt² = c²∇²u (damped),
//           on a clamped plate. NOT a log-polar warp, NOT a fragment effect.
// WELD      each source rings ONE just-intonation partial whose loudness is the
//           wave energy at that source — the same scalar that brightens its glow.
//           Tilt→c opens the drone's filter. What you SEE is the sound's envelope.
//
// See README.md for the math, the Chladni / TouchDesigner-POP references, and
// the honest knocks.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  WaveField,
  ParticleCloudCPU,
  makeSources,
  SOURCE_VIS_HZ,
  clamp,
  type SourceState,
  type SimParams,
} from "./wave";
import { WavefieldOrganAudio } from "./audio";
import { initWebGpu, type GpuBackend } from "./webgpu";

const SHADOW_GRID = 140; // CPU field: audio probe on GPU, full sim on fallback
const CPU_PARTICLES = 2400;

type Backend = "pending" | "webgpu" | "canvas2d";

export default function WavefieldOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backend, setBackend] = useState<Backend>("pending");
  const [running, setRunning] = useState(false);
  const [chladni, setChladni] = useState(0.55); // node-pull strength (0..1)
  const [motionDenied, setMotionDenied] = useState(false);
  const [tiltLive, setTiltLive] = useState(false);

  const chladniRef = useRef(chladni);
  chladniRef.current = chladni;
  const runningRef = useRef(false);
  runningRef.current = running;

  const audioRef = useRef<WavefieldOrganAudio | null>(null);
  const tiltRef = useRef({ beta: 0, gamma: 0, active: false });
  const keysRef = useRef<Set<string>>(new Set());
  const reduced = useRef(false);

  // ── Start: audio (needs a gesture) + iOS motion permission ────────────────
  const start = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new WavefieldOrganAudio();
    try {
      await audioRef.current.start();
    } catch {
      /* audio may be blocked; visuals keep running */
    }
    setRunning(true);

    const DOE = (typeof window !== "undefined"
      ? (window.DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<PermissionState>;
        })
      : undefined);
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res !== "granted") setMotionDenied(true);
      } catch {
        setMotionDenied(true);
      }
    }
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.dispose();
    audioRef.current = null;
    setRunning(false);
  }, []);

  // ── device orientation listener (always attached; fires post-permission) ──
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null && e.gamma == null) return;
      tiltRef.current.beta = e.beta ?? 0;
      tiltRef.current.gamma = e.gamma ?? 0;
      if (!tiltRef.current.active) {
        tiltRef.current.active = true;
        setTiltLive(true);
      }
    };
    window.addEventListener("deviceorientation", onOrient, true);
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        keysRef.current.add(k);
        if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("deviceorientation", onOrient, true);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── main effect: backend + render loop (runs from mount; audio joins later)─
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    reduced.current = prefersReducedMotion();

    let raf = 0;
    let disposed = false;
    let gpu: GpuBackend | null = null;

    const sources = makeSources();
    const shadow = new WaveField(SHADOW_GRID, SHADOW_GRID);
    const cloud = new ParticleCloudCPU(CPU_PARTICLES);
    const sourceLum: number[] = new Array(sources.length).fill(0);

    let last = performance.now();
    let frameN = 0;

    // steering: read tilt / keys / idle demo → target velocity for the sources
    const steer = (t: number): { sx: number; sy: number; mag: number } => {
      const keys = keysRef.current;
      let kx = 0;
      let ky = 0;
      if (keys.has("arrowleft") || keys.has("a")) kx -= 1;
      if (keys.has("arrowright") || keys.has("d")) kx += 1;
      if (keys.has("arrowup") || keys.has("w")) ky -= 1;
      if (keys.has("arrowdown") || keys.has("s")) ky += 1;
      if (kx !== 0 || ky !== 0) {
        const m = Math.hypot(kx, ky) || 1;
        return { sx: kx / m, sy: ky / m, mag: 1 };
      }
      if (tiltRef.current.active) {
        const sx = clamp(tiltRef.current.gamma / 40, -1, 1);
        const sy = clamp(tiltRef.current.beta / 40, -1, 1);
        return { sx, sy, mag: Math.min(1, Math.hypot(sx, sy)) };
      }
      // seeded idle auto-demo: a slow Lissajous drift so it is never still
      const sx = 0.7 * Math.sin(t * 0.16) + 0.3 * Math.sin(t * 0.37 + 1.3);
      const sy = 0.7 * Math.sin(t * 0.13 + 2.1) + 0.3 * Math.cos(t * 0.29);
      return { sx: sx * 0.6, sy: sy * 0.6, mag: 0.35 + 0.25 * Math.sin(t * 0.2) };
    };

    const advanceSources = (srcs: SourceState[], dt: number, t: number) => {
      const { sx, sy, mag } = steer(t);
      const motionScale = reduced.current ? 0.4 : 1;
      const speed = 0.16 * motionScale;
      for (let i = 0; i < srcs.length; i++) {
        const s = srcs[i];
        // shared steer + a gentle per-source orbit so the constellation spreads
        const ang = i * 1.7 + t * (0.05 + i * 0.008);
        s.x += (sx * speed + Math.cos(ang) * 0.02) * dt;
        s.y += (sy * speed + Math.sin(ang) * 0.02) * dt;
        s.x = clamp(s.x, 0.09, 0.91);
        s.y = clamp(s.y, 0.09, 0.91);
        // signed sinusoidal forcing — the visual drive (kept < 1 Hz for safety).
        // 0.05 is tuned so the clamped-plate standing wave settles bounded
        // (max |u| ≈ 1.8) rather than running away to resonance.
        s.drive =
          0.05 * Math.sin(2 * Math.PI * SOURCE_VIS_HZ[i % SOURCE_VIS_HZ.length] * t);
      }
      return mag;
    };

    const simParams = (mag: number): SimParams => {
      const motionScale = reduced.current ? 0.5 : 1;
      return {
        c2: 0.1 + 0.16 * mag * motionScale,
        damping: reduced.current ? 0.99 : 0.993,
        chladni: chladniRef.current * (reduced.current ? 0.5 : 1),
        jitter: (reduced.current ? 0.004 : 0.009) * (0.6 + chladniRef.current),
      };
    };

    // smooth luminance drift (well under 3 Hz) — no strobe
    const flickAt = (t: number) => 0.82 + 0.18 * Math.sin(t * 2 * Math.PI * 0.35);

    // step the CPU shadow field (drives audio + source glow on BOTH backends)
    const stepShadow = (p: SimParams) => {
      for (const s of sources) shadow.force(s.x, s.y, 0.02 * SHADOW_GRID, s.drive);
      shadow.step(p);
      for (let i = 0; i < sources.length; i++) {
        const e = shadow.energyAt(sources[i].x, sources[i].y, 2);
        sourceLum[i] = clamp(e * 0.7, 0, 1);
      }
    };

    const driveAudio = (mag: number) => {
      const a = audioRef.current;
      if (!a || !a.running) return;
      a.setSpeed(mag);
      for (let i = 0; i < sources.length; i++) a.setPipe(i, sourceLum[i] * 0.5);
    };

    // ── Canvas-2D renderer (fallback path) ────────────────────────────────────
    let ctx2d: CanvasRenderingContext2D | null = null;
    let fieldCanvas: HTMLCanvasElement | null = null;
    let fieldCtx: CanvasRenderingContext2D | null = null;
    let fieldImg: ImageData | null = null;

    const setupCanvas2d = () => {
      ctx2d = canvas.getContext("2d");
      fieldCanvas = document.createElement("canvas");
      fieldCanvas.width = SHADOW_GRID;
      fieldCanvas.height = SHADOW_GRID;
      fieldCtx = fieldCanvas.getContext("2d");
      if (fieldCtx) fieldImg = fieldCtx.createImageData(SHADOW_GRID, SHADOW_GRID);
    };

    const renderCanvas2d = (flick: number) => {
      if (!ctx2d || !fieldCtx || !fieldImg) return;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const side = Math.min(w, h);
      const offX = (w - side) / 2;
      const offY = (h - side) / 2;

      // field wash → ImageData (deep violet floor → violet at antinodes)
      const data = fieldImg.data;
      const u = shadow.curr;
      for (let i = 0; i < u.length; i++) {
        const wash = Math.min(1, Math.abs(u[i]) * 4) * flick;
        const j = i * 4;
        data[j] = (10 + 129 * wash) | 0; // 0x0a → 0x8b
        data[j + 1] = (5 + 87 * wash) | 0; // 0x05 → 0x5c
        data[j + 2] = (18 + 228 * wash) | 0; // 0x12 → 0xf6
        data[j + 3] = 255;
      }
      fieldCtx.putImageData(fieldImg, 0, 0);

      ctx2d.fillStyle = "#050208";
      ctx2d.fillRect(0, 0, w, h);
      ctx2d.imageSmoothingEnabled = true;
      ctx2d.drawImage(fieldCanvas!, offX, offY, side, side);

      // particle point-field (additive violet)
      ctx2d.globalCompositeOperation = "lighter";
      const pxSize = Math.max(1, side * 0.0026);
      for (let i = 0; i < cloud.count; i++) {
        const lum = Math.min(1, cloud.lum[i] * 6);
        const x = offX + cloud.px[i] * side;
        const y = offY + cloud.py[i] * side;
        const r = Math.floor((87 + 111 * lum) * flick);
        const g = Math.floor((50 + 40 * lum) * flick);
        const b = Math.floor((186 + 60 * lum) * flick);
        ctx2d.fillStyle = `rgba(${r},${g},${b},${0.35 + 0.55 * lum})`;
        ctx2d.fillRect(x - pxSize / 2, y - pxSize / 2, pxSize, pxSize);
      }

      // source glows — same scalar as the audio pipe loudness (the weld)
      for (let i = 0; i < sources.length; i++) {
        const gl = sourceLum[i] * flick;
        if (gl < 0.02) continue;
        const x = offX + sources[i].x * side;
        const y = offY + sources[i].y * side;
        const rad = side * 0.09;
        const grad = ctx2d.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(180,120,255,${0.6 * gl})`);
        grad.addColorStop(1, "rgba(180,120,255,0)");
        ctx2d.fillStyle = grad;
        ctx2d.beginPath();
        ctx2d.arc(x, y, rad, 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.globalCompositeOperation = "source-over";
    };

    // ── the loop ──────────────────────────────────────────────────────────────
    const frame = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      frameN++;

      const mag = advanceSources(sources, dt, t);
      const p = simParams(mag);
      const flick = flickAt(t);

      // CPU shadow always runs (audio envelope + source-glow scalar)
      stepShadow(p);
      driveAudio(mag);

      if (gpu) {
        gpu.frame({
          sources,
          sourceLum,
          c2: p.c2,
          damping: p.damping,
          chladni: p.chladni,
          jitter: p.jitter,
          dt: reduced.current ? dt * 0.6 : dt,
          flick,
          frame: frameN,
        });
      } else {
        // fallback: the shadow field IS the visual; advect + draw its Chladni
        cloud.step(shadow, p, reduced.current ? dt * 0.6 : dt);
        renderCanvas2d(flick);
      }
      raf = requestAnimationFrame(frame);
    };

    // ── init backend then start looping ───────────────────────────────────────
    (async () => {
      let ok: GpuBackend | null = null;
      try {
        ok = await initWebGpu(canvas);
      } catch {
        ok = null;
      }
      if (disposed) {
        ok?.destroy();
        return;
      }
      if (ok) {
        gpu = ok;
        setBackend("webgpu");
      } else {
        setupCanvas2d();
        setBackend("canvas2d");
      }
      last = performance.now();
      raf = requestAnimationFrame(frame);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gpu?.destroy();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const backendLabel =
    backend === "webgpu"
      ? "WebGPU compute"
      : backend === "canvas2d"
        ? "Canvas 2D fallback"
        : "detecting…";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <header className="mb-4">
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Wavefield Organ</h1>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {backendLabel}
            </span>
          </div>
          <p className="text-base text-muted-foreground">
            Tilt your phone to steer six physical wave-sources across a vibrating
            plate — a real 2D wave-equation field blooms into Chladni interference
            you can play with your whole body. Each source rings one
            just-intonation partial; the ripple you see is the sound&apos;s envelope.
          </p>
        </header>

        <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-black">
          <canvas ref={canvasRef} className="h-full w-full touch-none" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          {!running ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start — sound + motion
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Stop
            </button>
          )}

          <label className="flex flex-1 items-center gap-3 text-base text-muted-foreground">
            <span className="whitespace-nowrap">Chladni pull</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={chladni}
              onChange={(e) => setChladni(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </label>
        </div>

        <div className="mt-3 space-y-1 text-base text-muted-foreground">
          <p>
            {tiltLive
              ? "Tilt to steer — lean harder to speed the waves and open the drone."
              : "Steer with tilt on a phone, or WASD / arrow keys here. The plate keeps rippling on its own until you take over."}
          </p>
          {motionDenied && (
            <p className="text-destructive">
              Motion access was denied — keyboard (WASD / arrows) and the idle
              demo still fully drive the plate.
            </p>
          )}
        </div>

        <details className="mt-6 text-base text-muted-foreground">
          <summary className="cursor-pointer text-foreground">Read the design notes</summary>
          <div className="mt-2 space-y-2">
            <p>
              A genuine finite-difference solver for d²u/dt² = c²∇²u (damped) runs
              on a clamped plate — WebGPU compute when available, the identical
              model on the CPU otherwise. Continuously-forced sources build
              standing waves; the point-field advects down the gradient of the
              wave energy so the particles pool on the nodal lines, exactly as
              sand does on Ernst Chladni&apos;s plates.
            </p>
            <p>
              Lineage: Chladni / cymatics, the 2D wave equation, and the GPU
              point-based wavefields of TouchDesigner&apos;s POP (Point Operator)
              components (2025). This is a true PDE, not a log-polar / breathing
              warp. Full notes in the README.
            </p>
          </div>
        </details>
      </div>
      <PrototypeNav slugs={["1554-wavefield-organ"]} />
    </main>
  );
}
