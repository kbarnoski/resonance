"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser, MicFrame } from "../_shared/use-mic-analyser";

type Mood =
  | "minimal"
  | "calm_bright"
  | "calm_dark"
  | "energetic_bright"
  | "energetic_dark"
  | "complex";

const MOOD_LABEL: Record<Mood, string> = {
  minimal: "minimal",
  calm_bright: "calm · bright",
  calm_dark: "calm · dark",
  energetic_bright: "energetic · bright",
  energetic_dark: "energetic · dark",
  complex: "complex",
};

const MOOD_VIZ: Record<Mood, string> = {
  minimal: "Lissajous",
  calm_bright: "Ink rings",
  calm_dark: "Orbital drift",
  energetic_bright: "Radial bloom",
  energetic_dark: "Pulse field",
  complex: "Spectral mandala",
};

const BAND_RGB: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const MOODS: Mood[] = [
  "minimal",
  "calm_bright",
  "calm_dark",
  "energetic_bright",
  "energetic_dark",
  "complex",
];

// Classify mood from audio features:
//   brightness  = spectral centroid (Hz)
//   energy      = amplitude
//   spread      = coefficient of variation of band energies (measures spectral flatness)
function classifyMood(frame: MicFrame): Mood {
  const { bands, amplitude, centroid } = frame;
  if (amplitude < 0.08) return "minimal";
  const mean = bands.reduce((s, b) => s + b, 0) / 6;
  if (mean < 0.01) return "minimal";
  const variance = bands.reduce((s, b) => s + (b - mean) ** 2, 0) / 6;
  const cv = Math.sqrt(variance) / (mean + 0.001);
  // High CV = energy concentrated in a few bands = noisy/percussive = "complex"
  if (cv > 1.1 && amplitude > 0.15) return "complex";
  const bright = centroid > 1500;
  const energetic = amplitude > 0.35;
  if (energetic && bright) return "energetic_bright";
  if (energetic) return "energetic_dark";
  if (bright) return "calm_bright";
  return "calm_dark";
}

// Demo synthetic frames — one per mood, 5s each, cycling automatically
const DEMO_SEQ: MicFrame[] = [
  {
    amplitude: 0.04, centroid: 600, onset: false, bpm: NaN,
    bands: [0.02, 0.02, 0.02, 0.01, 0.01, 0.01],
  },
  {
    amplitude: 0.18, centroid: 2800, onset: false, bpm: NaN,
    bands: [0.10, 0.12, 0.18, 0.20, 0.28, 0.32],
  },
  {
    amplitude: 0.18, centroid: 300, onset: false, bpm: NaN,
    bands: [0.30, 0.28, 0.18, 0.10, 0.05, 0.02],
  },
  {
    amplitude: 0.55, centroid: 3200, onset: false, bpm: 128,
    bands: [0.50, 0.60, 0.45, 0.55, 0.70, 0.65],
  },
  {
    amplitude: 0.55, centroid: 180, onset: false, bpm: 90,
    bands: [0.85, 0.75, 0.50, 0.20, 0.08, 0.03],
  },
  {
    amplitude: 0.40, centroid: 1100, onset: false, bpm: NaN,
    bands: [0.70, 0.12, 0.65, 0.78, 0.18, 0.72],
  },
];

function advanceDemoState(
  ref: { idx: number; elapsed: number; last: number },
  now: number
): MicFrame {
  if (ref.last < 0) ref.last = now;
  ref.elapsed += now - ref.last;
  ref.last = now;
  if (ref.elapsed >= 5000) {
    ref.elapsed -= 5000;
    ref.idx = (ref.idx + 1) % DEMO_SEQ.length;
  }
  // Smooth crossfade in the last 800 ms of each 5-second phase
  const t = ref.elapsed / 5000;
  const blend = t < 0.84 ? 0 : (t - 0.84) / 0.16;
  const cur = DEMO_SEQ[ref.idx];
  const nxt = DEMO_SEQ[(ref.idx + 1) % DEMO_SEQ.length];
  return {
    amplitude: cur.amplitude + (nxt.amplitude - cur.amplitude) * blend,
    centroid: cur.centroid + (nxt.centroid - cur.centroid) * blend,
    onset: false,
    bpm: NaN,
    bands: cur.bands.map((v, i) => v + (nxt.bands[i] - v) * blend),
  };
}

// ── Visual mode draw functions ────────────────────────────────────────────────

function drawMinimal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number
) {
  ctx.globalCompositeOperation = "lighter";
  const N = 200;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const theta = (i / N) * Math.PI * 2;
    const x = cx + R * Math.sin(2 * theta + t * 0.22);
    const y = cy + R * Math.sin(3 * theta + t * 0.15 + Math.PI / 4);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "rgba(160,200,255,0.28)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawCalmBright(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  amp: number
) {
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 4; k++) {
    const progress = (t * 0.08 + k * 0.25) % 1;
    const r = R * (0.10 + 0.76 * progress);
    const alpha = 0.26 * (1 - progress) * (0.5 + amp);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(160,240,255,${alpha})`;
    ctx.lineWidth = 1.5 + amp * 2.5;
    ctx.stroke();
  }
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.3);
  grd.addColorStop(0, `rgba(200,245,255,${0.1 * amp})`);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCalmDark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  amp: number
) {
  ctx.globalCompositeOperation = "lighter";
  const N = 110;
  for (let i = 0; i < N; i++) {
    const angle =
      (i / N) * Math.PI * 2 + t * (0.04 + 0.025 * Math.sin(i * 1.618));
    const r =
      R * (0.22 + 0.55 * ((Math.sin(i * 2.7 + t * 0.08) + 1) / 2));
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    ctx.fillStyle = `rgba(88,32,192,${0.12 + 0.22 * amp})`;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnergeticBright(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  frame: MicFrame
) {
  ctx.globalCompositeOperation = "lighter";
  const N = 72;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 + t * 0.12;
    const bi = i % 6;
    const energy = frame.bands[bi];
    const [r, g, b] = BAND_RGB[bi];
    const len = R * (0.12 + energy * 0.72);
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 + energy * 0.65})`;
    ctx.lineWidth = 1 + energy * 3;
    ctx.beginPath();
    ctx.moveTo(
      cx + R * 0.06 * Math.cos(angle),
      cy + R * 0.06 * Math.sin(angle)
    );
    ctx.lineTo(cx + len * Math.cos(angle), cy + len * Math.sin(angle));
    ctx.stroke();
  }
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
  grd.addColorStop(0, `rgba(255,210,120,${0.25 * frame.amplitude})`);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnergeticDark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  frame: MicFrame
) {
  ctx.globalCompositeOperation = "lighter";
  const bass = (frame.bands[0] + frame.bands[1]) / 2;
  const mid = (frame.bands[2] + frame.bands[3]) / 2;
  for (let k = 0; k < 4; k++) {
    const pulse = Math.abs(Math.sin(t * 3.2 + k * 0.9));
    const r = R * (0.18 + k * 0.22 + bass * 0.15) * (0.92 + 0.08 * pulse);
    const alpha = (0.3 - k * 0.05) * bass * (0.7 + 0.3 * pulse);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(200,15,45,${alpha})`;
    ctx.lineWidth = 3 + bass * 9;
    ctx.stroke();
  }
  for (let k = -2; k <= 2; k++) {
    const x = cx + k * R * 0.16;
    const pulse = Math.abs(Math.sin(t * 2.8 + k * 0.7));
    const h = R * (0.18 + mid * 0.45) * pulse;
    ctx.strokeStyle = `rgba(160,10,40,${0.18 * mid * pulse})`;
    ctx.lineWidth = 2 + mid * 7;
    ctx.beginPath();
    ctx.moveTo(x, cy - h);
    ctx.lineTo(x, cy + h);
    ctx.stroke();
  }
}

function drawComplex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  t: number,
  frame: MicFrame
) {
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (let bi = 0; bi < 6; bi++) {
    const angle = (bi / 6) * Math.PI * 2 + t * (0.06 + bi * 0.012);
    const energy = frame.bands[bi];
    const [r, g, b] = BAND_RGB[bi];
    const len = R * (0.08 + energy * 0.72);
    const tipX = cx + len * Math.cos(angle);
    const tipY = cy + len * Math.sin(angle);
    const fwd = ctx.createLinearGradient(cx, cy, tipX, tipY);
    fwd.addColorStop(0, `rgba(${r},${g},${b},${0.6 + energy * 0.4})`);
    fwd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.strokeStyle = fwd;
    ctx.lineWidth = 4 + energy * 14;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    const mirX = cx - len * 0.5 * Math.cos(angle);
    const mirY = cy - len * 0.5 * Math.sin(angle);
    const bwd = ctx.createLinearGradient(cx, cy, mirX, mirY);
    bwd.addColorStop(0, `rgba(${r},${g},${b},${0.35 + energy * 0.25})`);
    bwd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.strokeStyle = bwd;
    ctx.lineWidth = 2 + energy * 7;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mirX, mirY);
    ctx.stroke();
  }
  ctx.lineCap = "butt";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MoodVis() {
  const { running, error, start, stop, getFrame } = useMicAnalyser({
    smoothing: 0.82,
    gain: 2.0,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const [demo, setDemo] = useState(false);
  const demoStateRef = useRef({ idx: 0, elapsed: 0, last: -1 });
  const [hud, setHud] = useState<{
    mood: Mood;
    amp: number;
    centroid: number;
    cv: number;
  }>({ mood: "minimal", amp: 0, centroid: 0, cv: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!running && !demo)) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = 1;
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

    let lastHud = 0;

    const render = (now: number) => {
      const frame: MicFrame | null = running
        ? getFrame()
        : advanceDemoState(demoStateRef.current, now);

      if (!frame) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      const mean = frame.bands.reduce((s, b) => s + b, 0) / 6;
      const variance =
        mean > 0.01
          ? frame.bands.reduce((s, b) => s + (b - mean) ** 2, 0) / 6
          : 0;
      const cv = mean > 0.01 ? Math.sqrt(variance) / (mean + 0.001) : 0;
      const mood = classifyMood(frame);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.44;
      const t = now / 1000;

      // Trail persistence — natural ~1s crossfade between modes
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(0,0,0,0.07)";
      ctx.fillRect(0, 0, w, h);

      switch (mood) {
        case "minimal":
          drawMinimal(ctx, cx, cy, R * 0.65, t);
          break;
        case "calm_bright":
          drawCalmBright(ctx, cx, cy, R, t, frame.amplitude);
          break;
        case "calm_dark":
          drawCalmDark(ctx, cx, cy, R, t, frame.amplitude);
          break;
        case "energetic_bright":
          drawEnergeticBright(ctx, cx, cy, R, t, frame);
          break;
        case "energetic_dark":
          drawEnergeticDark(ctx, cx, cy, R, t, frame);
          break;
        case "complex":
          drawComplex(ctx, cx, cy, R, t, frame);
          break;
      }

      ctx.globalCompositeOperation = "source-over";

      if (now - lastHud > 100) {
        lastHud = now;
        setHud({
          mood,
          amp: frame.amplitude,
          centroid: Math.round(frame.centroid),
          cv: Math.round(cv * 10) / 10,
        });
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running, demo, getFrame]);

  const startDemo = () => {
    demoStateRef.current = { idx: 0, elapsed: 0, last: -1 };
    setDemo(true);
  };

  const stopAll = () => {
    stop();
    setDemo(false);
  };

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000" }}
      />

      {/* Start screen */}
      {!running && !demo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">
            Mood Viz
          </h1>
          <p className="text-sm text-white/55 max-w-sm mb-2 leading-relaxed">
            A visualizer that listens. Audio features — brightness, energy,
            spectral spread — drive a rule-based classifier. The visual mode
            switches automatically as the music changes character.
          </p>
          <p className="text-[11px] text-white/30 max-w-xs mb-6">
            6 moods → 6 modes: Lissajous · Ink rings · Orbital drift · Radial
            bloom · Pulse field · Spectral mandala
          </p>
          <div className="flex gap-4">
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Demo
            </button>
            <button
              onClick={start}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start mic
            </button>
          </div>
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

      {/* Active HUD */}
      {(running || demo) && (
        <>
          {/* Current mood */}
          <div className="absolute top-4 left-4 pointer-events-none">
            <div className="text-[9px] tracking-widest text-white/35 uppercase mb-1">
              mood
            </div>
            <div className="text-xl tracking-wider font-mono text-white">
              {MOOD_LABEL[hud.mood]}
            </div>
            <div className="text-[10px] text-white/30 mt-0.5">
              {MOOD_VIZ[hud.mood]}
            </div>
          </div>

          {/* Audio features readout */}
          <div className="absolute top-4 right-4 text-[10px] tracking-wider text-white/40 text-right pointer-events-none space-y-0.5">
            <div>
              AMP{" "}
              <span className="text-white">
                {(hud.amp * 100).toFixed(0)}
              </span>
            </div>
            <div>
              CENT <span className="text-white">{hud.centroid}</span> Hz
            </div>
            <div>
              SPREAD <span className="text-white">{hud.cv.toFixed(1)}</span>
            </div>
          </div>

          {/* Mood list — active one highlighted */}
          <div className="absolute left-4 bottom-16 pointer-events-none space-y-0.5">
            {MOODS.map((m) => (
              <div
                key={m}
                className={`text-[9px] tracking-wider transition-colors duration-300 ${
                  m === hud.mood ? "text-white" : "text-white/15"
                }`}
              >
                {MOOD_LABEL[m]}
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="absolute bottom-4 right-4 flex gap-3 items-center">
            {demo && !running && (
              <button
                onClick={start}
                className="text-[10px] tracking-wider uppercase text-white/55 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded"
              >
                use mic
              </button>
            )}
            {demo && !running && (
              <span className="text-[10px] text-white/25 tracking-wider uppercase">
                demo
              </span>
            )}
            <button
              onClick={stopAll}
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
        </>
      )}
    </div>
  );
}
