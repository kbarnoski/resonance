"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser, BAND_RANGES_HZ } from "../_shared/use-mic-analyser";

/** Band → CSS-RGB color. Designed as a perceptual wheel:
 *  low bass = deep violet/indigo (cool, heavy)
 *  bass = cyan/teal
 *  low-mid = green
 *  mid = yellow
 *  high-mid = orange
 *  high = red/magenta (hottest, finest detail) */
const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],   // sub-bass — deep violet
  [32, 168, 220],  // bass — cyan
  [80, 220, 100],  // low-mid — green
  [240, 220, 70],  // mid — yellow
  [255, 150, 40],  // high-mid — orange
  [255, 60, 120],  // high — magenta/red
];

const BAND_LABELS = ["sub-bass", "bass", "low-mid", "mid", "high-mid", "high"];

export default function LiveMicViz() {
  const { running, error, start, stop, getFrame, gain, setGain } = useMicAnalyser({
    smoothing: 0.85,
    gain: 1.8,
    onsetThreshold: 1.7,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const flashRef = useRef(0); // 0-1, decays after onset
  const [hud, setHud] = useState({
    bands: [0, 0, 0, 0, 0, 0],
    amplitude: 0,
    centroid: 0,
    bpm: NaN as number,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastHudUpdate = 0;

    const render = (now: number) => {
      const frame = getFrame();
      if (!frame) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      // Decay onset flash exponentially.
      flashRef.current *= 0.86;
      if (frame.onset) flashRef.current = 1;

      // Black base with slight motion blur (looks "alive", traces persist).
      ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.55;

      // Draw bands as concentric radial gradients, outer = sub-bass, inner = high.
      // Compose with "lighter" blend so co-occurring bands sum into white peaks.
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < frame.bands.length; i++) {
        const energy = frame.bands[i];
        if (energy <= 0.02) continue;
        const ringOuter = maxR * (1 - i / frame.bands.length);
        const ringInner = maxR * (1 - (i + 1) / frame.bands.length);
        const [r, g, b] = BAND_COLORS[i];

        const grad = ctx.createRadialGradient(
          cx,
          cy,
          ringInner * (0.6 + 0.4 * energy),
          cx,
          cy,
          ringOuter * (1 + 0.15 * energy)
        );
        const alpha = Math.min(0.95, 0.15 + energy * 1.1);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, ringOuter * (1 + 0.15 * energy), 0, Math.PI * 2);
        ctx.fill();
      }

      // Onset flash — quick burst of white at the centroid position.
      if (flashRef.current > 0.02) {
        const flashRadius = maxR * 0.25 * flashRef.current;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
        grad.addColorStop(0, `rgba(255,255,255,${0.55 * flashRef.current})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, flashRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";

      // Update HUD at ~10Hz so React re-renders don't fight the canvas.
      if (now - lastHudUpdate > 100) {
        lastHudUpdate = now;
        setHud({
          bands: frame.bands,
          amplitude: frame.amplitude,
          centroid: frame.centroid,
          bpm: frame.bpm,
        });
      }

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running, getFrame]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {/* Center call-to-action when not running */}
      {!running && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Live Mic Viz</h1>
          <p className="text-sm text-white/55 max-w-md mb-6 leading-relaxed">
            Play, sing, or hum into your mic. Six frequency bands bloom as
            radial color fields — sub-bass deep violet at the outer edge,
            highs red-hot toward the center. Percussive hits flash.
          </p>
          <button
            onClick={start}
            className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
          >
            Start mic
          </button>
          {error && (
            <p className="mt-4 text-xs text-rose-300/80 max-w-sm">{error}</p>
          )}
          <Link
            href="/dream"
            className="mt-12 text-[11px] text-white/30 hover:text-white/60"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* HUD overlay when running */}
      {running && (
        <>
          <div className="absolute top-4 right-4 text-[10px] tracking-wider text-white/55 space-y-1 text-right pointer-events-none">
            <div>
              BPM <span className="text-white">{isNaN(hud.bpm) ? "—" : Math.round(hud.bpm)}</span>
            </div>
            <div>
              CENTROID <span className="text-white">{Math.round(hud.centroid)}</span> Hz
            </div>
            <div>
              AMPLITUDE <span className="text-white">{(hud.amplitude * 100).toFixed(0)}</span>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 pointer-events-none">
            <div className="flex gap-2">
              {hud.bands.map((energy, i) => {
                const [r, g, b] = BAND_COLORS[i];
                const h = Math.max(2, energy * 64);
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div
                      style={{
                        width: 18,
                        height: h,
                        background: `rgb(${r},${g},${b})`,
                        opacity: 0.35 + energy * 0.65,
                        transition: "height 60ms linear, opacity 60ms linear",
                      }}
                    />
                    <span className="text-[8px] text-white/40 tracking-wider">
                      {BAND_LABELS[i]}
                    </span>
                    <span className="text-[8px] text-white/30">
                      {BAND_RANGES_HZ[i][0]}–{BAND_RANGES_HZ[i][1] >= 1000 ? `${(BAND_RANGES_HZ[i][1] / 1000).toFixed(0)}k` : BAND_RANGES_HZ[i][1]}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col items-end gap-2 pointer-events-auto">
              <label className="text-[10px] text-white/55 tracking-wider">
                GAIN {gain.toFixed(1)}
              </label>
              <input
                type="range"
                min="0.5"
                max="4"
                step="0.1"
                value={gain}
                onChange={(e) => setGain(parseFloat(e.target.value))}
                className="w-40 accent-white"
              />
              <button
                onClick={stop}
                className="text-[10px] tracking-wider uppercase text-white/55 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded"
              >
                stop
              </button>
              <Link
                href="/dream"
                className="text-[10px] text-white/30 hover:text-white/60"
              >
                ← back
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
