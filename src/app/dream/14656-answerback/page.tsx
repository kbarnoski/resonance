"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14656 · answerback — a call-and-RESPONSE duet with your own recorded self.
//
//   ONE QUESTION — What if playing a phrase called back an ANSWER from your own
//   recorded self?
//
// Karel plays a short phrase on his MIDI keyboard (computer-keyboard fallback);
// when he pauses, the machine ANSWERS by searching across his real recordings
// for the phrase whose melodic CONTOUR + pitch-class affinity best matches what
// he just played, and plays that phrase back — sliced from the REAL decoded
// audio of that take. His call, the catalog's answer, his call again: he is
// composing a conversation with his recorded self.
//
//   INPUT   Web MIDI (his instrument) — or the computer keyboard as fallback.
//   RETRIEVAL  query-by-contour over a precomputed bank of note-windows drawn
//              from `loadTrackAnalysis` across a subset of his catalog.
//   OUTPUT  answer = real AudioBuffer slices via safeMaster; his live call is
//           VISUAL-ONLY (no synth ever). WebGL two-voice stage in three.js.
//
//   Lineage: query-by-humming / query-by-contour MIR retrieval + the
//   call-and-response tradition; cf. the Infinite Jukebox (Paul Lamere, 2012).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import { runInput } from "./midi";
import { DuetScene } from "./scene";
import {
  AnswerPlayer,
  buildBank,
  buildQuery,
  candidateKey,
  pickAnswer,
  type CatalogBank,
} from "./catalog";

// A varied subset of Karel's catalog for the candidate bank (kept small so it
// loads fast — enough for real answer variety).
const BANK_IDS = [
  "d57cfae6-f234-4d24-85fe-72a8ad93a44a", // Interplay
  "8dafed88-4761-4dd3-a0f4-93f310441093", // Welcome Home
  "1f0a541e-df60-44a9-b839-5dc69a007d9f", // 2019
  "788fc202-db77-4f36-a7ff-dd0b6702ca20", // Rebound
  "734a09ce-84df-4f1f-93c1-11b08d303681", // Snowflake
];
const BANK_SEEDS = BANK_IDS.map((id) => ({
  id,
  title: REAL_TRACKS.find((t) => t.id === id)?.title ?? "Untitled",
}));

const PAUSE_MS = 700; // silence that ends a phrase
const KEY_HINT = "a s d f g h j k l  ·  w e t y u o p (sharps)  ·  z x c v b n m (lower)";
const DEMO_PHRASE = [62, 65, 67, 69, 67, 65, 62, 64]; // a call to answer

type Turn = "idle" | "you" | "catalog";

interface AnswerInfo {
  title: string;
  start: number;
  end: number;
  score: number;
}

export default function AnswerbackPage() {
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [inputLabel, setInputLabel] = useState("requesting input…");
  const [hasMidi, setHasMidi] = useState(false);
  const [loadedTitles, setLoadedTitles] = useState<string[]>([]);
  const [turn, setTurn] = useState<Turn>("idle");
  const [answer, setAnswer] = useState<AnswerInfo | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // audio / retrieval refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bankRef = useRef<CatalogBank | null>(null);
  const playerRef = useRef<AnswerPlayer | null>(null);
  const disposeInputRef = useRef<(() => void) | null>(null);

  // scene / loop refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<DuetScene | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // phrase-capture refs
  const phraseRef = useRef<number[]>([]);
  const pauseTimerRef = useRef<number | null>(null);
  const prevKeyRef = useRef<string | null>(null);
  const turnRef = useRef<Turn>("idle");
  const answerTimerRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const setTurnBoth = useCallback((t: Turn) => {
    turnRef.current = t;
    setTurn(t);
    sceneRef.current?.setMode(t);
  }, []);

  // ── the answer: retrieve + play a slice of the real catalog ────────────────
  const finalizePhrase = useCallback(() => {
    const midis = phraseRef.current.slice();
    phraseRef.current = [];
    if (midis.length < 2) {
      setTurnBoth("idle");
      return;
    }
    const bank = bankRef.current;
    const player = playerRef.current;
    if (!bank || !player) {
      setTurnBoth("idle");
      return;
    }
    const q = buildQuery(midis);
    const picked = pickAnswer(bank, q, prevKeyRef.current);
    if (!picked) {
      setTurnBoth("idle");
      return;
    }
    const c = picked.candidate;
    const buf = bank.buffers.get(c.trackId);
    if (!buf) {
      setTurnBoth("idle");
      return;
    }
    prevKeyRef.current = candidateKey(c);
    setTurnBoth("catalog");
    setAnswer({
      title: c.title,
      start: c.startTime,
      end: c.endTime,
      score: picked.score,
    });
    const dur = player.play(buf, c.startTime, c.endTime);
    if (answerTimerRef.current) window.clearTimeout(answerTimerRef.current);
    answerTimerRef.current = window.setTimeout(
      () => {
        if (turnRef.current === "catalog") setTurnBoth("idle");
      },
      dur * 1000 + 120,
    );
  }, [setTurnBoth]);

  // ── a note arrives (from MIDI, keyboard, or the demo) ──────────────────────
  const handleNoteOn = useCallback(
    (midi: number, velocity: number) => {
      if (!runningRef.current) return;
      const ctx = ctxRef.current;
      if (ctx && ctx.state === "suspended") void ctx.resume();

      // his turn takes over: interrupt any sounding answer
      if (turnRef.current === "catalog") {
        playerRef.current?.stop();
        setAnswer(null);
      }
      setTurnBoth("you");
      sceneRef.current?.noteOn(midi, velocity);
      phraseRef.current.push(midi);

      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = window.setTimeout(finalizePhrase, PAUSE_MS);
    },
    [finalizePhrase, setTurnBoth],
  );

  const handleNoteOff = useCallback(() => {
    // onsets drive phrase capture; note-off is only for held-key de-dup (in midi.ts)
  }, []);

  // ── the demo call — fires a canned phrase so a reviewer sees the loop ───────
  const playDemoCall = useCallback(() => {
    if (!runningRef.current) return;
    DEMO_PHRASE.forEach((m, i) => {
      window.setTimeout(() => handleNoteOn(m, 92), i * 210);
    });
  }, [handleNoteOn]);

  // ── mount: build the WebGL stage + drive the render loop ───────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    try {
      sceneRef.current = new DuetScene(container);
    } catch {
      setWebglError(true);
      return;
    }
    let last = performance.now();
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // feed the cool form with the live level of the sounding answer
      if (turnRef.current === "catalog" && masterRef.current) {
        const an = masterRef.current.analyser;
        if (!freqRef.current || freqRef.current.length !== an.frequencyBinCount) {
          freqRef.current = new Uint8Array(an.frequencyBinCount);
        }
        an.getByteFrequencyData(freqRef.current);
        let sum = 0;
        for (let i = 0; i < freqRef.current.length; i++) sum += freqRef.current[i];
        const level = sum / (freqRef.current.length * 255);
        sceneRef.current?.setAnswerLevel(level);
      }
      sceneRef.current?.update(dt);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
      if (answerTimerRef.current) window.clearTimeout(answerTimerRef.current);
      disposeInputRef.current?.();
      playerRef.current?.dispose();
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── Start the duet: audio + bank + live input ──────────────────────────────
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
      playerRef.current = new AnswerPlayer(ctx, masterRef.current.input);

      const bank = await buildBank(ctx, BANK_SEEDS, (m) => setLoadMsg(m));
      if (bank.candidates.length === 0) {
        throw new Error(
          "Could not load any of Karel's tracks (network?). Try again.",
        );
      }
      bankRef.current = bank;
      setLoadedTitles(bank.loadedTitles);
      setLoadMsg("");

      disposeInputRef.current = runInput({
        onNoteOn: handleNoteOn,
        onNoteOff: handleNoteOff,
        onStatus: (label, midi) => {
          setInputLabel(label);
          setHasMidi(midi);
        },
      });

      runningRef.current = true;
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start.");
    } finally {
      setLoading(false);
    }
  }, [running, loading, handleNoteOn, handleNoteOff]);

  const turnCaption =
    turn === "you"
      ? "listening to your call…"
      : turn === "catalog"
        ? "the catalog answers"
        : "your turn — play a phrase";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* WebGL stage */}
      <div ref={containerRef} className="absolute inset-0" />

      {webglError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-destructive">
            This piece needs WebGL, which isn&apos;t available in this browser.
            The two voices are rendered in three.js and can&apos;t fall back to
            2D.
          </p>
        </div>
      )}

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
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-6 pt-14">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            14656 · answerback
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            A duet with your recorded self
          </h1>
          <p className="text-base text-muted-foreground">
            Play a phrase; when you pause, the machine finds the closest phrase
            across your own recordings and answers with the real audio.
          </p>
        </header>
      </div>

      {/* center caption — spatial legend for the turn-taking */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {/* the two words are tinted to echo the two voices on the WebGL stage */}
          <span style={{ color: "#ff9a3c" }}>your call</span>
          <span className="mx-2 opacity-40">·—·</span>
          <span style={{ color: "#3fd8d0" }}>the answer</span>
        </p>
      </div>

      {/* bottom controls + status */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-6">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}

        {running && (
          <div className="max-w-2xl space-y-1">
            <p className="text-sm text-primary">{turnCaption}</p>
            {answer && turn === "catalog" && (
              <p className="text-sm text-muted-foreground">
                answered from{" "}
                <span className="text-foreground">{answer.title}</span> ·{" "}
                {answer.start.toFixed(1)}–{answer.end.toFixed(1)}s · match{" "}
                {(answer.score * 100).toFixed(0)}%
              </p>
            )}
          </div>
        )}

        {running && (
          <p className="max-w-2xl font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {KEY_HINT}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            input ·{" "}
            <span className={hasMidi ? "text-primary" : "text-muted-foreground"}>
              {running ? inputLabel : "start to connect"}
            </span>
          </p>
          {loadedTitles.length > 0 && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              catalog · {loadedTitles.join(" · ")}
            </p>
          )}
          {loading && loadMsg && (
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {loadMsg}
            </p>
          )}
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={start}
              disabled={loading || webglError}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "loading your catalog…" : "Start the duet"}
            </button>
          ) : (
            <button
              onClick={playDemoCall}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play me a demo call
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
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>
                This is a call-and-<span className="text-foreground">response</span>{" "}
                duet, not a re-arrangement of one take. You play a phrase on a
                MIDI keyboard (or the computer keyboard); a ~700&nbsp;ms pause
                ends it.
              </p>
              <p>
                Your phrase becomes a melodic{" "}
                <span className="text-foreground">contour</span> (its sequence of
                pitch intervals) plus a pitch-class histogram. A precomputed{" "}
                <span className="text-foreground">bank</span> of note-windows
                drawn from your real recordings is scored by contour similarity +
                pitch-class affinity + length; a strong match is chosen (with a
                little variety), and its exact time-slice is played from the{" "}
                <span className="text-foreground">real decoded audio</span> of
                that take.
              </p>
              <p>
                The warm form on the left is your call (visual only — never
                synthesized); the cool form on the right blooms to the live audio
                when the catalog answers. Lineage: the query-by-humming /
                query-by-contour retrieval tradition and call-and-response, kin to
                the Infinite Jukebox (Paul&nbsp;Lamere,&nbsp;2012) but retrieving
                across a catalog rather than within one song.
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

      <PrototypeNav slugs={["14656-answerback"]} />
    </main>
  );
}
