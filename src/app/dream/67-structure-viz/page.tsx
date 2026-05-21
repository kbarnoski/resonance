"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

const FFT_SIZE = 2048;
const FEAT_BINS = 32;
const BAR_MS = 1500;
const MAX_BARS = 64;
const MAX_CANVAS_PX = 320;

// ── Spectral feature extraction ───────────────────────────────────────────────

function extractFeatureVec(buf: Float32Array, sampleRate: number): Float32Array {
  const binHz = sampleRate / FFT_SIZE;
  const f = new Float32Array(FEAT_BINS);
  for (let i = 0; i < FEAT_BINS; i++) {
    const lo = 30 * Math.pow(16000 / 30, i / FEAT_BINS);
    const hi = 30 * Math.pow(16000 / 30, (i + 1) / FEAT_BINS);
    const b0 = Math.max(0, Math.floor(lo / binHz));
    const b1 = Math.min(buf.length - 1, Math.ceil(hi / binHz));
    let s = 0;
    let cnt = 0;
    for (let b = b0; b <= b1; b++) {
      s += Math.pow(10, buf[b] / 20);
      cnt++;
    }
    f[i] = cnt > 0 ? s / cnt : 0;
  }
  let norm = 0;
  for (let i = 0; i < FEAT_BINS; i++) norm += f[i] * f[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < FEAT_BINS; i++) f[i] /= norm;
  return f;
}

function computeCosSim(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

// ── Section boundary detection via checkerboard kernel ────────────────────────

function detectSectionBounds(mat: number[][], minDist = 3): number[] {
  const n = mat.length;
  if (n < 6) return [];
  const k = 2;
  const nov = new Float32Array(n);
  for (let i = k; i < n - k; i++) {
    let v = 0;
    for (let d = 1; d <= k; d++) {
      for (let e = 1; e <= k; e++) {
        if (i - d >= 0 && i - e >= 0) v += mat[i - d][i - e];
        if (i + d < n && i + e < n) v += mat[i + d][i + e];
        if (i - d >= 0 && i + e < n) v -= mat[i - d][i + e];
        if (i + d < n && i - e >= 0) v -= mat[i + d][i - e];
      }
    }
    nov[i] = Math.max(0, v);
  }
  const bounds: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (
      nov[i] > nov[i - 1] &&
      nov[i] >= nov[i + 1] &&
      nov[i] > 1.5 &&
      (bounds.length === 0 || i - bounds[bounds.length - 1] >= minDist)
    ) {
      bounds.push(i);
    }
  }
  return bounds;
}

// ── Section label assignment (greedy similarity) ───────────────────────────────

function assignLabels(bars: Float32Array[], bounds: number[]): string[] {
  const n = bars.length;
  if (n === 0) return [];
  const bps = [0, ...bounds, n];
  const ALPHA = "ABCDEFGHIJKLMNOP";

  const protos: Float32Array[] = [];
  const spans: [number, number][] = [];
  for (let i = 0; i + 1 < bps.length; i++) {
    const s = bps[i];
    const e = Math.min(bps[i + 1], n);
    if (e <= s) continue;
    spans.push([s, e]);
    const p = new Float32Array(FEAT_BINS);
    for (let b = s; b < e; b++) for (let j = 0; j < FEAT_BINS; j++) p[j] += bars[b][j];
    const c = e - s;
    let nm = 0;
    for (let j = 0; j < FEAT_BINS; j++) { p[j] /= c; nm += p[j] * p[j]; }
    nm = Math.sqrt(nm);
    if (nm > 0) for (let j = 0; j < FEAT_BINS; j++) p[j] /= nm;
    protos.push(p);
  }

  const used: { proto: Float32Array; base: string; uses: number }[] = [];
  let nextLetter = 0;
  const sectionLabels: string[] = [];

  for (let i = 0; i < protos.length; i++) {
    let bestSim = 0;
    let bestJ = -1;
    for (let j = 0; j < used.length; j++) {
      const sim = computeCosSim(protos[i], used[j].proto);
      if (sim > bestSim) { bestSim = sim; bestJ = j; }
    }
    if (bestSim > 0.82 && bestJ >= 0) {
      used[bestJ].uses++;
      sectionLabels.push(used[bestJ].base + "'".repeat(used[bestJ].uses - 1));
    } else {
      const letter = ALPHA[nextLetter % ALPHA.length];
      nextLetter++;
      used.push({ proto: protos[i], base: letter, uses: 1 });
      sectionLabels.push(letter);
    }
  }

  const barLabels = new Array(n).fill("");
  for (let i = 0; i < spans.length; i++) {
    const [s, e] = spans[i];
    for (let b = s; b < e; b++) barLabels[b] = sectionLabels[i];
  }
  return barLabels;
}

// ── SSM colormap: dark purple → blue-violet → bright white ───────────────────

function simColor(s: number): [number, number, number] {
  if (s < 0.5) {
    const t = s * 2;
    return [Math.round(5 + 25 * t), Math.round(5 + 20 * t), Math.round(20 + 100 * t)];
  }
  if (s < 0.85) {
    const t = (s - 0.5) / 0.35;
    return [Math.round(30 + 155 * t), Math.round(25 + 75 * t), Math.round(120 + 130 * t)];
  }
  const t = (s - 0.85) / 0.15;
  return [Math.round(185 + 70 * t), Math.round(100 + 155 * t), 255];
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StructureViz() {
  const [status, setStatus] = useState<"idle" | "demo" | "mic">("idle");
  const [barCount, setBarCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fftBufRef = useRef<Float32Array | null>(null);
  const barsRef = useRef<Float32Array[]>([]);
  const matrixRef = useRef<number[][]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawSSM = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bars = barsRef.current;
    const mat = matrixRef.current;
    const n = bars.length;
    if (n < 2) return;

    const cell = Math.max(2, Math.floor(MAX_CANVAS_PX / n));
    const size = cell * n;
    const tlH = 28;
    canvas.width = size;
    canvas.height = size + tlH;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size + tlH}px`;

    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    // Heatmap
    for (let r = 0; r < n; r++) {
      for (let cc = 0; cc < n; cc++) {
        const sim = mat[r]?.[cc] ?? 0;
        const [rv, gv, bv] = simColor(sim);
        c2d.fillStyle = `rgb(${rv},${gv},${bv})`;
        c2d.fillRect(cc * cell, r * cell, cell, cell);
      }
    }

    // Section detection
    const bounds = detectSectionBounds(mat);
    const barLabels = assignLabels(bars, bounds);

    // Boundary lines
    c2d.strokeStyle = "rgba(255,255,255,0.45)";
    c2d.lineWidth = 1;
    for (const b of bounds) {
      const px = b * cell + 0.5;
      c2d.beginPath(); c2d.moveTo(px, 0); c2d.lineTo(px, size); c2d.stroke();
      c2d.beginPath(); c2d.moveTo(0, px); c2d.lineTo(size, px); c2d.stroke();
    }

    // Timeline strip
    const SECTION_COLORS = ["#4af", "#fa4", "#4fa", "#f4a", "#a4f", "#af4", "#ff4", "#4ff"];
    const usedColors: Record<string, number> = {};
    let colorIdx = 0;
    c2d.font = "bold 10px monospace";
    c2d.textBaseline = "middle";
    c2d.textAlign = "center";

    let i = 0;
    while (i < n) {
      const label = barLabels[i] || "?";
      let j = i + 1;
      while (j < n && barLabels[j] === label) j++;
      const x0 = i * cell;
      const x1 = j * cell;
      const baseLabel = label.replace(/'/g, "");
      if (!(baseLabel in usedColors)) {
        usedColors[baseLabel] = colorIdx % SECTION_COLORS.length;
        colorIdx++;
      }
      const col = SECTION_COLORS[usedColors[baseLabel]];
      c2d.fillStyle = col + "40";
      c2d.fillRect(x0, size + 2, x1 - x0, tlH - 4);
      c2d.fillStyle = col;
      c2d.fillText(label, (x0 + x1) / 2, size + tlH / 2);
      i = j;
    }
  }, []);

  const captureBar = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    const buf = fftBufRef.current;
    if (!analyser || !ctx || !buf) return;

    analyser.getFloatFrequencyData(buf as unknown as Float32Array<ArrayBuffer>);
    const feat = extractFeatureVec(buf, ctx.sampleRate);

    const bars = barsRef.current;
    if (bars.length >= MAX_BARS) bars.shift();
    bars.push(feat);

    const n = bars.length;
    // Full matrix recompute — n ≤ 64, ~131K FLOPs, negligible at 1.5s intervals
    const mat: number[][] = [];
    for (let r = 0; r < n; r++) {
      mat.push([]);
      for (let cc = 0; cc < n; cc++) {
        mat[r].push(r === cc ? 1 : computeCosSim(bars[r], bars[cc]));
      }
    }
    matrixRef.current = mat;
    setBarCount(n);
    drawSSM();
  }, [drawSSM]);

  const stopAll = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    fftBufRef.current = null;
    barsRef.current = [];
    matrixRef.current = [];
    setBarCount(0);
  }, []);

  const startDemo = useCallback(() => {
    stopAll();
    setStatus("demo");
    setError(null);

    const ACtx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new ACtx();
    ctxRef.current = ctx;
    void ctx.resume();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.05;
    analyserRef.current = analyser;
    fftBufRef.current = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));

    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(analyser);
    analyser.connect(ctx.destination);

    // ABA structure: 3 phases × 16s each = 48s total
    const PHASE_A = [130.81, 164.81, 196.0]; // C3, E3, G3
    const PHASE_B = [440.0, 523.25, 659.26]; // A4, C5, E5

    const schedulePhase = (freqs: number[], t: number, dur: number) => {
      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.28, t + 0.8);
        g.gain.setValueAtTime(0.28, t + dur - 0.8);
        g.gain.linearRampToValueAtTime(0, t + dur);
        osc.connect(g);
        g.connect(master);
        osc.start(t);
        osc.stop(t + dur);
      }
    };

    const t0 = ctx.currentTime + 0.2;
    schedulePhase(PHASE_A, t0, 16);        // A:  0–16s
    schedulePhase(PHASE_B, t0 + 16, 16);  // B: 16–32s
    schedulePhase(PHASE_A, t0 + 32, 16);  // A′: 32–48s

    timerRef.current = setInterval(captureBar, BAR_MS);
  }, [stopAll, captureBar]);

  const startMic = useCallback(async () => {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ACtx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new ACtx();
      ctxRef.current = ctx;
      void ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.05;
      analyserRef.current = analyser;
      fftBufRef.current = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));

      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      setStatus("mic");
      setError(null);
      timerRef.current = setInterval(captureBar, BAR_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable.");
    }
  }, [stopAll, captureBar]);

  useEffect(() => () => stopAll(), [stopAll]);

  return (
    <div className="min-h-screen bg-black text-white font-mono p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl tracking-tight mb-1">Structure Viz</h1>
            <p className="text-xs text-white/50 max-w-md leading-relaxed">
              Your music as a map of itself. Each row and column is a 1.5-second
              audio snapshot. Bright squares mean similar material. Block diagonals
              reveal repeating sections — verse, chorus, bridge, return.
            </p>
          </div>
          <Link
            href="/dream"
            className="text-[11px] text-white/30 hover:text-white/50 ml-4 shrink-0"
          >
            ← back
          </Link>
        </div>

        {/* Controls */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={startDemo}
            className={`px-4 py-2 text-xs tracking-wider uppercase border rounded transition ${
              status === "demo"
                ? "border-cyan-400/60 text-cyan-300"
                : "border-white/20 text-white/55 hover:border-white/50 hover:text-white"
            }`}
          >
            ▶ Demo (ABA)
          </button>
          <button
            onClick={startMic}
            className={`px-4 py-2 text-xs tracking-wider uppercase border rounded transition ${
              status === "mic"
                ? "border-cyan-400/60 text-cyan-300"
                : "border-white/20 text-white/55 hover:border-white/50 hover:text-white"
            }`}
          >
            🎤 Mic
          </button>
          {status !== "idle" && (
            <button
              onClick={() => {
                stopAll();
                setStatus("idle");
              }}
              className="px-4 py-2 text-xs tracking-wider uppercase border border-white/15 text-white/35 hover:border-white/35 hover:text-white/55 rounded transition"
            >
              Stop
            </button>
          )}
        </div>

        {/* Status */}
        <div className="text-[11px] text-white/40 min-h-4">
          {status === "demo" && (
            <>
              Demo: A (C3 chord, 0–16s) → B (A4 chord, 16–32s) → A′ (returns, 32–48s). Watch
              two bright off-diagonal blocks emerge.{" "}
              {barCount > 0 && (
                <span className="text-white/60">
                  {barCount} bar{barCount !== 1 ? "s" : ""} ·{" "}
                  {((barCount * BAR_MS) / 1000).toFixed(0)}s captured
                </span>
              )}
            </>
          )}
          {status === "mic" && (
            <>
              Listening — play sections with clear contrast or repeating material.{" "}
              {barCount > 0 && (
                <span className="text-white/60">
                  {barCount} bar{barCount !== 1 ? "s" : ""} ·{" "}
                  {((barCount * BAR_MS) / 1000).toFixed(0)}s
                </span>
              )}
            </>
          )}
          {status === "idle" && "Press Demo to see ABA structure, or Mic to analyze your playing."}
        </div>

        {/* SSM canvas */}
        <div className="overflow-x-auto">
          {barCount < 2 && status !== "idle" && (
            <div
              className="border border-white/10 flex items-center justify-center text-xs text-white/25"
              style={{ width: 160, height: 80 }}
            >
              {barCount === 0 ? "capturing first bar…" : "waiting for second bar…"}
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="border border-white/10"
            style={{ display: barCount >= 2 ? "block" : "none" }}
          />
        </div>

        {/* Legend */}
        <div className="text-[10px] text-white/28 space-y-0.5 leading-relaxed">
          <div>
            <span style={{ color: "rgb(185,100,255)" }}>■</span> bright white ={" "}
            <span className="text-white/45">acoustically similar</span>
            {"  "}
            <span style={{ color: "rgb(5,5,20)" }} className="border border-white/10">
              ■
            </span>{" "}
            dark ={" "}
            <span className="text-white/45">contrasting material</span>
          </div>
          <div>white lines = detected section boundaries (checkerboard kernel)</div>
          <div>
            colored strip = A / B / A′ labels — matching letter means recurring material
          </div>
        </div>

        {error && <p className="text-xs text-rose-300/80">{error}</p>}

        <Link
          href="/dream/67-structure-viz/README.md"
          className="block text-[11px] text-white/20 hover:text-white/50 pt-1"
        >
          design notes →
        </Link>
      </div>
    </div>
  );
}
