"use client";
import { useRef, useEffect, useState } from "react";

// C major pentatonic: C3 E3 G3 A3 C4
const FREQS  = [130.81, 164.81, 196.00, 220.00, 261.63];
const COLORS = ["#8b5cf6", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4"];
const NAMES  = ["C3", "E3", "G3", "A3", "C4"];

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
  r: number;
}

function playTone(actx: AudioContext, freq: number, gain: number) {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(gain, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.5);
  osc.connect(env);
  env.connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + 0.55);
}

function burst(sparks: Spark[], x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++) {
    const a   = (Math.PI * 2 * i) / n + Math.random() * 0.6;
    const spd = 80 + Math.random() * 220;
    sparks.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd - 20,
      life: 1, color,
      r: 2.5 + Math.random() * 3.5,
    });
  }
}

export default function KidsBeatPulse() {
  const [started, setStarted] = useState(false);
  const [bpm, setBpm]         = useState(70);
  const bpmRef    = useRef(70);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const actx   = new AudioContext();
    const dpr    = window.devicePixelRatio || 1;
    const sparks: Spark[] = [];

    let beatPhase = 0;   // 0 → 1 within current beat
    let beatIdx   = 0;   // cycles 0–4
    let pulseAmp  = 1.0; // 1→0, resets each beat
    let prevMs    = performance.now();

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Immediate first beat so the circle flashes on open
    playTone(actx, FREQS[0] * 0.5, 0.13);

    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const x  = e.clientX - rect.left;
      const y  = e.clientY - rect.top;
      // Proximity 0=on beat, 0.5=farthest off beat
      const prox   = Math.min(beatPhase, 1 - beatPhase);
      const onBeat = prox < 0.18;
      const col    = COLORS[beatIdx];
      burst(sparks, x, y, col, onBeat ? 20 : 9);
      if (onBeat) {
        // extra burst from circle center
        burst(sparks, canvas.offsetWidth / 2, canvas.offsetHeight / 2, col, 10);
      }
      playTone(actx, FREQS[beatIdx], onBeat ? 0.38 : 0.22);
    };
    canvas.addEventListener("pointerdown", onPointer, { passive: false });

    const frame = (nowMs: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = Math.min((nowMs - prevMs) / 1000, 0.05);
      prevMs = nowMs;

      const beatDur = 60 / bpmRef.current;
      beatPhase += dt / beatDur;
      if (beatPhase >= 1) {
        beatPhase -= Math.floor(beatPhase);
        beatIdx    = (beatIdx + 1) % 5;
        pulseAmp   = 1.0;
        playTone(actx, FREQS[beatIdx] * 0.5, 0.13);
      }
      pulseAmp = Math.max(0, pulseAmp - dt * 3.2);

      // Update sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x    += s.vx * dt;
        s.y    += s.vy * dt;
        s.vy   += 110 * dt;
        s.vx   *= 1 - dt * 2.4;
        s.life -= dt * 2.0;
        if (s.life <= 0) sparks.splice(i, 1);
      }

      const W  = canvas.offsetWidth;
      const H  = canvas.offsetHeight;
      const cx = W / 2;
      const cy = H / 2;
      const col    = COLORS[beatIdx];
      const baseR  = Math.min(W, H) * 0.30;
      const pulseR = baseR + pulseAmp * 22;

      // Background
      ctx.fillStyle = "#070010";
      ctx.fillRect(0, 0, W, H);

      // Beat-phase progress arc (thin ring showing position in beat)
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + 32, -Math.PI / 2,
              -Math.PI / 2 + beatPhase * Math.PI * 2);
      ctx.strokeStyle = col + "55";
      ctx.lineWidth   = 3;
      ctx.stroke();
      ctx.restore();

      // Glow halo behind circle
      const hexA = Math.round(10 + pulseAmp * 52).toString(16).padStart(2, "0");
      const grd  = ctx.createRadialGradient(cx, cy, pulseR * 0.6, cx, cy, pulseR + 52);
      grd.addColorStop(0, col + hexA);
      grd.addColorStop(1, "transparent");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR + 52, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      ctx.restore();

      // Main circle
      const hexS = Math.round(150 + pulseAmp * 105).toString(16).padStart(2, "0");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.fillStyle   = col + "18";
      ctx.fill();
      ctx.shadowColor = col;
      ctx.shadowBlur  = 18 + pulseAmp * 40;
      ctx.strokeStyle = col + hexS;
      ctx.lineWidth   = 2.5 + pulseAmp * 3;
      ctx.stroke();
      ctx.shadowBlur  = 0;
      ctx.restore();

      // Note name shown on beat flash
      if (pulseAmp > 0.25) {
        ctx.save();
        ctx.globalAlpha  = (pulseAmp - 0.25) / 0.75;
        ctx.font         = "bold 20px monospace";
        ctx.fillStyle    = col;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor  = col;
        ctx.shadowBlur   = 12;
        ctx.fillText(NAMES[beatIdx], cx, cy);
        ctx.shadowBlur   = 0;
        ctx.restore();
      }

      // Sparks
      ctx.save();
      for (const s of sparks) {
        ctx.globalAlpha = s.life;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2);
        ctx.fillStyle   = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur  = 7;
        ctx.fill();
      }
      ctx.shadowBlur  = 0;
      ctx.globalAlpha = 1;
      ctx.restore();

      // Persistent hint text at bottom
      ctx.save();
      ctx.globalAlpha  = 0.42;
      ctx.font         = "16px monospace";
      ctx.fillStyle    = "#ffffff";
      ctx.textAlign    = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("tap to play along 🎵", cx, H - 24);
      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", resize);
      actx.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#070010] text-foreground gap-6 px-6 text-center">
        <div className="text-5xl select-none" aria-hidden="true">🥁</div>
        <h1 className="text-2xl font-semibold text-foreground">Beat Pulse</h1>
        <p className="text-base text-muted-foreground max-w-xs">
          A glowing circle pulses with the beat — tap anywhere to play along!
        </p>
        <button
          className="min-h-[64px] min-w-[220px] bg-violet-500/20 hover:bg-violet-500/35 border border-violet-400/40 rounded-2xl px-8 py-4 text-foreground text-lg font-medium transition-colors"
          onPointerDown={() => setStarted(true)}
        >
          🎵 Let&apos;s play!
        </button>
        <p className="text-sm text-muted-foreground">no microphone needed · for kids 3+</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#070010]">
      <canvas ref={canvasRef} className="w-full h-full touch-none" />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-5 select-none">
        <button
          onPointerDown={() => setBpm(b => Math.max(40, b - 10))}
          className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-muted hover:bg-accent text-foreground text-2xl font-bold flex items-center justify-center"
        >
          −
        </button>
        <span className="text-muted-foreground text-base w-20 text-center tabular-nums">
          {bpm} BPM
        </span>
        <button
          onPointerDown={() => setBpm(b => Math.min(120, b + 10))}
          className="w-14 h-14 min-w-[56px] min-h-[56px] rounded-full bg-muted hover:bg-accent text-foreground text-2xl font-bold flex items-center justify-center"
        >
          +
        </button>
      </div>
    </div>
  );
}
