"use client";
import { useEffect, useRef, useState } from "react";

const N = 6;

// Melody: C major pentatonic C3–E4
const MELODY_FREQS = [130.81, 164.81, 196.0, 220.0, 261.63, 329.63];
const MELODY_COLS = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#d97706", "#be185d"];

// Drums: warm palette
const DRUM_COLS = ["#f43f5e", "#f59e0b", "#10b981", "#06b6d4", "#ec4899", "#8b5cf6"];

function playMelody(actx: AudioContext, freq: number) {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, actx.currentTime);
  env.gain.linearRampToValueAtTime(0.4, actx.currentTime + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.65);
  osc.connect(env).connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + 0.7);
}

function drumKick(actx: AudioContext) {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.frequency.setValueAtTime(150, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, actx.currentTime + 0.25);
  env.gain.setValueAtTime(0.7, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.35);
  osc.connect(env).connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + 0.4);
}

function drumSnare(actx: AudioContext) {
  const bufLen = Math.floor(actx.sampleRate * 0.3);
  const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource();
  noise.buffer = buf;
  const bpf = actx.createBiquadFilter();
  bpf.type = "bandpass";
  bpf.frequency.value = 2500;
  bpf.Q.value = 0.8;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.5, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.28);
  noise.connect(bpf).connect(env).connect(actx.destination);
  noise.start();
  noise.stop(actx.currentTime + 0.3);
  const body = actx.createOscillator();
  const bodyEnv = actx.createGain();
  body.frequency.value = 200;
  bodyEnv.gain.setValueAtTime(0.4, actx.currentTime);
  bodyEnv.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.15);
  body.connect(bodyEnv).connect(actx.destination);
  body.start();
  body.stop(actx.currentTime + 0.18);
}

function drumHihat(actx: AudioContext) {
  const bufLen = Math.floor(actx.sampleRate * 0.18);
  const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource();
  noise.buffer = buf;
  const hpf = actx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 7000;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.32, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.14);
  noise.connect(hpf).connect(env).connect(actx.destination);
  noise.start();
  noise.stop(actx.currentTime + 0.18);
}

function drumTom(actx: AudioContext) {
  const osc = actx.createOscillator();
  const env = actx.createGain();
  osc.frequency.setValueAtTime(110, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, actx.currentTime + 0.28);
  env.gain.setValueAtTime(0.6, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.32);
  osc.connect(env).connect(actx.destination);
  osc.start();
  osc.stop(actx.currentTime + 0.38);
}

function drumClap(actx: AudioContext) {
  [0, 0.022].forEach((delay) => {
    const bLen = Math.floor(actx.sampleRate * 0.2);
    const b = actx.createBuffer(1, bLen, actx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < bLen; i++) d[i] = Math.random() * 2 - 1;
    const ns = actx.createBufferSource();
    ns.buffer = b;
    const bpf = actx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 1200;
    bpf.Q.value = 1.2;
    const env = actx.createGain();
    env.gain.setValueAtTime(0.45, actx.currentTime + delay);
    env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + delay + 0.18);
    ns.connect(bpf).connect(env).connect(actx.destination);
    ns.start(actx.currentTime + delay);
    ns.stop(actx.currentTime + delay + 0.22);
  });
}

function drumShaker(actx: AudioContext) {
  const bufLen = Math.floor(actx.sampleRate * 0.16);
  const buf = actx.createBuffer(1, bufLen, actx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource();
  noise.buffer = buf;
  const hpf = actx.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = 5500;
  const env = actx.createGain();
  env.gain.setValueAtTime(0.22, actx.currentTime);
  env.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.14);
  noise.connect(hpf).connect(env).connect(actx.destination);
  noise.start();
  noise.stop(actx.currentTime + 0.18);
}

const DRUM_FNS: ((actx: AudioContext) => void)[] = [
  drumKick,
  drumSnare,
  drumHihat,
  drumTom,
  drumClap,
  drumShaker,
];

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

function drawDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  r: number,
  col: string,
  on: boolean,
  fl: number
) {
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
  ctx.globalAlpha = on ? 0.95 : 0.16 + fl * 0.79;
  ctx.shadowColor = col;
  ctx.shadowBlur = on ? 20 + fl * 18 : fl * 22;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, cy, r * (1 + fl * 0.09), 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  if (on) {
    ctx.strokeStyle = col + "60";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, cy, r + 7, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export default function BeatBuilderPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const melodyRef = useRef<boolean[]>(Array(N).fill(false));
  const drumsRef = useRef<boolean[]>(Array(N).fill(false));
  const melodyFlashRef = useRef<number[]>(Array(N).fill(0));
  const drumsFlashRef = useRef<number[]>(Array(N).fill(0));
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
    melodyRef.current = Array(N).fill(false);
    drumsRef.current = Array(N).fill(false);
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

    const resize = () => {
      if (!canvas) return;
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : 400;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    };
    resize();
    window.addEventListener("resize", resize);

    const onPointer = (e: PointerEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const col = Math.floor((px / w) * N);
      if (col < 0 || col >= N) return;
      if (py < h * 0.5) {
        melodyRef.current[col] = !melodyRef.current[col];
        if (melodyRef.current[col]) {
          playMelody(actx, MELODY_FREQS[col]);
          melodyFlashRef.current[col] = 1.0;
        }
      } else {
        drumsRef.current[col] = !drumsRef.current[col];
        if (drumsRef.current[col]) {
          DRUM_FNS[col](actx);
          drumsFlashRef.current[col] = 1.0;
        }
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    let lastTs = 0;

    const frame = (ts: number) => {
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

      phaseRef.current += (bpmRef.current / 60) * dt;
      if (phaseRef.current >= N) phaseRef.current -= N;

      const curStep = Math.floor(phaseRef.current);
      if (curStep !== prevStepRef.current) {
        prevStepRef.current = curStep;
        if (melodyRef.current[curStep]) {
          playMelody(actx, MELODY_FREQS[curStep]);
          melodyFlashRef.current[curStep] = 1.0;
        }
        if (drumsRef.current[curStep]) {
          DRUM_FNS[curStep](actx);
          drumsFlashRef.current[curStep] = 1.0;
        }
      }

      for (let i = 0; i < N; i++) {
        melodyFlashRef.current[i] = Math.max(0, melodyFlashRef.current[i] - dt * 3.5);
        drumsFlashRef.current[i] = Math.max(0, drumsFlashRef.current[i] - dt * 3.5);
      }

      const slotW = w / N;
      const melodyY = h * 0.28;
      const drumsY = h * 0.72;
      const r = Math.min(slotW * 0.40, h * 0.20, 54);

      // Column dividers
      ctx.strokeStyle = "#ffffff08";
      ctx.lineWidth = 1;
      for (let i = 1; i < N; i++) {
        ctx.beginPath();
        ctx.moveTo(i * slotW, 0);
        ctx.lineTo(i * slotW, h);
        ctx.stroke();
      }

      // Horizontal separator between rows
      ctx.strokeStyle = "#ffffff14";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.5);
      ctx.lineTo(w, h * 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      // Melody row (top half, cool colors)
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * slotW;
        drawDot(
          ctx,
          x,
          melodyY,
          r,
          MELODY_COLS[i],
          melodyRef.current[i],
          melodyFlashRef.current[i]
        );
      }

      // Drums row (bottom half, warm colors, slightly smaller)
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * slotW;
        drawDot(
          ctx,
          x,
          drumsY,
          r * 0.85,
          DRUM_COLS[i],
          drumsRef.current[i],
          drumsFlashRef.current[i]
        );
      }

      // Sweep cursor beam (spans both rows)
      const curX = phaseRef.current * slotW;
      const beamGrad = ctx.createLinearGradient(curX - 5, 0, curX + 5, 0);
      beamGrad.addColorStop(0, "#ffffff00");
      beamGrad.addColorStop(0.5, "#ffffffa0");
      beamGrad.addColorStop(1, "#ffffff00");
      ctx.fillStyle = beamGrad;
      ctx.fillRect(curX - 5, 0, 10, h);

      rafRef.current = requestAnimationFrame(frame);
    };
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
      <div className="flex flex-col items-center justify-center h-screen bg-black text-white gap-6 p-6">
        <h1 className="text-3xl font-bold text-center">Beat Builder</h1>
        <p className="text-white/75 text-base text-center max-w-xs">
          Tap the{" "}
          <span className="text-violet-300 font-semibold">top row</span> for
          melody ♪
          <br />
          Tap the{" "}
          <span className="text-rose-300 font-semibold">bottom row</span> for
          drums
          <br />
          The sweeping light plays what you pick!
        </p>
        <button
          className="bg-violet-600 hover:bg-violet-500 text-white text-xl font-bold px-8 py-4 rounded-2xl min-h-[56px]"
          onClick={handleStart}
        >
          Let&apos;s jam! 🎵
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black select-none overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
        <span className="text-white/80 text-base font-bold">Beat Builder</span>
        <button
          onClick={clearAll}
          className="text-white/70 text-sm px-4 py-2 rounded-xl border border-white/20 min-h-[44px]"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-pointer"
        />
      </div>

      <div className="flex items-center justify-center gap-6 py-4 shrink-0">
        <button
          onClick={() => changeBpm(-16)}
          aria-label="slower"
          className="w-14 h-14 rounded-full border border-white/25 text-white text-2xl font-bold flex items-center justify-center min-h-[56px] min-w-[56px]"
        >
          −
        </button>
        <span className="text-white/80 text-lg font-mono w-24 text-center tabular-nums">
          {bpm} BPM
        </span>
        <button
          onClick={() => changeBpm(+16)}
          aria-label="faster"
          className="w-14 h-14 rounded-full border border-white/25 text-white text-2xl font-bold flex items-center justify-center min-h-[56px] min-w-[56px]"
        >
          +
        </button>
      </div>
    </div>
  );
}
