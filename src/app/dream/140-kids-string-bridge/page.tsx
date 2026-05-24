"use client";
import { useRef, useEffect, useState } from "react";

// C-major pentatonic across C2–C5 (3 octaves, 13 steps)
const PENTA_HZ = [
  65.41, 82.41, 98.0, 110.0, 130.81,
  164.81, 196.0, 220.0, 261.63,
  329.63, 392.0, 440.0, 523.25,
];
const NOTE_NAMES: Record<number, string> = {
  65.41: "C2", 82.41: "E2", 98.0: "G2", 110.0: "A2",
  130.81: "C3", 164.81: "E3", 196.0: "G3", 220.0: "A3",
  261.63: "C4", 329.63: "E4", 392.0: "G4", 440.0: "A4",
  523.25: "C5",
};

function snapToPenta(hz: number): number {
  return PENTA_HZ.reduce((p, c) =>
    Math.abs(c - hz) < Math.abs(p - hz) ? c : p
  );
}

// Shorter string = higher pitch (like a real string instrument)
function distToHz(dist: number): number {
  return snapToPenta(523.25 * 80 / Math.max(80, dist));
}

// Violet (C2, low) → amber (C5, high) — 280° to 30° on hue wheel
function hzToCol(hz: number): string {
  const t = Math.log2(hz / 65.41) / 3; // 0..1 across 3 octaves (log2(8)=3)
  const h = 280 - t * 250;
  return `hsl(${h.toFixed(1)}, 80%, 65%)`;
}

interface Pt { x: number; y: number }

export default function KidsStringBridge() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);
  const masterRef  = useRef<GainNode | null>(null);
  const [started, setStarted] = useState(false);

  const fingersRef = useRef<Map<number, Pt>>(new Map());
  // Mutable string state — read/written every frame and in event handlers
  const sRef = useRef({ amp: 0, phase: 0, freq: 261.63, col: hzToCol(261.63), lastDist: 0 });
  const oscRef = useRef<OscillatorNode | null>(null);
  const envRef = useRef<GainNode | null>(null);

  const handleStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const actx   = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.62;
    master.connect(actx.destination);
    actxRef.current  = actx;
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

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Trigger a pluck — retunes or creates the oscillator + resets visual amplitude
    const pluck = (hz: number, col: string) => {
      const s = sRef.current;
      s.freq = hz;
      s.col  = col;
      s.amp  = 1.0;

      const now = actx.currentTime;
      if (!oscRef.current) {
        const osc = actx.createOscillator();
        const env = actx.createGain();
        osc.type = "triangle";
        osc.frequency.value = hz;
        env.gain.value = 0;
        osc.connect(env);
        env.connect(master);
        osc.start();
        oscRef.current = osc;
        envRef.current = env;
      } else {
        oscRef.current.frequency.linearRampToValueAtTime(hz, now + 0.03);
      }
      const env = envRef.current as GainNode;
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(env.gain.value, now);
      env.gain.linearRampToValueAtTime(0.20, now + 0.012); // quick attack
      env.gain.exponentialRampToValueAtTime(0.07, now + 0.45); // decay to sustain
    };

    const releaseSound = () => {
      if (!envRef.current || !oscRef.current) return;
      const now     = actx.currentTime;
      const stopAt  = now + 0.35;
      envRef.current.gain.cancelScheduledValues(now);
      envRef.current.gain.setValueAtTime(envRef.current.gain.value, now);
      envRef.current.gain.exponentialRampToValueAtTime(0.001, stopAt - 0.05);
      oscRef.current.stop(stopAt);
      oscRef.current = null;
      envRef.current = null;
    };

    const getEndpoints = (): [Pt, Pt] | null => {
      const fps = Array.from(fingersRef.current.values());
      if (fps.length === 0) return null;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (fps.length === 1) return [{ x: W / 2, y: H / 2 }, fps[0]];
      return [fps[0], fps[1]]; // use only first two fingers
    };

    const retune = (forceRestart: boolean) => {
      const pts = getEndpoints();
      if (!pts) return;
      const [a, b] = pts;
      const dist   = Math.hypot(b.x - a.x, b.y - a.y);
      const hz     = distToHz(dist);
      const col    = hzToCol(hz);
      const s      = sRef.current;

      if (forceRestart || Math.abs(dist - s.lastDist) > 12) {
        s.lastDist = dist;
        pluck(hz, col);
      } else {
        s.lastDist = dist;
        s.freq = hz;
        s.col  = col;
        if (oscRef.current) {
          oscRef.current.frequency.linearRampToValueAtTime(hz, actx.currentTime + 0.05);
        }
      }
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      fingersRef.current.set(e.pointerId, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      canvas.setPointerCapture(e.pointerId);
      retune(true);
    };

    const onMove = (e: PointerEvent) => {
      const f = fingersRef.current.get(e.pointerId);
      if (!f) return;
      const rect = canvas.getBoundingClientRect();
      f.x = e.clientX - rect.left;
      f.y = e.clientY - rect.top;
      retune(false);
    };

    const onUp = (e: PointerEvent) => {
      fingersRef.current.delete(e.pointerId);
      if (fingersRef.current.size === 0) {
        releaseSound();
        sRef.current.amp = Math.min(sRef.current.amp, 0.6); // begin fade
      }
    };

    canvas.addEventListener("pointerdown",   onDown);
    canvas.addEventListener("pointermove",   onMove);
    canvas.addEventListener("pointerup",     onUp);
    canvas.addEventListener("pointercancel", onUp);

    const frame = (ts: number) => {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min(lastTs === 0 ? 16 : ts - lastTs, 80) * 0.001;
      lastTs = ts;

      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const s = sRef.current;

      // Amplitude envelope: floor at 0.18 while held, full decay on release
      if (fingersRef.current.size > 0) {
        s.amp = Math.max(0.18, s.amp - dt * 0.55); // decay to floor while held
      } else {
        s.amp = Math.max(0, s.amp - dt * 1.5); // faster fade on release
      }

      // Visual vibration phase: rate proportional to pitch (slow at C2, fast at C5)
      const visRate = Math.min(5.5, 0.8 * s.freq / 65.41);
      s.phase += dt * visRate;

      // ── Background ─────────────────────────────────────────────
      ctx.fillStyle = "#01080f";
      ctx.fillRect(0, 0, W, H);

      const pts = getEndpoints();

      if (!pts) {
        // Empty-state hint
        if (s.amp < 0.02) {
          ctx.save();
          ctx.globalAlpha  = 0.30;
          ctx.font         = "18px monospace";
          ctx.fillStyle    = "#fff";
          ctx.textAlign    = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("hold two fingers · closer = higher note", W / 2, H * 0.47);
          ctx.fillText("one finger also works", W / 2, H * 0.54);
          ctx.restore();
        }
        return;
      }

      const [a, b] = pts;
      const single  = fingersRef.current.size === 1;
      const dx      = b.x - a.x;
      const dy      = b.y - a.y;
      const dist    = Math.hypot(dx, dy) || 1;
      // Perpendicular unit vector (for standing-wave bow)
      const nx = -dy / dist;
      const ny =  dx / dist;
      const col = s.col;
      const amp = s.amp;
      const maxBow = Math.min(32, dist * 0.20) * amp;
      const N = 40;

      // ── Vibrating string ───────────────────────────────────────
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur  = 12 * amp + 4;
      ctx.strokeStyle = col;
      ctx.lineWidth   = 2.0 + amp * 1.5;
      ctx.globalAlpha = 0.70 + amp * 0.30;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const t   = i / N;
        // Standing wave: fundamental mode envelope × time oscillation
        const bow = maxBow * Math.sin(Math.PI * t) * Math.cos(2 * Math.PI * s.phase);
        const px  = a.x + dx * t + nx * bow;
        const py  = a.y + dy * t + ny * bow;
        if (i === 0) ctx.moveTo(px, py);
        else         ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();

      // ── Endpoint orbs ──────────────────────────────────────────
      const drawOrb = (cx: number, cy: number, r: number, alpha: number) => {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0,   "#ffffff");
        grad.addColorStop(0.3, col);
        grad.addColorStop(1,   col + "00");
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur  = r * 0.9;
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
      };

      if (single) {
        // Anchor dot: softly pulsing center dot to invite second finger
        const pulse = 0.25 + 0.12 * Math.sin(ts * 0.0018);
        drawOrb(a.x, a.y, 10, pulse);
      } else {
        drawOrb(a.x, a.y, 22, 0.85);
      }
      drawOrb(b.x, b.y, 22, 0.85);

      // ── Note name label ────────────────────────────────────────
      const noteName = NOTE_NAMES[s.freq];
      if (noteName && amp > 0.12) {
        const mx = (a.x + b.x) / 2;
        const my = Math.max(20, (a.y + b.y) / 2 - Math.abs(maxBow) - 16);
        ctx.save();
        ctx.globalAlpha  = Math.min(1, amp * 0.7);
        ctx.font         = "16px monospace";
        ctx.fillStyle    = col;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(noteName, mx, my);
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
        <div className="text-5xl select-none" aria-hidden="true">🎻</div>
        <h1 className="text-2xl font-serif text-white/95">String Bridge</h1>
        <p className="text-base text-white/75 max-w-xs">
          Hold two fingers on the screen. A glowing string stretches between
          them and sings. Move them closer for a higher note, farther apart
          for a lower one.
        </p>
        <div
          className="flex gap-3 items-center opacity-35 select-none mt-1"
          aria-hidden="true"
        >
          {["#8b5cf6", "#ec4899", "#f97316", "#f59e0b", "#10b981"].map((col, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: 12,
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
          ✨ Play the string
        </button>
        <p className="text-sm text-white/55">no microphone needed · for kids 4+</p>
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
