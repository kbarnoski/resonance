"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── music theory constants ──────────────────────────────────────────────────
const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

// Major chord intervals (root, M3, P5); minor (root, m3, P5).
const MAJ_INTERVALS = [0, 4, 7];
const MIN_INTERVALS = [0, 3, 7];

// hue per root (chromatic, 30° per semitone). C=0°→red, D=60°→yellow, A=270°→violet, etc.
function rootHue(root: number) { return root * 30; }

// ─── chord templates ─────────────────────────────────────────────────────────
interface Template { name: string; root: number; quality: "major" | "minor"; bins: number[] }

function buildTemplates(): Template[] {
  const ts: Template[] = [];
  for (let root = 0; root < 12; root++) {
    for (const [quality, intervals] of [
      ["major", MAJ_INTERVALS],
      ["minor", MIN_INTERVALS],
    ] as ["major" | "minor", number[]][]) {
      const bins = new Array<number>(12).fill(0);
      for (const iv of intervals) bins[(root + iv) % 12] = 1;
      ts.push({
        name: NOTES[root] + (quality === "minor" ? "m" : ""),
        root,
        quality,
        bins,
      });
    }
  }
  return ts;
}

const TEMPLATES = buildTemplates();

// ─── chroma extraction ────────────────────────────────────────────────────────
function extractChroma(
  buf: Float32Array,
  sampleRate: number,
  fftSize: number,
): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz = sampleRate / fftSize;

  for (let i = 2; i < buf.length; i++) {
    const freq = i * binHz;
    if (freq < 60 || freq > 5000) continue;
    // dB → linear magnitude
    const mag = Math.pow(10, buf[i] / 20);
    if (mag < 0.002) continue;
    // pitch class: 12 × log2(freq / A4) + 9 semitones → C = 0
    const semitone = Math.round(12 * Math.log2(freq / 440) + 9 + 120);
    chroma[semitone % 12] += mag;
  }

  // L1 normalize
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total < 0.001) return chroma;
  return chroma.map((v) => v / total);
}

// ─── chord matching ───────────────────────────────────────────────────────────
const CHORD_THRESHOLD = 0.28; // min dot-product confidence

function matchChord(chroma: number[]): Template | null {
  let best: Template | null = null;
  let bestScore = CHORD_THRESHOLD;
  for (const t of TEMPLATES) {
    let score = 0;
    for (let i = 0; i < 12; i++) score += chroma[i] * t.bins[i];
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

// ─── rendering ────────────────────────────────────────────────────────────────
interface ChordBlock { name: string; root: number; quality: "major" | "minor"; startMs: number; endMs: number }

const TL_H_FRAC = 0.22;   // timeline height fraction
const CR_H_FRAC = 0.12;   // chromagram height fraction
const PX_PER_SEC = 100;   // timeline scroll speed

function drawCanvas(
  gc: CanvasRenderingContext2D,
  w: number,
  h: number,
  dpr: number,
  chroma: number[],
  current: Template | null,
  blocks: ChordBlock[],
  nowMs: number,
  confidence: number,
) {
  gc.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  gc.fillStyle = "#07070f";
  gc.fillRect(0, 0, w, h);

  const mainH = h * (1 - TL_H_FRAC - CR_H_FRAC);
  const tlTop = mainH;
  const crTop = mainH + h * TL_H_FRAC;

  // ── chord color wash in main area ──
  if (current) {
    const hue = rootHue(current.root);
    const sat = current.quality === "major" ? 80 : 55;
    gc.fillStyle = `hsla(${hue},${sat}%,40%,0.10)`;
    gc.fillRect(0, 0, w, mainH);
  }

  // ── large chord name ──
  const fontSize = Math.min(w * 0.22, mainH * 0.52, 120);
  gc.textAlign = "center";
  gc.textBaseline = "middle";

  if (current) {
    const hue = rootHue(current.root);
    const sat = current.quality === "major" ? 90 : 65;
    // Glow
    gc.shadowColor = `hsl(${hue},${sat}%,65%)`;
    gc.shadowBlur = 28;
    gc.fillStyle = `hsl(${hue},${sat}%,82%)`;
    gc.font = `700 ${fontSize | 0}px 'Courier New', monospace`;
    gc.fillText(current.name, w / 2, mainH * 0.40);
    gc.shadowBlur = 0;

    // Quality label
    const qLabel = current.quality === "major" ? "major" : "minor";
    gc.fillStyle = "rgba(255,255,255,0.55)";
    gc.font = `${Math.max(15, fontSize * 0.28) | 0}px 'Courier New', monospace`;
    gc.fillText(qLabel, w / 2, mainH * 0.40 + fontSize * 0.58);

    // Confidence bar
    const barW = w * 0.38;
    const barH = 5;
    const bx = (w - barW) / 2;
    const by = mainH * 0.40 + fontSize * 0.58 + Math.max(15, fontSize * 0.28) * 1.6;
    gc.fillStyle = "rgba(255,255,255,0.10)";
    gc.fillRect(bx, by, barW, barH);
    gc.fillStyle = `hsl(${hue},${sat}%,65%)`;
    gc.fillRect(bx, by, barW * Math.min(1, confidence), barH);
  } else {
    gc.fillStyle = "rgba(255,255,255,0.22)";
    gc.font = `${Math.max(18, fontSize * 0.42) | 0}px 'Courier New', monospace`;
    gc.fillText("play a chord", w / 2, mainH * 0.42);
  }

  gc.textAlign = "left";
  gc.textBaseline = "alphabetic";

  // ── timeline ──
  const tlH = h * TL_H_FRAC;
  gc.fillStyle = "rgba(0,0,0,0.35)";
  gc.fillRect(0, tlTop, w, tlH);

  // border
  gc.strokeStyle = "rgba(255,255,255,0.08)";
  gc.lineWidth = 1;
  gc.beginPath();
  gc.moveTo(0, tlTop);
  gc.lineTo(w, tlTop);
  gc.stroke();

  // "now" line
  const nowX = w - 48;
  gc.strokeStyle = "rgba(255,255,255,0.18)";
  gc.setLineDash([3, 5]);
  gc.beginPath();
  gc.moveTo(nowX, tlTop);
  gc.lineTo(nowX, tlTop + tlH);
  gc.stroke();
  gc.setLineDash([]);

  // Draw past chord blocks
  const pad = 2;
  for (const blk of blocks) {
    const endX = nowX - (nowMs - blk.endMs) * PX_PER_SEC / 1000;
    const startX = endX - (blk.endMs - blk.startMs) * PX_PER_SEC / 1000;
    if (endX < 0) continue;
    const hue = rootHue(blk.root);
    const sat = blk.quality === "major" ? 85 : 60;
    gc.fillStyle = `hsl(${hue},${sat}%,40%)`;
    gc.fillRect(Math.max(0, startX), tlTop + pad, Math.min(w, endX) - Math.max(0, startX), tlH - pad * 2);
    // chord name inside block
    if (endX - Math.max(0, startX) > 24) {
      gc.fillStyle = `hsl(${hue},${sat}%,80%)`;
      gc.font = `${Math.max(11, tlH * 0.34) | 0}px 'Courier New', monospace`;
      gc.textAlign = "center";
      gc.fillText(blk.name, (Math.max(0, startX) + Math.min(w, endX)) / 2, tlTop + tlH * 0.6);
      gc.textAlign = "left";
    }
  }

  // Draw current (live) block from its start to nowX
  if (current) {
    const liveW = (nowMs - (blocks.at(-1)?.endMs ?? nowMs - 200)) * PX_PER_SEC / 1000;
    const startX = nowX - liveW;
    const hue = rootHue(current.root);
    const sat = current.quality === "major" ? 85 : 60;
    gc.fillStyle = `hsl(${hue},${sat}%,40%)`;
    gc.fillRect(Math.max(0, startX), tlTop + pad, nowX - Math.max(0, startX), tlH - pad * 2);
    gc.fillStyle = `hsl(${hue},${sat}%,85%)`;
    gc.font = `${Math.max(11, tlH * 0.34) | 0}px 'Courier New', monospace`;
    gc.textAlign = "center";
    gc.fillText(current.name, Math.max(10, startX) + Math.min(nowX - Math.max(0, startX), 60) / 2, tlTop + tlH * 0.6);
    gc.textAlign = "left";
  }

  // ── chromagram ──
  const crH = h * CR_H_FRAC;
  gc.fillStyle = "rgba(0,0,0,0.3)";
  gc.fillRect(0, crTop, w, crH);
  gc.strokeStyle = "rgba(255,255,255,0.06)";
  gc.lineWidth = 1;
  gc.beginPath();
  gc.moveTo(0, crTop);
  gc.lineTo(w, crTop);
  gc.stroke();

  const binW = w / 12;
  for (let i = 0; i < 12; i++) {
    const val = chroma[i];
    const barH2 = val * (crH - 6);
    const hue = rootHue(i);
    gc.fillStyle = `hsla(${hue},80%,55%,${0.3 + val * 0.7})`;
    gc.fillRect(i * binW + 1, crTop + crH - barH2 - 3, binW - 2, barH2);
    // note label
    if (crH > 28) {
      gc.fillStyle = val > 0.15 ? `hsl(${hue},80%,80%)` : "rgba(255,255,255,0.25)";
      gc.font = `${Math.max(9, crH * 0.28) | 0}px 'Courier New', monospace`;
      gc.textAlign = "center";
      gc.fillText(NOTES[i], i * binW + binW / 2, crTop + crH - 4);
      gc.textAlign = "left";
    }
  }
}

// ─── demo chord oscillators ────────────────────────────────────────────────────
const DEMO_SEQ: [number[], string][] = [
  [[146.83, 174.61, 220.00], "Dm"],  // Dm: D F A
  [[196.00, 246.94, 293.66], "G"],   // G:  G B D
  [[130.81, 164.81, 196.00], "C"],   // C:  C E G
];

// ─── component ────────────────────────────────────────────────────────────────
export default function ChordCanvasPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const anlRef = useRef<AnalyserNode | null>(null);
  const fftRef = useRef<Float32Array | null>(null);
  const rafRef = useRef(0);
  const runRef = useRef(false);
  const blocksRef = useRef<ChordBlock[]>([]);
  const curRef = useRef<Template | null>(null);
  const curStartRef = useRef(0);
  const demoOscsRef = useRef<OscillatorNode[]>([]);
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoIdxRef = useRef(0);

  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<"mic" | "demo">("mic");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const teardown = useCallback(() => {
    runRef.current = false;
    cancelAnimationFrame(rafRef.current);
    if (demoTimerRef.current) clearInterval(demoTimerRef.current);
    demoTimerRef.current = null;
    demoOscsRef.current.forEach((o) => { try { o.stop(); } catch {} });
    demoOscsRef.current = [];
    acRef.current?.close();
    acRef.current = null;
    anlRef.current = null;
    fftRef.current = null;
    blocksRef.current = [];
    curRef.current = null;
    setOn(false);
    setLabel("");
    setError(null);
  }, []);

  const spawnDemoChord = useCallback((ac: AudioContext, anl: AnalyserNode, idx: number) => {
    // Stop previous chord
    demoOscsRef.current.forEach((o) => {
      try {
        o.stop();
      } catch {}
    });
    demoOscsRef.current = [];

    const [freqs] = DEMO_SEQ[idx];
    const demoGain = ac.createGain();
    demoGain.gain.value = 0.35;
    demoGain.connect(anl);
    anl.connect(ac.destination);

    const oscs = freqs.map((f) => {
      const osc = ac.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      osc.connect(demoGain);
      osc.start();
      return osc;
    });
    demoOscsRef.current = oscs;
  }, []);

  const launch = useCallback(async (newMode: "mic" | "demo") => {
    teardown();
    setError(null);

    const ac = new AudioContext();
    acRef.current = ac;

    const anl = ac.createAnalyser();
    anl.fftSize = 4096;
    anl.smoothingTimeConstant = 0.65;
    anlRef.current = anl;
    fftRef.current = new Float32Array(new ArrayBuffer(anl.frequencyBinCount * 4));

    if (newMode === "mic") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const src = ac.createMediaStreamSource(stream);
        src.connect(anl);
        // Do NOT connect to destination — no feedback loop
      } catch (e) {
        teardown();
        setError(e instanceof Error ? e.message : "Mic unavailable — check permissions.");
        return;
      }
    } else {
      // Demo: cycle through ii-V-I every 2.2s
      spawnDemoChord(ac, anl, 0);
      demoIdxRef.current = 0;
      demoTimerRef.current = setInterval(() => {
        if (!acRef.current || !anlRef.current) return;
        demoIdxRef.current = (demoIdxRef.current + 1) % DEMO_SEQ.length;
        spawnDemoChord(acRef.current, anlRef.current, demoIdxRef.current);
      }, 2200);
    }

    runRef.current = true;
    setOn(true);

    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const chromaSmooth = new Array<number>(12).fill(0);
    const SMOOTH = 0.72;

    function tick() {
      if (!runRef.current) return;
      const fft = fftRef.current!;
      const anlNode = anlRef.current!;
      (anlNode.getFloatFrequencyData as (arr: Float32Array) => void)(fft);

      const raw = extractChroma(fft, ac.sampleRate, anlNode.fftSize);
      for (let i = 0; i < 12; i++) chromaSmooth[i] = chromaSmooth[i] * SMOOTH + raw[i] * (1 - SMOOTH);

      const chord = matchChord(chromaSmooth);
      const nowMs = performance.now();

      // Chord transition tracking
      if (chord?.name !== curRef.current?.name) {
        if (curRef.current) {
          // Close the current block
          const prev = blocksRef.current.at(-1);
          if (prev) prev.endMs = nowMs;
        }
        if (chord) {
          blocksRef.current.push({ name: chord.name, root: chord.root, quality: chord.quality, startMs: nowMs, endMs: nowMs });
        }
        curRef.current = chord;
        curStartRef.current = nowMs;
        setLabel(chord ? chord.name : "");
      } else if (chord && blocksRef.current.length > 0) {
        // Update end of current block
        blocksRef.current[blocksRef.current.length - 1].endMs = nowMs;
      }

      // Prune blocks older than 30s
      const cutoff = nowMs - 30000;
      while (blocksRef.current.length > 0 && blocksRef.current[0].endMs < cutoff) {
        blocksRef.current.shift();
      }

      // Confidence = best template dot-product score for current chord
      let confidence = 0;
      if (chord) {
        for (let i = 0; i < 12; i++) confidence += chromaSmooth[i] * chord.bins[i];
      }

      const gc = canvas.getContext("2d");
      if (gc) {
        drawCanvas(
          gc,
          canvas.width / dpr,
          canvas.height / dpr,
          dpr,
          chromaSmooth,
          chord,
          blocksRef.current.slice(0, -1), // exclude live block (drawn separately in drawCanvas)
          nowMs,
          confidence,
        );
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }, [teardown, spawnDemoChord]);

  useEffect(() => () => { teardown(); }, [teardown]);

  const handleStart = useCallback(() => {
    launch(mode);
  }, [launch, mode]);

  const handleStop = useCallback(() => {
    teardown();
    // Clear canvas
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gc = canvas.getContext("2d");
    if (!gc) return;
    const dpr = window.devicePixelRatio || 1;
    gc.setTransform(dpr, 0, 0, dpr, 0, 0);
    gc.fillStyle = "#07070f";
    gc.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }, [teardown]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#07070f] overflow-hidden">
      {/* Canvas fills everything */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between px-5 pt-4 pb-1">
        <div>
          <h1 className="text-xl font-mono text-foreground tracking-tight">Chord Canvas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What chord are you playing?
          </p>
        </div>
        <a
          href="https://getresonance.vercel.app/dream/229-chord-canvas/README.md"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono text-muted-foreground/70 hover:text-muted-foreground transition-colors mt-1"
        >
          notes ↗
        </a>
      </div>

      {/* Controls */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 px-5 py-2">
        {/* Mode toggle */}
        {!on && (
          <div className="flex rounded-lg overflow-hidden border border-border mr-1">
            {(["mic", "demo"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`min-h-[44px] px-4 py-2 text-sm font-mono transition-colors ${
                  mode === m
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-muted-foreground"
                }`}
              >
                {m === "mic" ? "🎤 Mic" : "♪ Demo"}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={on ? handleStop : handleStart}
          className="min-h-[44px] px-5 py-2.5 rounded-lg text-sm font-mono font-medium transition-colors"
          style={{
            background: on ? "rgba(139,92,246,0.22)" : "rgba(139,92,246,0.14)",
            color: on ? "#c4b5fd" : "#a78bfa",
            border: "1px solid rgba(139,92,246,0.32)",
          }}
        >
          {on ? "Stop" : mode === "mic" ? "Start mic" : "Play demo"}
        </button>

        {on && label && (
          <span className="text-sm font-mono text-muted-foreground ml-1">
            → {label}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="relative z-10 mx-5 mb-2 px-4 py-2.5 rounded-lg text-sm font-mono text-violet-300"
          style={{ background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.25)" }}>
          {error}
        </div>
      )}

      {/* Idle hint */}
      {!on && !error && (
        <div className="relative z-10 mx-5 mt-1 rounded-lg px-4 py-3 text-sm text-muted-foreground"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p>Play any chord on piano (or any instrument). The detector matches your audio against 24 major and minor chord templates using a chromagram — no ML, no server.</p>
          <p className="mt-1.5 text-muted-foreground text-xs">Try the demo to see it work immediately. Then switch to mic and play.</p>
        </div>
      )}

      {/* Footer */}
      <div className="relative z-10 mt-auto px-5 py-2 text-xs font-mono text-muted-foreground/70 flex justify-between">
        <span>24 templates · 12-bin chroma · no deps · {on && mode === "demo" ? "demo ii–V–I" : "Web Audio FFT"}</span>
        <span className="text-muted-foreground/70">229</span>
      </div>
    </div>
  );
}
