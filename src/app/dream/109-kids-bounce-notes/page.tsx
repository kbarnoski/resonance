"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic: C3 E3 G3 A3 C4 E4 G4 A4
const PENTA_HZ = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63, 392.0, 440.0];

type WallKey = "bottom" | "top" | "left" | "right";
// Wall → note: bottom = C3 (deepest), top = A4 (brightest), sides = mid
const WALL_IDX: Record<WallKey, number> = {
  bottom: 0,
  top: 7,
  left: 2,
  right: 5,
};

const BALL_COLORS = ["#c084fc", "#67e8f9", "#34d399", "#fb923c", "#f472b6"];
const MAX_BALLS = 5;
const GRAVITY = 185; // px/s²
const RESTITUTION = 0.86;
const BALL_R = 26;
const NOTE_GAP = 0.1; // min seconds between notes per ball

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  colorIdx: number;
  flash: number;
  lastNote: number; // actx.currentTime of last triggered note
}

let _id = 0;

function triggerWallNote(actx: AudioContext, wall: WallKey): void {
  const hz = PENTA_HZ[WALL_IDX[wall]];
  const now = actx.currentTime;
  const addVoice = (freq: number, peak: number, dur: number) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g).connect(actx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  };
  addVoice(hz, 0.3, 0.65);
  addVoice(hz * 2, 0.055, 0.35);
}

export default function KidsBounceNotes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const ballsRef = useRef<Ball[]>([]);
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);
  const [started, setStarted] = useState(false);
  const [count, setCount] = useState(0);

  const spawnBall = useCallback((x: number, y: number) => {
    const balls = ballsRef.current;
    if (balls.length >= MAX_BALLS) return;
    balls.push({
      id: _id++,
      x,
      y,
      vx: (Math.random() - 0.5) * 290,
      vy: -110 - Math.random() * 140,
      colorIdx: balls.length % BALL_COLORS.length,
      flash: 0.5,
      lastNote: 0,
    });
    setCount(balls.length);
  }, []);

  const handleStart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const actx = new AudioContext();
    actxRef.current = actx;
    // Ambient pad: C3 G3 C4 soft triangle drones
    [0, 2, 4].forEach((idx) => {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = "triangle";
      osc.frequency.value = PENTA_HZ[idx];
      g.gain.value = 0;
      osc.connect(g).connect(actx.destination);
      osc.start();
      g.gain.setTargetAtTime(0.013, actx.currentTime, 1.8);
    });
    _id = 0;
    ballsRef.current = [];
    setStarted(true);
    // Spawn first ball after render cycle so canvas has dimensions
    setTimeout(() => {
      const c = canvasRef.current;
      if (!c) return;
      spawnBall(c.offsetWidth * 0.5, c.offsetHeight * 0.25);
    }, 50);
  }, [spawnBall]);

  // Animation + physics loop
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = (ts: number) => {
      const dt = Math.min((ts - (lastTRef.current || ts)) / 1000, 0.05);
      lastTRef.current = ts;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const balls = ballsRef.current;
      const actx = actxRef.current;
      const t = actx?.currentTime ?? 0;

      // Background
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, 0, W, H);

      for (const ball of balls) {
        // Physics
        ball.vy += GRAVITY * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.flash = Math.max(0, ball.flash - dt * 2.2);

        const speed = Math.hypot(ball.vx, ball.vy);

        // Wall collisions — reflect + optionally trigger note
        const hitNote = (wall: WallKey) => {
          if (actx && t - ball.lastNote > NOTE_GAP) {
            triggerWallNote(actx, wall);
            ball.lastNote = t;
          }
        };

        if (ball.y + BALL_R >= H) {
          ball.y = H - BALL_R;
          ball.vy = -(Math.abs(ball.vy) * RESTITUTION);
          if (Math.abs(ball.vy) > 28) { hitNote("bottom"); ball.flash = 1; }
        }
        if (ball.y - BALL_R <= 0) {
          ball.y = BALL_R;
          ball.vy = Math.abs(ball.vy) * RESTITUTION;
          if (ball.vy > 28) { hitNote("top"); ball.flash = Math.max(ball.flash, 0.8); }
        }
        if (ball.x - BALL_R <= 0) {
          ball.x = BALL_R;
          ball.vx = Math.abs(ball.vx) * RESTITUTION;
          if (ball.vx > 28) { hitNote("left"); ball.flash = Math.max(ball.flash, 0.65); }
        }
        if (ball.x + BALL_R >= W) {
          ball.x = W - BALL_R;
          ball.vx = -(Math.abs(ball.vx) * RESTITUTION);
          if (Math.abs(ball.vx) > 28) { hitNote("right"); ball.flash = Math.max(ball.flash, 0.65); }
        }

        // Draw glow + ball
        const color = BALL_COLORS[ball.colorIdx];
        const speedNorm = Math.min(1, speed / 450);
        const glowR = 10 + speedNorm * 20 + ball.flash * 28;

        ctx.save();
        ctx.shadowBlur = glowR;
        ctx.shadowColor = color;
        ctx.globalAlpha = 0.45 + ball.flash * 0.55;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        // Inner highlight
        ctx.beginPath();
        ctx.arc(
          ball.x - BALL_R * 0.28,
          ball.y - BALL_R * 0.28,
          BALL_R * 0.32,
          0, Math.PI * 2
        );
        ctx.fillStyle = `rgba(255,255,255,${0.1 + ball.flash * 0.38})`;
        ctx.fill();
        ctx.restore();
      }

      // Tap hint — visible until max balls reached
      if (balls.length < MAX_BALLS) {
        ctx.fillStyle = `rgba(255,255,255,${balls.length === 1 ? 0.3 : 0.18})`;
        ctx.font = "16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Tap anywhere to add a ball!", W / 2, 30);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  const handleCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      spawnBall(e.clientX - rect.left, e.clientY - rect.top);
    },
    [spawnBall]
  );

  // — Start screen —
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a14] px-6 select-none">
        {/* Preview balls */}
        <div className="flex gap-7 mb-10">
          {([0, 2, 4] as const).map((ci, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: 56,
                height: 56,
                background: BALL_COLORS[ci],
                boxShadow: `0 0 28px 10px ${BALL_COLORS[ci]}50`,
                transform: `translateY(${i === 1 ? 12 : -4}px)`,
              }}
            />
          ))}
        </div>

        <h1 className="text-3xl font-bold text-white/95 mb-3 text-center tracking-tight">
          Bounce Notes
        </h1>
        <p className="text-base text-white/75 text-center max-w-[280px] mb-10 leading-relaxed">
          Every bounce makes a sound!<br />
          Tap to add more balls 🎵
        </p>

        <button
          onClick={handleStart}
          className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white font-semibold text-xl rounded-2xl px-10 py-4 min-h-[64px] transition-colors"
        >
          Let&apos;s play! 🎵
        </button>

        <Link
          href="/dream"
          className="mt-14 text-sm text-white/55 hover:text-white/75 transition-colors"
        >
          ← Dream lab
        </Link>
      </div>
    );
  }

  // — Play screen —
  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100dvh" }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: "none", display: "block" }}
        onPointerDown={handleCanvasPointer}
      />

      {/* Ball count */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/55 pointer-events-none select-none">
        {count < MAX_BALLS
          ? `${MAX_BALLS - count} more ball${MAX_BALLS - count !== 1 ? "s" : ""} to add`
          : "5 balls — 🎶 full chorus!"}
      </div>

      <Link
        href="/dream"
        className="absolute top-4 left-4 text-sm text-white/55 hover:text-white/75 transition-colors"
      >
        ← Dream lab
      </Link>
    </div>
  );
}
