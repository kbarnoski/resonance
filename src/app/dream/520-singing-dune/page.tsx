"use client";

/**
 * 520-singing-dune — page.tsx
 *
 * One presence. One dune. You tip the world; the sand slumps, avalanches,
 * re-settles forever. The dune's internal motion IS the sound.
 *
 * Input:   DeviceOrientation (mobile tilt) → gravity vector
 *          Arrow keys / pointer drag → gravity fallback on desktop
 * Sim:     WebGPU MLS-MPM (gpu.ts) if available; CPU MLS-MPM (sim.ts) fallback
 * Audio:   Booming-dune granular drone (audio.ts) — requires user gesture
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { buildDuneAudio, type DuneAudio, type DuneAudioState } from "./audio";
import {
  initParticles,
  stepMPM,
  type Particle,
} from "./sim";
import {
  buildGpuDune,
  stepGpuDune,
  readGpuStats,
  type GpuDune,
} from "./gpu";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";

interface GravityRef {
  x: number; // right is positive
  y: number; // up is positive (in physics space)
}

// ── Desert colour helpers (CPU canvas rendering) ──────────────────────────────

function particleColor(py: number, speed: number): string {
  // py: 0=bottom, 1=top
  // Desert dusk: deep umber → amber → pale gold
  const h01 = Math.max(0, Math.min(1, py * 1.4 - 0.1));
  const lowR = 72, lowG = 38, lowB = 18;
  const midR = 180, midG = 100, midB = 30;
  const hiR = 240, hiG = 200, hiB = 120;

  let r, g, b;
  if (h01 < 0.5) {
    const t = h01 * 2;
    r = lowR + (midR - lowR) * t;
    g = lowG + (midG - lowG) * t;
    b = lowB + (midB - lowB) * t;
  } else {
    const t = (h01 - 0.5) * 2;
    r = midR + (hiR - midR) * t;
    g = midG + (hiG - midG) * t;
    b = midB + (hiB - midB) * t;
  }

  // Highlight during avalanche
  const s = Math.min(1, speed * 2);
  r = r + (250 - r) * s * 0.5;
  g = g + (235 - g) * s * 0.5;
  b = b + (200 - b) * s * 0.5;

  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SingingDunePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [orientErr, setOrientErr] = useState<string | null>(null);
  const [hasGpu, setHasGpu] = useState<boolean | null>(null); // null = unknown
  const [tiltHint, setTiltHint] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Gravity direction (in sim space: x=right, y=up means sand falls down)
  const gravRef = useRef<GravityRef>({ x: 0, y: -1 });

  const rafRef = useRef<number>(0);

  // Pointer drag for gravity control
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // ── Gravity from device orientation ────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta  = e.beta  ?? 0;
      const gx = Math.sin((gamma * Math.PI) / 180);
      const gy = -Math.cos((beta * Math.PI) / 180);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 0.01) {
        gravRef.current = { x: gx / mag, y: gy / mag };
      }
      setTiltHint(false);
    };

    if (!window.DeviceOrientationEvent) {
      setTiltHint(true);
      return;
    }

    // Check if DeviceOrientationEvent needs permission (iOS 13+)
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };

    if (typeof DOE.requestPermission === "function") {
      DOE.requestPermission()
        .then((result) => {
          if (result === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, { passive: true });
          } else {
            setOrientErr("Orientation permission denied — use arrow keys or drag to tilt.");
          }
        })
        .catch(() => {
          setOrientErr("Orientation unavailable — use arrow keys or drag to tilt.");
        });
    } else {
      window.addEventListener("deviceorientation", handleOrientation, { passive: true });
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
    };
  }, [phase]);

  // ── Arrow-key gravity fallback ──────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;

    const keysHeld = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      keysHeld.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.key);
    };

    const keyTick = () => {
      let gx = gravRef.current.x;
      let gy = gravRef.current.y;

      const STEP = 0.06;
      if (keysHeld.has("ArrowLeft"))  gx = Math.max(-1, gx - STEP);
      if (keysHeld.has("ArrowRight")) gx = Math.min(1, gx + STEP);
      if (keysHeld.has("ArrowDown"))  gy = Math.max(-1, gy - STEP);
      if (keysHeld.has("ArrowUp"))    gy = Math.min(1, gy + STEP);

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 0.01) {
        gravRef.current = { x: gx / mag, y: gy / mag };
      }
    };

    const interval = setInterval(keyTick, 16);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase]);

  // ── Pointer drag gravity ────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current = { x: e.clientX, y: e.clientY };

    // Map drag delta to gravity nudge:
    // drag right (+dx) → gravity pulls right (+gx)
    // drag down (+dy) → gravity pulls down (screen-down = physics -y, so subtract)
    let gx = gravRef.current.x + dx * 0.012;
    let gy = gravRef.current.y - dy * 0.012;

    // Clamp and normalise
    gx = Math.max(-1, Math.min(1, gx));
    gy = Math.max(-1, Math.min(1, gy));
    const mag = Math.sqrt(gx * gx + gy * gy);
    if (mag > 0.01) {
      gravRef.current = { x: gx / mag, y: gy / mag };
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  // ── Main simulation + render loop ──────────────────────────────────────────

  useEffect(() => {
    if (phase !== "running") return;

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    // Alias to an explicitly-typed const so TS keeps the non-null narrowing
    // inside the nested tick()/initGpu() closures.
    const canvas: HTMLCanvasElement = canvasEl;

    let cancelled = false;

    // Check WebGPU availability synchronously before touching the canvas context
    const gpuAvailable = typeof navigator !== "undefined" && !!navigator.gpu;

    let gpuDune: GpuDune | null = null;
    let cpuParticles: Particle[] | null = null;
    let usingGpu = false;

    // Resize handler
    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);

    // Audio (created inside user-gesture chain: user clicked "Wake the dune")
    let audio: DuneAudio | null = null;
    try {
      audio = buildDuneAudio();
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : "Audio unavailable"
      );
    }

    // Pending GPU stats promise (avoid concurrent reads)
    let gpuStatsPending = false;
    let pendingKE = 0;
    let pendingShear = 0;
    let pendingAvalanche = 0;

    // Decide path: CPU if no WebGPU; GPU otherwise.
    // We must not call getContext("2d") AND getContext("webgpu") on the same canvas.
    if (!gpuAvailable) {
      // CPU-only path: use canvas 2D
      cpuParticles = initParticles();
      setHasGpu(false);
    }

    async function initGpu() {
      if (!gpuAvailable) return;
      try {
        gpuDune = await buildGpuDune(canvas);
        usingGpu = true;
        setHasGpu(true);
      } catch {
        // GPU init failed — show error state, audio still works
        setHasGpu(false);
      }
    }

    function drawCpuFrame(
      ctx2d: CanvasRenderingContext2D,
      particles: Particle[],
      W: number,
      H: number
    ) {
      // Dark desert-night sky
      ctx2d.fillStyle = "#0a0704";
      ctx2d.fillRect(0, 0, W, H);

      // Draw each grain as a small filled circle
      const r = Math.max(1.5, Math.min(3.5, W / 420));

      for (const p of particles) {
        const px = p.x * W;
        const py = (1 - p.y) * H; // flip y
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        ctx2d.fillStyle = particleColor(p.y, speed);
        ctx2d.beginPath();
        ctx2d.arc(px, py, r, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }

    let audioState: DuneAudioState = { kineticEnergy: 0, shearRate: 0, avalanchePulse: 0 };
    let frameCount = 0;

    function tick() {
      if (cancelled) return;

      const grav = gravRef.current;
      const simGravX = grav.x;
      const simGravY = grav.y;

      if (usingGpu && gpuDune) {
        // GPU path
        const W = canvas.width;
        const H = canvas.height;
        stepGpuDune(gpuDune, simGravX, simGravY, W, H);

        // Async readback for audio every 4 frames (fire-and-forget)
        if (!gpuStatsPending && frameCount % 4 === 0) {
          gpuStatsPending = true;
          const capturedGpu = gpuDune;
          readGpuStats(capturedGpu)
            .then((stats) => {
              pendingKE = stats[0];
              pendingShear = stats[1];
              pendingAvalanche = stats[2];
              gpuStatsPending = false;
            })
            .catch(() => { gpuStatsPending = false; });
        }

        audioState = {
          kineticEnergy: pendingKE,
          shearRate: pendingShear,
          avalanchePulse: pendingAvalanche,
        };
      } else if (cpuParticles) {
        // CPU path
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          const stats = stepMPM(cpuParticles, simGravX, simGravY, 4);
          audioState = stats;

          const W = canvas.offsetWidth;
          const H = canvas.offsetHeight;
          ctx2d.setTransform(1, 0, 0, 1, 0, 0);
          drawCpuFrame(ctx2d, cpuParticles, W, H);
        }
      }

      // Update audio
      if (audio) {
        audio.update(audioState);
      }

      frameCount++;
      rafRef.current = requestAnimationFrame(tick);
    }

    // Start GPU init (non-blocking); CPU fallback runs immediately
    initGpu().catch(() => { /* already handled inside initGpu */ });

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();

      if (audio) {
        audio.dispose();
      }
      if (gpuDune) {
        gpuDune.device.destroy();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Start handler ──────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    setPhase("running");
  }, []);

  const handleStop = useCallback(() => {
    setPhase("idle");
    setHasGpu(null);
    setOrientErr(null);
    setTiltHint(false);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {/* Canvas — always mounted for smooth transition */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{
          background: "#0a0704",
          touchAction: "none",
          cursor: phase === "running" ? "grab" : "default",
        }}
        onPointerDown={phase === "running" ? handlePointerDown : undefined}
        onPointerMove={phase === "running" ? handlePointerMove : undefined}
        onPointerUp={phase === "running" ? handlePointerUp : undefined}
        onPointerLeave={phase === "running" ? handlePointerUp : undefined}
      />

      {/* ── Idle / start screen ─────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          <div className="pointer-events-auto max-w-sm w-full space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-2xl font-serif text-white/95 tracking-wide">
                Singing Dune
              </h1>
              <p className="text-base text-white/75 leading-relaxed">
                One living dune — under its own gravity. Tip the world; the sand
                avalanches and re-settles, forever. Its motion is the sound.
              </p>
            </div>

            {/* Primary action */}
            <button
              onClick={handleStart}
              className="w-full min-h-[52px] px-6 py-3 rounded-lg
                         bg-amber-800/30 border border-amber-600/40
                         text-amber-200 text-base font-medium
                         hover:bg-amber-700/35 hover:border-amber-500/60
                         transition-colors"
            >
              Wake the dune
            </button>

            {/* Controls hint */}
            <p className="text-sm text-white/55 leading-relaxed">
              Tilt your device · or drag · or arrow keys
            </p>

            {/* Design notes link */}
            <a
              href="/dream/520-singing-dune/README.md"
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs text-white/40 hover:text-white/60 transition-colors"
            >
              Read the design notes ↗
            </a>

            <Link
              href="/dream"
              className="block text-xs text-white/35 hover:text-white/55 transition-colors"
            >
              ← dream lab
            </Link>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <>
          {/* Top-right controls */}
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2 select-none">
            {/* Sim mode badge */}
            {hasGpu !== null && (
              <span className="text-xs text-white/55 font-mono tracking-wider">
                {hasGpu ? "WebGPU · 6k grains" : "CPU · 2k grains"}
              </span>
            )}

            {/* Stop */}
            <button
              onClick={handleStop}
              className="min-h-[44px] px-4 py-2.5 text-xs text-white/55
                         border border-white/20 rounded
                         hover:text-white hover:border-white/50 transition-colors"
            >
              stop
            </button>

            {/* Back */}
            <Link
              href="/dream"
              className="text-xs text-white/35 hover:text-white/55 transition-colors"
            >
              ← back
            </Link>

            {/* Design notes */}
            <a
              href="/dream/520-singing-dune/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-white/30 hover:text-white/55 transition-colors"
            >
              design notes ↗
            </a>
          </div>

          {/* Bottom-left status */}
          <div className="absolute bottom-4 left-4 space-y-1 pointer-events-none select-none">
            {audioError && (
              <p className="text-xs text-rose-300">Audio unavailable: {audioError}</p>
            )}
            {orientErr && (
              <p className="text-xs text-rose-300">{orientErr}</p>
            )}
            {tiltHint && (
              <p className="text-xs text-amber-300/95">
                Drag or use arrow keys to tilt the dune
              </p>
            )}
          </div>

          {/* Gravity indicator (subtle arrow in bottom-right) */}
          <GravityIndicator gravRef={gravRef} />
        </>
      )}
    </div>
  );
}

// ── Gravity indicator ─────────────────────────────────────────────────────────

function GravityIndicator({ gravRef }: { gravRef: React.MutableRefObject<GravityRef> }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const grav = gravRef.current;
      if (!grav) return;
      const svg = svgRef.current;
      if (!svg) return;

      const line = svg.querySelector("line");
      if (!line) return;

      const cx = 20, cy = 20, len = 14;
      // grav.y is positive = up in physics = visually up on screen
      const ex = cx + grav.x * len;
      const ey = cy - grav.y * len; // flip y for screen coords

      line.setAttribute("x1", String(cx));
      line.setAttribute("y1", String(cy));
      line.setAttribute("x2", String(ex));
      line.setAttribute("y2", String(ey));

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [gravRef]);

  return (
    <div className="absolute bottom-4 right-4 pointer-events-none select-none opacity-50">
      <svg ref={svgRef} width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(200,150,60,0.3)" strokeWidth="1" />
        <line
          x1="20" y1="20" x2="20" y2="34"
          stroke="rgba(200,150,60,0.7)"
          strokeWidth="1.5"
          strokeLinecap="round"
          markerEnd="url(#arrow)"
        />
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(200,150,60,0.7)" />
          </marker>
        </defs>
      </svg>
      <p className="text-xs text-white/30 text-center mt-0.5 font-mono">g</p>
    </div>
  );
}
