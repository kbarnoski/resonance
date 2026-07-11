"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── YIN monophonic pitch detector ───────────────────────────────────────────
// de Cheveigné & Kawahara (2002). ~35 lines, zero deps.
const YIN_THRESH = 0.10;
const YIN_TAU_MIN = 21;    // ≈ 2100 Hz (C7 ceiling)
const YIN_TAU_MAX = 820;   // ≈ 54 Hz  (A1 floor)

function detectPitch(buf: Float32Array, sr: number): number {
  const W = Math.floor(buf.length / 2);
  const tMax = Math.min(YIN_TAU_MAX, W - 1);
  // Step 1: difference function
  const d = new Float32Array(tMax + 1);
  for (let tau = 1; tau <= tMax; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const v = buf[i] - buf[i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  // Step 2: cumulative mean normalized difference
  const cmdf = new Float32Array(tMax + 1);
  cmdf[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tMax; tau++) {
    run += d[tau];
    cmdf[tau] = run === 0 ? 0 : (d[tau] * tau) / run;
  }
  // Step 3: absolute threshold — find first dip below YIN_THRESH
  let tau = YIN_TAU_MIN;
  for (; tau <= tMax; tau++) {
    if (cmdf[tau] < YIN_THRESH) {
      while (tau + 1 <= tMax && cmdf[tau + 1] < cmdf[tau]) tau++;
      break;
    }
  }
  if (tau > tMax) return -1;
  // Step 4: parabolic interpolation
  let tf: number = tau;
  if (tau > 1 && tau < tMax) {
    const a = cmdf[tau - 1], b = cmdf[tau], c = cmdf[tau + 1];
    const den = 2 * (2 * b - a - c);
    if (Math.abs(den) > 1e-9) tf += (a - c) / den;
  }
  return sr / tf;
}

// ── Note utilities ───────────────────────────────────────────────────────────
function freqToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

function midiNoteName(m: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[m % 12] + (Math.floor(m / 12) - 1);
}

// Smooth 3-stop gradient: amber(C2=36) → violet(C4=60) → cyan(C7=96)
function colorForMidi(m: number): string {
  const t = Math.max(0, Math.min(1, (m - 36) / 60));
  let r: number, g: number, b: number;
  if (t < 0.4) {
    const u = t / 0.4;
    r = Math.round(255 + u * (167 - 255));
    g = Math.round(160 + u * (139 - 160));
    b = Math.round(50  + u * (250 - 50));
  } else {
    const u = (t - 0.4) / 0.6;
    r = Math.round(167 + u * (80  - 167));
    g = Math.round(139 + u * (220 - 139));
    b = Math.round(250 + u * (255 - 250));
  }
  return `rgb(${r},${g},${b})`;
}

// ── Constants ────────────────────────────────────────────────────────────────
const MIDI_LO    = 36;    // C2
const MIDI_HI    = 96;    // C7
const ROLL_ROWS  = MIDI_HI - MIDI_LO + 1;  // 61 semitones
const ROW_H      = 8;     // px per semitone
const SIDEBAR    = 40;    // left sidebar width (note labels)
const VISIBLE    = 20;    // seconds of visible history
const PHRASE_GAP = 2.0;   // seconds of silence → new phrase group
const SIL_THRESH = 0.007; // RMS below this = silence
const CLOSE_AFTER = 4;    // YIN frames of silence → close active note

interface Note {
  midi: number;
  t0: number;     // seconds from session start
  t1: number;
  phrase: number;
}
interface Active {
  midi: number;
  t0: number;
  phrase: number;
}

export default function PianoTranscript() {
  const [running, setRunning]   = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [elapsed, setElapsed]   = useState(0);
  const [count, setCount]       = useState(0);

  const ctxRef      = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tbufRef     = useRef<Float32Array | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);

  const notesRef     = useRef<Note[]>([]);
  const activeRef    = useRef<Active | null>(null);
  const sessStartRef = useRef(0);
  const phraseIdRef  = useRef(0);
  const lastEndRef   = useRef(0);
  const pitchQRef    = useRef<number[]>([]);
  const silFramesRef = useRef(0);
  const yinTickRef   = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef    = useRef(0);

  const startMic = useCallback(async () => {
    if (running) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ac = new Ctx();
      ctxRef.current = ac;
      const an = ac.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0;
      analyserRef.current = an;
      tbufRef.current = new Float32Array(new ArrayBuffer(an.fftSize * 4));
      ac.createMediaStreamSource(stream).connect(an);

      notesRef.current   = [];
      activeRef.current  = null;
      sessStartRef.current = performance.now();
      phraseIdRef.current  = 0;
      lastEndRef.current   = 0;
      pitchQRef.current    = [];
      silFramesRef.current = 0;
      yinTickRef.current   = 0;

      setRunning(true);
      setMicError(null);
      setElapsed(0);
      setCount(0);
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Mic unavailable — check permissions.");
    }
  }, [running]);

  const stopMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (activeRef.current) {
      const nowSec = (performance.now() - sessStartRef.current) / 1000;
      notesRef.current.push({ ...activeRef.current, t1: nowSec });
      activeRef.current = null;
    }
    void ctxRef.current?.close();
    ctxRef.current   = null;
    analyserRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => stopMic(), [stopMic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = 0, ch = 0;
    const applyResize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = canvas.offsetWidth;
      ch = canvas.offsetHeight;
      canvas.width  = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width  = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.scale(dpr, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);
    let hudAt = 0;

    const tick = (ts: number) => {
      const an = analyserRef.current;
      const tb = tbufRef.current;
      const ac = ctxRef.current;
      if (!an || !tb || !ac) { rafRef.current = requestAnimationFrame(tick); return; }

      const nowSec = (performance.now() - sessStartRef.current) / 1000;

      // ── Pitch detection: run YIN every 3rd frame (~20 Hz) ──────────────────
      yinTickRef.current++;
      if (yinTickRef.current % 3 === 0) {
        an.getFloatTimeDomainData(tb as unknown as Float32Array<ArrayBuffer>);

        // RMS (sample stride 4 for efficiency)
        let rms = 0;
        for (let i = 0; i < tb.length; i += 4) rms += tb[i] * tb[i];
        rms = Math.sqrt((rms * 4) / tb.length);

        let det = -1;
        if (rms > SIL_THRESH) {
          const hz = detectPitch(tb, ac.sampleRate);
          if (hz > 0) {
            const m = freqToMidi(hz);
            if (m >= MIDI_LO && m <= MIDI_HI) det = m;
          }
        }

        // Rolling pitch buffer (last 5 YIN readings, median for stability)
        const pq = pitchQRef.current;
        pq.push(det);
        if (pq.length > 5) pq.shift();
        const negs = pq.filter((v) => v < 0).length;
        let stable = -1;
        if (negs <= 2) {
          const pos = pq.filter((v) => v >= 0);
          stable = [...pos].sort((a, b) => a - b)[Math.floor(pos.length / 2)];
        }

        if (stable >= 0) {
          silFramesRef.current = 0;
          const cur = activeRef.current;
          if (!cur) {
            if (lastEndRef.current > 0 && nowSec - lastEndRef.current > PHRASE_GAP) {
              phraseIdRef.current++;
            }
            activeRef.current = { midi: stable, t0: nowSec, phrase: phraseIdRef.current };
          } else if (stable !== cur.midi) {
            notesRef.current.push({ ...cur, t1: nowSec });
            lastEndRef.current = nowSec;
            activeRef.current = { midi: stable, t0: nowSec, phrase: phraseIdRef.current };
          }
        } else {
          silFramesRef.current++;
          if (silFramesRef.current > CLOSE_AFTER && activeRef.current) {
            notesRef.current.push({ ...activeRef.current, t1: nowSec });
            lastEndRef.current = nowSec;
            activeRef.current  = null;
            pitchQRef.current  = [];
          }
        }
      }

      // ── Draw ───────────────────────────────────────────────────────────────
      const pps      = (cw - SIDEBAR) / VISIBLE;       // pixels per second
      const rollH    = ROLL_ROWS * ROW_H;               // 61 × 8 = 488 px
      const oy       = Math.max(0, Math.round((ch - rollH) / 2));
      const viewStart = Math.max(0, nowSec - VISIBLE);
      const tx = (t: number) => SIDEBAR + (t - viewStart) * pps;

      // Background
      ctx.fillStyle = "#080810";
      ctx.fillRect(0, 0, cw, ch);

      // Sidebar
      ctx.fillStyle = "#0d0d1a";
      ctx.fillRect(0, oy, SIDEBAR, rollH);

      // Row grid + C-octave labels
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      for (let m = MIDI_LO; m <= MIDI_HI; m++) {
        const ry = oy + (MIDI_HI - m) * ROW_H;
        if ([1, 3, 6, 8, 10].includes(m % 12)) {
          ctx.fillStyle = "rgba(255,255,255,0.028)";
          ctx.fillRect(SIDEBAR, ry, cw - SIDEBAR, ROW_H);
        }
        if (m % 12 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fillRect(0, ry, cw, 1);
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillText(midiNoteName(m), SIDEBAR - 4, ry + ROW_H - 1);
        }
      }

      // Vertical time grid (every 5 s)
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth   = 1;
      for (let t = Math.ceil(viewStart / 5) * 5; t <= nowSec + 5; t += 5) {
        const x = tx(t);
        if (x < SIDEBAR || x > cw) continue;
        ctx.beginPath();
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + rollH);
        ctx.stroke();
      }

      // Phrase brackets — one outlined box per completed phrase (≥3 notes)
      type PhraseStats = { t0: number; t1: number; mLo: number; mHi: number; len: number };
      const phraseMap = new Map<number, PhraseStats>();
      for (const n of notesRef.current) {
        const g = phraseMap.get(n.phrase);
        if (!g) {
          phraseMap.set(n.phrase, { t0: n.t0, t1: n.t1, mLo: n.midi, mHi: n.midi, len: 1 });
        } else {
          if (n.t1  > g.t1)   g.t1  = n.t1;
          if (n.midi < g.mLo) g.mLo = n.midi;
          if (n.midi > g.mHi) g.mHi = n.midi;
          g.len++;
        }
      }
      ctx.strokeStyle = "rgba(167,139,250,0.18)";
      ctx.lineWidth   = 1;
      phraseMap.forEach((g) => {
        if (g.len < 3) return;
        const bx0 = Math.max(SIDEBAR, tx(g.t0) - 2);
        const bx1 = Math.min(cw - 1,  tx(g.t1) + 2);
        if (bx1 < SIDEBAR) return;
        const by0 = oy + (MIDI_HI - g.mHi) * ROW_H - 2;
        const by1 = oy + (MIDI_HI - g.mLo + 1) * ROW_H + 2;
        ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
      });

      // Completed notes
      ctx.globalAlpha = 0.85;
      for (const n of notesRef.current) {
        if (n.t1 < viewStart - 0.5) continue;
        const x  = Math.max(SIDEBAR, tx(n.t0));
        const xe = Math.min(cw, tx(n.t1));
        if (xe < SIDEBAR) continue;
        const ry = oy + (MIDI_HI - n.midi) * ROW_H;
        ctx.fillStyle = colorForMidi(n.midi);
        ctx.fillRect(x + 1, ry + 1, Math.max(2, xe - x - 1), ROW_H - 2);
      }

      // Active note (still ringing — extends to cursor)
      if (activeRef.current) {
        const a  = activeRef.current;
        const x  = Math.max(SIDEBAR, tx(a.t0));
        const ry = oy + (MIDI_HI - a.midi) * ROW_H;
        ctx.globalAlpha = 1.0;
        ctx.fillStyle   = colorForMidi(a.midi);
        ctx.fillRect(x + 1, ry + 1, Math.max(3, tx(nowSec) - x), ROW_H - 2);
      }
      ctx.globalAlpha = 1.0;

      // Playhead cursor
      const cursorX = tx(nowSec);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(cursorX, oy);
      ctx.lineTo(cursorX, oy + rollH);
      ctx.stroke();

      // HUD state update at ~3 Hz
      if (ts - hudAt > 300) {
        hudAt = ts;
        setElapsed(Math.floor(nowSec));
        setCount(notesRef.current.length + (activeRef.current ? 1 : 0));
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
    };
  }, [running]);

  const saveScore = useCallback(() => {
    const all: Note[] = [
      ...notesRef.current,
      ...(activeRef.current
        ? [{ ...activeRef.current, t1: (performance.now() - sessStartRef.current) / 1000 }]
        : []),
    ];
    if (all.length === 0) return;
    const totalSec = Math.ceil(all[all.length - 1].t1 + 1);
    const EPX = 64;
    const EW  = Math.max(1920, totalSec * EPX + SIDEBAR + 40);
    const EH  = ROLL_ROWS * ROW_H + 80;
    const off = document.createElement("canvas");
    off.width  = EW;
    off.height = EH;
    const oc = off.getContext("2d")!;
    oc.fillStyle = "#080810";
    oc.fillRect(0, 0, EW, EH);
    const OY = 50;
    oc.font      = "9px monospace";
    oc.textAlign = "right";
    for (let m = MIDI_LO; m <= MIDI_HI; m++) {
      const ry = OY + (MIDI_HI - m) * ROW_H;
      if ([1, 3, 6, 8, 10].includes(m % 12)) {
        oc.fillStyle = "rgba(255,255,255,0.03)";
        oc.fillRect(SIDEBAR, ry, EW - SIDEBAR, ROW_H);
      }
      if (m % 12 === 0) {
        oc.fillStyle = "rgba(255,255,255,0.06)";
        oc.fillRect(0, ry, EW, 1);
        oc.fillStyle = "rgba(255,255,255,0.45)";
        oc.fillText(midiNoteName(m), SIDEBAR - 4, ry + ROW_H - 1);
      }
    }
    oc.globalAlpha = 0.85;
    for (const n of all) {
      const x  = SIDEBAR + n.t0 * EPX + 1;
      const w  = Math.max(2, (n.t1 - n.t0) * EPX - 1);
      const ry = OY + (MIDI_HI - n.midi) * ROW_H + 1;
      oc.fillStyle = colorForMidi(n.midi);
      oc.fillRect(x, ry, w, ROW_H - 2);
    }
    oc.globalAlpha = 1;
    oc.fillStyle   = "rgba(255,255,255,0.6)";
    oc.font        = "13px monospace";
    oc.textAlign   = "left";
    oc.fillText(`Piano session · ${all.length} notes · ${totalSec}s`, SIDEBAR, 34);
    const a = document.createElement("a");
    a.download = `piano-${Date.now()}.png`;
    a.href     = off.toDataURL("image/png");
    a.click();
  }, []);

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const hasStopped = !running && notesRef.current.length > 0;

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#080810" }}
      />

      {/* ── Start screen ─────────────────────────────────────────────────── */}
      {!running && !hasStopped && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl font-light mb-3 tracking-tight">
            Piano Transcript
          </h1>
          <p className="text-base text-muted-foreground max-w-md mb-2 leading-relaxed">
            Play piano into your mic — this prototype writes while you play.
            YIN pitch detection turns each note into a filled rectangle on a
            scrolling piano-roll canvas.
          </p>
          <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
            C2–C3 amber · C3–C5 violet · C5–C7 cyan. Phrases group
            automatically. Save the session as a PNG when done.
          </p>
          <button
            onClick={startMic}
            className="px-6 py-2.5 text-base tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition min-h-[44px]"
          >
            Start mic
          </button>
          {micError && (
            <p className="mt-4 text-sm text-violet-300 max-w-sm">{micError}</p>
          )}
          <Link
            href="/dream"
            className="mt-12 text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Post-stop overlay ─────────────────────────────────────────────── */}
      {hasStopped && (
        <div className="absolute inset-0 flex flex-col items-end justify-end p-4 pointer-events-none">
          <div className="pointer-events-auto flex flex-col items-end gap-3 bg-black/70 backdrop-blur-sm rounded-xl p-4 border border-border">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">{count}</span> notes ·{" "}
              <span className="text-foreground">{fmtTime(elapsed)}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={saveScore}
                className="px-4 py-2.5 text-sm tracking-wider uppercase text-violet-300/95 border border-violet-500/40 hover:border-violet-400/70 rounded min-h-[44px]"
              >
                Save PNG
              </button>
              <button
                onClick={startMic}
                className="px-4 py-2.5 text-sm tracking-wider uppercase border border-border hover:bg-accent rounded min-h-[44px]"
              >
                New session
              </button>
            </div>
            <Link href="/dream" className="text-xs text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
          </div>
        </div>
      )}

      {/* ── Running HUD ──────────────────────────────────────────────────── */}
      {running && (
        <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
          <p className="text-xs text-muted-foreground tracking-wider">
            <span className="text-foreground">{fmtTime(elapsed)}</span>
            {" · "}
            <span className="text-foreground">{count}</span> notes
          </p>
          <div className="pointer-events-auto flex gap-2">
            <button
              onClick={saveScore}
              className="text-xs tracking-wider uppercase text-violet-300/95 border border-violet-500/30 hover:border-violet-400/60 px-3 py-1.5 rounded min-h-[44px]"
            >
              Save PNG
            </button>
            <button
              onClick={stopMic}
              className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1.5 rounded min-h-[44px]"
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
