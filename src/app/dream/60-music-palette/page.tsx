"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── band → color (same as 1-live) ─────────────────────────────────────────────
const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],   // sub-bass — violet
  [32, 168, 220],  // bass — cyan
  [80, 220, 100],  // low-mid — green
  [240, 220, 70],  // mid — yellow
  [255, 150, 40],  // high-mid — orange
  [255, 60, 120],  // high — magenta
];

// Incommensurable LFO rates (Hz) so demo pattern never exactly repeats
const LFO_RATES = [0.071, 0.113, 0.137, 0.179, 0.197, 0.233];

// ── helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const ch = (n: number): string => {
    const k = (n + h / 30) % 12;
    const v = ll - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(0)}${ch(8)}${ch(4)}`;
}

interface Swatch {
  h: number;
  s: number;
  l: number;
  hex: string;
}

// Build a 5-color HSL palette from emotion coordinates.
// valence 0=sad→blue(250°), 1=happy→warm yellow(50°)
// arousal 0=calm→lightness 28%, 1=energetic→72%
// richness 0=sparse→saturation 32%, 1=full→80%
function buildPalette(arousal: number, valence: number, richness: number): Swatch[] {
  const anchor = clamp(250 - valence * 200, 0, 360);
  const light = clamp(28 + arousal * 44, 16, 78);
  const sat = clamp(32 + richness * 50, 22, 84);
  return [-60, -30, 0, 30, 60].map((off) => {
    const h = ((anchor + off) % 360 + 360) % 360;
    const s = clamp(sat - Math.abs(off) * 0.08, 18, 88);
    const l = clamp(light + off * 0.10, 12, 84);
    return { h: Math.round(h), s: Math.round(s), l: Math.round(l), hex: hslToHex(h, s, l) };
  });
}

// Synthetic bands from incommensurable LFOs (demo mode)
function lfosBands(t: number): number[] {
  return LFO_RATES.map((r, i) =>
    0.30 + 0.28 * Math.sin(t * r * Math.PI * 2 + (i * Math.PI) / 3)
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MusicPalette() {
  const { running, error, start, stop, getFrame } = useMicAnalyser({
    smoothing: 0.88,
    gain: 2.0,
    onsetThreshold: 1.8,
  });

  const [mode, setMode] = useState<"idle" | "demo" | "mic">("idle");
  const [palette, setPalette] = useState<Swatch[]>(() => buildPalette(0.5, 0.5, 0.4));
  const [aro, setAro] = useState(0.5);
  const [val, setVal] = useState(0.5);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  // EMA state for smooth palette breathing
  const emaRef = useRef({ arousal: 0.5, valence: 0.5, richness: 0.5 });
  const lastPaletteRef = useRef(0);
  // Persist last known bands so mic startup doesn't flash zero
  const lastBandsRef = useRef<number[]>([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);

  // If mic fails after we set mode=mic, go back to idle
  useEffect(() => {
    if (error && mode === "mic") setMode("idle");
  }, [error, mode]);

  const handleStartMic = useCallback(() => {
    setMode("mic");
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    stop();
    setMode("idle");
  }, [stop]);

  // ── animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const active = mode === "demo" || (mode === "mic" && running);
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const t0 = performance.now() / 1000;
    let w = 0, h = 0, dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (now: number) => {
      const t = now / 1000 - t0;

      // Resolve current bands
      let bands: number[];
      if (mode === "demo") {
        bands = lfosBands(t);
      } else {
        const frame = getFrame();
        if (frame) {
          bands = frame.bands;
          lastBandsRef.current = bands;
        } else {
          bands = lastBandsRef.current;
        }
      }

      // Derive emotion coordinates
      const bassE = (bands[0] + bands[1]) / 2;
      const trebleE = (bands[3] + bands[4] + bands[5]) / 3;
      const totalE = bands.reduce((a, b) => a + b, 0) / 6;
      const rawAro = clamp(bassE, 0, 1);
      // valence: treble-to-total ratio; bright treble = happy
      const rawVal = clamp(totalE > 0.04 ? trebleE / (totalE + 0.02) : 0.5, 0, 1);
      // richness: spread across bands (std dev)
      const variance = bands.reduce((a, b) => a + (b - totalE) ** 2, 0) / 6;
      const rawRich = clamp(Math.sqrt(variance) * 3.5, 0, 1);

      // Slow EMA — ~1.5s time constant at 60fps so palette breathes, not flickers
      const α = 0.011;
      const ema = emaRef.current;
      ema.arousal = ema.arousal * (1 - α) + rawAro * α;
      ema.valence = ema.valence * (1 - α) + rawVal * α;
      ema.richness = ema.richness * (1 - α) + rawRich * α;

      // Update React state ~1/s (palette div repaints with CSS transition)
      if (now - lastPaletteRef.current > 900) {
        lastPaletteRef.current = now;
        setPalette(buildPalette(ema.arousal, ema.valence, ema.richness));
        setAro(ema.arousal);
        setVal(ema.valence);
      }

      // ── bloom ring (1-live style) ──────────────────────────────────────────
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.44;

      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < bands.length; i++) {
        const energy = bands[i];
        if (energy <= 0.02) continue;
        const ringOuter = maxR * (1 - i / bands.length);
        const ringInner = maxR * (1 - (i + 1) / bands.length);
        const [r, g, b] = BAND_COLORS[i];
        const grad = ctx.createRadialGradient(
          cx, cy, ringInner * (0.6 + 0.4 * energy),
          cx, cy, ringOuter * (1 + 0.15 * energy)
        );
        const alpha = Math.min(0.92, 0.15 + energy * 1.1);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, ringOuter * (1 + 0.15 * energy), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mode, running, getFrame]);

  // ── SVG download ───────────────────────────────────────────────────────────
  const downloadSVG = useCallback(() => {
    const sw = 110, sh = 140;
    const totalW = sw * 5;
    const totalH = sh + 52;
    const rects = palette
      .map(
        (s, i) => `
  <rect x="${i * sw}" y="0" width="${sw}" height="${sh}" fill="${s.hex}"/>
  <text x="${i * sw + sw / 2}" y="${sh + 16}" text-anchor="middle" font-family="monospace" font-size="10" fill="#eee">${s.hex}</text>
  <text x="${i * sw + sw / 2}" y="${sh + 30}" text-anchor="middle" font-family="monospace" font-size="8" fill="#aaa">hsl(${s.h},${s.s}%,${s.l}%)</text>`
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" style="background:#0a0a0a">
${rects}
  <text x="${totalW / 2}" y="${totalH - 8}" text-anchor="middle" font-family="monospace" font-size="8" fill="#555">arousal ${aro.toFixed(2)} · valence ${val.toFixed(2)} · resonance music palette</text>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "music-palette.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [palette, aro, val]);

  const isRunning = mode !== "idle";

  return (
    <div
      className="relative flex flex-col bg-black"
      style={{ height: "calc(100vh - 3rem)" }}
    >
      {isRunning ? (
        <>
          {/* ── palette swatches (upper ~60%) ── */}
          <div className="flex" style={{ flex: "3 1 0", minHeight: 0 }}>
            {palette.map((sw, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center justify-end pb-2"
                style={{
                  background: `hsl(${sw.h},${sw.s}%,${sw.l}%)`,
                  transition: "background 0.9s ease",
                }}
              >
                <span
                  className="text-[9px] tracking-wider font-mono leading-snug select-all"
                  style={{ color: sw.l > 55 ? "rgba(0,0,0,0.65)" : "rgba(255,255,255,0.75)" }}
                >
                  {sw.hex}
                </span>
                <span
                  className="text-[8px] font-mono"
                  style={{ color: sw.l > 55 ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.45)" }}
                >
                  {sw.h}°&nbsp;{sw.s}%&nbsp;{sw.l}%
                </span>
              </div>
            ))}
          </div>

          {/* ── bloom ring canvas (lower ~40%) ── */}
          <div className="relative" style={{ flex: "2 1 0", minHeight: 0 }}>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ background: "#000" }}
            />
          </div>

          {/* ── controls bar ── */}
          <div className="flex items-center justify-between px-4 py-2 bg-black border-t border-white/10 flex-shrink-0">
            <span className="text-[10px] font-mono text-white/40">
              aro&nbsp;<span className="text-white/65">{aro.toFixed(2)}</span>
              &nbsp;·&nbsp;val&nbsp;<span className="text-white/65">{val.toFixed(2)}</span>
              &nbsp;·&nbsp;<span className="text-white/30">{mode}</span>
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadSVG}
                className="text-[10px] uppercase tracking-wider text-white/55 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1 rounded transition"
              >
                ↓ svg
              </button>
              <button
                onClick={handleStop}
                className="text-[10px] uppercase tracking-wider text-white/55 hover:text-white border border-white/20 hover:border-white/50 px-3 py-1 rounded transition"
              >
                stop
              </button>
              <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
                ← back
              </Link>
            </div>
          </div>
        </>
      ) : (
        /* ── idle / start screen ── */
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Music Palette</h1>
          <p className="text-sm text-white/55 max-w-md mb-8 leading-relaxed">
            Your audio becomes a 5-color palette. Bass shapes the energy (lightness); treble
            shapes the mood (hue). The palette breathes with the sound. Download it as SVG
            when a color story emerges.
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => setMode("demo")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              ▶ Demo
            </button>
            <button
              onClick={handleStartMic}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              🎤 Start mic
            </button>
          </div>
          {error && (
            <p className="mt-4 text-xs text-rose-300/80 max-w-sm">{error}</p>
          )}
          <Link
            href="/dream"
            className="mt-10 text-[11px] text-white/30 hover:text-white/60"
          >
            ← back to dream sandbox
          </Link>
          <Link
            href="/dream/60-music-palette/README.md"
            className="mt-3 text-[11px] text-white/20 hover:text-white/50"
          >
            design notes
          </Link>
        </div>
      )}
    </div>
  );
}
