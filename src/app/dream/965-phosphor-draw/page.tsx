"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildPreset,
  normalizeShape,
  resampleClosed,
  smoothClosed,
  SHAPE_N,
  PRESET_IDS,
  PRESET_LABELS,
  type Pt,
  type PresetId,
} from "./path-geometry";
import {
  startEngine,
  updateShape,
  setFreq as engineSetFreq,
  stopEngine,
  type AudioState,
} from "./audio-engine";
import { createPhosphor, type PhosphorController, type DrawOpts } from "./phosphor-gl";
import { createPhosphor2D, type Phosphor2D } from "./phosphor-2d";

// Phosphor colours (RGB 0..1) — classic CRT green & a cyan-ish variant.
const HUE_GREEN: [number, number, number] = [0.25, 1.0, 0.45];

type Renderer =
  | { kind: "gl"; ctrl: PhosphorController }
  | { kind: "2d"; ctrl: Phosphor2D };

export default function PhosphorDrawPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ── live, mutable refs the rAF loop reads (no re-render churn) ──
  const shapeRef = useRef<Pt[]>(buildPreset("figure8"));
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<AudioState | null>(null);
  const rafRef = useRef<number>(0);

  const freqRef = useRef(80);
  const spinRef = useRef(0.12); // radians / second
  const angleRef = useRef(0);
  const brightnessRef = useRef(0.7);
  const persistenceRef = useRef(0.82);

  // Scratch arrays for the rotated signal (single source of truth: scope + audio).
  const xsRef = useRef(new Float32Array(SHAPE_N));
  const ysRef = useRef(new Float32Array(SHAPE_N));
  const rotatedRef = useRef<Pt[]>(
    Array.from({ length: SHAPE_N }, () => ({ x: 0, y: 0 })),
  );
  const lastAudioPushRef = useRef(0);

  // Drawing state.
  const drawingRef = useRef(false);
  const drawPtsRef = useRef<Pt[]>([]);

  // ── UI state ──
  const [started, setStarted] = useState(false);
  const [freq, setFreq] = useState(80);
  const [spin, setSpin] = useState(0.12);
  const [brightness, setBrightness] = useState(0.7);
  const [persistence, setPersistence] = useState(0.82);
  const [activePreset, setActivePreset] = useState<PresetId | "drawn">("figure8");
  const [audioOk, setAudioOk] = useState(true);
  const [glMode, setGlMode] = useState<"gl" | "2d">("gl");

  // Keep refs synced with sliders.
  useEffect(() => {
    freqRef.current = freq;
    if (audioRef.current) engineSetFreq(audioRef.current, freq);
  }, [freq]);
  useEffect(() => {
    spinRef.current = spin;
  }, [spin]);
  useEffect(() => {
    brightnessRef.current = brightness;
  }, [brightness]);
  useEffect(() => {
    persistenceRef.current = persistence;
  }, [persistence]);

  // ── Renderer setup + resize observer ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: Renderer;
    try {
      renderer = { kind: "gl", ctrl: createPhosphor(canvas) };
      setGlMode("gl");
    } catch {
      renderer = { kind: "2d", ctrl: createPhosphor2D(canvas) };
      setGlMode("2d");
    }
    rendererRef.current = renderer;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const applySize = () => {
      const rect = wrap.getBoundingClientRect();
      const side = Math.max(2, Math.floor(Math.min(rect.width, rect.height)));
      const px = Math.floor(side * dpr);
      renderer.ctrl.resize(px, px);
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      renderer.ctrl.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── Render + audio push loop ──
  const tick = useCallback((now: number) => {
    rafRef.current = requestAnimationFrame(tick);
    const renderer = rendererRef.current;
    if (!renderer) return;

    const shape = shapeRef.current;
    const n = shape.length;
    if (n < 2) return;

    // Advance spin.
    angleRef.current += (spinRef.current * 16.6667) / 1000; // approx per-frame
    const ca = Math.cos(angleRef.current);
    const sa = Math.sin(angleRef.current);

    const xs = xsRef.current;
    const ys = ysRef.current;
    const rotated = rotatedRef.current;
    for (let i = 0; i < n; i++) {
      const px = shape[i].x;
      const py = shape[i].y;
      const rx = px * ca - py * sa;
      const ry = px * sa + py * ca;
      xs[i] = rx;
      ys[i] = ry;
      rotated[i].x = rx;
      rotated[i].y = ry;
    }

    const opts: DrawOpts = {
      persistence: persistenceRef.current,
      brightness: brightnessRef.current,
      hue: HUE_GREEN,
    };
    renderer.ctrl.draw(xs, ys, n, opts);

    // Push the EXACT same rotated signal to audio (throttled to ~20Hz so the
    // spin is audible without rebuilding the buffer every frame).
    const a = audioRef.current;
    if (a && now - lastAudioPushRef.current > 50) {
      lastAudioPushRef.current = now;
      audioRef.current = updateShape(a, rotated, freqRef.current);
    }
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  // ── Cleanup audio on unmount ──
  useEffect(() => {
    return () => {
      stopEngine(audioRef.current);
      audioRef.current = null;
    };
  }, []);

  // ── Start audio (must be inside the user gesture for iOS/Safari) ──
  const handleStart = useCallback(async () => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      audioRef.current = startEngine(ctx, shapeRef.current, freqRef.current, null);
      setStarted(true);
      setAudioOk(true);
    } catch {
      setAudioOk(false);
      setStarted(true); // still show the scope silently
    }
  }, []);

  // ── Preset selection ──
  const applyPreset = useCallback((id: PresetId) => {
    shapeRef.current = buildPreset(id);
    setActivePreset(id);
    const a = audioRef.current;
    if (a) audioRef.current = updateShape(a, shapeRef.current, freqRef.current);
  }, []);

  // ── Pointer drawing on the scope ──
  const canvasToShape = useCallback((clientX: number, clientY: number): Pt => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return { x, y };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      drawingRef.current = true;
      drawPtsRef.current = [canvasToShape(e.clientX, e.clientY)];
    },
    [canvasToShape],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const pts = drawPtsRef.current;
      const p = canvasToShape(e.clientX, e.clientY);
      const last = pts[pts.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.01) pts.push(p);
    },
    [canvasToShape],
  );

  const commitDrawing = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const pts = drawPtsRef.current;
    if (pts.length < 4) return; // too small — ignore
    // Close, normalise, smooth, resample to a clean constant-arc-length loop.
    const norm = normalizeShape(pts, 0.85);
    const resampled = resampleClosed(norm, SHAPE_N);
    const smoothed = smoothClosed(resampled, 2);
    shapeRef.current = smoothed;
    angleRef.current = 0;
    setActivePreset("drawn");
    const a = audioRef.current;
    if (a) audioRef.current = updateShape(a, shapeRef.current, freqRef.current);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      commitDrawing();
    },
    [commitDrawing],
  );

  // Live-draw preview: while drawing, feed the raw (open) path to the scope so
  // the user sees their stroke building. Audio stays on the last committed loop.
  useEffect(() => {
    if (!started) return;
    let id = 0;
    const previewTick = () => {
      id = requestAnimationFrame(previewTick);
      if (!drawingRef.current) return;
      const pts = drawPtsRef.current;
      if (pts.length > 3) {
        const norm = normalizeShape(pts, 0.85);
        shapeRef.current = resampleClosed(norm, SHAPE_N);
      }
    };
    id = requestAnimationFrame(previewTick);
    return () => cancelAnimationFrame(id);
  }, [started]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-1">
          <Link
            href="/dream"
            className="font-mono text-base text-white/75 hover:text-white"
          >
            ← dream lab
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Phosphor Draw
          </h1>
          <p className="max-w-2xl text-base text-white/75">
            A true vector oscilloscope. The glowing shape you{" "}
            <span className="text-white">see</span> and the tone you{" "}
            <span className="text-white">hear</span> are the same stereo signal —
            X is the left channel, Y is the right. Geometry becomes timbre; the
            loop&rsquo;s replay rate becomes pitch.
          </p>
        </header>

        {/* Scope */}
        <div
          ref={wrapRef}
          className="relative mx-auto aspect-square w-full max-w-[600px] overflow-hidden rounded-2xl border border-emerald-400/20 bg-black shadow-[0_0_60px_-15px_rgba(16,185,129,0.4)]"
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full touch-none"
            style={{ cursor: started ? "crosshair" : "default" }}
            onPointerDown={started ? onPointerDown : undefined}
            onPointerMove={started ? onPointerMove : undefined}
            onPointerUp={started ? onPointerUp : undefined}
            onPointerCancel={started ? onPointerUp : undefined}
          />

          {/* Start overlay */}
          {!started && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
              <p className="max-w-xs px-6 text-center text-base text-white/75">
                Audio needs a tap to begin. Then a figure-8 will draw itself and
                sing.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-6 py-2.5 font-mono text-base font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20"
              >
                ▶ Start the scope
              </button>
            </div>
          )}

          {/* status chips */}
          {started && (
            <div className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1 font-mono text-xs">
              <span className="rounded bg-black/50 px-2 py-1 text-emerald-300/80">
                {glMode === "gl" ? "CRT · WebGL2" : "CRT · Canvas2D"}
              </span>
              <span className="rounded bg-black/50 px-2 py-1 text-white/60">
                {activePreset === "drawn" ? "your shape" : PRESET_LABELS[activePreset]}
              </span>
            </div>
          )}
        </div>

        {!audioOk && (
          <p className="text-center text-base text-rose-300">
            Audio could not start on this device — the scope is running silently.
          </p>
        )}

        {/* Presets */}
        <section className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-white/60">
            presets — tap to hear
          </span>
          <div className="flex flex-wrap gap-2">
            {PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`min-h-[44px] rounded-lg border px-4 py-2.5 font-mono text-base transition-colors ${
                  activePreset === id
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                    : "border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
                }`}
              >
                {PRESET_LABELS[id]}
              </button>
            ))}
          </div>
          <p className="text-base text-white/75">
            Or draw your own closed loop on the scope with finger or mouse — a
            circle hums clean, a star buzzes bright, a square is rich with
            harmonics.
          </p>
        </section>

        {/* Controls */}
        <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Slider
            label="pitch"
            value={freq}
            min={40}
            max={400}
            step={1}
            suffix=" Hz"
            onChange={setFreq}
          />
          <Slider
            label="spin"
            value={spin}
            min={0}
            max={2}
            step={0.01}
            suffix=" rad/s"
            onChange={setSpin}
          />
          <Slider
            label="brightness"
            value={brightness}
            min={0}
            max={1}
            step={0.01}
            onChange={setBrightness}
          />
          <Slider
            label="persistence"
            value={persistence}
            min={0}
            max={1}
            step={0.01}
            onChange={setPersistence}
          />
        </section>

        <footer className="border-t border-white/10 pt-4 font-mono text-sm text-white/60">
          One signal, two senses. Lineage: Lissajous (1857) · Jerobeam Fenderson,
          Oscilloscope Music · Hansi Raber, OsciStudio / osci-render.
        </footer>
      </div>
    </main>
  );
}

// ── Reusable slider control ──
function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between font-mono text-base text-white/75">
        <span className="uppercase tracking-widest">{label}</span>
        <span className="text-emerald-200">
          {step < 1 ? value.toFixed(2) : value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-emerald-400"
      />
    </label>
  );
}
