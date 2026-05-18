"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── Constants ──────────────────────────────────────────────────────────────────

const ANALYSER_FFT = 8192; // ~186ms source window at 44100Hz
const DEMO_FREQS = [55, 165, 440, 880, 2200] as const;
const DEMO_AMPS = [0.20, 0.14, 0.16, 0.12, 0.10] as const;
const DEMO_LFO_HZ = [0.08, 0.13, 0.19, 0.11, 0.17] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface GrainViz {
  id: number;
  bufFrac: number;    // 0..1 position in analyser window
  detune: number;     // cents
  amplitude: number;
  spawnedAt: number;  // ms timestamp
  durationMs: number;
}

interface Params {
  densityHz: number;
  pitchCents: number;
  grainMs: number;
  scatter: number;
}

const SLIDER_DEFS: Array<[string, keyof Params, number, number, number]> = [
  ["DENSITY", "densityHz", 5, 50, 1],
  ["PITCH ¢", "pitchCents", 0, 800, 10],
  ["GRAIN ms", "grainMs", 20, 200, 5],
  ["SCATTER", "scatter", 0, 1, 0.01],
];

// ── Pure helpers (module-level, not hooks) ─────────────────────────────────────

function hannWindow(buf: Float32Array): void {
  const n = buf.length;
  for (let i = 0; i < n; i++) {
    buf[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
}

let nextGrainId = 0;

function emitGrain(actx: AudioContext, src: Float32Array, p: Params): GrainViz {
  const sr = actx.sampleRate;
  const grainSamples = Math.max(64, Math.round((p.grainMs / 1000) * sr));
  const maxStart = Math.max(0, src.length - grainSamples);

  // Center toward recent samples (0.65 of buffer), jitter by scatter
  const center = Math.round(src.length * 0.65);
  const jitter = Math.round((Math.random() - 0.5) * p.scatter * src.length * 0.5);
  const startSample = Math.max(0, Math.min(maxStart, center + jitter));

  const data = new Float32Array(grainSamples);
  for (let i = 0; i < grainSamples; i++) data[i] = src[startSample + i];
  hannWindow(data);

  const audioBuf = actx.createBuffer(1, grainSamples, sr);
  audioBuf.copyToChannel(data, 0);

  const srcNode = actx.createBufferSource();
  srcNode.buffer = audioBuf;
  const detune = (Math.random() - 0.5) * 2 * p.pitchCents;
  srcNode.detune.value = detune;

  const gainNode = actx.createGain();
  const amp = 0.25 + Math.random() * 0.25;
  gainNode.gain.value = amp / Math.max(1, p.densityHz / 12);

  const panNode = actx.createStereoPanner();
  panNode.pan.value = (Math.random() - 0.5) * 1.2;

  srcNode.connect(gainNode);
  gainNode.connect(panNode);
  panNode.connect(actx.destination);
  srcNode.start();

  return {
    id: nextGrainId++,
    bufFrac: startSample / Math.max(1, src.length),
    detune,
    amplitude: amp,
    spawnedAt: performance.now(),
    durationMs: p.grainMs,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GranularCloud() {
  const [mode, setMode] = useState<"idle" | "demo" | "mic">("idle");
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>({
    densityHz: 18,
    pitchCents: 240,
    grainMs: 70,
    scatter: 0.7,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeDomRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const grainsRef = useRef<GrainViz[]>([]);
  const lastGrainMsRef = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    timeDomRef.current = null;
    grainsRef.current = [];
    lastGrainMsRef.current = 0;
    setMode("idle");
  }, []);

  const wireAnalyser = useCallback((actx: AudioContext, node: AudioNode) => {
    const an = actx.createAnalyser();
    an.fftSize = ANALYSER_FFT;
    an.smoothingTimeConstant = 0;
    analyserRef.current = an;
    timeDomRef.current = new Float32Array(new ArrayBuffer(ANALYSER_FFT * 4));
    node.connect(an);
    // NOT connected to destination — grains provide all audio output
  }, []);

  const startDemo = useCallback(() => {
    try {
      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      ctxRef.current = actx;

      const mix = actx.createGain();
      mix.gain.value = 1;
      DEMO_FREQS.forEach((freq, i) => {
        const osc = actx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const g = actx.createGain();
        g.gain.value = DEMO_AMPS[i];
        const lfo = actx.createOscillator();
        lfo.frequency.value = DEMO_LFO_HZ[i];
        const lg = actx.createGain();
        lg.gain.value = DEMO_AMPS[i] * 0.45;
        lfo.connect(lg);
        lg.connect(g.gain);
        osc.connect(g);
        g.connect(mix);
        osc.start();
        lfo.start();
      });

      wireAnalyser(actx, mix);
      setMode("demo");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start audio");
    }
  }, [wireAnalyser]);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      ctxRef.current = actx;
      const source = actx.createMediaStreamSource(stream);
      wireAnalyser(actx, source);
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Microphone unavailable. Check permissions and reload."
      );
    }
  }, [wireAnalyser]);

  // ── Render loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      c.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = (now: number) => {
      const an = analyserRef.current;
      const td = timeDomRef.current;
      const actx = ctxRef.current;
      if (!an || !td || !actx) {
        animRef.current = requestAnimationFrame(render);
        return;
      }

      an.getFloatTimeDomainData(td as unknown as Float32Array<ArrayBuffer>);

      // Spawn grains
      const p = paramsRef.current;
      if (lastGrainMsRef.current === 0) lastGrainMsRef.current = now;
      const interval = 1000 / p.densityHz;
      let cap = 0;
      while (now - lastGrainMsRef.current >= interval && cap < 6) {
        grainsRef.current.push(emitGrain(actx, td, p));
        lastGrainMsRef.current += interval;
        cap++;
      }

      // Prune expired grains
      const maxAge = p.grainMs * 3.5;
      grainsRef.current = grainsRef.current.filter((g) => now - g.spawnedAt < maxAge);
      if (grainsRef.current.length > 400) grainsRef.current = grainsRef.current.slice(-400);

      // Background fade — slow enough for persistent trails
      c.fillStyle = "rgba(2,2,12,0.12)";
      c.fillRect(0, 0, W, H);

      // Waveform strip (bottom 15%)
      const waveY = H * 0.83;
      c.strokeStyle = "rgba(90,110,200,0.18)";
      c.lineWidth = 1;
      c.beginPath();
      const step = Math.max(1, Math.ceil(td.length / W));
      for (let i = 0; i < W; i++) {
        const s = Math.min(td.length - 1, i * step);
        const y = waveY + td[s] * H * 0.07;
        if (i === 0) c.moveTo(i, y);
        else c.lineTo(i, y);
      }
      c.stroke();

      // Center axis
      c.strokeStyle = "rgba(255,255,255,0.04)";
      c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0, H * 0.5);
      c.lineTo(W, H * 0.5);
      c.stroke();

      // Grain dots — additive blending for glow
      c.globalCompositeOperation = "lighter";
      for (const g of grainsRef.current) {
        const age = (now - g.spawnedAt) / g.durationMs;
        if (age > 3) continue;
        const life = Math.max(0, 1 - age * 0.45);

        const x = g.bufFrac * W;
        const maxP = paramsRef.current.pitchCents || 1;
        const y = H * 0.5 - (g.detune / maxP) * H * 0.40;

        // Hue: blue/indigo (older buffer) → warm orange (more recent)
        const hue = Math.round(230 - g.bufFrac * 190);
        const alpha = life * 0.55 * g.amplitude;
        const r = Math.max(2, (g.durationMs / 60) * 4.5 * Math.max(0.25, life));

        const grad = c.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `hsla(${hue},82%,74%,${alpha.toFixed(3)})`);
        grad.addColorStop(1, `hsla(${hue},82%,74%,0)`);
        c.fillStyle = grad;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalCompositeOperation = "source-over";

      // Axis labels
      c.font = "9px monospace";
      c.fillStyle = "rgba(255,255,255,0.20)";
      c.fillText("← older audio", 8, H * 0.5 - 7);
      c.fillText("recent →", W - 64, H * 0.5 - 7);
      c.fillStyle = "rgba(255,255,255,0.14)";
      c.fillText(`+${p.pitchCents}¢`, 8, H * 0.11);
      c.fillText(`−${p.pitchCents}¢`, 8, H * 0.87);

      animRef.current = requestAnimationFrame(render);
    };
    animRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  useEffect(() => () => stop(), [stop]);

  // ── UI ────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#02020c" }}
      />

      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Granular Cloud</h1>
          <p className="text-sm text-white/55 max-w-md mb-8 leading-relaxed">
            Your audio shattered into overlapping grains and reassembled into a glowing cloud.
            Each dot is one grain — X is where in the audio it was sampled from, Y is its
            pitch shift. The dots ARE the sound.
          </p>
          <div className="flex gap-4 mb-4">
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start demo
            </button>
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start mic
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-rose-300/80 max-w-sm">{error}</p>
          )}
          <Link
            href="/dream"
            className="mt-10 text-[11px] text-white/30 hover:text-white/60"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {mode !== "idle" && (
        <>
          <div className="absolute top-4 left-4 text-[10px] tracking-wider text-white/35 pointer-events-none">
            {mode === "demo" ? "DEMO — synthetic oscillators" : "MIC — live input"}
          </div>

          {/* Parameter sliders */}
          <div className="absolute bottom-4 left-4 right-28 flex flex-wrap gap-x-6 gap-y-3 pointer-events-auto">
            {SLIDER_DEFS.map(([label, key, min, max, stepVal]) => (
              <label
                key={key}
                className="flex flex-col gap-1 text-[9px] tracking-wider text-white/40"
              >
                <span>
                  {label}{" "}
                  <span className="text-white/65">
                    {key === "scatter"
                      ? `${Math.round(params[key] * 100)}%`
                      : params[key]}
                  </span>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={stepVal}
                  value={params[key]}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))
                  }
                  className="w-28 accent-white"
                />
              </label>
            ))}
          </div>

          {/* Stop + navigation */}
          <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
            <button
              onClick={stop}
              className="text-[10px] tracking-wider uppercase text-white/55 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded"
            >
              stop
            </button>
            <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">
              ← back
            </Link>
            <a
              href="/dream/18-granular/README.md"
              className="text-[10px] text-white/22 hover:text-white/50"
              target="_blank"
              rel="noreferrer"
            >
              design notes ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
