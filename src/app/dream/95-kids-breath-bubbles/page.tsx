"use client";

// **For**: kids (4+)
// Blow into the mic — colorful soap bubbles float up and pop with a soft pentatonic ding.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// C-major pentatonic, two octaves
const PENTA_HZ = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25] as const;

// Kid-friendly saturated palette (hex; used directly as CSS + canvas colors)
const PALETTE = [
  "#f87171",  // rose
  "#a78bfa",  // violet
  "#22d3ee",  // cyan
  "#34d399",  // emerald
  "#fbbf24",  // amber
  "#60a5fa",  // blue
] as const;

const PAD_FREQS   = [130.81, 164.81, 196.00] as const;
const MAX_BUBBLES = 40;
const BLOW_THRESH = 0.028;  // RMS threshold before bubbles start spawning

let _bid = 0;  // monotonic bubble id

interface Bubble {
  id: number;
  x: number;
  y: number;
  r: number;
  vy: number;
  wobPhase: number;
  wobAmp: number;
  colorIdx: number;
  noteHz: number;
  popping: boolean;
  popT: number;  // 0 → 1 while popping
}

// ── audio helpers ──────────────────────────────────────────────────────────────

function bootPad(actx: AudioContext) {
  PAD_FREQS.forEach((freq, i) => {
    const osc = actx.createOscillator();
    const g   = actx.createGain();
    const lfo = actx.createOscillator();
    const lg  = actx.createGain();
    osc.type = "sine";
    osc.frequency.value  = freq;
    g.gain.value         = 0.010;
    lfo.frequency.value  = 0.06 + i * 0.02;
    lg.gain.value        = 0.06;
    lfo.connect(lg);
    lg.connect(g.gain);
    osc.connect(g).connect(actx.destination);
    osc.start();
    lfo.start();
  });
}

function dingPop(actx: AudioContext, freq: number) {
  const t   = actx.currentTime;
  const g   = actx.createGain();
  g.gain.setValueAtTime(0.13, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  g.connect(actx.destination);
  const osc = actx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.5, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.82, t + 0.18);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + 0.32);
}

// ── spawn helper ───────────────────────────────────────────────────────────────

function makeBub(W: number, H: number, r?: number): Bubble {
  const radius   = r ?? (10 + Math.random() * 26);
  const colorIdx = Math.floor(Math.random() * PALETTE.length);
  const noteIdx  = Math.floor(Math.random() * PENTA_HZ.length);
  return {
    id:       _bid++,
    x:        radius + Math.random() * (W - radius * 2),
    y:        H + radius,
    r:        radius,
    vy:       -(1.1 + Math.random() * 0.7) * Math.max(0.7, 18 / radius),
    wobPhase: Math.random() * Math.PI * 2,
    wobAmp:   0.4 + Math.random() * 1.1,
    colorIdx,
    noteHz:   PENTA_HZ[noteIdx],
    popping:  false,
    popT:     0,
  };
}

// ── canvas drawing ─────────────────────────────────────────────────────────────

function drawBub(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, r: number,
  hex: string, alpha: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;

  // Glow halo
  ctx.shadowColor = hex;
  ctx.shadowBlur  = r * 0.9;
  ctx.fillStyle   = hex + "38";
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();

  // Rim
  ctx.shadowBlur   = 0;
  ctx.strokeStyle  = hex + "bb";
  ctx.lineWidth    = 1.5;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.stroke();

  // Highlight ellipse (top-left shine)
  ctx.fillStyle = "rgba(255,255,255,0.40)";
  ctx.beginPath();
  ctx.ellipse(bx - r * 0.28, by - r * 0.30, r * 0.22, r * 0.15, -0.65, 0, Math.PI * 2);
  ctx.fill();

  // Tiny specular dot
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.beginPath();
  ctx.arc(bx - r * 0.26, by - r * 0.28, r * 0.065, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ── component ──────────────────────────────────────────────────────────────────

export default function KidsBreathBubbles() {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const acxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef  = useRef<Float32Array | null>(null);
  const animRef     = useRef(0);
  const bubblesRef  = useRef<Bubble[]>([]);
  const spawnAccRef = useRef(0);
  const demoRef     = useRef(false);

  const [phase,    setPhase]    = useState<"idle" | "active">("idle");
  const [micError, setMicError] = useState(false);

  // ── start with mic ──────────────────────────────────────────────────────────

  async function startListening() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMicError(true);
      return;
    }

    const actx = new AudioContext();
    acxRef.current = actx;
    bootPad(actx);

    const analyser   = actx.createAnalyser();
    analyser.fftSize = 1024;
    const src        = actx.createMediaStreamSource(stream);
    src.connect(analyser);
    analyserRef.current = analyser;
    timeBufRef.current  = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    setMicError(false);
    setPhase("active");
  }

  // ── start demo mode (no mic) ────────────────────────────────────────────────

  function startDemo() {
    const actx = new AudioContext();
    acxRef.current = actx;
    bootPad(actx);
    demoRef.current = true;
    setPhase("active");
  }

  // ── canvas loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "active") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    let W   = window.innerWidth;
    let H   = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const applySize = () => {
      if (!canvas) return;
      W   = window.innerWidth;
      H   = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width        = W * dpr;
      canvas.height       = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.scale(dpr, dpr);
    };
    applySize();
    window.addEventListener("resize", applySize);

    const t0 = performance.now();
    let lastMs = t0;

    // Tap anywhere → manual bubble
    const onPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const r  = 15 + Math.random() * 22;
      const colorIdx = Math.floor(Math.random() * PALETTE.length);
      const noteIdx  = Math.floor(Math.random() * PENTA_HZ.length);
      bubblesRef.current.push({
        id: _bid++, x: px, y: py, r,
        vy:       -(1.2 + Math.random() * 0.6) * Math.max(0.7, 18 / r),
        wobPhase: Math.random() * Math.PI * 2,
        wobAmp:   0.5 + Math.random() * 1.1,
        colorIdx,
        noteHz:  PENTA_HZ[noteIdx],
        popping: false, popT: 0,
      });
      const acx = acxRef.current;
      if (acx) dingPop(acx, PENTA_HZ[noteIdx] * 1.25);
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    const renderLoop = () => {
      const now  = performance.now();
      const tSec = (now - t0) / 1000;
      const dt   = Math.min((now - lastMs) / 16.67, 3);
      lastMs = now;

      // Background gradient (deep indigo sky)
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#040918");
      grad.addColorStop(1, "#0a1230");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // ── breath detection / demo rms ──────────────────────────────────────
      let rms = 0;
      const analyser = analyserRef.current;
      const timeBuf  = timeBufRef.current;
      if (analyser && timeBuf) {
        analyser.getFloatTimeDomainData(timeBuf as unknown as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
        rms = Math.sqrt(sum / timeBuf.length);
      }
      if (demoRef.current) {
        // Slow breathing wave: quiet inhale, audible exhale
        rms = 0.042 * (0.5 + 0.5 * Math.abs(Math.sin(tSec * 0.48)));
      }

      // ── spawn bubbles from breath ─────────────────────────────────────────
      if (rms > BLOW_THRESH && bubblesRef.current.length < MAX_BUBBLES) {
        const rate = (rms - BLOW_THRESH) * 7.5;
        spawnAccRef.current += rate * dt;
        while (spawnAccRef.current >= 1) {
          spawnAccRef.current -= 1;
          const r = 8 + Math.min((rms - BLOW_THRESH) * 150, 24);
          bubblesRef.current.push(makeBub(W, H, r));
        }
      }

      // ── update + draw bubbles ─────────────────────────────────────────────
      const acx = acxRef.current;
      for (let i = bubblesRef.current.length - 1; i >= 0; i--) {
        const b = bubblesRef.current[i];

        if (b.popping) {
          b.popT += 0.06 * dt;
          if (b.popT >= 1) { bubblesRef.current.splice(i, 1); continue; }
          const pa  = Math.max(0, 1 - b.popT * 1.5);
          const pr  = b.r * (1 + b.popT * 2.6);
          const hex = PALETTE[b.colorIdx];
          // Expanding ring
          ctx.save();
          ctx.globalAlpha = pa * 0.55;
          ctx.strokeStyle = hex + "99";
          ctx.lineWidth   = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, pr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          // 8 radial dots
          for (let k = 0; k < 8; k++) {
            const angle = (k / 8) * Math.PI * 2;
            ctx.save();
            ctx.globalAlpha = pa * 0.80;
            ctx.fillStyle   = hex;
            ctx.beginPath();
            ctx.arc(
              b.x + Math.cos(angle) * pr * 0.85,
              b.y + Math.sin(angle) * pr * 0.85,
              3 * (1 - b.popT),
              0, Math.PI * 2,
            );
            ctx.fill();
            ctx.restore();
          }
          continue;
        }

        // Rise + horizontal wobble
        b.y += b.vy * dt;
        b.x += Math.sin(tSec * 0.92 + b.wobPhase) * b.wobAmp * dt;
        b.x  = Math.max(b.r, Math.min(W - b.r, b.x));

        // Pop when reaching the top margin
        if (b.y < b.r + 6) {
          b.popping = true;
          b.popT    = 0;
          if (acx) dingPop(acx, b.noteHz);
        } else {
          drawBub(ctx, b.x, b.y, b.r, PALETTE[b.colorIdx], 1);
        }
      }

      animRef.current = requestAnimationFrame(renderLoop);
    };

    animRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", applySize);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [phase]);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-[#040918] overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 touch-none" />

      {/* ── IDLE ── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6">
          <div className="text-center">
            <h1 className="text-white text-3xl font-mono tracking-wide mb-2">
              breath bubbles
            </h1>
            <p className="text-white/75 text-base font-mono">
              blow into the mic — bubbles float up and pop
            </p>
          </div>

          <button
            onClick={() => { void startListening(); }}
            className="flex items-center justify-center bg-cyan-500 hover:bg-cyan-400 text-white text-2xl font-bold rounded-full transition-colors"
            style={{ width: 160, height: 160 }}
          >
            Start
          </button>

          {micError && (
            <p className="text-rose-300 text-base font-mono text-center">
              microphone not available — check permissions
            </p>
          )}

          <button
            onClick={startDemo}
            className="text-white/55 hover:text-white/80 text-base font-mono underline transition-colors"
            style={{ minHeight: 44 }}
          >
            try without mic
          </button>
        </div>
      )}

      {/* ── ACTIVE hint ── */}
      {phase === "active" && (
        <div className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {demoRef.current ? (
            <span className="text-white/55 text-sm font-mono">demo — tap screen for bubbles</span>
          ) : (
            <>
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-white/75 text-sm font-mono">blow to make bubbles</span>
            </>
          )}
        </div>
      )}

      <Link
        href="/dream"
        className="absolute bottom-4 right-4 text-xs text-white/55 transition-colors hover:text-white/80"
      >
        ← dream lab
      </Link>
    </div>
  );
}
