"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15808 · MIDI Duet — an anticipatory duet with Karel's own piano catalog.
//
//   ONE QUESTION
//   What if you play alongside Karel's own piano catalog on a MIDI keyboard, and
//   his real recorded phrases answer you — entering *ahead* of your line to
//   complete the phrase you're implying?
//
//   INPUT   Web MIDI keyboard (primary), with an always-on QWERTY fallback
//           (a–k white keys, w/e/t/y/u black keys, z/x octave shift) so it is
//           playable with no hardware.
//   OUTPUT  an animated inline-SVG "conversation score": your notes stream in on
//           the lower staff, Karel's retrieved answers bloom on the upper staff,
//           threads link a call to its answer, and a translucent ANTICIPATION
//           GHOST shows his incoming phrase in the future — before it sounds.
//   VERB    concatenative corpus retrieval across several of Karel's real tracks
//           (CataRT-style nearest-unit lookup) + anticipation-made-visible: the
//           last few notes you play are matched against where a similar shape
//           occurred in his playing, and the notes he played NEXT are surfaced as
//           the ghost, then played from his recording to complete your line.
//
//   REFS  ReaLJam (arXiv:2502.21267) — an AI partner that continually predicts
//         the performance and *visually conveys its plan*: anticipation made
//         visible. CataRT / corpus-based concatenative synthesis (Diemo Schwarz,
//         IRCAM). "Real-Time Human-AI Musical Co-Performance" (arXiv:2604.07612).
//
//   AUDIO Karel's verified catalog ONLY. A keypress makes NO tone of its own — it
//         RETRIEVES and re-triggers his real recorded note. Every audible sound
//         is a grain of his real recording, routed through the shared safeMaster
//         ear-safety bus. No oscillator / synth voice anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis } from "../_shared/trackAnalysis";
import { pitchClassHue } from "../_shared/trackAnalysis";
import type { TrackNote } from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  buildCorpus,
  retrieveNearest,
  predictContinuation,
  type Corpus,
  type CorpusNote,
} from "./corpus";

// ── the corpus tracks (verified anon-servable ids) ───────────────────────────
const TRACK_OPTIONS = [
  { id: "eba95845-cdbf-41d8-9c5d-8679686811ad", title: "Bath" },
  { id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", title: "Interplay" },
  { id: "1f0a541e-df60-44a9-b839-5dc69a007d9f", title: "2019" },
  { id: "d2eeee58-832b-4872-a4be-8fbf030b981d", title: "Rolling" },
  { id: "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", title: "Isolation" },
] as const;
const DEFAULT_IDS = TRACK_OPTIONS.slice(0, 4).map((t) => t.id);

// ── QWERTY tracker-row → semitone offset from the base C ─────────────────────
const QWERTY: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};
// display order for the on-screen legend (chromatic)
const KEY_ROW: { key: string; semi: number }[] = [
  { key: "a", semi: 0 }, { key: "w", semi: 1 }, { key: "s", semi: 2 },
  { key: "e", semi: 3 }, { key: "d", semi: 4 }, { key: "f", semi: 5 },
  { key: "t", semi: 6 }, { key: "g", semi: 7 }, { key: "y", semi: 8 },
  { key: "h", semi: 9 }, { key: "u", semi: 10 }, { key: "j", semi: 11 },
  { key: "k", semi: 12 },
];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BASE_MIDI = 60; // middle C at octave shift 0
const isBlack = (semi: number) => [1, 3, 6, 8, 10].includes(((semi % 12) + 12) % 12);
const noteName = (m: number) => `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

// ── behaviour constants ──────────────────────────────────────────────────────
const SETTLE_MS = 850; // pause after which his anticipated phrase is scheduled
const LEAD_SEC = 1.25; // how far ahead the ghost enters before it sounds
const ANSWER_LEN = 4; // notes in his completing phrase
const RECENT_MAX = 8; // played notes kept for prediction
const PAST_SEC = 5.2; // how much history stays on the score

// ── SVG geometry (raw colours allowed inside the art layer) ──────────────────
const W = 1000;
const H = 440;
const X0 = 36;
const NOW_X = 640; // the playhead: past on the left, future on the right
const PXPS = 118; // px per second of scroll
const UP_TOP = 46;
const UP_BOT = 198;
const CENTER_Y = 220;
const LO_TOP = 242;
const LO_BOT = 394;
const MIDI_LO = 36;
const MIDI_HI = 96;

const GROUND = "#0b0810";
const INK = "#e8e6f2";

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const xForT = (t: number, now: number) => NOW_X + (t - now) * PXPS;
const yForMidi = (m: number, upper: boolean) => {
  const n = (clamp(m, MIDI_LO, MIDI_HI) - MIDI_LO) / (MIDI_HI - MIDI_LO);
  return upper ? UP_BOT - n * (UP_BOT - UP_TOP) : LO_BOT - n * (LO_BOT - LO_TOP);
};
const hueFor = (m: number) => pitchClassHue(((m % 12) + 12) % 12);

const nowSec = () => performance.now() / 1000;

// ── event models ─────────────────────────────────────────────────────────────
interface Played {
  id: number;
  t: number; // sec when the visitor played it
  midi: number;
}
interface Answer {
  id: number;
  midi: number; // pitch of Karel's note
  soundTime: number; // sec when it sounds (future for a ghost)
  ghost: boolean; // true = anticipated, not yet sounded
  kind: "spotlight" | "anticipation";
  srcT: number; // the visitor note that triggered it
  srcMidi: number;
}
interface View {
  now: number;
  level: number;
  played: Played[];
  answers: Answer[];
}
const EMPTY_VIEW: View = { now: 0, level: 0, played: [], answers: [] };

type MidiStatus = "checking" | "midi" | "qwerty";

interface LoadedTrack {
  title: string;
  buffer: AudioBuffer;
  notes: TrackNote[];
}

// ── one Karel note as a windowed grain of his real recording ─────────────────
function triggerReal(
  ctx: AudioContext,
  dest: AudioNode,
  buffer: AudioBuffer,
  startSec: number,
  windowSec: number,
  gainMul: number,
  whenOffset: number,
  live: Set<AudioBufferSourceNode>,
): AudioBufferSourceNode | null {
  const win = clamp(windowSec, 0.35, 1.3);
  const start = clamp(startSec, 0, Math.max(0, buffer.duration - win - 0.02));
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  const t = ctx.currentTime + Math.max(0, whenOffset);
  const atk = 0.012;
  const rel = Math.min(0.28, win * 0.5);
  const peak = 0.9 * gainMul;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak, Math.max(t + atk + 0.001, t + win - rel));
  g.gain.exponentialRampToValueAtTime(0.0001, t + win);
  src.connect(g).connect(dest);
  try {
    src.start(t, start, win + 0.06);
    src.stop(t + win + 0.06);
  } catch {
    return null;
  }
  live.add(src);
  src.onended = () => {
    try {
      src.disconnect();
      g.disconnect();
    } catch {
      /* ctx closing */
    }
    live.delete(src);
  };
  return src;
}

export default function MidiDuetPage() {
  // ── audio graph ──
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const buffersRef = useRef<(AudioBuffer | null)[]>([]);
  const liveRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const freqRef = useRef<Uint8Array>(new Uint8Array(0));

  // ── performance state ──
  const playedRef = useRef<Played[]>([]);
  const answerRef = useRef<Answer[]>([]);
  const recentRef = useRef<number[]>([]);
  const activeKeysRef = useRef<Set<number>>(new Set());
  const keyTimersRef = useRef<number[]>([]);
  const idRef = useRef<number>(1);
  const octaveRef = useRef<number>(0);
  const gainRef = useRef<number>(0.85);

  // ── anticipation scheduling ──
  const debounceRef = useRef<number | null>(null);
  const pendingRef = useRef<{
    srcs: AudioBufferSourceNode[];
    timers: number[];
    ids: number[];
  }>({ srcs: [], timers: [], ids: [] });

  // ── web midi ──
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  // ── react state ──
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_IDS);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadedTitles, setLoadedTitles] = useState<string[]>([]);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>("checking");
  const [octave, setOctave] = useState(0);
  const [gain, setGain] = useState(0.85);
  const [view, setView] = useState<View>(EMPTY_VIEW);

  // ── the anticipation engine: predict + schedule his completing phrase ──────
  const runAnticipation = useCallback(() => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    const corpus = corpusRef.current;
    if (!ctx || !safe || !corpus) return;

    // cancel any still-pending (un-sounded) anticipation
    const pend = pendingRef.current;
    pend.srcs.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    pend.timers.forEach((id) => clearTimeout(id));
    const drop = new Set(pend.ids);
    answerRef.current = answerRef.current.filter(
      (a) => !(drop.has(a.id) && a.ghost),
    );
    pendingRef.current = { srcs: [], timers: [], ids: [] };

    const ans = predictContinuation(corpus, recentRef.current, ANSWER_LEN);
    if (ans.length === 0) return;

    const now = nowSec();
    const played = playedRef.current;
    const srcNote = played[played.length - 1];
    const srcT = srcNote ? srcNote.t : now;
    const srcMidi = srcNote ? srcNote.midi : ans[0].midi;

    let acc = 0;
    ans.forEach((cn: CorpusNote, i) => {
      if (i > 0) {
        const gap = clamp(ans[i].time - ans[i - 1].time, 0.16, 0.9);
        acc += gap;
      }
      const soundTime = now + LEAD_SEC + acc;
      const id = idRef.current++;
      answerRef.current.push({
        id,
        midi: cn.midi,
        soundTime,
        ghost: true,
        kind: "anticipation",
        srcT,
        srcMidi,
      });
      pendingRef.current.ids.push(id);

      const buffer = buffersRef.current[cn.track];
      if (buffer) {
        const src = triggerReal(
          ctx,
          safe.input,
          buffer,
          cn.time,
          clamp(cn.duration * 1.2, 0.5, 1.15),
          0.8,
          soundTime - now,
          liveRef.current,
        );
        if (src) pendingRef.current.srcs.push(src);
      }
      const timer = window.setTimeout(
        () => {
          const hit = answerRef.current.find((a) => a.id === id);
          if (hit) hit.ghost = false;
        },
        Math.max(0, (soundTime - now) * 1000),
      );
      pendingRef.current.timers.push(timer);
    });
  }, []);

  // ── a single visitor keypress: retrieve + play HIS nearest real note ───────
  const playInput = useCallback(
    (midi: number) => {
      const ctx = ctxRef.current;
      const safe = safeRef.current;
      const corpus = corpusRef.current;
      if (!ctx || !safe || !corpus) return;

      const now = nowSec();
      playedRef.current.push({ id: idRef.current++, t: now, midi });
      recentRef.current.push(midi);
      if (recentRef.current.length > RECENT_MAX) recentRef.current.shift();

      // CataRT-style nearest-unit retrieval → a spotlight of his real recording
      const near = retrieveNearest(corpus, midi);
      if (near) {
        const buffer = buffersRef.current[near.track];
        if (buffer) {
          triggerReal(
            ctx,
            safe.input,
            buffer,
            near.time,
            clamp(near.duration * 1.2, 0.6, 1.2),
            1,
            0,
            liveRef.current,
          );
        }
        answerRef.current.push({
          id: idRef.current++,
          midi: near.midi,
          soundTime: now,
          ghost: false,
          kind: "spotlight",
          srcT: now,
          srcMidi: midi,
        });
      }

      // visual key flash
      activeKeysRef.current.add(midi);
      const tid = window.setTimeout(
        () => activeKeysRef.current.delete(midi),
        220,
      );
      keyTimersRef.current.push(tid);
      if (keyTimersRef.current.length > 64) keyTimersRef.current.shift();

      // when the phrase settles, surface + play his completing phrase ahead
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        runAnticipation();
      }, SETTLE_MS);
    },
    [runAnticipation],
  );

  // ── Web MIDI wiring ────────────────────────────────────────────────────────
  const attachInputs = useCallback((access: MIDIAccess) => {
    let count = 0;
    access.inputs.forEach((input) => {
      input.onmidimessage = (ev: Event) => {
        const e = ev as MIDIMessageEvent;
        const data = e.data;
        if (!data || data.length < 3) return;
        const cmd = data[0] & 0xf0;
        if (cmd === 0x90 && data[2] > 0) playInput(data[1]);
      };
      count++;
    });
    setMidiStatus(count > 0 ? "midi" : "qwerty");
  }, [playInput]);

  const setupMidi = useCallback(async () => {
    if (typeof navigator.requestMIDIAccess !== "function") {
      setMidiStatus("qwerty");
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      midiAccessRef.current = access;
      attachInputs(access);
      access.onstatechange = () => attachInputs(access);
    } catch {
      setMidiStatus("qwerty");
    }
  }, [attachInputs]);

  // ── begin: build the graph, load Karel's catalog, run the loop ─────────────
  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    setLoadedCount(0);

    const ids = selectedIds.length > 0 ? selectedIds : DEFAULT_IDS;
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      safe.setGain(gainRef.current);
      ctxRef.current = ctx;
      safeRef.current = safe;
      freqRef.current = new Uint8Array(safe.analyser.fftSize);

      const results = await Promise.all(
        ids.map(async (id): Promise<LoadedTrack | null> => {
          try {
            const [buf, an] = await Promise.all([
              loadRealTrackBuffer(ctx, id),
              loadTrackAnalysis(id),
            ]);
            setLoadedCount((c) => c + 1);
            if (!an || an.notes.length === 0) return null;
            return { title: buf.title, buffer: buf.buffer, notes: an.notes };
          } catch {
            setLoadedCount((c) => c + 1);
            return null;
          }
        }),
      );

      const good = results.filter((r): r is LoadedTrack => r !== null);

      if (good.length === 0) {
        setError(
          "Couldn't load any of Karel's tracks (or none had note analysis). Check your connection and try again.",
        );
        if (ctx.state !== "closed") void ctx.close();
        ctxRef.current = null;
        safeRef.current = null;
        return;
      }

      buffersRef.current = good.map((g) => g.buffer);
      corpusRef.current = buildCorpus(good.map((g) => g.notes));
      setLoadedTitles(good.map((g) => g.title));
      setStarted(true);
      void setupMidi();
    } catch {
      setError("Couldn't start audio. Check your connection and try again.");
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
      ctxRef.current = null;
      safeRef.current = null;
    } finally {
      setStarting(false);
    }
  }, [starting, selectedIds, setupMidi]);

  // ── render / cull loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const loop = () => {
      const now = nowSec();

      // cull history that has scrolled off the left
      playedRef.current = playedRef.current.filter((p) => p.t > now - PAST_SEC);
      answerRef.current = answerRef.current.filter(
        (a) => a.ghost || a.soundTime > now - PAST_SEC,
      );

      // master level for a gentle reactive glow
      let level = 0;
      const an = safeRef.current?.analyser;
      if (an) {
        const arr = freqRef.current;
        an.getByteTimeDomainData(arr as Uint8Array<ArrayBuffer>);
        let s = 0;
        for (let i = 0; i < arr.length; i++) {
          const v = (arr[i] - 128) / 128;
          s += v * v;
        }
        level = Math.sqrt(s / arr.length);
      }

      setView({
        now,
        level,
        played: playedRef.current.slice(),
        answers: answerRef.current.slice(),
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // ── QWERTY input (always wired once started, alongside MIDI) ───────────────
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "z") {
        const next = clamp(octaveRef.current - 1, -2, 2);
        octaveRef.current = next;
        setOctave(next);
        return;
      }
      if (key === "x") {
        const next = clamp(octaveRef.current + 1, -2, 2);
        octaveRef.current = next;
        setOctave(next);
        return;
      }
      if (key in QWERTY) {
        e.preventDefault();
        playInput(BASE_MIDI + octaveRef.current * 12 + QWERTY[key]);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [started, playInput]);

  // ── full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    const keyTimers = keyTimersRef.current;
    const live = liveRef.current;
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      pendingRef.current.timers.forEach((id) => clearTimeout(id));
      keyTimers.forEach((id) => clearTimeout(id));
      live.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      });
      live.clear();
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((i) => (i.onmidimessage = null));
        access.onstatechange = null;
      }
      const s = safeRef.current;
      if (s) s.disconnect();
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
    };
  }, []);

  const applyGain = (v: number) => {
    setGain(v);
    gainRef.current = v;
    safeRef.current?.setGain(v);
  };

  const toggleTrack = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // ── derived render values ──────────────────────────────────────────────────
  const { now, level, played, answers } = view;
  const glow = clamp(level * 2.2, 0, 1);
  const activeMidis = Array.from(activeKeysRef.current);

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8 sm:px-10">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            ← all prototypes
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            MIDI Duet
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Play alongside Karel&apos;s own piano catalog — his real recorded
            phrases answer you, entering <em>ahead</em> of your line to complete
            the phrase you&apos;re implying.
          </p>
        </header>

        {/* ── the conversation score ── */}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full min-w-[680px] select-none rounded-lg"
            style={{ background: GROUND }}
            role="img"
            aria-label="A conversation score: your played notes below, Karel's answering phrases above, with a translucent ghost of his incoming answer in the future."
          >
            {/* future region — where his answer arrives from */}
            <rect
              x={NOW_X}
              y={UP_TOP - 6}
              width={W - NOW_X}
              height={LO_BOT - UP_TOP + 12}
              fill="#8b5cf6"
              opacity={0.05 + glow * 0.04}
            />
            <text
              x={W - 12}
              y={UP_TOP + 6}
              fontSize={11}
              textAnchor="end"
              fill="#c4b5fd"
              opacity={0.7}
              fontFamily="ui-monospace, monospace"
              letterSpacing={2}
            >
              ANTICIPATION →
            </text>

            {/* staff labels */}
            <text x={X0} y={UP_TOP - 12} fontSize={13} fill={INK} opacity={0.7} fontFamily="ui-sans-serif, system-ui">
              KAREL — his answer
            </text>
            <text x={X0} y={LO_BOT + 22} fontSize={13} fill={INK} opacity={0.7} fontFamily="ui-sans-serif, system-ui">
              YOU
            </text>

            {/* faint staff guide lines */}
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={X0} x2={W - 8} y1={UP_TOP + f * (UP_BOT - UP_TOP)} y2={UP_TOP + f * (UP_BOT - UP_TOP)} stroke={INK} strokeWidth={1} opacity={0.06} />
                <line x1={X0} x2={W - 8} y1={LO_TOP + f * (LO_BOT - LO_TOP)} y2={LO_TOP + f * (LO_BOT - LO_TOP)} stroke={INK} strokeWidth={1} opacity={0.06} />
              </g>
            ))}

            {/* center divider */}
            <line x1={X0} x2={W - 8} y1={CENTER_Y} y2={CENTER_Y} stroke={INK} strokeWidth={1} opacity={0.14} />

            {/* threads: call → answer */}
            {answers.map((a) => {
              const ax = xForT(a.soundTime, now);
              const ay = yForMidi(a.midi, true);
              const sx = xForT(a.srcT, now);
              const sy = yForMidi(a.srcMidi, false);
              if (ax < X0 - 40 && sx < X0 - 40) return null;
              if (ax > W + 40 && sx > W + 40) return null;
              const midX = (ax + sx) / 2;
              const age = clamp((now - a.soundTime) / PAST_SEC, 0, 1);
              const op = (a.ghost ? 0.28 : 0.42) * (1 - age);
              if (op <= 0.01) return null;
              const hue = hueFor(a.midi);
              return (
                <path
                  key={`thread-${a.id}`}
                  d={`M ${sx} ${sy} Q ${midX} ${CENTER_Y} ${ax} ${ay}`}
                  fill="none"
                  stroke={`hsl(${hue} 70% 66%)`}
                  strokeWidth={1.2}
                  opacity={op}
                  strokeDasharray={a.ghost ? "3 4" : undefined}
                />
              );
            })}

            {/* your played notes (lower staff) */}
            {played.map((p) => {
              const x = xForT(p.t, now);
              if (x < X0 - 30 || x > W + 30) return null;
              const y = yForMidi(p.midi, false);
              const age = clamp((now - p.t) / PAST_SEC, 0, 1);
              const fade = 1 - age;
              const hue = hueFor(p.midi);
              const bloom = clamp(1 - (now - p.t) / 0.45, 0, 1);
              return (
                <g key={`p-${p.id}`} opacity={fade}>
                  <circle cx={x} cy={y} r={5 + bloom * 6 + glow * 2} fill={`hsl(${hue} 78% 62%)`} />
                  {bloom > 0 && (
                    <circle cx={x} cy={y} r={9 + bloom * 12} fill="none" stroke={`hsl(${hue} 80% 70%)`} strokeWidth={1.4} opacity={bloom * 0.6} />
                  )}
                </g>
              );
            })}

            {/* Karel's answers (upper staff) — spotlights + anticipation ghosts */}
            {answers.map((a) => {
              const x = xForT(a.soundTime, now);
              if (x < X0 - 30 || x > W + 30) return null;
              const y = yForMidi(a.midi, true);
              const hue = hueFor(a.midi);
              if (a.ghost) {
                // translucent constellation of the INCOMING answer
                const near = clamp(1 - (a.soundTime - now) / LEAD_SEC, 0, 1);
                return (
                  <g key={`a-${a.id}`} opacity={0.32 + near * 0.28}>
                    <circle cx={x} cy={y} r={5 + near * 2} fill={`hsl(${hue} 65% 62%)`} opacity={0.4} />
                    <circle cx={x} cy={y} r={9 + near * 4} fill="none" stroke={`hsl(${hue} 70% 72%)`} strokeWidth={1.2} strokeDasharray="2 3" />
                  </g>
                );
              }
              const age = clamp((now - a.soundTime) / PAST_SEC, 0, 1);
              const fade = 1 - age;
              const bloom = clamp(1 - (now - a.soundTime) / 0.5, 0, 1);
              return (
                <g key={`a-${a.id}`} opacity={fade}>
                  <circle cx={x} cy={y} r={5 + bloom * 7 + glow * 2} fill={`hsl(${hue} 76% 64%)`} />
                  {bloom > 0 && (
                    <circle cx={x} cy={y} r={10 + bloom * 16} fill="none" stroke={`hsl(${hue} 82% 74%)`} strokeWidth={1.6} opacity={bloom * 0.7} />
                  )}
                </g>
              );
            })}

            {/* the NOW playhead */}
            <line x1={NOW_X} x2={NOW_X} y1={UP_TOP - 6} y2={LO_BOT + 6} stroke={INK} strokeWidth={1.5} opacity={0.4} />
            <circle cx={NOW_X} cy={CENTER_Y} r={3.5 + glow * 3} fill={INK} opacity={0.8} />

            {!started && (
              <text x={W / 2} y={CENTER_Y} fontSize={15} textAnchor="middle" fill={INK} opacity={0.4} fontFamily="ui-sans-serif, system-ui">
                Press Begin, then play — his catalog answers you.
              </text>
            )}
          </svg>
        </div>

        {/* ── error notice ── */}
        {error && (
          <p className="text-base text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* ── controls ── */}
        {!started ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => void start()}
                disabled={starting || selectedIds.length === 0}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {starting
                  ? `Loading Karel's catalog… (${loadedCount}/${selectedIds.length || DEFAULT_IDS.length})`
                  : "Begin"}
              </button>
              <p className="text-sm text-muted-foreground">
                Loads {selectedIds.length || 4} of his real recordings, then hands
                you a keyboard that plays from his catalog.
              </p>
            </div>

            <section className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Corpus tracks
              </p>
              <div className="flex flex-wrap gap-2">
                {TRACK_OPTIONS.map((t) => {
                  const on = selectedIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTrack(t.id)}
                      className={
                        on
                          ? "min-h-[44px] rounded-md border border-primary bg-primary/15 px-4 text-sm text-foreground transition-colors"
                          : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      }
                    >
                      {t.title}
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                Pick which of his takes make up the answering corpus — the default
                four work with no changes.
              </p>
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* status + how to play */}
            <div className="flex flex-col gap-2">
              <p
                className={
                  midiStatus === "midi"
                    ? "text-sm text-primary"
                    : "text-sm text-muted-foreground"
                }
              >
                {midiStatus === "midi"
                  ? "MIDI keyboard connected"
                  : midiStatus === "checking"
                    ? "Checking for a MIDI keyboard…"
                    : "Using computer keyboard (a–k)"}
              </p>
              <p className="text-base text-muted-foreground">
                Play a note — you hear <span className="text-foreground">his</span>{" "}
                nearest real note, retrieved from{" "}
                <span className="text-foreground">
                  {loadedTitles.join(", ")}
                </span>
                . Pause for a moment and his catalog completes your phrase — you
                see the answer arrive as a{" "}
                <span className="text-primary">ghost</span> before it sounds.
              </p>
            </div>

            {/* compact QWERTY keyboard legend */}
            <section className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Keyboard · octave {octave >= 0 ? `+${octave}` : octave} ·{" "}
                <span className="text-foreground">z</span>/
                <span className="text-foreground">x</span> shift
              </p>
              <div className="flex flex-wrap items-end gap-1.5">
                {KEY_ROW.map(({ key, semi }) => {
                  const midi = BASE_MIDI + octave * 12 + semi;
                  const black = isBlack(semi);
                  const active = activeMidis.includes(midi);
                  const hue = hueFor(midi);
                  return (
                    <button
                      key={key}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        playInput(midi);
                      }}
                      className={`flex ${black ? "h-12" : "h-16"} w-11 flex-col items-center justify-end rounded-md border px-1 pb-1.5 text-xs transition-colors ${
                        active
                          ? "border-primary text-foreground"
                          : black
                            ? "border-border bg-background/80 text-muted-foreground hover:text-foreground"
                            : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
                      }`}
                      style={
                        active
                          ? { background: `hsl(${hue} 70% 40%)` }
                          : undefined
                      }
                    >
                      <span className="font-mono text-[10px] uppercase">
                        {key}
                      </span>
                      <span className="mt-0.5 text-[10px] opacity-70">
                        {noteName(midi)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                A MIDI keyboard plays too — both work at once. Tap the keys above
                on touch.
              </p>
            </section>

            {/* output level */}
            <section className="max-w-sm space-y-2">
              <label
                htmlFor="md-gain"
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
              >
                Output level
              </label>
              <input
                id="md-gain"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={gain}
                onChange={(e) => applyGain(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-sm text-muted-foreground">
                Every sound is a grain of his real recording, routed through the
                shared ear-safety master bus.
              </p>
            </section>
          </div>
        )}
      </div>

      {/* ── design notes modal ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                play alongside Karel&apos;s own piano catalog on a MIDI keyboard,
                and his real recorded phrases answer you — entering{" "}
                <em>ahead</em> of your line to complete the phrase you&apos;re
                implying?
              </p>
              <p>
                <span className="text-foreground">Retrieval.</span> On Begin we load
                three-to-four of his real recordings plus their note analyses and
                fold them into one corpus. Each note you play is matched
                (CataRT-style: pitch-class first, then closeness in register) to a
                real note he actually played, and a short grain of{" "}
                <em>his recording at that moment</em> is re-triggered. Your key
                makes no tone of its own — it retrieves his.
              </p>
              <p>
                <span className="text-foreground">
                  Anticipation, made visible.
                </span>{" "}
                Your last few notes form a short line. We search his playing for
                where a similar pitch-class shape occurred and surface the notes he
                played <em>next</em> — his likely completion. Those appear on his
                staff in the <span className="text-primary">future</span>, right of
                the playhead, as a translucent ghost constellation, drifting toward
                &quot;now.&quot; When your phrase settles, that phrase actually
                plays from his recording — his piano completing your line. This is
                the ReaLJam idea (arXiv:2502.21267): a partner that predicts the
                performance and visually conveys its plan. See also CataRT /
                corpus-based concatenative synthesis (Diemo Schwarz, IRCAM) and
                &quot;Real-Time Human-AI Musical Co-Performance&quot;
                (arXiv:2604.07612).
              </p>
              <p>
                <span className="text-foreground">Audio (rule 10).</span> Every
                audible sound is Karel&apos;s real recorded catalog, retrieved and
                re-triggered — never a synth or oscillator — routed through the
                shared safeMaster bus.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav
        slugs={["15808-mididuet", "15760-conduct", "15152-pulse", "15600-keepsake"]}
      />
    </main>
  );
}
