"use client";
import { useEffect, useRef, useState } from "react";

// 6-step loop sequencer: pentatonic C-major, full-column tap zones, sweep cursor
const N = 6;
const FREQS = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63]; // C3 E3 G3 A3 C4 E4
const COLS = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706", "#be185d"];

function playTone(actx: AudioContext, freq: number) {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, actx.currentTime);
  env.gain.linearRampToValueAtTime(0.42, actx.currentTime + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.65);
  osc.connect(env).connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + 0.7);
}

function startAmbient(actx: AudioContext) {
  [130.81, 164.81, 196.0].forEach((f) => {
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    g.gain.value = 0.007;
    osc.connect(g).connect(actx.destination);
    osc.start();
  });
}

export default function DotSeqPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const stepsRef = useRef<boolean[]>(Array(N).fill(false));
  const flashRef = useRef<number[]>(Array(N).fill(0));
  const bpmRef = useRef(80);
  const phaseRef = useRef(0);
  const prevStepRef = useRef(-1);
  const rafRef = useRef(0);
  const [started, setStarted] = useState(false);
  const [bpm, setBpm] = useState(80);

  function changeBpm(delta: number) {
    const next = Math.max(40, Math.min(160, bpmRef.current + delta));
    bpmRef.current = next;
    setBpm(next);
  }

  function clearAll() {
    stepsRef.current = Array(N).fill(false);
  }

  function handleStart() {
    const actx = new AudioContext();
    actxRef.current = actx;
    startAmbient(actx);
    setStarted(true);
  }

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const actx = actxRef.current!;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas) return;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : 280;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    resize();
    window.addEventListener("resize", resize);

    // Full-column tap zones: any tap in column i toggles step i.
    function onPointer(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const w = canvas.width / dpr;
      const col = Math.floor((px / w) * N);
      if (col < 0 || col >= N) return;
      stepsRef.current[col] = !stepsRef.current[col];
      if (stepsRef.current[col]) {
        playTone(actx, FREQS[col]);
        flashRef.current[col] = 1.0;
      }
    }
    canvas.addEventListener("pointerdown", onPointer);

    let lastTs = 0;

    function frame(ts: number) {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dt = Math.min((ts - lastTs) / 1000, 0.1);
      lastTs = ts;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#060609";
      ctx.fillRect(0, 0, w, h);

      // Advance sweep cursor (phase: 0 → N, wrapping)
      phaseRef.current += (bpmRef.current / 60) * dt;
      if (phaseRef.current >= N) phaseRef.current -= N;

      const curStep = Math.floor(phaseRef.current);
      if (curStep !== prevStepRef.current) {
        prevStepRef.current = curStep;
        if (stepsRef.current[curStep]) {
          playTone(actx, FREQS[curStep]);
          flashRef.current[curStep] = 1.0;
        }
      }

      for (let i = 0; i < N; i++) {
        flashRef.current[i] = Math.max(0, flashRef.current[i] - dt * 3.5);
      }

      const slotW = w / N;
      const cy = h * 0.5;
      const r = Math.min(slotW * 0.38, h * 0.33, 56);

      // Draw column dividers (very subtle)
      ctx.strokeStyle = "#ffffff08";
      ctx.lineWidth = 1;
      for (let i = 1; i < N; i++) {
        ctx.beginPath();
        ctx.moveTo(i * slotW, h * 0.14);
        ctx.lineTo(i * slotW, h * 0.86);
        ctx.stroke();
      }

      // Draw dots
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * slotW;
        const on = stepsRef.current[i];
        const fl = flashRef.current[i];
        const col = COLS[i];

        // Outer glow when lit
        if (on || fl > 0.02) {
          const gR = r * (1.6 + fl * 0.5);
          const grad = ctx.createRadialGradient(x, cy, r * 0.3, x, cy, gR);
          grad.addColorStop(0, col + "3a");
          grad.addColorStop(1, col + "00");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, cy, gR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dot body
        ctx.globalAlpha = on ? 0.95 : 0.16 + fl * 0.79;
        ctx.shadowColor = col;
        ctx.shadowBlur = on ? 20 + fl * 18 : fl * 22;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, cy, r * (1 + fl * 0.09), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        // Subtle ring when on (shows it&apos;s toggled)
        if (on) {
          ctx.strokeStyle = col + "60";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, cy, r + 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Sweep cursor beam: vertical white line aligned with current phase
      const curX = phaseRef.current * slotW;
      const beamGrad = ctx.createLinearGradient(curX - 5, 0, curX + 5, 0);
      beamGrad.addColorStop(0, "#ffffff00");
      beamGrad.addColorStop(0.5, "#ffffffa0");
      beamGrad.addColorStop(1, "#ffffff00");
      ctx.fillStyle = beamGrad;
      ctx.fillRect(curX - 5, h * 0.1, 10, h * 0.8);

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      void actx.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-foreground gap-6 p-6">
        <h1 className="text-3xl font-bold text-center">Dot Sequencer</h1>
        <p className="text-muted-foreground text-base text-center max-w-xs">
          Tap the dots to light them up.
          <br />
          The sweeping light plays each glowing dot as it passes!
        </p>
        <button
          className="bg-violet-600 hover:bg-violet-500 text-foreground text-xl font-bold px-8 py-4 rounded-2xl min-h-[56px]"
          onClick={handleStart}
        >
          Let&apos;s go! 🎵
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black select-none overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
        <span className="text-foreground text-base font-bold">Dot Sequencer</span>
        <button
          onClick={clearAll}
          className="text-muted-foreground text-sm px-4 py-2 rounded-xl border border-border min-h-[44px]"
        >
          Clear
        </button>
      </div>

      {/* Canvas — full-column tap zones, sweep cursor */}
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-pointer"
        />
      </div>

      {/* BPM control */}
      <div className="flex items-center justify-center gap-6 py-4 shrink-0">
        <button
          onClick={() => changeBpm(-16)}
          aria-label="slower"
          className="w-14 h-14 rounded-full border border-border text-foreground text-2xl font-bold flex items-center justify-center min-h-[56px] min-w-[56px]"
        >
          −
        </button>
        <span className="text-foreground text-lg font-mono w-24 text-center tabular-nums">
          {bpm} BPM
        </span>
        <button
          onClick={() => changeBpm(+16)}
          aria-label="faster"
          className="w-14 h-14 rounded-full border border-border text-foreground text-2xl font-bold flex items-center justify-center min-h-[56px] min-w-[56px]"
        >
          +
        </button>
      </div>
    </div>
  );
}
