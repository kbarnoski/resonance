"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrganAudio } from "./audio";
import { OrganRenderer, type ActiveNote } from "./renderer";
import { midiToFreq, pitchName, SCRIABIN_TABLE } from "./chromesthesia";

/**
 * 1107 · Chromatic Organ — a pianist's chromesthesia color-organ.
 *
 * You PLAY it (computer keyboard or Web MIDI). Every pitch bursts into its
 * Scriabin colour; polyphony interferes into moiré; sustained notes leave a
 * daylight afterglow. Sight and sound are driven by the same note event, so
 * they can never diverge.
 */

// Computer-keyboard → MIDI offsets (relative to base octave root).
// White keys A S D F G H J K = C D E F G A B C ; black keys W E T Y U.
const KEY_MAP: Record<string, number> = {
  a: 0, // C
  w: 1, // C#
  s: 2, // D
  e: 3, // D#
  d: 4, // E
  f: 5, // F
  t: 6, // F#
  g: 7, // G
  y: 8, // G#
  h: 9, // A
  u: 10, // A#
  j: 11, // B
  k: 12, // C (octave up)
};

const WHITE_LEGEND = [
  ["A", "C"], ["S", "D"], ["D", "E"], ["F", "F"],
  ["G", "G"], ["H", "A"], ["J", "B"], ["K", "C"],
];
const BLACK_LEGEND = [["W", "C#"], ["E", "D#"], ["T", "F#"], ["Y", "G#"], ["U", "A#"]];

const IDLE_MS = 4000;
const BASE_MIDI = 60; // middle C when octaveShift = 0

type Phase = "idle" | "running" | "unsupported";

interface HeldNote {
  voiceId: number;
  midi: number;
  velocity: number;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<OrganAudio | null>(null);
  const rendererRef = useRef<OrganRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // token ("k60") → held note. token is midi number as string.
  const heldRef = useRef<Map<number, HeldNote>>(new Map());
  const octaveRef = useRef(0);
  const lastInputRef = useRef(0);
  const idleActiveRef = useRef(false);
  const idleStepRef = useRef(0);
  const idleNextRef = useRef(0);
  const idleHeldRef = useRef<HeldNote | null>(null);
  const startedRef = useRef(false);
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [midiState, setMidiState] = useState<"none" | "ready" | "unavailable">(
    "none",
  );
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [showNotes, setShowNotes] = useState(false);
  const [voiceCount, setVoiceCount] = useState(0);

  /* --------------------------- shared note plumbing --------------------------- */
  const startNote = useCallback((midi: number, velocity: number) => {
    const audio = audioRef.current;
    if (!audio || heldRef.current.has(midi)) return;
    const voiceId = audio.noteOn(midi, midiToFreq(midi), velocity);
    heldRef.current.set(midi, { voiceId, midi, velocity });
    setVoiceCount(heldRef.current.size);
  }, []);

  const stopNote = useCallback((midi: number) => {
    const audio = audioRef.current;
    const held = heldRef.current.get(midi);
    if (!audio || !held) return;
    audio.noteOff(held.voiceId);
    heldRef.current.delete(midi);
    setVoiceCount(heldRef.current.size);
  }, []);

  const markInput = useCallback(() => {
    lastInputRef.current = performance.now();
    if (idleActiveRef.current) {
      idleActiveRef.current = false;
      const h = idleHeldRef.current;
      if (h) {
        audioRef.current?.noteOff(h.voiceId);
        heldRef.current.delete(h.midi);
        idleHeldRef.current = null;
        setVoiceCount(heldRef.current.size);
      }
    }
  }, []);

  /* -------------------------------- keyboard -------------------------------- */
  useEffect(() => {
    if (phase !== "running") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // guard key-repeat
      const key = e.key.toLowerCase();
      if (key === "z" || key === "x") {
        octaveRef.current += key === "z" ? -1 : 1;
        octaveRef.current = Math.max(-2, Math.min(2, octaveRef.current));
        markInput();
        return;
      }
      const off = KEY_MAP[key];
      if (off === undefined) return;
      e.preventDefault();
      markInput();
      const midi = BASE_MIDI + octaveRef.current * 12 + off;
      startNote(midi, 0.8);
      setPressed((p) => new Set(p).add(key));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const off = KEY_MAP[key];
      if (off === undefined) return;
      const midi = BASE_MIDI + octaveRef.current * 12 + off;
      stopNote(midi);
      setPressed((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, startNote, stopNote, markInput]);

  /* ---------------------------------- MIDI ---------------------------------- */
  const attachMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") {
      setMidiState("unavailable");
      return;
    }
    nav
      .requestMIDIAccess()
      .then((access) => {
        setMidiState("ready");
        const onMsg = (ev: MIDIMessageEvent) => {
          const data = ev.data;
          if (!data || data.length < 3) return;
          const status = data[0] & 0xf0;
          const midi = data[1];
          const vel = data[2];
          if (status === 0x90 && vel > 0) {
            markInput();
            startNote(midi, Math.max(0.15, vel / 127));
          } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
            stopNote(midi);
          }
        };
        access.inputs.forEach((input) => {
          input.onmidimessage = onMsg;
        });
        access.onstatechange = () => {
          access.inputs.forEach((input) => {
            input.onmidimessage = onMsg;
          });
        };
      })
      .catch(() => setMidiState("unavailable"));
  }, [startNote, stopNote, markInput]);

  /* ------------------------------- render loop ------------------------------ */
  useEffect(() => {
    if (phase !== "running") return;
    const renderer = rendererRef.current;
    if (!renderer) return;
    const t0 = performance.now();

    // Deterministic idle arpeggio: an index-based evolving sequence (no RNG).
    const IDLE_SEQ = [0, 4, 7, 11, 12, 11, 7, 9, 5, 2, 0, 4, 7, 9];
    const IDLE_INTERVAL = 480; // ms per idle note

    const frame = () => {
      const now = performance.now();
      const tSec = (now - t0) / 1000;

      // idle generative arpeggio if no input for a while
      if (now - lastInputRef.current > IDLE_MS) {
        if (!idleActiveRef.current) {
          idleActiveRef.current = true;
          idleNextRef.current = now;
        }
        if (now >= idleNextRef.current) {
          const prev = idleHeldRef.current;
          if (prev) {
            audioRef.current?.noteOff(prev.voiceId);
            heldRef.current.delete(prev.midi);
            idleHeldRef.current = null;
          }
          const step = idleStepRef.current;
          const deg = IDLE_SEQ[step % IDLE_SEQ.length];
          // slowly drifting octave using the step index (deterministic)
          const octDrift = ((step / IDLE_SEQ.length) | 0) % 3;
          const midi = 55 + deg + octDrift * 12;
          if (audioRef.current && !heldRef.current.has(midi)) {
            const voiceId = audioRef.current.noteOn(
              midi,
              midiToFreq(midi),
              0.4,
            );
            const h = { voiceId, midi, velocity: 0.4 };
            heldRef.current.set(midi, h);
            idleHeldRef.current = h;
          }
          idleStepRef.current = step + 1;
          idleNextRef.current = now + IDLE_INTERVAL;
          setVoiceCount(heldRef.current.size);
        }
      }

      const notes: ActiveNote[] = [];
      heldRef.current.forEach((h) => {
        notes.push({
          midi: h.midi,
          pitchClass: ((h.midi % 12) + 12) % 12,
          velocity: h.velocity,
        });
      });

      renderer.render(tSec, notes);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase]);

  /* --------------------------------- resize --------------------------------- */
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const applySize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      canvas.width = w;
      canvas.height = h;
      renderer.resize(w, h);
    };
    applySize();
    window.addEventListener("resize", applySize);
    return () => window.removeEventListener("resize", applySize);
  }, [phase]);

  /* --------------------------------- start ---------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    try {
      rendererRef.current = new OrganRenderer(canvas, reducedRef.current);
    } catch {
      setPhase("unsupported");
      return;
    }

    const audio = new OrganAudio();
    await audio.resume();
    audioRef.current = audio;

    startedRef.current = true;
    lastInputRef.current = performance.now();
    attachMidi();
    setPhase("running");
  }, [attachMidi]);

  /* -------------------------------- teardown -------------------------------- */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  /* --------------------------------- markup --------------------------------- */
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#f4efe6] text-neutral-900">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* Title + description chip (dark translucent for contrast on daylight) */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-md rounded-2xl bg-neutral-900/70 px-4 py-3 backdrop-blur-sm">
        <h1 className="font-serif text-2xl text-white">Chromatic Organ</h1>
        <p className="mt-1 text-base text-white/95">
          Play notes and <em>see</em> the music — every pitch bursts into its
          Scriabin colour; chords interfere into shimmering moiré, in bright
          daylight.
        </p>
      </div>

      {/* Live legend / status */}
      {phase === "running" && (
        <div className="absolute bottom-4 left-4 z-10 max-w-lg rounded-2xl bg-neutral-900/70 px-4 py-3 text-white backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            {WHITE_LEGEND.map(([k, note]) => (
              <span
                key={k}
                className={
                  "inline-flex min-w-[34px] items-center justify-center rounded-md px-2 py-1 text-base font-medium " +
                  (pressed.has(k.toLowerCase())
                    ? "bg-white text-neutral-900"
                    : "bg-white/15 text-white")
                }
              >
                {k}
                <span className="ml-1 text-sm text-white/70">{note}</span>
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {BLACK_LEGEND.map(([k, note]) => (
              <span
                key={k}
                className={
                  "inline-flex min-w-[34px] items-center justify-center rounded-md px-2 py-1 text-base font-medium " +
                  (pressed.has(k.toLowerCase())
                    ? "bg-white text-neutral-900"
                    : "bg-white/10 text-white/85")
                }
              >
                {k}
                <span className="ml-1 text-sm text-white/70">{note}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-white/90">
            <span className="font-medium">Z</span> / <span className="font-medium">X</span> shift octave ·{" "}
            {midiState === "ready"
              ? "MIDI connected"
              : midiState === "unavailable"
                ? "no MIDI device — keyboard is live"
                : "listening for MIDI…"}{" "}
            · {voiceCount} voice{voiceCount === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {/* Start overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#f4efe6]/85 px-6 text-center backdrop-blur-sm">
          <h2 className="font-serif text-3xl text-neutral-900">
            A pianist&apos;s chromesthesia
          </h2>
          <p className="max-w-md text-base text-neutral-700">
            After Scriabin&apos;s <em>Prometheus</em> and its clavier à
            lumières. Bring a MIDI keyboard, or play the letter keys.
          </p>
          {phase === "unsupported" ? (
            <div className="rounded-xl bg-neutral-900/80 px-4 py-3 text-base text-rose-300">
              WebGL2 isn&apos;t available in this browser, so the color-organ
              can&apos;t render. Try a recent Chrome, Edge, or Firefox.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-neutral-900 px-8 py-2.5 text-xl font-medium text-white shadow-lg transition hover:bg-neutral-800 active:scale-95"
            >
              ▶ Play / Start
            </button>
          )}
        </div>
      )}

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full bg-neutral-900/70 px-4 py-2.5 text-base text-white backdrop-blur-sm transition hover:bg-neutral-900/85"
      >
        Design notes
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-full max-w-lg overflow-y-auto rounded-2xl bg-[#faf7f0] p-6 text-neutral-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-serif text-2xl">Design notes</h3>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full bg-neutral-900 px-4 py-2.5 text-base text-white"
              >
                Close
              </button>
            </div>
            <p className="mt-3 text-base text-neutral-700">
              A live chromesthesia color-organ after Alexander Scriabin&apos;s{" "}
              <em>Prometheus: The Poem of Fire</em> (1910) and its clavier à
              lumières. One note event drives both a 2-operator FM voice and a
              WebGL2 plane wave, so sight and sound never diverge. Polyphony
              superimposes the waves into moiré interference; sustained notes
              leave a daylight afterglow that decays toward warm paper, not the
              void. See <span className="font-mono">README.md</span> for the
              full write-up.
            </p>
            <h4 className="mt-4 text-xl font-medium">Scriabin colour scale</h4>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SCRIABIN_TABLE.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-base">
                  <span
                    className="inline-block h-5 w-5 rounded-full ring-1 ring-black/10"
                    style={{
                      backgroundColor: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`,
                    }}
                    aria-hidden
                  />
                  <span className="font-medium">{pitchName(i)}</span>
                  <span className="text-neutral-600">{c.scriabin}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
