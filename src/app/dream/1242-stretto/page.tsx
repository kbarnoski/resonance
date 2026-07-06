"use client";

// ════════════════════════════════════════════════════════════════════════════
// STRETTO (1242) — "answer your line with a real canon"
//
// THE ONE QUESTION: what if Resonance could answer your single melodic line with a
// real CANON — delayed, transposed, inverted imitative voices that chase your line
// and self-adjust to stay consonant — building into a stretto, all crystallizing
// into a scrolling score?
//
// A deepening of 1218-shadow (which made homophonic block chords). Here the extra
// voices are time-shifted, interval-transposed, optionally inverted/augmented
// copies of the SAME subject — imitative POLYPHONY, a fugal answer, not a chord.
// Draw a subject on the pitch-lane grid (or hit "Generate a subject"), pick a canon
// type, and watch the answers enter on a scrolling piano-roll that crystallizes
// into noteheads as the playhead passes. Consonance self-correction (canon.ts)
// nudges any hard clash on a strong beat to the nearest consonant scale tone.
//
// Lineage: J.S. Bach's canons (Musical Offering / Goldberg canons at various
// intervals, incl. by inversion & augmentation) · Fux species counterpoint (the
// consonance test) · Chris Wilson, "A Tale of Two Clocks" (look-ahead scheduler).
// SAFETY: no strobe; the score scrolls as one smooth drift well under 3 Hz; audio
// is gesture-gated with a master ramp-from-0 and a limiter.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  buildCanon,
  generateSubject,
  makeVoiceSpecs,
  degToMidi,
  noteName,
  SCALES,
  STEPS,
  INTERVAL_STEPS,
  type ModeName,
  type CanonNote,
} from "./canon";
import { CanonSynth, LoopScheduler, type CanonEvent } from "./synth";

// ─── pitch + view constants ───────────────────────────────────────────────────
const SCORE_LO = 45; // bottom MIDI of the score window
const SCORE_HI = 90; // top MIDI of the score window
const PAST_BEATS = 5; // beats of history shown left of the playhead
const FUTURE_BEATS = 11; // beats of the approaching score shown to the right
const EDITOR_HI = 9; // top diatonic lane in the subject editor
const EDITOR_LO = -1; // bottom diatonic lane
const EDITOR_ROWS = EDITOR_HI - EDITOR_LO + 1;

// ─── riso duotone palette (indigo + terracotta on warm cream) ─────────────────
const PAPER = "#efe6d3";
const PAPER_DEEP = "#e7dcc4";
const INK = "#2a355c"; // indigo
const TERRA = "#c85a34"; // terracotta

type IntervalName = "unison" | "fourth" | "fifth" | "octave";

interface VoiceStyle {
  main: string;
  fill: string;
  hollow: boolean;
}
// dux = solid indigo; comes alternate terracotta / hollow so up to four voices
// stay legible inside a strict two-colour system.
function voiceStyle(v: number): VoiceStyle {
  switch (v) {
    case 0:
      return { main: INK, fill: INK, hollow: false };
    case 1:
      return { main: TERRA, fill: TERRA, hollow: false };
    case 2:
      return { main: INK, fill: PAPER, hollow: true };
    default:
      return { main: TERRA, fill: PAPER, hollow: true };
  }
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export default function StrettoPage() {
  const scoreRef = useRef<HTMLCanvasElement | null>(null);
  const editorRef = useRef<HTMLCanvasElement | null>(null);

  // ── musical state ──
  const [subject, setSubject] = useState<(number | null)[]>(() =>
    generateSubject(),
  );
  const [mode, setMode] = useState<ModeName>("dorian");
  const [intervalName, setIntervalName] = useState<IntervalName>("fifth");
  const [invert, setInvert] = useState(false);
  const [augment, setAugment] = useState(false);
  const [baseDelay, setBaseDelay] = useState(2);
  const [nVoices, setNVoices] = useState(1);
  const [bpm, setBpm] = useState(96);
  const [correctOn, setCorrectOn] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [info, setInfo] = useState({ correctedCount: 0, totalBeats: 0 });

  // ── audio + transport refs ──
  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<CanonSynth | null>(null);
  const schedulerRef = useRef<LoopScheduler | null>(null);
  const playingRef = useRef(false);
  const startTimeRef = useRef(0);
  const spbRef = useRef(60 / 96);
  const bpmRef = useRef(96);

  // ── canon data refs (rebuilt on every config change) ──
  const notesRef = useRef<CanonNote[]>([]);
  const eventsRef = useRef<CanonEvent[]>([]);
  const loopBeatsRef = useRef(1);
  const rafRef = useRef(0);

  // live mirrors so the loop reads fresh values
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ─── (re)arm the looping scheduler ───
  const startScheduler = useCallback(
    (events: CanonEvent[], loopBeats: number) => {
      const ctx = ctxRef.current;
      const synth = synthRef.current;
      if (!ctx || !synth) return;
      schedulerRef.current?.stop();
      const spb = 60 / bpmRef.current;
      spbRef.current = spb;
      const start = synth.now() + 0.12;
      startTimeRef.current = start;
      const sched = new LoopScheduler(
        ctx,
        events,
        bpmRef.current,
        loopBeats,
        start,
        (ev, when) =>
          synth.strike(
            ev.midi,
            when,
            ev.dur * spb,
            ev.voice === 0 ? "dux" : "comes",
            ev.voice === 0 ? 0.92 : 0.8,
          ),
      );
      schedulerRef.current = sched;
      sched.start();
    },
    [],
  );

  // ─── rebuild the canon from the current subject + config ───
  const buildAndStore = useCallback(() => {
    const specs = makeVoiceSpecs({
      nVoices,
      baseDelay,
      intervalSteps: INTERVAL_STEPS[intervalName],
      invert,
      augment,
    });
    const result = buildCanon(subject, mode, specs, correctOn);
    notesRef.current = result.notes;
    loopBeatsRef.current = result.totalBeats;
    const events: CanonEvent[] = result.notes.map((n) => ({
      beat: n.beat,
      dur: n.dur,
      midi: n.midi,
      voice: n.voice,
    }));
    eventsRef.current = events;
    setInfo({
      correctedCount: result.correctedCount,
      totalBeats: result.totalBeats,
    });
    if (playingRef.current) startScheduler(events, result.totalBeats);
  }, [
    subject,
    mode,
    intervalName,
    invert,
    augment,
    baseDelay,
    nVoices,
    correctOn,
    startScheduler,
  ]);

  useEffect(() => {
    buildAndStore();
  }, [buildAndStore]);

  // apply tempo changes (restart the loop while playing)
  useEffect(() => {
    bpmRef.current = bpm;
    spbRef.current = 60 / bpm;
    if (playingRef.current) startScheduler(eventsRef.current, loopBeatsRef.current);
  }, [bpm, startScheduler]);

  // ─── audio bring-up (gesture-gated) ───
  const beginAudio = useCallback(async (): Promise<boolean> => {
    if (synthRef.current) return true;
    setAudioError(null);
    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound, but the score still draws.");
      return false;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Tap Play again.");
      return false;
    }
    ctxRef.current = ctx;
    const synth = new CanonSynth(ctx);
    synth.start();
    synthRef.current = synth;
    return true;
  }, []);

  // preview a single pitch when drawing the subject
  const previewNote = useCallback(
    async (midi: number) => {
      const ok = await beginAudio();
      if (!ok) return;
      const synth = synthRef.current;
      if (synth) synth.strike(midi, synth.now() + 0.01, 0.45, "dux", 0.85);
    },
    [beginAudio],
  );

  const handlePlay = useCallback(async () => {
    if (playingRef.current) {
      schedulerRef.current?.stop();
      schedulerRef.current = null;
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    const ok = await beginAudio();
    if (!ok) return;
    playingRef.current = true;
    setPlaying(true);
    startScheduler(eventsRef.current, loopBeatsRef.current);
  }, [beginAudio, startScheduler]);

  const handleGenerate = useCallback(() => {
    setSubject(generateSubject());
  }, []);

  const handleClear = useCallback(() => {
    setSubject(Array<number | null>(STEPS).fill(null));
  }, []);

  // canon-type presets
  const applyPreset = useCallback(
    (preset: "round" | "fifth" | "octave" | "inversion" | "stretto") => {
      switch (preset) {
        case "round":
          setIntervalName("unison");
          setInvert(false);
          setAugment(false);
          setBaseDelay(2);
          setNVoices(1);
          break;
        case "fifth":
          setIntervalName("fifth");
          setInvert(false);
          setAugment(false);
          setBaseDelay(4);
          setNVoices(1);
          break;
        case "octave":
          setIntervalName("octave");
          setInvert(false);
          setAugment(false);
          setBaseDelay(4);
          setNVoices(1);
          break;
        case "inversion":
          setIntervalName("fifth");
          setInvert(true);
          setAugment(false);
          setBaseDelay(3);
          setNVoices(1);
          break;
        case "stretto":
          setIntervalName("fifth");
          setInvert(false);
          setAugment(false);
          setBaseDelay(1);
          setNVoices(3);
          break;
      }
    },
    [],
  );

  // ─── editor pointer: draw the subject on the pitch-lane grid ───
  const onEditorDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = editorRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.max(0, Math.min(STEPS - 1, Math.floor((x / rect.width) * STEPS)));
      const row = Math.max(0, Math.min(EDITOR_ROWS - 1, Math.floor((y / rect.height) * EDITOR_ROWS)));
      const dIndex = EDITOR_HI - row;
      setSubject((prev) => {
        const next = [...prev];
        next[col] = prev[col] === dIndex ? null : dIndex;
        return next;
      });
      if (subject[col] !== dIndex) {
        previewNote(degToMidi(SCALES[modeRef.current], dIndex));
      }
    },
    [subject, previewNote],
  );

  // ─── draw the scrolling score ───
  const drawScore = useCallback(() => {
    const canvas = scoreRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const pw = Math.floor(cssW * dpr);
    const ph = Math.floor(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // paper
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssW, cssH);

    const top = 16;
    const bottom = cssH - 16;
    const yFor = (midi: number) => {
      const f = (midi - SCORE_LO) / (SCORE_HI - SCORE_LO);
      return bottom - f * (bottom - top);
    };

    const windowBeats = PAST_BEATS + FUTURE_BEATS;
    const playheadX = cssW * (PAST_BEATS / windowBeats);
    const pxPerBeat = cssW / windowBeats;

    // transport position (beats). idle → 0 so the canon previews statically.
    const synth = synthRef.current;
    const transport =
      playingRef.current && synth
        ? (synth.now() - startTimeRef.current) / spbRef.current
        : 0;
    const loopBeats = loopBeatsRef.current;
    const xForBeat = (b: number) => playheadX + (b - transport) * pxPerBeat;

    // ruled staff: one faint line per diatonic scale tone in range
    const scale = SCALES[modeRef.current];
    ctx.lineWidth = 1;
    for (let m = SCORE_LO; m <= SCORE_HI; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (!scale.includes(pc)) continue;
      const y = yFor(m);
      const tonic = pc === scale[0];
      ctx.strokeStyle = tonic ? rgba(INK, 0.16) : rgba(INK, 0.07);
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(cssW, y + 0.5);
      ctx.stroke();
    }

    // beat gridlines (bar emphasis every 4 beats)
    const firstBeat = Math.floor(transport - PAST_BEATS);
    const lastBeat = Math.ceil(transport + FUTURE_BEATS);
    for (let b = firstBeat; b <= lastBeat; b++) {
      const x = xForBeat(b);
      ctx.strokeStyle = b % 4 === 0 ? rgba(INK, 0.13) : rgba(INK, 0.05);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, top);
      ctx.lineTo(x + 0.5, bottom);
      ctx.stroke();
    }

    // notes — for each stored note draw the loop occurrences near the playhead
    const laneH = 12;
    const notes = notesRef.current;
    for (const n of notes) {
      const kc = loopBeats > 0 ? Math.round((transport - n.beat) / loopBeats) : 0;
      for (let k = kc - 1; k <= kc + 1; k++) {
        const b0 = n.beat + k * loopBeats;
        const x0 = xForBeat(b0);
        const x1 = xForBeat(b0 + n.dur);
        if (x1 < -20 || x0 > cssW + 20) continue;
        const y = yFor(n.midi);
        const st = voiceStyle(n.voice);
        const passed = b0 <= transport + 1e-6;

        // scrolling ribbon (the moving block): soft ahead, firmer once passed
        roundRect(ctx, x0, y - laneH / 2, Math.max(3, x1 - x0), laneH, 4);
        ctx.fillStyle = rgba(st.main, passed ? 0.16 : 0.28);
        ctx.fill();
        ctx.strokeStyle = rgba(st.main, passed ? 0.35 : 0.55);
        ctx.lineWidth = 1;
        ctx.stroke();

        // crystallized notehead: a crisp filled/hollow oval once the playhead passes
        if (passed) {
          const rx = 6.4;
          const ry = 5;
          // stem
          ctx.strokeStyle = rgba(st.main, 0.8);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x0 + rx - 0.5, y);
          ctx.lineTo(x0 + rx - 0.5, y - 22);
          ctx.stroke();
          // head
          ctx.beginPath();
          ctx.ellipse(x0, y, rx, ry, -0.35, 0, Math.PI * 2);
          if (st.hollow) {
            ctx.fillStyle = PAPER;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = st.main;
            ctx.stroke();
          } else {
            ctx.fillStyle = st.fill;
            ctx.fill();
          }
          // consonance-correction marker: a small ring above a nudged note
          if (n.corrected) {
            ctx.beginPath();
            ctx.arc(x0, y - 30, 3.2, 0, Math.PI * 2);
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = n.voice === 1 || n.voice === 3 ? INK : TERRA;
            ctx.stroke();
          }
        }
      }
    }

    // playhead
    ctx.strokeStyle = rgba(TERRA, 0.85);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, top);
    ctx.lineTo(playheadX + 0.5, bottom);
    ctx.stroke();
    // playhead cap
    ctx.fillStyle = TERRA;
    ctx.beginPath();
    ctx.moveTo(playheadX - 5, top);
    ctx.lineTo(playheadX + 5, top);
    ctx.lineTo(playheadX, top + 7);
    ctx.closePath();
    ctx.fill();
  }, []);

  // ─── draw the subject editor grid ───
  const drawEditor = useCallback(() => {
    const canvas = editorRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const pw = Math.floor(cssW * dpr);
    const ph = Math.floor(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = PAPER_DEEP;
    ctx.fillRect(0, 0, cssW, cssH);

    const cellW = cssW / STEPS;
    const cellH = cssH / EDITOR_ROWS;

    // faint grid + tonic-row shading
    for (let r = 0; r < EDITOR_ROWS; r++) {
      const dIndex = EDITOR_HI - r;
      const tonic = ((dIndex % 7) + 7) % 7 === 0;
      if (tonic) {
        ctx.fillStyle = rgba(INK, 0.06);
        ctx.fillRect(0, r * cellH, cssW, cellH);
      }
    }
    ctx.strokeStyle = rgba(INK, 0.12);
    ctx.lineWidth = 1;
    for (let c = 0; c <= STEPS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cellW + 0.5, 0);
      ctx.lineTo(c * cellW + 0.5, cssH);
      ctx.stroke();
    }
    for (let r = 0; r <= EDITOR_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cellH + 0.5);
      ctx.lineTo(cssW, r * cellH + 0.5);
      ctx.stroke();
    }

    // filled subject cells (dux = indigo)
    for (let c = 0; c < STEPS; c++) {
      const d = subject[c];
      if (d == null) continue;
      const r = EDITOR_HI - d;
      if (r < 0 || r >= EDITOR_ROWS) continue;
      roundRect(ctx, c * cellW + 3, r * cellH + 2, cellW - 6, cellH - 4, 4);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }, [subject]);

  // ─── unified animation loop ───
  const frame = useCallback(() => {
    drawScore();
    drawEditor();
    rafRef.current = requestAnimationFrame(frame);
  }, [drawScore, drawEditor]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [frame]);

  // teardown on unmount
  useEffect(
    () => () => {
      schedulerRef.current?.stop();
      synthRef.current?.dispose();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      synthRef.current = null;
      if (ctx) ctx.close().catch(() => {});
    },
    [],
  );

  // ─── derived live label ───
  const intervalLabel: Record<IntervalName, string> = {
    unison: "unison",
    fourth: "the 4th",
    fifth: "the 5th",
    octave: "the octave",
  };
  const isStretto = baseDelay <= 1 && nVoices >= 2;
  const canonName = invert
    ? `canon by inversion at ${intervalLabel[intervalName]}`
    : isStretto
      ? `stretto at ${intervalLabel[intervalName]}`
      : `canon at ${intervalLabel[intervalName]}`;

  // ─── UI helpers ───
  const chip =
    "min-h-[44px] rounded-md border px-4 py-2.5 text-base font-medium transition-colors";
  const chipOff = `${chip} border-[#2a355c]/25 text-[#2a355c]/80 hover:bg-[#2a355c]/8`;
  const chipOn = `${chip} border-[#c85a34] bg-[#c85a34]/12 text-[#8f3a1f]`;

  return (
    <main className="flex min-h-screen w-full flex-col bg-[#efe6d3] text-[#2a355c]">
      {/* header */}
      <header className="relative px-5 pt-6 sm:px-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stretto</h1>
        <p className="mt-1 max-w-2xl text-base text-[#2a355c]/85">
          Draw a melodic subject — the machine answers it with a real{" "}
          <span className="font-semibold text-[#8f3a1f]">canon</span>: delayed,
          transposed, inverted voices that chase your line and self-adjust to stay
          consonant, crystallizing into a scrolling score.
        </p>
        <p className="mt-2 text-base font-semibold text-[#8f3a1f]">
          {canonName} · delay {baseDelay} {baseDelay === 1 ? "beat" : "beats"} ·{" "}
          {nVoices} answering {nVoices === 1 ? "voice" : "voices"}
          {augment ? " · augmented" : ""}
          {correctOn && info.correctedCount > 0
            ? ` · ${info.correctedCount} note${info.correctedCount === 1 ? "" : "s"} nudged consonant`
            : ""}
        </p>

        <button
          onClick={() => setShowNotes((v) => !v)}
          className="absolute right-4 top-6 min-h-[44px] rounded-md border border-[#2a355c]/30 bg-[#efe6d3]/70 px-4 py-2.5 text-base text-[#2a355c] transition-colors hover:bg-[#2a355c]/10"
        >
          Read the design notes
        </button>
      </header>

      {/* the scrolling score (draws on mount, even before audio) */}
      <div className="relative mx-5 mt-4 flex-1 overflow-hidden rounded-lg border border-[#2a355c]/20 sm:mx-8">
        <canvas ref={scoreRef} className="h-full min-h-[240px] w-full" aria-hidden />
        {/* voice legend */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
          <span className="flex items-center gap-1.5 text-[#2a355c]">
            <span className="inline-block h-3 w-3 rounded-full bg-[#2a355c]" /> subject (dux)
          </span>
          <span className="flex items-center gap-1.5 text-[#8f3a1f]">
            <span className="inline-block h-3 w-3 rounded-full bg-[#c85a34]" /> answer (comes)
          </span>
        </div>
      </div>

      {audioError && (
        <p className="mx-5 mt-2 text-base font-semibold text-[#a3271b] sm:mx-8">
          {audioError}
        </p>
      )}

      {/* controls + subject editor */}
      <section className="px-5 py-5 sm:px-8">
        {/* primary actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handlePlay}
            className={`min-h-[44px] rounded-md px-6 py-2.5 text-base font-bold transition-colors ${
              playing
                ? "bg-[#2a355c] text-[#efe6d3] hover:bg-[#2a355c]/90"
                : "bg-[#c85a34] text-[#fdf6ea] hover:bg-[#b34d2b]"
            }`}
          >
            {playing ? "◼ Stop" : "▶ Play the canon"}
          </button>
          <button onClick={handleGenerate} className={chipOff}>
            ↻ Generate a subject
          </button>
          <button onClick={handleClear} className={chipOff}>
            Clear
          </button>
        </div>

        {/* subject editor */}
        <div className="mt-4">
          <p className="mb-1.5 text-base font-medium text-[#2a355c]/85">
            Draw your subject — tap a cell in each column to set its pitch (tap again
            to clear). Time runs left → right; higher rows are higher notes.
          </p>
          <canvas
            ref={editorRef}
            onPointerDown={onEditorDown}
            className="h-[168px] w-full cursor-pointer touch-none rounded-lg border border-[#2a355c]/25"
          />
        </div>

        {/* canon-type presets */}
        <div className="mt-5">
          <p className="mb-2 text-base font-semibold">Canon type</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => applyPreset("round")} className={chipOff}>
              Round (unison)
            </button>
            <button onClick={() => applyPreset("fifth")} className={chipOff}>
              At the 5th
            </button>
            <button onClick={() => applyPreset("octave")} className={chipOff}>
              At the octave
            </button>
            <button onClick={() => applyPreset("inversion")} className={chipOff}>
              By inversion
            </button>
            <button onClick={() => applyPreset("stretto")} className={chipOff}>
              Stretto
            </button>
          </div>
        </div>

        {/* fine controls */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {/* interval of imitation */}
          <div>
            <p className="mb-2 text-base font-semibold">Interval of imitation</p>
            <div className="flex flex-wrap gap-2">
              {(["unison", "fourth", "fifth", "octave"] as IntervalName[]).map((iv) => (
                <button
                  key={iv}
                  onClick={() => setIntervalName(iv)}
                  className={intervalName === iv ? chipOn : chipOff}
                >
                  {iv === "unison"
                    ? "Unison"
                    : iv === "fourth"
                      ? "4th"
                      : iv === "fifth"
                        ? "5th"
                        : "Octave"}
                </button>
              ))}
            </div>
          </div>

          {/* mode */}
          <div>
            <p className="mb-2 text-base font-semibold">Mode</p>
            <div className="flex flex-wrap gap-2">
              {(["ionian", "dorian", "aeolian"] as ModeName[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={mode === m ? chipOn : chipOff}
                >
                  {m === "ionian" ? "Ionian" : m === "dorian" ? "Dorian" : "Aeolian"}
                </button>
              ))}
            </div>
          </div>

          {/* transforms */}
          <div>
            <p className="mb-2 text-base font-semibold">Transforms</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setInvert((v) => !v)}
                className={invert ? chipOn : chipOff}
              >
                Inversion {invert ? "on" : "off"}
              </button>
              <button
                onClick={() => setAugment((v) => !v)}
                className={augment ? chipOn : chipOff}
              >
                Augmentation {augment ? "on" : "off"}
              </button>
              <button
                onClick={() => setCorrectOn((v) => !v)}
                className={correctOn ? chipOn : chipOff}
              >
                Consonance fix {correctOn ? "on" : "off"}
              </button>
            </div>
          </div>

          {/* sliders */}
          <div className="grid gap-3">
            <label className="block text-base font-medium">
              Answering voices: {nVoices}
              <input
                type="range"
                min={1}
                max={3}
                step={1}
                value={nVoices}
                onChange={(e) => setNVoices(Number(e.target.value))}
                className="mt-1 block w-full accent-[#c85a34]"
              />
            </label>
            <label className="block text-base font-medium">
              Entry delay: {baseDelay} {baseDelay === 1 ? "beat" : "beats"}
              {baseDelay === 1 ? " (stretto)" : ""}
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={baseDelay}
                onChange={(e) => setBaseDelay(Number(e.target.value))}
                className="mt-1 block w-full accent-[#c85a34]"
              />
            </label>
            <label className="block text-base font-medium">
              Tempo: {bpm} BPM
              <input
                type="range"
                min={60}
                max={144}
                step={2}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="mt-1 block w-full accent-[#c85a34]"
              />
            </label>
          </div>
        </div>

        <p className="mt-4 text-sm text-[#2a355c]/70">
          Tonic {noteName(degToMidi(SCALES[mode], 0))} · a small ring above a
          notehead marks where the consonance engine nudged an answer to stay sweet.
        </p>
      </section>

      {/* design-notes panel */}
      {showNotes && (
        <div className="fixed inset-x-4 top-20 z-30 mx-auto max-w-xl rounded-lg border border-[#2a355c]/25 bg-[#f6efe0] p-5 text-base text-[#2a355c] shadow-xl sm:inset-x-auto sm:right-8">
          <p className="mb-2 text-xl font-bold">The canon engine</p>
          <p className="mb-2">
            Your drawn subject is the <em>dux</em> — the leader. Each answering{" "}
            <em>comes</em> is the <strong>same line</strong> transposed by a diatonic
            interval (unison / 4th / 5th / octave), delayed by a chosen number of
            beats, and optionally <em>inverted</em> (contour mirrored around the first
            note) or <em>augmented</em> (note values doubled). That time-shifted
            imitation — not a block chord — is the whole point.
          </p>
          <p className="mb-2 text-[#2a355c]/85">
            <strong>Consonance self-correction</strong> is the intelligence: wherever
            an answer would land on a <em>strong beat</em> as a hard dissonance
            (semitone, whole tone, tritone or seventh) against the subject sounding at
            that instant, it is nudged to the nearest consonant scale tone (±1, then ±2
            diatonic steps). The nudge is tiny and stays in key, so the canon stays
            euphonious while its <em>contour</em> is preserved. Toggle{" "}
            <em>Consonance fix</em> off to hear the raw clashes.
          </p>
          <p className="text-[#2a355c]/85">
            Refs: J.S. Bach&rsquo;s canons in the <em>Musical Offering</em> and the{" "}
            <em>Goldberg Variations</em> (canons at every interval, by inversion and by
            augmentation) · Fux, <em>Gradus ad Parnassum</em> (the consonance test) ·
            Chris Wilson, <em>A Tale of Two Clocks</em> (scheduler). No strobe; the
            score scrolls as one smooth drift under 3 Hz; audio ramps from 0 into a
            limiter.
          </p>
          <div className="mt-3 flex items-center gap-4">
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-[#2a355c]/30 px-4 py-2.5 text-base font-medium hover:bg-[#2a355c]/10"
            >
              Close
            </button>
            <Link href="/dream" className="text-base font-medium underline hover:text-[#8f3a1f]">
              ← back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
