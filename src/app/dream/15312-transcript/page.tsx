"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15312 · transcript — READ his catalog talking to itself.
//
//   ONE QUESTION — What if you could READ his catalog talking to itself: a living
//   transcript of a real two-way conversation, each line a real recorded phrase
//   answering the one before it?
//
// A deep extension of 14656 · answerback (a single call→response) into a SELF-
// CONTINUING conversation rendered as a scrolling typographic transcript. After
// Start it runs on its own: the current phrase (contour + pitch-class + implied
// harmony) becomes the query for the next turn; the catalog answers, then answers
// its own answer, walking track to track. Every line is a REAL note-window sliced
// from a real decoded take — ZERO synthesis, ever.
//
//   INPUT   the self-propelling catalog chain (primary) + live steer sliders and
//           an OPTIONAL computer-keyboard inject (a human "you" turn).
//   OUTPUT  a DOM / type transcript; per-turn contour sparklines on a small
//           <canvas> (Canvas2D compute only).
//   TECHNIQUE  cross-catalog contour + HARMONIC retrieval with a MEMORY CHAIN.
//   PALETTE  achromatic — silver/gray on near-black.
//
//   Lineage: query-by-contour MIR retrieval; the Infinite Jukebox (Paul Lamere,
//   2012); the 2026 cross-catalog version-ID frontier (arXiv:2608.04543). The
//   anti-synthesis counterpart to LLM/RL jamming (RL-Duet 2020; arXiv:2606.11886).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import { runInput } from "./midi";
import { Sparkline } from "./sparkline";
import {
  SlicePlayer,
  buildBank,
  buildQuery,
  candidateKey,
  pickAnswer,
  pickOpening,
  queryFromCandidate,
  type CatalogBank,
  type Query,
  type Weights,
} from "./catalog";

// A varied subset of Karel's VERIFIED catalog (Welcome Home + Snowflake), kept
// small so the bank loads fast but wide enough that the conversation can roam.
const BANK_IDS = [
  "d57cfae6-f234-4d24-85fe-72a8ad93a44a", // Interplay
  "eba95845-cdbf-41d8-9c5d-8679686811ad", // Bath
  "8dafed88-4761-4dd3-a0f4-93f310441093", // Welcome Home
  "1f0a541e-df60-44a9-b839-5dc69a007d9f", // 2019
  "788fc202-db77-4f36-a7ff-dd0b6702ca20", // Rebound
  "734a09ce-84df-4f1f-93c1-11b08d303681", // Snowflake
  "549fc519-f7fc-4c38-a771-adaad2edbc81", // Ghost
];
const BANK_SEEDS = BANK_IDS.map((id) => ({
  id,
  title: REAL_TRACKS.find((t) => t.id === id)?.title ?? "Untitled",
}));

const PAUSE_BETWEEN_MS = 620; // musical rest between turns (turn-taking)
const HUMAN_PAUSE_MS = 700; // silence that ends a human injected phrase
const MAX_ROWS = 40; // keep the DOM bounded
const KEY_HINT = "a s d f g h j k l — play a phrase to inject a turn";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Row {
  id: number;
  speaker: "catalog" | "you";
  title: string;
  trackId: string;
  startTime: number;
  endTime: number;
  midis: number[];
  score: number;
  rootPc: number | null;
}

export default function TranscriptPage() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadedTitles, setLoadedTitles] = useState<string[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [spoken, setSpoken] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState<"catalog" | "you" | null>(null);
  const [inputLabel, setInputLabel] = useState("computer keyboard");
  const [showNotes, setShowNotes] = useState(false);

  // steer controls (state for the UI, refs for the live loop)
  const [temperature, setTemperature] = useState(0.35); // Echo ↔ Wander
  const [harmonic, setHarmonic] = useState(0.4); // melody ↔ harmony
  const [spread, setSpread] = useState(0.6); // anti-latch strength
  const weightsRef = useRef<Weights>({
    temperature: 0.35,
    harmonic: 0.4,
    spread: 0.6,
  });

  // audio / retrieval refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bankRef = useRef<CatalogBank | null>(null);
  const playerRef = useRef<SlicePlayer | null>(null);
  const disposeInputRef = useRef<(() => void) | null>(null);

  // conversation state (the memory chain)
  const runningRef = useRef(false);
  const queryRef = useRef<Query | null>(null);
  const prevKeyRef = useRef<string | null>(null);
  const visitCountsRef = useRef<Map<string, number>>(new Map());
  const nudgeRef = useRef(false);
  const turnTimerRef = useRef<number | null>(null);
  const rowIdRef = useRef(0);

  // human inject capture
  const phraseRef = useRef<number[]>([]);
  const pauseTimerRef = useRef<number | null>(null);

  // pulse (live-audio emphasis on the sounding row)
  const rafRef = useRef<number | null>(null);
  const pulseElRef = useRef<HTMLDivElement | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const appendRow = useCallback((row: Row) => {
    setRows((prev) => {
      const next = [...prev, row];
      return next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
    });
  }, []);

  // ── one autonomous turn: retrieve the next phrase, play its real slice ──────
  const nextTurn = useCallback(() => {
    if (!runningRef.current) return;
    const bank = bankRef.current;
    const player = playerRef.current;
    if (!bank || !player) return;

    const picked = queryRef.current
      ? pickAnswer(bank, queryRef.current, {
          prevKey: prevKeyRef.current,
          weights: weightsRef.current,
          visitCounts: visitCountsRef.current,
          forceDistant: nudgeRef.current,
        })
      : pickOpening(bank);
    nudgeRef.current = false;
    if (!picked) return;

    const c = picked.candidate;
    const buf = bank.buffers.get(c.trackId);
    if (!buf) {
      // rare: skip and try again shortly
      prevKeyRef.current = null;
      turnTimerRef.current = window.setTimeout(nextTurn, 400);
      return;
    }

    // MEMORY: this phrase becomes the query for the next turn.
    prevKeyRef.current = candidateKey(c);
    queryRef.current = queryFromCandidate(c);
    visitCountsRef.current.set(
      c.trackId,
      (visitCountsRef.current.get(c.trackId) ?? 0) + 1,
    );

    const id = ++rowIdRef.current;
    appendRow({
      id,
      speaker: "catalog",
      title: c.title,
      trackId: c.trackId,
      startTime: c.startTime,
      endTime: c.endTime,
      midis: c.midis,
      score: picked.score,
      rootPc: c.harmony.rootPc,
    });
    setActiveId(id);
    setSpeaking("catalog");
    setSpoken((prev) => {
      if (prev.has(c.trackId)) return prev;
      const n = new Set(prev);
      n.add(c.trackId);
      return n;
    });

    const dur = player.play(buf, c.startTime, c.endTime);
    if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = window.setTimeout(
      () => {
        if (runningRef.current) nextTurn();
      },
      dur * 1000 + PAUSE_BETWEEN_MS,
    );
  }, [appendRow]);

  // ── human inject: finalize the played phrase into a "you" turn ──────────────
  const finalizeHuman = useCallback(() => {
    const midis = phraseRef.current.slice();
    phraseRef.current = [];
    if (midis.length < 2) {
      // too short — just let the chain resume
      if (runningRef.current) {
        turnTimerRef.current = window.setTimeout(nextTurn, 300);
      }
      return;
    }
    const id = ++rowIdRef.current;
    appendRow({
      id,
      speaker: "you",
      title: "you",
      trackId: "__you__",
      startTime: 0,
      endTime: 0,
      midis,
      score: 1,
      rootPc: null,
    });
    setActiveId(id);
    setSpeaking("you");
    // the human phrase seeds the next query; any answer is allowed.
    queryRef.current = buildQuery(midis);
    prevKeyRef.current = null;
    // answer the human right away, continuing the chain from there.
    if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current);
    turnTimerRef.current = window.setTimeout(nextTurn, 260);
  }, [appendRow, nextTurn]);

  // ── a note arrives from the keyboard/MIDI: the visitor takes the floor ──────
  const handleNoteOn = useCallback(
    (midi: number) => {
      if (!runningRef.current) return;
      const ctx = ctxRef.current;
      if (ctx && ctx.state === "suspended") void ctx.resume();
      // interrupt the autonomous chain: the human is speaking now
      if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current);
      playerRef.current?.stop();
      setSpeaking("you");
      phraseRef.current.push(midi);
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = window.setTimeout(finalizeHuman, HUMAN_PAUSE_MS);
    },
    [finalizeHuman],
  );

  // ── the pulse loop: emphasize the sounding row with the live audio level ────
  useEffect(() => {
    const frame = () => {
      const master = masterRef.current;
      const el = pulseElRef.current;
      if (master && el) {
        const an = master.analyser;
        if (!freqRef.current || freqRef.current.length !== an.frequencyBinCount) {
          freqRef.current = new Uint8Array(an.frequencyBinCount);
        }
        an.getByteFrequencyData(freqRef.current);
        let sum = 0;
        for (let i = 0; i < freqRef.current.length; i++) sum += freqRef.current[i];
        const level = sum / (freqRef.current.length * 255);
        el.style.transform = `scaleY(${0.25 + Math.min(1, level * 3.2) * 0.75})`;
        el.style.opacity = `${0.35 + Math.min(1, level * 3) * 0.6}`;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── auto-scroll to the newest turn ─────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [rows]);

  // ── full teardown ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current);
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      disposeInputRef.current?.();
      playerRef.current?.dispose();
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── Start: build audio + bank, then let the conversation self-propel ────────
  const start = useCallback(async () => {
    if (running || loading) return;
    setError(null);
    setLoading(true);
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      masterRef.current = createSafeMaster(ctx, { gain: 0.85 });
      playerRef.current = new SlicePlayer(ctx, masterRef.current.input);

      const bank = await buildBank(ctx, BANK_SEEDS, (m) => setLoadMsg(m));
      if (bank.candidates.length === 0) {
        throw new Error(
          "Could not load any of Karel's tracks (network?). Try again.",
        );
      }
      bankRef.current = bank;
      setLoadedTitles(bank.loadedTitles);
      setLoadedIds(bank.loadedIds);
      setLoadMsg("");

      disposeInputRef.current = runInput({
        onNoteOn: handleNoteOn,
        onStatus: (label) => setInputLabel(label),
      });

      runningRef.current = true;
      setRunning(true);
      // kick off the self-continuing chain
      turnTimerRef.current = window.setTimeout(nextTurn, 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start.");
    } finally {
      setLoading(false);
    }
  }, [running, loading, handleNoteOn, nextTurn]);

  const nudge = useCallback(() => {
    nudgeRef.current = true;
  }, []);

  const setTemp = (v: number) => {
    setTemperature(v);
    weightsRef.current = { ...weightsRef.current, temperature: v };
  };
  const setHarm = (v: number) => {
    setHarmonic(v);
    weightsRef.current = { ...weightsRef.current, harmonic: v };
  };
  const setSpr = (v: number) => {
    setSpread(v);
    weightsRef.current = { ...weightsRef.current, spread: v };
  };

  const caption =
    speaking === "you"
      ? "you — composing a turn…"
      : speaking === "catalog"
        ? "the catalog answers itself"
        : running
          ? "listening…"
          : "";

  return (
    <main className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      {/* nav */}
      <a
        href="/dream"
        className="absolute left-4 top-4 z-30 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </a>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        design notes
      </button>

      {/* header */}
      <header className="shrink-0 space-y-2 px-6 pb-4 pt-14">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          15312 · transcript
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          The catalog talking to itself
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A living transcript of a two-way conversation — each line a real
          recorded phrase answering the one before it. After Start it continues on
          its own: every answer&apos;s shape and harmony seed the next retrieval,
          walking take to take across his catalog.
        </p>
      </header>

      {/* spoken-tracks strip — the catalog getting drawn in */}
      {loadedTitles.length > 0 && (
        <div className="shrink-0 px-6 pb-3">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            catalog · voices heard
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {loadedIds.map((id, i) => (
              <span
                key={id}
                className={`font-mono text-sm ${
                  spoken.has(id)
                    ? "text-foreground"
                    : "text-muted-foreground/45"
                }`}
              >
                {loadedTitles[i]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* the transcript stage */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-4"
      >
        {rows.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-md text-center text-base text-muted-foreground">
              {loading
                ? loadMsg || "loading his catalog…"
                : running
                  ? "the conversation is beginning…"
                  : "Press Start — the catalog will begin answering itself."}
            </p>
          </div>
        )}

        <ol className="mx-auto max-w-3xl space-y-px">
          {rows.map((row) => {
            const isActive = row.id === activeId;
            const isYou = row.speaker === "you";
            return (
              <li
                key={row.id}
                className={`flex items-center gap-3 rounded-md py-2 pr-2 transition-colors ${
                  isYou ? "pl-2" : "pl-6"
                } ${isActive ? "bg-muted/60" : ""}`}
              >
                {/* connective thread + live pulse */}
                <div className="flex h-7 w-3 shrink-0 items-center justify-center">
                  {isActive ? (
                    <div
                      ref={pulseElRef}
                      className="h-6 w-[3px] origin-center rounded-full bg-foreground"
                      style={{ transform: "scaleY(0.3)", opacity: 0.5 }}
                    />
                  ) : (
                    <div className="h-6 w-px rounded-full bg-border" />
                  )}
                </div>

                {/* speaker + timestamp */}
                <div className="w-40 shrink-0">
                  <span
                    className={`font-mono text-sm ${
                      isActive ? "text-foreground" : "text-muted-foreground"
                    } ${isYou ? "italic" : ""}`}
                  >
                    {row.title}
                  </span>
                  {!isYou && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground/70">
                      {mmss(row.startTime)}
                    </span>
                  )}
                </div>

                {/* contour sparkline */}
                <Sparkline midis={row.midis} active={isActive} />

                {/* meta: harmony + match */}
                <div className="ml-auto hidden shrink-0 text-right sm:block">
                  {isYou ? (
                    <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground/70">
                      your turn
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground/70">
                      {row.rootPc !== null ? `${NOTE_NAMES[row.rootPc]} · ` : ""}
                      {(row.score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* controls + status */}
      <div className="shrink-0 space-y-3 border-t border-border px-6 py-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {running && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <Slider
              label="Echo ↔ Wander"
              value={temperature}
              onChange={setTemp}
            />
            <Slider
              label="Harmonic weight"
              value={harmonic}
              onChange={setHarm}
            />
            <Slider label="Spread" value={spread} onChange={setSpr} />
            <button
              onClick={nudge}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              nudge — jump further
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            {running && caption && (
              <p className="text-sm text-primary">{caption}</p>
            )}
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              {running ? `inject · ${inputLabel} · ${KEY_HINT}` : "self-propelling — no input device needed"}
            </p>
          </div>

          {!running && (
            <button
              onClick={start}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "loading his catalog…" : "Start the transcript"}
            </button>
          )}
        </div>
      </div>

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                This turns answerback&apos;s single call→response into a{" "}
                <span className="text-foreground">self-continuing</span>{" "}
                conversation. After Start it runs alone: the phrase just heard
                becomes the query for the next turn, so the catalog answers, then
                answers its own answer.
              </p>
              <p>
                Each candidate is a window of consecutive notes from a real take,
                carrying its melodic{" "}
                <span className="text-foreground">contour</span>, a pitch-class
                histogram, and its local{" "}
                <span className="text-foreground">chord context</span>. Retrieval
                scores contour + pitch-class + a NEW{" "}
                <span className="text-foreground">harmonic fit</span> (does its
                chord context relate to the current phrase&apos;s implied
                harmony?) + length, then draws from the top — excluding the phrase
                just heard and biasing toward tracks heard least (the{" "}
                <span className="text-foreground">memory chain</span>), so the
                whole catalog gets pulled in.
              </p>
              <p>
                <span className="text-foreground">Echo ↔ Wander</span> sets how
                tightly each turn echoes the last;{" "}
                <span className="text-foreground">Harmonic weight</span> trades
                melody against chord-fit;{" "}
                <span className="text-foreground">Spread</span> is the anti-latch
                pull toward unheard tracks; <em>nudge</em> leaps to a more distant
                answer. You can also play a phrase on the keyboard to inject a
                human &ldquo;you&rdquo; turn.
              </p>
              <p>
                Every line is a real time-slice of a real recording — never a
                synth. Lineage: query-by-contour retrieval and the Infinite
                Jukebox (Paul&nbsp;Lamere,&nbsp;2012); the artistic, real-audio
                take on the 2026 cross-catalog version-ID frontier.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15312-transcript"]} />
    </main>
  );
}

// ── a minimal achromatic slider ────────────────────────────────────────────────
function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-border accent-foreground"
      />
    </label>
  );
}
