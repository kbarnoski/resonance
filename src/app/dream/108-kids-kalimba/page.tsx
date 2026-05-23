"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// 8 C-major pentatonic notes across 2 octaves: C3 E3 G3 A3 C4 E4 G4 A4
const MIDI_NOTES = [48, 52, 55, 57, 60, 64, 67, 69];
const N = MIDI_NOTES.length;

// Vivid distinct colors — violet through pink, one per bar
const BAR_HEX = [
  "#7c3aed", // C3 violet
  "#4f46e5", // E3 indigo
  "#0284c7", // G3 sky
  "#0891b2", // A3 cyan
  "#059669", // C4 emerald
  "#ca8a04", // E4 amber
  "#ea580c", // G4 orange
  "#db2777", // A4 pink
];

function noteFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const FREQS = MIDI_NOTES.map(noteFreq);
const BASE_FREQ = FREQS[0]; // C3 = 130.81 Hz

// Karplus-Strong: pre-compute entire pluck offline (avoids delay-line constraints)
function buildKarplusBuffer(ctx: AudioContext, freq: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = Math.max(1.5, 3.8 - freq / 320);
  const bufLen = Math.round(sr * dur);
  const ringLen = Math.max(4, Math.round(sr / freq));
  const ring = new Float32Array(ringLen);
  for (let i = 0; i < ringLen; i++) ring[i] = (Math.random() * 2 - 1) * 0.82;
  const data = new Float32Array(bufLen);
  for (let n = 0; n < bufLen; n++) {
    const ri = n % ringLen;
    data[n] = ring[ri];
    ring[ri] = 0.9972 * 0.5 * (ring[ri] + ring[(n + 1) % ringLen]);
  }
  const buf = ctx.createBuffer(1, bufLen, sr);
  buf.getChannelData(0).set(data);
  return buf;
}

function playBuffer(ctx: AudioContext, buf: AudioBuffer): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.65;
  src.connect(g).connect(ctx.destination);
  src.start();
}

function startAmbientPad(ctx: AudioContext): void {
  [48, 52, 55].forEach((midi) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = noteFreq(midi);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(ctx.destination);
    osc.start();
    g.gain.setTargetAtTime(0.016, ctx.currentTime, 1.5);
  });
}

// Bar positions — same formula used in both draw loop and hit-test
function computeLayout(W: number): { x: number; barW: number }[] {
  const totalW = Math.min(W * 0.88, 560);
  const startX = (W - totalW) / 2;
  const gap = Math.max(5, totalW * 0.022);
  const barW = (totalW - gap * (N - 1)) / N;
  return Array.from({ length: N }, (_, i) => ({
    x: startX + i * (barW + gap),
    barW,
  }));
}

function hitBar(rectW: number, localX: number): number {
  const totalW = Math.min(rectW * 0.88, 560);
  const startX = (rectW - totalW) / 2;
  const gap = Math.max(5, totalW * 0.022);
  const barW = (totalW - gap * (N - 1)) / N;
  const idx = Math.floor((localX - startX) / (barW + gap));
  return Math.max(0, Math.min(N - 1, idx));
}

// Rounded rectangle path — top corners only (bottom flush with baseline)
function drawBarPath(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const r = Math.min(w * 0.45, 10);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h);
  c.lineTo(x, y + h);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

export default function KidsKalimba() {
  const [phase, setPhase] = useState<"idle" | "ready">("idle");

  const actxRef = useRef<AudioContext | null>(null);
  const bufsRef = useRef<AudioBuffer[]>([]);
  const pluckTsRef = useRef<(number | null)[]>(Array(N).fill(null));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const lastBarByPtr = useRef<Map<number, number>>(new Map());
  const touchedRef = useRef(false);

  const pluckBar = useCallback((idx: number) => {
    const ctx = actxRef.current;
    if (!ctx || idx < 0 || idx >= N) return;
    if (!bufsRef.current[idx]) return;
    playBuffer(ctx, bufsRef.current[idx]);
    pluckTsRef.current[idx] = performance.now();
  }, []);

  // Animation loop
  useEffect(() => {
    if (phase !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    const drawFrame = (now: number) => {
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

      const topPad = 88;
      const bottomPad = 64;
      const playH = H - topPad - bottomPad;
      const baseY = H - bottomPad;
      const maxBarH = playH * 0.86;
      const layout = computeLayout(W);

      // Draw each bar
      FREQS.forEach((freq, i) => {
        const barH = maxBarH * (BASE_FREQ / freq);
        const { x, barW } = layout[i];
        const barTop = baseY - barH;
        const hex = BAR_HEX[i];

        const t0 = pluckTsRef.current[i];
        const elapsed = t0 !== null ? (now - t0) / 1000 : 0;
        const amp = t0 !== null ? Math.exp(-elapsed / 1.4) : 0;
        if (amp < 0.01 && t0 !== null) pluckTsRef.current[i] = null;

        c.save();
        c.shadowColor = hex;
        c.shadowBlur = 6 + amp * 34;

        const grd = c.createLinearGradient(x, barTop, x, baseY);
        grd.addColorStop(0, hex + "ff");
        grd.addColorStop(0.45, hex + "cc");
        grd.addColorStop(1, hex + "44");
        c.fillStyle = grd;
        drawBarPath(c, x, barTop, barW, barH);
        c.fill();
        c.restore();

        // Ripple line traveling down the bar on pluck
        if (amp > 0.08) {
          const ripT = Math.min(1, elapsed * 2.2);
          const ripY = barTop + ripT * barH * 0.9;
          c.strokeStyle = `rgba(255,255,255,${amp * 0.78})`;
          c.lineWidth = 2;
          c.beginPath();
          c.moveTo(x + 2, ripY);
          c.lineTo(x + barW - 2, ripY);
          c.stroke();
        }

        // Bright dot above bar tip on pluck
        if (amp > 0.1) {
          c.shadowColor = "#ffffff";
          c.shadowBlur = 12;
          c.fillStyle = `rgba(255,255,255,${amp * 0.92})`;
          c.beginPath();
          c.arc(x + barW / 2, barTop - 7, 4.5, 0, Math.PI * 2);
          c.fill();
          c.shadowBlur = 0;
        }

        // Dim outline when at rest (keeps bars visible without glare)
        if (amp < 0.04) {
          c.strokeStyle = hex + "30";
          c.lineWidth = 1;
          drawBarPath(c, x, barTop, barW, barH);
          c.stroke();
        }
      });

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Demo: gentle arpeggiated sequence — pauses the moment a child touches
  useEffect(() => {
    if (phase !== "ready") return;
    const seq = [0, 4, 2, 6, 1, 5, 3, 7, 4, 0, 6, 2, 5, 3, 7, 1];
    let si = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (!touchedRef.current) {
        pluckBar(seq[si % seq.length]);
        si++;
      }
      timer = setTimeout(next, 850 + Math.random() * 750);
    };
    timer = setTimeout(next, 600);
    return () => clearTimeout(timer);
  }, [phase, pluckBar]);

  const handleStart = useCallback(() => {
    const ctx = new AudioContext();
    actxRef.current = ctx;
    bufsRef.current = FREQS.map((f) => buildKarplusBuffer(ctx, f));
    startAmbientPad(ctx);
    setPhase("ready");
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      touchedRef.current = true;
      const r = canvas.getBoundingClientRect();
      const idx = hitBar(r.width, e.clientX - r.left);
      lastBarByPtr.current.set(e.pointerId, idx);
      pluckBar(idx);
    },
    [pluckBar],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.buttons === 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const idx = hitBar(r.width, e.clientX - r.left);
      const last = lastBarByPtr.current.get(e.pointerId);
      if (last !== idx) {
        lastBarByPtr.current.set(e.pointerId, idx);
        pluckBar(idx);
      }
    },
    [pluckBar],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      lastBarByPtr.current.delete(e.pointerId);
    },
    [],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      actxRef.current?.close();
    };
  }, []);

  // ── Start screen ──────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#04040e] px-8 text-center gap-8">
        {/* Mini kalimba preview — bar heights mirror play screen */}
        <div className="flex items-end gap-1.5 h-24" aria-hidden="true">
          {BAR_HEX.map((color, i) => {
            const frac = BASE_FREQ / FREQS[i];
            return (
              <div
                key={i}
                className="rounded-t-md"
                style={{
                  width: "28px",
                  height: `${frac * 100}%`,
                  background: color,
                  opacity: 0.85,
                }}
              />
            );
          })}
        </div>

        <h1 className="text-4xl font-bold text-white tracking-tight">Kalimba</h1>

        <p className="text-lg text-white/75 max-w-xs leading-relaxed">
          Eight glowing bars — tap any bar to pluck it. Taller bars ring low, shorter bars ring high.
          Drag across for a glissando.
        </p>

        <button
          onClick={handleStart}
          className="min-h-[64px] px-10 py-4 bg-violet-600 hover:bg-violet-500 text-white text-xl font-semibold rounded-2xl transition-colors"
        >
          Let&apos;s play! 🎵
        </button>

        <p className="text-sm text-white/55">
          Karplus-Strong string synthesis · zero permissions · zero API
        </p>

        <Link
          href="/dream"
          className="text-sm text-white/40 hover:text-white/60 transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    );
  }

  // ── Play screen ───────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-screen bg-[#04040e] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-4 z-10 pointer-events-none">
        <div>
          <p className="text-lg font-semibold text-white/90">Kalimba</p>
          <p className="text-sm text-white/55">tap · slide · play</p>
        </div>
        <Link
          href="/dream"
          className="text-sm text-white/40 hover:text-white/60 transition-colors pointer-events-auto"
        >
          ← dream
        </Link>
      </div>

      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
