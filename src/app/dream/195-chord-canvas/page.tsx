"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────
const FFT_SIZE   = 2048;
const SMOOTHING  = 0.80;
const PX_PER_SEC = 52;
const MAX_BLOCKS = 60;
const HOLD_MIN   = 0.38;
const EMA_K      = 0.11;

// Pitch-class names (sharps and flats variants)
const PC_NAMES      = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const PC_NAMES_FLAT = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
const PC_HUE        = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

// Chord quality visual style
interface QS { label: string; sat: number; lit: number; hs: number }

const QUAL_MAP: Record<string, QS> = {
  "":    { label: "",     sat: 78, lit: 40, hs:   0 },
  "m":   { label: "m",   sat: 50, lit: 32, hs:   0 },
  "7":   { label: "7",   sat: 68, lit: 42, hs:  18 },
  "m7":  { label: "m7",  sat: 46, lit: 32, hs:   6 },
  "maj7":{ label: "maj7",sat: 72, lit: 44, hs: -10 },
  "dim": { label: "dim", sat: 22, lit: 38, hs:  24 },
  "aug": { label: "aug", sat: 82, lit: 46, hs:  35 },
  "sus4":{ label: "sus4",sat: 52, lit: 36, hs:  12 },
  "sus2":{ label: "sus2",sat: 48, lit: 35, hs:   8 },
};

function getQS(q: string): QS { return QUAL_MAP[q] ?? QUAL_MAP[""]; }

function chordDisplay(root: number, quality: string, flat: boolean): string {
  return (flat ? PC_NAMES_FLAT : PC_NAMES)[root] + (QUAL_MAP[quality]?.label ?? "");
}

// ── Chord templates ───────────────────────────────────────────────────────────
function pcVec(pcs: number[]): number[] {
  const v = new Array<number>(12).fill(0);
  pcs.forEach(pc => { v[pc % 12] = 1; });
  return v;
}

function buildAllVecs(intervals: number[]): number[][] {
  return Array.from({ length: 12 }, (_, r) =>
    pcVec(intervals.map(d => (r + d) % 12))
  );
}

// 9 qualities × 12 roots = 108 templates
const TEMPLATES = [
  { quality: "",     vecs: buildAllVecs([0, 4, 7])      },  // major
  { quality: "m",    vecs: buildAllVecs([0, 3, 7])      },  // minor
  { quality: "7",    vecs: buildAllVecs([0, 4, 7, 10])  },  // dominant 7th
  { quality: "m7",   vecs: buildAllVecs([0, 3, 7, 10])  },  // minor 7th
  { quality: "maj7", vecs: buildAllVecs([0, 4, 7, 11])  },  // major 7th
  { quality: "dim",  vecs: buildAllVecs([0, 3, 6])      },  // diminished
  { quality: "aug",  vecs: buildAllVecs([0, 4, 8])      },  // augmented
  { quality: "sus4", vecs: buildAllVecs([0, 5, 7])      },  // suspended 4th
  { quality: "sus2", vecs: buildAllVecs([0, 2, 7])      },  // suspended 2nd
];

// ── Demo: Dm7 → G7 → Cmaj7 → Bdim → Caug → Dsus4 (×3) ──────────────────────
const DEMO_NOTES = [
  { midis: [50, 53, 57, 60], dur: 2.2 },  // Dm7
  { midis: [43, 47, 50, 53], dur: 2.2 },  // G7
  { midis: [48, 52, 55, 59], dur: 2.8 },  // Cmaj7
  { midis: [47, 50, 53],     dur: 2.0 },  // Bdim
  { midis: [48, 52, 56],     dur: 2.2 },  // Caug  (C E G#)
  { midis: [50, 55, 57],     dur: 2.2 },  // Dsus4 (D G A)
];

// ── Pure helpers ──────────────────────────────────────────────────────────────
function midiToHz(m: number) { return 440 * 2 ** ((m - 69) / 12); }

function buildChroma(fBuf: Float32Array, sr: number): number[] {
  const chroma = new Array<number>(12).fill(0);
  const binHz  = sr / FFT_SIZE;
  for (let b = 2; b < fBuf.length; b++) {
    const freq = b * binHz;
    if (freq < 65 || freq > 4200) continue;
    const pc = ((Math.round(12 * Math.log2(freq / 440) + 69) % 12) + 12) % 12;
    chroma[pc] += 10 ** (fBuf[b] / 20);
  }
  const mx = Math.max(...chroma, 1e-9);
  return chroma.map(v => v / mx);
}

function detectChord(chroma: number[]): { root: number; quality: string } {
  let bestRoot = 0, bestQ = "", best = -Infinity;
  for (const tmpl of TEMPLATES) {
    for (let r = 0; r < 12; r++) {
      const s = tmpl.vecs[r].reduce((acc, t, i) => acc + t * chroma[i], 0);
      if (s > best) { best = s; bestRoot = r; bestQ = tmpl.quality; }
    }
  }
  return { root: bestRoot, quality: bestQ };
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Block { root: number; quality: string; duration: number }
type Phase = "idle" | "running";

// ── Component ─────────────────────────────────────────────────────────────────
export default function ChordCanvasPage() {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const actxRef     = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode  | null>(null);
  const streamRef   = useRef<MediaStream   | null>(null);
  const rafRef      = useRef<number>(0);

  const blocksRef   = useRef<Block[]>([]);
  const curNameRef  = useRef("");   // canonical (sharps) name for comparison
  const curRootRef  = useRef(0);
  const curQualRef  = useRef("");
  const curStartRef = useRef(0);
  const chromaRef   = useRef<number[]>(new Array<number>(12).fill(0));
  const flatsRef    = useRef(false);
  const lockedRef   = useRef(false);

  const [phase,    setPhase]    = useState<Phase>("idle");
  const [cRoot,    setCRoot]    = useState(0);
  const [cQual,    setCQual]    = useState("");
  const [detected, setDetected] = useState(false);
  const [errMsg,   setErrMsg]   = useState("");
  const [useFlats, setUseFlats] = useState(false);
  const [locked,   setLocked]   = useState(false);

  useEffect(() => { flatsRef.current  = useFlats; }, [useFlats]);
  useEffect(() => { lockedRef.current = locked;   }, [locked]);

  // ── rAF loop ──────────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const canvas   = canvasRef.current;
    const analyser = analyserRef.current;
    const actx     = actxRef.current;
    if (!canvas || !analyser || !actx) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const W   = canvas.width;
    const H   = canvas.height;
    const now = actx.currentTime;

    // Audio analysis
    const fBuf = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
    analyser.getFloatFrequencyData(fBuf);

    const raw = buildChroma(fBuf, actx.sampleRate);
    chromaRef.current = chromaRef.current.map((v, i) => v * (1 - EMA_K) + raw[i] * EMA_K);
    const chroma = chromaRef.current;

    const { root, quality } = detectChord(chroma);
    const canonName = PC_NAMES[root] + getQS(quality).label;

    // Update detection — skips entirely when locked
    if (!lockedRef.current && canonName !== curNameRef.current && now - curStartRef.current > HOLD_MIN) {
      if (curNameRef.current !== "") {
        blocksRef.current.push({
          root:     curRootRef.current,
          quality:  curQualRef.current,
          duration: now - curStartRef.current,
        });
        if (blocksRef.current.length > MAX_BLOCKS) blocksRef.current.shift();
      }
      curNameRef.current  = canonName;
      curRootRef.current  = root;
      curQualRef.current  = quality;
      curStartRef.current = now;
      setCRoot(root);
      setCQual(quality);
      setDetected(true);
    }

    // ── Draw ──────────────────────────────────────────────────────────────
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = "#04040a";
    ctx2d.fillRect(0, 0, W, H);

    const CHRO_H = Math.min(72, Math.round(H * 0.22));
    const CHRO_Y = H - CHRO_H - 22;
    const TL_H   = CHRO_Y - 6;
    const flat   = flatsRef.current;

    // ── Chord timeline ───────────────────────────────────────────────────
    const curDur = now - curStartRef.current;
    const curW   = Math.min(curDur * PX_PER_SEC, W * 0.55);

    if (curNameRef.current) {
      const qs = getQS(curQualRef.current);
      const h  = (PC_HUE[curRootRef.current] + qs.hs + 360) % 360;
      ctx2d.fillStyle = `hsla(${h},${qs.sat}%,${qs.lit}%,0.90)`;
      ctx2d.fillRect(W - curW, 0, curW, TL_H);

      const grd = ctx2d.createLinearGradient(0, 0, 0, TL_H);
      grd.addColorStop(0, `hsla(${h},${qs.sat}%,${qs.lit + 22}%,0.18)`);
      grd.addColorStop(0.4, "transparent");
      ctx2d.fillStyle = grd;
      ctx2d.fillRect(W - curW, 0, curW, TL_H);

      const fs = TL_H > 90 ? 22 : 16;
      ctx2d.font = `bold ${fs}px monospace`;
      ctx2d.fillStyle = `hsla(${h},${qs.sat}%,92%,0.98)`;
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText(chordDisplay(curRootRef.current, curQualRef.current, flat), W - curW / 2, TL_H / 2);
      ctx2d.textBaseline = "alphabetic";
    }

    // Past blocks (most recent first, drawn right to left)
    let rx = W - Math.round(curW);
    for (let i = blocksRef.current.length - 1; i >= 0; i--) {
      const bl = blocksRef.current[i];
      const bW = Math.max(14, Math.min(bl.duration * PX_PER_SEC, W * 0.45));
      const lx = rx - bW;
      if (lx < -bW) break;
      const qs  = getQS(bl.quality);
      const h   = (PC_HUE[bl.root] + qs.hs + 360) % 360;
      const age = (blocksRef.current.length - 1 - i) / Math.max(blocksRef.current.length, 1);
      const a   = Math.max(0.20, 0.88 - age * 0.60);
      ctx2d.fillStyle = `hsla(${h},${qs.sat}%,${qs.lit}%,${a.toFixed(2)})`;
      ctx2d.fillRect(lx, 0, bW - 1, TL_H);

      if (bW > 26) {
        const fs2 = bW > 60 ? 14 : 10;
        ctx2d.font = `bold ${fs2}px monospace`;
        ctx2d.fillStyle = `hsla(${h},${qs.sat}%,92%,${(a * 0.95).toFixed(2)})`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.fillText(chordDisplay(bl.root, bl.quality, flat), lx + bW / 2, TL_H / 2);
        ctx2d.textBaseline = "alphabetic";
      }
      rx = lx;
    }

    // Timeline border
    ctx2d.strokeStyle = "rgba(255,255,255,0.06)";
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(0.5, 0.5, W - 1, TL_H - 1);
    ctx2d.fillStyle = "rgba(255,255,255,0.22)";
    ctx2d.font = "9px monospace";
    ctx2d.textAlign = "left";
    ctx2d.fillText("← older", 8, TL_H - 6);
    ctx2d.textAlign = "right";
    ctx2d.fillText("now →", W - 8, TL_H - 6);

    // ── Chromagram ───────────────────────────────────────────────────────
    const barW    = (W - 24) / 12;
    const curRoot = curRootRef.current;
    const pcLabels = flat ? PC_NAMES_FLAT : PC_NAMES;

    for (let pc = 0; pc < 12; pc++) {
      const val    = chroma[pc];
      const bH     = Math.max(2, Math.round(val * CHRO_H));
      const h      = PC_HUE[pc];
      const isRoot = pc === curRoot;

      ctx2d.fillStyle = isRoot
        ? `hsla(${h},82%,62%,0.97)`
        : `hsla(${h},60%,40%,0.70)`;
      ctx2d.fillRect(12 + pc * barW, CHRO_Y + CHRO_H - bH, barW - 2, bH);

      ctx2d.fillStyle = isRoot ? `hsla(${h},70%,86%,0.92)` : "rgba(255,255,255,0.38)";
      ctx2d.font = "9px monospace";
      ctx2d.textAlign = "center";
      ctx2d.fillText(pcLabels[pc], 12 + pc * barW + (barW - 2) / 2, H - 5);
    }

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
      curStartRef.current = actx.currentTime;
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
    for (let rep = 0; rep < 3; rep++) {
      for (const ch of DEMO_NOTES) {
        ch.midis.forEach(midi => {
          const osc = actx.createOscillator();
          const g   = actx.createGain();
          osc.type = "triangle";
          osc.frequency.value = midiToHz(midi);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.06, t + 0.08);
          g.gain.setValueAtTime(0.06, t + ch.dur - 0.12);
          g.gain.linearRampToValueAtTime(0, t + ch.dur);
          osc.connect(g);
          g.connect(analyser);
          osc.start(t);
          osc.stop(t + ch.dur);
        });
        t += ch.dur;
      }
    }

    curStartRef.current = actx.currentTime;
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

  // ── Display values ────────────────────────────────────────────────────────
  const qs           = getQS(cQual);
  const displayHue   = (PC_HUE[cRoot] + qs.hs + 360) % 360;
  const displayColor = locked
    ? "rgba(255,255,255,0.45)"
    : `hsl(${displayHue},${Math.min(qs.sat + 22, 100)}%,${Math.min(qs.lit + 30, 84)}%)`;
  const heroName     = detected ? chordDisplay(cRoot, cQual, useFlats) : "—";

  return (
    <div className="flex flex-col h-screen bg-[#04040a] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-2 shrink-0">
        <div>
          <h1 className="text-2xl font-mono font-bold text-white">Chord Canvas</h1>
          <p className="text-base text-white/75 mt-0.5 max-w-sm leading-snug">
            What chord are you playing? Hear it named, colored, and traced over time.
          </p>
        </div>
        <Link
          href="/dream"
          className="text-white/55 text-sm font-mono hover:text-white/80 transition-colors mt-1 shrink-0 ml-4"
        >
          ← dream lab
        </Link>
      </div>

      {/* Chord hero / controls */}
      <div className="px-5 pb-3 shrink-0">
        {phase === "idle" ? (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={startDemo}
              className="px-5 py-2.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-mono rounded hover:bg-violet-500/30 transition min-h-[44px]"
            >
              ▶ Demo
            </button>
            <button
              onClick={() => { void startMic(); }}
              className="px-5 py-2.5 bg-white/10 border border-white/20 text-white/90 text-base font-mono rounded hover:bg-white/15 transition min-h-[44px]"
            >
              🎤 Start mic
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-4 flex-wrap">
            <div
              className="text-6xl font-mono font-bold leading-none select-none transition-colors duration-200"
              style={{ color: displayColor }}
            >
              {heroName}
              {locked && <span className="text-xl ml-3 opacity-60">🔒</span>}
            </div>
            <div className="flex gap-2 mb-1.5">
              <button
                onClick={() => setUseFlats(f => !f)}
                title="Toggle sharps / flats notation"
                className={`px-3 py-1.5 text-sm font-mono rounded border transition min-h-[36px] ${
                  useFlats
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-white/10 border-white/20 text-white/65 hover:text-white/90"
                }`}
              >
                {useFlats ? "♭ flats" : "♯ sharps"}
              </button>
              <button
                onClick={() => setLocked(l => !l)}
                title="Lock / unlock chord detection"
                className={`px-3 py-1.5 text-sm font-mono rounded border transition min-h-[36px] ${
                  locked
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-white/10 border-white/20 text-white/65 hover:text-white/90"
                }`}
              >
                {locked ? "🔒 locked" : "lock"}
              </button>
            </div>
          </div>
        )}
        {errMsg && (
          <p className="text-rose-300 text-base font-mono mt-2">{errMsg}</p>
        )}
      </div>

      {/* Canvas: chord timeline + chromagram */}
      <div className="flex-1 min-h-0 relative">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center px-5 py-2 text-white/55 text-xs font-mono shrink-0 border-t border-white/5">
        <span>195-chord-canvas · cycle 229 polish · 9 types · ♭/♯ · lock</span>
        <span>108 templates · chroma · color timeline</span>
      </div>
    </div>
  );
}
