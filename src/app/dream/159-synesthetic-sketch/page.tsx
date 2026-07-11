"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── spectral centroid Hz → hue (270°=violet/low … 0°=red/high) ──────────────
const BAND_CENTERS_HZ = [40, 155, 375, 1250, 3000, 12000];

function centroidToHue(hz: number): number {
  const t =
    Math.log(Math.max(40, Math.min(20000, hz)) / 40) / Math.log(20000 / 40);
  return (1 - t) * 270;
}

// ── spectral spread → shape kind ─────────────────────────────────────────────
type ShapeKind = "circle" | "tri" | "square" | "hex" | "star";

function spreadToShape(spread: number): ShapeKind {
  if (spread < 0.10) return "circle";
  if (spread < 0.20) return "tri";
  if (spread < 0.30) return "square";
  if (spread < 0.40) return "hex";
  return "star";
}

function shapeLabel(k: ShapeKind): string {
  return k === "circle" ? "○  circle"
    : k === "tri" ? "△  triangle"
    : k === "square" ? "□  square"
    : k === "hex" ? "⬡  hexagon"
    : "✦  star";
}

// ── draw one musical object onto ctx ─────────────────────────────────────────
function drawMusObj(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  kind: ShapeKind,
  rings: number,
  hue: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = `hsla(${hue},85%,58%,0.50)`;
  ctx.strokeStyle = `hsla(${hue},70%,82%,0.65)`;
  ctx.lineWidth = 0.9;

  ctx.beginPath();
  if (kind === "circle") {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else {
    const nSides =
      kind === "tri" ? 3 : kind === "square" ? 4 : kind === "hex" ? 6 : 8;
    const angleOff = kind === "tri" ? -Math.PI / 2 : 0;

    if (kind === "star") {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + angleOff;
        const rr = i % 2 === 0 ? r : r * 0.42;
        if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
    } else {
      for (let i = 0; i < nSides; i++) {
        const ang = (i / nSides) * Math.PI * 2 + angleOff;
        if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
        else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();

  // inner concentric rings — harmonic richness indicator
  for (let ri = 1; ri <= rings; ri++) {
    const rr = r * (0.63 - ri * 0.13);
    if (rr < 2) break;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = `hsla(${hue},55%,88%,0.55)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

// ── spark particle ────────────────────────────────────────────────────────────
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
}

// ── demo mode: 6 incommensurable LFOs ────────────────────────────────────────
const DEMO_LFOS = [0.0231, 0.0537, 0.1091, 0.2417, 0.6303, 1.4071]; // rad/s

function computeDemoFrame(tSec: number) {
  const bands = DEMO_LFOS.map(
    (w, i) => 0.15 + 0.65 * ((Math.sin(tSec * w + i * 1.2) + 1) / 2)
  );
  const wSum = BAND_CENTERS_HZ.reduce((s, f, i) => s + f * bands[i], 0);
  const bSum = bands.reduce((a, x) => a + x, 0);
  const centroid = bSum > 0 ? wSum / bSum : 440;
  const amplitude = bSum / bands.length;
  // onset fires on a rising edge of slow sine
  const s0 = Math.sin(tSec * 0.8);
  const s1 = Math.sin((tSec - 0.016) * 0.8);
  const onset = s0 > 0.965 && s1 <= 0.965;
  return { bands, amplitude, centroid, onset };
}

// ── main component ────────────────────────────────────────────────────────────
type Phase = "start" | "demo" | "mic";

export default function SynestheticSketch() {
  const {
    error: micError,
    start: startMic,
    stop: stopMic,
    getFrame,
  } = useMicAnalyser({ smoothing: 0.78, gain: 2.0, onsetThreshold: 1.7 });

  const [phase, setPhase] = useState<Phase>("start");
  const [hudKind, setHudKind] = useState<ShapeKind>("circle");
  const [hudRings, setHudRings] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const sparksRef = useRef<Spark[]>([]);
  const frameRef = useRef(0);
  const lastHudUpdateRef = useRef(0);

  const handleDemo = useCallback(() => {
    setPhase("demo");
  }, []);

  const handleMic = useCallback(async () => {
    await startMic();
    setPhase("mic");
  }, [startMic]);

  const handleStop = useCallback(() => {
    stopMic();
    setPhase("start");
    sparksRef.current = [];
    frameRef.current = 0;
  }, [stopMic]);

  const handleDownload = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const link = document.createElement("a");
    link.href = c.toDataURL("image/png");
    link.download = "synesthetic-sketch.png";
    link.click();
  }, []);

  const handleClear = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, c.width, c.height);
    sparksRef.current = [];
    frameRef.current = 0;
  }, []);

  // ── render loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === "start") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
    };

    resize();
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      if (!canvas.isConnected) return;
      frameRef.current++;
      const fc = frameRef.current;

      let bands: number[];
      let amplitude: number;
      let centroid: number;
      let onset: boolean;

      if (phase === "mic") {
        const f = getFrame();
        if (!f) {
          animRef.current = requestAnimationFrame(render);
          return;
        }
        ({ bands, amplitude, centroid, onset } = f);
      } else {
        ({ bands, amplitude, centroid, onset } = computeDemoFrame(now * 0.001));
      }

      // Spectral spread: std dev of band energies (0 = all energy in one band)
      const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
      const variance =
        bands.reduce((s, b) => s + (b - mean) ** 2, 0) / bands.length;
      const spread = Math.sqrt(variance);

      // Harmonic richness = count of bands above threshold → inner ring count
      const richness = bands.filter((b) => b > 0.28).length;
      const rings = Math.min(4, Math.floor(richness / 1.2));

      const kind = spreadToShape(spread);
      const hue = centroidToHue(centroid);

      // Slow background fade — prevents full canvas burn-in (~3 min to clear)
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.003;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // Deposit new musical object every 4 frames (amplitude gated)
      if (fc % 4 === 0 && amplitude > 0.10) {
        const r = 7 + amplitude * 26;
        const cx = (0.08 + Math.random() * 0.84) * w;
        const cy = (0.08 + Math.random() * 0.84) * h;
        drawMusObj(ctx, cx, cy, r, kind, rings, hue);
      }

      // Onset: burst of extra objects + spark particles
      if (onset) {
        const bx = (0.15 + Math.random() * 0.70) * w;
        const by = (0.15 + Math.random() * 0.70) * h;
        for (let i = 0; i < 4; i++) {
          const r = 10 + amplitude * 30;
          const ox = bx + (Math.random() - 0.5) * 90;
          const oy = by + (Math.random() - 0.5) * 90;
          drawMusObj(ctx, ox, oy, r, kind, rings, hue);
        }
        for (let i = 0; i < 22; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 1.5 + Math.random() * 5;
          sparksRef.current.push({
            x: bx,
            y: by,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            life: 1,
            hue,
          });
        }
      }

      // Render + advance sparks
      ctx.globalCompositeOperation = "lighter";
      sparksRef.current = sparksRef.current.filter((sp) => {
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.07;
        sp.life -= 0.038;
        if (sp.life <= 0) return false;
        ctx.save();
        ctx.globalAlpha = sp.life * 0.85;
        ctx.fillStyle = `hsl(${sp.hue},88%,72%)`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2 * sp.life + 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return true;
      });
      ctx.globalCompositeOperation = "source-over";

      // Throttled HUD state update
      if (now - lastHudUpdateRef.current > 150) {
        lastHudUpdateRef.current = now;
        setHudKind(kind);
        setHudRings(rings);
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase, getFrame]);

  // ── start screen ─────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 text-foreground">
        <div className="max-w-lg text-center space-y-6">
          <h1 className="text-3xl font-mono font-bold text-foreground">
            Synesthetic Sketch
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Your music as shape — not just color. Each audio feature maps to a
            different visual dimension as shapes accumulate on the canvas.
          </p>

          <div className="text-sm text-muted-foreground space-y-1 text-left border border-border rounded-lg p-4">
            <div>
              <span className="text-foreground">Spectral centroid</span> → hue
              (violet = low, amber = mid, rose = high)
            </div>
            <div>
              <span className="text-foreground">Spectral spread</span> → shape
              (circle = pure tone · star = complex noise)
            </div>
            <div>
              <span className="text-foreground">Harmonic richness</span> → inner
              rings (0–4 concentric)
            </div>
            <div>
              <span className="text-foreground">Amplitude</span> → object scale
            </div>
            <div>
              <span className="text-foreground">Onset / beat</span> → spark burst
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={handleDemo}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-lg text-foreground font-mono text-base min-h-[44px] transition-colors"
            >
              Demo mode
            </button>
            <button
              onClick={handleMic}
              className="px-6 py-3 bg-transparent hover:bg-violet-900/50 border border-violet-600 rounded-lg text-foreground font-mono text-base min-h-[44px] transition-colors"
            >
              Start mic
            </button>
          </div>

          {micError && (
            <p className="text-violet-300 text-sm">{micError}</p>
          )}

          <p className="text-muted-foreground text-xs">
            Shapes accumulate over the session — the canvas fills slowly and
            fades over ~3 minutes. Download at any time.
          </p>
        </div>

        <Link
          href="/dream"
          className="fixed bottom-5 left-5 text-muted-foreground text-sm hover:text-foreground font-mono"
        >
          ← dream
        </Link>
      </div>
    );
  }

  // ── running screen ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* top-right HUD */}
      <div className="absolute top-4 right-4 text-right space-y-1.5 pointer-events-none select-none">
        <div className="font-mono text-sm text-foreground">
          {shapeLabel(hudKind)}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {hudRings > 0
            ? `${hudRings} ring${hudRings > 1 ? "s" : ""}`
            : "no rings"}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {phase === "mic" ? "● mic" : "◌ demo"}
        </div>
      </div>

      {/* mic error overlay */}
      {micError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-violet-300 text-sm font-mono bg-black/70 px-4 py-2 rounded">
          {micError}
        </div>
      )}

      {/* bottom controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 items-center">
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-black/60 border border-border rounded text-muted-foreground text-sm font-mono hover:text-foreground hover:border-border min-h-[36px] transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-black/60 border border-border rounded text-muted-foreground text-sm font-mono hover:text-foreground hover:border-border min-h-[36px] transition-colors"
        >
          ↓ PNG
        </button>
        <button
          onClick={handleStop}
          className="px-4 py-2 bg-black/60 border border-border rounded text-muted-foreground text-sm font-mono hover:text-foreground hover:border-border min-h-[36px] transition-colors"
        >
          ✕ Stop
        </button>
      </div>

      <Link
        href="/dream"
        className="absolute top-4 left-4 text-muted-foreground text-sm hover:text-foreground font-mono"
      >
        ← dream
      </Link>

      <Link
        href="/dream/159-synesthetic-sketch/README.md"
        className="absolute bottom-4 right-4 text-muted-foreground/70 text-xs hover:text-muted-foreground font-mono"
      >
        design notes
      </Link>
    </div>
  );
}
