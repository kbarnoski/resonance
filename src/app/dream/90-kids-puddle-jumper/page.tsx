"use client";

// **For**: kids (4+)
// Tap the pond to drop stones — ripples expand, bounce off edges, build music.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type RGB = [number, number, number];

// C-major pentatonic across 2 octaves — every note sounds good
const PENTA_HZ: number[] = [
  130.81, 146.83, 164.81, 196.0, 220.0,   // C3 D3 E3 G3 A3
  261.63, 293.66, 329.63, 392.0, 440.0,   // C4 D4 E4 G4 A4
];

// Soft pond-water palette (blue/teal/cyan family)
const POND_COLORS: RGB[] = [
  [80,  205, 245],
  [100, 220, 255],
  [60,  180, 225],
  [120, 235, 215],
  [150, 215, 255],
];

interface Ripple {
  cx: number;
  cy: number;
  r: number;
  vr: number;      // expansion speed px/s
  alpha: number;
  decay: number;   // alpha/s
  color: RGB;
  lw: number;      // line width
  hitL: boolean;
  hitR: boolean;
  hitT: boolean;
  hitB: boolean;
  depth: number;   // reflection generation (capped at 2)
}

interface Splash {
  cx: number;
  cy: number;
  r: number;
  alpha: number;
}

export default function KidsPuddleJumper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ripplesRef  = useRef<Ripple[]>([]);
  const splashesRef = useRef<Splash[]>([]);
  const sizeRef     = useRef({ W: 0, H: 0 });
  const animRef     = useRef(0);
  const [started, setStarted] = useState(false);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const getAC = (): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ac = audioCtxRef.current;
    if (ac.state === "suspended") ac.resume();
    return ac;
  };

  const playPlop = (freq: number): void => {
    const ac = getAC();
    const t  = ac.currentTime;

    const osc = ac.createOscillator();
    const flt = ac.createBiquadFilter();
    const gn  = ac.createGain();

    // Characteristic "bloop": pitch dips then returns, mimicking water impact
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 1.8, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.38, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(freq,        t + 0.22);

    flt.type = "lowpass";
    flt.frequency.setValueAtTime(2600, t);
    flt.frequency.exponentialRampToValueAtTime(700, t + 0.14);

    gn.gain.setValueAtTime(0.58, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + 0.72);

    osc.connect(flt); flt.connect(gn); gn.connect(ac.destination);
    osc.start(t); osc.stop(t + 0.72);
  };

  const startAmbientPad = (): void => {
    const ac  = getAC();
    const t   = ac.currentTime;
    const dur = 600; // 10 min pad — enough for any session

    // Soft C-major triad at very low gain; makes the canvas feel "alive"
    [130.81, 164.81, 196.0].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gn  = ac.createGain();
      const flt = ac.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.value = freq;

      flt.type = "lowpass";
      flt.frequency.value = 480;

      const peak = 0.022 - i * 0.005;
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(peak, t + 3);
      gn.gain.setValueAtTime(peak, t + dur - 3);
      gn.gain.linearRampToValueAtTime(0, t + dur);

      osc.connect(flt); flt.connect(gn); gn.connect(ac.destination);
      osc.start(t + i * 0.2);
      osc.stop(t + dur);
    });
  };

  // ── Tap / spawn logic ──────────────────────────────────────────────────────

  const spawnAtPoint = (x: number, y: number): void => {
    const { W } = sizeRef.current;

    // Map X position across canvas to a pentatonic note
    const idx = Math.min(
      Math.round((x / Math.max(W, 1)) * (PENTA_HZ.length - 1)),
      PENTA_HZ.length - 1
    );
    playPlop(PENTA_HZ[idx]);

    // Bright center splash
    splashesRef.current.push({ cx: x, cy: y, r: 2, alpha: 1.0 });

    // Three staggered ripple rings per tap
    const color = POND_COLORS[Math.floor(Math.random() * POND_COLORS.length)];
    for (let i = 0; i < 3; i++) {
      ripplesRef.current.push({
        cx: x, cy: y,
        r:     3  + i * 9,
        vr:    90 + i * 22,
        alpha: 0.72 - i * 0.09,
        decay: 0.52 + i * 0.11,
        color,
        lw:    2.6 - i * 0.45,
        hitL: false, hitR: false, hitT: false, hitB: false,
        depth: 0,
      });
    }
  };

  // ── Start ──────────────────────────────────────────────────────────────────

  const handleStart = (): void => {
    getAC();
    startAmbientPad();
    setStarted(true);
  };

  // ── Render loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = (): void => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth;
      const H = window.innerHeight;
      sizeRef.current = { W, H };
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let prev = performance.now();

    const renderFrame = (now: number): void => {
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      const { W, H } = sizeRef.current;

      // Dark navy trail — low opacity preserves a ghost history of rings
      ctx.fillStyle = "rgba(4, 14, 35, 0.20)";
      ctx.fillRect(0, 0, W, H);

      // ── Splashes (bright center dot expanding quickly) ───────────────────
      splashesRef.current = splashesRef.current.filter((s) => {
        s.r     += 60 * dt;
        s.alpha -= 4.8 * dt;
        if (s.alpha <= 0) return false;
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = "rgba(210, 245, 255, 1)";
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return true;
      });

      // ── Ripple rings ─────────────────────────────────────────────────────
      ctx.globalCompositeOperation = "lighter";
      const toAdd: Ripple[] = [];

      ripplesRef.current = ripplesRef.current.filter((rip) => {
        rip.r     += rip.vr * dt;
        rip.alpha -= rip.decay * dt;
        if (rip.alpha <= 0.01) return false;

        const [r, g, b] = rip.color;
        ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(rip.alpha, 0.88)})`;
        ctx.lineWidth   = rip.lw;
        ctx.beginPath();
        ctx.arc(rip.cx, rip.cy, rip.r, 0, Math.PI * 2);
        ctx.stroke();

        // Wall reflections: spawn a dimmer mirror ripple when ring hits edge.
        // depth ≤ 1 so reflections only reflect once more (prevents exponential spawn).
        if (rip.depth < 2) {
          if (!rip.hitL && rip.cx - rip.r <= 0) {
            rip.hitL = true;
            toAdd.push({ ...rip, cx: -rip.cx,         alpha: rip.alpha * 0.42, vr: rip.vr * 0.62, depth: rip.depth + 1, hitL: true,  hitR: false, hitT: false, hitB: false });
          }
          if (!rip.hitR && rip.cx + rip.r >= W) {
            rip.hitR = true;
            toAdd.push({ ...rip, cx: 2 * W - rip.cx,  alpha: rip.alpha * 0.42, vr: rip.vr * 0.62, depth: rip.depth + 1, hitL: false, hitR: true,  hitT: false, hitB: false });
          }
          if (!rip.hitT && rip.cy - rip.r <= 0) {
            rip.hitT = true;
            toAdd.push({ ...rip, cy: -rip.cy,          alpha: rip.alpha * 0.42, vr: rip.vr * 0.62, depth: rip.depth + 1, hitL: false, hitR: false, hitT: true,  hitB: false });
          }
          if (!rip.hitB && rip.cy + rip.r >= H) {
            rip.hitB = true;
            toAdd.push({ ...rip, cy: 2 * H - rip.cy,  alpha: rip.alpha * 0.42, vr: rip.vr * 0.62, depth: rip.depth + 1, hitL: false, hitR: false, hitT: false, hitB: true  });
          }
        }

        return true;
      });

      ctx.globalCompositeOperation = "source-over";

      if (toAdd.length) {
        ripplesRef.current.push(...toAdd);
      }
      // Cap total to keep RAF at 60fps even on heavy multi-tap
      if (ripplesRef.current.length > 100) {
        ripplesRef.current.splice(0, ripplesRef.current.length - 100);
      }

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {/* Pond canvas — fills entire play area */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        style={{ background: "#040e23" }}
        onPointerDown={(e) => {
          if (!started) return;
          e.preventDefault();
          const rect = canvasRef.current!.getBoundingClientRect();
          spawnAtPoint(e.clientX - rect.left, e.clientY - rect.top);
        }}
      />

      {/* Start screen */}
      {!started && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
          style={{ background: "linear-gradient(180deg, #040e23 0%, #051830 100%)" }}
        >
          <div className="text-8xl mb-6 select-none" aria-hidden>🫧</div>
          <h1 className="text-4xl font-bold text-foreground mb-4">Puddle Jumper</h1>
          <p className="text-lg text-foreground max-w-xs mb-10 leading-relaxed">
            Tap the pond to make splashes and music!
          </p>
          <button
            onClick={handleStart}
            style={{ minHeight: 80, minWidth: 260, fontSize: "1.5rem" }}
            className="font-bold rounded-3xl bg-violet-500 hover:bg-violet-400 active:scale-95 text-foreground transition-all shadow-xl shadow-violet-500/40 px-10 py-5"
          >
            💧 Play! 💧
          </button>
          <Link
            href="/dream"
            className="mt-12 text-base text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream lab
          </Link>
        </div>
      )}

      {/* Back link during play (unobtrusive, top-left) */}
      {started && (
        <Link
          href="/dream"
          className="absolute top-4 left-4 text-sm text-muted-foreground/70 hover:text-muted-foreground z-10"
        >
          ← back
        </Link>
      )}
    </div>
  );
}
