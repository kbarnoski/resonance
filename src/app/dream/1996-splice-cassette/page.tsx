"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1996-splice-cassette — "SPLICE-96" · pole: dream
//
// THE ONE QUESTION: what if composing WAS editing — a live looper where you can
// OVERWRITE, cut, re-time and FRACTURE what you already played, and the past keeps
// RE-VOICING ITSELF as a modal scale slowly drifts underneath it?
//
// Notes are stored as scale DEGREES, not frozen frequencies (harmony.ts), so a
// phrase recorded a minute ago changes colour on its own as the mode turns. The
// edit grammar (looper.ts) makes memory CONSEQUENTIAL: record → destructive
// overwrite → cut → shift → fracture. Everything is drawn as SVG DOM — a tape strip
// with note events, a moving playhead, splice marks. A look-ahead scheduler off the
// AudioContext clock (audio.ts) plays it; rAF only moves the playhead you see.
//
// SELF-DEMO: a deterministic seeded "ghost performer" auto-drives the whole grammar
// with zero input; real MIDI/keyboard takes over instantly and the ghost re-arms
// after ~15 s idle. Reference: NIME 2026 "Loop Fracture Loop" (Kiefer & Accorsi).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createEngine, type SpliceEngine } from "./audio";
import { degreeToFreq, degreeToSemis, modeAt, MODE_LAP, SECONDS_PER_MODE, mulberry32 } from "./harmony";
import {
  applyCut,
  applyFracture,
  applyOverwrite,
  applyPunch,
  applyShift,
  chunkBoundaries,
  fractureOrder,
  LOOP,
  makeNote,
  type NoteEvent,
} from "./looper";

type Phase = "idle" | "running" | "error";

const SEED = 0x1996ca55; // constant → the ghost performance is reproducible
const NOTE_DUR = 0.34;
const SEL_W = 1.8; // width of the edit region, seconds
const FRACTURE_N = 4;
const GHOST_IDLE = 15; // seconds of no input before the ghost re-arms

// QWERTY row → [degree, octave]. The "instrument".
const NOTE_KEYS: Record<string, [number, number]> = {
  a: [0, 0], s: [1, 0], d: [2, 0], f: [3, 0],
  g: [4, 0], h: [5, 0], j: [6, 0], k: [0, 1],
};

// ── SVG art palette (magnetic tape / ferric oxide / bone). Raw hex is fine here. ──
const ART = {
  shell: "#241a12",
  shellEdge: "#5c4326",
  bone: "#e7dcc4",
  boneDim: "#cdbf9e",
  tape: "#2c2018",
  amber: "#d8933a",
  amberBright: "#f0b45c",
  ferric: "#b5651d",
  splice: "#c0432e",
  reel: "#1a120b",
  reelHub: "#7a5a34",
  ink: "#3a2a1e",
};

const LX0 = 80;
const LX1 = 920;
const LTOP = 402;
const LBOT = 560;
const PITCH_MAX = 24;

function xOfT(t: number): number {
  return LX0 + (t / LOOP) * (LX1 - LX0);
}
function yOfSemis(semis: number): number {
  const s = Math.max(0, Math.min(PITCH_MAX, semis));
  return LBOT - (s / PITCH_MAX) * (LBOT - LTOP - 14) - 9;
}
function noteFill(semis: number): string {
  // warm amber; brighter as pitch rises. Position AND colour shift as mode drifts.
  const l = 34 + (Math.max(0, Math.min(PITCH_MAX, semis)) / PITCH_MAX) * 34;
  return `hsl(32 62% ${l}%)`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface GhostStep {
  at: number;
  done: boolean;
  label: string;
  run: () => void;
}
interface Ghost {
  base: number;
  active: boolean;
  steps: GhostStep[];
}

export default function SpliceCassettePage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<SpliceEngine | null>(null);
  const notesRef = useRef<NoteEvent[]>([]);
  const rafRef = useRef<number>(0);
  const ghostRef = useRef<Ghost | null>(null);
  const lastInputRef = useRef<number>(0);
  const overwriteRef = useRef<boolean>(false);
  const recordRef = useRef<boolean>(false);
  const selCenterRef = useRef<number>(LOOP / 2);
  const midiRef = useRef<{ inputs: Iterable<MidiInput>; onstatechange: (() => void) | null } | null>(null);
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [notes, setNotes] = useState<NoteEvent[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [modeName, setModeName] = useState("Dorian");
  const [modeFrac, setModeFrac] = useState(0);
  const [selCenter, setSelCenter] = useState(LOOP / 2);
  const [recording, setRecording] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [splices, setSplices] = useState<number[]>([]);
  const [ghostLabel, setGhostLabel] = useState("");
  const [ghostOn, setGhostOn] = useState(true);
  const [midiText, setMidiText] = useState("");
  const [midiErr, setMidiErr] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Keep the scheduler's note mirror in sync with React state.
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);
  useEffect(() => {
    selCenterRef.current = selCenter;
  }, [selCenter]);

  const region = (): [number, number] => {
    const a = clamp(selCenterRef.current - SEL_W / 2, 0, LOOP - SEL_W);
    return [a, a + SEL_W];
  };

  const markInput = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    lastInputRef.current = eng.elapsed();
    if (ghostRef.current?.active) {
      ghostRef.current.active = false;
      setGhostOn(false);
      setGhostLabel("");
    }
  }, []);

  // ── Play a scale degree now; record it into the loop if armed ───────────────
  const playDegree = useCallback(
    (degree: number, octave: number, vel: number, src: "ghost" | "user") => {
      const eng = engineRef.current;
      if (!eng) return;
      const mi = modeAt(eng.elapsed()).index;
      eng.playFreq(degreeToFreq(degree, octave, mi), eng.now() + 0.005, NOTE_DUR, vel);
      if (src === "user") {
        markInput();
        if (recordRef.current || overwriteRef.current) {
          const t = eng.loopPhase() * LOOP;
          const nn = makeNote(t, NOTE_DUR, degree, octave, vel, "user");
          setNotes((prev) =>
            overwriteRef.current ? [...applyPunch(prev, t, 0.28), nn] : [...prev, nn],
          );
        }
      }
    },
    [markInput],
  );

  // ── Edit gestures (buttons + keys), each operating on the edit region ───────
  const doCut = useCallback(() => {
    const [a, b] = region();
    setNotes((prev) => applyCut(prev, a, b));
    setSplices([a, b]);
    markInput();
  }, [markInput]);

  const doShift = useCallback(() => {
    const [a, b] = region();
    setNotes((prev) => applyShift(prev, a, b, 1.0));
    setSplices([a, b, clamp(b + 1.0, 0, LOOP)]);
    markInput();
  }, [markInput]);

  const doFracture = useCallback(() => {
    const order = fractureOrder(mulberry32(SEED ^ 0x9e37), FRACTURE_N);
    setNotes((prev) => applyFracture(prev, order));
    setSplices(chunkBoundaries(FRACTURE_N));
    markInput();
  }, [markInput]);

  const toggleRecord = useCallback(() => {
    recordRef.current = !recordRef.current;
    setRecording(recordRef.current);
    if (!recordRef.current) {
      overwriteRef.current = false;
      setOverwrite(false);
    }
    markInput();
  }, [markInput]);

  const toggleOverwrite = useCallback(() => {
    const next = !overwriteRef.current;
    overwriteRef.current = next;
    setOverwrite(next);
    recordRef.current = next;
    setRecording(next);
    const [a, b] = region();
    setSplices(next ? [a, b] : []);
    markInput();
  }, [markInput]);

  // ── The deterministic ghost performer — the whole grammar, zero input ───────
  const armGhost = useCallback(
    (base: number) => {
      const prng = mulberry32(SEED);
      setNotes([]);
      setSplices([]);
      overwriteRef.current = false;
      recordRef.current = false;
      setOverwrite(false);
      setRecording(false);

      const steps: GhostStep[] = [];

      // 1) RECORD a short phrase — hits land at their loop position on the first lap.
      const hits = [0.15, 0.6, 1.15, 1.7, 2.3, 2.9, 3.5];
      for (const at of hits) {
        const degree = Math.floor(prng() * 7);
        const octave = prng() < 0.22 ? 1 : 0;
        const vel = 0.55 + prng() * 0.3;
        steps.push({
          at,
          done: false,
          label: "recording phrase",
          run: () => {
            const eng = engineRef.current!;
            eng.playFreq(
              degreeToFreq(degree, octave, modeAt(eng.elapsed()).index),
              eng.now() + 0.005,
              NOTE_DUR,
              vel,
            );
            setNotes((prev) => [...prev, makeNote(at, NOTE_DUR, degree, octave, vel, "ghost")]);
          },
        });
      }

      // 2) DESTRUCTIVE OVERWRITE — replace the events in [1.2, 3.0) with new ones.
      steps.push({
        at: 8.6,
        done: false,
        label: "destructive overwrite",
        run: () => {
          const a = 1.2;
          const b = 3.0;
          const inc: NoteEvent[] = [];
          for (const off of [0.15, 0.75, 1.35]) {
            const degree = Math.floor(prng() * 7);
            const octave = prng() < 0.3 ? 1 : 0;
            inc.push(makeNote(a + off, NOTE_DUR, degree, octave, 0.7, "ghost"));
          }
          setNotes((prev) => applyOverwrite(prev, a, b, inc));
          setSplices([a, b]);
        },
      });

      // 3) CUT — the loop audibly loses its tail.
      steps.push({
        at: 12.4,
        done: false,
        label: "cut a slice",
        run: () => {
          setNotes((prev) => applyCut(prev, 3.0, 4.4));
          setSplices([3.0, 4.4]);
        },
      });

      // 4) FRACTURE — chop into 4 and re-order; the phrase comes back tumbled.
      steps.push({
        at: 15.2,
        done: false,
        label: "fracture + re-order",
        run: () => {
          const order = fractureOrder(prng, FRACTURE_N);
          setNotes((prev) => applyFracture(prev, order));
          setSplices(chunkBoundaries(FRACTURE_N));
        },
      });

      // 5) let it be — the mode drifts and the same events re-voice themselves.
      steps.push({
        at: 18.0,
        done: false,
        label: "let the mode drift — same phrase, new colour",
        run: () => {},
      });

      ghostRef.current = { base, active: true, steps };
      setGhostOn(true);
    },
    [],
  );

  const runGhost = useCallback(
    (e: number) => {
      const g = ghostRef.current;
      if (!g) return;
      if (!g.active) {
        if (e - lastInputRef.current > GHOST_IDLE) armGhost(e);
        return;
      }
      const rel = e - g.base;
      for (const step of g.steps) {
        if (!step.done && rel >= step.at) {
          step.done = true;
          step.run();
          setGhostLabel(step.label);
        }
      }
      if (rel > 34) armGhost(e); // loop the demo when unattended
    },
    [armGhost],
  );

  // ── MIDI (graceful degradation) ─────────────────────────────────────────────
  const initMidi = useCallback(async () => {
    const req = (navigator as unknown as {
      requestMIDIAccess?: () => Promise<MidiAccess>;
    }).requestMIDIAccess;
    if (!req) {
      setMidiErr(true);
      setMidiText("No Web MIDI in this browser — computer keyboard is active.");
      return;
    }
    try {
      const access = await req.call(navigator);
      const onMsg = (ev: MidiMessage) => {
        const [status, note, velByte] = ev.data;
        if ((status & 0xf0) === 0x90 && velByte > 0) {
          const step = note - 60;
          const degree = ((step % 7) + 7) % 7;
          const octave = Math.floor(step / 7);
          playDegree(degree, octave, 0.2 + (velByte / 127) * 0.75, "user");
        }
      };
      const attach = () => {
        for (const inp of access.inputs.values()) inp.onmidimessage = onMsg;
      };
      attach();
      access.onstatechange = attach;
      midiRef.current = { inputs: access.inputs.values(), onstatechange: null };
      const count = access.inputs.size;
      setMidiErr(false);
      setMidiText(
        count > 0
          ? `${count} MIDI device${count > 1 ? "s" : ""} connected — play away.`
          : "Web MIDI ready — connect a device, or use the keyboard.",
      );
    } catch {
      setMidiErr(true);
      setMidiText("Web MIDI blocked — computer keyboard is active.");
    }
  }, [playDegree]);

  // ── Begin: first AudioContext inside the user gesture ───────────────────────
  const begin = useCallback(async () => {
    if (phase === "running") return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;

      const engine = createEngine(
        ctx,
        () => notesRef.current,
        (n, el) => degreeToFreq(n.degree, n.octave, modeAt(el).index),
      );
      engineRef.current = engine;

      setPhase("running");
      lastInputRef.current = -GHOST_IDLE;
      armGhost(0);
      void initMidi();

      const onKey = (e: KeyboardEvent) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        if (k in NOTE_KEYS) {
          const [deg, oct] = NOTE_KEYS[k];
          playDegree(deg, oct, 0.8, "user");
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          toggleRecord();
        } else if (k === "o" || e.key === "1") {
          toggleOverwrite();
        } else if (k === "x" || e.key === "2") {
          doCut();
        } else if (e.key === "3") {
          doShift();
        } else if (e.key === "4" || k === "z") {
          doFracture();
        } else if (e.key === "ArrowLeft") {
          setSelCenter((c) => clamp(c - 0.5, SEL_W / 2, LOOP - SEL_W / 2));
          markInput();
        } else if (e.key === "ArrowRight") {
          setSelCenter((c) => clamp(c + 0.5, SEL_W / 2, LOOP - SEL_W / 2));
          markInput();
        }
      };
      keyHandlerRef.current = onKey;
      window.addEventListener("keydown", onKey);

      const frame = () => {
        const eng = engineRef.current;
        if (eng) {
          const el = eng.elapsed();
          setPlayhead(eng.loopPhase());
          setElapsed(el);
          const m = modeAt(el);
          setModeName(m.name);
          setModeFrac(m.frac);
          runGhost(el);
        }
        rafRef.current = requestAnimationFrame(frame);
      };
      rafRef.current = requestAnimationFrame(frame);
    } catch {
      setPhase("error");
    }
  }, [phase, armGhost, initMidi, playDegree, runGhost, toggleRecord, toggleOverwrite, doCut, doShift, doFracture, markInput]);

  // ── Full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (keyHandlerRef.current) window.removeEventListener("keydown", keyHandlerRef.current);
      const midi = midiRef.current;
      if (midi) {
        for (const inp of midi.inputs) inp.onmidimessage = null;
      }
      engineRef.current?.stop();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const laneClick = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = clamp(((e.clientX - r.left) / r.width) * LOOP, SEL_W / 2, LOOP - SEL_W / 2);
    setSelCenter(t);
    markInput();
  };

  const modeIndexNow = modeAt(elapsed).index;
  const [selA, selB] = (() => {
    const a = clamp(selCenter - SEL_W / 2, 0, LOOP - SEL_W);
    return [a, a + SEL_W];
  })();
  const reelAngle = elapsed * 90;
  const lapFrac = ((elapsed % MODE_LAP) / MODE_LAP) * 100;

  const editBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const editBtnOn =
    "min-h-[44px] rounded-md border border-primary bg-primary/15 px-4 text-sm text-foreground transition-colors";

  return (
    <main className="relative min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · editable-memory looper
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">SPLICE-96</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            A live looper where composing <em>is</em> editing. Record a phrase, then overwrite,
            cut, re-time or <strong className="text-foreground">fracture</strong> it — while a modal
            scale drifts underneath, so notes you stored as scale <em>degrees</em> quietly
            re-voice themselves.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-lg border border-border bg-[#140d08]">
          <svg viewBox="0 0 1000 600" className="block w-full" role="img" aria-label="Cassette tape looper">
            <defs>
              <linearGradient id="mode-band" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={ART.ferric} stopOpacity="0.15" />
                <stop offset={`${lapFrac}%`} stopColor={ART.amberBright} stopOpacity="0.5" />
                <stop offset="100%" stopColor={ART.ferric} stopOpacity="0.15" />
              </linearGradient>
            </defs>

            {/* ── Cassette shell ── */}
            <rect x="60" y="40" width="880" height="300" rx="18" fill={ART.shell} stroke={ART.shellEdge} strokeWidth="2" />
            <rect x="92" y="70" width="816" height="150" rx="10" fill={ART.tape} stroke={ART.shellEdge} strokeWidth="1.5" />

            {/* label plate */}
            <rect x="330" y="86" width="340" height="46" rx="6" fill={ART.bone} />
            <text x="500" y="115" textAnchor="middle" fontFamily="monospace" fontSize="22" letterSpacing="6" fill={ART.ink}>
              SPLICE·96
            </text>

            {/* two reels */}
            {[
              { cx: 300, full: true },
              { cx: 700, full: false },
            ].map((reel) => (
              <g key={reel.cx} transform={`rotate(${reel.cx === 300 ? reelAngle : -reelAngle} ${reel.cx} 175)`}>
                <circle cx={reel.cx} cy={175} r="66" fill={ART.reel} stroke={ART.shellEdge} strokeWidth="2" />
                <circle cx={reel.cx} cy={175} r={reel.full ? 54 : 30} fill="none" stroke={ART.ferric} strokeWidth={reel.full ? 20 : 8} opacity="0.55" />
                <circle cx={reel.cx} cy={175} r="22" fill={ART.reelHub} />
                {[0, 60, 120, 180, 240, 300].map((a) => {
                  const rad = (a * Math.PI) / 180;
                  return (
                    <line
                      key={a}
                      x1={reel.cx + Math.cos(rad) * 10}
                      y1={175 + Math.sin(rad) * 10}
                      x2={reel.cx + Math.cos(rad) * 22}
                      y2={175 + Math.sin(rad) * 22}
                      stroke={ART.reel}
                      strokeWidth="3"
                    />
                  );
                })}
              </g>
            ))}
            <line x1="366" y1="188" x2="634" y2="188" stroke={ART.ferric} strokeWidth="3" opacity="0.7" />

            {/* mode readout on the shell */}
            <text x="92" y="258" fontFamily="monospace" fontSize="15" letterSpacing="3" fill={ART.bone}>
              MODE
            </text>
            <text x="92" y="286" fontFamily="monospace" fontSize="26" letterSpacing="2" fill={ART.amberBright}>
              {modeName.toUpperCase()}
            </text>
            <text x="908" y="258" textAnchor="end" fontFamily="monospace" fontSize="13" letterSpacing="2" fill={ART.boneDim}>
              DRIFT
            </text>
            <rect x="720" y="272" width="188" height="8" rx="4" fill={ART.tape} stroke={ART.shellEdge} />
            <rect x="720" y="272" width={188 * modeFrac} height="8" rx="4" fill={ART.amber} />
            <rect x="92" y="300" width="816" height="14" rx="6" fill="url(#mode-band)" />

            {/* ── The editable tape strip (the loop, unrolled) ── */}
            <rect x={LX0 - 8} y={LTOP - 12} width={LX1 - LX0 + 16} height={LBOT - LTOP + 24} rx="8" fill="#0d0906" stroke={ART.shellEdge} strokeWidth="1.5" />
            <text x={LX0} y={LTOP - 20} fontFamily="monospace" fontSize="12" letterSpacing="3" fill={ART.boneDim}>
              TAPE — {LOOP.toFixed(0)}s LOOP
            </text>

            {/* beat gridlines */}
            {Array.from({ length: LOOP + 1 }, (_, i) => (
              <line key={i} x1={xOfT(i)} y1={LTOP} x2={xOfT(i)} y2={LBOT} stroke={ART.shellEdge} strokeWidth="1" opacity="0.35" />
            ))}

            {/* clickable lane to place the edit region */}
            <rect x={LX0} y={LTOP} width={LX1 - LX0} height={LBOT - LTOP} fill="transparent" style={{ cursor: "crosshair" }} onPointerDown={laneClick} />

            {/* edit region */}
            <rect
              x={xOfT(selA)}
              y={LTOP}
              width={xOfT(selB) - xOfT(selA)}
              height={LBOT - LTOP}
              fill={overwrite ? "rgba(192,67,46,0.20)" : "rgba(216,147,58,0.10)"}
              stroke={overwrite ? ART.splice : ART.amber}
              strokeDasharray="5 4"
              strokeWidth="1.5"
              pointerEvents="none"
            />
            <text x={(xOfT(selA) + xOfT(selB)) / 2} y={LTOP + 16} textAnchor="middle" fontFamily="monospace" fontSize="11" letterSpacing="2" fill={overwrite ? ART.splice : ART.amber} pointerEvents="none">
              {overwrite ? "OVERWRITE" : "EDIT REGION"}
            </text>

            {/* splice marks */}
            {splices.map((m, i) => (
              <line key={i} x1={xOfT(m)} y1={LTOP} x2={xOfT(m)} y2={LBOT} stroke={ART.splice} strokeWidth="2" strokeDasharray="3 3" pointerEvents="none" />
            ))}

            {/* note events — y AND colour resolve through the CURRENT mode → re-voicing */}
            {notes.map((n) => {
              const semis = degreeToSemis(n.degree, n.octave, modeIndexNow);
              const w = Math.max(5, (n.dur / LOOP) * (LX1 - LX0));
              return (
                <rect
                  key={n.id}
                  x={xOfT(n.t)}
                  y={yOfSemis(semis)}
                  width={w}
                  height="11"
                  rx="3"
                  fill={noteFill(semis)}
                  stroke={n.src === "ghost" ? ART.amberBright : ART.bone}
                  strokeWidth="0.75"
                  opacity={0.55 + n.vel * 0.45}
                  pointerEvents="none"
                />
              );
            })}

            {/* playhead */}
            {phase === "running" && (
              <g pointerEvents="none">
                <line x1={xOfT(playhead * LOOP)} y1={LTOP - 6} x2={xOfT(playhead * LOOP)} y2={LBOT + 6} stroke={ART.amberBright} strokeWidth="2" />
                <path d={`M ${xOfT(playhead * LOOP) - 6} ${LTOP - 6} L ${xOfT(playhead * LOOP) + 6} ${LTOP - 6} L ${xOfT(playhead * LOOP)} ${LTOP + 4} Z`} fill={ART.amberBright} />
                {recording && <circle cx={xOfT(playhead * LOOP)} cy={LTOP - 14} r="5" fill={ART.splice} />}
              </g>
            )}

            {/* idle hero overlay — never blank */}
            {phase !== "running" && (
              <g>
                <rect x="0" y="0" width="1000" height="600" fill="#140d08" opacity="0.55" />
                <text x="500" y="470" textAnchor="middle" fontFamily="monospace" fontSize="16" letterSpacing="4" fill={ART.boneDim}>
                  {phase === "error" ? "AUDIO UNAVAILABLE" : "PRESS BEGIN — THE GHOST WILL PLAY ITSELF"}
                </text>
              </g>
            )}
          </svg>

          {/* ghost / mode caption */}
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 font-mono text-xs">
            {ghostOn && phase === "running" && (
              <span className="rounded-full bg-primary/20 px-2 py-1 text-primary">ghost ▸ {ghostLabel || "listening"}</span>
            )}
            {!ghostOn && phase === "running" && (
              <span className="rounded-full bg-accent px-2 py-1 text-muted-foreground">you have the tape</span>
            )}
          </div>
        </div>

        {/* ── Controls ── */}
        {phase !== "running" ? (
          <div className="flex flex-col items-start gap-3">
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="text-sm text-muted-foreground">
              Sound and motion start immediately. A seeded ghost performer records, overwrites, cuts
              and fractures a phrase on its own — take over any time with MIDI or the keyboard.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={toggleRecord} className={recording && !overwrite ? editBtnOn : editBtn}>
                {recording && !overwrite ? "● Recording" : "Record"} <span className="opacity-50">(space)</span>
              </button>
              <button onClick={toggleOverwrite} className={overwrite ? editBtnOn : editBtn}>
                Overwrite <span className="opacity-50">(o)</span>
              </button>
              <button onClick={doCut} className={editBtn}>
                Cut slice <span className="opacity-50">(x)</span>
              </button>
              <button onClick={doShift} className={editBtn}>
                Shift slice <span className="opacity-50">(3)</span>
              </button>
              <button onClick={doFracture} className={editBtn}>
                Fracture <span className="opacity-50">(z)</span>
              </button>
              <button
                onClick={() => {
                  setSelCenter((c) => clamp(c - 0.5, SEL_W / 2, LOOP - SEL_W / 2));
                  markInput();
                }}
                className={editBtn}
              >
                ◀ region
              </button>
              <button
                onClick={() => {
                  setSelCenter((c) => clamp(c + 0.5, SEL_W / 2, LOOP - SEL_W / 2));
                  markInput();
                }}
                className={editBtn}
              >
                region ▶
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Play scale degrees with <span className="font-mono text-foreground">a s d f g h j k</span>.
              Turn on <strong className="text-foreground">Record</strong> to loop what you play;
              <strong className="text-foreground"> Overwrite</strong> destructively replaces notes as you
              play over the region. Click the tape to move the edit region.
            </p>
            <p className={`text-sm ${midiErr ? "text-destructive" : "text-muted-foreground"}`}>
              {midiText || "Requesting MIDI…"}
            </p>
          </div>
        )}
      </div>

      {/* design-notes corner toggle */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed right-4 top-4 z-30 rounded-md border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight">SPLICE-96 — design notes</h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The question.</strong> What if composing <em>was</em>{" "}
                editing? Most loopers only add layers. Here the past is consequential: you can overwrite,
                cut, re-time and fracture what you already played.
              </p>
              <p>
                <strong className="text-foreground">Notes are degrees, not frozen frequencies.</strong>{" "}
                Each event stores a scale degree (0–6) + octave. A modal scale drifts underneath —
                Dorian → Phrygian → Lydian → … → Ionian, one lap ≈ {MODE_LAP}s (a mode every{" "}
                {SECONDS_PER_MODE}s). So a phrase recorded a minute ago <em>re-voices itself</em>: the
                same fingering, a new colour. Watch the notes slide vertically and change hue when the
                mode steps.
              </p>
              <p>
                <strong className="text-foreground">Editable-memory grammar.</strong> Record → destructive
                overwrite → cut → shift → fracture. A look-ahead scheduler off the AudioContext clock
                (~100 ms) plays it precisely; the playhead you see is a separate rAF read.
              </p>
              <p>
                <strong className="text-foreground">Self-demo.</strong> A deterministic seeded ghost
                performer drives the whole grammar with zero input, then re-arms after ~15 s idle. Real
                MIDI / keyboard takes over instantly. No Web MIDI still leaves the keyboard fully live.
              </p>
              <p>
                <strong className="text-foreground">Lineage.</strong> NIME 2026 <em>&ldquo;Loop Fracture
                Loop&rdquo;</em> (Chris Kiefer &amp; Betty Accorsi, London, June 2026) and the Living Looper
                (Shafer / Magnusson) — the loop reframed from verbatim replay to fracturable,
                self-transforming performance memory.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1996-splice-cassette"]} />
    </main>
  );
}

// ── Minimal Web MIDI typings (avoid `any`, avoid extra deps) ──────────────────
interface MidiMessage {
  data: Uint8Array;
}
interface MidiInput {
  onmidimessage: ((e: MidiMessage) => void) | null;
}
interface MidiInputMap {
  values(): IterableIterator<MidiInput>;
  size: number;
}
interface MidiAccess {
  inputs: MidiInputMap;
  onstatechange: (() => void) | null;
}
