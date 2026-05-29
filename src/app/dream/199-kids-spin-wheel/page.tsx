"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// **For**: kids (4+)
// 8-sector spinning wheel. Tap any segment to light it up (add a peg).
// A ✦ indicator at 12-o'clock plays each lit segment as it rotates past.
// C major pentatonic C3–A4 — every combination sounds good.

const N = 8;
const TWO_PI = Math.PI * 2;
const SECTOR_ARC = TWO_PI / N;
const NEEDLE = -Math.PI / 2; // 12-o'clock in canvas coords (Y-down)

// C major pentatonic: C3 E3 G3 A3 C4 E4 G4 A4
const NOTES: Array<{ freq: number; rgb: [number, number, number] }> = [
  { freq: 130.81, rgb: [124, 58,  237] }, // C3 — violet
  { freq: 164.81, rgb: [5,   150, 105] }, // E3 — emerald
  { freq: 196.00, rgb: [217, 119, 6  ] }, // G3 — amber
  { freq: 220.00, rgb: [225, 29,  72 ] }, // A3 — rose
  { freq: 261.63, rgb: [8,   145, 178] }, // C4 — cyan
  { freq: 329.63, rgb: [147, 51,  234] }, // E4 — purple
  { freq: 392.00, rgb: [22,  163, 74 ] }, // G4 — green
  { freq: 440.00, rgb: [251, 113, 133] }, // A4 — pink
];

// Additive bell tone: triangle fundamental + inharmonic partials
function ringNote(actx: AudioContext, freq: number) {
  const now = actx.currentTime;
  const master = actx.createGain();
  master.gain.setValueAtTime(0.001, now);
  master.gain.linearRampToValueAtTime(0.50, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
  master.connect(actx.destination);
  const partials: [number, number][] = [
    [1,     1.00],
    [2.756, 0.22],
    [5.404, 0.06],
  ];
  for (const [mul, g] of partials) {
    const osc = actx.createOscillator();
    const og  = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq * mul;
    og.gain.value = g;
    osc.connect(og).connect(master);
    osc.start(now);
    osc.stop(now + 1.4);
  }
}

type St = {
  actx:        AudioContext | null;
  rot:         number;
  bpm:         number;
  pegs:        boolean[];
  flash:       number[];
  needleFlash: number;
  fired:       boolean[];
  running:     boolean;
};

export default function SpinWheel() {
  const [bpm, setBpm] = useState(80);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stRef = useRef<St>({
    actx:        null,
    rot:         0,
    bpm:         80,
    pegs:        Array<boolean>(N).fill(false),
    flash:       Array<number>(N).fill(0),
    needleFlash: 0,
    fired:       Array<boolean>(N).fill(false),
    running:     false,
  });

  // Keep bpm in sync with stRef
  useEffect(() => { stRef.current.bpm = bpm; }, [bpm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const st = stRef.current;

    // ── Audio init (called on first tap — user gesture) ──────────────────
    function initAudio() {
      if (st.actx) return;
      const actx = new AudioContext();
      st.actx = actx;
      // Soft ambient pad: C3 + G3
      for (const freq of [130.81, 196.0]) {
        const osc = actx.createOscillator();
        const g   = actx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.value = 0.009;
        osc.connect(g).connect(actx.destination);
        osc.start();
      }
    }

    // ── Pointer handler ───────────────────────────────────────────────────
    function onPointerDown(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const R    = Math.min(rect.width, rect.height) * 0.43;
      const dx   = e.clientX - cx;
      const dy   = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > R || dist < R * 0.10) return;

      // Map tap to sector index (compensate for current rotation)
      const rel = ((Math.atan2(dy, dx) - st.rot) % TWO_PI + TWO_PI) % TWO_PI;
      const idx = Math.floor(rel / SECTOR_ARC) % N;
      st.pegs[idx] = !st.pegs[idx];

      initAudio();
      if (!st.running) st.running = true;
    }

    // ── Canvas resize ─────────────────────────────────────────────────────
    const resize = () => {
      const dpr     = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    canvas.addEventListener("pointerdown", onPointerDown);

    // ── Animation loop ────────────────────────────────────────────────────
    let rafId  = 0;
    let lastTs = 0;

    const animate = (ts: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const R  = Math.min(W, H) * 0.43;

      // Advance rotation: 1 revolution = N beats at current BPM
      if (st.running) {
        st.rot += (TWO_PI * st.bpm) / (60 * N) * dt;
      }
      const rot = st.rot;

      // ── Record base ───────────────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TWO_PI);
      ctx.fillStyle = "#111122";
      ctx.fill();

      // ── Sectors ───────────────────────────────────────────────────────
      for (let i = 0; i < N; i++) {
        const a0 = rot + i * SECTOR_ARC;
        const a1 = rot + (i + 1) * SECTOR_ARC;
        const on = st.pegs[i];
        const fl = st.flash[i];
        const [r, g, b] = NOTES[i].rgb;

        // Sector fill
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R * 0.90, a0, a1);
        ctx.closePath();
        ctx.globalAlpha = on ? 0.80 + fl * 0.20 : 0.14;
        ctx.fillStyle   = `rgb(${r},${g},${b})`;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Divider line
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * R * 0.90, cy + Math.sin(a0) * R * 0.90);
        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Glowing peg for active sector
        if (on) {
          const mid = rot + (i + 0.5) * SECTOR_ARC;
          const px  = cx + Math.cos(mid) * R * 0.60;
          const py  = cy + Math.sin(mid) * R * 0.60;
          const pr  = 12 + fl * 7;
          const grd = ctx.createRadialGradient(px, py, 0, px, py, pr);
          grd.addColorStop(0,   `rgba(${r},${g},${b},1.00)`);
          grd.addColorStop(0.5, `rgba(${r},${g},${b},0.55)`);
          grd.addColorStop(1,   `rgba(${r},${g},${b},0.00)`);
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, TWO_PI);
          ctx.fillStyle = grd;
          ctx.fill();
        }

        // Decay flash
        st.flash[i] = Math.max(0, fl - dt * 5);
      }

      // ── Center hole ───────────────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.10, 0, TWO_PI);
      ctx.fillStyle = "#060610";
      ctx.fill();

      // ── Outer ring decoration ─────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TWO_PI);
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth   = 2;
      ctx.stroke();

      // ── Needle — downward-pointing triangle at 12 o'clock ────────────
      const nfl = st.needleFlash;
      const nx  = cx + Math.cos(NEEDLE) * (R + 14);
      const ny  = cy + Math.sin(NEEDLE) * (R + 14);
      const tri = 9 + nfl * 5;
      ctx.beginPath();
      ctx.moveTo(nx, ny + tri * 1.4);          // tip pointing toward record
      ctx.lineTo(nx - tri, ny - tri * 0.35);
      ctx.lineTo(nx + tri, ny - tri * 0.35);
      ctx.closePath();
      ctx.fillStyle = nfl > 0.2 ? "#ffffff" : "rgba(255,255,255,0.55)";
      ctx.fill();
      st.needleFlash = Math.max(0, nfl - dt * 6);

      // ── Trigger detection ─────────────────────────────────────────────
      if (st.running) {
        for (let i = 0; i < N; i++) {
          const mid = rot + (i + 0.5) * SECTOR_ARC;
          let diff  = (mid - NEEDLE) % TWO_PI;
          if (diff >  Math.PI) diff -= TWO_PI;
          if (diff < -Math.PI) diff += TWO_PI;
          const near = Math.abs(diff) < SECTOR_ARC * 0.28;
          if (near && st.pegs[i] && !st.fired[i]) {
            st.fired[i]    = true;
            st.flash[i]    = 1.0;
            st.needleFlash = 1.0;
            if (st.actx) ringNote(st.actx, NOTES[i].freq);
          } else if (!near) {
            st.fired[i] = false; // reset so it fires again next revolution
          }
        }
      }

      // ── Pre-start hint ────────────────────────────────────────────────
      if (!st.running) {
        ctx.save();
        ctx.fillStyle    = "rgba(255,255,255,0.40)";
        ctx.font         = `${Math.round(R * 0.12)}px monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("tap to start", cx, cy);
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen bg-black text-white select-none">
      <div className="w-full max-w-md px-4 pt-6 pb-8 flex flex-col items-center gap-5">
        <div className="text-center">
          <h1 className="text-2xl font-mono font-bold">Spin Wheel</h1>
          <p className="text-white/75 text-base mt-1">
            Tap segments to light them — ✦ plays each as it spins past
          </p>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full aspect-square touch-none cursor-pointer"
        />

        <div className="flex items-center gap-6">
          <button
            onClick={() => setBpm((b) => Math.max(30, b - 10))}
            className="min-h-[48px] min-w-[48px] rounded-full bg-white/10 hover:bg-white/20 text-2xl font-bold transition"
            aria-label="Slower"
          >
            −
          </button>
          <span className="font-mono text-base text-white/80 w-20 text-center">
            {bpm} BPM
          </span>
          <button
            onClick={() => setBpm((b) => Math.min(160, b + 10))}
            className="min-h-[48px] min-w-[48px] rounded-full bg-white/10 hover:bg-white/20 text-2xl font-bold transition"
            aria-label="Faster"
          >
            +
          </button>
        </div>

        <button
          onClick={() => { stRef.current.pegs.fill(false); }}
          className="min-h-[44px] px-6 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-base text-white/80 transition"
        >
          Clear
        </button>

        <Link
          href="/dream"
          className="text-white/40 text-sm hover:text-white/60 transition"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
