"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic: C3 E3 G3 A3 C4 — left→right across screen width
const NOTE_HZ   = [130.81, 164.81, 196.0, 220.0, 261.63];
const NOTE_COLS = ["#8b5cf6", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4"];
//                  violet     rose      amber    emerald    cyan

interface Orb {
  x: number;
  y: number;
  noteIdx: number;
  startMs: number;
  osc: OscillatorNode;
  env: GainNode;
}

interface Ring {
  x: number;
  y: number;
  noteIdx: number;
  r: number;
  speed: number;
  alpha: number;
}

export default function KidsHoldGlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef   = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const activeRef = useRef<Map<number, Orb>>(new Map());
  const ringsRef  = useRef<Ring[]>([]);
  const [started, setStarted] = useState(false);

  const handleStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const actx   = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.72;
    master.connect(actx.destination);
    actxRef.current   = actx;
    masterRef.current = master;
    setStarted(true);
  };

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const actx   = actxRef.current as AudioContext;
    const master = masterRef.current as GainNode;
    const dpr    = window.devicePixelRatio || 1;
    let rafId    = 0;
    let lastTs   = 0;
    let nowMs    = 0;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const pickNote = (px: number) =>
      Math.min(4, Math.floor((px / canvas.offsetWidth) * 5));

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      if (activeRef.current.size >= 5) return;
      const rect = canvas.getBoundingClientRect();
      const px   = e.clientX - rect.left;
      const py   = e.clientY - rect.top;
      const ni   = pickNote(px);
      const now  = actx.currentTime;

      const osc = actx.createOscillator();
      const env = actx.createGain();
      osc.type            = "triangle";
      osc.frequency.value = NOTE_HZ[ni];
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.18, now + 0.08);
      osc.connect(env);
      env.connect(master);
      osc.start(now);

      activeRef.current.set(e.pointerId, {
        x: px, y: py,
        noteIdx: ni,
        startMs: performance.now(),
        osc, env,
      });
      canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      const orb = activeRef.current.get(e.pointerId);
      if (!orb) return;
      const rect = canvas.getBoundingClientRect();
      orb.x = e.clientX - rect.left;
      orb.y = e.clientY - rect.top;
    };

    const onUp = (e: PointerEvent) => {
      const orb = activeRef.current.get(e.pointerId);
      if (!orb) return;
      activeRef.current.delete(e.pointerId);

      const holdSec = (performance.now() - orb.startMs) / 1000;
      const fadeLen = Math.max(0.12, 0.08 + holdSec * 0.12);
      const now     = actx.currentTime;
      orb.env.gain.linearRampToValueAtTime(0.001, now + fadeLen);
      orb.osc.stop(now + fadeLen + 0.06);

      ringsRef.current.push({
        x: orb.x, y: orb.y,
        noteIdx: orb.noteIdx,
        r: 20 + holdSec * 8,
        speed: 30 + holdSec * 16,
        alpha: 0.80,
      });
    };

    canvas.addEventListener("pointerdown",   onDown);
    canvas.addEventListener("pointermove",   onMove);
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onUp);

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(lastTs === 0 ? 16 : ts - lastTs, 80) * 0.001;
      lastTs = ts;
      nowMs  = ts;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      // Advance rings
      for (const ring of ringsRef.current) {
        ring.r     += ring.speed * dt;
        ring.alpha -= dt * 1.4;
      }
      ringsRef.current = ringsRef.current.filter(r => r.alpha > 0);

      // ── Background ────────────────────────────────────────────
      ctx.fillStyle = "#01080f";
      ctx.fillRect(0, 0, W, H);

      // Fading release rings
      ctx.save();
      for (const ring of ringsRef.current) {
        const col = NOTE_COLS[ring.noteIdx];
        ctx.globalAlpha = Math.max(0, ring.alpha) * 0.65;
        ctx.shadowColor = col;
        ctx.shadowBlur  = 10;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, 2 * Math.PI);
        ctx.strokeStyle = col;
        ctx.lineWidth   = 2.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();

      // Active glowing orbs
      ctx.save();
      for (const orb of activeRef.current.values()) {
        const holdSec = (nowMs - orb.startMs) / 1000;
        const t       = Math.min(1, holdSec / 4); // saturates at 4 seconds
        const col     = NOTE_COLS[orb.noteIdx];
        const coreR   = 28 + t * 64; // 28 → 92 px over 4 seconds
        const blur    = 18 + t * 40;

        // Outer halo
        ctx.globalAlpha = 0.20 + t * 0.30;
        ctx.shadowColor = col;
        ctx.shadowBlur  = blur * 2;
        const halo = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, coreR * 1.9);
        halo.addColorStop(0, col + "55");
        halo.addColorStop(1, col + "00");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, coreR * 1.9, 0, 2 * Math.PI);
        ctx.fill();

        // Core bright gradient
        ctx.globalAlpha = 0.80 + t * 0.16;
        ctx.shadowBlur  = blur;
        const core = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, coreR);
        core.addColorStop(0,    "#ffffff");
        core.addColorStop(0.22, col);
        core.addColorStop(1,    col + "00");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, coreR, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.restore();

      // Empty-state hint
      if (activeRef.current.size === 0 && ringsRef.current.length === 0) {
        ctx.save();
        ctx.globalAlpha  = 0.30;
        ctx.font         = "18px monospace";
        ctx.fillStyle    = "#fff";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("hold anywhere to glow", W / 2, H / 2);
        ctx.restore();
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown",   onDown);
      canvas.removeEventListener("pointermove",   onMove);
      canvas.removeEventListener("pointerup",     onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", resize);
      actx.close().catch(() => undefined);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#01080f] text-white gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">✨</div>
        <h1 className="text-2xl font-serif text-white/95">Hold & Glow</h1>
        <p className="text-base text-white/75 max-w-xs">
          Hold anywhere on the screen. The longer you hold, the brighter it glows
          and the richer the sound.
        </p>
        <div className="flex gap-3 items-center opacity-40 select-none mt-1" aria-hidden="true">
          {NOTE_COLS.map((col, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                backgroundColor: col,
                boxShadow: `0 0 8px ${col}`,
              }}
            />
          ))}
        </div>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/40 rounded-2xl px-8 py-4 text-white/95 text-lg font-medium transition-colors"
          onPointerDown={handleStart}
        >
          ✨ Start glowing
        </button>
        <p className="text-sm text-white/55">no microphone needed · for kids 3+</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        style={{ cursor: "none" }}
      />
    </div>
  );
}
