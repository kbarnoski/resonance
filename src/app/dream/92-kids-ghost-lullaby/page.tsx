"use client";

// **For**: kids (4+)
// The Ghost floats gently across a starry night sky.
// Tap her to hear a note. Drag her to hear a glissando.
// After 2 minutes she fades and sings a lullaby.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const PENTA_HZ = [
  130.81, 146.83, 164.81, 196.00, 220.00,
  261.63, 293.66, 329.63, 392.00, 440.00,
] as const;

const PAD_FREQS = [130.81, 164.81, 196.00] as const; // C3 E3 G3

const LULLABY_HZ = [
  329.63, 293.66, 261.63, 220.00,
  196.00, 220.00, 261.63, 130.81,
] as const;

const G_R = 32; // ghost reference radius (px)

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 → 0
}

// ── Module-level audio helpers ─────────────────────────────────────────────────

function calcNoteHz(y: number, height: number): number {
  const idx = Math.floor((1 - y / height) * PENTA_HZ.length);
  const clamped = Math.max(0, Math.min(PENTA_HZ.length - 1, idx));
  return PENTA_HZ[clamped];
}

function fireNote(
  freq: number,
  acx: AudioContext,
  prevGain: { current: GainNode | null },
) {
  const t = acx.currentTime;

  // Fade out previous note
  if (prevGain.current) {
    prevGain.current.gain.setTargetAtTime(0, t, 0.03);
  }

  const osc  = acx.createOscillator();
  const osc2 = acx.createOscillator();
  const gain = acx.createGain();
  const g2   = acx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;
  osc2.type = "sine";
  osc2.frequency.value = freq * 2;
  g2.gain.value = 0.12;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.26, t + 0.04);
  gain.gain.setTargetAtTime(0, t + 0.32, 0.07);

  osc2.connect(g2).connect(gain);
  osc.connect(gain);
  gain.connect(acx.destination);

  osc.start(t);
  osc2.start(t);
  osc.stop(t + 1.0);
  osc2.stop(t + 1.0);

  prevGain.current = gain;
}

function schedLullaby(acx: AudioContext) {
  const BPM = 72;
  const dur  = 60 / BPM; // seconds per note
  const REPS = 3;
  let rep = 0;

  function playRound() {
    const t = acx.currentTime;
    LULLABY_HZ.forEach((freq, i) => {
      const osc  = acx.createOscillator();
      const gain = acx.createGain();
      const t0   = t + i * dur;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.20, t0 + 0.05);
      gain.gain.setTargetAtTime(0, t0 + dur * 0.7, 0.06);
      osc.connect(gain).connect(acx.destination);
      osc.start(t0);
      osc.stop(t0 + dur * 1.4);
    });
    rep++;
    if (rep < REPS) {
      setTimeout(playRound, LULLABY_HZ.length * dur * 1000 + 500);
    }
  }

  playRound();
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KidsGhostLullaby() {
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const acxRef        = useRef<AudioContext | null>(null);
  const animRef       = useRef(0);
  const ghostXRef     = useRef(0);
  const ghostYRef     = useRef(0);
  const ghostScaleRef = useRef(1);
  const ghostAlphaRef = useRef(1);
  const isDragRef     = useRef(false);
  const dragXRef      = useRef(0);
  const dragYRef      = useRef(0);
  const sparklesRef   = useRef<Sparkle[]>([]);
  const phaseRef      = useRef<"idle" | "awake" | "lullaby">("idle");
  const sessStartRef  = useRef(0);
  const lastNoteYRef  = useRef(-9999);
  const activeGRef    = useRef<GainNode | null>(null);
  const starsRef      = useRef<Array<{ x: number; y: number; r: number; a: number }>>([]);

  const [started,   setStarted]   = useState(false);
  const [isLullaby, setIsLullaby] = useState(false);

  // ── Audio init (called on first user gesture) ──────────────────────────────

  function beginAudio() {
    if (acxRef.current) return;
    const acx = new AudioContext();
    acxRef.current = acx;
    // Soft ambient pad
    for (const freq of PAD_FREQS) {
      const osc  = acx.createOscillator();
      const gain = acx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.015;
      osc.connect(gain).connect(acx.destination);
      osc.start();
    }
  }

  // ── Canvas animation loop ──────────────────────────────────────────────────

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

    // Initial ghost position
    ghostXRef.current = W / 2;
    ghostYRef.current = H / 2;

    // Generate static stars
    starsRef.current = Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * 0.45 + 0.15,
    }));

    const t0 = performance.now();

    // ── Ghost drawing ────────────────────────────────────────────────────────

    function drawGhost(gx: number, gy: number, scale: number, alpha: number) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(gx, gy);
      ctx.scale(scale, scale);

      const R = G_R;

      // Body glow
      ctx.shadowColor = "rgba(215,215,255,0.55)";
      ctx.shadowBlur  = 34;

      // Ghost body path
      ctx.fillStyle = "rgba(238,238,255,0.93)";
      ctx.beginPath();
      ctx.moveTo(-R, R * 0.15);
      ctx.quadraticCurveTo(-R * 1.15, -R * 0.55, -R, -R);
      ctx.arc(0, -R, R, Math.PI, 0, true); // top dome (counterclockwise)
      ctx.quadraticCurveTo(R * 1.15, -R * 0.55, R, R * 0.15);
      // Three wavy bumps at the bottom
      ctx.quadraticCurveTo(R * 0.62, R * 0.76, R * 0.30, R * 0.15);
      ctx.quadraticCurveTo(0,         R * 0.78, -R * 0.30, R * 0.15);
      ctx.quadraticCurveTo(-R * 0.62, R * 0.76, -R,        R * 0.15);
      ctx.closePath();
      ctx.fill();

      // Clear shadow for eyes
      ctx.shadowBlur  = 0;
      ctx.shadowColor = "transparent";

      // Eyes (positioned in the dome, above center)
      ctx.fillStyle = "rgba(18,18,45,0.90)";
      ctx.beginPath();
      ctx.ellipse(-R * 0.30, -R * 1.28, R * 0.17, R * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse( R * 0.30, -R * 1.28, R * 0.17, R * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tiny eye shines
      ctx.fillStyle = "rgba(210,228,255,0.60)";
      ctx.beginPath();
      ctx.ellipse(-R * 0.26, -R * 1.33, R * 0.065, R * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse( R * 0.34, -R * 1.33, R * 0.065, R * 0.075, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ── Frame loop ───────────────────────────────────────────────────────────

    function renderFrame() {
      const tSec = (performance.now() - t0) / 1000;

      // Check for lullaby transition
      if (phaseRef.current === "awake" && sessStartRef.current > 0) {
        if (Date.now() - sessStartRef.current > 120_000) {
          phaseRef.current = "lullaby";
          setIsLullaby(true);
          if (acxRef.current) schedLullaby(acxRef.current);
        }
      }

      // Fade ghost during lullaby
      if (phaseRef.current === "lullaby") {
        ghostAlphaRef.current = Math.max(0.14, ghostAlphaRef.current - 0.0015);
      }

      // Scale pulse decay (tap feedback)
      ghostScaleRef.current = 1 + (ghostScaleRef.current - 1) * 0.88;

      // Autonomous Lissajous drift
      if (!isDragRef.current) {
        const Rx = W * 0.27;
        const Ry = H * 0.21;
        ghostXRef.current = W / 2 + Rx * Math.sin(tSec * 0.55 + 0.7);
        ghostYRef.current = H / 2 + Ry * Math.sin(tSec * 0.38);
      } else {
        // Smooth follow during drag
        ghostXRef.current += (dragXRef.current - ghostXRef.current) * 0.22;
        ghostYRef.current += (dragYRef.current - ghostYRef.current) * 0.22;
        // Sparkle trail
        if (sparklesRef.current.length < 100) {
          const angle = Math.random() * Math.PI * 2;
          const spd   = Math.random() * 1.8 + 0.4;
          sparklesRef.current.push({
            x:  ghostXRef.current + (Math.random() - 0.5) * 18,
            y:  ghostYRef.current + (Math.random() - 0.5) * 18,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd - 0.6,
            life: 1,
          });
        }
      }

      // ── Render ───────────────────────────────────────────────────────────

      ctx.clearRect(0, 0, W, H);

      // Sky background
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

      // Sparkles
      for (let i = sparklesRef.current.length - 1; i >= 0; i--) {
        const s = sparklesRef.current[i];
        s.x   += s.vx;
        s.y   += s.vy;
        s.life -= 0.022;
        if (s.life <= 0) { sparklesRef.current.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(195,182,255,${(s.life * 0.88).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3 * s.life, 0, Math.PI * 2);
        ctx.fill();
      }

      // Idle hint pulse (first 6 s before any interaction)
      if (phaseRef.current === "idle" && tSec < 6) {
        const pt = (tSec % 2) / 2;
        const pR = G_R * 1.1 + pt * 54;
        ctx.strokeStyle = `rgba(205,188,255,${(0.55 * (1 - pt)).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ghostXRef.current, ghostYRef.current, pR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ghost
      drawGhost(
        ghostXRef.current,
        ghostYRef.current,
        ghostScaleRef.current,
        ghostAlphaRef.current,
      );

      animRef.current = requestAnimationFrame(renderFrame);
    }

    animRef.current = requestAnimationFrame(renderFrame);

    const onResize = () => { applySize(); };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;

    // First touch: init audio + start session timer
    if (!started) {
      beginAudio();
      setStarted(true);
      phaseRef.current     = "awake";
      sessStartRef.current = Date.now();
    }

    // Hit test — generous radius (2.5×) for 4yo motor accuracy
    const dist = Math.hypot(px - ghostXRef.current, py - ghostYRef.current);
    if (dist < G_R * 2.5) {
      isDragRef.current     = true;
      dragXRef.current      = px;
      dragYRef.current      = py;
      ghostScaleRef.current = 1.28; // tap pulse

      const acx = acxRef.current;
      if (acx) {
        fireNote(calcNoteHz(py, window.innerHeight), acx, activeGRef);
        lastNoteYRef.current = py;
      }
    }

    e.preventDefault();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDragRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;

    dragXRef.current = px;
    dragYRef.current = py;

    // Play a new note for every 24px of vertical movement
    const acx = acxRef.current;
    if (acx && Math.abs(py - lastNoteYRef.current) > 24) {
      fireNote(calcNoteHz(py, window.innerHeight), acx, activeGRef);
      lastNoteYRef.current = py;
    }

    e.preventDefault();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    isDragRef.current = false;
    e.preventDefault();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#08051a]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* First-visit hint */}
      {!started && (
        <p className="pointer-events-none absolute bottom-20 w-full text-center text-base text-muted-foreground">
          Tap the ghost to hear her sing
        </p>
      )}

      {/* Lullaby overlay */}
      {isLullaby && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <p className="font-semibold text-3xl text-foreground">Sweet dreams</p>
          <p className="text-2xl">🌙</p>
        </div>
      )}

      {/* Corner nav */}
      <Link
        href="/dream"
        className="absolute bottom-4 right-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
    </div>
  );
}
