"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Constants ──────────────────────────────────────────────────────────────────

const TRAIL_LEN = 4000;
const DEMO_FREQS = [40, 125, 350, 1000, 3000, 10000] as const;

// Precompute 360 fill-style strings to avoid per-frame string allocation
const HUE_LUTS: string[] = Array.from(
  { length: 360 },
  (_, i) => `hsl(${i},82%,64%)`,
);

// ── 3D helpers (module-level, not hooks) ───────────────────────────────────────

function rotProject(
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  W: number,
  H: number,
): [number, number] {
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const x1 = px * cosY - pz * sinY;
  const z1 = px * sinY + pz * cosY;
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const y2 = py * cosX - z1 * sinX;
  const scale = Math.min(W, H) * 0.38;
  return [W / 2 + x1 * scale, H / 2 - y2 * scale];
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  rx: number,
  ry: number,
  W: number,
  H: number,
): void {
  const Y0 = -0.45;

  // XZ grid lines at Y0
  ctx.lineWidth = 0.75;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let i = -2; i <= 2; i++) {
    const t = i * 0.25;
    // Along Z at X=t
    const [ax, ay] = rotProject(t, Y0, -0.5, rx, ry, W, H);
    const [bx, by] = rotProject(t, Y0, 0.5, rx, ry, W, H);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    // Along X at Z=t
    const [cx, cy] = rotProject(-0.5, Y0, t, rx, ry, W, H);
    const [dx, dy] = rotProject(0.5, Y0, t, rx, ry, W, H);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(dx, dy); ctx.stroke();
  }

  // Axis lines
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.2;

  // X axis (centroid: dark → bright)
  const [xa, ya] = rotProject(-0.5, Y0, 0, rx, ry, W, H);
  const [xb, yb] = rotProject(0.5, Y0, 0, rx, ry, W, H);
  ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();

  // Z axis (bass energy)
  const [za, zya] = rotProject(0, Y0, -0.5, rx, ry, W, H);
  const [zb, zyb] = rotProject(0, Y0, 0.5, rx, ry, W, H);
  ctx.beginPath(); ctx.moveTo(za, zya); ctx.lineTo(zb, zyb); ctx.stroke();

  // Y axis (treble ratio)
  const [ta, tya] = rotProject(0, Y0, 0, rx, ry, W, H);
  const [tb, tyb] = rotProject(0, 0.5, 0, rx, ry, W, H);
  ctx.beginPath(); ctx.moveTo(ta, tya); ctx.lineTo(tb, tyb); ctx.stroke();

  // Axis labels
  const fsize = Math.round(Math.min(W, H) * 0.018);
  ctx.font = `${fsize}px monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.28)";

  const [lxX, lxY] = rotProject(0.58, Y0, 0, rx, ry, W, H);
  ctx.fillText("centroid →", lxX, lxY);

  const [lzX, lzY] = rotProject(0, Y0, 0.58, rx, ry, W, H);
  ctx.fillText("bass →", lzX, lzY);

  const [ltX, ltY] = rotProject(0, 0.56, 0, rx, ry, W, H);
  ctx.fillText("treble ↑", ltX, ltY);
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface TrailPt {
  x: number;
  y: number;
  z: number;
  a: number;   // amplitude [0,1]
  hue: number; // degrees [0,359]
}

type Mode = "idle" | "demo" | "mic";

// ── Component ──────────────────────────────────────────────────────────────────

export default function AcousticTrailPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [ptCount, setPtCount] = useState(0);

  const trailRef = useRef<TrailPt[]>([]);
  const headRef = useRef(0);
  const filledRef = useRef(0);

  // Persistent 3D rotation (survives mode changes)
  const rotRef = useRef({ x: 0.35, y: -0.4 });
  const dragRef = useRef({ active: false, lx: 0, ly: 0 });

  const { running, error: micError, start: startMic, stop: stopMic, getFrame } =
    useMicAnalyser({ smoothing: 0.65, gain: 2.0 });

  const startMode = useCallback(
    (m: Mode) => {
      if (m === "mic") startMic();
      setMode(m);
    },
    [startMic],
  );

  const stopMode = useCallback(() => {
    setMode("idle");
    stopMic();
  }, [stopMic]);

  const clearTrail = useCallback(() => {
    const trail = trailRef.current;
    for (let i = 0; i < trail.length; i++) {
      trail[i] = { x: 0, y: 0, z: 0, a: 0, hue: 180 };
    }
    headRef.current = 0;
    filledRef.current = 0;
    setPtCount(0);
  }, []);

  // ── Pointer drag for 3D rotation ────────────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { active: true, lx: e.clientX, ly: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current.active) return;
    rotRef.current.y += (e.clientX - dragRef.current.lx) * 0.005;
    rotRef.current.x = Math.max(
      -1.4,
      Math.min(1.4, rotRef.current.x + (e.clientY - dragRef.current.ly) * 0.005),
    );
    dragRef.current.lx = e.clientX;
    dragRef.current.ly = e.clientY;
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  // ── Main render loop ────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.offsetWidth * dpr);
    canvas.height = Math.round(canvas.offsetHeight * dpr);
    const W = canvas.width;
    const H = canvas.height;

    // Init trail buffer
    trailRef.current = Array.from({ length: TRAIL_LEN }, () => ({
      x: 0, y: 0, z: 0, a: 0, hue: 180,
    }));
    headRef.current = 0;
    filledRef.current = 0;

    // Demo audio
    let demoACtx: AudioContext | null = null;
    let demoAnalyser: AnalyserNode | null = null;
    const fftBuf = new Uint8Array(new ArrayBuffer(4096));

    if (mode === "demo") {
      demoACtx = new AudioContext();
      demoAnalyser = demoACtx.createAnalyser();
      demoAnalyser.fftSize = 8192;
      DEMO_FREQS.forEach((freq, i) => {
        const osc = demoACtx!.createOscillator();
        const lfo = demoACtx!.createOscillator();
        const lfoGain = demoACtx!.createGain();
        const g = demoACtx!.createGain();
        osc.frequency.value = freq;
        osc.type = i < 2 ? "sine" : "triangle";
        lfo.frequency.value = 0.07 + i * 0.05;
        lfoGain.gain.value = 0.38;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        g.gain.value = 0.22;
        osc.connect(g);
        g.connect(demoAnalyser!);
        osc.start();
        lfo.start();
      });
    }

    // Pre-alloc band scratch to avoid per-frame allocation
    const scratchBands = new Float32Array(6);
    let lastCountTs = 0;
    let raf = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;

      let centroidNorm = 0.5;
      let trebleRatio = 0.25;
      let bassEnergy = 0.15;
      let amplitude = 0.2;

      if (mode === "mic" && running) {
        const frame = getFrame();
        if (frame) {
          // Centroid already computed by useMicAnalyser; normalize to [0,1]
          centroidNorm = Math.min(1, Math.max(0, frame.centroid / 7000));
          const bands = frame.bands;
          let total = 0.001;
          for (let i = 0; i < 6; i++) total += bands[i];
          trebleRatio = (bands[4] + bands[5]) / total;
          bassEnergy = (bands[0] + bands[1]) * 0.5;
          amplitude = frame.amplitude;
        }
      } else if (mode === "demo" && demoAnalyser) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        demoAnalyser.getByteFrequencyData(fftBuf as any);
        const binHz = 44100 / demoAnalyser.fftSize;
        let wSum = 0, wTot = 0;
        const halfLen = fftBuf.length;
        for (let i = 0; i < halfLen; i++) {
          wSum += i * binHz * fftBuf[i];
          wTot += fftBuf[i];
        }
        centroidNorm = Math.min(1, Math.max(0, (wTot > 0 ? wSum / wTot : 500) / 7000));

        const step = Math.floor(halfLen / 6);
        let totalBand = 0;
        for (let bi = 0; bi < 6; bi++) {
          let s = 0;
          const lo = bi * step;
          const hi = lo + step;
          for (let k = lo; k < hi; k++) s += fftBuf[k];
          scratchBands[bi] = s / step / 255;
          totalBand += scratchBands[bi];
        }
        const total = Math.max(0.001, totalBand);
        trebleRatio = (scratchBands[4] + scratchBands[5]) / total;
        bassEnergy = (scratchBands[0] + scratchBands[1]) * 0.5;
        amplitude = Math.min(1, totalBand / 6 * 4);
      }

      // ── Map to 3D space (origin = typical resting position) ────────────────
      const x = centroidNorm - 0.5;
      const y = (trebleRatio - 0.27) * 1.15;
      const z = (bassEnergy - 0.18) * 1.2;
      const hue = Math.max(0, Math.min(359, Math.round((1 - centroidNorm) * 250 + 10)));

      // Write trail point
      const trail = trailRef.current;
      trail[headRef.current] = { x, y, z, a: Math.max(0.06, amplitude), hue };
      headRef.current = (headRef.current + 1) % TRAIL_LEN;
      filledRef.current = Math.min(filledRef.current + 1, TRAIL_LEN);

      if (now - lastCountTs > 500) {
        setPtCount(filledRef.current);
        lastCountTs = now;
      }

      // ── Render ─────────────────────────────────────────────────────────────
      const rx = rotRef.current.x;
      const ry = rotRef.current.y;

      ctx.fillStyle = "#050510";
      ctx.fillRect(0, 0, W, H);

      paintGrid(ctx, rx, ry, W, H);

      // Draw trail: newest (i=0) → oldest (i=filled-1), additive blend
      ctx.globalCompositeOperation = "lighter";
      const filled = filledRef.current;
      for (let i = 0; i < filled; i++) {
        const idx = (headRef.current - 1 - i + TRAIL_LEN * 2) % TRAIL_LEN;
        const pt = trail[idx];
        const age = i / Math.max(1, filled);
        const alpha = pt.a * Math.pow(1 - age, 1.7) * 0.92;
        if (alpha < 0.012) break; // subsequent points are all older → skip
        const [sx, sy] = rotProject(pt.x, pt.y, pt.z, rx, ry, W, H);
        const sz = Math.max(1, (1 - age) * 3.5 + 0.5);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = HUE_LUTS[pt.hue];
        ctx.fillRect(sx - sz * 0.5, sy - sz * 0.5, sz, sz);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (demoACtx) void demoACtx.close();
    };
  }, [mode, running, getFrame]);

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#050510", cursor: mode !== "idle" ? "grab" : "default" }}
        onPointerDown={mode !== "idle" ? onPointerDown : undefined}
        onPointerMove={mode !== "idle" ? onPointerMove : undefined}
        onPointerUp={mode !== "idle" ? onPointerUp : undefined}
      />

      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-2 tracking-tight">
            Acoustic Trail <span className="text-muted-foreground/70 text-lg">3D</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mb-3 leading-relaxed">
            Your audio mapped to its own natural coordinate space. Spectral centroid
            (brightness) → X. Treble ratio → Y. Bass energy → Z. The trail you leave{" "}
            <em>is</em> the acoustic fingerprint of your performance.
          </p>
          <p className="text-xs text-muted-foreground/70 max-w-xs mb-8 leading-relaxed">
            A single clean pitch traces a vertical column. A dense chord spreads wide.
            Bass notes pull toward the Z wall. Drag to rotate. Inspired by SoundPlot
            (arxiv 2601.12752).
          </p>

          <div className="flex gap-3 flex-wrap justify-center mb-6">
            <button
              onClick={() => startMode("demo")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start demo
            </button>
            <button
              onClick={() => startMode("mic")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground"
            >
              Start mic
            </button>
          </div>

          {micError && (
            <p className="mb-4 text-xs text-violet-300/70 max-w-xs leading-relaxed">
              {micError}
            </p>
          )}

          <Link href="/dream" className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {mode !== "idle" && (
        <>
          {/* Point count + mode — top-right */}
          <div className="absolute top-3 right-3 text-right text-[10px] tracking-wider text-muted-foreground/70 pointer-events-none select-none space-y-0.5">
            <div>{ptCount.toLocaleString()} pts</div>
            <div className="uppercase">{mode}</div>
          </div>

          {/* Axis legend — bottom-left */}
          <div className="absolute bottom-3 left-3 text-[10px] text-muted-foreground/70 pointer-events-none select-none leading-relaxed">
            <div>
              <span className="text-violet-400/80">◀</span> centroid{" "}
              <span className="text-violet-400/80">▶</span> dark → bright
            </div>
            <div>
              <span className="text-muted-foreground">▲</span> treble ratio
            </div>
            <div>
              <span className="text-violet-400/60">●</span> bass energy (depth)
            </div>
            <div className="mt-1 text-muted-foreground/70">drag to rotate</div>
          </div>

          {/* Controls — bottom-right */}
          <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
            <button
              onClick={clearTrail}
              className="text-[10px] tracking-wider uppercase text-muted-foreground border border-border hover:border-border hover:text-foreground px-2.5 py-1 rounded transition"
            >
              clear
            </button>
            <button
              onClick={stopMode}
              className="text-[10px] tracking-wider uppercase text-muted-foreground border border-border hover:border-border hover:text-foreground px-2.5 py-1 rounded transition"
            >
              stop
            </button>
            <Link href="/dream" className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
            <a
              href="/dream/17-acoustic-trail/README.md"
              target="_blank"
              rel="noreferrer"
              className="text-[9px] text-muted-foreground/70 hover:text-muted-foreground transition"
            >
              design notes ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
