"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HarmonographSynth,
  noteName,
  ratioLabel,
  snapToJustRatio,
  midiToFreq,
} from "./audio-engine";
import {
  buildPendulums,
  seedPendulums,
  sampleCurve,
  makeRenderer,
  type GLRenderer,
  type NoteInput,
} from "./harmonograph-gl";

// QWERTY → semitone offset from the current octave base (C).
const KEY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
};

const CURVE_POINTS = 3000;
const T_MAX = 40 * Math.PI;

// Simple chord-name guess from pitch classes relative to the lowest note.
function guessChord(midis: number[]): string {
  if (midis.length === 0) return "—";
  if (midis.length === 1) return noteName(midis[0]);
  const sorted = [...midis].sort((a, b) => a - b);
  const root = sorted[0];
  const intervals = new Set(sorted.map((m) => ((m - root) % 12 + 12) % 12));
  const has = (n: number) => intervals.has(n);
  const rootName = noteName(root).replace(/\d+$/, "");
  if (has(4) && has(7)) return `${rootName} major`;
  if (has(3) && has(7)) return `${rootName} minor`;
  if (has(4) && has(8)) return `${rootName} aug`;
  if (has(3) && has(6)) return `${rootName} dim`;
  if (has(5) && has(7)) return `${rootName} sus4`;
  if (has(4) && has(7) && has(10)) return `${rootName}7`;
  if (has(7)) return `${rootName} (5th)`;
  return `${rootName} cluster`;
}

// Two-octave on-screen keyboard layout (white + black keys), base C4 = 60.
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
const BLACK_SPEC: Array<{ offset: number; afterWhite: number }> = [
  { offset: 1, afterWhite: 0 },
  { offset: 3, afterWhite: 1 },
  { offset: 6, afterWhite: 3 },
  { offset: 8, afterWhite: 4 },
  { offset: 10, afterWhite: 5 },
  { offset: 13, afterWhite: 7 },
  { offset: 15, afterWhite: 8 },
  { offset: 18, afterWhite: 10 },
  { offset: 20, afterWhite: 11 },
  { offset: 22, afterWhite: 12 },
];

export default function HarmonographPage() {
  const [started, setStarted] = useState(false);
  const [justIntonation, setJustIntonation] = useState(true);
  const [held, setHeld] = useState<NoteInput[]>([]);
  const [octave, setOctave] = useState(4);
  const [midiStatus, setMidiStatus] = useState<
    | { kind: "unsupported" }
    | { kind: "none" }
    | { kind: "ready"; device: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [midiOutAvail, setMidiOutAvail] = useState(false);
  const [echoMidiOut, setEchoMidiOut] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // refs that the audio + render loops read without re-subscribing
  const synthRef = useRef<HarmonographSynth | null>(null);
  const heldRef = useRef<NoteInput[]>([]);
  const jiRef = useRef(justIntonation);
  const echoRef = useRef(echoMidiOut);
  const midiOutRef = useRef<MIDIOutput | null>(null);
  const pressedKeys = useRef<Set<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const octaveRef = useRef(octave);

  useEffect(() => {
    heldRef.current = held;
  }, [held]);
  useEffect(() => {
    jiRef.current = justIntonation;
    octaveRef.current = octave;
  }, [justIntonation, octave]);
  useEffect(() => {
    echoRef.current = echoMidiOut;
  }, [echoMidiOut]);

  // ── note on/off (single path) ──────────────────────────────────────────────
  const lowestMidi = useCallback(() => {
    const cur = heldRef.current;
    if (cur.length === 0) return 60;
    return cur.reduce((m, n) => Math.min(m, n.midi), Infinity);
  }, []);

  const sendMidiOut = useCallback((status: number, midi: number, vel: number) => {
    if (!echoRef.current) return;
    const out = midiOutRef.current;
    if (!out) return;
    try {
      out.send([status, midi, vel]);
    } catch {
      /* ignore */
    }
  }, []);

  const noteOn = useCallback(
    (midi: number, velocity: number) => {
      if (midi < 0 || midi > 127) return;
      setHeld((prev) => {
        if (prev.some((n) => n.midi === midi)) return prev;
        const next = [...prev, { midi, velocity }];
        heldRef.current = next;
        const synth = synthRef.current;
        if (synth) {
          const low = next.reduce((m, n) => Math.min(m, n.midi), Infinity);
          synth.noteOn(midi, velocity, low);
          synth.retune(low);
        }
        return next;
      });
      sendMidiOut(0x90, midi, Math.round(velocity * 127));
    },
    [sendMidiOut]
  );

  const noteOff = useCallback(
    (midi: number) => {
      setHeld((prev) => {
        if (!prev.some((n) => n.midi === midi)) return prev;
        const next = prev.filter((n) => n.midi !== midi);
        heldRef.current = next;
        const synth = synthRef.current;
        if (synth) {
          synth.noteOff(midi);
          if (next.length > 0) {
            const low = next.reduce((m, n) => Math.min(m, n.midi), Infinity);
            synth.retune(low);
          }
        }
        return next;
      });
      sendMidiOut(0x80, midi, 0);
    },
    [sendMidiOut]
  );

  // ── start audio (first gesture) ─────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (synthRef.current) return;
    if (typeof window === "undefined") return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const synth = new HarmonographSynth(ctx);
      synth.setJustIntonation(jiRef.current);
      synthRef.current = synth;
      setStarted(true);
    } catch (e) {
      setGlError("Audio could not start: " + (e as Error).message);
    }
  }, []);

  // ── JI toggle retunes live voices ───────────────────────────────────────────
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.setJustIntonation(justIntonation);
    synth.retune(lowestMidi());
  }, [justIntonation, lowestMidi]);

  // ── Web MIDI ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.requestMIDIAccess !== "function") {
      setMidiStatus({ kind: "unsupported" });
      return;
    }
    let access: MIDIAccess | null = null;
    let cancelled = false;

    const handleMessage = (ev: MIDIMessageEvent) => {
      const data = ev.data;
      if (!data || data.length < 3) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const vel = data[2];
      if (status === 0x90 && vel > 0) {
        noteOn(note, vel / 127);
      } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
        noteOff(note);
      }
    };

    const bind = (a: MIDIAccess) => {
      const names: string[] = [];
      a.inputs.forEach((input) => {
        input.onmidimessage = handleMessage;
        if (input.name) names.push(input.name);
      });
      const outs = Array.from(a.outputs.values());
      midiOutRef.current = outs[0] ?? null;
      setMidiOutAvail(outs.length > 0);
      if (names.length > 0) {
        setMidiStatus({ kind: "ready", device: names.join(", ") });
      } else {
        setMidiStatus({ kind: "none" });
      }
    };

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((a) => {
        if (cancelled) return;
        access = a;
        bind(a);
        a.onstatechange = () => bind(a);
      })
      .catch((e: Error) => {
        if (!cancelled) setMidiStatus({ kind: "error", message: e.message });
      });

    return () => {
      cancelled = true;
      if (access) {
        access.inputs.forEach((input) => (input.onmidimessage = null));
        access.onstatechange = null;
      }
    };
  }, [noteOn, noteOff]);

  // ── QWERTY input ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        setOctave((o) => Math.max(1, o - 1));
        return;
      }
      if (k === "x") {
        setOctave((o) => Math.min(7, o + 1));
        return;
      }
      if (!(k in KEY_MAP)) return;
      e.preventDefault();
      if (pressedKeys.current.has(k)) return; // ignore auto-repeat
      pressedKeys.current.add(k);
      if (!synthRef.current) startAudio();
      const midi = octaveRef.current * 12 + 12 + KEY_MAP[k];
      noteOn(midi, 0.8);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_MAP)) return;
      if (!pressedKeys.current.has(k)) return;
      pressedKeys.current.delete(k);
      const midi = octaveRef.current * 12 + 12 + KEY_MAP[k];
      noteOff(midi);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [noteOn, noteOff, startAudio]);

  // ── WebGL2 render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      setGlError("WebGL2 is unavailable in this browser.");
      return;
    }

    let renderer: GLRenderer;
    try {
      renderer = makeRenderer(gl, CURVE_POINTS);
    } catch (e) {
      setGlError("Renderer init failed: " + (e as Error).message);
      return;
    }

    const buf = new Float32Array(CURVE_POINTS * 2);
    let raf = 0;
    let rotate = 0;
    let cleared = false;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, dpr);
      cleared = false;
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      const now = (performance.now() - start) / 1000;
      const cur = heldRef.current;
      const ji = jiRef.current;

      if (!cleared) {
        renderer.clear();
        cleared = true;
      }
      // fade previous frame to leave a trail
      renderer.fade(cur.length > 0 ? 0.085 : 0.05);

      const aspect =
        gl.canvas.width / Math.max(1, gl.canvas.height);

      let pends;
      let color: [number, number, number];
      if (cur.length === 0) {
        pends = seedPendulums(now);
        color = [0.42, 0.4, 0.7]; // dim violet idle
        rotate += 0.0015;
      } else {
        pends = buildPendulums(cur, ji);
        // JI → cooler, calmer; 12-TET → warmer ink
        color = ji ? [0.55, 0.78, 0.95] : [0.95, 0.62, 0.42];
        rotate += 0.004 + cur.length * 0.0006;
      }

      const count = sampleCurve(buf, CURVE_POINTS, pends, rotate, T_MAX);
      renderer.drawCurve(buf, count, color, aspect);

      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    };
  }, []);

  // ── unmount: dispose synth ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const synth = synthRef.current;
      if (synth) {
        synth.dispose();
        void synth.ctx.close().catch(() => {});
        synthRef.current = null;
      }
    };
  }, []);

  // ── derived HUD values ──────────────────────────────────────────────────────
  const heldMidis = held.map((n) => n.midi);
  const sortedMidis = [...heldMidis].sort((a, b) => a - b);
  const baseMidi = sortedMidis[0];
  const ratioSet =
    sortedMidis.length > 0
      ? sortedMidis
          .map((m) => {
            const raw = midiToFreq(m) / midiToFreq(baseMidi);
            if (justIntonation) return ratioLabel(snapToJustRatio(raw));
            return raw.toFixed(3);
          })
          .join(" : ")
      : "—";

  // ── on-screen keyboard handlers ─────────────────────────────────────────────
  const screenBase = octave * 12 + 12;
  const onKeyDownScreen = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (!synthRef.current) startAudio();
    noteOn(midi, 0.85);
  };
  const onKeyUpScreen = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    noteOff(midi);
  };

  return (
    <main className="min-h-screen w-full bg-[#06080d] text-white overflow-hidden relative">
      <Link
        href="/dream"
        className="fixed top-4 left-4 z-30 text-base text-white/75 hover:text-white px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur transition-colors"
      >
        ← dream lab
      </Link>

      <button
        onClick={() => setShowNotes((s) => !s)}
        className="fixed top-4 right-4 z-30 text-base text-white/75 hover:text-white px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur transition-colors"
      >
        Design notes
      </button>

      {/* GL canvas fills the screen */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {glError && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-20 text-rose-300 text-base bg-black/60 px-5 py-3 rounded-lg max-w-md text-center">
          {glError} The keyboard and synth still work.
        </div>
      )}

      {/* Hero / controls overlay */}
      <div className="relative z-10 pointer-events-none flex flex-col min-h-screen">
        <header className="px-6 pt-20 max-w-2xl pointer-events-none">
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
            Harmonograph
          </h1>
          <p className="mt-2 text-base text-white/75 max-w-xl">
            Play a chord — MIDI, computer keys, or the on-screen piano — and watch
            the harmony draw itself as a Victorian pendulum figure. Toggle pure
            tuning to see and hear the geometry lock into place.
          </p>

          {!started && (
            <button
              onClick={startAudio}
              className="mt-5 pointer-events-auto text-base font-medium px-6 py-3 rounded-xl bg-violet-500/30 hover:bg-violet-500/45 text-violet-100 border border-violet-400/40 transition-colors"
            >
              ▶ Start sound
            </button>
          )}

          {/* status line */}
          <div className="mt-4 text-base flex flex-wrap gap-x-4 gap-y-1">
            {midiStatus?.kind === "ready" && (
              <span className="text-emerald-300/95">
                MIDI: {midiStatus.device}
              </span>
            )}
            {midiStatus?.kind === "none" && (
              <span className="text-amber-300/95">
                MIDI ready — no device connected. Use the keyboard below.
              </span>
            )}
            {midiStatus?.kind === "unsupported" && (
              <span className="text-amber-300/95">
                Web MIDI unsupported here (e.g. Safari) — QWERTY + on-screen
                keyboard still work fully.
              </span>
            )}
            {midiStatus?.kind === "error" && (
              <span className="text-amber-300/95">
                MIDI blocked: {midiStatus.message}. Keyboard still works.
              </span>
            )}
          </div>
        </header>

        <div className="flex-1" />

        {/* HUD + toggles */}
        <section className="px-6 pb-3 pointer-events-auto">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              onClick={() => setJustIntonation((j) => !j)}
              className={`text-base font-medium px-4 py-2.5 rounded-xl border transition-colors ${
                justIntonation
                  ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-100"
                  : "bg-white/5 border-white/15 text-white/75 hover:bg-white/10"
              }`}
            >
              Pure tuning (Just Intonation): {justIntonation ? "ON" : "OFF"}
            </button>

            {midiOutAvail && (
              <button
                onClick={() => setEchoMidiOut((e) => !e)}
                className={`text-base px-4 py-2.5 rounded-xl border transition-colors ${
                  echoMidiOut
                    ? "bg-violet-500/25 border-violet-400/50 text-violet-100"
                    : "bg-white/5 border-white/15 text-white/75 hover:bg-white/10"
                }`}
              >
                Echo to MIDI out: {echoMidiOut ? "ON" : "OFF"}
              </button>
            )}

            <div className="flex items-center gap-2 text-base text-white/75">
              <button
                onClick={() => setOctave((o) => Math.max(1, o - 1))}
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 min-w-[44px]"
              >
                −
              </button>
              <span className="tabular-nums">Octave {octave}</span>
              <button
                onClick={() => setOctave((o) => Math.min(7, o + 1))}
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 min-w-[44px]"
              >
                +
              </button>
            </div>
          </div>

          {/* readout */}
          <div className="font-mono text-base flex flex-wrap gap-x-6 gap-y-1 mb-3">
            <span className="text-white/75">
              held:{" "}
              <span className="text-white/95">
                {sortedMidis.length > 0
                  ? sortedMidis.map((m) => noteName(m)).join(" ")
                  : "—"}
              </span>
            </span>
            <span className="text-white/75">
              chord:{" "}
              <span className="text-violet-300">{guessChord(heldMidis)}</span>
            </span>
            <span className="text-white/75">
              ratios:{" "}
              <span
                className={
                  justIntonation ? "text-emerald-300/95" : "text-amber-300/95"
                }
              >
                {ratioSet}
              </span>
            </span>
          </div>
        </section>

        {/* on-screen keyboard */}
        <section className="px-3 pb-4 pointer-events-auto select-none">
          <div className="relative mx-auto max-w-3xl h-40">
            {/* white keys */}
            <div className="absolute inset-0 flex gap-0.5">
              {WHITE_OFFSETS.map((off) => {
                const midi = screenBase + off;
                const isHeld = heldMidis.includes(midi);
                return (
                  <button
                    key={off}
                    onPointerDown={onKeyDownScreen(midi)}
                    onPointerUp={onKeyUpScreen(midi)}
                    onPointerLeave={onKeyUpScreen(midi)}
                    onPointerCancel={onKeyUpScreen(midi)}
                    className={`flex-1 rounded-b-md border border-black/40 flex items-end justify-center pb-2 text-xs transition-colors ${
                      isHeld
                        ? "bg-violet-300 text-black"
                        : "bg-white/90 text-black/60 hover:bg-white"
                    }`}
                    style={{ minWidth: 44, touchAction: "none" }}
                  >
                    {noteName(midi)}
                  </button>
                );
              })}
            </div>
            {/* black keys */}
            <div className="absolute inset-0 pointer-events-none">
              {BLACK_SPEC.map((b) => {
                const midi = screenBase + b.offset;
                const isHeld = heldMidis.includes(midi);
                const leftPct =
                  ((b.afterWhite + 1) / WHITE_OFFSETS.length) * 100;
                return (
                  <button
                    key={b.offset}
                    onPointerDown={onKeyDownScreen(midi)}
                    onPointerUp={onKeyUpScreen(midi)}
                    onPointerLeave={onKeyUpScreen(midi)}
                    onPointerCancel={onKeyUpScreen(midi)}
                    className={`absolute top-0 h-24 rounded-b-md border border-black/60 pointer-events-auto transition-colors ${
                      isHeld ? "bg-violet-400" : "bg-black hover:bg-zinc-800"
                    }`}
                    style={{
                      left: `calc(${leftPct}% - 14px)`,
                      width: 28,
                      minWidth: 28,
                      touchAction: "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <p className="text-center text-xs text-white/55 mt-2">
            QWERTY: a w s e d f t g y h u j k o l p ;  ·  z / x = octave
          </p>
        </section>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-lg max-h-[80vh] overflow-y-auto bg-[#0c1018] border border-white/15 rounded-2xl p-6 text-base text-white/85 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-base"
              >
                Close
              </button>
            </div>
            <p>
              A <strong>harmonograph</strong> (Hugh Blackburn pendulum apparatus,
              ~1840s) traces a curve from decaying pendulums. Here each held note
              is a pendulum whose frequency ratio is taken against the lowest
              note. Consonant chords yield small-integer ratios → a near-closed,
              clean figure; equal-temperament ratios are irrational → the line
              drifts and tangles. The shapes are kin to{" "}
              <strong>Lissajous figures</strong> (Jules Antoine Lissajous, 1857).
            </p>
            <p>
              Toggling <strong>Pure tuning</strong> snaps every ratio to the
              nearest just interval, for both the synth pitch and the drawn
              geometry — so the beating audibly settles as the figure visibly
              tidies, at the same instant.
            </p>
            <p className="text-white/65">
              Input: Web MIDI / computer keyboard / on-screen piano. Output: a raw
              WebGL2 line-strip ink trail. Web MIDI exists elsewhere in this lab;
              the novel idea here is harmony-as-visible-geometry. See the folder
              README.md for full notes and future directions.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
