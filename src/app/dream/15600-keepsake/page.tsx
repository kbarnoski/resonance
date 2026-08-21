"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15600-keepsake — "You may keep only what you reach for."
//
// One of Karel's real piano takes plays through exactly ONCE, in real time, and
// does NOT loop. Its notes stream as a horizontal RIVER of marks flowing
// right→left past a fixed vertical NOW line. As sound crosses NOW you PRESS AND
// HOLD (pointer on the canvas, or spacebar — both always live) to KEEP the
// currently-sounding time-window: those marks burn to luminous bone-white and
// are copied into a growing KEPT strip along the bottom. Everything you do NOT
// reach for, once it scrolls off the left edge, is GONE — no rewind, no re-grab.
// You cannot keep it all in practice: attention itself is the scarcity.
//
// When the take finishes its single pass, the piece REPLAYS containing ONLY the
// kept slices, stitched in original time-order with the gaps closed up. The
// second listen is the negative image of your own attention — only what you
// chose to save.
//
// Audio: the ONLY audible sound is Karel's real decoded AudioBuffer. No
// oscillators, no synth, no generated tones — the streaming pass is the whole
// buffer played once; the keepsake replay is EXACT slices of that same buffer,
// scheduled back-to-back with tiny equal-power fades. Everything routes through
// the shared ear-safety master.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

type Phase = "idle" | "loading" | "streaming" | "keepsake" | "error";

/** A kept time-interval, in seconds relative to the take's playback position. */
type Interval = [number, number];

// Bath — slow, spacious, ideal for reaching.
const DEFAULT_ID = "eba95845-cdbf-41d8-9c5d-8679686811ad";

const SECONDS_AHEAD = 6; // seconds of the river visible to the RIGHT of NOW
const NOW_FRAC = 0.3; // NOW line sits this far from the left edge
const STRIP_H = 52; // KEPT strip band height (css px)
const FADE = 0.008; // per-fragment replay fade (≈8ms)
const MIN_GRAB = 0.04; // ignore accidental micro-taps (seconds)
const MERGE_GAP = 0.05; // merge intervals closer than this (seconds)

// palette (canvas art only — raw hex/hsl is fine here, never for chrome)
const GROUND = "#07080b";
const GRID = "rgba(122,140,162,0.07)";
const GRID_OCT = "rgba(122,140,162,0.12)";
const BONE = "228,222,205"; // dim streaming marks
const LIVE = "255,250,236"; // marks crossing NOW
const KEEP = "244,248,255"; // luminous kept white
const ACCENT = "hsl(190 60% 85%)"; // cool cyan-white ink

/** Downsampled amplitude envelope, used only when note analysis is missing. */
interface Envelope {
  binDur: number;
  peaks: Float32Array;
}

export default function KeepsakePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [fallback, setFallback] = useState(false);

  const [activeId, setActiveId] = useState<string>(DEFAULT_ID);
  const [title, setTitle] = useState<string>("Bath");
  const [keyName, setKeyName] = useState<string>("");

  // live readouts (throttled from the rAF loop)
  const [reaching, setReaching] = useState(false);
  const [keptSecs, setKeptSecs] = useState(0);
  const [fragCount, setFragCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // ── audio graph + timeline refs (read by rAF / handlers, off render path) ──
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const durationRef = useRef(0);
  const notesRef = useRef<TrackNote[]>([]);
  const envRef = useRef<Envelope | null>(null);
  const pitchLoRef = useRef(36);
  const pitchHiRef = useRef(84);

  const streamSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const replaySrcsRef = useRef<AudioBufferSourceNode[]>([]);
  const startTimeRef = useRef(0); // ctx time at which the single pass began
  const replayStartRef = useRef(0);
  const replayEndRef = useRef(0);

  // kept intervals + the in-progress grab
  const intervalsRef = useRef<Interval[]>([]);
  const grabStartRef = useRef<number | null>(null);
  const keepsakeRef = useRef<Interval[]>([]); // merged, frozen at finalize

  // phase + loop plumbing
  const phaseRef = useRef<Phase>("idle");
  const reducedRef = useRef(false);
  const finalizedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    reducedRef.current = reducedMotion;
  }, [reducedMotion]);

  // prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // ── playback position of the single pass, clamped to the take duration ─────
  const playPos = useCallback((): number => {
    const ctx = ctxRef.current;
    if (!ctx) return 0;
    const p = ctx.currentTime - startTimeRef.current;
    return Math.max(0, Math.min(durationRef.current, p));
  }, []);

  // ── stop every scheduled source (single pass + replay fragments) ───────────
  const stopAllSources = useCallback(() => {
    const s = streamSrcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      streamSrcRef.current = null;
    }
    for (const r of replaySrcsRef.current) {
      try {
        r.onended = null;
        r.stop();
      } catch {
        /* already stopped */
      }
    }
    replaySrcsRef.current = [];
  }, []);

  // ── the keepsake replay: EXACT kept slices, stitched back-to-back ──────────
  const runReplay = useCallback((frags: Interval[]) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !master || !buffer) return;

    stopAllSources();
    const when0 = ctx.currentTime + 0.12;
    let when = when0;
    const srcs: AudioBufferSourceNode[] = [];
    for (const [a, b] of frags) {
      const dur = b - a;
      if (dur <= 0) continue;
      const g = ctx.createGain();
      g.connect(master.input); // NEVER ctx.destination directly
      // equal-power-ish micro fades to kill edge clicks
      const f = Math.min(FADE, dur / 2);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(1, when + f);
      g.gain.setValueAtTime(1, when + dur - f);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.connect(g);
      s.start(when, a, dur);
      srcs.push(s);
      when += dur;
    }
    replaySrcsRef.current = srcs;
    replayStartRef.current = when0;
    replayEndRef.current = when;
    void ctx.resume().catch(() => {});
  }, [stopAllSources]);

  // ── end of the single pass → freeze intervals, flip to keepsake, replay ────
  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;

    // close any grab still held when the take ran out
    if (grabStartRef.current !== null) {
      const end = durationRef.current;
      if (end - grabStartRef.current >= MIN_GRAB) {
        intervalsRef.current.push([grabStartRef.current, end]);
      }
      grabStartRef.current = null;
    }
    const merged = mergeIntervals(intervalsRef.current);
    keepsakeRef.current = merged;

    stopAllSources();
    setPhase("keepsake");
    setReaching(false);
    setKeptSecs(merged.reduce((a, [s, e]) => a + (e - s), 0));
    setFragCount(merged.length);

    if (merged.length > 0) runReplay(merged);
  }, [runReplay, stopAllSources]);

  const finalizeRef = useRef(finalize);
  useEffect(() => {
    finalizeRef.current = finalize;
  }, [finalize]);

  // ── press-and-hold to KEEP (shared by pointer + spacebar) ──────────────────
  const beginGrab = useCallback(() => {
    if (phaseRef.current !== "streaming") return;
    if (grabStartRef.current !== null) return; // ignore key-repeat / re-press
    grabStartRef.current = playPos();
    setReaching(true);
  }, [playPos]);

  const endGrab = useCallback(() => {
    const start = grabStartRef.current;
    if (start === null) return;
    grabStartRef.current = null;
    setReaching(false);
    const end = playPos();
    if (end - start >= MIN_GRAB) {
      intervalsRef.current.push([start, end]);
      const merged = mergeIntervals(intervalsRef.current);
      setKeptSecs(merged.reduce((a, [s, e]) => a + (e - s), 0));
      setFragCount(merged.length);
    }
  }, [playPos]);

  // spacebar as an equal alternative — always live during streaming
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        beginGrab();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        endGrab();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started, beginGrab, endGrab]);

  // ── load one real take + its analysis, then begin the single pass ──────────
  const startPass = useCallback(
    async (id: string) => {
      stopAllSources();
      intervalsRef.current = [];
      keepsakeRef.current = [];
      grabStartRef.current = null;
      finalizedRef.current = false;
      setReaching(false);
      setKeptSecs(0);
      setFragCount(0);
      setElapsed(0);
      setActiveId(id);
      setPhase("loading");

      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new Ctx();
        ctxRef.current = ctx;
        masterRef.current = createSafeMaster(ctx);
      }
      await ctx.resume().catch(() => {});

      try {
        const [audio, analysis] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id),
        ]);
        bufferRef.current = audio.buffer;
        durationRef.current = audio.buffer.duration;
        setTitle(audio.title);
        setKeyName(
          analysis?.key_signature ?? analysis?.summary?.key_center ?? "",
        );

        const notes = analysis?.notes ?? [];
        if (notes.length > 8) {
          notesRef.current = notes;
          envRef.current = null;
          setFallback(false);
          const { lo, hi } = pitchRange(notes);
          pitchLoRef.current = lo;
          pitchHiRef.current = hi;
        } else {
          // no note roll → scroll the amplitude envelope instead (still works)
          notesRef.current = [];
          envRef.current = buildEnvelope(audio.buffer);
          setFallback(true);
        }

        // begin the single, non-looping pass
        const src = ctx.createBufferSource();
        src.buffer = audio.buffer;
        src.connect(masterRef.current!.input);
        src.onended = () => {
          if (streamSrcRef.current === src) finalizeRef.current();
        };
        streamSrcRef.current = src;
        startTimeRef.current = ctx.currentTime + 0.08;
        src.start(startTimeRef.current);
        setPhase("streaming");
      } catch {
        setPhase("error");
      }
    },
    [stopAllSources],
  );

  const handleStart = useCallback(() => {
    if (typeof window === "undefined") return;
    setStarted(true);
    void startPass(activeId);
  }, [activeId, startPass]);

  const handleReachAgain = useCallback(() => {
    void startPass(activeId);
  }, [activeId, startPass]);

  const handlePlayKeepsake = useCallback(() => {
    if (keepsakeRef.current.length > 0) runReplay(keepsakeRef.current);
  }, [runReplay]);

  // full teardown
  useEffect(
    () => () => {
      stopAllSources();
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    },
    [stopAllSources],
  );

  // ── the single Canvas2D loop: river while streaming, keepsake after ────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let c2d: CanvasRenderingContext2D | null = null;
    try {
      c2d = canvas.getContext("2d");
    } catch {
      c2d = null;
    }
    if (!c2d) return;

    const master = masterRef.current;
    const freqBuf = master
      ? new Uint8Array(master.analyser.frequencyBinCount)
      : new Uint8Array(0);
    const readLevel = () => {
      if (!master) return 0;
      master.analyser.getByteFrequencyData(freqBuf);
      let sum = 0;
      const n = Math.min(freqBuf.length, 64);
      for (let i = 0; i < n; i++) sum += freqBuf[i];
      return sum / (n * 255);
    };

    let raf = 0;
    let lastReadout = 0;
    const loop = () => {
      const ph = phaseRef.current;
      const level = readLevel();

      if (ph === "streaming") {
        const pos = playPos();
        drawRiver(c2d!, {
          pos,
          level,
          reduced: reducedRef.current,
          notes: notesRef.current,
          env: envRef.current,
          duration: durationRef.current,
          pitchLo: pitchLoRef.current,
          pitchHi: pitchHiRef.current,
          intervals: intervalsRef.current,
          grabStart: grabStartRef.current,
        });
        // throttled numeric readouts
        const now = performance.now();
        if (now - lastReadout > 200) {
          lastReadout = now;
          setElapsed(pos);
          if (grabStartRef.current !== null) {
            const live: Interval[] = [
              ...intervalsRef.current,
              [grabStartRef.current, pos],
            ];
            const merged = mergeIntervals(live);
            setKeptSecs(merged.reduce((a, [s, e]) => a + (e - s), 0));
            setFragCount(merged.length);
          }
        }
        // end-of-pass safety net (in case onended is late)
        if (pos >= durationRef.current - 0.001) finalizeRef.current();
      } else if (ph === "keepsake") {
        const ctx = ctxRef.current;
        const t = ctx ? ctx.currentTime : 0;
        const total = replayEndRef.current - replayStartRef.current;
        const played = total > 0 ? (t - replayStartRef.current) / total : 0;
        drawKeepsake(c2d!, {
          frags: keepsakeRef.current,
          progress: Math.max(0, Math.min(1, played)),
          level,
          reduced: reducedRef.current,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, playPos]);

  // ── readouts ───────────────────────────────────────────────────────────────
  const dur = durationRef.current;
  const remaining = Math.max(0, dur - elapsed);
  const keptPct = dur > 0 ? Math.round((keptSecs / dur) * 100) : 0;

  return (
    <main className="relative min-h-dvh w-full bg-background text-foreground">
      {/* pre-start gate */}
      {!started && (
        <div className="flex min-h-dvh items-center justify-center px-6">
          <div className="max-w-lg text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Real-time grab · a single, unrepeatable pass
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
              Keepsake
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              One of Karel&rsquo;s takes plays through{" "}
              <span className="text-foreground">exactly once</span> and does not
              loop. Its notes flow past a fixed NOW line. Press and hold — on the
              canvas or with the spacebar — to <span className="text-foreground">keep</span>{" "}
              what is sounding. Everything you don&rsquo;t reach for scrolls off
              and is gone. Then you hear only your keepsakes: the negative image
              of your own attention.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <label className="sr-only" htmlFor="track-pre">
                Track
              </label>
              <select
                id="track-pre"
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                className="min-h-[44px] w-full max-w-xs rounded-md border border-border bg-background/60 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin the pass
              </button>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Read the design notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* the instrument */}
      {started && (
        <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 pb-24 pt-8 sm:px-6">
          <header className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {phase === "keepsake" ? "Your keepsake" : "Real-time grab"}
            </p>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {keyName ? `${keyName} · ` : ""}Karel Barnoski
              </span>
            </div>
          </header>

          {/* status strip */}
          <section className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span
              className={`font-mono text-xs uppercase tracking-[0.18em] ${
                phase === "error"
                  ? "text-destructive"
                  : reaching
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {phase === "loading"
                ? "loading the take"
                : phase === "error"
                  ? "load failed"
                  : phase === "keepsake"
                    ? `${fragCount} fragment${fragCount === 1 ? "" : "s"} · ${keptSecs.toFixed(1)}s kept`
                    : reaching
                      ? "reaching — holding what sounds"
                      : "let it pass, or reach"}
            </span>
            {phase === "streaming" && (
              <span className="font-mono text-xs tracking-[0.14em] text-muted-foreground">
                {formatTime(elapsed)} / {formatTime(dur)} · {remaining <= 0 ? "" : `${formatTime(remaining)} left · `}
                {keptSecs.toFixed(1)}s kept ({keptPct}%)
              </span>
            )}
            {fallback && phase === "streaming" && (
              <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                waveform fallback (no note analysis)
              </span>
            )}
          </section>

          {phase === "error" && (
            <p className="text-base text-destructive">
              Couldn&rsquo;t load that recording. Pick another track and try
              again.
            </p>
          )}

          {/* the river / keepsake canvas */}
          <section className="relative">
            <canvas
              ref={canvasRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                beginGrab();
              }}
              onPointerUp={endGrab}
              onPointerLeave={endGrab}
              onPointerCancel={endGrab}
              className="h-[58dvh] max-h-[560px] min-h-[320px] w-full touch-none select-none rounded-md border border-border"
              style={{ background: GROUND }}
              aria-label="The performance river. Press and hold to keep what is sounding."
            />
            {phase === "streaming" && (
              <span className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                hold to keep
              </span>
            )}
          </section>

          {/* controls */}
          <section className="mt-auto flex flex-col gap-4 pt-2">
            {phase === "keepsake" && (
              <p className="text-base leading-relaxed text-muted-foreground">
                {fragCount === 0 ? (
                  <>
                    You reached for nothing — so nothing was saved. The take is
                    gone. Reach again for a fresh pass.
                  </>
                ) : (
                  <>
                    This is your keepsake:{" "}
                    <span className="text-foreground">
                      {fragCount} fragment{fragCount === 1 ? "" : "s"}
                    </span>
                    , {keptSecs.toFixed(1)}s — {keptPct}% of the take, stitched in
                    order with the gaps closed. It is the only version you get to
                    keep.
                  </>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {phase === "keepsake" && (
                <>
                  <button
                    type="button"
                    onClick={handleReachAgain}
                    className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Reach again
                  </button>
                  {fragCount > 0 && (
                    <button
                      type="button"
                      onClick={handlePlayKeepsake}
                      className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Play keepsake again
                    </button>
                  )}
                </>
              )}
              <label className="sr-only" htmlFor="track-live">
                Track
              </label>
              <select
                id="track-live"
                value={activeId}
                onChange={(e) => setActiveId(e.target.value)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
            <p className="font-mono text-[11px] leading-relaxed tracking-[0.06em] text-muted-foreground">
              The pass runs once and never rewinds. Changing the track selects
              what the next pass will be — Reach again starts it fresh.
            </p>
          </section>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Keepsake</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One of Karel&rsquo;s real takes plays through{" "}
                <strong>exactly once</strong>, in real time, and never loops. Its
                notes stream as a river of marks flowing right to left past a
                fixed NOW line — vertical position is pitch, size and brightness
                are velocity.
              </p>
              <p>
                As sound crosses NOW you <strong>press and hold</strong> to keep
                it — pointer on the canvas or the spacebar, both always live.
                While held, the sounding time-window burns to luminous bone-white
                and is copied into the growing KEPT strip at the bottom.
                Everything you don&rsquo;t reach for, once it scrolls off the left
                edge, is <strong>gone</strong>. No rewind, no re-grab. You cannot
                keep it all: attention itself is the scarcity — deciding what to
                reach for in the moment is the whole act.
              </p>
              <p>
                When the take finishes, the piece replays containing{" "}
                <strong>only the kept slices</strong>, stitched in original
                time-order with the gaps closed up. The second listen is the
                negative image of your attention. Every sound is an exact slice of
                Karel&rsquo;s decoded recording — no synthesis anywhere.
              </p>
              <p className="text-xs">
                References: the ACT-R declarative-memory activation model
                (Anderson), where a trace&rsquo;s survival depends on how often
                and how recently it is <em>reached for</em> — rehearsal is
                retention, and everything un-rehearsed decays. Selective auditory
                attention decoding (arXiv:2512.05528), which reconstructs the one
                stream a listener attends to out of a mixture — attention as an
                act that isolates a signal. And the conceptual lineage of
                subtraction / toll art — Yoko Ono&rsquo;s <em>Cut Piece</em>,
                erasure poetry, decay-through-listening — where the work is
                defined by what is taken away.
              </p>
              <p className="font-mono text-xs">
                input: single real-time pass of one catalog take · output:
                Canvas2D river + stitched keepsake replay · technique: interval
                capture on press-hold, exact-slice re-scheduling · palette:
                clinical archival bone + cold cyan ink
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav
        slugs={[
          "15600-keepsake",
          "15536-antiphon",
          "15488-vigil-chord",
          "15440-spheres",
        ]}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// interval math
// ─────────────────────────────────────────────────────────────────────────────

/** Merge overlapping / near-adjacent intervals into a sorted, disjoint set. */
function mergeIntervals(list: Interval[]): Interval[] {
  if (list.length === 0) return [];
  const sorted = list
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  if (sorted.length === 0) return [];
  const out: Interval[] = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur[0] <= last[1] + MERGE_GAP) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push([cur[0], cur[1]]);
    }
  }
  return out;
}

/** True if time t falls inside any merged interval (small helper for the river). */
function inIntervals(t: number, merged: Interval[]): boolean {
  for (const [a, b] of merged) {
    if (t < a) return false; // merged is sorted
    if (t <= b) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// analysis helpers
// ─────────────────────────────────────────────────────────────────────────────

function pitchRange(notes: TrackNote[]): { lo: number; hi: number } {
  let lo = 127;
  let hi = 0;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  if (hi <= lo) {
    lo = 36;
    hi = 84;
  }
  // pad a little and clamp to the piano
  lo = Math.max(21, lo - 3);
  hi = Math.min(108, hi + 3);
  return { lo, hi };
}

/** Downsample channel 0 into ~30ms peak bins for the waveform fallback. */
function buildEnvelope(buffer: AudioBuffer): Envelope {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const binDur = 0.03;
  const binSamples = Math.max(1, Math.round(binDur * sr));
  const count = Math.ceil(data.length / binSamples);
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let peak = 0;
    const start = i * binSamples;
    const end = Math.min(data.length, start + binSamples);
    for (let j = start; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    peaks[i] = peak;
  }
  return { binDur, peaks };
}

// ─────────────────────────────────────────────────────────────────────────────
// canvas: the streaming river
// ─────────────────────────────────────────────────────────────────────────────

interface RiverArgs {
  pos: number;
  level: number;
  reduced: boolean;
  notes: TrackNote[];
  env: Envelope | null;
  duration: number;
  pitchLo: number;
  pitchHi: number;
  intervals: Interval[];
  grabStart: number | null;
}

function sizeCanvas(c2d: CanvasRenderingContext2D): { W: number; H: number; dpr: number } {
  const canvas = c2d.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 800;
  const cssH = canvas.clientHeight || 400;
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (canvas.width !== needW || canvas.height !== needH) {
    canvas.width = needW;
    canvas.height = needH;
  }
  return { W: canvas.width, H: canvas.height, dpr };
}

function drawRiver(c2d: CanvasRenderingContext2D, a: RiverArgs): void {
  const { W, H, dpr } = sizeCanvas(c2d);
  c2d.clearRect(0, 0, W, H);
  c2d.fillStyle = GROUND;
  c2d.fillRect(0, 0, W, H);

  const nowX = Math.round(W * NOW_FRAC);
  const pps = (W - nowX) / SECONDS_AHEAD; // pixels per second
  const stripH = STRIP_H * dpr;
  const fieldTop = 6 * dpr;
  const fieldBot = H - stripH - 6 * dpr;
  const fieldH = Math.max(1, fieldBot - fieldTop);

  const lo = a.pitchLo;
  const hi = a.pitchHi;
  const yFor = (midi: number) => {
    const f = (midi - lo) / Math.max(1, hi - lo); // 0..1 low..high
    return fieldBot - f * fieldH;
  };

  // merged kept intervals (committed + the live grab, so it burns while held)
  const live: Interval[] =
    a.grabStart !== null ? [...a.intervals, [a.grabStart, a.pos]] : a.intervals;
  const merged = mergeIntervals(live);

  // ── grid: horizontal octave lines + scrolling second-lines ────────────────
  c2d.lineWidth = 1;
  for (let m = Math.ceil(lo / 12) * 12; m <= hi; m += 12) {
    const y = yFor(m);
    c2d.strokeStyle = GRID_OCT;
    c2d.beginPath();
    c2d.moveTo(0, y);
    c2d.lineTo(W, y);
    c2d.stroke();
  }
  if (!a.reduced) {
    const firstSec = Math.floor(a.pos - nowX / pps);
    const lastSec = Math.ceil(a.pos + (W - nowX) / pps);
    c2d.strokeStyle = GRID;
    for (let s = firstSec; s <= lastSec; s++) {
      const x = nowX + (s - a.pos) * pps;
      if (x < 0 || x > W) continue;
      c2d.beginPath();
      c2d.moveTo(x, fieldTop);
      c2d.lineTo(x, fieldBot);
      c2d.stroke();
    }
  }

  // ── the marks ──────────────────────────────────────────────────────────────
  const leftFade = 64 * dpr; // marks dissolve as they near the left edge
  if (a.notes.length > 0) {
    for (const n of a.notes) {
      const x0 = nowX + (n.time - a.pos) * pps;
      const w = Math.max(2 * dpr, n.duration * pps);
      if (x0 + w < -8 || x0 > W + 8) continue;
      const y = yFor(n.midi);
      const vel = Math.max(0, Math.min(1, n.velocity / 127));
      const h = (2 + vel * 11) * dpr;

      const kept = inIntervals(n.time, merged);
      const past = n.time <= a.pos;
      const crossing = Math.abs(x0 - nowX) < 5 * dpr;

      let alpha = 0.28 + vel * 0.45;
      // dissolve to nothing as it slides off the left
      if (x0 < leftFade) alpha *= Math.max(0, x0 / leftFade);

      c2d.beginPath();
      roundRect(c2d, x0, y - h / 2, w, h, Math.min(h / 2, 3 * dpr));

      if (kept) {
        c2d.fillStyle = `rgba(${KEEP},${Math.min(1, alpha + 0.5)})`;
        if (!a.reduced) {
          c2d.shadowColor = ACCENT;
          c2d.shadowBlur = 10 * dpr;
        }
        c2d.fill();
        c2d.shadowBlur = 0;
      } else if (crossing && !past) {
        c2d.fillStyle = `rgba(${LIVE},${Math.min(1, alpha + 0.35)})`;
        c2d.fill();
      } else {
        c2d.fillStyle = `rgba(${BONE},${alpha})`;
        c2d.fill();
      }
    }
  } else if (a.env) {
    // waveform fallback: peak bars scrolling past NOW
    const env = a.env;
    const midY = (fieldTop + fieldBot) / 2;
    const firstBin = Math.max(
      0,
      Math.floor((a.pos - nowX / pps) / env.binDur),
    );
    const lastBin = Math.min(
      env.peaks.length - 1,
      Math.ceil((a.pos + (W - nowX) / pps) / env.binDur),
    );
    const barW = Math.max(1, env.binDur * pps - dpr);
    for (let i = firstBin; i <= lastBin; i++) {
      const t = i * env.binDur;
      const x0 = nowX + (t - a.pos) * pps;
      const peak = env.peaks[i];
      const h = Math.max(1 * dpr, peak * fieldH * 0.9);
      const kept = inIntervals(t, merged);
      let alpha = 0.25 + peak * 0.55;
      if (x0 < leftFade) alpha *= Math.max(0, x0 / leftFade);
      const crossing = Math.abs(x0 - nowX) < 5 * dpr;
      if (kept) c2d.fillStyle = `rgba(${KEEP},${Math.min(1, alpha + 0.5)})`;
      else if (crossing) c2d.fillStyle = `rgba(${LIVE},${Math.min(1, alpha + 0.3)})`;
      else c2d.fillStyle = `rgba(${BONE},${alpha})`;
      c2d.fillRect(x0, midY - h / 2, barW, h);
    }
  }

  // ── the NOW line (audio-reactive glow) ─────────────────────────────────────
  const glow = a.reduced ? 0 : 6 + a.level * 22;
  c2d.save();
  c2d.strokeStyle = ACCENT;
  c2d.lineWidth = (a.grabStart !== null ? 2.4 : 1.4) * dpr;
  c2d.shadowColor = ACCENT;
  c2d.shadowBlur = glow * dpr;
  c2d.globalAlpha = a.grabStart !== null ? 1 : 0.8;
  c2d.beginPath();
  c2d.moveTo(nowX, fieldTop);
  c2d.lineTo(nowX, fieldBot);
  c2d.stroke();
  c2d.restore();

  // NOW label ticks
  c2d.fillStyle = ACCENT;
  c2d.globalAlpha = 0.9;
  c2d.fillRect(nowX - 3 * dpr, fieldTop, 6 * dpr, 2 * dpr);
  c2d.fillRect(nowX - 3 * dpr, fieldBot - 2 * dpr, 6 * dpr, 2 * dpr);
  c2d.globalAlpha = 1;

  // ── the growing KEPT strip (fraction of the take saved) ────────────────────
  drawKeptStrip(c2d, W, H, dpr, stripH, merged, a.duration, a.grabStart !== null);
}

function drawKeptStrip(
  c2d: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  stripH: number,
  merged: Interval[],
  duration: number,
  reaching: boolean,
): void {
  const top = H - stripH;
  // frame
  c2d.fillStyle = "rgba(10,12,16,0.9)";
  c2d.fillRect(0, top, W, stripH);
  c2d.strokeStyle = GRID_OCT;
  c2d.lineWidth = 1;
  c2d.beginPath();
  c2d.moveTo(0, top + 0.5);
  c2d.lineTo(W, top + 0.5);
  c2d.stroke();

  const pad = 8 * dpr;
  const barTop = top + pad;
  const barH = stripH - pad * 2;
  const usableW = W - pad * 2;
  // scale kept seconds against the whole take → shows how little you can hold
  const scale = duration > 0 ? usableW / duration : 0;

  let cursor = pad;
  for (const [s, e] of merged) {
    const w = Math.max(1 * dpr, (e - s) * scale);
    c2d.fillStyle = reaching ? "rgba(244,248,255,0.95)" : `rgba(${KEEP},0.85)`;
    if (reaching) {
      c2d.shadowColor = ACCENT;
      c2d.shadowBlur = 6 * dpr;
    }
    roundRect(c2d, cursor, barTop, w, barH, 2 * dpr);
    c2d.fill();
    c2d.shadowBlur = 0;
    cursor += w + 2 * dpr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// canvas: the keepsake replay (only what was kept, stitched)
// ─────────────────────────────────────────────────────────────────────────────

interface KeepsakeArgs {
  frags: Interval[];
  progress: number;
  level: number;
  reduced: boolean;
}

function drawKeepsake(c2d: CanvasRenderingContext2D, a: KeepsakeArgs): void {
  const { W, H, dpr } = sizeCanvas(c2d);
  c2d.clearRect(0, 0, W, H);
  c2d.fillStyle = GROUND;
  c2d.fillRect(0, 0, W, H);

  const total = a.frags.reduce((s, [x, y]) => s + (y - x), 0);
  const pad = 24 * dpr;
  const midY = H / 2;
  const usableW = W - pad * 2;

  if (total <= 0 || a.frags.length === 0) {
    c2d.strokeStyle = GRID_OCT;
    c2d.lineWidth = 1;
    c2d.beginPath();
    c2d.moveTo(pad, midY);
    c2d.lineTo(W - pad, midY);
    c2d.stroke();
    return;
  }

  const scale = usableW / total;
  const barH = Math.min(120 * dpr, H * 0.4);
  const playHeadX = pad + a.progress * usableW;

  let cursor = pad;
  for (let i = 0; i < a.frags.length; i++) {
    const [s, e] = a.frags[i];
    const w = Math.max(2 * dpr, (e - s) * scale);
    const played = cursor + w <= playHeadX;
    const active = cursor <= playHeadX && cursor + w > playHeadX;
    let alpha = played ? 0.9 : 0.45;
    if (active) alpha = 1;
    c2d.fillStyle = `rgba(${KEEP},${alpha})`;
    if (active && !a.reduced) {
      c2d.shadowColor = ACCENT;
      c2d.shadowBlur = 16 * dpr;
    }
    const h = barH * (active ? 1 + a.level * 0.6 : 1);
    roundRect(c2d, cursor, midY - h / 2, w, h, 3 * dpr);
    c2d.fill();
    c2d.shadowBlur = 0;
    // seam between fragments = a closed gap
    if (i < a.frags.length - 1) {
      c2d.fillStyle = "rgba(122,140,162,0.25)";
      c2d.fillRect(cursor + w, midY - barH / 2, 1 * dpr, barH);
    }
    cursor += w;
  }

  // playhead
  if (a.progress > 0 && a.progress < 1) {
    c2d.strokeStyle = ACCENT;
    c2d.lineWidth = 1.6 * dpr;
    if (!a.reduced) {
      c2d.shadowColor = ACCENT;
      c2d.shadowBlur = 10 * dpr;
    }
    c2d.beginPath();
    c2d.moveTo(playHeadX, midY - barH / 2 - 10 * dpr);
    c2d.lineTo(playHeadX, midY + barH / 2 + 10 * dpr);
    c2d.stroke();
    c2d.shadowBlur = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// small drawing utils
// ─────────────────────────────────────────────────────────────────────────────

function roundRect(
  c2d: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  c2d.beginPath();
  c2d.moveTo(x + rr, y);
  c2d.arcTo(x + w, y, x + w, y + h, rr);
  c2d.arcTo(x + w, y + h, x, y + h, rr);
  c2d.arcTo(x, y + h, x, y, rr);
  c2d.arcTo(x, y, x + w, y, rr);
  c2d.closePath();
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
