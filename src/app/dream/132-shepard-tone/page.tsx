"use client";
import { useEffect, useRef, useState } from "react";

const N = 8;          // oscillators (A1–A8)
const BASE = 55;      // A1 Hz
const CENTER = (N - 1) / 2; // 3.5 — bell-curve peak

function bellEnv(logOct: number, sigma = 1.55): number {
  const d = logOct - CENTER;
  return Math.exp(-(d * d) / (2 * sigma * sigma));
}

const NOTE_NAMES = ["A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab"];

type StepMode = "glide" | "whole" | "semi";

interface State {
  asc: boolean;
  rate: number;
  stepMode: StepMode;
  frozen: boolean;
}

export default function ShepardTonePage() {
  const [started, setStarted] = useState(false);
  const [asc, setAsc] = useState(true);
  const [rate, setRate] = useState(5);
  const [stepMode, setStepMode] = useState<StepMode>("glide");
  const [frozen, setFrozen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<State>({ asc: true, rate: 5, stepMode: "glide", frozen: false });

  useEffect(() => { stateRef.current.asc = asc; }, [asc]);
  useEffect(() => { stateRef.current.rate = rate; }, [rate]);
  useEffect(() => { stateRef.current.stepMode = stepMode; }, [stepMode]);
  useEffect(() => { stateRef.current.frozen = frozen; }, [frozen]);

  useEffect(() => {
    if (!started) return;

    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.65;
    master.connect(ac.destination);

    const oscs: OscillatorNode[] = [];
    const envGains: GainNode[] = [];
    for (let i = 0; i < N; i++) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = BASE * Math.pow(2, i);
      g.gain.value = 0;
      osc.connect(g);
      g.connect(master);
      osc.start();
      oscs.push(osc);
      envGains.push(g);
    }

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    let phase = 0;
    let prevT = ac.currentTime;
    let stepAccum = 0;
    let rafId = 0;

    function drawFrame() {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = "#07070f";
      ctx.fillRect(0, 0, W, H);

      // Global hue cycles as phase climbs: violet→rose→amber→... one full revolution per octave
      const hue = (220 + phase * 300) % 360;

      // --- Oscillator circles (vertical stack, A1=bottom, A8=top) ---
      const stackTop = H * 0.06;
      const stackBot = H * 0.78;
      const stackH = stackBot - stackTop;
      const cx = W / 2;

      for (let i = 0; i < N; i++) {
        const logOct = i + phase;
        const env = bellEnv(logOct);
        const cy = stackBot - (i / (N - 1)) * stackH;
        const maxR = Math.min(W * 0.1, 42);
        const r = 4 + maxR * env;
        const alpha = 0.1 + 0.85 * env;

        ctx.save();
        ctx.shadowBlur = 4 + 60 * env;
        ctx.shadowColor = `hsla(${hue},85%,72%,0.7)`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue},68%,62%,${alpha})`;
        ctx.fill();
        ctx.restore();

        // Octave label when bright enough
        if (env > 0.07) {
          const freqHz = BASE * Math.pow(2, logOct);
          const octNum = Math.round(Math.log2(freqHz / 27.5)) + 1;
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, env * 2)})`;
          ctx.font = "11px monospace";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(`A${octNum}`, cx + r + 8, cy);
        }
      }

      // --- Phase indicator ring (bottom-right) ---
      const rR = 32;
      const rCx = W * 0.82;
      const rCy = H * 0.86;
      const angle = phase * Math.PI * 2 - Math.PI / 2;

      // Ring track
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rCx, rCy, rR, 0, Math.PI * 2);
      ctx.stroke();

      // Trailing arc (last 270° of the phase ring)
      const trailStart = angle - Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(rCx, rCy, rR, trailStart, angle);
      ctx.strokeStyle = `hsla(${hue},70%,60%,0.25)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dot on ring
      const dotX = rCx + Math.cos(angle) * rR;
      const dotY = rCy + Math.sin(angle) * rR;
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = `hsla(${hue},90%,80%,0.95)`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue},80%,82%,0.98)`;
      ctx.fill();
      ctx.restore();

      // Note name
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "16px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(NOTE_NAMES[Math.round(phase * 12) % 12], rCx, rCy);

      // Direction label
      ctx.fillStyle = "rgba(255,255,255,0.48)";
      ctx.font = "12px monospace";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.fillText(
        stateRef.current.asc ? "∞  ascending" : "∞  descending",
        W / 2,
        H * 0.85
      );
    }

    function runFrame() {
      const now = ac.currentTime;
      const dt = Math.min(now - prevT, 0.1);
      prevT = now;

      const { asc: curAsc, rate: curRate, stepMode: curStep, frozen: curFrozen } =
        stateRef.current;

      if (!curFrozen) {
        const octPerSec = curRate / 60;
        const dir = curAsc ? 1 : -1;

        if (curStep === "glide") {
          phase = ((phase + dir * dt * octPerSec) % 1 + 1) % 1;
        } else {
          const steps = curStep === "whole" ? 6 : 12;
          const stepSize = 1 / steps;
          stepAccum += Math.abs(dt * octPerSec);
          while (stepAccum >= stepSize) {
            stepAccum -= stepSize;
            phase = ((phase + dir * stepSize) % 1 + 1) % 1;
          }
        }
      }

      // Update all oscillators
      for (let i = 0; i < N; i++) {
        const logOct = i + phase;
        oscs[i].frequency.setTargetAtTime(BASE * Math.pow(2, logOct), now, 0.025);
        envGains[i].gain.setTargetAtTime(bellEnv(logOct) * 0.13, now, 0.025);
      }

      drawFrame();
      rafId = requestAnimationFrame(runFrame);
    }

    rafId = requestAnimationFrame(runFrame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      oscs.forEach((o) => { o.stop(); o.disconnect(); });
      master.disconnect();
      ac.close();
    };
  }, [started]);

  if (!started) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full gap-6 text-center px-6">
        <div className="text-5xl leading-none select-none">∞</div>
        <h1 className="text-2xl font-serif text-white/95">Shepard Tone</h1>
        <p className="text-base text-white/75 max-w-xs">
          Eight sine waves across eight octaves — each fading in and out as they climb —
          creating an auditory illusion of a tone that ascends forever without ever resolving.
          An endless musical staircase.
        </p>
        <button
          onClick={() => setStarted(true)}
          className="min-h-[48px] px-8 py-3 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-200 text-base hover:bg-violet-500/30 transition-colors"
        >
          Begin Ascent
        </button>
        <p className="text-xs text-white/45">headphones recommended for full effect</p>
        <a
          href="/dream/132-shepard-tone/README.md"
          className="text-xs text-white/40 hover:text-white/60 transition-colors absolute bottom-4 right-4"
        >
          design notes ↗
        </a>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 flex flex-col gap-3 bg-black/40 backdrop-blur-sm">
        {/* Rate */}
        <div className="flex items-center gap-3">
          <span className="text-white/55 text-xs w-12 shrink-0">RATE</span>
          <input
            type="range"
            min={0.5}
            max={30}
            step={0.5}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="flex-1 accent-violet-400"
          />
          <span className="text-white/75 text-xs w-20 text-right">
            {rate} BPM
          </span>
        </div>

        {/* Buttons row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAsc((a) => !a)}
            className={`min-h-[44px] px-4 py-2 rounded text-sm border transition-colors ${
              asc
                ? "border-violet-400/50 text-violet-200 bg-violet-500/15"
                : "border-rose-400/50 text-rose-200 bg-rose-500/15"
            }`}
          >
            {asc ? "↑ Ascending" : "↓ Descending"}
          </button>

          {(["glide", "whole", "semi"] as StepMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setStepMode(m)}
              className={`min-h-[44px] px-3 py-2 rounded text-sm border transition-colors ${
                stepMode === m
                  ? "border-white/35 text-white/90 bg-white/10"
                  : "border-white/10 text-white/45 hover:text-white/70"
              }`}
            >
              {m === "glide" ? "Glide" : m === "whole" ? "Whole-tone" : "Semitone"}
            </button>
          ))}

          <button
            onClick={() => setFrozen((f) => !f)}
            className={`min-h-[44px] px-4 py-2 rounded text-sm border transition-colors ml-auto ${
              frozen
                ? "border-amber-400/50 text-amber-200 bg-amber-500/15"
                : "border-white/10 text-white/45 hover:text-white/70"
            }`}
          >
            {frozen ? "❄ Frozen" : "Freeze"}
          </button>
        </div>
      </div>
    </div>
  );
}
