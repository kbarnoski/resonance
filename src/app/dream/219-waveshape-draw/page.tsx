"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";

// ─── constants ───────────────────────────────────────────────────────────────
const N = 128;       // samples per drawn waveform period
const N_HARM = 64;   // harmonics forwarded to createPeriodicWave
const N_DISP = 32;   // harmonics shown in the bar chart

const BAND_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [88,  32,  192], // violet  — sub-bass
  [32,  168, 220], // cyan    — bass
  [80,  220, 100], // green   — low-mid
  [240, 220,  70], // yellow  — mid
  [255, 150,  40], // orange  — high-mid
  [255,  60,  120], // magenta — high
] as const;

// ─── module-level helpers (no "use" prefix — not hooks) ──────────────────────

function buildSine(): Float32Array {
  const w = new Float32Array(N);
  for (let k = 0; k < N; k++) w[k] = Math.sin((2 * Math.PI * k) / N);
  return w;
}

function buildSquare(): Float32Array {
  const w = new Float32Array(N);
  for (let k = 0; k < N; k++) w[k] = k < N / 2 ? 0.85 : -0.85;
  return w;
}

function buildTriangle(): Float32Array {
  const w = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    w[k] = k < N / 2 ? (4 * k) / N - 1 : 3 - (4 * k) / N;
  }
  return w;
}

function buildSawtooth(): Float32Array {
  const w = new Float32Array(N);
  for (let k = 0; k < N; k++) w[k] = (2 * k) / N - 1;
  return w;
}

/** Real DFT → (real, imag) Fourier-series coefficients for createPeriodicWave.
 *  Index n: real[n] = cosine amp, imag[n] = neg-sine amp at n-th harmonic. */
function computeDFT(wave: Float32Array): { real: Float32Array; imag: Float32Array } {
  const len = wave.length;
  const real = new Float32Array(N_HARM + 1); // index 0 = DC, ignored by Web Audio
  const imag = new Float32Array(N_HARM + 1);
  for (let n = 1; n <= N_HARM; n++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < len; k++) {
      const angle = (2 * Math.PI * n * k) / len;
      re += wave[k] * Math.cos(angle);
      im -= wave[k] * Math.sin(angle);
    }
    real[n] = (2 / len) * re;
    imag[n] = (2 / len) * im;
  }
  return { real, imag };
}

/** Recompute harmonic display magnitudes into `out` (normalized 0..1). */
function extractHarmonics(real: Float32Array, imag: Float32Array, out: Float32Array) {
  let maxMag = 1e-4;
  for (let n = 1; n <= N_DISP; n++) {
    const m = Math.sqrt(real[n] ** 2 + imag[n] ** 2);
    out[n - 1] = m;
    if (m > maxMag) maxMag = m;
  }
  for (let i = 0; i < N_DISP; i++) out[i] /= maxMag;
}

function pitchLabel(hz: number): string {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const st = Math.round(12 * Math.log2(hz / 440)) + 69;
  const name = names[((st % 12) + 12) % 12];
  const oct = Math.floor(st / 12 - 1);
  return `${name}${oct}`;
}

const PRESETS: { label: string; fn: () => Float32Array }[] = [
  { label: "Sine",     fn: buildSine     },
  { label: "Square",   fn: buildSquare   },
  { label: "Triangle", fn: buildTriangle },
  { label: "Sawtooth", fn: buildSawtooth },
];

// ─── component ───────────────────────────────────────────────────────────────

export default function WaveshapeDraw() {
  // Audio graph refs
  const actxRef     = useRef<AudioContext | null>(null);
  const oscRef      = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef(0);

  // Waveform data
  const waveRef      = useRef<Float32Array>(buildSine());
  const harmonicsRef = useRef<Float32Array>(new Float32Array(N_DISP));

  // Drawing state
  const isDrawingRef = useRef(false);
  const lastIdxRef   = useRef(-1);
  const lastAmpRef   = useRef(0);
  const lastDFTRef   = useRef(0); // throttle: ms of last DFT update

  // Mirror state → refs so RAF reads current values without re-running effect
  const runningRef = useRef(false);
  const pitchRef   = useRef(220);
  const volRef     = useRef(0.35);

  const [running, setRunning] = useState(false);
  const [pitch,   setPitch  ] = useState(220);
  const [volume,  setVolume ] = useState(0.35);

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => {
    pitchRef.current = pitch;
    if (oscRef.current) oscRef.current.frequency.value = pitch;
  }, [pitch]);
  useEffect(() => {
    volRef.current = volume;
    if (gainNodeRef.current) gainNodeRef.current.gain.value = volume;
  }, [volume]);

  // Seed harmonics display from default sine wave
  useEffect(() => {
    const { real, imag } = computeDFT(waveRef.current);
    extractHarmonics(real, imag, harmonicsRef.current);
  }, []);

  // One-time RAF render loop — all dynamic state read from refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxRaw = canvas.getContext("2d");
    if (!ctxRaw) return;

    // Assign to typed consts so TypeScript preserves non-null in closures
    const cvs: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = ctxRaw;

    let dpr = 1;
    let W = 0;
    let H = 0;
    const analyserBuf = new Float32Array(1024);

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cvs.offsetWidth;
      H = cvs.offsetHeight;
      cvs.width  = W * dpr;
      cvs.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function drawFrame() {
      rafRef.current = requestAnimationFrame(drawFrame);
      if (W === 0 || H === 0) return;

      // Background
      ctx.fillStyle = "#06050c";
      ctx.fillRect(0, 0, W, H);

      const waveZone = H * 0.62; // top 62% — waveform
      const harmZone = H * 0.28; // next 28% — harmonic bars
      // bottom 10% for footer labels
      const midY = waveZone / 2;
      const ampScale = midY * 0.86; // maps ±1 → pixels

      // ── guide lines ──────────────────────────────────────────────────────
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY); ctx.lineTo(W, midY); // zero
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(0, midY - ampScale); ctx.lineTo(W, midY - ampScale); // +1
      ctx.moveTo(0, midY + ampScale); ctx.lineTo(W, midY + ampScale); // -1
      ctx.stroke();
      ctx.restore();

      // ── analyser overlay: actual oscillator output (amber) ───────────────
      const analyser = analyserRef.current;
      if (analyser && runningRef.current) {
        analyser.getFloatTimeDomainData(analyserBuf);
        ctx.save();
        ctx.strokeStyle = "rgba(255,180,40,0.45)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < analyserBuf.length; i++) {
          const x = (i / (analyserBuf.length - 1)) * W;
          const y = midY - analyserBuf[i] * ampScale;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // ── drawn waveform (violet glow) ─────────────────────────────────────
      const wave = waveRef.current;
      ctx.save();
      ctx.shadowColor = "rgba(155,80,255,0.55)";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = "rgba(200,155,255,0.95)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k < N; k++) {
        const x = (k / (N - 1)) * W;
        const y = midY - wave[k] * ampScale;
        k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // ── separator ────────────────────────────────────────────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, waveZone + 6); ctx.lineTo(W, waveZone + 6);
      ctx.stroke();

      // ── harmonic bar chart ───────────────────────────────────────────────
      const harms = harmonicsRef.current;
      const barW  = W / N_DISP;
      const harmTop = waveZone + 14;
      const harmMax = harmZone - 10;
      for (let i = 0; i < N_DISP; i++) {
        const h = Math.max(2, harms[i] * harmMax);
        const band = Math.min(5, Math.floor((i / N_DISP) * 6));
        const [r, g, b] = BAND_COLORS[band];
        const alpha = 0.55 + harms[i] * 0.45;
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fillRect(i * barW + 1, harmTop + harmMax - h, barW - 2, h);
      }

      // ── footer labels ─────────────────────────────────────────────────────
      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.font = "11px monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `${pitchRef.current} Hz · ${pitchLabel(pitchRef.current)}`,
        8,
        H - 7
      );
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.textAlign = "right";
      ctx.fillText("harmonics 1–32 →", W - 8, H - 7);
      ctx.textAlign = "left";

      // ── hint when stopped ─────────────────────────────────────────────────
      if (!runningRef.current) {
        ctx.save();
        ctx.fillStyle = "rgba(160,80,255,0.50)";
        ctx.font = "13px monospace";
        ctx.textAlign = "center";
        ctx.fillText("draw · then press Start below to hear it", W / 2, midY + 22);
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── audio helpers ─────────────────────────────────────────────────────────

  function applyWave(wave: Float32Array) {
    // Throttle to ~30fps: DFT is O(N × N_HARM) — cheap but no need for every ptr-event
    const now = performance.now();
    if (now - lastDFTRef.current < 33) return;
    lastDFTRef.current = now;

    const { real, imag } = computeDFT(wave);
    extractHarmonics(real, imag, harmonicsRef.current);

    if (actxRef.current && oscRef.current) {
      const pw = actxRef.current.createPeriodicWave(real, imag, {
        disableNormalization: false,
      });
      oscRef.current.setPeriodicWave(pw);
    }
  }

  function startAudio() {
    const actx    = new AudioContext();
    const osc     = actx.createOscillator();
    const gain    = actx.createGain();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    gain.gain.value = volRef.current;
    osc.frequency.value = pitchRef.current;

    const { real, imag } = computeDFT(waveRef.current);
    const pw = actx.createPeriodicWave(real, imag, { disableNormalization: false });
    osc.setPeriodicWave(pw);

    osc.connect(gain);
    gain.connect(analyser);
    analyser.connect(actx.destination);
    osc.start();

    actxRef.current     = actx;
    oscRef.current      = osc;
    gainNodeRef.current = gain;
    analyserRef.current = analyser;
    setRunning(true);
  }

  function stopAudio() {
    oscRef.current?.stop();
    actxRef.current?.close();
    actxRef.current     = null;
    oscRef.current      = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
    setRunning(false);
  }

  // ── drawing ───────────────────────────────────────────────────────────────

  function writePoint(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // Only respond to pointer inside the waveform zone (top 62%)
    if (py > rect.height * 0.62) return;

    const xi  = Math.round((px / rect.width) * (N - 1));
    const midFrac = rect.height * 0.62 / 2;
    const amp = Math.max(-1, Math.min(1, -((py - midFrac) / (midFrac * 0.86))));

    const lastIdx = lastIdxRef.current;
    if (lastIdx < 0 || lastIdx === xi) {
      waveRef.current[Math.max(0, Math.min(N - 1, xi))] = amp;
    } else {
      // Interpolate between last and current to fill gaps from fast drags
      const steps = Math.abs(xi - lastIdx);
      const dir   = xi > lastIdx ? 1 : -1;
      const lAmp  = lastAmpRef.current;
      for (let i = 0; i <= steps; i++) {
        const idx = Math.max(0, Math.min(N - 1, lastIdx + dir * i));
        waveRef.current[idx] = lAmp + (amp - lAmp) * (steps > 0 ? i / steps : 1);
      }
    }
    lastIdxRef.current = xi;
    lastAmpRef.current = amp;
    applyWave(waveRef.current);
  }

  function loadPreset(fn: () => Float32Array) {
    const wave = fn();
    waveRef.current = wave;
    lastDFTRef.current = 0; // force immediate DFT (bypass throttle)
    applyWave(wave);
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#06050c] text-white flex flex-col select-none">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <h1 className="text-2xl font-mono text-white/95 font-bold">
          Waveshape Draw
        </h1>
        <p className="text-base text-white/75 mt-1">
          Draw a waveform — hear its timbre live.{" "}
          <span className="text-violet-300">Violet</span> = drawn ·{" "}
          <span className="text-amber-300">amber</span> = oscillator output.
        </p>
      </div>

      {/* Canvas wrapper */}
      <div className="flex-1 relative" style={{ minHeight: "280px" }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={e => {
            isDrawingRef.current = true;
            lastIdxRef.current   = -1;
            writePoint(e);
          }}
          onPointerMove={e => { if (isDrawingRef.current) writePoint(e); }}
          onPointerUp={() => { isDrawingRef.current = false; lastIdxRef.current = -1; }}
          onPointerLeave={() => { isDrawingRef.current = false; lastIdxRef.current = -1; }}
        />
        {/* Amplitude axis labels */}
        <span className="absolute top-[4%] left-2 text-xs text-white/30 font-mono pointer-events-none">
          +1
        </span>
        <span className="absolute top-[28%] left-2 text-xs text-white/30 font-mono pointer-events-none">
          0
        </span>
        <span className="absolute top-[52%] left-2 text-xs text-white/30 font-mono pointer-events-none">
          −1
        </span>
      </div>

      {/* Controls */}
      <div className="shrink-0 px-4 pt-3 pb-4 space-y-3 border-t border-white/10">
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(({ label, fn }) => (
            <button
              key={label}
              onClick={() => loadPreset(fn)}
              className="px-4 py-2.5 min-h-[44px] bg-white/10 hover:bg-white/20 rounded-lg text-base text-white/95 font-mono transition-colors"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => loadPreset(() => new Float32Array(N))}
            className="px-4 py-2.5 min-h-[44px] bg-white/8 hover:bg-white/15 rounded-lg text-base text-white/55 font-mono transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Pitch */}
        <div>
          <label className="block text-sm text-white/75 font-mono mb-1">
            Pitch — {pitch} Hz ({pitchLabel(pitch)})
          </label>
          <input
            type="range" min={55} max={880} step={1} value={pitch}
            onChange={e => setPitch(Number(e.target.value))}
            className="w-full accent-violet-400"
          />
        </div>

        {/* Volume */}
        <div>
          <label className="block text-sm text-white/75 font-mono mb-1">
            Volume — {Math.round(volume * 100)}%
          </label>
          <input
            type="range" min={0} max={0.7} step={0.01} value={volume}
            onChange={e => setVolume(Number(e.target.value))}
            className="w-full accent-violet-400"
          />
        </div>

        {/* Start / Stop */}
        <button
          onClick={running ? stopAudio : startAudio}
          className={`w-full py-3 min-h-[44px] rounded-xl text-base font-mono font-bold transition-colors ${
            running
              ? "bg-rose-500/20 hover:bg-rose-500/35 text-rose-300"
              : "bg-violet-500/20 hover:bg-violet-500/35 text-violet-300"
          }`}
        >
          {running ? "■ Stop" : "▶ Start — hear the waveform"}
        </button>

        <div className="flex items-center justify-between text-xs text-white/40 font-mono">
          <span>Zero deps · Zero permissions · Web Audio API</span>
          <Link href="/dream" className="underline hover:text-white/60 transition-colors">
            ← dream lab
          </Link>
        </div>
      </div>
    </div>
  );
}
