"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PressingAudio } from "./audio";
import { runMidiAccess, type MidiStatus } from "./midi";
import {
  KEY_ROW,
  buildEtchField,
  drawGroovePath,
  headPosition,
  keyToMidi,
  makeSeededTake,
  midiToFreq,
  pressureBoost,
  snapToScale,
  CENTER,
  R_OUTER,
  SIZE,
  type EtchedNote,
} from "./groove";

type Phase = "demo" | "armed" | "pressed";

const TAKE_SECONDS = 16; // length of one live cut
const LOOP_SECONDS = 7; // playback loop duration

function panFor(midi: number): number {
  return Math.max(-1, Math.min(1, ((midi % 12) / 12 - 0.5) * 1.2));
}

export default function PressingPage() {
  const [phase, setPhase] = useState<Phase>("demo");
  const [noteCount, setNoteCount] = useState(0);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("waiting");
  const [audioReady, setAudioReady] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [progress, setProgress] = useState(1);

  // Imperative engine state (kept off React to stay at 60fps).
  const pathRef = useRef<SVGPathElement | null>(null);
  const headDotRef = useRef<SVGCircleElement | null>(null);
  const armRef = useRef<SVGLineElement | null>(null);

  const audioRef = useRef<PressingAudio | null>(null);
  const notesRef = useRef<EtchedNote[]>([]);
  const fieldRef = useRef<Float32Array>(new Float32Array(0));
  const boostRef = useRef(1);

  const phaseRef = useRef<Phase>("demo");
  const headTRef = useRef(0);
  const playTRef = useRef(0);
  const lastPressureRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const recomputeField = useCallback(() => {
    fieldRef.current = buildEtchField(notesRef.current);
    boostRef.current = pressureBoost(notesRef.current);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new PressingAudio();
    audioRef.current.unlock();
    if (audioRef.current.ready) setAudioReady(true);
  }, []);

  /** A note sounds. In a live cut it is etched permanently; otherwise it only
   *  auditions. Either way it makes sound. */
  const handleInput = useCallback((rawMidi: number, vel: number) => {
    const midi = snapToScale(rawMidi);
    const freq = midiToFreq(midi);
    audioRef.current?.trigger(freq, vel, panFor(midi));
    if (phaseRef.current !== "armed") return;
    const note: EtchedNote = {
      t: headTRef.current,
      midi,
      freq,
      vel,
      pressure: lastPressureRef.current,
    };
    notesRef.current.push(note);
    fieldRef.current = buildEtchField(notesRef.current);
    boostRef.current = pressureBoost(notesRef.current);
    setNoteCount(notesRef.current.length);
  }, []);

  /* ------------------------------ MIDI ------------------------------ */
  useEffect(() => {
    const handle = runMidiAccess({
      onNote: (m, v) => handleInput(m, v),
      onPressure: (p) => {
        lastPressureRef.current = p;
      },
      onStatus: (s) => setMidiStatus(s),
    });
    return () => handle.dispose();
  }, [handleInput]);

  /* ---------------------------- keyboard ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const midi = keyToMidi(e.key.toLowerCase());
      if (midi == null) return;
      e.preventDefault();
      ensureAudio();
      handleInput(midi, 0.75);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ensureAudio, handleInput]);

  /* ------------------------- seed the demo -------------------------- */
  const loadSeeded = useCallback(() => {
    notesRef.current = makeSeededTake();
    recomputeField();
    phaseRef.current = "demo";
    playTRef.current = 0;
    setPhase("demo");
    setProgress(1);
    setNoteCount(notesRef.current.length);
  }, [recomputeField]);

  useEffect(() => {
    loadSeeded();
    // Draw the static guide spiral (empty groove) once.
    const guide = document.getElementById("guide-spiral");
    if (guide) {
      guide.setAttribute(
        "d",
        drawGroovePath(new Float32Array(fieldRef.current.length), 1, 1),
      );
    }
  }, [loadSeeded]);

  /* --------------------------- render loop -------------------------- */
  useEffect(() => {
    const loop = (now: number) => {
      const last = lastTimeRef.current ?? now;
      const dt = Math.min(0.05, (now - last) / 1000);
      lastTimeRef.current = now;

      let prog: number;
      let headT: number;
      const audio = audioRef.current;

      if (phaseRef.current === "armed") {
        headTRef.current += dt / TAKE_SECONDS;
        if (headTRef.current >= 1) {
          headTRef.current = 1;
          phaseRef.current = "pressed";
          playTRef.current = 0;
          setPhase("pressed");
        }
        headT = headTRef.current;
        prog = headT;
      } else {
        const prev = playTRef.current;
        let pt = prev + dt / LOOP_SECONDS;
        let wrapped = false;
        if (pt >= 1) {
          pt -= 1;
          wrapped = true;
        }
        playTRef.current = pt;
        if (audio?.ready) {
          for (const n of notesRef.current) {
            const crossed = wrapped
              ? n.t > prev || n.t <= pt
              : n.t > prev && n.t <= pt;
            if (crossed) audio.trigger(n.freq, n.vel, panFor(n.midi));
          }
        }
        headT = pt;
        prog = 1;
      }

      // Groove + playhead.
      if (pathRef.current) {
        pathRef.current.setAttribute(
          "d",
          drawGroovePath(fieldRef.current, prog, boostRef.current),
        );
      }
      const pos = headPosition(headT);
      if (headDotRef.current) {
        headDotRef.current.setAttribute("cx", pos.x.toFixed(2));
        headDotRef.current.setAttribute("cy", pos.y.toFixed(2));
      }
      if (armRef.current) {
        const ang = (pos.deg * Math.PI) / 180;
        const ex = CENTER + Math.cos(ang) * (R_OUTER + 34);
        const ey = CENTER + Math.sin(ang) * (R_OUTER + 34);
        armRef.current.setAttribute("x1", pos.x.toFixed(2));
        armRef.current.setAttribute("y1", pos.y.toFixed(2));
        armRef.current.setAttribute("x2", ex.toFixed(2));
        armRef.current.setAttribute("y2", ey.toFixed(2));
      }
      if (phaseRef.current === "armed") setProgress(prog);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => () => audioRef.current?.dispose(), []);

  /* ---------------------------- controls ---------------------------- */
  const armTake = useCallback(() => {
    ensureAudio();
    notesRef.current = [];
    fieldRef.current = new Float32Array(fieldRef.current.length);
    boostRef.current = 1;
    headTRef.current = 0;
    phaseRef.current = "armed";
    setPhase("armed");
    setNoteCount(0);
    setProgress(0);
  }, [ensureAudio]);

  const runAutoTake = useCallback(() => {
    ensureAudio();
    loadSeeded();
  }, [ensureAudio, loadSeeded]);

  const statusLine =
    phase === "armed"
      ? `Live cut — no undo · ${noteCount} etched · ${Math.round(progress * 100)}% full`
      : phase === "pressed"
        ? `Pressed · looping forever · ${noteCount} notes`
        : `Auto-take · looping · ${noteCount} notes`;

  const midiLabel: Record<MidiStatus, string> = {
    unsupported: "no Web MIDI in this browser",
    denied: "MIDI permission denied",
    waiting: "MIDI: no controller yet",
    connected: "MIDI controller connected",
    "connected-mpe": "MPE per-note expression live",
  };
  const midiIsError = midiStatus === "unsupported" || midiStatus === "denied";

  return (
    <main className="min-h-dvh bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream 4616 · one take
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Pressing
            </h1>
            <p className="mt-2 max-w-xl text-base text-muted-foreground">
              Every note is etched permanently the instant you play it. No undo,
              no re-cut. When the groove fills, your one take becomes the record
              that loops forever.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="shrink-0 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </header>

        <div className="relative overflow-hidden rounded-lg border border-border">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Record groove being etched by the performance"
          >
            <defs>
              <radialGradient id="disc" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#150c26" />
                <stop offset="70%" stopColor="#0b0713" />
                <stop offset="100%" stopColor="#05030a" />
              </radialGradient>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect width={SIZE} height={SIZE} fill="#05030a" />
            <circle cx={CENTER} cy={CENTER} r={R_OUTER + 30} fill="url(#disc)" />

            {/* Empty-groove guide underneath. */}
            <path
              id="guide-spiral"
              fill="none"
              stroke="#241147"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.6}
            />
            {/* The etched, permanent groove. */}
            <path
              ref={pathRef}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Spindle. */}
            <circle cx={CENTER} cy={CENTER} r={9} fill="#150c26" stroke="#3a1d78" strokeWidth={1} />
            <circle cx={CENTER} cy={CENTER} r={2.4} fill="#0b0713" />

            {/* Cutting stylus / tonearm. */}
            <line
              ref={armRef}
              stroke="#5b2ec9"
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.7}
            />
            <circle
              ref={headDotRef}
              r={5}
              fill="#c4b5fd"
              filter="url(#glow)"
            />
          </svg>

          <div className="pointer-events-none absolute left-3 top-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {statusLine}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={armTake}
            disabled={phase === "armed"}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {phase === "armed" ? "Cutting… (no undo)" : "Arm the take"}
          </button>
          <button
            type="button"
            onClick={runAutoTake}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Auto-take
          </button>
          {!audioReady && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              press a key or a button to unlock sound
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Play it — no MIDI needed
          </p>
          <div className="flex flex-wrap gap-1.5">
            {KEY_ROW.map((k) => (
              <kbd
                key={k}
                className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border bg-primary/20 px-2 text-sm text-foreground"
              >
                {k}
              </kbd>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            A rising pentatonic scale. Arm the take first if you want your keys
            etched into the groove — otherwise they just audition.
          </p>
          <p
            className={
              midiIsError
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {midiLabel[midiStatus]}
          </p>
        </div>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Pressing — design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">The question:</span> what if every
              note you play is etched permanently the instant you play it — one
              take, no undo — and when the groove is full it becomes the record
              that loops forever?
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">The stakes.</span> This is
              direct-to-disc performance. Arm the take and a cutting stylus begins
              its inward spiral. Every note-on is cut into the groove at the
              stylus&rsquo;s exact position — velocity sets the etch depth, MPE
              per-note pressure deepens the wiggle. There is no editing pass: the
              cut IS the master. When the stylus reaches the centre the take is
              done and your one performance plays back, looped forever, as the
              artifact.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">References.</span>{" "}
              <span className="italic">Direct-to-disc / lathe-cut</span> recording,
              where the lathe cuts the master live and no edit is possible. Alvin
              Lucier,{" "}
              <span className="italic">I Am Sitting in a Room</span> (1969), where
              the process of committing sound becomes the artifact itself.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">Research chain.</span> The 2026
              Web MIDI / MPE 1.1 frontier: each note carries its own continuous
              expression (per-note velocity and channel pressure). That per-note
              investment is exactly the thing you cannot take back — so the groove
              records it and refuses to forget.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">Controls.</span> Keys{" "}
              <span className="font-mono">a s d f g h j k</span> play a pentatonic
              scale; a MIDI controller drives it with real velocity and pressure.
              &ldquo;Arm the take&rdquo; starts a fresh live cut; &ldquo;Auto-take&rdquo;
              re-loads the seeded demo performance.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
