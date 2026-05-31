"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import Link from "next/link";

// ── types ──────────────────────────────────────────────────────────────────────

interface GrainParams {
  scrub: number;    // 0–1 position in buffer
  grainMs: number;  // 20–500 ms grain size
  density: number;  // grains / sec (2–30)
  pitchSt: number;  // semitones shift (-12 to +12)
  scatter: number;  // scatter: 0–0.5 fraction of buffer duration
}

interface AudioState {
  ctx: AudioContext;
  buffer: AudioBuffer;
  masterGain: GainNode;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
}

// ── constants ──────────────────────────────────────────────────────────────────

const MAX_PARTICLES = 80;
const LOOKAHEAD = 0.1; // seconds

// ── audio helpers ──────────────────────────────────────────────────────────────

function applyHann(
  src: Float32Array,
  dst: Float32Array,
  n: number,
): void {
  const len = Math.min(src.length, n);
  for (let i = 0; i < len; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1)));
    dst[i] = src[i] * w;
  }
}

function spawnGrain(
  ctx: AudioContext,
  buffer: AudioBuffer,
  masterGain: GainNode,
  params: GrainParams,
  scheduleAt: number,
): void {
  const sr = ctx.sampleRate;
  const n = buffer.length;
  const grainSamples = Math.max(64, Math.round((params.grainMs / 1000) * sr));
  const scatterSamples = Math.round(params.scatter * buffer.duration * sr);
  const center = Math.round(params.scrub * n);
  const offset = Math.round((Math.random() - 0.5) * 2 * scatterSamples);
  const start = Math.max(0, Math.min(n - grainSamples - 1, center + offset));

  const channels = buffer.numberOfChannels;
  const grainBuf = ctx.createBuffer(channels, grainSamples, sr);
  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = grainBuf.getChannelData(ch);
    const slice = src.subarray(start, Math.min(start + grainSamples, src.length));
    applyHann(slice, dst, grainSamples);
  }

  const source = ctx.createBufferSource();
  source.buffer = grainBuf;
  source.playbackRate.value = Math.pow(2, params.pitchSt / 12);

  const pan = ctx.createStereoPanner();
  pan.pan.value = (Math.random() - 0.5) * 0.8;

  const env = ctx.createGain();
  const grainDur = grainSamples / sr;
  env.gain.setValueAtTime(0.8, scheduleAt);
  env.gain.linearRampToValueAtTime(0.0001, scheduleAt + grainDur);

  source.connect(pan);
  pan.connect(env);
  env.connect(masterGain);
  source.start(scheduleAt);
  source.stop(scheduleAt + grainDur + 0.02);
}

function buildWaveCanvas(
  buffer: AudioBuffer,
  width: number,
  height: number,
): HTMLCanvasElement {
  const cvs = document.createElement("canvas");
  cvs.width = width;
  cvs.height = height;
  const ctx = cvs.getContext("2d")!;

  const data = buffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const mid = height / 2;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(139,92,246,0.55)"; // violet-500 tint
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < width; x++) {
    let min = 1,
      max = -1;
    for (let s = 0; s < step; s++) {
      const val = data[x * step + s] ?? 0;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const y0 = mid + min * mid * 0.9;
    const y1 = mid + max * mid * 0.9;
    if (x === 0) ctx.moveTo(x, y0);
    ctx.lineTo(x, y0);
    ctx.lineTo(x, y1);
  }
  ctx.stroke();
  return cvs;
}

// Synthesises an 8-second demo: C major phrases + Am7 chord pad
async function buildDemoBuffer(sampleRate: number): Promise<AudioBuffer> {
  const duration = 8;
  const offline = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // Gentle reverb via convolver with a short impulse
  const irLen = Math.round(sampleRate * 0.6);
  const ir = offline.createBuffer(2, irLen, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.5) * 0.4;
    }
  }
  const convolver = offline.createConvolver();
  convolver.buffer = ir;
  const reverbGain = offline.createGain();
  reverbGain.gain.value = 0.35;
  convolver.connect(reverbGain);
  reverbGain.connect(offline.destination);

  const masterGain = offline.createGain();
  masterGain.gain.value = 0.45;
  masterGain.connect(offline.destination);
  masterGain.connect(convolver);

  // Frequencies: C4=261.63, E4=329.63, G4=392.00, A3=220.00, C5=523.25
  const notes = [261.63, 329.63, 392.0, 523.25, 329.63, 261.63, 220.0, 392.0];
  const times = [0, 0.55, 1.1, 1.65, 2.5, 3.05, 3.7, 4.6];

  for (let i = 0; i < notes.length; i++) {
    const t = times[i];
    if (t >= duration) break;
    const osc = offline.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = notes[i];
    const g = offline.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  // Pad: Am7 chord held
  const padFreqs = [220.0, 261.63, 329.63, 392.0];
  for (const freq of padFreqs) {
    const osc = offline.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = offline.createGain();
    g.gain.setValueAtTime(0, 5.5);
    g.gain.linearRampToValueAtTime(0.18, 5.8);
    g.gain.linearRampToValueAtTime(0.0001, duration - 0.1);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(5.5);
    osc.stop(duration);
  }

  return offline.startRendering();
}

// ── slider component ───────────────────────────────────────────────────────────

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-white/55 font-mono uppercase tracking-wider">
          {label}
        </span>
        <span className="text-xs text-violet-300/90 font-mono">{display(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-violet-400 h-1 cursor-pointer"
      />
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function PathsGranularPage() {
  const [loading, setLoading] = useState(true);
  const [trackName, setTrackName] = useState("Demo — C major phrases");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  // Slider-driven params (react state → mirrors paramsRef for UI)
  const [scrub, setScrub] = useState(0.1);
  const [grainMs, setGrainMs] = useState(120);
  const [density, setDensity] = useState(12);
  const [pitchSt, setPitchSt] = useState(0);
  const [scatter, setScatter] = useState(0.08);

  const audioRef = useRef<AudioState | null>(null);
  const paramsRef = useRef<GrainParams>({
    scrub: 0.1,
    grainMs: 120,
    density: 12,
    pitchSt: 0,
    scatter: 0.08,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const nextGrainRef = useRef(0);

  // Keep paramsRef in sync with slider state
  useEffect(() => {
    paramsRef.current = { scrub, grainMs, density, pitchSt, scatter };
  }, [scrub, grainMs, density, pitchSt, scatter]);

  // Initialise: build demo buffer + AudioContext
  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);

    buildDemoBuffer(ctx.sampleRate).then((buffer) => {
      if (cancelled) return;
      audioRef.current = { ctx, buffer, masterGain };
      const cvs = canvasRef.current;
      waveCanvasRef.current = buildWaveCanvas(buffer, cvs?.width ?? 800, cvs?.height ?? 80);
      // Draw initial waveform
      if (cvs) {
        const c2d = cvs.getContext("2d");
        if (c2d) c2d.drawImage(waveCanvasRef.current, 0, 0, cvs.width, cvs.height);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      ctx.close();
    };
  }, []);

  // Load file from disk
  const loadFile = useCallback(async (file: File) => {
    const a = audioRef.current;
    if (!a) return;
    setLoading(true);
    setError("");
    try {
      const arrayBuf = await file.arrayBuffer();
      const buffer = await a.ctx.decodeAudioData(arrayBuf);
      a.buffer = buffer;
      const cvs = canvasRef.current;
      waveCanvasRef.current = buildWaveCanvas(buffer, cvs?.width ?? 800, cvs?.height ?? 80);
      if (cvs) {
        const c2d = cvs.getContext("2d");
        if (c2d) c2d.drawImage(waveCanvasRef.current, 0, 0, cvs.width, cvs.height);
      }
      setTrackName(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setError("Could not decode audio — try a different file.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Granulation loop
  const startGranulation = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    // Resume AudioContext (browsers suspend until user gesture)
    if (a.ctx.state === "suspended") a.ctx.resume();
    nextGrainRef.current = a.ctx.currentTime;

    const tick = () => {
      const now = a.ctx.currentTime;
      const p = paramsRef.current;
      const interval = 1 / p.density;

      while (nextGrainRef.current < now + LOOKAHEAD) {
        spawnGrain(a.ctx, a.buffer, a.masterGain, p, nextGrainRef.current);
        nextGrainRef.current += interval;

        const cvs = canvasRef.current;
        if (cvs && particlesRef.current.length < MAX_PARTICLES) {
          particlesRef.current.push({
            x: p.scrub * cvs.width,
            y: cvs.height / 2,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 1.4) * 2,
            alpha: 0.9,
            color: `hsl(${Math.floor(Math.random() * 60 + 200)},80%,65%)`,
          });
        }
      }

      // Draw waveform + cursor + particles
      const cvs = canvasRef.current;
      const c2d = cvs?.getContext("2d") ?? null;
      if (cvs && c2d) {
        if (waveCanvasRef.current) {
          c2d.drawImage(waveCanvasRef.current, 0, 0, cvs.width, cvs.height);
        }
        // Scrub cursor
        const sx = p.scrub * cvs.width;
        c2d.strokeStyle = "rgba(255,255,255,0.65)";
        c2d.lineWidth = 1.5;
        c2d.beginPath();
        c2d.moveTo(sx, 0);
        c2d.lineTo(sx, cvs.height);
        c2d.stroke();

        // Particles
        particlesRef.current = particlesRef.current.filter((pt) => pt.alpha > 0.01);
        for (const pt of particlesRef.current) {
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += 0.06;
          pt.alpha *= 0.93;
          c2d.globalAlpha = pt.alpha;
          c2d.fillStyle = pt.color;
          c2d.beginPath();
          c2d.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
          c2d.fill();
        }
        c2d.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopGranulation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    particlesRef.current = [];
    // Redraw static waveform
    const cvs = canvasRef.current;
    const c2d = cvs?.getContext("2d") ?? null;
    if (cvs && c2d && waveCanvasRef.current) {
      c2d.drawImage(waveCanvasRef.current, 0, 0, cvs.width, cvs.height);
      // Draw static cursor
      const sx = paramsRef.current.scrub * cvs.width;
      c2d.strokeStyle = "rgba(255,255,255,0.65)";
      c2d.lineWidth = 1.5;
      c2d.beginPath();
      c2d.moveTo(sx, 0);
      c2d.lineTo(sx, cvs.height);
      c2d.stroke();
    }
  }, []);

  const handleStartStop = useCallback(() => {
    if (running) {
      stopGranulation();
      setRunning(false);
    } else {
      startGranulation();
      setRunning(true);
    }
  }, [running, startGranulation, stopGranulation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center gap-6 p-5">
      {/* Header */}
      <div className="w-full max-w-2xl flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-mono text-white/95 tracking-tight">
            Granular
          </h1>
          <Link
            href="/dream"
            className="text-xs text-white/55 hover:text-white/75 transition-colors"
          >
            ← Dream lab
          </Link>
        </div>
        <p className="text-base text-white/75">
          Scrub through any audio file and let the engine scatter grain-sized
          fragments into sound. Each grain is Hann-windowed, pitch-shifted, and
          panned randomly.
        </p>
      </div>

      {/* Track name + load button */}
      <div className="w-full max-w-2xl flex items-center justify-between gap-4">
        <span className="text-sm text-amber-300/95 font-mono truncate">
          {loading ? "Loading…" : trackName}
        </span>
        <label className="cursor-pointer min-h-[44px] px-4 py-2 rounded-lg bg-white/5 text-white/75 text-sm
                           hover:bg-white/10 transition-colors border border-white/10 whitespace-nowrap flex items-center">
          Load audio
          <input
            type="file"
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFile(file);
            }}
          />
        </label>
      </div>

      {/* Waveform canvas */}
      <div className="w-full max-w-2xl rounded-lg overflow-hidden border border-white/8">
        <canvas
          ref={canvasRef}
          width={800}
          height={80}
          className="w-full"
          style={{ display: "block", background: "#0a0a0a" }}
        />
      </div>

      {/* Scrub slider (full-width, prominent) */}
      <div className="w-full max-w-2xl flex flex-col gap-1">
        <div className="flex justify-between items-baseline">
          <span className="text-xs text-white/55 font-mono uppercase tracking-wider">
            Scrub position
          </span>
          <span className="text-xs text-violet-300/90 font-mono">
            {Math.round(scrub * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={scrub}
          onChange={(e) => setScrub(parseFloat(e.target.value))}
          className="w-full accent-violet-400 h-1.5 cursor-pointer"
        />
      </div>

      {/* Parameter grid */}
      <div className="w-full max-w-2xl grid grid-cols-2 gap-x-8 gap-y-4">
        <Slider
          label="Grain size"
          value={grainMs}
          min={20}
          max={500}
          step={5}
          display={(v) => `${v} ms`}
          onChange={setGrainMs}
        />
        <Slider
          label="Density"
          value={density}
          min={2}
          max={30}
          step={0.5}
          display={(v) => `${v}/s`}
          onChange={setDensity}
        />
        <Slider
          label="Pitch"
          value={pitchSt}
          min={-12}
          max={12}
          step={0.5}
          display={(v) => `${v > 0 ? "+" : ""}${v} st`}
          onChange={setPitchSt}
        />
        <Slider
          label="Scatter"
          value={scatter}
          min={0}
          max={0.5}
          step={0.005}
          display={(v) => `${Math.round(v * 100)}%`}
          onChange={setScatter}
        />
      </div>

      {/* Play / Stop */}
      <button
        onClick={handleStartStop}
        disabled={loading}
        className={`min-h-[44px] px-8 py-2.5 rounded-lg text-base font-mono transition-colors
          ${running
            ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
            : "bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 border border-violet-500/30"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {running ? "■  Stop" : "▶  Granulate"}
      </button>

      {error && (
        <p className="text-sm text-rose-300 max-w-sm text-center">{error}</p>
      )}

      {/* Footer */}
      <p className="text-xs text-white/55 font-mono text-center max-w-sm">
        /dream/227-paths-granular · load any WAV / MP3 · try Karel&apos;s recordings
      </p>
    </div>
  );
}
