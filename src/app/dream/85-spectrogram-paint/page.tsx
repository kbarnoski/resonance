"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Display geometry ─────────────────────────────────────────────────────────
const W = 512;         // spectrogram columns (time axis, ~8.5 s at 60 fps)
const H = 256;         // spectrogram rows (frequency axis)
const MIN_HZ = 20;
const MAX_HZ = 8000;

// Row y (0 = top = high freq) → Hz (log scale, matching piano perception)
function rowHz(y: number): number {
  const t = 1 - y / (H - 1);
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
}

// ─── Ryoji Ikeda-style hot colormap ──────────────────────────────────────────
// Silence = black → dim violet → cyan → white at peak.
// freqT = 0 (bass) → 1 (treble): subtle warm/cool hue shift across frequency.
function ampRgb(amp: number, freqT: number): [number, number, number] {
  const a = amp * amp; // gamma-compress: dark rooms need sharper bright/dark contrast
  if (a < 0.003) return [0, 0, 0];
  const lum = a * 255;
  const r = Math.round(lum * (0.60 + 0.40 * (1 - freqT)));
  const g = Math.round(lum * 0.82);
  const b = Math.round(lum * (0.60 + 0.40 * freqT));
  return [r, g, b];
}

// ─── Demo: simulated C-major piano playing ────────────────────────────────────
// Frequencies in Hz: C2 through C6 with octave harmonics
const DEMO_FREQS = [65, 130, 164, 196, 261, 329, 392, 523, 659, 784, 1047];

function demoAmp(hz: number, t: number): number {
  let amp = 0;
  for (let i = 0; i < DEMO_FREQS.length; i++) {
    const nf = DEMO_FREQS[i];
    // Each note fades in and out at its own rate (LFO at irrational multiples)
    const presence = 0.5 + 0.5 * Math.sin(t * (0.28 + i * 0.063) + i * 0.85);
    if (presence < 0.38) continue;
    const bw = nf * 0.016; // 1.6% bandwidth → sharp lines like real piano
    const d = hz - nf;
    amp += presence * Math.exp(-(d * d) / (2 * bw * bw));
    // Second harmonic (softer)
    if (i % 4 === 0) {
      const d2 = hz - nf * 2;
      amp += presence * 0.35 * Math.exp(-(d2 * d2) / (2 * bw * bw * 4));
    }
  }
  // Sub-bass warmth
  amp += 0.18 * Math.exp(-hz / 55) * (0.55 + 0.45 * Math.sin(t * 1.35));
  return Math.min(1, amp);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SpectrogramPaint() {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const animRef     = useRef(0);

  // Audio
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const freqBufRef   = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);

  // Spectrogram + feedback buffers (created on first run, not SSR-unsafe — only in useEffect)
  const spectRef    = useRef<HTMLCanvasElement | null>(null);
  const pingARef    = useRef<HTMLCanvasElement | null>(null);
  const pingBRef    = useRef<HTMLCanvasElement | null>(null);
  const pingFlipRef = useRef(false);
  const colDataRef  = useRef<ImageData | null>(null);

  const [mode, setMode]         = useState<"idle" | "demo" | "mic">("idle");
  const [micError, setMicError] = useState<string | null>(null);

  // ─── Resize main canvas ────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width  = Math.round(cv.clientWidth  * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ─── Init offscreen buffers when entering run mode ─────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const makeCanvas = (w: number, h: number, fill: string): HTMLCanvasElement => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, w, h);
      return c;
    };

    spectRef.current  = makeCanvas(W, H, "#000");
    pingARef.current  = makeCanvas(W, H, "#000");
    pingBRef.current  = makeCanvas(W, H, "#000");
    pingFlipRef.current = false;
    // Pre-allocate the single-column ImageData (reused every frame)
    colDataRef.current = new ImageData(new Uint8ClampedArray(H * 4), 1, H);

    return () => {
      spectRef.current = null;
      pingARef.current = null;
      pingBRef.current = null;
      colDataRef.current = null;
    };
  }, [mode]);

  // ─── Render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "idle") return;

    const cv = canvasRef.current;
    if (!cv) return;
    const mainCtx = cv.getContext("2d");
    if (!mainCtx) return;

    let frame = 0;

    const tick = () => {
      animRef.current = requestAnimationFrame(tick);
      frame++;

      const spect = spectRef.current;
      const pingA = pingARef.current;
      const pingB = pingBRef.current;
      const colData = colDataRef.current;
      if (!spect || !pingA || !pingB || !colData) return;

      const spectCtx = spect.getContext("2d")!;

      // ── 1. Read FFT (once per frame) ───────────────────────────────────────
      const analyser  = analyserRef.current;
      const freqBuf   = freqBufRef.current;
      if (analyser && freqBuf) analyser.getByteFrequencyData(freqBuf);

      // ── 2. Scroll spectrogram left, write new column at right edge ─────────
      spectCtx.drawImage(spect, -1, 0);

      const t = frame / 60;
      const nyqBins = freqBuf ? freqBuf.length : 0;
      const nyqHz   = analyser ? analyser.context.sampleRate / 2 : 0;

      for (let y = 0; y < H; y++) {
        const hz    = rowHz(y);
        const freqT = Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);

        let amp: number;
        if (analyser && freqBuf && nyqBins > 0) {
          const bin = Math.floor((hz / nyqHz) * nyqBins);
          amp = (freqBuf[Math.min(bin, nyqBins - 1)] ?? 0) / 255;
        } else {
          amp = demoAmp(hz, t);
        }

        const [r, g, b] = ampRgb(amp, freqT);
        const idx = y * 4;
        colData.data[idx]     = r;
        colData.data[idx + 1] = g;
        colData.data[idx + 2] = b;
        colData.data[idx + 3] = 255;
      }
      spectCtx.putImageData(colData, W - 1, 0);

      // ── 3. Ping-pong feedback ──────────────────────────────────────────────
      // ping = current write target, pong = previous frame
      const ping = pingFlipRef.current ? pingB : pingA;
      const pong = pingFlipRef.current ? pingA : pingB;
      pingFlipRef.current = !pingFlipRef.current;

      const pingCtx = ping.getContext("2d")!;

      // Black base (ensures alpha=1 throughout)
      pingCtx.fillStyle = "#000";
      pingCtx.fillRect(0, 0, W, H);

      // Decay previous frame with slow drift+zoom (TD feedback transform)
      pingCtx.save();
      pingCtx.globalAlpha = 0.984;
      pingCtx.translate(W * 0.5, H * 0.5);
      pingCtx.scale(1.0022, 1.0012);                    // gentle zoom
      pingCtx.translate(-W * 0.5 - 0.28, -H * 0.5 - 0.08); // subtle drift
      pingCtx.drawImage(pong, 0, 0);
      pingCtx.restore();

      // Inject fresh spectrogram additively (brighter energy = brighter display)
      pingCtx.globalCompositeOperation = "lighter";
      pingCtx.globalAlpha = 0.52;
      pingCtx.drawImage(spect, 0, 0);
      pingCtx.globalCompositeOperation = "source-over";
      pingCtx.globalAlpha = 1;

      // ── 4. Blit to main canvas (stretched to fill screen) ─────────────────
      mainCtx.drawImage(ping, 0, 0, W, H, 0, 0, cv.width, cv.height);

      // Write-head marker: thin bright line at right edge of display
      mainCtx.fillStyle = "rgba(255,255,255,0.14)";
      mainCtx.fillRect(cv.width - 1, 0, 1, cv.height);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [mode]);

  // ─── Mic controls ──────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    analyserRef.current = null;
    freqBufRef.current  = null;
    streamRef.current?.getTracks().forEach(tr => tr.stop());
    streamRef.current   = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ac = new AudioContext();
      audioCtxRef.current = ac;
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.78;
      ac.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;
      freqBufRef.current  = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      setMicError(null);
      setMode("mic");
    } catch {
      setMicError("Mic unavailable — running demo.");
      setMode("demo");
    }
  }, []);

  const handleStop = useCallback(() => {
    stopAudio();
    setMode("idle");
  }, [stopAudio]);

  // Cleanup on unmount
  useEffect(() => stopAudio, [stopAudio]);

  // ─── Frequency axis labels ─────────────────────────────────────────────────
  const freqLabels: [string, string][] = [
    ["8kHz", "2%"],
    ["2kHz", "26%"],
    ["500Hz", "50%"],
    ["100Hz", "74%"],
    ["20Hz", "96%"],
  ];

  return (
    <main className="relative w-full h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* Full-screen spectrogram canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* ── Idle card ── */}
      {mode === "idle" && (
        <div className="relative z-10 flex flex-col items-center gap-6 bg-black/65 border border-border backdrop-blur-sm rounded-2xl px-8 py-8 max-w-sm text-center">
          <div>
            <h1 className="text-2xl font-mono font-bold text-foreground mb-2">
              spectrogram paint
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Sound crystallizes into a living painting. Time flows left to right;
              pitch rises bottom to top. Notes leave glowing trails that breathe
              and drift — a Ryoji Ikeda-style matrix rendered live.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={startMic}
              className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-foreground font-mono text-base min-h-[44px] transition-colors"
            >
              Start mic
            </button>
            <button
              onClick={() => setMode("demo")}
              className="px-5 py-3 rounded-xl bg-muted hover:bg-accent border border-border text-foreground font-mono text-base min-h-[44px] transition-colors"
            >
              Demo
            </button>
          </div>
          {micError && (
            <p className="text-violet-300 text-sm">{micError}</p>
          )}
        </div>
      )}

      {/* ── Running UI ── */}
      {mode !== "idle" && (
        <>
          {/* Frequency axis labels */}
          <div className="absolute left-2 top-0 bottom-0 z-10 pointer-events-none">
            {freqLabels.map(([label, top]) => (
              <span
                key={label}
                className="absolute text-muted-foreground/70 text-xs font-mono leading-none"
                style={{ top, left: 0 }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Status + controls (bottom bar) */}
          <div className="absolute bottom-4 left-4 right-4 z-10 flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-mono">
              {mode === "mic" ? "● mic live" : "◌ demo"}
            </span>
            <div className="flex gap-2">
              {mode === "demo" && (
                <button
                  onClick={startMic}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs font-mono min-h-[36px] transition-colors"
                >
                  Use mic
                </button>
              )}
              {micError && (
                <span className="text-violet-300 text-xs font-mono self-center">
                  {micError}
                </span>
              )}
              <button
                onClick={handleStop}
                className="px-3 py-1.5 rounded-lg bg-muted hover:bg-accent text-foreground text-xs font-mono min-h-[36px] transition-colors"
              >
                Stop
              </button>
            </div>
          </div>
        </>
      )}

      {/* Nav links */}
      <Link
        href="/dream"
        className="absolute top-4 left-4 z-10 text-muted-foreground text-xs font-mono hover:text-foreground transition-colors"
      >
        ← dream lab
      </Link>
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/85-spectrogram-paint/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-4 z-10 text-muted-foreground text-xs font-mono hover:text-foreground transition-colors"
      >
        design notes ↗
      </Link>
    </main>
  );
}
