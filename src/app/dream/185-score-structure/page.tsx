"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ──────────────────────────────────────────────────────────────────
const FFT_SIZE = 4096;
const SMOOTHING = 0.78;
const MAX_BLOCKS = 48;
const PX_PER_SEC = 22;
const MIN_BLOCK_W = 18;
const SECTION_INTERVAL = 8; // seconds between section re-classification
const CHORD_HOLD_MIN = 0.45; // ignore chord flickers shorter than this

const PC_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const PC_HUE   = [270, 248, 225, 202, 180, 157, 135, 112, 90, 68, 45, 22];

// Chord templates (root + intervals in semitones)
const MAJOR_T = Array.from({ length: 12 }, (_, r) => {
  const t = new Array<number>(12).fill(0);
  [0, 4, 7].forEach(d => { t[(r + d) % 12] = 1; });
  return t;
});
const MINOR_T = Array.from({ length: 12 }, (_, r) => {
  const t = new Array<number>(12).fill(0);
  [0, 3, 7].forEach(d => { t[(r + d) % 12] = 1; });
  return t;
});

// Demo: jazz ii–V–I–IV in C (MIDI numbers)
const DEMO_PROGRESSION = [
  [50, 53, 57, 60], // Dm7
  [55, 59, 62, 65], // G7
  [48, 52, 55, 59], // Cmaj7
  [53, 57, 60, 64], // Fmaj7
];
const DEMO_CHORD_DUR = 2.2; // seconds per chord

// ── Pure helpers (no "use" prefix) ────────────────────────────────────────────
function midiToHz(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function buildChroma(freqBuf: Float32Array, sampleRate: number): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz = sampleRate / FFT_SIZE;
  for (let b = 2; b < freqBuf.length; b++) {
    const freq = b * binHz;
    if (freq < 65 || freq > 4300) continue; // C2 – ~C8
    const midi = 12 * Math.log2(freq / 440) + 69;
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += Math.pow(10, freqBuf[b] / 20);
  }
  const mx = Math.max(...chroma, 1e-9);
  return chroma.map(v => v / mx);
}

function detectChord(chroma: number[]): { root: number; quality: string } {
  let bestRoot = 0, bestQuality = "", best = -Infinity;
  for (let r = 0; r < 12; r++) {
    const maj = MAJOR_T[r].reduce((s, t, i) => s + t * chroma[i], 0);
    if (maj > best) { best = maj; bestRoot = r; bestQuality = ""; }
    const min = MINOR_T[r].reduce((s, t, i) => s + t * chroma[i], 0);
    if (min > best) { best = min; bestRoot = r; bestQuality = "m"; }
  }
  return { root: bestRoot, quality: bestQuality };
}

function classifySection(densPS: number, changeRPM: number, centFrac: number): string {
  if (densPS < 1.2 && changeRPM < 8)           return "Intro";
  if (densPS > 5  && changeRPM > 18)            return "Climax";
  if (densPS > 3  || changeRPM > 12)            return "Build";
  if (centFrac < 0.28 && changeRPM < 7)         return "Resolution";
  return "Coda";
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface ChordBlock {
  name: string;
  root: number;
  quality: string;
  duration: number;
}

type Phase = "idle" | "running";

// ── Sub-component ──────────────────────────────────────────────────────────────
function GaugeBar({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-mono w-[4.5rem] shrink-0">{label}</span>
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${cls} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(value, 1) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ScoreStructurePage() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const actxRef    = useRef<AudioContext | null>(null);
  const analyserRef= useRef<AnalyserNode  | null>(null);
  const rafRef     = useRef<number>(0);
  const streamRef  = useRef<MediaStream   | null>(null);

  // Rolling analysis state (refs — mutated inside rAF)
  const blocksRef         = useRef<ChordBlock[]>([]);
  const curChordNameRef   = useRef("");
  const curChordRootRef   = useRef(0);
  const curChordQualRef   = useRef("");
  const curChordStartRef  = useRef(0);
  const chromaEmaRef      = useRef<number[]>(new Array<number>(12).fill(0));
  const prevRmsRef        = useRef(0);
  const onsetCountRef     = useRef(0);
  const changeCountRef    = useRef(0);
  const windowStartRef    = useRef(0);

  const [phase,    setPhase]   = useState<Phase>("idle");
  const [chord,    setChord]   = useState("—");
  const [section,  setSection] = useState("—");
  const [densNorm, setDensNorm]= useState(0);
  const [compNorm, setCompNorm]= useState(0);
  const [regNorm,  setRegNorm] = useState(0);
  const [errMsg,   setErrMsg]  = useState("");

  // ── rAF loop: analysis + draw ─────────────────────────────────────────────
  const loop = useCallback(() => {
    const canvas   = canvasRef.current;
    const analyser = analyserRef.current;
    const actx     = actxRef.current;
    if (!canvas || !analyser || !actx) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W   = canvas.width;
    const H   = canvas.height;
    const now = actx.currentTime;

    // --- Audio analysis -------------------------------------------------------
    const fLen  = analyser.frequencyBinCount;
    const fBuf  = new Float32Array(fLen) as Float32Array<ArrayBuffer>;
    analyser.getFloatFrequencyData(fBuf);

    const tBuf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(tBuf);
    let rmsSum = 0;
    for (let i = 0; i < tBuf.length; i++) {
      const s = (tBuf[i] - 128) / 128;
      rmsSum += s * s;
    }
    const rms = Math.sqrt(rmsSum / tBuf.length);
    if (rms - prevRmsRef.current > 0.033) onsetCountRef.current++;
    prevRmsRef.current = rms;

    // EMA-smoothed chroma
    const raw = buildChroma(fBuf, actx.sampleRate);
    const EMA = 0.14;
    chromaEmaRef.current = chromaEmaRef.current.map((v, i) => v * (1 - EMA) + raw[i] * EMA);
    const chroma = chromaEmaRef.current;

    // Chord detection
    const { root, quality } = detectChord(chroma);
    const name = PC_NAMES[root] + quality;

    if (name !== curChordNameRef.current && now - curChordStartRef.current > CHORD_HOLD_MIN) {
      // Close the previous chord block
      if (curChordNameRef.current !== "" && now - curChordStartRef.current > CHORD_HOLD_MIN) {
        blocksRef.current.push({
          name:     curChordNameRef.current,
          root:     curChordRootRef.current,
          quality:  curChordQualRef.current,
          duration: now - curChordStartRef.current,
        });
        if (blocksRef.current.length > MAX_BLOCKS) blocksRef.current.shift();
        changeCountRef.current++;
      }
      curChordNameRef.current  = name;
      curChordRootRef.current  = root;
      curChordQualRef.current  = quality;
      curChordStartRef.current = now;
      setChord(name);
    }

    // Spectral centroid
    let cNum = 0, cDen = 0;
    for (let b = 0; b < fLen; b++) {
      const m = Math.pow(10, fBuf[b] / 20);
      cNum += b * m; cDen += m;
    }
    const centFrac = cDen > 0 ? (cNum / cDen) / fLen : 0.5;

    // Section update
    if (now - windowStartRef.current >= SECTION_INTERVAL) {
      const elapsed = now - windowStartRef.current;
      const densPS   = onsetCountRef.current / elapsed;
      const changeRM = changeCountRef.current / elapsed * 60;
      setSection(classifySection(densPS, changeRM, centFrac));
      setDensNorm(Math.min(densPS / 8, 1));
      setCompNorm(Math.min(changeRM / 30, 1));
      setRegNorm(centFrac);
      onsetCountRef.current  = 0;
      changeCountRef.current = 0;
      windowStartRef.current = now;
    }

    // --- Canvas draw ----------------------------------------------------------
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, W, H);

    const TL_Y   = 6;
    const TL_H   = Math.round(H * 0.56);
    const CHRO_Y = TL_Y + TL_H + 18;
    const CHRO_H = Math.round(H * 0.20);
    const rowH   = TL_H / 12;

    // Pitch-class guide lines
    for (let pc = 0; pc < 12; pc++) {
      const py = TL_Y + pc * rowH;
      ctx.strokeStyle = `hsla(${PC_HUE[pc]},40%,28%,0.22)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
    }

    // PC labels (left margin)
    for (let pc = 0; pc < 12; pc++) {
      ctx.fillStyle = `hsla(${PC_HUE[pc]},50%,62%,0.45)`;
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(PC_NAMES[pc], 3, TL_Y + pc * rowH + rowH * 0.65);
    }

    // ── In-progress chord block (growing on right) ──────────────────────────
    const curDur = now - curChordStartRef.current;
    const curW   = Math.min(curDur * PX_PER_SEC, W * 0.38);
    if (curChordNameRef.current && curW > 0) {
      const h = PC_HUE[curChordRootRef.current];
      const s = curChordQualRef.current === "" ? 74 : 50;
      ctx.fillStyle = `hsla(${h},${s}%,30%,0.88)`;
      ctx.fillRect(W - curW, TL_Y, curW, TL_H);
      // Root pitch-class highlight band
      const pcPy = TL_Y + curChordRootRef.current * rowH;
      ctx.fillStyle = `hsla(${h},70%,52%,0.35)`;
      ctx.fillRect(W - curW, pcPy, curW, rowH);
      // Chord name
      ctx.font = "bold 13px monospace";
      ctx.fillStyle = `hsla(${h},60%,90%,0.95)`;
      ctx.textAlign = "center";
      ctx.fillText(curChordNameRef.current, W - curW / 2, TL_Y + 18);
    }

    // ── Past chord blocks ────────────────────────────────────────────────────
    let rx = W - Math.round(curW);
    const pastBlocks = [...blocksRef.current].reverse();
    for (const bl of pastBlocks) {
      const bW = Math.max(MIN_BLOCK_W, Math.min(bl.duration * PX_PER_SEC, W * 0.28));
      const lx = rx - bW;
      if (lx < 16) break;
      const h = PC_HUE[bl.root];
      const s = bl.quality === "" ? 60 : 42;
      ctx.fillStyle = `hsla(${h},${s}%,25%,0.82)`;
      ctx.fillRect(lx, TL_Y, bW - 1, TL_H);
      // Root band
      const pcPy = TL_Y + bl.root * rowH;
      ctx.fillStyle = `hsla(${h},65%,45%,0.28)`;
      ctx.fillRect(lx + 1, pcPy, bW - 2, rowH);
      // Label
      if (bW > 20) {
        ctx.font = `${bW > 38 ? 11 : 9}px monospace`;
        ctx.fillStyle = `hsla(${h},50%,80%,0.82)`;
        ctx.textAlign = "center";
        ctx.fillText(bl.name, lx + bW / 2, TL_Y + 13);
      }
      rx = lx;
    }

    // Timeline border
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, TL_Y + 0.5, W - 1, TL_H);

    // "← older" label
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    ctx.fillText("← older", 20, TL_Y + TL_H - 5);
    ctx.textAlign = "right";
    ctx.fillText("now →", W - 4, TL_Y + TL_H - 5);

    // ── Chromagram ────────────────────────────────────────────────────────────
    const barW = (W - 24) / 12;
    for (let pc = 0; pc < 12; pc++) {
      const val = chroma[pc];
      const bH  = Math.max(2, Math.round(val * CHRO_H));
      const h   = PC_HUE[pc];
      const isRoot = pc === curChordRootRef.current;
      ctx.fillStyle = isRoot
        ? `hsla(${h},80%,62%,0.95)`
        : `hsla(${h},60%,44%,0.72)`;
      ctx.fillRect(12 + pc * barW, CHRO_Y + CHRO_H - bH, barW - 2, bH);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(PC_NAMES[pc], 12 + pc * barW + (barW - 2) / 2, CHRO_Y + CHRO_H + 11);
    }
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    ctx.fillText("chromagram", W - 4, CHRO_Y + CHRO_H + 11);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── Start mic ─────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const actx = new AudioContext();
      actxRef.current = actx;
      const analyser = actx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = SMOOTHING;
      analyserRef.current = analyser;
      actx.createMediaStreamSource(stream).connect(analyser);
      // analyser intentionally not connected to destination (no feedback)
      windowStartRef.current = actx.currentTime;
      curChordStartRef.current = actx.currentTime;
      setPhase("running");
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setErrMsg("Microphone access denied — try the demo instead.");
    }
  }, [loop]);

  // ── Start demo ────────────────────────────────────────────────────────────
  const startDemo = useCallback(() => {
    const actx = new AudioContext();
    actxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    analyserRef.current = analyser;
    analyser.connect(actx.destination);

    let t = actx.currentTime + 0.08;
    const reps = 6;
    for (let rep = 0; rep < reps; rep++) {
      DEMO_PROGRESSION.forEach(notes => {
        notes.forEach(midi => {
          const osc  = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = "triangle";
          osc.frequency.value = midiToHz(midi);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.07, t + 0.06);
          gain.gain.setValueAtTime(0.07, t + DEMO_CHORD_DUR - 0.15);
          gain.gain.linearRampToValueAtTime(0, t + DEMO_CHORD_DUR);
          osc.connect(gain);
          gain.connect(analyser);
          osc.start(t);
          osc.stop(t + DEMO_CHORD_DUR);
        });
        t += DEMO_CHORD_DUR;
      });
    }

    windowStartRef.current = actx.currentTime;
    curChordStartRef.current = actx.currentTime;
    setPhase("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      void actxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Canvas resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      canvas.width  = Math.round(r.width);
      canvas.height = Math.round(r.height);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#050508] text-foreground overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-2 shrink-0">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Score Structure</h1>
          <p className="text-base text-muted-foreground mt-0.5 max-w-md leading-snug">
            The architecture of your improvisation — chord timeline, density, and section
            shape revealed in real time.
          </p>
        </div>
        <Link
          href="/dream"
          className="text-muted-foreground text-sm font-mono hover:text-foreground transition-colors mt-1 shrink-0 ml-4"
        >
          ← dream lab
        </Link>
      </div>

      {/* Controls / HUD */}
      <div className="px-5 pb-3 shrink-0">
        {phase === "idle" ? (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={startDemo}
              className="px-5 py-2.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-mono rounded hover:bg-violet-500/30 transition min-h-[44px]"
            >
              ▶ Demo (ii–V–I–IV)
            </button>
            <button
              onClick={() => { void startMic(); }}
              className="px-5 py-2.5 bg-muted border border-border text-foreground text-base font-mono rounded hover:bg-accent transition min-h-[44px]"
            >
              🎤 Start mic
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-muted-foreground text-xs font-mono uppercase tracking-wider">Chord</div>
              <div className="text-3xl font-mono font-bold text-foreground leading-tight">{chord}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs font-mono uppercase tracking-wider">Section</div>
              <div className="text-xl font-mono text-violet-300/95 leading-tight">{section}</div>
            </div>
            <div className="ml-auto flex flex-col gap-1.5">
              <GaugeBar label="Density"    value={densNorm} cls="bg-violet-500" />
              <GaugeBar label="Chord rate" value={compNorm} cls="bg-violet-400"   />
              <GaugeBar label="Register"   value={regNorm}  cls="bg-violet-400"  />
            </div>
          </div>
        )}
        {errMsg && (
          <p className="text-violet-300 text-base font-mono mt-2">{errMsg}</p>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {phase !== "idle" && section !== "—" && (
          <div className="absolute top-2 right-3 font-mono font-bold text-7xl text-muted-foreground/70 pointer-events-none select-none leading-none">
            {section}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center px-5 py-2 text-muted-foreground text-xs font-mono shrink-0 border-t border-border">
        <span>185-score-structure · cycle 217 · zero deps · zero api</span>
        <span className="text-muted-foreground/70">chord detection · chromagram · section classifier</span>
      </div>
    </div>
  );
}
