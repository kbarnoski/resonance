"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic: C3 → G4 (7 notes for 7 fish)
const SCALE_HZ = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63, 392.0];
const FISH_COLORS = [
  "#8b5cf6", // violet  — C3 (lowest)
  "#3b82f6", // blue    — E3
  "#06b6d4", // cyan    — G3
  "#10b981", // emerald — A3
  "#84cc16", // lime    — C4
  "#f59e0b", // amber   — E4
  "#f43f5e", // rose    — G4 (highest)
];
const N = 7;
const FL = 32; // fish body half-length in CSS px

interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stopped: number; // seconds remaining paused (0 = swimming)
  mouthT: number;  // 1=open → 0=closed, decays ~0.5s
  waggle: number;  // body-waggle phase
  noteIdx: number;
}

interface Splash {
  x: number;
  y: number;
  col: string;
  t: number; // 0→1 over 250ms
}

function buildImpulse(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const len = Math.floor(sr * 1.2);
  const buf = actx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  return buf;
}

function singNote(actx: AudioContext, conv: ConvolverNode, freq: number) {
  const now = actx.currentTime;
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.18, now + 0.03);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
  osc.connect(env);
  env.connect(actx.destination);
  env.connect(conv);
  osc.start(now);
  osc.stop(now + 0.85);
}

function paintFish(ctx: CanvasRenderingContext2D, f: Fish, col: string) {
  const angle = Math.atan2(f.vy, f.vx);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.rotate(angle + Math.sin(f.waggle) * 0.12);

  // Tail fin (forked V)
  ctx.beginPath();
  ctx.moveTo(-FL * 0.68, 0);
  ctx.lineTo(-FL * 1.32, -FL * 0.36);
  ctx.lineTo(-FL * 0.90, 0);
  ctx.lineTo(-FL * 1.32, FL * 0.36);
  ctx.closePath();
  ctx.shadowColor = col;
  ctx.shadowBlur = 8;
  ctx.fillStyle = col + "bb";
  ctx.fill();

  // Body ellipse
  ctx.beginPath();
  ctx.ellipse(0, 0, FL * 0.76, FL * 0.36, 0, 0, Math.PI * 2);
  ctx.shadowBlur = 14;
  ctx.fillStyle = col;
  ctx.fill();

  // Eye — white sclera + dark pupil
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(FL * 0.38, -FL * 0.09, FL * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(FL * 0.40, -FL * 0.09, FL * 0.046, 0, Math.PI * 2);
  ctx.fillStyle = "#111";
  ctx.fill();

  // Mouth arc (small when closed, wide when mouthT=1)
  const mouthAngle = Math.max(0.08, f.mouthT * 0.65);
  ctx.beginPath();
  ctx.arc(FL * 0.70, 0, FL * 0.1, -mouthAngle, mouthAngle);
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

export default function KidsFishTap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const convRef = useRef<ConvolverNode | null>(null);
  const [started, setStarted] = useState(false);

  function handleStart() {
    const actx = new AudioContext();
    actxRef.current = actx;

    const conv = actx.createConvolver();
    conv.buffer = buildImpulse(actx);
    const wet = actx.createGain();
    wet.gain.value = 0.16;
    conv.connect(wet);
    wet.connect(actx.destination);
    convRef.current = conv;

    // Ambient ocean pad — C2 + G2 + C3 sine drones
    [65.41, 98.0, 130.81].forEach((freq, idx) => {
      const osc = actx.createOscillator();
      const g = actx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.value = 0.013 - idx * 0.003;
      osc.connect(g);
      g.connect(actx.destination);
      osc.start();
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
    let rafId = 0;
    let t = 0;
    let last = 0;
    let inited = false;
    const splashes: Splash[] = [];

    const fishes: Fish[] = Array.from({ length: N }, (_, i) => ({
      x: 0,
      y: 0,
      vx: 55 + (i % 3) * 8,
      vy: (i % 2 === 0 ? 1 : -1) * (5 + (i % 3) * 4),
      stopped: 0,
      mouthT: 0,
      waggle: i * 1.1,
      noteIdx: i,
    }));

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (!inited) {
        inited = true;
        fishes.forEach((f, i) => {
          f.x = (0.08 + (i / N) * 0.84) * W;
          f.y = (0.3 + (i % 3) * 0.15) * H;
        });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const actx = actxRef.current;
      const conv = convRef.current;
      if (!actx || !conv) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      let bestI = -1;
      let bestD = 64; // CSS px hit radius
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(fishes[i].x - px, fishes[i].y - py);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      if (bestI >= 0 && fishes[bestI].stopped <= 0) {
        fishes[bestI].stopped = 0.88;
        fishes[bestI].mouthT = 1.0;
        singNote(actx, conv, SCALE_HZ[fishes[bestI].noteIdx]);
        splashes.push({ x: fishes[bestI].x, y: fishes[bestI].y, col: FISH_COLORS[fishes[bestI].noteIdx], t: 0 });
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    const frame = (ts: number) => {
      const dt = Math.min(last === 0 ? 16 : ts - last, 80) * 0.001;
      last = ts;
      t += dt;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      for (let i = 0; i < N; i++) {
        const f = fishes[i];
        f.waggle += dt * 5.5;
        f.mouthT = Math.max(0, f.mouthT - dt * 2.0);

        if (f.stopped > 0) {
          f.stopped -= dt;
          // Hover in place — bleed velocity toward zero
          f.vx *= 0.88;
          f.vy *= 0.88;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          continue;
        }

        // Boids: cohesion, alignment, separation
        let cx2 = 0, cy2 = 0, avx = 0, avy = 0, sx = 0, sy = 0, nb = 0;
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const dx = fishes[j].x - f.x;
          const dy = fishes[j].y - f.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 130) {
            cx2 += fishes[j].x;
            cy2 += fishes[j].y;
            avx += fishes[j].vx;
            avy += fishes[j].vy;
            nb++;
            if (dist < 50 && dist > 0.1) {
              sx -= (dx / dist) * 15;
              sy -= (dy / dist) * 15;
            }
          }
        }
        if (nb > 0) {
          f.vx += ((cx2 / nb) - f.x) * 0.005;   // cohesion
          f.vy += ((cy2 / nb) - f.y) * 0.005;
          f.vx += ((avx / nb) - f.vx) * 0.035;  // alignment
          f.vy += ((avy / nb) - f.vy) * 0.035;
        }
        f.vx += sx * 0.05; // separation
        f.vy += sy * 0.05;

        // Rightward swim bias + gentle vertical centering
        f.vx += (68 - f.vx) * 0.02;
        f.vy += (H * 0.48 - f.y) * 0.003;

        // Speed clamp
        const spd = Math.hypot(f.vx, f.vy);
        if (spd > 95) {
          f.vx = (f.vx / spd) * 95;
          f.vy = (f.vy / spd) * 95;
        } else if (spd < 28 && spd > 0.1) {
          f.vx = (f.vx / spd) * 28;
          f.vy = (f.vy / spd) * 28;
        }

        f.x += f.vx * dt;
        f.y += f.vy * dt;

        // Wrap horizontally, bounce vertically
        if (f.x > W + FL * 2) f.x = -FL * 2;
        if (f.x < -FL * 2) f.x = W + FL * 2;
        if (f.y < H * 0.08) f.vy = Math.abs(f.vy) + 8;
        if (f.y > H * 0.92) f.vy = -(Math.abs(f.vy) + 8);
      }

      // Background
      ctx.fillStyle = "#01091a";
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "rgba(0,10,38,0.75)");
      bg.addColorStop(0.6, "rgba(0,20,28,0.6)");
      bg.addColorStop(1, "rgba(0,15,12,0.75)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Caustic light shimmer (drifting elliptical gradients near the surface)
      ctx.save();
      ctx.globalAlpha = 0.045;
      for (let ci = 0; ci < 4; ci++) {
        const lcx = ((ci * 0.24 + t * 0.04) % 1.15) * W;
        const lcy = H * (0.12 + ci * 0.055);
        const lr = 55 + 25 * Math.sin(t * 0.65 + ci * 1.7);
        const cg = ctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lr);
        cg.addColorStop(0, "rgba(140,215,255,1)");
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(lcx, lcy, lr * 0.45, lr * 0.28, t * 0.4 + ci, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Draw fish back-to-front (lowest noteIdx drawn first)
      for (let i = 0; i < N; i++) {
        paintFish(ctx, fishes[i], FISH_COLORS[i]);
      }

      // Splash rings — brief expanding circle at fish position on tap, fades 250ms
      ctx.save();
      ctx.shadowBlur = 0;
      for (let si = splashes.length - 1; si >= 0; si--) {
        splashes[si].t = Math.min(1, splashes[si].t + dt * 4);
        const sp = splashes[si];
        ctx.globalAlpha = (1 - sp.t) * 0.72;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.t * 62, 0, Math.PI * 2);
        ctx.strokeStyle = sp.col;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        if (sp.t >= 1) splashes.splice(si, 1);
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#01091a] text-foreground gap-6 px-6 text-center">
        <div className="text-5xl select-none">🐠</div>
        <h1 className="text-2xl font-serif text-foreground">Fish School</h1>
        <p className="text-base text-muted-foreground max-w-xs">
          Tap a fish to hear it sing
        </p>
        <div className="flex gap-3 items-center opacity-40 select-none mt-2">
          {FISH_COLORS.slice(0, 5).map((col, i) => (
            <div
              key={i}
              style={{
                width: 32,
                height: 18,
                borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                backgroundColor: col,
                filter: "blur(1px)",
              }}
            />
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/25 hover:bg-violet-500/40 border border-violet-400/50 rounded-2xl px-8 py-4 text-foreground text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          🌊 Begin
        </button>
        <p className="text-sm text-muted-foreground">no microphone needed</p>
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
