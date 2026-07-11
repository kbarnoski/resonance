"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ---- Pure helpers (no "use" prefix) ----

/** Spectral centroid Hz → hue degrees. 60 Hz = violet (240°), 8 kHz = red (0°). */
function centroidToHue(hz: number): number {
  const t =
    Math.log(Math.max(60, Math.min(8000, hz)) / 60) / Math.log(8000 / 60);
  return 240 - t * 240;
}

/** Spectral bandwidth: normalised std-dev of 6 band energies → 0..1. */
function bandwidthScore(bands: number[]): number {
  const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
  const v =
    bands.reduce((a, b) => a + (b - mean) ** 2, 0) / bands.length;
  return Math.min(1, Math.sqrt(v) * 3.5);
}

/** Harmonic peak count: number of bands with energy above threshold. */
function harmonicPeaks(bands: number[]): number {
  return bands.filter((b) => b > 0.13).length;
}

/**
 * Rhythm regularity from inter-onset intervals: 1 = perfectly regular,
 * 0 = highly irregular (high coefficient of variation).
 */
function ioiRegularity(iois: number[]): number {
  if (iois.length < 2) return 0.5;
  const mean = iois.reduce((a, b) => a + b, 0) / iois.length;
  const std = Math.sqrt(
    iois.reduce((a, b) => a + (b - mean) ** 2, 0) / iois.length
  );
  return Math.max(0, 1 - Math.min(1, (std / (mean + 1)) * 2));
}

type ShapeKind = "circle" | "hex" | "star";

function shapeKind(bw: number): ShapeKind {
  if (bw < 0.28) return "circle";
  if (bw < 0.62) return "hex";
  return "star";
}

/** Draw one accumulated musical object on the canvas. */
function drawObject(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  radius: number,
  hue: number,
  kind: ShapeKind,
  rings: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = `hsl(${hue | 0},85%,65%)`;
  ctx.fillStyle = `hsla(${hue | 0},85%,55%,0.1)`;
  ctx.globalAlpha = 0.6;

  ctx.beginPath();
  if (kind === "circle") {
    ctx.arc(ox, oy, radius, 0, Math.PI * 2);
  } else if (kind === "hex") {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = ox + Math.cos(a) * radius;
      const y = oy + Math.sin(a) * radius;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    // 7-pointed star
    const pts = 7;
    for (let i = 0; i < pts * 2; i++) {
      const a = (i / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? radius : radius * 0.45;
      const x = ox + Math.cos(a) * r;
      const y = oy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  // Inner concentric rings — one per harmonic peak (capped at 4).
  const n = Math.min(rings, 4);
  for (let i = 1; i <= n; i++) {
    const rr = radius * (0.72 - i * 0.14);
    if (rr < 3) break;
    ctx.globalAlpha = 0.6 * 0.35 * (1 - i * 0.2);
    ctx.beginPath();
    ctx.arc(ox, oy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/** Draw an onset spark burst — radial glow + 8 spike lines. */
function drawSpark(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  hue: number,
  radius: number
): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
  g.addColorStop(0, `hsla(${hue | 0},100%,95%,0.9)`);
  g.addColorStop(0.35, `hsla(${hue | 0},100%,70%,0.5)`);
  g.addColorStop(1, `hsla(${hue | 0},100%,60%,0)`);
  ctx.fillStyle = g;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(ox, oy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `hsla(${hue | 0},100%,90%,0.5)`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(
      ox + Math.cos(a) * radius * 0.2,
      oy + Math.sin(a) * radius * 0.2
    );
    ctx.lineTo(ox + Math.cos(a) * radius, oy + Math.sin(a) * radius);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Component ----

type Mode = "idle" | "demo" | "mic";

export default function SynestheticSketch() {
  const {
    running: micRunning,
    error: micError,
    start: startMic,
    stop: stopMic,
    getFrame,
    gain,
    setGain,
  } = useMicAnalyser({ smoothing: 0.82, gain: 2.0, onsetThreshold: 1.6 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const wRef = useRef(0);
  const hRef = useRef(0);
  const animRef = useRef(0);
  const modeRef = useRef<Mode>("idle");
  const getFrameRef = useRef(getFrame);
  const frameCountRef = useRef(0);
  const lastOnsetTimeRef = useRef(0);
  const ioiRef = useRef<number[]>([]);
  const regularityRef = useRef(0.5);
  const demoOnsetAtRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [hud, setHud] = useState({
    shape: "–",
    rings: 0,
    hue: 0,
    bw: 0,
    regularity: 50,
    amp: 0,
  });

  // Sync mode and getFrame into refs so the animation loop can read them
  // without needing to restart on every state change.
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    getFrameRef.current = getFrame;
  }, [getFrame]);

  // Canvas init and resize — separate from the render loop so resize does
  // not clear the accumulated sketch when the loop effect re-runs.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctxRef.current = ctx;

    const applySize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      wRef.current = w;
      hRef.current = h;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    };

    applySize();
    window.addEventListener("resize", applySize);
    return () => window.removeEventListener("resize", applySize);
  }, []);

  // Main render loop — runs from mount to unmount; all mutable state via refs.
  useEffect(() => {
    let lastHudUpdate = 0;

    const render = (now: number) => {
      animRef.current = requestAnimationFrame(render);
      const curMode = modeRef.current;
      if (curMode === "idle") return;

      const ctx = ctxRef.current;
      const w = wRef.current;
      const h = hRef.current;
      if (!ctx || !w || !h) return;

      frameCountRef.current++;

      // ---- Build audio features ----
      let amplitude = 0;
      let centroid = 500;
      let bands: number[];
      let onset = false;

      if (curMode === "mic") {
        const frame = getFrameRef.current();
        if (!frame) return;
        amplitude = frame.amplitude;
        centroid = Math.max(60, frame.centroid);
        bands = frame.bands;
        onset = frame.onset;
        if (onset) {
          const nowMs = performance.now();
          if (lastOnsetTimeRef.current > 0) {
            const ioi = nowMs - lastOnsetTimeRef.current;
            if (ioi < 5000) {
              ioiRef.current.push(ioi);
              if (ioiRef.current.length > 8) ioiRef.current.shift();
              regularityRef.current = ioiRegularity(ioiRef.current);
            }
          }
          lastOnsetTimeRef.current = nowMs;
        }
      } else {
        // Demo: 6 incommensurable LFOs (never exactly repeating)
        const t = now / 1000;
        const lfo = [
          (Math.sin(t * 0.07 * Math.PI * 2) + 1) / 2,
          (Math.sin(t * 0.11 * Math.PI * 2) + 1) / 2,
          (Math.sin(t * 0.17 * Math.PI * 2) + 1) / 2,
          (Math.sin(t * 0.19 * Math.PI * 2) + 1) / 2,
          (Math.sin(t * 0.23 * Math.PI * 2) + 1) / 2,
          (Math.sin(t * 0.28 * Math.PI * 2) + 1) / 2,
        ];
        amplitude = 0.1 + lfo[0] * 0.55;
        centroid = 100 + lfo[1] * 4500;
        bands = lfo.map((v, i) => v * Math.max(0.2, 0.9 - i * 0.12));
        regularityRef.current = 0.2 + lfo[4] * 0.65;
        // Fake onset every 1.5–3.5 s
        if (now - demoOnsetAtRef.current > 1500 + lfo[5] * 2000) {
          onset = true;
          demoOnsetAtRef.current = now;
        }
      }

      const bw = bandwidthScore(bands);
      const peaks = harmonicPeaks(bands);
      const reg = regularityRef.current;
      const kind = shapeKind(bw);
      const hue = centroidToHue(centroid);

      // ---- Slow decay pass (prevents permanent burn-in) ----
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.004)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;

      // ---- Place a new object every ~20 frames when loud enough ----
      if (frameCountRef.current % 20 === 0 && amplitude > 0.05) {
        const maxScatter = Math.min(w, h) * 0.44;
        const jitter = (1 - reg) * maxScatter;
        const a = Math.random() * Math.PI * 2;
        // sqrt gives uniform distribution over disc area
        const d = Math.sqrt(Math.random()) * jitter;
        const ox = cx + Math.cos(a) * d;
        const oy = cy + Math.sin(a) * d;
        const radius = 10 + amplitude * 44;
        drawObject(ctx, ox, oy, radius, hue, kind, peaks);
      }

      // ---- Onset spark burst at a random canvas position ----
      if (onset) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * Math.min(w, h) * 0.42;
        drawSpark(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, hue, 10 + amplitude * 35);
      }

      // ---- HUD update ~8 Hz ----
      if (now - lastHudUpdate > 125) {
        lastHudUpdate = now;
        setHud({
          shape: kind,
          rings: Math.min(peaks, 4),
          hue: Math.round(hue),
          bw: Math.round(bw * 100),
          regularity: Math.round(reg * 100),
          amp: Math.round(amplitude * 100),
        });
      }
    };

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartMic = useCallback(() => {
    setMode("mic");
    void startMic();
  }, [startMic]);

  const handleStop = useCallback(() => {
    if (modeRef.current === "mic") stopMic();
    setMode("idle");
  }, [stopMic]);

  const clearCanvas = useCallback(() => {
    const ctx = ctxRef.current;
    const w = wRef.current;
    const h = hRef.current;
    if (!ctx || !w || !h) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
  }, []);

  const downloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "synesthetic-sketch.png";
    a.click();
  }, []);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {/* Idle landing */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">
            Synesthetic Sketch
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mb-3 leading-relaxed">
            Not just what color your music is — what <em>shape</em> it is.
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-xs mb-8 leading-relaxed font-mono">
            centroid → hue · bandwidth → shape · harmonics → rings ·
            amplitude → scale · rhythm → scatter · onsets → sparks
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => setMode("demo")}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              ▶ Demo
            </button>
            <button
              onClick={handleStartMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              🎤 Start mic
            </button>
          </div>
          {micError && (
            <p className="mt-4 text-xs text-violet-300/80 max-w-sm">{micError}</p>
          )}
          <Link
            href="/dream"
            className="mt-12 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* Active HUD */}
      {mode !== "idle" && (
        <>
          {/* Dimension legend — top left */}
          <div className="absolute top-3 left-4 text-[9px] tracking-wider text-muted-foreground/70 space-y-[3px] pointer-events-none font-mono leading-4">
            <div>
              HUE{" "}
              <span className="text-muted-foreground">{hud.hue}°</span>{" "}
              centroid
            </div>
            <div>
              SHAPE{" "}
              <span className="text-muted-foreground">{hud.shape}</span>{" "}
              bandwidth {hud.bw}%
            </div>
            <div>
              RINGS{" "}
              <span className="text-muted-foreground">{hud.rings}</span>{" "}
              harmonic peaks
            </div>
            <div>
              SCATTER{" "}
              <span className="text-muted-foreground">{100 - hud.regularity}%</span>{" "}
              irregularity
            </div>
            <div>
              SCALE amp{" "}
              <span className="text-muted-foreground">{hud.amp}%</span>
            </div>
          </div>

          {/* Mode badge — top right */}
          <div className="absolute top-3 right-4 text-[10px] tracking-wider text-muted-foreground/70 uppercase pointer-events-none">
            {mode === "demo" ? "demo" : "mic"}
          </div>

          {/* Controls — bottom right */}
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            {mode === "mic" && micRunning && (
              <>
                <label className="text-[10px] text-muted-foreground tracking-wider">
                  GAIN {gain.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="4"
                  step="0.1"
                  value={gain}
                  onChange={(e) => setGain(parseFloat(e.target.value))}
                  className="w-32 accent-primary"
                />
              </>
            )}
            <button
              onClick={clearCanvas}
              className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded"
            >
              clear
            </button>
            <button
              onClick={downloadPng}
              className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded"
            >
              ↓ png
            </button>
            <button
              onClick={handleStop}
              className="text-[10px] tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1 rounded"
            >
              stop
            </button>
            <Link
              href="/dream"
              className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground"
            >
              ← back
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
