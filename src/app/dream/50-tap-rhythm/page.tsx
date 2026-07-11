"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ─── Drum synthesis (module-level) ────────────────────────────────────────────

function playKick(ac: AudioContext, when: number) {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(100, when);
  osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(0.9, when + 0.005);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.5);
  osc.connect(env);
  env.connect(ac.destination);
  osc.start(when);
  osc.stop(when + 0.5);
}

function playSnare(ac: AudioContext, when: number) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * 0.12);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 1800;
  filt.Q.value = 0.8;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.75, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
  src.connect(filt);
  filt.connect(env);
  env.connect(ac.destination);
  src.start(when);
}

function playHiHat(ac: AudioContext, when: number) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * 0.035);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "highpass";
  filt.frequency.value = 8000;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.5, when);
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.035);
  src.connect(filt);
  filt.connect(env);
  env.connect(ac.destination);
  src.start(when);
}

// ─── Types and helpers ─────────────────────────────────────────────────────────

type DrumType = "kick" | "snare" | "hat";
type Phase = "idle" | "tapping" | "sequencing";

interface DrumStep { active: boolean; type: DrumType }
interface TapPulse { t: number; type: DrumType }

const DRUM_COLORS: Record<DrumType, [number, number, number]> = {
  kick: [120, 60, 220],
  snare: [40, 180, 240],
  hat: [255, 160, 40],
};

function classifyDrum(amp: number): DrumType {
  if (amp < 0.33) return "kick";
  if (amp < 0.66) return "snare";
  return "hat";
}

function calcBpm(tapMs: number[]): number {
  if (tapMs.length < 2) return 120;
  const iois = tapMs
    .slice(1)
    .map((t, i) => t - tapMs[i])
    .filter(t => t > 120 && t < 2500);
  if (!iois.length) return 120;
  const sorted = [...iois].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.round(Math.max(40, Math.min(240, 60000 / median)));
}

function buildGrid(tapMs: number[], types: DrumType[], bpm: number): DrumStep[] {
  const steps: DrumStep[] = Array.from({ length: 32 }, () => ({
    active: false,
    type: "kick",
  }));
  const stepMs = 15000 / bpm;
  const loopMs = stepMs * 32;
  for (let i = 0; i < tapMs.length; i++) {
    const rel = ((tapMs[i] - tapMs[0]) % loopMs + loopMs) % loopMs;
    const idx = Math.round(rel / stepMs) % 32;
    steps[idx] = { active: true, type: types[i] };
  }
  return steps;
}

function makeDemoGrid(): DrumStep[] {
  const g: DrumStep[] = Array.from({ length: 32 }, () => ({ active: false, type: "kick" }));
  [0, 8, 16, 24].forEach(i => { g[i] = { active: true, type: "kick" }; });
  [8, 24].forEach(i => { g[i] = { active: true, type: "snare" }; });
  [4, 12, 20, 28].forEach(i => { g[i] = { active: true, type: "hat" }; });
  return g;
}

function drawClock(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, R: number,
  steps: DrumStep[], playPos: number
) {
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * R;
    const y = cy + Math.sin(angle) * R;
    const s = steps[i];
    const isBeat = i % 8 === 0;
    const baseR = isBeat ? 7 : 5;
    let diff = Math.abs(i - (playPos % 32));
    if (diff > 16) diff = 32 - diff;
    const lit = diff < 0.9;
    if (s.active) {
      const [r, g, b] = DRUM_COLORS[s.type];
      ctx.shadowBlur = lit ? 22 : 10;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(x, y, baseR + (lit ? 3 : 0), 0, Math.PI * 2);
      const br = lit ? 1.35 : 1.0;
      ctx.fillStyle = `rgb(${Math.min(255, r * br)},${Math.min(255, g * br)},${Math.min(255, b * br)})`;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.beginPath();
      ctx.arc(x, y, baseR, 0, Math.PI * 2);
      ctx.fillStyle = isBeat ? "#252535" : "#16161e";
      ctx.fill();
      if (isBeat) {
        ctx.strokeStyle = "#333344";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  const handAngle = (playPos / 32) * Math.PI * 2 - Math.PI / 2;
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(handAngle) * R * 0.8, cy + Math.sin(handAngle) * R * 0.8);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function TapRhythm() {
  const { running, error, start, stop, getFrame } = useMicAnalyser({
    smoothing: 0.35,
    gain: 2.5,
    onsetThreshold: 1.4,
  });

  const [phase, setPhase] = useState<Phase>("idle");
  const [tapCount, setTapCount] = useState(0);
  const [bpm, setBpm] = useState(120);
  const [bpmRange, setBpmRange] = useState<[number, number]>([96, 144]);
  const [steps, setSteps] = useState<DrumStep[]>(makeDemoGrid);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const acRef = useRef<AudioContext | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const stepsRef = useRef<DrumStep[]>(steps);
  const bpmRef = useRef(120);
  const tapMsRef = useRef<number[]>([]);
  const tapTypesRef = useRef<DrumType[]>([]);
  const tapStartRef = useRef(0);
  const lastOnsetRef = useRef(0);
  const silTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulsesRef = useRef<TapPulse[]>([]);
  const curStepRef = useRef(0);
  const nextTimeRef = useRef(0);
  const loopStartRef = useRef(0);
  const schedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { stepsRef.current = steps; }, [steps]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  const ensureAC = () => {
    if (!acRef.current) acRef.current = new AudioContext();
    if (acRef.current.state === "suspended") acRef.current.resume();
    return acRef.current;
  };

  const stopScheduler = useCallback(() => {
    if (schedRef.current) { clearInterval(schedRef.current); schedRef.current = null; }
  }, []);

  const startScheduler = useCallback((ac: AudioContext) => {
    stopScheduler();
    curStepRef.current = 0;
    nextTimeRef.current = ac.currentTime + 0.05;
    loopStartRef.current = ac.currentTime + 0.05;
    schedRef.current = setInterval(() => {
      const stepDur = 15 / bpmRef.current;
      while (nextTimeRef.current < ac.currentTime + 0.06) {
        const s = stepsRef.current[curStepRef.current];
        if (s.active) {
          const t = nextTimeRef.current;
          if (s.type === "kick") playKick(ac, t);
          else if (s.type === "snare") playSnare(ac, t);
          else playHiHat(ac, t);
        }
        curStepRef.current = (curStepRef.current + 1) % 32;
        nextTimeRef.current += stepDur;
      }
    }, 20);
  }, [stopScheduler]);

  const commitTaps = useCallback(() => {
    const ms = tapMsRef.current;
    const types = tapTypesRef.current;
    if (ms.length < 2) return;
    const detected = calcBpm(ms);
    const grid = buildGrid(ms, types, detected);
    setBpm(detected);
    setBpmRange([Math.round(detected * 0.8), Math.round(detected * 1.2)]);
    setSteps(grid);
    stepsRef.current = grid;
    bpmRef.current = detected;
    setPhase("sequencing");
    phaseRef.current = "sequencing";
    const ac = ensureAC();
    startScheduler(ac);
  }, [startScheduler]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartTap = useCallback(async () => {
    ensureAC();
    tapMsRef.current = [];
    tapTypesRef.current = [];
    tapStartRef.current = Date.now();
    pulsesRef.current = [];
    lastOnsetRef.current = 0;
    setTapCount(0);
    setPhase("tapping");
    phaseRef.current = "tapping";
    try { await start(); } catch { /* error shown via hook */ }
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDemo = useCallback(() => {
    const ac = ensureAC();
    const grid = makeDemoGrid();
    setBpm(120);
    setBpmRange([96, 144]);
    setSteps(grid);
    stepsRef.current = grid;
    bpmRef.current = 120;
    setPhase("sequencing");
    phaseRef.current = "sequencing";
    startScheduler(ac);
  }, [startScheduler]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(() => {
    stopScheduler();
    stop();
    if (silTimerRef.current) clearTimeout(silTimerRef.current);
    tapMsRef.current = [];
    tapTypesRef.current = [];
    pulsesRef.current = [];
    setTapCount(0);
    setPhase("idle");
    phaseRef.current = "idle";
  }, [stopScheduler, stop]);

  const handleRetap = useCallback(async () => {
    stopScheduler();
    stop();
    if (silTimerRef.current) clearTimeout(silTimerRef.current);
    tapMsRef.current = [];
    tapTypesRef.current = [];
    pulsesRef.current = [];
    lastOnsetRef.current = 0;
    setTapCount(0);
    setPhase("tapping");
    phaseRef.current = "tapping";
    tapStartRef.current = Date.now();
    ensureAC();
    try { await start(); } catch { /* handled */ }
  }, [stopScheduler, stop, start]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBpmSlider = useCallback((v: number) => {
    setBpm(v);
    bpmRef.current = v;
    if (acRef.current) loopStartRef.current = acRef.current.currentTime;
  }, []);

  // Single RAF: onset detection + canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      // Onset detection during tapping
      if (running && phaseRef.current === "tapping") {
        const frame = getFrame();
        if (frame?.onset) {
          const now = Date.now();
          if (now - lastOnsetRef.current > 80) {
            lastOnsetRef.current = now;
            tapMsRef.current.push(now - tapStartRef.current);
            const dt = classifyDrum(frame.amplitude);
            tapTypesRef.current.push(dt);
            pulsesRef.current.push({ t: now, type: dt });
            const cnt = tapMsRef.current.length;
            setTapCount(cnt);
            if (silTimerRef.current) clearTimeout(silTimerRef.current);
            if (cnt >= 8) silTimerRef.current = setTimeout(commitTaps, 2000);
          }
        }
      }

      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H * 0.47;
      const R = Math.min(W, H) * 0.36;

      if (phaseRef.current === "tapping") {
        const now = Date.now();
        pulsesRef.current = pulsesRef.current.filter(p => now - p.t < 900);
        for (const p of pulsesRef.current) {
          const age = (now - p.t) / 900;
          const [r, g, b] = DRUM_COLORS[p.type];
          ctx.beginPath();
          ctx.arc(cx, cy, age * R * 1.1, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - age) * 0.9})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fillStyle = tapMsRef.current.length >= 8 ? "#40f090" : "#555";
        ctx.fill();
      } else if (phaseRef.current === "sequencing") {
        const ac = acRef.current;
        let playPos = 0;
        if (ac && loopStartRef.current) {
          const stepDur = 15 / bpmRef.current;
          const loopDur = stepDur * 32;
          const elapsed = ac.currentTime - loopStartRef.current;
          playPos = ((elapsed % loopDur + loopDur) % loopDur) / stepDur;
        }
        drawClock(ctx, cx, cy, R, stepsRef.current, playPos);
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.round(bpmRef.current)} BPM`, cx, cy + R * 0.38);
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running, getFrame, commitTaps]);

  // Canvas click: toggle steps
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phaseRef.current !== "sequencing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = canvas.offsetWidth / 2;
    const cy = canvas.offsetHeight * 0.47;
    const R = Math.min(canvas.offsetWidth, canvas.offsetHeight) * 0.36;
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < R * 0.55 || dist > R * 1.45) return;
    const rawAngle = Math.atan2(dy, dx) + Math.PI / 2;
    const norm = ((rawAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.round((norm / (Math.PI * 2)) * 32) % 32;
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], active: !next[idx].active };
      stepsRef.current = next;
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (schedRef.current) clearInterval(schedRef.current);
      if (silTimerRef.current) clearTimeout(silTimerRef.current);
      if (acRef.current) acRef.current.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col select-none">
      <div className="px-5 pt-5 pb-1 flex items-start justify-between flex-shrink-0">
        <div>
          <h1 className="font-mono text-lg font-bold tracking-tight">Tap Rhythm</h1>
          <p className="font-mono text-xs text-gray-500 mt-0.5">
            tap your beat · get a drum loop · click steps to edit
          </p>
        </div>
        <Link href="/dream" className="font-mono text-xs text-gray-600 hover:text-gray-400 transition-colors mt-1">
          ← back
        </Link>
      </div>

      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          onClick={handleCanvasClick}
          style={{ cursor: phase === "sequencing" ? "pointer" : "default" }}
        />

        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none">
            <div className="text-center space-y-1.5">
              <p className="font-mono text-sm text-gray-300">tap a rhythm — get a drum loop</p>
              <p className="font-mono text-xs text-gray-600">
                gentle tap =&nbsp;
                <span className="text-violet-400">kick</span>
                &nbsp;· medium =&nbsp;
                <span className="text-violet-400">snare</span>
                &nbsp;· hard / clap =&nbsp;
                <span className="text-violet-400">hi-hat</span>
              </p>
            </div>
            <div className="flex gap-3 pointer-events-auto">
              <button
                onClick={handleStartTap}
                className="font-mono text-sm px-5 py-2.5 rounded border border-border bg-muted hover:bg-accent transition-colors"
              >
                🎤 Tap your rhythm
              </button>
              <button
                onClick={handleDemo}
                className="font-mono text-sm px-4 py-2.5 rounded border border-border bg-muted hover:bg-accent text-gray-400 transition-colors"
              >
                ▶ Demo
              </button>
            </div>
            {error && (
              <p className="font-mono text-xs text-violet-400 max-w-xs text-center pointer-events-auto">
                {error}
              </p>
            )}
          </div>
        )}

        {phase === "tapping" && (
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-14 pointer-events-none">
            <p className="font-mono text-xl font-bold mb-1">
              {tapCount < 8
                ? `tap  ${tapCount} of 8+`
                : `${tapCount} taps — pause 2 s to build loop`}
            </p>
            <p className="font-mono text-xs text-gray-600 mb-3">
              gentle =&nbsp;<span className="text-violet-400">kick</span>
              &nbsp;· medium =&nbsp;<span className="text-violet-400">snare</span>
              &nbsp;· hard =&nbsp;<span className="text-violet-400">hat</span>
            </p>
            <div className="flex gap-2 pointer-events-auto">
              {tapCount >= 8 && (
                <button
                  onClick={commitTaps}
                  className="font-mono text-sm px-4 py-2 rounded border border-violet-700/50 bg-violet-900/40 hover:bg-violet-800/60 text-violet-300 transition-colors"
                >
                  ▶ Build loop
                </button>
              )}
              <button
                onClick={handleClear}
                className="font-mono text-xs px-3 py-2 rounded border border-border text-gray-500 hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
            {error && (
              <p className="font-mono text-xs text-violet-400 mt-2">{error}</p>
            )}
          </div>
        )}
      </div>

      {phase === "sequencing" && (
        <div className="px-5 pb-5 flex-shrink-0 flex flex-wrap items-center gap-x-5 gap-y-2 justify-between border-t border-border pt-3">
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-gray-500">BPM</span>
            <input
              type="range"
              min={bpmRange[0]}
              max={bpmRange[1]}
              value={bpm}
              onChange={e => handleBpmSlider(Number(e.target.value))}
              className="w-24 accent-primary"
            />
            <span className="w-8 text-right tabular-nums">{bpm}</span>
          </div>
          <div className="font-mono text-xs text-gray-600 hidden sm:block">
            <span className="text-violet-400/70">●</span> kick &nbsp;
            <span className="text-violet-400/70">●</span> snare &nbsp;
            <span className="text-violet-400/70">●</span> hat &nbsp;· click steps to toggle
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetap}
              className="font-mono text-xs px-3 py-1.5 rounded border border-border text-gray-300 hover:bg-accent transition-colors"
            >
              ↩ Re-tap
            </button>
            <button
              onClick={handleClear}
              className="font-mono text-xs px-3 py-1.5 rounded border border-border text-gray-600 hover:bg-accent transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="px-5 pb-3 text-right flex-shrink-0">
        <Link href="/dream/50-tap-rhythm/README.md" className="font-mono text-xs text-gray-700 hover:text-gray-500 transition-colors">
          design notes ↗
        </Link>
      </div>
    </div>
  );
}
