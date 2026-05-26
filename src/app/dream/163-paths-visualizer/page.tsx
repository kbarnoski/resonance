"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────

const BAND_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const BAND_RANGES: ReadonlyArray<readonly [number, number]> = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 4000], [4000, 20000],
];

// Lorenz attractor parameters
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const DT = 0.005;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttractorPoint {
  x: number;
  y: number;
  z: number;
}

// ─── Helpers (no use* naming) ─────────────────────────────────────────────────

function extractBandEnergies(
  analyser: AnalyserNode,
  buf: Float32Array<ArrayBuffer>,
  sampleRate: number
): number[] {
  analyser.getFloatFrequencyData(buf);
  const binHz = sampleRate / analyser.fftSize;
  return BAND_RANGES.map(([lo, hi]) => {
    const start = Math.floor(lo / binHz);
    const end = Math.min(Math.ceil(hi / binHz), buf.length - 1);
    let sum = 0;
    for (let i = start; i <= end; i++) {
      const lin = Math.pow(10, buf[i] / 20);
      sum += lin * lin;
    }
    const rms = Math.sqrt(sum / Math.max(end - start + 1, 1));
    return Math.min(rms * 3, 1);
  });
}

function stepLorenz(p: AttractorPoint): AttractorPoint {
  const dx = SIGMA * (p.y - p.x);
  const dy = p.x * (RHO - p.z) - p.y;
  const dz = p.x * p.y - BETA * p.z;
  return { x: p.x + dx * DT, y: p.y + dy * DT, z: p.z + dz * DT };
}

function scheduleDemoNotes(ctx: AudioContext, dest: GainNode) {
  const noteHz = (n: number) => 261.63 * Math.pow(2, n / 12);
  const melody = [0, 4, 7, 12, 7, 5, 4, 0, -5, 0, 2, 4];
  const tempo = 1.4;
  melody.forEach((semi, i) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = noteHz(semi);
    env.gain.setValueAtTime(0, ctx.currentTime + i * tempo);
    env.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * tempo + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * tempo + tempo * 0.9);
    osc.connect(env);
    env.connect(dest);
    osc.start(ctx.currentTime + i * tempo);
    osc.stop(ctx.currentTime + i * tempo + tempo);
  });
  [0, 7, 12].forEach((semi) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = noteHz(semi - 12);
    env.gain.value = 0.04;
    osc.connect(env);
    env.connect(dest);
    osc.start();
    osc.stop(ctx.currentTime + melody.length * tempo + 2);
  });
}

function drawFrame(
  ctx2d: CanvasRenderingContext2D,
  W: number,
  H: number,
  trail: AttractorPoint[],
  energies: number[],
  time: number
) {
  ctx2d.fillStyle = "rgba(4,4,12,0.18)";
  ctx2d.fillRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H / 2;
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const bassEnergy = (energies[0] + energies[1]) / 2;
  const trebleEnergy = (energies[4] + energies[5]) / 2;
  const scale = Math.min(W, H) * (0.012 + bassEnergy * 0.006);
  const yOff = H * 0.05;

  // Attractor trail colored by band
  if (trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const t = i / trail.length;
      const [r, g, b] = BAND_COLORS[Math.min(Math.floor(t * 6), 5)];
      ctx2d.strokeStyle = `rgba(${r},${g},${b},${t * (0.5 + avgEnergy * 0.5)})`;
      ctx2d.lineWidth = 1 + trebleEnergy * 1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(cx + trail[i - 1].x * scale, cy + trail[i - 1].z * scale * 0.6 + yOff);
      ctx2d.lineTo(cx + trail[i].x * scale, cy + trail[i].z * scale * 0.6 + yOff);
      ctx2d.stroke();
    }
  }

  // Per-band bloom radials
  energies.forEach((e, bi) => {
    if (e < 0.02) return;
    const [r, g, b] = BAND_COLORS[bi];
    const radius = (80 + bi * 30 + e * 120) * (Math.min(W, H) / 800);
    const grad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, `rgba(${r},${g},${b},${e * 0.35})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx2d.fill();
  });

  // Bass pulse ring
  if (bassEnergy > 0.3) {
    const [r, g, b] = BAND_COLORS[1];
    const pulseR = (50 + bassEnergy * 80) * (Math.min(W, H) / 800);
    ctx2d.strokeStyle = `rgba(${r},${g},${b},${bassEnergy * 0.6})`;
    ctx2d.lineWidth = 2 + bassEnergy * 3;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy + yOff * 0.3, pulseR * (1 + Math.sin(time * 0.01) * 0.1), 0, Math.PI * 2);
    ctx2d.stroke();
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PathsVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const stateRef = useRef<{
    ctx: AudioContext | null;
    analyser: AnalyserNode | null;
    buf: Float32Array<ArrayBuffer> | null;
    source: MediaElementAudioSourceNode | null;
    trail: AttractorPoint[];
    attractor: AttractorPoint;
    raf: number;
    time: number;
    energies: number[];
  }>({
    ctx: null,
    analyser: null,
    buf: null,
    source: null,
    trail: [],
    attractor: { x: 1, y: 1, z: 1 },
    raf: 0,
    time: 0,
    energies: [0, 0, 0, 0, 0, 0],
  });

  const [mode, setMode] = useState<"idle" | "demo" | "live">("idle");
  const [recordingId, setRecordingId] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1);
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const stopAll = useCallback(() => {
    const s = stateRef.current;
    cancelAnimationFrame(s.raf);
    s.analyser?.disconnect();
    s.source?.disconnect();
    s.ctx?.close();
    s.ctx = null;
    s.analyser = null;
    s.buf = null;
    s.source = null;
    s.trail = [];
    s.attractor = { x: 1, y: 1, z: 1 };
    s.energies = [0, 0, 0, 0, 0, 0];
    setIsPlaying(false);
    setMode("idle");
  }, []);

  const startLoop = useCallback((analyser: AnalyserNode, sampleRate: number) => {
    const s = stateRef.current;
    s.buf = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
    const TRAIL_MAX = 800;

    const tick = () => {
      s.raf = requestAnimationFrame(tick);
      s.time++;
      for (let i = 0; i < 3; i++) {
        s.attractor = stepLorenz(s.attractor);
        s.trail.push({ ...s.attractor });
      }
      if (s.trail.length > TRAIL_MAX) s.trail.splice(0, s.trail.length - TRAIL_MAX);
      s.energies = extractBandEnergies(analyser, s.buf!, sampleRate);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      drawFrame(ctx2d, canvas.width, canvas.height, s.trail, s.energies, s.time);
    };
    tick();
  }, []);

  const startDemo = useCallback(() => {
    stopAll();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    analyser.connect(ctx.destination);

    const demoGain = ctx.createGain();
    demoGain.gain.value = 0.18;
    demoGain.connect(analyser);
    scheduleDemoNotes(ctx, demoGain);

    stateRef.current.ctx = ctx;
    stateRef.current.analyser = analyser;
    setMode("demo");
    setIsPlaying(true);
    startLoop(analyser, ctx.sampleRate);
  }, [stopAll, startLoop]);

  const fetchAudioUrl = useCallback(async () => {
    const id = recordingId.trim();
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url: string };
      setAudioUrl(data.url);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  const startLive = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    stopAll();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    stateRef.current.ctx = ctx;
    stateRef.current.analyser = analyser;
    stateRef.current.source = source;
    setMode("live");
    setIsPlaying(true);
    audio.play();
    startLoop(analyser, ctx.sampleRate);
  }, [audioUrl, stopAll, startLoop]);

  useEffect(() => {
    if (audioUrl && audioRef.current) audioRef.current.src = audioUrl;
  }, [audioUrl]);

  useEffect(() => () => stopAll(), [stopAll]);

  return (
    <div className="min-h-screen bg-[#04040c] text-white flex flex-col">
      <div className="relative flex-1" style={{ minHeight: "60vh" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
          <div>
            <h1 className="text-xl font-semibold tracking-wide text-white/90">
              Paths Visualizer
            </h1>
            <p className="text-sm text-white/50 mt-0.5">
              Lorenz attractor · 6-band bloom · Karel&apos;s piano
            </p>
          </div>
          <Link
            href="/dream"
            className="text-sm text-white/40 hover:text-white/70 transition-colors pointer-events-auto"
          >
            ← dreams
          </Link>
        </div>

        {isPlaying && (
          <div className="absolute bottom-4 left-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-white/50">
              {mode === "demo" ? "demo mode" : "live"}
            </span>
          </div>
        )}
      </div>

      <div className="px-6 py-6 space-y-5 border-t border-white/10 max-w-xl mx-auto w-full">
        <button
          onClick={isPlaying && mode === "demo" ? stopAll : startDemo}
          className="w-full py-3 rounded-xl font-medium text-base transition-colors"
          style={{
            background: mode === "demo" && isPlaying ? "#1a1a2e" : "#3b1fa8",
            color: "white",
            minHeight: 44,
          }}
        >
          {mode === "demo" && isPlaying ? "Stop demo" : "▶ Play demo"}
        </button>
        <p className="text-xs text-white/40 text-center -mt-3">
          Synthesized piano phrase — no recording needed
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/30">or use a recording</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <div className="space-y-2">
          <label className="block text-sm text-white/70">Recording ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={recordingId}
              onChange={(e) => setRecordingId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchAudioUrl()}
              placeholder="paste a recording UUID…"
              className="flex-1 bg-white/5 border border-white/15 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-white/40"
              style={{ minHeight: 44 }}
            />
            <button
              onClick={fetchAudioUrl}
              disabled={loading || !recordingId.trim()}
              className="px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "#1a3a5c", color: "white", minHeight: 44 }}
            >
              {loading ? "…" : "Load"}
            </button>
          </div>
          {loadError && <p className="text-xs text-red-400">{loadError}</p>}
          {audioUrl && !loadError && (
            <p className="text-xs text-green-400">Recording loaded ✓</p>
          )}
        </div>

        {audioUrl && (
          <div>
            <audio ref={audioRef} crossOrigin="anonymous" className="hidden" />
            <button
              onClick={isPlaying && mode === "live" ? stopAll : startLive}
              className="w-full py-3 rounded-xl font-medium text-base transition-colors"
              style={{
                background: mode === "live" && isPlaying ? "#1a2e1a" : "#1a5c2a",
                color: "white",
                minHeight: 44,
              }}
            >
              {mode === "live" && isPlaying ? "Stop" : "▶ Visualize recording"}
            </button>
          </div>
        )}

        <p className="text-xs text-white/30 leading-relaxed text-center">
          Lorenz attractor path colored by frequency band. Bass drives the orbit
          scale; treble sharpens the trace. Paste a Resonance recording ID to
          visualize Karel&apos;s actual piano.
        </p>
      </div>
    </div>
  );
}
