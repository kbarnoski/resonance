"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BUILT_IN_SUBJECTS,
  Motif,
  midiToDegree,
  makeKey,
} from "./theory";
import { CantusEngine, NoteEvent, Section, TransformFlash } from "./engine";
import { AudioVoices } from "./audio";
import { RollRenderer, RollNote, VOICE_COLORS } from "./gl";
import { RollRenderer2D } from "./canvas2d";

// ── timing ─────────────────────────────────────────────────────────────────
const BPM = 110;
const SEC_PER_BEAT = 60 / BPM;
const LOOKAHEAD_MS = 100; // schedule this far ahead
const TICK_MS = 25; // scheduler wakeup interval
const WINDOW_BEATS = 28; // how many beats the roll shows at once

type Renderer =
  | { kind: "gl"; r: RollRenderer }
  | { kind: "2d"; r: RollRenderer2D };

const VOICE_LABELS = ["Bass", "Tenor", "Alto", "Soprano"];

export default function CantusEnginePage() {
  const [running, setRunning] = useState(false);
  const [midiStatus, setMidiStatus] = useState<string>("not requested");
  const [midiOk, setMidiOk] = useState(false);
  const [subjectLabel, setSubjectLabel] = useState("B-A-C-H cell");
  const [section, setSection] = useState<Section>("Exposition");
  const [keyName, setKeyName] = useState("C minor");
  const [cycle, setCycle] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [flash, setFlash] = useState<TransformFlash | null>(null);
  const [recentOps, setRecentOps] = useState<TransformFlash[]>([]);
  const [rendererKind, setRendererKind] = useState<"gl" | "2d" | "none">("none");
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // refs that the scheduler / rAF loops read without re-rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioVoices | null>(null);
  const engineRef = useRef<CantusEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const notesRef = useRef<RollNote[]>([]);
  const schedulerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const nextBeatTimeRef = useRef(0); // AudioContext time of next beat
  const beatCounterRef = useRef(0);
  const startTimeRef = useRef(0);
  const flashTimerRef = useRef<number | null>(null);
  // captured input notes (degrees) while building a custom subject
  const captureRef = useRef<number[]>([]);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiHandlerRef = useRef<((e: MIDIMessageEvent) => void) | null>(null);

  // ── flash a transform label briefly ──
  const showFlash = useCallback((f: TransformFlash) => {
    setFlash(f);
    setRecentOps((prev) => [f, ...prev].slice(0, 7));
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 1600);
  }, []);

  // ── the look-ahead scheduler ──
  const runScheduler = useCallback(() => {
    const audio = audioRef.current;
    const engine = engineRef.current;
    if (!audio || !engine) return;
    const ctx = audio.ctx;
    const horizon = ctx.currentTime + LOOKAHEAD_MS / 1000;

    while (nextBeatTimeRef.current < horizon) {
      const beat = beatCounterRef.current;
      const when = nextBeatTimeRef.current;
      const events: NoteEvent[] = engine.step(beat);
      for (const ev of events) {
        const durSec = ev.durBeats * SEC_PER_BEAT;
        const at = when + (ev.startBeat - beat) * SEC_PER_BEAT;
        audio.play(ev.voice, ev.midi, at, durSec);
        notesRef.current.push({
          voice: ev.voice,
          midi: ev.midi,
          startBeat: ev.startBeat,
          durBeats: ev.durBeats,
        });
      }
      // pull any narrated transform
      const f = engine.takeFlash();
      if (f) showFlash(f);

      // trim note history
      if (notesRef.current.length > 600) {
        notesRef.current.splice(0, notesRef.current.length - 600);
      }

      nextBeatTimeRef.current += SEC_PER_BEAT;
      beatCounterRef.current += 1;
    }
  }, [showFlash]);

  // ── rAF render + HUD sync ──
  const runRenderLoop = useCallback(() => {
    const audio = audioRef.current;
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (audio && engine && renderer) {
      // continuous beat position (fractional) for smooth scroll
      const elapsedSec = audio.ctx.currentTime - startTimeRef.current;
      const nowBeat = elapsedSec / SEC_PER_BEAT;
      renderer.r.render(notesRef.current, nowBeat, WINDOW_BEATS);

      // throttle HUD updates
      const st = engine.state;
      setSection(st.section);
      setKeyName(st.key.name);
      setCycle(st.cycle + 1);
      setElapsed(Math.max(0, elapsedSec));
    }
    rafRef.current = requestAnimationFrame(runRenderLoop);
  }, []);

  // ── build a renderer (WebGL2 → Canvas2D fallback) ──
  const makeRenderer = useCallback((): Renderer | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      const r = new RollRenderer(canvas);
      setRendererKind("gl");
      return { kind: "gl", r };
    } catch {
      try {
        const r = new RollRenderer2D(canvas);
        setRendererKind("2d");
        return { kind: "2d", r };
      } catch {
        setRendererKind("none");
        setError("Neither WebGL2 nor Canvas2D is available in this browser.");
        return null;
      }
    }
  }, []);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.r.resize(rect.width, rect.height, dpr);
  }, []);

  // ── start the engine with a given subject ──
  const start = useCallback(
    async (subject: Motif, label: string) => {
      setError(null);
      try {
        if (!audioRef.current) {
          audioRef.current = new AudioVoices();
        }
        const audio = audioRef.current;
        await audio.resume();
        audio.fadeIn();

        if (!rendererRef.current) {
          rendererRef.current = makeRenderer();
          sizeCanvas();
        }

        // seed engine (reproducible seed derived from label)
        let seed = 1337;
        for (let i = 0; i < label.length; i++) seed = (seed * 31 + label.charCodeAt(i)) | 0;
        engineRef.current = new CantusEngine(seed >>> 0, subject, makeKey(0, "minor"));

        notesRef.current = [];
        beatCounterRef.current = 0;
        startTimeRef.current = audio.ctx.currentTime;
        nextBeatTimeRef.current = audio.ctx.currentTime + 0.06;

        if (schedulerRef.current) window.clearInterval(schedulerRef.current);
        schedulerRef.current = window.setInterval(runScheduler, TICK_MS);
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(runRenderLoop);
        }
        setSubjectLabel(label);
        setRunning(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start audio.");
      }
    },
    [makeRenderer, runScheduler, runRenderLoop, sizeCanvas],
  );

  const stop = useCallback(() => {
    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    audioRef.current?.fadeOut();
    setRunning(false);
  }, []);

  // ── input capture: turn played notes into a custom subject ──
  const handleInputDegree = useCallback(
    (degree: number) => {
      if (!capturing) return;
      captureRef.current.push(degree);
      if (captureRef.current.length >= 5) {
        // finalize a subject from the captured degrees
        const motif: Motif = captureRef.current.map((d) => ({ degree: d, dur: 1 }));
        captureRef.current = [];
        setCapturing(false);
        if (running && engineRef.current) {
          engineRef.current.setSubject(motif);
          setSubjectLabel("your subject");
        } else {
          void start(motif, "your subject");
        }
      }
    },
    [capturing, running, start],
  );

  // map a MIDI note to a diatonic degree in C (octave-anchored)
  const midiToInputDegree = useCallback((midi: number) => {
    return midiToDegree(makeKey(0, "minor"), midi, 4);
  }, []);

  // ── Web MIDI ──
  const requestMidi = useCallback(async () => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (!nav.requestMIDIAccess) {
      setMidiStatus("Web MIDI not supported — use the computer keyboard");
      setMidiOk(false);
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      midiAccessRef.current = access;
      const handler = (e: MIDIMessageEvent) => {
        const data = e.data;
        if (!data) return;
        const [status, note, vel] = data;
        if ((status & 0xf0) === 0x90 && vel > 0) {
          handleInputDegree(midiToInputDegree(note));
        }
      };
      midiHandlerRef.current = handler;
      let count = 0;
      access.inputs.forEach((inp) => {
        inp.onmidimessage = handler;
        count++;
      });
      setMidiOk(count > 0);
      setMidiStatus(
        count > 0
          ? `${count} MIDI input${count > 1 ? "s" : ""} connected`
          : "MIDI granted — no devices found",
      );
    } catch {
      setMidiStatus("MIDI access denied — use the computer keyboard");
      setMidiOk(false);
    }
  }, [handleInputDegree, midiToInputDegree]);

  // ── computer-keyboard fallback: A S D F G H J K → scale degrees 0..7 ──
  useEffect(() => {
    const KEYMAP: Record<string, number> = {
      a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, k: 7,
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k in KEYMAP) {
        if (capturing) e.preventDefault();
        handleInputDegree(KEYMAP[k]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, handleInputDegree]);

  // ── auto-start a built-in subject within ~3s of first load ──
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!running) {
        const s = BUILT_IN_SUBJECTS[0];
        void start(s.motif, s.label);
      }
    }, 2200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── resize handling ──
  useEffect(() => {
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sizeCanvas]);

  // ── full cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (schedulerRef.current) window.clearInterval(schedulerRef.current);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      // remove MIDI listeners
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((inp) => {
          inp.onmidimessage = null;
        });
      }
      rendererRef.current?.r.dispose();
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const beginCapture = useCallback(() => {
    captureRef.current = [];
    setCapturing(true);
  }, []);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60).toString().padStart(2, "0");

  return (
    <main className="min-h-screen bg-[#0d0b09] text-white">
      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* header */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link
              href="/dream"
              className="text-base text-white/55 transition-colors hover:text-white/80"
            >
              ← dream lab
            </Link>
            <h1 className="mt-1 font-serif text-3xl text-white/95 sm:text-4xl">
              Cantus Engine
            </h1>
            <p className="mt-1 max-w-2xl text-base text-white/75">
              A deterministic, self-developing fugue. Every note is an explainable
              contrapuntal operation — the legible inverse of a black-box neural
              Bach-imitator.
            </p>
          </div>
          <div className="text-right text-base">
            <div className="font-mono text-2xl text-white/95">
              {mm}:{ss}
            </div>
            <div className="text-white/55">cycle {cycle}</div>
          </div>
        </div>

        {/* status row */}
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-base">
          <span className="text-white/80">
            Section:{" "}
            <span className="font-medium text-emerald-300/95">{section}</span>
          </span>
          <span className="text-white/80">
            Key: <span className="font-medium text-violet-300">{keyName}</span>
          </span>
          <span className="text-white/80">
            Subject:{" "}
            <span className="font-medium text-white/95">{subjectLabel}</span>
          </span>
          <span className="text-white/80">
            View:{" "}
            <span className="text-white/95">
              {rendererKind === "gl"
                ? "WebGL2"
                : rendererKind === "2d"
                  ? "Canvas2D (fallback)"
                  : "—"}
            </span>
          </span>
          {midiOk ? (
            <span className="text-emerald-300/95">{midiStatus}</span>
          ) : (
            <span className="text-amber-300/95">
              {midiStatus === "not requested"
                ? "no MIDI — keyboard A–K plays scale degrees"
                : midiStatus}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-base text-rose-300">
            {error}
          </div>
        )}

        {/* the score */}
        <div className="relative overflow-hidden rounded-lg border border-white/10 bg-[#141210]">
          <canvas ref={canvasRef} className="block h-[52vh] min-h-[320px] w-full" />

          {/* transform flash overlay */}
          {flash && (
            <div className="pointer-events-none absolute left-5 top-4 select-none">
              <div className="rounded-md bg-black/55 px-4 py-2.5 backdrop-blur-sm">
                <div className="font-serif text-2xl tracking-wide text-amber-200">
                  {flash.op}
                </div>
                {flash.detail && (
                  <div className="text-base text-white/75">{flash.detail}</div>
                )}
              </div>
            </div>
          )}

          {/* voice legend */}
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-1.5">
            {VOICE_COLORS.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    backgroundColor: `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`,
                  }}
                />
                <span className="text-white/75">{VOICE_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {running ? (
            <button
              onClick={stop}
              className="rounded-md bg-white/10 px-4 py-2.5 text-base text-white/95 transition-colors hover:bg-white/15"
            >
              Pause
            </button>
          ) : (
            <button
              onClick={() => {
                const s = BUILT_IN_SUBJECTS.find((b) => b.label === subjectLabel) ?? BUILT_IN_SUBJECTS[0];
                void start(s.motif, s.label);
              }}
              className="rounded-md bg-emerald-500/20 px-4 py-2.5 text-base text-emerald-200 transition-colors hover:bg-emerald-500/30"
            >
              Play
            </button>
          )}

          <button
            onClick={requestMidi}
            className="rounded-md bg-white/10 px-4 py-2.5 text-base text-white/95 transition-colors hover:bg-white/15"
          >
            Connect MIDI
          </button>

          <button
            onClick={beginCapture}
            className={`rounded-md px-4 py-2.5 text-base transition-colors ${
              capturing
                ? "bg-amber-500/25 text-amber-200"
                : "bg-white/10 text-white/95 hover:bg-white/15"
            }`}
          >
            {capturing
              ? `Listening… play 5 notes (${captureRef.current.length}/5)`
              : "Set subject (play 5 notes)"}
          </button>

          <div className="ml-1 flex items-center gap-2">
            <span className="text-sm text-white/55">Built-in:</span>
            {BUILT_IN_SUBJECTS.map((s) => (
              <button
                key={s.id}
                onClick={() => void start(s.motif, s.label)}
                className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/85 transition-colors hover:bg-white/10"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* help + recent ops */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div className="text-base text-white/75">
            <h2 className="mb-2 font-serif text-xl text-white/95">How to use</h2>
            <p className="mb-2">
              It auto-starts a fugue within a couple of seconds. To seed your own
              subject, hit <span className="text-white/95">Set subject</span> then
              play 5 notes — on a connected MIDI keyboard, or on your computer
              keyboard with{" "}
              <span className="font-mono text-violet-300">A S D F G H J K</span>{" "}
              (scale degrees 1–8).
            </p>
            <p className="text-white/55">
              The arc runs Exposition → Episode → Modulation → Stretto → Coda and
              loops with a fifth of key-drift each cycle, so minute 5 sounds
              different from minute 1.
            </p>
          </div>
          <div className="text-base text-white/75">
            <h2 className="mb-2 font-serif text-xl text-white/95">
              Transforms as they fire
            </h2>
            <ul className="space-y-1">
              {recentOps.length === 0 && (
                <li className="text-white/55">…waiting for the engine.</li>
              )}
              {recentOps.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-200">{f.op}</span>
                  {f.detail && <span className="text-white/55">{f.detail}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
