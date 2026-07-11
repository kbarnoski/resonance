"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createFluidSim, type FluidSim } from "./fluid";
import { createAudioEngine, type AudioEngine } from "./audio";

// ── COLOR SWATCHES ─────────────────────────────────────────────────────────────
// 5 saturated hues — no reading required, color IS the language.

interface SwatchDef {
  label: string;
  icon: string;
  hex: string;      // display hex for swatch background
  r: number;        // 0..1 dye injection
  g: number;
  b: number;
  hue: number;      // 0..360 for audio engine
}

const SWATCHES: SwatchDef[] = [
  { label: "Violet",  icon: "🟣", hex: "#a78bfa", r: 0.67, g: 0.55, b: 0.98, hue: 263 },
  { label: "Teal",    icon: "🩵", hex: "#2dd4bf", r: 0.18, g: 0.83, b: 0.75, hue: 174 },
  { label: "Amber",   icon: "🟠", hex: "#fbbf24", r: 0.98, g: 0.75, b: 0.14, hue:  43 },
  { label: "Rose",    icon: "🌸", hex: "#fb7185", r: 0.98, g: 0.44, b: 0.52, hue: 352 },
  { label: "Cyan",    icon: "💙", hex: "#67e8f9", r: 0.40, g: 0.91, b: 0.98, hue: 187 },
];

// ── AUTO-DEMO SCRIPT ──────────────────────────────────────────────────────────

interface DemoStroke {
  swatchIdx: number;
  // start/end in 0..1 fractional canvas coords
  x0: number; y0: number;
  x1: number; y1: number;
  steps: number;
}

const DEMO_STROKES: DemoStroke[] = [
  { swatchIdx: 0, x0: 0.15, y0: 0.30, x1: 0.45, y1: 0.55, steps: 18 },
  { swatchIdx: 2, x0: 0.80, y0: 0.20, x1: 0.55, y1: 0.50, steps: 16 },
  { swatchIdx: 1, x0: 0.50, y0: 0.65, x1: 0.20, y1: 0.45, steps: 14 },
  { swatchIdx: 3, x0: 0.70, y0: 0.70, x1: 0.85, y1: 0.35, steps: 15 },
  { swatchIdx: 4, x0: 0.30, y0: 0.75, x1: 0.65, y1: 0.40, steps: 17 },
];

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<FluidSim | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Pointer tracking: pointerId → last position
  const pointerMapRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  // Active swatch (ref for rAF / event handlers, state for React re-render)
  const activeSwatchRef = useRef<number>(0);
  const [activeSwatch, setActiveSwatch] = useState<number>(0);

  const [started, setStarted] = useState(false);
  const [showTapPrompt, setShowTapPrompt] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const hasInteracted = useRef(false);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoRunningRef = useRef(false);

  // ── Sim step loop ────────────────────────────────────────────────────────────

  const runLoop = useCallback((ts: number) => {
    const sim = simRef.current;
    if (!sim) return;

    const dt = Math.min((ts - lastTimeRef.current) / 1000, 0.033); // cap at ~30fps min
    lastTimeRef.current = ts;

    sim.step(dt);
    sim.render();

    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  // ── Resize handler ───────────────────────────────────────────────────────────

  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // Note: sim uses canvas.width/height internally; after resize the sim buffers
    // don't resize (they're fixed 128/512 res) but render output adapts via viewport.
  }, []);

  // ── Audio + sim init (inside user gesture) ────────────────────────────────────

  const initAll = useCallback(async () => {
    if (started) {
      // Already running — just resume audio if suspended
      if (audioRef.current) await audioRef.current.resume();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Resize canvas to DPR
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);

    // Init fluid sim
    const sim = createFluidSim(canvas);
    if (!sim) {
      setWebglError("WebGL2 is not supported on this device. The fluid painting needs a modern browser.");
      return;
    }
    simRef.current = sim;

    // Init audio (inside user gesture for iOS)
    try {
      const audio = createAudioEngine();
      await audio.resume();
      audioRef.current = audio;
    } catch {
      // Audio failed — visual-only fallback (still show sim)
    }

    // Start audio hue to match initial swatch
    if (audioRef.current) {
      audioRef.current.setHue(SWATCHES[0].hue);
    }

    setStarted(true);
    setShowTapPrompt(false);

    // Start sim loop
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runLoop);
  }, [started, runLoop]);

  // ── Splat helper ─────────────────────────────────────────────────────────────

  const applySplat = useCallback((
    x: number, y: number,
    vx: number, vy: number,
    swatchIdx: number
  ) => {
    const sim = simRef.current;
    const audio = audioRef.current;
    const sw = SWATCHES[swatchIdx];
    if (!sw) return;

    if (sim) {
      sim.splat(x, y, vx, vy, sw.r, sw.g, sw.b, 0.004);
    }

    if (audio) {
      const speed = Math.sqrt(vx * vx + vy * vy);
      const energy = Math.min(0.08 + speed / 800, 0.35);
      audio.injectEnergy(energy);
      audio.setHue(sw.hue);
    }
  }, []);

  // ── Pointer handlers ─────────────────────────────────────────────────────────

  const onPointerDown = useCallback(async (e: PointerEvent) => {
    e.preventDefault();

    if (!hasInteracted.current) {
      hasInteracted.current = true;
      demoRunningRef.current = false;
      if (demoTimerRef.current) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    }

    await initAll();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / canvas.offsetWidth;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;

    pointerMapRef.current.set(e.pointerId, { x, y });
    applySplat(x, y, 0, 0, activeSwatchRef.current);

    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }, [initAll, applySplat]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    e.preventDefault();
    const last = pointerMapRef.current.get(e.pointerId);
    if (!last) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / canvas.offsetWidth;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;

    const vx = x - last.x;
    const vy = y - last.y;
    const dist = Math.sqrt(vx * vx + vy * vy);
    if (dist < 3) return; // ignore micro-jitter

    applySplat(x, y, vx, vy, activeSwatchRef.current);
    pointerMapRef.current.set(e.pointerId, { x, y });

    // Swirl from movement speed
    if (audioRef.current) {
      audioRef.current.setSwirl(Math.min(dist / 200, 0.3));
    }
  }, [applySplat]);

  const onPointerUp = useCallback((e: PointerEvent) => {
    pointerMapRef.current.delete(e.pointerId);
  }, []);

  // ── Auto-demo ─────────────────────────────────────────────────────────────────

  const runAutoDemo = useCallback(async () => {
    if (hasInteracted.current) return;
    demoRunningRef.current = true;

    // Try to init (autoplay policy: some browsers block)
    try {
      await initAll();
    } catch {
      setShowTapPrompt(true);
      return;
    }
    if (!simRef.current) {
      setShowTapPrompt(true);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    let strokeIdx = 0;

    async function playStroke() {
      if (hasInteracted.current || !demoRunningRef.current) return;
      if (!canvas) return;

      const stroke = DEMO_STROKES[strokeIdx % DEMO_STROKES.length];
      strokeIdx++;

      activeSwatchRef.current = stroke.swatchIdx;
      setActiveSwatch(stroke.swatchIdx);
      if (audioRef.current) audioRef.current.setHue(SWATCHES[stroke.swatchIdx].hue);

      for (let i = 0; i <= stroke.steps; i++) {
        if (hasInteracted.current || !demoRunningRef.current) return;
        const t = i / stroke.steps;
        const x = (stroke.x0 + (stroke.x1 - stroke.x0) * t) * canvas.width;
        const y = (stroke.y0 + (stroke.y1 - stroke.y0) * t) * canvas.height;
        const vx = (stroke.x1 - stroke.x0) * canvas.width / stroke.steps;
        const vy = (stroke.y1 - stroke.y0) * canvas.height / stroke.steps;
        applySplat(x, y, vx * 3, vy * 3, stroke.swatchIdx);

        await new Promise<void>(resolve => setTimeout(resolve, 60));
      }

      // Pause between strokes
      await new Promise<void>(resolve => setTimeout(resolve, 900));

      if (!hasInteracted.current && demoRunningRef.current) {
        playStroke();
      }
    }

    playStroke();
  }, [initAll, applySplat]);

  // ── Mount / unmount ───────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);

    // Auto-demo after 1.8s
    demoTimerRef.current = setTimeout(() => {
      if (!hasInteracted.current) runAutoDemo();
    }, 1800);

    // Show tap prompt after 3s if still no audio
    const tapPromptTimer = setTimeout(() => {
      if (!started) setShowTapPrompt(true);
    }, 3000);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      ro.disconnect();
      cancelAnimationFrame(rafRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      clearTimeout(tapPromptTimer);
      if (simRef.current) { simRef.current.destroy(); simRef.current = null; }
      if (audioRef.current) { audioRef.current.destroy(); audioRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Swatch selection ──────────────────────────────────────────────────────────

  const selectSwatch = useCallback((idx: number) => {
    activeSwatchRef.current = idx;
    setActiveSwatch(idx);
    if (audioRef.current) audioRef.current.setHue(SWATCHES[idx].hue);
  }, []);

  // ── Tap-to-start ──────────────────────────────────────────────────────────────

  const handleTapToStart = useCallback(async () => {
    hasInteracted.current = true;
    demoRunningRef.current = false;
    if (demoTimerRef.current) { clearTimeout(demoTimerRef.current); demoTimerRef.current = null; }
    setShowTapPrompt(false);
    await initAll();
  }, [initAll]);

  // ── Design notes ──────────────────────────────────────────────────────────────

  const showDesignNotes = useCallback(() => {
    alert(
      "Fluid Paint — design notes\n\n" +
      "GPU: Navier-Stokes “Stable Fluids” (Jos Stam, SIGGRAPH 1999)\n" +
      "Pipeline: advect velocity → add forces → divergence →\n" +
      "         Jacobi pressure×20 → gradient subtract → advect dye\n" +
      "All passes on ping-pong RGBA float textures (128×128 sim, 512×512 dye).\n\n" +
      "Audio: major-9 chord pad (C2 G2 E3 B3 D4)\n" +
      "Energy injected on drag → pad volume + filter brightness.\n" +
      "Color hue → filter cutoff (warm = bright, cool = dark).\n" +
      "Swirl speed → tremolo rate.\n" +
      "DynamicsCompressor brick-wall limiter at −8 dB, 20:1 ratio.\n\n" +
      "Refs: Stam 1999; GPU Gems Ch.38 (Harris); Pavel Dobryakov WebGL-Fluid-Simulation."
    );
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-screen bg-zinc-950 flex flex-col select-none overflow-hidden touch-none">

      {/* ── HEADER ── */}
      <div className="flex-none flex items-center justify-between px-4 pt-3 pb-1 z-10">
        <div>
          <h1 className="text-foreground text-2xl font-semibold font-bold leading-tight tracking-tight">
            Fluid Paint
          </h1>
          <p className="text-muted-foreground text-base leading-snug">
            Drag to pour glowing color &mdash; the painting hums!
          </p>
        </div>
        <div className="flex items-center gap-2">
          {started && (
            <span className="text-muted-foreground text-sm" aria-label="Sound on">&#x1F50A;</span>
          )}
        </div>
      </div>

      {/* ── CANVAS ── */}
      <div className="flex-1 relative min-h-0">
        {webglError ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <p className="text-violet-300 text-xl text-center leading-relaxed max-w-sm">
              {webglError}
            </p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ touchAction: "none", cursor: "crosshair" }}
            aria-label="Fluid painting canvas — drag to paint with flowing color"
          />
        )}

        {/* TAP TO START overlay */}
        {showTapPrompt && !webglError && (
          <button
            onClick={handleTapToStart}
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/70 backdrop-blur-sm z-20"
            aria-label="Tap to start painting"
          >
            <span className="text-6xl leading-none" aria-hidden="true">&#x1F3A8;</span>
            <span className="text-foreground text-2xl font-bold">Tap to Paint!</span>
            <span className="text-muted-foreground text-base">Touch to wake up the colors &amp; sound</span>
          </button>
        )}
      </div>

      {/* ── COLOR SWATCHES ── */}
      <div
        className="flex-none bg-zinc-900/90 backdrop-blur border-t border-border px-3 py-3 z-10"
        role="toolbar"
        aria-label="Choose a paint color"
      >
        <div className="flex gap-2.5 justify-around max-w-xl mx-auto">
          {SWATCHES.map((sw, idx) => {
            const isActive = activeSwatch === idx;
            return (
              <button
                key={sw.label}
                onClick={() => selectSwatch(idx)}
                aria-label={sw.label + " paint"}
                aria-pressed={isActive}
                style={{
                  background: isActive ? sw.hex + "dd" : sw.hex + "44",
                  borderColor: isActive ? sw.hex : "transparent",
                  boxShadow: isActive
                    ? `0 0 20px 4px ${sw.hex}66, 0 0 8px 1px ${sw.hex}99`
                    : "none",
                }}
                className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5 min-h-[72px] rounded-2xl border-2 transition-all duration-150 active:scale-95"
              >
                <span className="text-3xl leading-none" aria-hidden="true">
                  {sw.icon}
                </span>
                <span
                  className="text-foreground text-xs font-semibold leading-none tracking-wide"
                  aria-hidden="true"
                >
                  {sw.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── FOOTER: Design notes link ── */}
      <div className="flex-none px-4 pb-2 text-right z-10">
        <button
          onClick={showDesignNotes}
          className="text-muted-foreground hover:text-foreground text-sm underline transition-colors bg-transparent border-0 cursor-pointer"
          aria-label="Read the design notes"
        >
          Design notes
        </button>
      </div>

    </div>
  );
}
