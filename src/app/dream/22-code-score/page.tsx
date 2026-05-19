"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

interface ScoreNote {
  freqs: number[];
  duration: number; // seconds
  isRest: boolean;
}

interface PrecomputedStroke {
  x1: number; y1: number;
  x2: number; y2: number;
  hue: number;
  chords: Array<{ x1: number; y1: number; x2: number; y2: number; hue: number }>;
}

// ── DSL constants ──────────────────────────────────────────────────────────

const NOTE_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};
const ACCIDENTAL_OFFSET: Record<string, number> = { "#": 1, b: -1, "": 0 };
const DURATION_BEATS: Record<string, number> = { W: 4, H: 2, Q: 1, E: 0.5, S: 0.25 };

const DEMO_SCORE = `\
// Bach Invention No.1 in C major (BWV 772) — opening phrases
// Syntax: NOTE DUR   e.g. C5 E   Bb4 Q   D#3 H   rest Q   [C4 E4 G4] Q
// Durations: W=whole  H=half  Q=quarter  E=eighth  S=sixteenth
C5 E D5 E E5 E F5 E G5 E E5 E F5 E D5 E
E5 E C5 E D5 E E5 E F5 E G5 E A5 E G5 E
F5 E E5 E D5 E C5 E B4 E D5 E C5 E B4 E
A4 E C5 E B4 E A4 E G4 E B4 E A4 E G4 E
F4 E A4 E G4 E F4 E E4 E G4 E F4 E E4 E
D4 E F4 E E4 E D4 E C4 Q G4 Q rest H`;

// ── Parsing ────────────────────────────────────────────────────────────────

function noteTokenToFreq(token: string): number | null {
  const m = token.match(/^([A-Ga-g])([#b]?)(\d)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2];
  const octave = parseInt(m[3]);
  const base = NOTE_SEMITONES[letter];
  if (base === undefined) return null;
  const semitone = base + (ACCIDENTAL_OFFSET[acc] ?? 0);
  const midi = 12 * (octave + 1) + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parseScore(text: string, bpm: number): { notes: ScoreNote[]; error: string | null } {
  const spb = 60 / bpm;
  const notes: ScoreNote[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const tokens = line.split(/\s+/).filter(Boolean);
    let i = 0;

    while (i < tokens.length) {
      const tok = tokens[i];

      if (tok === "[") {
        const chordFreqs: number[] = [];
        i++;
        while (i < tokens.length && tokens[i] !== "]") {
          const f = noteTokenToFreq(tokens[i]);
          if (f !== null) chordFreqs.push(f);
          i++;
        }
        if (tokens[i] !== "]") return { notes, error: `Missing ] near: ${line}` };
        i++;
        const durKey = (tokens[i] ?? "").toUpperCase();
        const beats = DURATION_BEATS[durKey];
        if (!beats) return { notes, error: `Bad duration after ]: "${tokens[i]}"` };
        notes.push({ freqs: chordFreqs, duration: beats * spb, isRest: false });
        i++;
      } else if (tok.toLowerCase() === "rest") {
        i++;
        const durKey = (tokens[i] ?? "").toUpperCase();
        const beats = DURATION_BEATS[durKey];
        if (!beats) return { notes, error: `Bad duration after rest: "${tokens[i]}"` };
        notes.push({ freqs: [], duration: beats * spb, isRest: true });
        i++;
      } else {
        const f = noteTokenToFreq(tok);
        if (f === null) return { notes, error: `Unknown token: "${tok}"` };
        i++;
        const durKey = (tokens[i] ?? "").toUpperCase();
        const beats = DURATION_BEATS[durKey];
        if (!beats) return { notes, error: `Bad duration after ${tok}: "${tokens[i]}"` };
        notes.push({ freqs: [f], duration: beats * spb, isRest: false });
        i++;
      }
    }
  }

  return { notes, error: null };
}

// ── Frequency → hue (same mapping as 13-piano-canvas) ─────────────────────

function freqToHue(freq: number): number {
  const semitones = 12 * Math.log2(freq / 440);
  return ((semitones * 5 + 3600) % 360);
}

// ── Stroke painter ─────────────────────────────────────────────────────────

function drawStroke(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  hue: number,
  weight: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `hsla(${hue},85%,60%,0.7)`;
  ctx.lineWidth = weight;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = `hsl(${hue},90%,70%)`;
  ctx.shadowBlur = weight * 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CodeScore() {
  const [scoreText, setScoreText] = useState(DEMO_SCORE);
  const [bpm, setBpm] = useState(80);
  const [mode, setMode] = useState<"idle" | "playing">("idle");
  const [parseError, setParseError] = useState<string | null>(null);
  const [playedCount, setPlayedCount] = useState(0);
  const [totalNotes, setTotalNotes] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const actxRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playedRef = useRef(0);

  // ── Canvas setup ──────────────────────────────────────────────────────────

  const setupCanvas = useCallback(() => {
    const display = canvasRef.current;
    const paint = paintRef.current;
    if (!display || !paint) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parent = display.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 300;
    const h = parent.clientHeight || 300;
    for (const c of [display, paint]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    const pCtx = paint.getContext("2d");
    if (pCtx) {
      pCtx.scale(dpr, dpr);
      pCtx.fillStyle = "#050508";
      pCtx.fillRect(0, 0, w, h);
    }
    const dCtx = display.getContext("2d");
    if (dCtx) dCtx.scale(dpr, dpr);
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  // ── Copy paint → display ──────────────────────────────────────────────────

  const copyToDisplay = useCallback(() => {
    const display = canvasRef.current;
    const paint = paintRef.current;
    if (!display || !paint) return;
    const dCtx = display.getContext("2d");
    if (!dCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = display.width / dpr;
    const h = display.height / dpr;
    dCtx.clearRect(0, 0, w, h);
    dCtx.drawImage(paint, 0, 0, paint.width, paint.height, 0, 0, w, h);
  }, []);

  // ── Clear paint canvas ────────────────────────────────────────────────────

  const clearPaint = useCallback(() => {
    const paint = paintRef.current;
    if (!paint) return;
    const ctx = paint.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = paint.width / dpr;
    const h = paint.height / dpr;
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, w, h);
  }, []);

  // ── Stop playback ─────────────────────────────────────────────────────────

  const stopPlayback = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    void actxRef.current?.close();
    actxRef.current = null;
    setMode("idle");
  }, []);

  // ── Play ──────────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    const { notes, error } = parseScore(scoreText, bpm);
    if (error) { setParseError(error); return; }
    setParseError(null);

    // Stop any previous playback first
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    void actxRef.current?.close();
    actxRef.current = null;

    clearPaint();
    const paint = paintRef.current;
    if (!paint) return;
    const pCtx = paint.getContext("2d");
    if (!pCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = paint.width / dpr;
    const H = paint.height / dpr;
    const PX_PER_SEC = Math.max(40, W * 0.10);

    // ── Precompute stroke positions ──────────────────────────────────────────
    // Path cursor is fully deterministic from the score; no mutable refs needed.
    let pathX = W * 0.04;
    let pathY = H * 0.35;
    let pathDy = 0;
    let lastFreq = 0;

    const strokes: Array<PrecomputedStroke | null> = [];

    for (const note of notes) {
      const strokeLen = note.duration * PX_PER_SEC;

      if (!note.isRest && note.freqs.length > 0) {
        const hue = freqToHue(note.freqs[0]);

        if (lastFreq > 0) {
          const delta = Math.log2(note.freqs[0] / lastFreq);
          pathDy += delta * 28;
        }
        pathDy *= 0.80;
        pathDy = Math.max(-H * 0.06, Math.min(H * 0.06, pathDy));

        const x1 = pathX;
        const y1 = pathY;
        const x2 = pathX + strokeLen;
        const y2 = pathY + pathDy;

        const chords = note.freqs.slice(1).map((freq, ci) => ({
          x1, y1: y1 - (ci + 1) * 5,
          x2, y2: y2 - (ci + 1) * 5,
          hue: freqToHue(freq),
        }));

        strokes.push({ x1, y1, x2, y2, hue, chords });
        lastFreq = note.freqs[0];
        pathX += strokeLen;
        pathY = y2;
      } else {
        strokes.push(null);
        pathX += strokeLen;
      }

      // Wrap to next line
      if (pathX > W * 0.93) {
        pathX = W * 0.04;
        pathY += H * 0.13;
        pathDy = 0;
      }
      pathY = Math.max(H * 0.05, Math.min(H * 0.92, pathY));
    }

    const nonRests = strokes.filter((s) => s !== null).length;
    setTotalNotes(nonRests);
    setPlayedCount(0);
    playedRef.current = 0;

    // ── Audio context + scheduling ───────────────────────────────────────────
    type WkAudio = { webkitAudioContext: typeof AudioContext };
    const ActxCtor: typeof AudioContext =
      window.AudioContext || (window as unknown as WkAudio).webkitAudioContext;
    const actx = new ActxCtor();
    actxRef.current = actx;

    let t = actx.currentTime + 0.05;

    notes.forEach((note, i) => {
      const startT = t;
      const dur = note.duration;
      const ms = Math.max(0, (startT - actx.currentTime) * 1000);

      if (!note.isRest && note.freqs.length > 0) {
        // Schedule audio
        for (const freq of note.freqs) {
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;
          const peak = 0.10 / note.freqs.length;
          gain.gain.setValueAtTime(0, startT);
          gain.gain.linearRampToValueAtTime(peak, startT + Math.min(0.025, dur * 0.1));
          gain.gain.setValueAtTime(peak, startT + dur * 0.70);
          gain.gain.linearRampToValueAtTime(0, startT + dur * 0.95);
          osc.connect(gain);
          gain.connect(actx.destination);
          osc.start(startT);
          osc.stop(startT + dur + 0.05);
        }

        // Schedule painting at the moment the note plays
        const stroke = strokes[i];
        if (stroke) {
          const capturedStroke = stroke;
          const timer = setTimeout(() => {
            drawStroke(pCtx, capturedStroke.x1, capturedStroke.y1,
              capturedStroke.x2, capturedStroke.y2, capturedStroke.hue, 2.5);
            for (const cs of capturedStroke.chords) {
              drawStroke(pCtx, cs.x1, cs.y1, cs.x2, cs.y2, cs.hue, 1.5);
            }
            copyToDisplay();
            playedRef.current++;
            setPlayedCount(playedRef.current);
          }, ms);
          timersRef.current.push(timer);
        }
      }

      t += dur;
    });

    // Auto-stop when score finishes
    const totalMs = Math.max(0, (t - actx.currentTime) * 1000);
    const doneTimer = setTimeout(() => {
      setMode("idle");
      void actxRef.current?.close();
      actxRef.current = null;
    }, totalMs + 400);
    timersRef.current.push(doneTimer);

    setMode("playing");
  }, [scoreText, bpm, clearPaint, copyToDisplay]);

  // ── Download painting ─────────────────────────────────────────────────────

  const download = useCallback(() => {
    const paint = paintRef.current;
    if (!paint) return;
    const link = document.createElement("a");
    link.download = `code-score-${Date.now()}.png`;
    link.href = paint.toDataURL("image/png");
    link.click();
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex w-full" style={{ height: "calc(100vh - 3rem)" }}>

      {/* ── Left: editor panel ── */}
      <div
        className="flex flex-col border-r border-white/10 bg-black shrink-0"
        style={{ width: "300px" }}
      >
        <div className="p-4 border-b border-white/10">
          <h1 className="text-sm tracking-wider mb-1">Code Score</h1>
          <p className="text-[11px] text-white/40 leading-relaxed">
            Write a melody — watch it paint itself — hear it play.
          </p>
        </div>

        <textarea
          value={scoreText}
          onChange={(e) => setScoreText(e.target.value)}
          spellCheck={false}
          className="flex-1 bg-transparent text-[11px] font-mono text-white/70 p-4 resize-none outline-none leading-relaxed"
          style={{ minHeight: 0 }}
        />

        {parseError && (
          <div className="px-4 py-2 text-[10px] text-rose-300/80 bg-rose-900/20 border-t border-rose-900/30 font-mono">
            ⚠ {parseError}
          </div>
        )}

        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/40 tracking-wider">BPM</span>
            <input
              type="range" min="40" max="200" step="1" value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value))}
              className="flex-1 accent-white"
            />
            <span className="text-[10px] text-white w-7 text-right tabular-nums">{bpm}</span>
          </div>

          <div className="flex gap-2">
            {mode === "idle" ? (
              <button
                onClick={play}
                className="flex-1 py-2 text-[11px] tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
              >
                ▶ Play
              </button>
            ) : (
              <button
                onClick={stopPlayback}
                className="flex-1 py-2 text-[11px] tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
              >
                ■ Stop
              </button>
            )}
            <button
              onClick={download}
              title="Save painting as PNG"
              className="py-2 px-3 text-[11px] border border-white/20 rounded hover:bg-white/5 hover:border-white/50 transition text-white/50"
            >
              ↓
            </button>
          </div>

          {mode === "playing" && (
            <div className="text-[10px] text-white/35 text-center tabular-nums">
              {playedCount} / {totalNotes} notes
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Link href="/dream" className="text-[10px] text-white/25 hover:text-white/50 transition">
              ← back
            </Link>
            <a
              href="https://resonance-git-dream-sandbox-kbarnoski-5224s-projects.vercel.app/dream/22-code-score/readme"
              className="text-[10px] text-white/25 hover:text-white/50 transition"
            >
              design notes ↗
            </a>
          </div>
        </div>

        {/* Syntax reference */}
        <div className="px-4 pb-4 pt-3 border-t border-white/5 text-[10px] font-mono text-white/25 leading-relaxed">
          <div className="text-[9px] tracking-wider text-white/15 mb-1">SYNTAX</div>
          <div>C4 Q · D#4 H · Bb3 E</div>
          <div>rest Q · [C4 E4 G4] Q</div>
          <div>W H Q E S = whole → 16th</div>
          <div>{"//"} comment line</div>
        </div>
      </div>

      {/* ── Right: canvas ── */}
      <div className="relative flex-1" style={{ background: "#050508" }}>
        <canvas ref={paintRef} className="absolute inset-0" style={{ display: "none" }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {mode === "idle" && playedCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="text-center">
              <div className="text-5xl text-white/5 mb-3 font-serif">𝄞</div>
              <p className="text-[11px] text-white/15">write a score · press play</p>
            </div>
          </div>
        )}

        {/* Pitch → hue legend */}
        <div className="absolute top-4 right-4 pointer-events-none">
          <div
            style={{
              width: 80, height: 4, borderRadius: 2,
              background: "linear-gradient(to right, hsl(220,70%,55%), hsl(120,70%,55%), hsl(60,70%,55%), hsl(0,70%,55%), hsl(300,70%,55%))",
              opacity: 0.35,
            }}
          />
          <div className="flex justify-between text-[9px] text-white/20 mt-1">
            <span>low</span><span>high</span>
          </div>
        </div>
      </div>
    </div>
  );
}
