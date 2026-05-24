"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic across two octaves: C3–C5 (9 notes, indices 0–8)
const SCALE_HZ = [
  130.81, 164.81, 196.0, 220.0, 261.63,
  329.63, 392.0, 440.0, 523.25,
];

interface SFDef {
  xf: number;
  yf: number;
  r: number;
  col: string;
  base: number;
}

// Five starfish on the ocean floor, each with a distinct chord
const STARFISH: SFDef[] = [
  { xf: 0.13, yf: 0.83, r: 46, col: "#8b5cf6", base: 0 }, // violet — C3 chord
  { xf: 0.35, yf: 0.89, r: 34, col: "#ec4899", base: 1 }, // pink   — E3 chord
  { xf: 0.57, yf: 0.80, r: 52, col: "#f59e0b", base: 2 }, // amber  — G3 chord (biggest)
  { xf: 0.76, yf: 0.87, r: 30, col: "#10b981", base: 3 }, // emerald— A3 chord (smallest)
  { xf: 0.89, yf: 0.80, r: 42, col: "#3b82f6", base: 4 }, // blue   — C4 chord
];

// Three seaweed stems (fractional x)
const WEED_XF = [0.24, 0.47, 0.67];

// 10 drifting bubbles: [xf, yf, r, speed]
const BUBBLE_SEED = Array.from({ length: 10 }, (_, i) => ({
  xf: 0.04 + ((i * 0.095) % 0.92),
  yf: 0.25 + ((i * 0.17) % 0.65),
  r: 1.8 + (i % 3),
  spd: 0.00013 + (i % 4) * 0.000038,
}));

function buildImpulse(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const len = Math.floor(sr * 1.5);
  const buf = actx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  return buf;
}

function ringChord(actx: AudioContext, conv: ConvolverNode, base: number) {
  const now = actx.currentTime;
  for (let i = 0; i < 5; i++) {
    const osc = actx.createOscillator();
    const env = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = SCALE_HZ[base + i];
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.09, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    osc.connect(env);
    env.connect(actx.destination);
    env.connect(conv);
    osc.start(now);
    osc.stop(now + 1.0);
  }
}

// Draw a 5-pointed star with arm-ripple wiggle animation
function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  wiggle: number,
  col: string,
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const isOuter = i % 2 === 0;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    let rad: number;
    if (isOuter) {
      const arm = i >> 1;
      const wAmp = wiggle * 0.3 * Math.sin((1 - wiggle) * Math.PI * 5 + arm * 1.257);
      rad = r * (1 + wAmp);
    } else {
      rad = r * 0.42;
    }
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.shadowColor = col;
  ctx.shadowBlur = wiggle > 0.02 ? 18 + wiggle * 34 : 10;
  ctx.fillStyle = col;
  ctx.fill();
  // Centre body dot
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fill();
}

export default function KidsStarfish() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const convRef = useRef<ConvolverNode | null>(null);
  const [started, setStarted] = useState(false);

  function handleStart() {
    const actx = new AudioContext();
    actxRef.current = actx;

    // Reverb
    const conv = actx.createConvolver();
    conv.buffer = buildImpulse(actx);
    const wet = actx.createGain();
    wet.gain.value = 0.18;
    conv.connect(wet);
    wet.connect(actx.destination);
    convRef.current = conv;

    // Ambient ocean pad: C2 + G2 with slow LFO pitch wobble
    ([65.41, 98.0] as const).forEach((freq, idx) => {
      const osc = actx.createOscillator();
      const lfo = actx.createOscillator();
      const lfoG = actx.createGain();
      const ampG = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      lfo.type = "sine";
      lfo.frequency.value = 0.07 + idx * 0.027;
      lfoG.gain.value = freq * 0.0022;
      lfo.connect(lfoG);
      lfoG.connect(osc.frequency);
      ampG.gain.value = 0.014;
      osc.connect(ampG);
      ampG.connect(actx.destination);
      osc.start();
      lfo.start();
    });

    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // Mutable animation state — no React re-renders needed
    const wiggle = STARFISH.map(() => 0);
    const bubbles = BUBBLE_SEED.map((b) => ({ ...b }));
    let t = 0;
    let rafId = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const actx = actxRef.current;
      const conv = convRef.current;
      if (!actx || !conv) return;
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      for (let i = 0; i < STARFISH.length; i++) {
        const sf = STARFISH[i];
        if (Math.hypot(cssX - sf.xf * W, cssY - sf.yf * H) < sf.r + 22) {
          wiggle[i] = 1.0;
          ringChord(actx, conv, sf.base);
          break;
        }
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    let last = 0;
    const frame = (ts: number) => {
      const dt = last === 0 ? 16 : Math.min(ts - last, 80);
      last = ts;
      t += dt * 0.001;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      // Decay wiggles (~650ms to settle)
      for (let i = 0; i < wiggle.length; i++)
        wiggle[i] = Math.max(0, wiggle[i] - dt * 0.00154);

      // Bubbles drift upward, wrap at top
      for (const b of bubbles) {
        b.yf -= b.spd * dt;
        if (b.yf < -0.04) b.yf = 1.04;
      }

      // Ocean background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#01091a");
      bg.addColorStop(0.62, "#041c30");
      bg.addColorStop(0.84, "#051b15");
      bg.addColorStop(1, "#0b190a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Seaweed stems
      ctx.save();
      ctx.lineCap = "round";
      const weedWidths = [6, 5, 7];
      for (let wi = 0; wi < WEED_XF.length; wi++) {
        const wxf = WEED_XF[wi];
        const sx = wxf * W;
        const topY = H * 0.63;
        ctx.beginPath();
        ctx.moveTo(sx, H);
        for (let s = 1; s <= 12; s++) {
          const frac = s / 12;
          const fy = H - (H - topY) * frac;
          const sway = Math.sin(t * 0.58 + wxf * 8 + frac * 2.9) * 20 * frac;
          ctx.lineTo(sx + sway, fy);
        }
        const alpha = 0.52 + 0.18 * Math.sin(t * 0.28 + wi * 1.3);
        ctx.strokeStyle = `rgba(14,90,50,${alpha.toFixed(2)})`;
        ctx.lineWidth = weedWidths[wi];
        ctx.stroke();
      }
      ctx.restore();

      // Rising bubbles
      ctx.save();
      for (const b of bubbles) {
        const bx = b.xf * W;
        const by = b.yf * H;
        ctx.beginPath();
        ctx.arc(bx, by, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(100,185,225,0.22)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // Sandy floor gradient at the very bottom
      ctx.save();
      const floor = ctx.createLinearGradient(0, H * 0.9, 0, H);
      floor.addColorStop(0, "rgba(100,75,35,0.0)");
      floor.addColorStop(1, "rgba(100,75,35,0.18)");
      ctx.fillStyle = floor;
      ctx.fillRect(0, H * 0.9, W, H * 0.1);
      ctx.restore();

      // Starfish
      ctx.save();
      for (let i = 0; i < STARFISH.length; i++) {
        const sf = STARFISH[i];
        drawStar(ctx, sf.xf * W, sf.yf * H, sf.r, wiggle[i], sf.col);
      }
      ctx.restore();

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#01091a] text-white gap-6 px-6 text-center">
        <div className="text-5xl select-none">🌊</div>
        <h1 className="text-2xl font-serif text-white/95">Starfish Garden</h1>
        <p className="text-base text-white/75 max-w-xs">
          Touch the starfish to hear their songs
        </p>
        <div className="flex gap-5 items-end opacity-35 select-none mt-1">
          {STARFISH.map((sf, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: sf.r * 1.1,
                height: sf.r * 1.1,
                backgroundColor: sf.col,
                filter: "blur(5px)",
              }}
            />
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/50 rounded-2xl px-8 py-4 text-white text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          🪸 Begin
        </button>
        <p className="text-sm text-white/55">no microphone needed</p>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full fixed inset-0 touch-none"
      style={{ cursor: "pointer" }}
    />
  );
}
