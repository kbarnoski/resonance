"use client";

// ════════════════════════════════════════════════════════════════════════════
// 5336 — Answerer
//
// What if Resonance were a real-time musical PARTNER that answers what you play
// on a MIDI keyboard — a contrapuntal voice with its own will, that can echo
// you, invert you, imitate you at a canonic delay, or REFUSE to resolve when
// you push toward a cadence?
//
// Web MIDI is the star; an on-screen keyboard + a seeded auto-performance let
// the piece self-demo with no device and no sound. The partner's answers come
// from a transparent species-counterpoint engine (see counterpoint.ts), not a
// neural model — the browser-feasible cousin of the 2026 live-jamming systems
// cited in the README.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEngineState,
  decidePartner,
  intervalIsConsonant,
  moodBlurb,
  relationLabel,
  type EngineState,
  type Mood,
  type Relation,
} from "./counterpoint";
import { createAudioEngine, type AudioEngine } from "./audio";
import { createMidiController, type MidiController } from "./midi";
import {
  ART,
  noteName,
  octaveLines,
  pitchToY,
  timeToX,
  VIEW_H,
  VIEW_W,
  WINDOW_MS,
} from "./notation";

interface NoteEvt {
  id: number;
  voice: "you" | "partner";
  midi: number;
  start: number;
  end: number | null;
  relation?: Relation;
  answersId?: number;
}

interface PartnerTrigger {
  fireAt: number;
  midi: number;
  durMs: number;
  relation: Relation;
  answersId: number;
}

const PARTNER_DUR = 640;
const AUTO_RESUME_IDLE = 2500;

// A seeded looping phrase in C major. Two B→C cadences let "Wilful" show its
// refusal to resolve. Rests keep it breathing. (Deterministic — no randomness.)
const AUTO: { midi: number | null; dur: number }[] = [
  { midi: 60, dur: 400 },
  { midi: 64, dur: 400 },
  { midi: 67, dur: 400 },
  { midi: 64, dur: 360 },
  { midi: 65, dur: 360 },
  { midi: 64, dur: 360 },
  { midi: 62, dur: 400 },
  { midi: null, dur: 300 },
  { midi: 67, dur: 380 },
  { midi: 69, dur: 380 },
  { midi: 67, dur: 360 },
  { midi: 64, dur: 360 },
  { midi: 71, dur: 420 },
  { midi: 72, dur: 520 },
  { midi: null, dur: 400 },
  { midi: 64, dur: 380 },
  { midi: 62, dur: 380 },
  { midi: 60, dur: 380 },
  { midi: 62, dur: 360 },
  { midi: 71, dur: 420 },
  { midi: 72, dur: 560 },
  { midi: null, dur: 620 },
];

const MOODS: Mood[] = ["shadow", "contrary", "wilful"];
const MOOD_NAME: Record<Mood, string> = {
  shadow: "Shadow",
  contrary: "Contrary",
  wilful: "Wilful",
};

// ── On-screen keyboard layout (C4..C6). ──────────────────────────────────────
const KB_LO = 60;
const KB_HI = 84;
const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
const BLACK_AFTER = new Set([0, 2, 5, 7, 9]); // white pcs that have a black to the right
function makeKeyboard() {
  const whites: number[] = [];
  for (let m = KB_LO; m <= KB_HI; m++) if (WHITE_PC.has(m % 12)) whites.push(m);
  const blacks: { midi: number; whiteIndex: number }[] = [];
  whites.forEach((m, i) => {
    if (BLACK_AFTER.has(m % 12) && m + 1 <= KB_HI) {
      blacks.push({ midi: m + 1, whiteIndex: i });
    }
  });
  return { whites, blacks };
}

export default function AnswererPage() {
  const [, setFrame] = useState(0);
  const [started, setStarted] = useState(false);
  const [mood, setMood] = useState<Mood>("contrary");
  const [midiStatus, setMidiStatus] = useState<{ msg: string; ok: boolean }>({
    msg: "MIDI not connected",
    ok: false,
  });
  const [autoOn, setAutoOn] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [lastRelation, setLastRelation] = useState<Relation | null>(null);

  const audioRef = useRef<AudioEngine | null>(null);
  const midiRef = useRef<MidiController | null>(null);
  const engineRef = useRef<EngineState>(createEngineState("contrary"));
  const notesRef = useRef<NoteEvt[]>([]);
  const heldRef = useRef<Map<number, { id: number; audio?: { release: () => void } }>>(
    new Map()
  );
  const pendingRef = useRef<PartnerTrigger[]>([]);
  const pendingOffRef = useRef<{ midi: number; at: number }[]>([]);
  const autoCursorRef = useRef({ i: 0, nextAt: 0 });
  const lastUserRef = useRef<number>(-Infinity);
  const nowRef = useRef<number>(0);
  const idRef = useRef(1);
  const rafRef = useRef<number | null>(null);

  const startedRef = useRef(false);
  const moodRef = useRef<Mood>("contrary");
  const autoOnRef = useRef(true);
  useEffect(() => {
    startedRef.current = started;
  }, [started]);
  useEffect(() => {
    moodRef.current = mood;
    engineRef.current.mood = mood;
  }, [mood]);
  useEffect(() => {
    autoOnRef.current = autoOn;
  }, [autoOn]);

  // ── Core note plumbing (refs only → stable across renders). ────────────────
  const firePartner = useCallback((t: PartnerTrigger) => {
    const now = performance.now();
    const evt: NoteEvt = {
      id: idRef.current++,
      voice: "partner",
      midi: t.midi,
      start: now,
      end: now + t.durMs,
      relation: t.relation,
      answersId: t.answersId,
    };
    notesRef.current.push(evt);
    if (startedRef.current && audioRef.current) {
      audioRef.current.playNote(t.midi, "partner", t.durMs / 1000);
    }
  }, []);

  const startYouNote = useCallback((midi: number) => {
    const now = performance.now();
    // Retrigger safety: release any held note of the same pitch first.
    const prev = heldRef.current.get(midi);
    if (prev) {
      prev.audio?.release();
      const e = notesRef.current.find((n) => n.id === prev.id && n.end == null);
      if (e) e.end = now;
    }

    const evt: NoteEvt = {
      id: idRef.current++,
      voice: "you",
      midi,
      start: now,
      end: null,
    };
    notesRef.current.push(evt);

    let audio: { release: () => void } | undefined;
    if (startedRef.current && audioRef.current) {
      audio = audioRef.current.startNote(midi, "you");
    }
    heldRef.current.set(midi, { id: evt.id, audio });

    // The partner decides how to answer.
    const decision = decidePartner(engineRef.current, midi);
    setLastRelation(decision.relation);
    pendingRef.current.push({
      fireAt: now + decision.delayMs,
      midi: decision.midi,
      durMs: PARTNER_DUR,
      relation: decision.relation,
      answersId: evt.id,
    });
  }, []);

  const endYouNote = useCallback((midi: number) => {
    const now = performance.now();
    const held = heldRef.current.get(midi);
    if (!held) return;
    held.audio?.release();
    const e = notesRef.current.find((n) => n.id === held.id && n.end == null);
    if (e) e.end = now;
    heldRef.current.delete(midi);
  }, []);

  // ── The clock. ─────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const now = performance.now();
    nowRef.current = now;

    // Seeded auto-performance (visual always; audible once sound is on). Pauses
    // shortly after any live input, resumes when the visitor goes idle.
    const idle = now - lastUserRef.current > AUTO_RESUME_IDLE;
    if (autoOnRef.current && idle) {
      if (now >= autoCursorRef.current.nextAt) {
        const step = AUTO[autoCursorRef.current.i % AUTO.length];
        autoCursorRef.current.i++;
        autoCursorRef.current.nextAt = now + step.dur;
        if (step.midi != null) {
          startYouNote(step.midi);
          pendingOffRef.current.push({
            midi: step.midi,
            at: now + step.dur * 0.85,
          });
        }
      }
    } else {
      // keep the cursor from lagging while paused
      autoCursorRef.current.nextAt = Math.max(
        autoCursorRef.current.nextAt,
        now
      );
    }

    // Fire due partner answers.
    if (pendingRef.current.length) {
      const still: PartnerTrigger[] = [];
      for (const p of pendingRef.current) {
        if (now >= p.fireAt) firePartner(p);
        else still.push(p);
      }
      pendingRef.current = still;
    }

    // Auto note-offs.
    if (pendingOffRef.current.length) {
      const still: { midi: number; at: number }[] = [];
      for (const o of pendingOffRef.current) {
        if (now >= o.at) endYouNote(o.midi);
        else still.push(o);
      }
      pendingOffRef.current = still;
    }

    // Prune scrolled-off notes.
    const cutoff = now - WINDOW_MS - 600;
    notesRef.current = notesRef.current.filter((n) => (n.end ?? now) >= cutoff);

    setFrame((f) => (f + 1) % 1000000);
    rafRef.current = requestAnimationFrame(tick);
  }, [startYouNote, endYouNote, firePartner]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      midiRef.current?.dispose();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [tick]);

  // ── User gestures. ─────────────────────────────────────────────────────────
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudioEngine();
      } catch {
        return;
      }
    }
    audioRef.current.resume().catch(() => {});
    if (!startedRef.current) setStarted(true);
  }, []);

  const connectMidi = useCallback(async () => {
    ensureAudio();
    if (!midiRef.current) {
      midiRef.current = createMidiController(
        (m) => {
          lastUserRef.current = performance.now();
          startYouNote(m);
        },
        (m) => endYouNote(m),
        (msg, ok) => setMidiStatus({ msg, ok })
      );
    }
    const res = await midiRef.current.connect();
    setMidiStatus({ msg: res.message, ok: res.ok });
  }, [ensureAudio, startYouNote, endYouNote]);

  const pressKey = useCallback(
    (m: number) => {
      ensureAudio();
      lastUserRef.current = performance.now();
      startYouNote(m);
    },
    [ensureAudio, startYouNote]
  );
  const releaseKey = useCallback(
    (m: number) => {
      endYouNote(m);
    },
    [endYouNote]
  );

  // ── Render data ────────────────────────────────────────────────────────────
  const now = nowRef.current || performance.now();
  const notes = notesRef.current;
  const byId = new Map<number, NoteEvt>();
  for (const n of notes) byId.set(n.id, n);
  const { whites, blacks } = makeKeyboard();
  const tension = engineRef.current.tension;
  const midiSupported =
    typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { requestMIDIAccess?: unknown })
      .requestMIDIAccess === "function";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream 5336 · counterpoint partner
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Answerer
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Play a MIDI keyboard and a second voice answers with a will of its
          own — echoing you at a canonic delay, mirroring your line, meeting you
          in contrary motion, or refusing to resolve when you push toward a
          cadence.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={connectMidi}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Connect MIDI
        </button>
        <button
          type="button"
          onClick={ensureAudio}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {started ? "Sound on" : "Begin (enable sound)"}
        </button>
        <button
          type="button"
          onClick={() => setAutoOn((v) => !v)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Auto-demo: {autoOn ? "on" : "off"}
        </button>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="ml-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Status row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className={midiStatus.ok ? "text-primary" : "text-muted-foreground"}>
          {midiStatus.msg}
        </span>
        {!midiSupported && (
          <span className="text-destructive">
            Web MIDI unavailable in this browser — the on-screen keys and
            auto-demo still work.
          </span>
        )}
        <span className="text-muted-foreground">
          Partner:{" "}
          <span className="text-foreground">{MOOD_NAME[mood]}</span> —{" "}
          {moodBlurb(mood)}
        </span>
        {lastRelation && (
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            last answer: {relationLabel[lastRelation]}
          </span>
        )}
      </div>

      {/* Mood + tension */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          behavior
        </span>
        {MOODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMood(m)}
            className={
              "min-h-[44px] rounded-md px-4 text-sm transition-colors " +
              (m === mood
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground")
            }
          >
            {MOOD_NAME[m]}
          </button>
        ))}
        <div className="ml-2 flex min-w-[180px] flex-1 items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tension
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${Math.round(tension * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* The two-voice piano-roll */}
      <div className="overflow-hidden rounded-lg border border-border">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block w-full"
          style={{ background: ART.bg }}
          preserveAspectRatio="none"
          role="img"
          aria-label="Two-voice counterpoint piano-roll: your line and the partner's answer scrolling in time."
        >
          {/* Octave gridlines */}
          {octaveLines().map((m) => {
            const y = pitchToY(m);
            const tonic = m % 12 === 0;
            return (
              <g key={`grid-${m}`}>
                <line
                  x1={0}
                  x2={VIEW_W}
                  y1={y}
                  y2={y}
                  stroke={tonic ? ART.tonic : ART.staff}
                  strokeWidth={tonic ? 1.4 : 0.8}
                />
                <text
                  x={6}
                  y={y - 3}
                  fill={ART.staff}
                  fontSize={11}
                  fontFamily="monospace"
                >
                  {noteName(m)}
                </text>
              </g>
            );
          })}

          {/* Relationship lines: partner → the note it answered */}
          {notes.map((n) => {
            if (n.voice !== "partner" || n.answersId == null) return null;
            const you = byId.get(n.answersId);
            if (!you) return null;
            const px = (timeToX(n.start, now) + timeToX(n.end ?? now, now)) / 2;
            const yEnd = you.end ?? now;
            const yx = (timeToX(you.start, now) + timeToX(yEnd, now)) / 2;
            if (px < -20 && yx < -20) return null;
            const cons = intervalIsConsonant(n.midi, you.midi);
            return (
              <line
                key={`link-${n.id}`}
                x1={yx}
                y1={pitchToY(you.midi)}
                x2={px}
                y2={pitchToY(n.midi)}
                stroke={cons ? ART.linkCons : ART.linkDiss}
                strokeWidth={cons ? 1.1 : 1.4}
                strokeDasharray={cons ? undefined : "3 3"}
                opacity={0.5}
              />
            );
          })}

          {/* Notes */}
          {notes.map((n) => {
            const x0 = timeToX(n.start, now);
            const x1 = timeToX(n.end ?? now, now);
            if (x1 < 0) return null;
            const w = Math.max(3, x1 - x0);
            const y = pitchToY(n.midi);
            const you = n.voice === "you";
            return (
              <rect
                key={`note-${n.id}`}
                x={x0}
                y={y - 5}
                width={w}
                height={10}
                rx={3}
                fill={you ? ART.you : ART.partner}
                stroke={you ? ART.youCore : ART.partnerCore}
                strokeWidth={0.8}
                opacity={0.92}
              />
            );
          })}

          {/* "Now" line */}
          <line
            x1={VIEW_W - 1}
            x2={VIEW_W - 1}
            y1={0}
            y2={VIEW_H}
            stroke={ART.now}
            strokeWidth={1}
            opacity={0.35}
          />
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-6 rounded-sm"
            style={{ background: ART.you }}
          />
          you
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-6 rounded-sm"
            style={{ background: ART.partner }}
          />
          partner
        </span>
        <span className="text-muted-foreground">
          lines link each answer to the note it replies to — solid = consonance,
          dashed = a held dissonance.
        </span>
      </div>

      {/* On-screen keyboard (fallback + always available) */}
      <div className="mt-1">
        <span className="mb-2 block font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          or play here
        </span>
        <div
          className="relative h-36 w-full select-none rounded-lg border border-border"
          style={{ background: ART.bg }}
        >
          <div className="flex h-full w-full">
            {whites.map((m) => (
              <button
                key={`w-${m}`}
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  pressKey(m);
                }}
                onPointerUp={() => releaseKey(m)}
                onPointerLeave={(e) => {
                  if (e.buttons > 0) releaseKey(m);
                }}
                onPointerCancel={() => releaseKey(m)}
                className="group relative flex-1 rounded-b-md border border-border/60 bg-background/80 transition-colors hover:bg-accent active:bg-primary/30"
                aria-label={noteName(m)}
              >
                <span className="pointer-events-none absolute bottom-1 left-0 right-0 text-center font-mono text-[10px] text-muted-foreground">
                  {m % 12 === 0 ? noteName(m) : ""}
                </span>
              </button>
            ))}
          </div>
          {blacks.map((b) => {
            const leftPct = ((b.whiteIndex + 1) / whites.length) * 100;
            const halfPct = (100 / whites.length) * 0.32;
            return (
              <button
                key={`b-${b.midi}`}
                type="button"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  pressKey(b.midi);
                }}
                onPointerUp={() => releaseKey(b.midi)}
                onPointerLeave={(e) => {
                  if (e.buttons > 0) releaseKey(b.midi);
                }}
                onPointerCancel={() => releaseKey(b.midi)}
                className="absolute top-0 h-[62%] rounded-b-md border border-border transition-colors active:bg-primary/40"
                style={{
                  left: `calc(${leftPct}% - ${halfPct}%)`,
                  width: `${(100 / whites.length) * 0.64}%`,
                  background: "#150c26",
                }}
                aria-label={noteName(b.midi)}
              />
            );
          })}
        </div>
      </div>

      {/* Design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes — Answerer
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                the app were a real-time musical partner — a contrapuntal voice
                with its own will — rather than a visualizer?
              </p>
              <p>
                <span className="text-foreground">How it decides.</span> For
                every note you play, a species-counterpoint engine weighs a small
                set of moves: echo you at a canonic delay, invert you around a
                C5 axis, meet you in contrary motion on a consonance, hold a
                dissonant suspension, or — at a cadence — refuse to resolve. It
                prefers imperfect consonances (3rds/6ths) and contrary motion,
                treats P4 / tritone / 2nds / 7ths as dissonances, and penalizes
                parallel perfect fifths and octaves, after Fux&rsquo;s{" "}
                <em>Gradus ad Parnassum</em> (1725). A seeded PRNG picks among
                the weighted options, so a review run is reproducible.
              </p>
              <p>
                <span className="text-foreground">Behaviors.</span> Shadow =
                close imitation at a canonic delay. Contrary = the mirror,
                favoring inversion and contrary motion. Wilful = its own will,
                raising a tension state through suspensions and withholding
                cadential resolution.
              </p>
              <p>
                <span className="text-foreground">Lineage.</span> The 2026 wave
                of live human-AI co-performance — arXiv:2606.11886{" "}
                <em>
                  Real-Time Language Model Jamming: A Case Study for Live Music
                  Accompaniment Generation
                </em>{" "}
                and ReaLJam (arXiv:2502.21267) — machines that jam live and take
                initiative. This is the transparent, rule-based cousin: the
                neural model swapped for a legible voice-leading engine, plus the
                fugal answer / inversion / stretto tradition.
              </p>
              <p>
                <span className="text-foreground">Demoable vs rough.</span> The
                engine, three moods, dual-voice audio, SVG piano-roll, Web MIDI,
                on-screen keys, and a seeded auto-performance all work.
                Rough: one fixed key (C major), no note-off velocity shaping, the
                cadence detector is a single-note leading-tone cue rather than a
                full harmonic parser.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
