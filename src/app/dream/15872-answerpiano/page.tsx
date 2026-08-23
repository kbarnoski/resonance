"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15872 · Answer Piano — Karel's own recording performs a live counter-line on
// YOUR hardware synth, out through Web MIDI.
//
//   ONE QUESTION
//   What if Karel's own recording performed a live counter-line on YOUR hardware
//   synth?
//
//   His REAL decoded piano is the ONLY audible sound (routed through the ear-
//   safety master). As it plays, a knowledge-based accompaniment compiler reads
//   his chords + notes and, in real time, EMITS a harmonized MIDI counter-voice
//   OUT through the Web MIDI OUTPUT to whatever synth/DAW the visitor has
//   connected — so the visitor's own hardware answers Karel's piano.
//
//   This is the lab's FIRST piece that EMITS MIDI. A prior piece took MIDI *in*;
//   none has ever sent MIDI *out*. The counter-line is MIDI DATA ONLY — it is
//   NEVER synthesised to audio inside the page (Rule 10).
//
//   INPUT / subsystem   Web MIDI OUTPUT — navigator.requestMIDIAccess() →
//                       iterate access.outputs → output.send([status,note,vel]).
//   OUTPUT surface      inline-SVG dual piano-roll: his real notes descend from
//                       the top toward a central NOW line; your emitted MIDI
//                       counter-line rises from the bottom to meet it there.
//                       SVG DOM only — no shader / three.js / WebGL.
//   TECHNIQUE           knowledge-based chord→MIDI accompaniment compiler +
//                       real-time causal Web MIDI scheduling.
//   PALETTE             warm chromatic, notes coloured by pitch-class.
//
//   Named reference (see README): MazzikaAI (arXiv:2608.10360) — a knowledge-
//   based performance-to-prompt compiler for real-time accompaniment, subsecond
//   and causal. Same shape here, except the actuator is Web MIDI to real
//   hardware, not a neural model. Corroborating: LiveBand (arXiv:2606.03803).
//
//   No device connected? The piece STILL plays his take and STILL animates the
//   full dual roll (his notes + the would-be counter-line as dashed GHOST notes),
//   with an on-brand notice. ZERO audio is synthesised in that state.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REAL_TRACKS,
  loadRealTrackBuffer,
  type WelcomeHomeTrack,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  pitchClassHue,
  type TrackAnalysis,
  type TrackNote,
  type TrackChord,
} from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── minimal, local Web MIDI types (do NOT rely on @types/webmidi) ────────────
interface MidiOut {
  id: string;
  name?: string | null;
  send(data: number[], timestamp?: number): void;
}
interface MidiOutputsMap {
  forEach(cb: (out: MidiOut) => void): void;
}
interface MidiAccessLike {
  outputs: MidiOutputsMap;
  onstatechange: ((e: unknown) => void) | null;
}
type RequestMidi = (opts?: { sysex?: boolean }) => Promise<MidiAccessLike>;

// ── voicings the compiler knows how to speak ─────────────────────────────────
type Voicing = "thirds" | "sixths" | "pad" | "bass" | "arp";
const VOICINGS: { id: Voicing; label: string; blurb: string }[] = [
  { id: "thirds", label: "Thirds", blurb: "a harmony a third above his line" },
  { id: "sixths", label: "Sixths", blurb: "a warmer sixth above his line" },
  { id: "pad", label: "Pad", blurb: "sustained chord tones underneath" },
  { id: "bass", label: "Bass", blurb: "root & fifth an octave down" },
  { id: "arp", label: "Arpeggio", blurb: "sparse chord tones, one at a time" },
];

const DEFAULT_TRACK_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad"; // "Bath"

// ── SVG geometry ─────────────────────────────────────────────────────────────
const VIEW_W = 1000;
const VIEW_H = 560;
const PAD_X = 34;
const CENTER_Y = 280;
const PPS = 46; // pixels per second of scroll
const LO_MIDI = 21;
const HI_MIDI = 108;
const KEY_W = (VIEW_W - 2 * PAD_X) / (HI_MIDI - LO_MIDI);
const WIN_S = CENTER_Y / PPS; // seconds visible each side of NOW (~6.1s)
const SVG_NS = "http://www.w3.org/2000/svg";
const LEAD_S = 0.14; // small causal look-ahead for the counter-line

function xForMidi(m: number): number {
  const c = Math.max(LO_MIDI, Math.min(HI_MIDI, m));
  return PAD_X + ((c - LO_MIDI) / (HI_MIDI - LO_MIDI)) * (VIEW_W - 2 * PAD_X);
}

// One emitted counter-note, on the "ours" (lower) lane.
interface OurNote {
  id: number;
  midi: number;
  pc: number;
  onsetT: number; // seconds into the take when it sounds / touches NOW
  dur: number;
  vel: number;
  ghost: boolean; // true when no device — drawn dashed, never sent
}

interface Readout {
  chord: string;
  playheadSec: number;
  totalSec: number;
  emitted: number;
  device: string;
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
const clampMidi = (m: number) => Math.max(0, Math.min(127, Math.round(m)));

// Smallest midi >= base whose pitch-class is in `pcs`.
function snapToChordToneAbove(base: number, pcs: number[]): number {
  let m = Math.ceil(base);
  for (let i = 0; i < 48; i++) {
    if (pcs.includes(((m % 12) + 12) % 12)) return m;
    m++;
  }
  return clampMidi(base);
}

export default function AnswerPianoPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(
    REAL_TRACKS.some((t) => t.id === DEFAULT_TRACK_ID) ? DEFAULT_TRACK_ID : REAL_TRACKS[0].id,
  );
  const [title, setTitle] = useState<string>(
    REAL_TRACKS.find((t) => t.id === DEFAULT_TRACK_ID)?.title ?? REAL_TRACKS[0].title,
  );
  const [voicing, setVoicing] = useState<Voicing>("thirds");
  const [density, setDensity] = useState<number>(0.42);
  const [transpose, setTranspose] = useState<number>(0);

  const [midiSupported, setMidiSupported] = useState<boolean>(true);
  const [outputs, setOutputs] = useState<{ id: string; name: string }[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [analysisMissing, setAnalysisMissing] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [readout, setReadout] = useState<Readout>({
    chord: "—",
    playheadSec: 0,
    totalSec: 0,
    emitted: 0,
    device: "—",
  });

  // ── mutable audio / midi / loop state (refs, never in render deps) ──
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const notesRef = useRef<TrackNote[]>([]);
  const chordsRef = useRef<TrackChord[]>([]);
  const tempoRef = useRef<number>(92);
  const hisLoRef = useRef<number>(0);
  const chordPtrRef = useRef<number>(0);

  const emittedRef = useRef<OurNote[]>([]);
  const emitSeqRef = useRef<number>(0);
  const emitCountRef = useRef<number>(0);
  const lastEmitRef = useRef<number>(-10);
  const arpIdxRef = useRef<number>(0);

  const midiAccessRef = useRef<MidiAccessLike | null>(null);
  const outputMapRef = useRef<Map<string, MidiOut>>(new Map());
  const outputRef = useRef<MidiOut | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const readoutClockRef = useRef<number>(0);

  const svgGroupRef = useRef<SVGGElement | null>(null);

  // controls read live inside the loop
  const voicingRef = useRef<Voicing>(voicing);
  const densityRef = useRef<number>(density);
  const transposeRef = useRef<number>(transpose);
  useEffect(() => void (voicingRef.current = voicing), [voicing]);
  useEffect(() => void (densityRef.current = density), [density]);
  useEffect(() => void (transposeRef.current = transpose), [transpose]);

  // keep the live selected-output ref in sync with the picker
  useEffect(() => {
    selectedIdRef.current = selectedOutputId;
    outputRef.current = selectedOutputId
      ? outputMapRef.current.get(selectedOutputId) ?? null
      : null;
  }, [selectedOutputId, outputs]);

  const titleForId = useCallback(
    (id: string) => REAL_TRACKS.find((t) => t.id === id)?.title ?? "Welcome Home",
    [],
  );

  // ── MIDI panic: silence anything we may have started on the device ──
  const allNotesOff = useCallback(() => {
    const out = outputRef.current;
    if (!out) return;
    try {
      out.send([0xb0, 120, 0]); // all sound off
      out.send([0xb0, 123, 0]); // all notes off
    } catch {
      /* device vanished */
    }
  }, []);

  // ── enumerate outputs from a granted MIDIAccess ──
  const refreshOutputs = useCallback((access: MidiAccessLike) => {
    const map = new Map<string, MidiOut>();
    const list: { id: string; name: string }[] = [];
    try {
      access.outputs.forEach((o) => {
        map.set(o.id, o);
        list.push({ id: o.id, name: o.name ?? "MIDI output" });
      });
    } catch {
      /* ignore */
    }
    outputMapRef.current = map;
    setOutputs(list);
    setSelectedOutputId((prev) => {
      if (prev && map.has(prev)) return prev;
      return list.length > 0 ? list[0].id : null;
    });
  }, []);

  // ── request Web MIDI access on mount (no gesture required) ──
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as unknown as { requestMIDIAccess?: RequestMidi };
    if (typeof nav.requestMIDIAccess !== "function") {
      setMidiSupported(false);
      return;
    }
    nav
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return;
        midiAccessRef.current = access;
        refreshOutputs(access);
        access.onstatechange = () => refreshOutputs(access);
      })
      .catch(() => {
        if (!cancelled) setMidiSupported(false);
      });
    return () => {
      cancelled = true;
      const a = midiAccessRef.current;
      if (a) a.onstatechange = null;
    };
  }, [refreshOutputs]);

  // ── the knowledge-based compiler: chord/melody → counter-voice pitches ──
  const buildCounterVoice = useCallback(
    (playhead: number): { midi: number; dur: number; vel: number }[] => {
      const chords = chordsRef.current;
      if (chords.length === 0) return [];

      // current chord = last chord whose time <= playhead (advance a pointer)
      let cp = chordPtrRef.current;
      while (cp + 1 < chords.length && chords[cp + 1].time <= playhead) cp++;
      while (cp > 0 && chords[cp].time > playhead) cp--;
      chordPtrRef.current = cp;
      const chord = chords[cp];
      if (!chord || chord.time > playhead) return [];

      const root = chordRoot(chord.chord);
      if (root === null) return [];
      const minor = chordIsMinor(chord.chord);
      const third = (root + (minor ? 3 : 4)) % 12;
      const fifth = (root + 7) % 12;
      const seventh = (root + (minor ? 10 : 11)) % 12;
      const triad = [root, third, fifth];
      const tones = [root, third, fifth, seventh];

      // his current "melody" = highest note sounding right now
      const notes = notesRef.current;
      let melody = -1;
      // scan a small window around the playhead
      for (let i = hisLoRef.current; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > playhead) break;
        if (n.time <= playhead && n.time + n.duration > playhead) {
          if (n.midi > melody) melody = n.midi;
        }
      }
      if (melody < 0) melody = root + 60; // fall back near middle C register

      const v = voicingRef.current;
      const d = densityRef.current;
      const tr = transposeRef.current;
      const beat = 60 / (tempoRef.current || 92);
      const baseVel = clampMidi(46 + d * 34);

      const out: { midi: number; dur: number; vel: number }[] = [];
      const push = (midi: number, dur: number, vel: number) => {
        const t = clampMidi(midi + tr);
        if (t < 0 || t > 127) return;
        out.push({ midi: t, dur, vel: Math.max(16, Math.min(110, vel)) });
      };

      if (v === "thirds") {
        push(snapToChordToneAbove(melody + 2, triad), beat * lerp(1.6, 0.7, d), baseVel);
      } else if (v === "sixths") {
        push(snapToChordToneAbove(melody + 7, triad), beat * lerp(1.6, 0.7, d), baseVel - 4);
      } else if (v === "bass") {
        const rBass = root + 36; // ~ octave 2-3
        push(rBass, beat * 1.4, baseVel + 6);
        if (d > 0.55) push(fifth + 36 >= rBass ? fifth + 36 : fifth + 48, beat * 1.2, baseVel);
      } else if (v === "pad") {
        // sustained chord tones a little under his register
        const anchor = 48; // octave 3
        triad.forEach((pc) => push(anchor + pc, beat * lerp(2.6, 1.4, d), baseVel - 8));
      } else if (v === "arp") {
        const idx = arpIdxRef.current % tones.length;
        arpIdxRef.current = (arpIdxRef.current + 1) % tones.length;
        const anchor = 60; // octave 5
        push(anchor + tones[idx], beat * lerp(0.9, 0.4, d), baseVel);
      }
      return out;
    },
    [],
  );

  // ── run one compiler step: decide + emit + register visual notes ──
  const runCompiler = useCallback(
    (playhead: number) => {
      const v = voicingRef.current;
      const d = densityRef.current;
      const beat = 60 / (tempoRef.current || 92);
      let interval = beat * lerp(1.9, 0.5, d);
      if (v === "pad") interval *= 1.7;
      else if (v === "bass") interval *= 1.35;
      else if (v === "arp") interval *= 0.62;
      interval = Math.max(0.18, Math.min(3, interval));

      if (playhead - lastEmitRef.current < interval) return;

      const voice = buildCounterVoice(playhead);
      if (voice.length === 0) return;
      lastEmitRef.current = playhead;

      const out = outputRef.current;
      const ghost = !out;
      const onsetT = playhead + LEAD_S;
      const baseMs = performance.now() + LEAD_S * 1000;

      for (const nv of voice) {
        const pc = ((nv.midi % 12) + 12) % 12;
        if (out) {
          try {
            out.send([0x90, nv.midi, nv.vel], baseMs);
            out.send([0x80, nv.midi, 0], baseMs + nv.dur * 1000);
          } catch {
            /* device pulled mid-send */
          }
        }
        emittedRef.current.push({
          id: emitSeqRef.current++,
          midi: nv.midi,
          pc,
          onsetT,
          dur: nv.dur,
          vel: nv.vel,
          ghost,
        });
        emitCountRef.current++;
      }
    },
    [buildCounterVoice],
  );

  // ── draw the dual piano-roll imperatively (smooth, no 60fps React churn) ──
  const drawRoll = useCallback((playhead: number) => {
    const g = svgGroupRef.current;
    if (!g) return;
    const frag: SVGElement[] = [];

    // advance his low pointer to first note still within the past window
    const notes = notesRef.current;
    while (
      hisLoRef.current < notes.length &&
      notes[hisLoRef.current].time + notes[hisLoRef.current].duration < playhead - WIN_S
    ) {
      hisLoRef.current++;
    }

    // faint vertical guide at each C (octave reference)
    for (let m = 24; m <= HI_MIDI; m += 12) {
      const x = xForMidi(m);
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("x1", `${x}`);
      ln.setAttribute("x2", `${x}`);
      ln.setAttribute("y1", "8");
      ln.setAttribute("y2", `${VIEW_H - 8}`);
      ln.setAttribute("stroke", "currentColor");
      ln.setAttribute("stroke-width", "1");
      ln.setAttribute("opacity", "0.06");
      frag.push(ln);
    }

    // current chord tone field: faint bands across all octaves
    const chords = chordsRef.current;
    if (chords.length) {
      const cp = chordPtrRef.current;
      const chord = chords[cp];
      const root = chord ? chordRoot(chord.chord) : null;
      if (root !== null) {
        const minor = chordIsMinor(chord.chord);
        const tonePcs = [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12];
        for (let m = LO_MIDI; m <= HI_MIDI; m++) {
          if (!tonePcs.includes(m % 12)) continue;
          const x = xForMidi(m);
          const hue = pitchClassHue(m % 12);
          const ln = document.createElementNS(SVG_NS, "line");
          ln.setAttribute("x1", `${x}`);
          ln.setAttribute("x2", `${x}`);
          ln.setAttribute("y1", "8");
          ln.setAttribute("y2", `${VIEW_H - 8}`);
          ln.setAttribute("stroke", `hsl(${hue} 70% 60%)`);
          ln.setAttribute("stroke-width", "2");
          ln.setAttribute("opacity", m % 12 === root ? "0.14" : "0.08");
          frag.push(ln);
        }
      }
    }

    // his notes — upper lane, descending toward NOW, absorbed at the line
    for (let i = hisLoRef.current; i < notes.length; i++) {
      const n = notes[i];
      if (n.time > playhead + WIN_S) break;
      if (n.time + n.duration < playhead - 0.05) continue;
      // y for a given absolute time (future = up)
      const yOnset = CENTER_Y - (n.time - playhead) * PPS;
      const yOffset = CENTER_Y - (n.time + n.duration - playhead) * PPS;
      const bottom = Math.min(CENTER_Y, yOnset);
      const top = yOffset;
      if (bottom <= top) continue; // fully crossed NOW
      const pc = ((n.midi % 12) + 12) % 12;
      const hue = pitchClassHue(pc);
      const dist = Math.abs(n.time - playhead) / WIN_S;
      const op = lerp(0.9, 0.18, dist) * (0.5 + (n.velocity / 127) * 0.5);
      const x = xForMidi(n.midi);
      const w = Math.max(4, KEY_W * 0.78);
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", `${x - w / 2}`);
      r.setAttribute("y", `${top}`);
      r.setAttribute("width", `${w}`);
      r.setAttribute("height", `${Math.max(2, bottom - top)}`);
      r.setAttribute("rx", "2.5");
      r.setAttribute("fill", `hsl(${hue} 72% 56%)`);
      r.setAttribute("opacity", `${op.toFixed(3)}`);
      frag.push(r);
    }

    // our emitted counter-line — lower lane, rising from below to meet NOW
    const kept: OurNote[] = [];
    for (const o of emittedRef.current) {
      if (playhead > o.onsetT + o.dur + 0.02) continue; // fully sounded → drop
      kept.push(o);
      const yOnset = CENTER_Y + (o.onsetT - playhead) * PPS; // top edge
      const yOffset = CENTER_Y + (o.onsetT + o.dur - playhead) * PPS; // bottom
      const top = Math.max(CENTER_Y, yOnset);
      const bottom = yOffset;
      if (bottom <= top) continue;
      const hue = pitchClassHue(o.pc);
      const dist = Math.max(0, o.onsetT - playhead) / WIN_S;
      const op = lerp(0.95, 0.3, dist);
      const x = xForMidi(o.midi);
      const w = Math.max(4, KEY_W * 0.78);
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", `${x - w / 2}`);
      r.setAttribute("y", `${top}`);
      r.setAttribute("width", `${w}`);
      r.setAttribute("height", `${Math.max(2, bottom - top)}`);
      r.setAttribute("rx", "2.5");
      if (o.ghost) {
        r.setAttribute("fill", `hsl(${hue} 60% 62%)`);
        r.setAttribute("fill-opacity", `${(op * 0.14).toFixed(3)}`);
        r.setAttribute("stroke", `hsl(${hue} 65% 66%)`);
        r.setAttribute("stroke-width", "1.4");
        r.setAttribute("stroke-dasharray", "3 3");
        r.setAttribute("stroke-opacity", `${op.toFixed(3)}`);
      } else {
        r.setAttribute("fill", `hsl(${hue} 82% 64%)`);
        r.setAttribute("opacity", `${op.toFixed(3)}`);
        r.setAttribute("stroke", `hsl(${hue} 90% 78%)`);
        r.setAttribute("stroke-width", "1");
        r.setAttribute("stroke-opacity", `${(op * 0.8).toFixed(3)}`);
      }
      frag.push(r);
    }
    emittedRef.current = kept;

    g.replaceChildren(...frag);
  }, []);

  // ── advance the current-chord pointer to match the playhead ──
  const syncChordPtr = useCallback((playhead: number) => {
    const chords = chordsRef.current;
    if (chords.length === 0) return;
    let cp = chordPtrRef.current;
    if (cp >= chords.length) cp = chords.length - 1;
    while (cp + 1 < chords.length && chords[cp + 1].time <= playhead) cp++;
    while (cp > 0 && chords[cp].time > playhead) cp--;
    chordPtrRef.current = cp;
  }, []);

  // ── stop / reset ──
  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    allNotesOff();
    const src = sourceRef.current;
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
    if (svgGroupRef.current) svgGroupRef.current.replaceChildren();
    emittedRef.current = [];
    setStatus((s) => (s === "error" ? s : "idle"));
  }, [allNotesOff]);

  // ── the animation frame ──
  const frame = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const playhead = ctx.currentTime - startTimeRef.current;
    if (durationRef.current > 0 && playhead > durationRef.current + 0.25) {
      stopPlayback();
      return;
    }
    syncChordPtr(playhead);
    runCompiler(playhead);
    drawRoll(playhead);

    // throttle React readouts to ~8 Hz
    if (playhead - readoutClockRef.current > 0.12) {
      readoutClockRef.current = playhead;
      const chords = chordsRef.current;
      const chord = chords[chordPtrRef.current];
      const out = outputRef.current;
      setReadout({
        chord: chord && chord.time <= playhead ? chord.chord : "—",
        playheadSec: playhead,
        totalSec: durationRef.current,
        emitted: emitCountRef.current,
        device: out ? out.name ?? "MIDI output" : "—",
      });
    }
    rafRef.current = requestAnimationFrame(frame);
  }, [runCompiler, drawRoll, stopPlayback, syncChordPtr]);

  // ── play his take ──
  const play = useCallback(async () => {
    if (status === "loading" || status === "playing") return;
    setStatus("loading");
    setErrorMsg(null);
    setAnalysisMissing(false);
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      if (!masterRef.current) masterRef.current = createSafeMaster(ctx);

      const [{ buffer, title: loadedTitle }, analysis] = await Promise.all([
        loadRealTrackBuffer(ctx, trackId),
        loadTrackAnalysis(trackId).catch(() => null as TrackAnalysis | null),
      ]);

      setTitle(loadedTitle);
      durationRef.current = buffer.duration;

      if (analysis && (analysis.notes.length || analysis.chords.length)) {
        notesRef.current = analysis.notes;
        chordsRef.current = analysis.chords;
        tempoRef.current = analysis.tempo && analysis.tempo > 30 ? analysis.tempo : 92;
        setAnalysisMissing(false);
      } else {
        notesRef.current = [];
        chordsRef.current = [];
        tempoRef.current = 92;
        setAnalysisMissing(true);
      }

      // reset compiler + roll state
      hisLoRef.current = 0;
      chordPtrRef.current = 0;
      lastEmitRef.current = -10;
      arpIdxRef.current = 0;
      emittedRef.current = [];
      emitCountRef.current = 0;
      emitSeqRef.current = 0;
      readoutClockRef.current = -1;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterRef.current.input); // his real audio → ear-safety master
      source.onended = () => {
        // natural end
        if (sourceRef.current === source) stopPlayback();
      };
      sourceRef.current = source;
      startTimeRef.current = ctx.currentTime;
      source.start();

      setStatus("playing");
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(frame);
    } catch (e) {
      setErrorMsg(
        e instanceof Error ? e.message : "Could not load Karel's recording.",
      );
      setStatus("error");
    }
  }, [status, trackId, frame, stopPlayback]);

  // ── unmount cleanup ──
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const out = outputRef.current;
      if (out) {
        try {
          out.send([0xb0, 120, 0]);
          out.send([0xb0, 123, 0]);
        } catch {
          /* noop */
        }
      }
      const src = sourceRef.current;
      if (src) {
        try {
          src.onended = null;
          src.stop();
        } catch {
          /* noop */
        }
      }
      masterRef.current?.disconnect();
      const a = midiAccessRef.current;
      if (a) a.onstatechange = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const noDevice = !selectedOutputId; // covers unsupported + none connected
  const playing = status === "playing";
  const currentVoicing = VOICINGS.find((v) => v.id === voicing)!;
  const progress = readout.totalSec > 0 ? readout.playheadSec / readout.totalSec : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Web MIDI output · counter-line compiler
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Answer Piano
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Karel&apos;s real recording plays as the only sound. A rule-based
            compiler reads his chords and emits a harmonized counter-voice out
            through Web MIDI, so your own synth or DAW answers his piano — the
            counter-line is data, never sounded inside this page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="shrink-0 rounded-md border border-border bg-background/60 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* device notice */}
      {noDevice && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-base text-destructive">
          {midiSupported
            ? "No MIDI output connected — connect a synth or DAW and your hardware will answer his piano. The dual roll below still animates the would-be counter-line as dashed ghost notes."
            : "Web MIDI output isn't available in this browser — try Chrome or Edge. The dual roll still animates the would-be counter-line as dashed ghost notes."}
        </p>
      )}

      {/* the SVG roll — hero */}
      <div className="overflow-x-auto rounded-lg border border-border bg-muted/30">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full min-w-[720px] text-foreground"
          role="img"
          aria-label="Dual piano-roll: Karel's notes descending to the NOW line, the emitted MIDI counter-line rising to meet it."
        >
          {/* lane labels */}
          <text x={PAD_X} y="22" className="fill-muted-foreground" fontSize="12" fontFamily="ui-monospace, monospace" letterSpacing="1.5">
            HIS PIANO ↓
          </text>
          <text x={PAD_X} y={VIEW_H - 12} className="fill-muted-foreground" fontSize="12" fontFamily="ui-monospace, monospace" letterSpacing="1.5">
            YOUR MIDI COUNTER-LINE ↑
          </text>
          {/* dynamic notes + chord field */}
          <g ref={svgGroupRef} />
          {/* NOW line drawn on top */}
          <line
            x1={PAD_X}
            x2={VIEW_W - PAD_X}
            y1={CENTER_Y}
            y2={CENTER_Y}
            className="stroke-primary"
            strokeWidth="1.5"
            opacity="0.85"
          />
          <text
            x={VIEW_W - PAD_X}
            y={CENTER_Y - 6}
            textAnchor="end"
            className="fill-primary"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
            letterSpacing="2"
          >
            NOW
          </text>
        </svg>
      </div>

      {/* readouts */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: "Chord", v: readout.chord },
          { k: "Playhead", v: `${fmtTime(readout.playheadSec)} / ${fmtTime(readout.totalSec)}` },
          { k: "Notes emitted", v: `${readout.emitted}` },
          { k: "Device", v: readout.device },
        ].map((r) => (
          <div key={r.k} className="rounded-md border border-border bg-background/60 px-3 py-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {r.k}
            </div>
            <div className="mt-0.5 truncate text-base text-foreground" title={r.v}>
              {r.v}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary/70 transition-[width] duration-150"
          style={{ width: `${Math.max(0, Math.min(100, progress * 100))}%` }}
        />
      </div>

      {/* controls */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[auto_1fr]">
        {/* transport + device + track */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {!playing ? (
              <button
                type="button"
                onClick={() => void play()}
                disabled={status === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {status === "loading" ? "Loading his take…" : `Play his take · ${title}`}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopPlayback}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Stop
              </button>
            )}
          </div>

          {errorMsg && (
            <p className="text-sm text-destructive">
              Couldn&apos;t play his recording: {errorMsg}
            </p>
          )}
          {analysisMissing && (
            <p className="text-sm text-destructive">
              No harmonic analysis for this take — his recording still plays, but
              the compiler has no chords to answer, so emission is paused. Try
              another track.
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              His recording
            </span>
            <select
              value={trackId}
              onChange={(e) => {
                if (playing) stopPlayback();
                const id = e.target.value;
                setTrackId(id);
                setTitle(titleForId(id));
              }}
              className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {REAL_TRACKS.map((t: WelcomeHomeTrack) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              MIDI output device
            </span>
            <select
              value={selectedOutputId ?? ""}
              onChange={(e) => setSelectedOutputId(e.target.value || null)}
              disabled={outputs.length === 0}
              className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-60"
            >
              {outputs.length === 0 ? (
                <option value="">No output connected</option>
              ) : (
                outputs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        {/* voicing + density + transpose */}
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Counter-voice — {currentVoicing.blurb}
            </div>
            <div className="flex flex-wrap gap-2">
              {VOICINGS.map((v) => {
                const active = v.id === voicing;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVoicing(v.id)}
                    className={
                      active
                        ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    }
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Density · {Math.round(density * 100)}%
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={density}
              onChange={(e) => setDensity(parseFloat(e.target.value))}
              className="w-full accent-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Transpose · {transpose > 0 ? `+${transpose}` : transpose} semitones
            </span>
            <input
              type="range"
              min={-24}
              max={24}
              step={1}
              value={transpose}
              onChange={(e) => setTranspose(parseInt(e.target.value, 10))}
              className="w-full accent-primary"
            />
          </label>
        </div>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Answer Piano — design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                His real recorded piano is the only audible sound, routed through
                the shared ear-safety master. As it plays, a knowledge-based
                accompaniment compiler reads his chords and current melody note
                and emits a harmonized counter-voice out through the Web MIDI
                OUTPUT to whatever synth or DAW you have connected. This is the
                lab&apos;s first piece that <em>emits</em> MIDI.
              </p>
              <p>
                The counter-line is control data only. It is scheduled with a
                small causal look-ahead ({Math.round(LEAD_S * 1000)}ms) via{" "}
                <span className="font-mono text-xs">output.send([status,note,vel], ts)</span>{" "}
                and is <strong>never</strong> synthesised to audio inside the
                page — that is a hard rule of the lab (Rule 10: his real catalog
                is the only audio).
              </p>
              <p>
                The compiler is the same shape as MazzikaAI (arXiv:2608.10360,
                Aug 2026): a knowledge/rule layer that turns a live-advancing
                performance into a subsecond, causal accompaniment stream — except
                the actuator here is Web MIDI to real hardware, not a neural
                model. Corroborating: LiveBand (arXiv:2606.03803).
              </p>
              <p>
                Voicings: <strong>Thirds/Sixths</strong> snap a chord tone above
                his live melody; <strong>Pad</strong> sustains triad tones under
                him; <strong>Bass</strong> lays root &amp; fifth an octave down;
                <strong> Arpeggio</strong> walks chord tones one at a time.
                Density sets how often notes are emitted; transpose shifts the
                whole counter-line. Notes are coloured by pitch-class.
              </p>
              <p>
                No device connected? The piece still plays his take and still
                animates the full dual roll — his notes descending, the would-be
                counter-line rising as dashed ghost notes — with zero audio
                synthesised. Plug a device in mid-session and{" "}
                <span className="font-mono text-xs">onstatechange</span> picks it
                up, turning the ghosts into real emitted notes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
