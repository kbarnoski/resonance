"use client";

// **For**: kids (4+)
// Tap anywhere to summon an echo Ghost. Each Ghost sings its note, drifts gently, then fades.
// Up to 8 Ghosts coexist — a whole chorus of wandering spirits.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENTA_HZ = [
  130.81, 146.83, 164.81, 196.00, 220.00,
  261.63, 293.66, 329.63, 392.00, 440.00,
] as const;

const PAD_FREQS = [130.81, 164.81, 196.00] as const;

const G_R         = 28;      // ghost body radius (px)
const GHOST_LIFE  = 4000;    // ghost lifetime (ms)
const MAX_GHOSTS  = 8;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
}

interface GhostEcho {
  x: number;
  y: number;
  bornAt: number;       // performance.now()
  scale: number;        // decays from 1.32 → 1.0 (tap pulse)
  sparkles: Sparkle[];
  driftPhase: number;   // phase offset for the drift oscillation
  driftAmp: number;     // px amplitude of the drift
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function noteHz(y: number, height: number): number {
  const idx = Math.floor((1 - y / height) * PENTA_HZ.length);
  return PENTA_HZ[Math.max(0, Math.min(PENTA_HZ.length - 1, idx))];
}

function playEchoNote(freq: number, acx: AudioContext) {
  const t    = acx.currentTime;
  const osc  = acx.createOscillator();
  const osc2 = acx.createOscillator();
  const gain = acx.createGain();
  const g2   = acx.createGain();

  osc.type  = "sine";
  osc.frequency.value  = freq;
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  g2.gain.value = 0.12;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.20, t + 0.04);
  gain.gain.setTargetAtTime(0, t + 0.30, 0.10);

  osc2.connect(g2).connect(gain);
  osc.connect(gain);
  gain.connect(acx.destination);

  osc.start(t);  osc2.start(t);
  osc.stop(t + 1.5);  osc2.stop(t + 1.5);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KidsGhostEcho() {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const acxRef     = useRef<AudioContext | null>(null);
  const animRef    = useRef(0);
  const ghostsRef  = useRef<GhostEcho[]>([]);
  const starsRef   = useRef<Array<{ x: number; y: number; r: number; a: number }>>([]);

  const [started, setStarted] = useState(false);

  // ── Canvas loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = window.innerWidth;
    let H = window.innerHeight;

    const applySize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W   = window.innerWidth;
      H   = window.innerHeight;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
    };

    applySize();

    starsRef.current = Array.from({ length: 70 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.45 + 0.15,
    }));

    const t0 = performance.now();

    // ── Ghost drawing ─────────────────────────────────────────────────────────

    function drawGhost(gx: number, gy: number, scale: number, alpha: number) {
      if (!canvas) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(gx, gy);
      ctx.scale(scale, scale);

      const R = G_R;

      ctx.shadowColor = "rgba(215,215,255,0.55)";
      ctx.shadowBlur  = 28;

      ctx.fillStyle = "rgba(238,238,255,0.93)";
      ctx.beginPath();
      ctx.moveTo(-R, R * 0.15);
      ctx.quadraticCurveTo(-R * 1.15, -R * 0.55, -R, -R);
      ctx.arc(0, -R, R, Math.PI, 0, true);
      ctx.quadraticCurveTo(R * 1.15, -R * 0.55, R, R * 0.15);
      ctx.quadraticCurveTo(R * 0.62, R * 0.76, R * 0.30, R * 0.15);
      ctx.quadraticCurveTo(0,         R * 0.78, -R * 0.30, R * 0.15);
      ctx.quadraticCurveTo(-R * 0.62, R * 0.76, -R,        R * 0.15);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur  = 0;
      ctx.shadowColor = "transparent";

      ctx.fillStyle = "rgba(18,18,45,0.90)";
      ctx.beginPath();
      ctx.ellipse(-R * 0.30, -R * 1.28, R * 0.17, R * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse( R * 0.30, -R * 1.28, R * 0.17, R * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(210,228,255,0.60)";
      ctx.beginPath();
      ctx.ellipse(-R * 0.26, -R * 1.33, R * 0.065, R * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse( R * 0.34, -R * 1.33, R * 0.065, R * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ── Frame loop ────────────────────────────────────────────────────────────

    function renderFrame() {
      const tSec = (performance.now() - t0) / 1000;
      const now  = performance.now();

      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = "#08051a";
      ctx.fillRect(0, 0, W, H);

      // Twinkling stars
      for (const star of starsRef.current) {
        const twk = 0.6 + 0.4 * Math.sin(tSec * 1.3 + star.x * 0.01);
        ctx.fillStyle = `rgba(200,215,255,${(star.a * twk).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ghosts (back to front by age — oldest behind newest)
      for (let i = ghostsRef.current.length - 1; i >= 0; i--) {
        const g = ghostsRef.current[i];
        const age = now - g.bornAt;

        if (age > GHOST_LIFE) {
          ghostsRef.current.splice(i, 1);
          continue;
        }

        const lifeT = age / GHOST_LIFE;
        const alpha = Math.pow(1 - lifeT, 0.75);

        // Tap pulse decay
        g.scale = 1 + (g.scale - 1) * 0.88;

        // Gentle autonomous drift
        const dx = Math.sin(tSec * 0.52 + g.driftPhase) * g.driftAmp;
        const dy = Math.sin(tSec * 0.38 + g.driftPhase * 1.4) * g.driftAmp * 0.65;

        // Sparkles
        for (let j = g.sparkles.length - 1; j >= 0; j--) {
          const sp = g.sparkles[j];
          sp.x    += sp.vx;
          sp.y    += sp.vy;
          sp.vy   += 0.04; // gentle gravity pull
          sp.life -= 0.025;
          if (sp.life <= 0) { g.sparkles.splice(j, 1); continue; }
          ctx.fillStyle = `rgba(195,182,255,${(sp.life * alpha).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 3 * sp.life, 0, Math.PI * 2);
          ctx.fill();
        }

        drawGhost(g.x + dx, g.y + dy, g.scale, alpha);
      }

      animRef.current = requestAnimationFrame(renderFrame);
    }

    animRef.current = requestAnimationFrame(renderFrame);

    const onResize = () => { applySize(); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // ── Pointer handler ────────────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Init audio on first tap
    if (!acxRef.current) {
      const acx = new AudioContext();
      acxRef.current = acx;
      for (const freq of PAD_FREQS) {
        const osc  = acx.createOscillator();
        const gain = acx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0.012;
        osc.connect(gain).connect(acx.destination);
        osc.start();
      }
      setStarted(true);
    }

    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;

    const acx = acxRef.current;
    if (acx) playEchoNote(noteHz(py, window.innerHeight), acx);

    // Remove oldest ghost if at cap
    if (ghostsRef.current.length >= MAX_GHOSTS) {
      let oldestIdx = 0;
      let oldest    = Infinity;
      for (let i = 0; i < ghostsRef.current.length; i++) {
        if (ghostsRef.current[i].bornAt < oldest) {
          oldest    = ghostsRef.current[i].bornAt;
          oldestIdx = i;
        }
      }
      ghostsRef.current.splice(oldestIdx, 1);
    }

    // Sparkle burst (upward fan)
    const sparkles: Sparkle[] = Array.from({ length: 16 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const spd   = Math.random() * 2.0 + 0.6;
      return {
        x:    px + (Math.random() - 0.5) * 12,
        y:    py + (Math.random() - 0.5) * 12,
        vx:   Math.cos(angle) * spd,
        vy:   Math.sin(angle) * spd - 0.9,
        life: 1,
      };
    });

    ghostsRef.current.push({
      x:          px,
      y:          py,
      bornAt:     performance.now(),
      scale:      1.32,
      sparkles,
      driftPhase: Math.random() * Math.PI * 2,
      driftAmp:   7 + Math.random() * 9,
    });

    e.preventDefault();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#08051a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
      />

      {!started && (
        <p className="pointer-events-none absolute bottom-24 w-full text-center text-base text-muted-foreground">
          Tap anywhere to summon an echo Ghost
        </p>
      )}

      <Link
        href="/dream"
        className="absolute bottom-4 right-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
    </div>
  );
}
