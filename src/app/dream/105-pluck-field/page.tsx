"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Constants ──────────────────────────────────────────────────────────────
const COLS = 6;
const ROWS = 4;
const N = ROWS * COLS; // 24 strings

// C major hexatonic (C D E F G A) across octaves 2–5 → 24 unique pitches
const SEMIS = [0, 2, 4, 5, 7, 9];
const COL_NAMES = ["C", "D", "E", "F", "G", "A"];

const STRINGS = Array.from({ length: N }, (_, idx) => {
  const row = Math.floor(idx / COLS);
  const col = idx % COLS;
  const octave = row + 2;
  const midi = 12 + octave * 12 + SEMIS[col];
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  // Hue: violet (low C2) → amber/orange (high A5)
  const hue = Math.round(270 - (idx / (N - 1)) * 240);
  return { freq, name: `${COL_NAMES[col]}${octave}`, hue };
});

// ── Karplus-Strong synthesis ───────────────────────────────────────────────
// Pre-compute the pluck buffer offline; avoids all minimum-delay constraints.
function buildKarplusBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  const sr = ctx.sampleRate;
  // Low strings need longer buffers to fully decay
  const dur = Math.max(0.8, 2.4 - freq / 500);
  const bufLen = Math.round(sr * dur);
  const ringLen = Math.max(4, Math.round(sr / freq));

  // Initialize ring buffer with white noise (the initial pluck excitation)
  const ring = new Float32Array(ringLen);
  for (let i = 0; i < ringLen; i++) ring[i] = (Math.random() * 2 - 1) * 0.75;

  // KS feedback loop: low-pass average + slight gain < 1 → decaying periodic wave
  const data = new Float32Array(bufLen);
  for (let n = 0; n < bufLen; n++) {
    const i = n % ringLen;
    data[n] = ring[i];
    ring[i] = 0.996 * 0.5 * (ring[i] + ring[(n + 1) % ringLen]);
  }

  const buf = ctx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(data);
  return buf;
}

function playKarplusBuffer(ctx: AudioContext, buf: AudioBuffer): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.6;
  src.connect(g).connect(ctx.destination);
  src.start();
}

// ── Component ──────────────────────────────────────────────────────────────
export default function PluckField() {
  const [phase, setPhase] = useState<"idle" | "ready">("idle");
  const [micOn, setMicOn] = useState(false);

  const actxRef = useRef<AudioContext | null>(null);
  const bufsRef = useRef<AudioBuffer[]>([]);
  // Per-string pluck timestamp (ms, performance.now()), null = resting
  const pluckTsRef = useRef<(number | null)[]>(Array(N).fill(null));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const lastOnsetRef = useRef(false);

  const { running, error, start: startMic, stop: stopMic, getFrame } = useMicAnalyser({
    smoothing: 0.8,
    gain: 1.5,
    onsetThreshold: 1.8,
  });

  const pluckAt = useCallback((idx: number) => {
    const ctx = actxRef.current;
    if (!ctx || !bufsRef.current[idx]) return;
    playKarplusBuffer(ctx, bufsRef.current[idx]);
    pluckTsRef.current[idx] = performance.now();
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let prevTs = performance.now();

    const drawFrame = (now: number) => {
      prevTs = now;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
        c.scale(dpr, dpr);
      }

      c.fillStyle = "#04040e";
      c.fillRect(0, 0, W, H);

      // Mic onset → pluck a random string
      if (running) {
        const frame = getFrame();
        if (frame) {
          if (frame.onset && !lastOnsetRef.current) {
            pluckAt(Math.floor(Math.random() * N));
          }
          lastOnsetRef.current = frame.onset;
        }
      }

      // Grid geometry
      const padX = W * 0.05;
      const padTop = H * 0.1;
      const padBot = H * 0.1;
      const gW = W - padX * 2;
      const gH = H - padTop - padBot;
      const cW = gW / COLS;
      const cH = gH / ROWS;

      STRINGS.forEach(({ name, hue }, idx) => {
        const row = Math.floor(idx / COLS);
        const col = idx % COLS;
        const cx = padX + (col + 0.5) * cW;
        const cy = padTop + (row + 0.5) * cH;
        const half = cW * 0.42;

        const t0 = pluckTsRef.current[idx];
        const elapsed = t0 !== null ? (now - t0) / 1000 : null;

        if (elapsed !== null) {
          const amp = Math.exp(-elapsed / 1.3);

          if (amp < 0.015) {
            pluckTsRef.current[idx] = null;
          } else {
            // Animated damped standing wave — visual frequency proportional to pitch
            const vizHz = 1.8 + (idx / (N - 1)) * 5.5; // 1.8–7.3 Hz across the grid
            const maxD = cH * 0.36 * amp;
            const pts = 32;

            c.shadowColor = `hsla(${hue},90%,72%,${amp})`;
            c.shadowBlur = 12 * amp;
            c.strokeStyle = `hsla(${hue},85%,72%,${0.55 + amp * 0.45})`;
            c.lineWidth = 1.8 + amp * 1.5;
            c.beginPath();
            for (let p = 0; p <= pts; p++) {
              const frac = p / pts;
              const x = cx - half + frac * half * 2;
              // sin(π·frac) = fundamental standing-wave envelope (zero at endpoints)
              const y = cy + maxD * Math.sin(Math.PI * frac) * Math.cos(2 * Math.PI * vizHz * elapsed);
              if (p === 0) c.moveTo(x, y);
              else c.lineTo(x, y);
            }
            c.stroke();
            c.shadowBlur = 0;

            // Note name glows with the string
            const fs = Math.max(10, Math.min(13, cH * 0.2));
            c.fillStyle = `hsla(${hue},80%,82%,${amp * 0.9})`;
            c.font = `${fs}px monospace`;
            c.textAlign = "center";
            c.fillText(name, cx, cy + cH * 0.4);
          }
        }

        // Draw resting string (when idle or just finished decaying)
        if (pluckTsRef.current[idx] === null) {
          c.strokeStyle = `hsla(${hue},60%,45%,0.2)`;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(cx - half, cy);
          c.lineTo(cx + half, cy);
          c.stroke();

          const fs = Math.max(9, Math.min(11, cH * 0.18));
          c.fillStyle = `hsla(${hue},55%,58%,0.18)`;
          c.font = `${fs}px monospace`;
          c.textAlign = "center";
          c.fillText(name, cx, cy + cH * 0.38);
        }
      });

      // Octave labels on left margin
      ["Oct 2", "Oct 3", "Oct 4", "Oct 5"].forEach((label, row) => {
        const cy = padTop + (row + 0.5) * cH;
        c.fillStyle = "rgba(255,255,255,0.12)";
        c.font = "10px monospace";
        c.textAlign = "right";
        c.fillText(label, padX - 8, cy + 3);
      });

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, running, getFrame, pluckAt]);

  // ── Demo auto-pluck (stops when mic takes over) ───────────────────────────
  useEffect(() => {
    if (phase !== "ready" || micOn) return;

    let timer: ReturnType<typeof setTimeout>;
    const autoTick = () => {
      pluckAt(Math.floor(Math.random() * N));
      timer = setTimeout(autoTick, 800 + Math.random() * 2200);
    };
    timer = setTimeout(autoTick, 300);
    return () => clearTimeout(timer);
  }, [phase, micOn, pluckAt]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const ctx = new AudioContext();
    actxRef.current = ctx;
    bufsRef.current = STRINGS.map(({ freq }) => buildKarplusBuffer(ctx, freq));
    setPhase("ready");
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const rx = (e.clientX - r.left) / r.width;
      const ry = (e.clientY - r.top) / r.height;
      // Invert the grid padding fractions to map pointer → grid cell
      const padXf = 0.05;
      const padTopf = 0.1;
      const padBotf = 0.1;
      const gx = (rx - padXf) / (1 - 2 * padXf);
      const gy = (ry - padTopf) / (1 - padTopf - padBotf);
      const col = Math.floor(gx * COLS);
      const row = Math.floor(gy * ROWS);
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
        pluckAt(row * COLS + col);
      }
    },
    [pluckAt],
  );

  const toggleMic = useCallback(async () => {
    if (!micOn) {
      await startMic();
      setMicOn(true);
    } else {
      stopMic();
      setMicOn(false);
    }
  }, [micOn, startMic, stopMic]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      actxRef.current?.close();
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#04040e] px-6 text-center gap-6">
        <h1 className="text-3xl font-serif text-white">Pluck Field</h1>
        <p className="text-base text-white/75 max-w-sm">
          24 virtual strings across four octaves. Click any string to pluck it.
          Each string uses Karplus-Strong physical modeling — a noise burst
          filtered through a tuned feedback loop. The same algorithm behind
          every digital guitar, harp, and piano string synthesis.
        </p>
        <p className="text-sm text-white/55">
          Click individual strings · drag across a row for a glissando · add mic for onset auto-pluck
        </p>
        <button
          onClick={handleStart}
          className="min-h-[44px] px-6 py-3 bg-violet-600/80 hover:bg-violet-500/90 text-white text-base rounded-lg transition-colors"
        >
          Open the harp
        </button>
        <p className="text-xs text-white/40">
          C major hexatonic · 4 octaves · physical modeling synthesis · zero deps · zero API
        </p>
        <Link href="/dream" className="text-xs text-white/40 hover:text-white/60 transition-colors mt-1">
          ← dream lab
        </Link>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#04040e] overflow-hidden">
      {/* Header overlay */}
      <div className="absolute top-3 left-0 right-0 flex items-start justify-between px-5 z-10 pointer-events-none">
        <div>
          <p className="text-sm text-white/75 font-mono">Pluck Field</p>
          <p className="text-xs text-white/40">Karplus-Strong · click any string · drag for glissando</p>
        </div>
        <Link
          href="/dream"
          className="text-xs text-white/40 hover:text-white/60 transition-colors pointer-events-auto"
        >
          ← dream
        </Link>
      </div>

      {/* Main canvas — full screen, touch-action none prevents scroll */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-crosshair"
        onPointerDown={handlePointerDown}
        style={{ touchAction: "none" }}
      />

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4 z-10">
        {!micOn && <span className="text-xs text-white/40">demo: auto-strumming</span>}
        <button
          onClick={toggleMic}
          className={`min-h-[44px] px-5 py-2.5 text-base rounded-lg transition-colors ${
            micOn
              ? "bg-rose-500/60 hover:bg-rose-400/70 text-white"
              : "bg-white/10 hover:bg-white/20 text-white/75"
          }`}
        >
          {micOn ? "🎙 mic: on" : "🎤 add mic"}
        </button>
        {error && <p className="text-rose-300 text-sm">{error}</p>}
      </div>
    </div>
  );
}
