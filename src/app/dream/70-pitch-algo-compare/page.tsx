"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────
const FFT_N   = 2048;
const MIN_HZ  = 60;
const MAX_HZ  = 1050;
const MIDI_LO = 36;  // C2
const MIDI_HI = 84;  // C7

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hzToMidi(hz: number) { return 69 + 12 * Math.log2(hz / 440); }
function midiToHz(midi: number) { return 440 * Math.pow(2, (midi - 69) / 12); }
function midiToNote(midi: number) {
  const ns = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  const r = Math.round(midi);
  return ns[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

// ─── FFT magnitude spectrum (Cooley-Tukey, N must be power of 2) ──────────────
function fftMags(td: Float32Array): Float32Array {
  const N = td.length;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let i = 0; i < N; i++) re[i] = td[i];
  // Bit-reverse
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  // Butterfly
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wR = Math.cos(ang), wI = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let tR = 1, tI = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uR = re[i+k], uI = im[i+k];
        const vR = re[i+k+half]*tR - im[i+k+half]*tI;
        const vI = re[i+k+half]*tI + im[i+k+half]*tR;
        re[i+k] = uR+vR; im[i+k] = uI+vI;
        re[i+k+half] = uR-vR; im[i+k+half] = uI-vI;
        const nt = tR*wR - tI*wI; tI = tR*wI + tI*wR; tR = nt;
      }
    }
  }
  const mags = new Float32Array(N >> 1);
  for (let i = 0; i < (N >> 1); i++) mags[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
  return mags;
}

// ─── Pitch algorithms ─────────────────────────────────────────────────────────
interface PR { hz: number; conf: number }

function detectACF(td: Float32Array, sr: number): PR {
  const N = td.length;
  let sumSq = 0;
  for (let i = 0; i < N; i++) sumSq += td[i] * td[i];
  if (Math.sqrt(sumSq / N) < 0.006) return { hz: 0, conf: 0 };

  const minLag = Math.ceil(sr / MAX_HZ);
  const maxLag = Math.min(Math.floor(sr / MIN_HZ), N - 2);

  // Compute normalized ACF and find first local peak
  let prevR = 0, bestLag = -1, bestR = 0, rising = false;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let r = 0;
    for (let i = 0; i < N - lag; i++) r += td[i] * td[i + lag];
    const rn = r / (sumSq || 1);
    if (!rising && rn > prevR) rising = true;
    if (rising && rn > bestR) { bestR = rn; bestLag = lag; }
    if (rising && prevR > rn && bestLag !== -1 && rn < bestR * 0.8) break;
    prevR = rn;
  }

  if (bestLag === -1 || bestR < 0.25) return { hz: 0, conf: 0 };
  return { hz: sr / bestLag, conf: Math.min(1, bestR) };
}

function detectYIN(td: Float32Array, sr: number): PR {
  const N = td.length, W = N >> 1;
  let sumSq = 0;
  for (let i = 0; i < W; i++) sumSq += td[i] * td[i];
  if (Math.sqrt(sumSq / W) < 0.006) return { hz: 0, conf: 0 };

  const minLag = Math.ceil(sr / MAX_HZ);
  const maxLag = Math.min(Math.floor(sr / MIN_HZ), W - 1);

  // Difference function
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++)
    for (let i = 0; i < W; i++) { const x = td[i] - td[i + tau]; d[tau] += x * x; }

  // Cumulative mean normalized difference
  const dn = new Float32Array(maxLag + 1);
  dn[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    dn[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }

  // First dip below threshold
  let tau = minLag;
  while (tau <= maxLag && dn[tau] >= 0.15) tau++;
  if (tau > maxLag) {
    let best = minLag;
    for (let t = minLag + 1; t <= maxLag; t++) if (dn[t] < dn[best]) best = t;
    tau = best;
    if (dn[tau] > 0.35) return { hz: 0, conf: 0 };
  }
  while (tau + 1 <= maxLag && dn[tau + 1] < dn[tau]) tau++;

  // Parabolic interpolation
  let refined = tau;
  if (tau > minLag && tau < maxLag) {
    const s0 = dn[tau-1], s1 = dn[tau], s2 = dn[tau+1];
    const den = 2 * (2*s1 - s2 - s0);
    if (Math.abs(den) > 1e-9) refined = tau + (s2 - s0) / den;
  }
  return { hz: sr / Math.max(1, refined), conf: Math.max(0, Math.min(1, 1 - dn[tau])) };
}

function detectHPS(td: Float32Array, sr: number): PR {
  const N = td.length;
  let sumSq = 0;
  for (let i = 0; i < N; i++) sumSq += td[i] * td[i];
  if (Math.sqrt(sumSq / N) < 0.006) return { hz: 0, conf: 0 };

  const mags = fftMags(td);
  const H = 4;
  const hpsLen = Math.floor(mags.length / H);
  const minBin = Math.max(1, Math.ceil(MIN_HZ * N / sr));
  const maxBin = Math.min(Math.floor(MAX_HZ * N / sr), hpsLen - 1);

  let bestBin = minBin, bestVal = 0, sumVal = 0, cnt = 0;
  for (let k = minBin; k <= maxBin; k++) {
    let prod = 1;
    for (let h = 1; h <= H; h++) { const idx = k * h; prod *= idx < mags.length ? mags[idx] : 0; }
    if (prod > bestVal) { bestVal = prod; bestBin = k; }
    sumVal += prod; cnt++;
  }
  const mean = cnt > 0 ? sumVal / cnt : 1;
  const conf = Math.min(1, bestVal / (mean * 4 + 1e-9));
  if (conf < 0.05) return { hz: 0, conf: 0 };
  return { hz: (bestBin * sr) / N, conf };
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const COL_ACF  = "#f97316";
const COL_YIN  = "#60a5fa";
const COL_HPS  = "#4ade80";
const COL_GOLD = "#fbbf24";

// ─── Demo oscillator pitches (MIDI) ───────────────────────────────────────────
const DEMO_MIDI = [60, 64, 67, 72, 55, 62, 69, 65];

// ─── Types ────────────────────────────────────────────────────────────────────
interface AlgoState { hz: number; conf: number; smoothMidi: number }
type Mode = "idle" | "demo" | "mic";
type AlgoTriple = [AlgoState, AlgoState, AlgoState];

const EMPTY_TRIPLE: AlgoTriple = [
  { hz: 0, conf: 0, smoothMidi: 0 },
  { hz: 0, conf: 0, smoothMidi: 0 },
  { hz: 0, conf: 0, smoothMidi: 0 },
];

// ─── Canvas ───────────────────────────────────────────────────────────────────
function midiY(midi: number, H: number) {
  const PAD = 10;
  const frac = (midi - MIDI_LO) / (MIDI_HI - MIDI_LO);
  return PAD + (H - 2*PAD) * (1 - frac);
}

function drawPitchCanvas(
  canvas: HTMLCanvasElement,
  s: AlgoTriple,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  const LW = 38;  // label column width
  const CW = 44;  // confidence column width
  const RW = W - LW - CW;

  // Semitone grid
  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 0.5;
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    const y = midiY(m, H);
    ctx.beginPath(); ctx.moveTo(LW, y); ctx.lineTo(LW + RW, y); ctx.stroke();
  }

  // Octave labels + grid
  ctx.lineWidth = 1;
  for (let m = MIDI_LO; m <= MIDI_HI; m += 12) {
    const y = midiY(m, H);
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath(); ctx.moveTo(LW, y); ctx.lineTo(LW + RW, y); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.font = `${10}px monospace`;
    ctx.fillText(`C${m/12-1}`, 4, y + 4);
  }

  const CONF_THR = 0.25;
  const algos: [AlgoState, string][] = [[s[0], COL_ACF], [s[1], COL_YIN], [s[2], COL_HPS]];

  // Algorithm cursors (offset slightly so overlapping ones are visible)
  const offsets = [0, 5, 10];
  for (let i = 0; i < 3; i++) {
    const [a, col] = algos[i];
    if (a.conf < CONF_THR || a.smoothMidi < MIDI_LO || a.smoothMidi > MIDI_HI) continue;
    const y = midiY(a.smoothMidi, H);
    const alpha = Math.min(1, (a.conf - CONF_THR) / 0.6);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = col;
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(LW + offsets[i], y);
    ctx.lineTo(LW + RW, y);
    ctx.stroke();
    ctx.restore();
  }

  // Gold consensus cursor
  const vis = algos.filter(([a]) => a.conf >= CONF_THR && a.smoothMidi >= MIDI_LO && a.smoothMidi <= MIDI_HI);
  if (vis.length >= 2) {
    const midis = vis.map(([a]) => a.smoothMidi);
    const spread = Math.max(...midis) - Math.min(...midis);
    if (spread <= 1.5) {
      const avg = midis.reduce((a, b) => a + b, 0) / midis.length;
      const y = midiY(avg, H);
      ctx.save();
      ctx.strokeStyle = COL_GOLD;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.shadowColor = COL_GOLD;
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(LW, y); ctx.lineTo(LW + RW, y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Confidence bars (right column)
  const colors = [COL_ACF, COL_YIN, COL_HPS];
  const labels = ["ACF", "YIN", "HPS"];
  const bH = (H - 16) / 3;
  for (let i = 0; i < 3; i++) {
    const by = 8 + i * bH;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fillRect(LW + RW + 4, by + bH*0.1, CW - 8, bH * 0.7);
    const filled = s[i].conf * bH * 0.7;
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = 0.8;
    ctx.fillRect(LW + RW + 4, by + bH*0.1 + bH*0.7 - filled, CW - 8, filled);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `9px monospace`;
    ctx.fillText(labels[i], LW + RW + 6, by + 10);
  }

  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PitchAlgoCompare() {
  const [mode, setMode] = useState<Mode>("idle");
  const [micErr, setMicErr] = useState<string | null>(null);
  const [results, setResults] = useState<AlgoTriple>(EMPTY_TRIPLE);

  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const acRef       = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const tdBufRef    = useRef<Float32Array | null>(null);
  const rafRef      = useRef<number>(0);
  const smoothRef   = useRef<AlgoTriple>(EMPTY_TRIPLE);
  const lastNoteRef = useRef(0);
  const demoTimerRef= useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoOscRef  = useRef<OscillatorNode | null>(null);
  const demoIdxRef  = useRef(0);

  // ── Draw ──────────────────────────────────────────────────────────────────
  const redraw = useCallback((s: AlgoTriple) => {
    if (canvasRef.current) drawPitchCanvas(canvasRef.current, s);
  }, []);

  // ── Tick ──────────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const ac = acRef.current;
    const td = tdBufRef.current;
    if (analyser && ac && td) {
      analyser.getFloatTimeDomainData(td as unknown as Float32Array<ArrayBuffer>);
      const sr = ac.sampleRate;
      const raw = [detectACF(td, sr), detectYIN(td, sr), detectHPS(td, sr)];
      const EMA = 0.76;
      const ns = smoothRef.current.map((prev, i) => {
        const r = raw[i];
        const newM = r.hz > 0 ? hzToMidi(r.hz) : prev.smoothMidi;
        const prevM = prev.smoothMidi < 10 ? newM : prev.smoothMidi;
        return { hz: r.hz, conf: r.conf, smoothMidi: prevM * EMA + newM * (1 - EMA) };
      }) as AlgoTriple;

      smoothRef.current = ns;

      // Consensus piano tone
      const vis = ns.filter(a => a.conf >= 0.3 && a.hz > 0 && a.smoothMidi >= MIDI_LO && a.smoothMidi <= MIDI_HI);
      if (vis.length >= 2) {
        const midis = vis.map(a => a.smoothMidi);
        if (Math.max(...midis) - Math.min(...midis) <= 1.5) {
          const avg = Math.round(midis.reduce((a, b) => a + b, 0) / midis.length);
          if (avg !== lastNoteRef.current && ac.state === "running") {
            lastNoteRef.current = avg;
            const osc = ac.createOscillator();
            const g = ac.createGain();
            osc.type = "triangle";
            osc.frequency.value = midiToHz(avg);
            g.gain.setValueAtTime(0, ac.currentTime);
            g.gain.linearRampToValueAtTime(0.15, ac.currentTime + 0.01);
            g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
            osc.connect(g); g.connect(ac.destination);
            osc.start(); osc.stop(ac.currentTime + 0.22);
          }
        }
      }

      setResults(ns);
      redraw(ns);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [redraw]);

  // ── Demo ──────────────────────────────────────────────────────────────────
  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ac = new Ctx();
    acRef.current = ac;
    const analyser = ac.createAnalyser();
    analyser.fftSize = FFT_N;
    analyser.smoothingTimeConstant = 0;
    analyserRef.current = analyser;
    tdBufRef.current = new Float32Array(new ArrayBuffer(FFT_N * 4));
    analyser.connect(ac.destination);

    demoIdxRef.current = 0;
    const playNext = () => {
      try { demoOscRef.current?.stop(); } catch (_) { /* already stopped */ }
      demoOscRef.current = null;
      const midi = DEMO_MIDI[demoIdxRef.current++ % DEMO_MIDI.length];
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = midiToHz(midi);
      g.gain.value = 0.18;
      osc.connect(g); g.connect(analyser);
      osc.start();
      demoOscRef.current = osc;
      demoTimerRef.current = setTimeout(playNext, 2800);
    };
    playNext();
    setMode("demo");
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // ── Mic ───────────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ac = new Ctx();
      acRef.current = ac;
      const analyser = ac.createAnalyser();
      analyser.fftSize = FFT_N;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      tdBufRef.current = new Float32Array(new ArrayBuffer(FFT_N * 4));
      ac.createMediaStreamSource(stream).connect(analyser);
      setMode("mic");
      setMicErr(null);
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      setMicErr(e instanceof Error ? e.message : "Microphone unavailable");
    }
  }, [tick]);

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    try { demoOscRef.current?.stop(); } catch (_) { /* ok */ }
    demoOscRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    acRef.current?.close();
    acRef.current = null;
    analyserRef.current = null;
    tdBufRef.current = null;
    smoothRef.current = EMPTY_TRIPLE;
    setResults(EMPTY_TRIPLE);
    setMode("idle");
    redraw(EMPTY_TRIPLE);
  }, [redraw]);

  useEffect(() => () => { stopAll(); }, [stopAll]);

  // ── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = canvas.clientWidth  * dpr;
      canvas.height = canvas.clientHeight * dpr;
      redraw(smoothRef.current);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  // ── Render ────────────────────────────────────────────────────────────────
  const getName = (a: AlgoState) => a.conf >= 0.25 && a.hz > 0 ? midiToNote(a.smoothMidi) : "—";
  const getHz   = (a: AlgoState) => a.conf >= 0.25 && a.hz > 0 ? `${a.hz.toFixed(1)} Hz` : "";

  const vis = results.filter(a => a.conf >= 0.3 && a.hz > 0 && a.smoothMidi >= MIDI_LO && a.smoothMidi <= MIDI_HI);
  const spread = vis.length >= 2
    ? Math.max(...vis.map(a => a.smoothMidi)) - Math.min(...vis.map(a => a.smoothMidi))
    : Infinity;
  const consensusMidi = vis.length >= 2 && spread <= 1.5
    ? vis.map(a => a.smoothMidi).reduce((a, b) => a + b, 0) / vis.length
    : null;

  const algoCfg = [
    { label: "Autocorrelation", abbr: "ACF", color: COL_ACF,  state: results[0],
      desc: "First ACF peak. Works well for pure tones; may have octave errors on complex signals." },
    { label: "YIN",             abbr: "YIN", color: COL_YIN,  state: results[1],
      desc: "Cumulative mean normalized difference with aperiodicity check. ~15% fewer octave errors than ACF." },
    { label: "HPS",             abbr: "HPS", color: COL_HPS,  state: results[2],
      desc: "Harmonic product spectrum (4 harmonics). Excellent for piano and strings; less reliable on sine tones." },
  ];

  return (
    <div className="min-h-screen bg-black flex flex-col px-4 py-8 gap-5">

      {/* Header */}
      <div>
        <div className="text-[9px] tracking-[0.35em] uppercase text-white/20 mb-1">
          Dream Sandbox · /dream/70-pitch-algo-compare
        </div>
        <h1 className="text-2xl tracking-tight text-white/90">Pitch Compare</h1>
        <p className="text-sm text-white/40 mt-1 max-w-lg">
          Three pitch detection algorithms running simultaneously — watch where they agree and where they diverge.
        </p>
      </div>

      {/* Piano roll canvas */}
      <canvas
        ref={canvasRef}
        className="w-full max-w-2xl self-center rounded"
        style={{ height: 340, background: "#000" }}
      />

      {/* Consensus indicator */}
      <div className="max-w-2xl self-center w-full h-6 flex items-center justify-center">
        {consensusMidi !== null ? (
          <span className="text-[10px] tracking-[0.2em] uppercase" style={{ color: COL_GOLD }}>
            ✦ consensus — {midiToNote(consensusMidi)}
            <span className="text-white/25 normal-case tracking-normal ml-2 text-[9px]">
              ({vis.length}/{results.length} algorithms agree)
            </span>
          </span>
        ) : vis.length >= 2 ? (
          <span className="text-[10px] text-white/30">
            diverged — {spread.toFixed(1)} semitone spread
          </span>
        ) : null}
      </div>

      {/* Algorithm cards */}
      <div className="grid grid-cols-3 gap-3 max-w-2xl self-center w-full">
        {algoCfg.map(({ label, abbr, color, state }) => (
          <div key={abbr} className="border border-white/10 rounded p-3 flex flex-col items-center gap-1">
            <div className="text-[8px] tracking-widest uppercase" style={{ color }}>{label}</div>
            <div className="text-2xl font-mono text-white/90 leading-none mt-1">{getName(state)}</div>
            <div className="text-[10px] text-white/30 h-4">{getHz(state)}</div>
            <div className="w-full bg-white/8 rounded-full h-1 mt-0.5 overflow-hidden">
              <div
                className="h-1 rounded-full transition-all duration-75"
                style={{ width: `${state.conf * 100}%`, background: color }}
              />
            </div>
            <div className="text-[9px] text-white/20">{(state.conf * 100).toFixed(0)}% conf</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 max-w-2xl self-center w-full justify-center">
        {mode === "idle" ? (
          <>
            <button onClick={startDemo}
              className="px-6 py-2.5 text-sm border border-white/20 rounded hover:bg-white/5 text-white/70 transition">
              ▶ Demo
            </button>
            <button onClick={startMic}
              className="px-6 py-2.5 text-sm border border-white/20 rounded hover:bg-white/5 text-white/70 transition">
              🎤 Start mic
            </button>
          </>
        ) : (
          <button onClick={stopAll}
            className="px-6 py-2.5 text-sm border border-white/15 rounded hover:bg-white/5 text-white/40 transition">
            ■ Stop
          </button>
        )}
      </div>

      {micErr && <p className="max-w-2xl self-center text-center text-[11px] text-red-400/70">{micErr}</p>}

      {/* Algorithm notes */}
      <div className="max-w-2xl self-center w-full border border-white/8 rounded p-4 grid grid-cols-1 gap-3 text-[10px]">
        <div className="text-[9px] text-white/25 uppercase tracking-widest">Algorithm notes</div>
        {algoCfg.map(({ abbr, color, desc }) => (
          <div key={abbr} className="flex gap-2 items-start">
            <span style={{ color }} className="shrink-0 mt-0.5">■</span>
            <div>
              <span className="text-white/50">{abbr}</span>
              <span className="text-white/25 ml-2">{desc}</span>
            </div>
          </div>
        ))}
        <div className="flex gap-2 items-start">
          <span style={{ color: COL_GOLD }} className="shrink-0 mt-0.5">■</span>
          <div>
            <span className="text-white/50">Consensus</span>
            <span className="text-white/25 ml-2">
              Gold dashed cursor when ≥2 algorithms agree within 1.5 semitones. A faint piano tone
              plays when the consensus note changes. Demo uses a sawtooth (rich harmonics — ideal for HPS).
            </span>
          </div>
        </div>
      </div>

      <Link href="/dream"
        className="self-center text-[10px] text-white/20 hover:text-white/50 transition">
        ← back to dream sandbox
      </Link>
    </div>
  );
}
