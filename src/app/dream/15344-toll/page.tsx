"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15344-toll — a recording you can't hear without paying a cost.
//
// Subtractive, irreversible listening. One of Karel's real recordings is cut
// into a finite LEDGER of phrases — sliced on harmonic boundaries (chord onsets)
// so each spendable unit is a cadence-shaped phrase, not an arbitrary fragment.
// At rest the page is SILENT: you are not owed the recording. To hear a phrase
// you must SPEND it — press-and-hold a ledger cell past a commit threshold; it
// burns, plays EXACTLY ONCE through the shared ear-safety master, then becomes a
// permanent VOID: struck out of the grid and torn out of the timeline. There is
// no reset button by design. Reload gives the recording back, but within a
// sitting what you spend is spent (in-memory only, never localStorage).
//
// Every prior additive piece hands you the recording on press-play. This one
// inverts that: listening COSTS something, and the recording is finite.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackChord } from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

type Phase = "idle" | "loading" | "ready" | "error";

interface Slice {
  index: number;
  offset: number; // seconds into the track
  dur: number; // seconds
}

const COMMIT_MS = 280; // hold this long to commit a spend
const MIN_SLICE = 0.9; // merge anything shorter into a neighbor
const MAX_SLICES = 52;
const MIN_SLICES = 24;

// ── in-memory, per-track spent ledger (NO localStorage — reload restores) ────
// Lives at module scope so switching tracks and coming back within one sitting
// keeps what you spent. A page reload clears the module and gives it all back.
const spentByTrack = new Map<string, Set<number>>();
function spentSetFor(id: string): Set<number> {
  let s = spentByTrack.get(id);
  if (!s) {
    s = new Set<number>();
    spentByTrack.set(id, s);
  }
  return s;
}

export default function TollPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const firstId = COLLECTIONS[0].tracks[0].id;
  const [activeId, setActiveId] = useState<string>(firstId);
  const [title, setTitle] = useState<string>(COLLECTIONS[0].tracks[0].title);
  const [keyName, setKeyName] = useState<string>("");
  const [fallback, setFallback] = useState(false);

  const [slices, setSlices] = useState<Slice[]>([]);
  const [spent, setSpent] = useState<Set<number>>(new Set());
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [chargeUI, setChargeUI] = useState<{ index: number; p: number } | null>(
    null,
  );

  // ── audio + timeline refs (read by rAF / handlers, kept off the render path)
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const bufferDurRef = useRef(0);
  const playSrcRef = useRef<AudioBufferSourceNode | null>(null);

  const slicesRef = useRef<Slice[]>([]);
  const spentRef = useRef<Set<number>>(new Set());
  const playingRef = useRef<number | null>(null);
  const activeIdRef = useRef<string>(firstId);
  const reducedRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // charge (press-and-hold) refs
  const chargeIndexRef = useRef<number | null>(null);
  const chargeStartRef = useRef(0);
  const chargeRafRef = useRef(0);

  // mirror state → refs for the animation loop / handlers
  useEffect(() => {
    slicesRef.current = slices;
  }, [slices]);
  useEffect(() => {
    spentRef.current = spent;
  }, [spent]);
  useEffect(() => {
    playingRef.current = playingIndex;
  }, [playingIndex]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
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

  const stopPlayback = useCallback(() => {
    const s = playSrcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      playSrcRef.current = null;
    }
    playingRef.current = null;
    setPlayingIndex(null);
  }, []);

  const endCharge = useCallback(() => {
    if (chargeIndexRef.current !== null) {
      chargeIndexRef.current = null;
      cancelAnimationFrame(chargeRafRef.current);
      setChargeUI(null);
    }
  }, []);

  // Spend a phrase: burn → play exactly once → on completion, permanent void.
  const commitSpend = useCallback((index: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const buffer = bufferRef.current;
    const slice = slicesRef.current[index];
    if (!ctx || !master || !buffer || !slice) return;
    if (spentRef.current.has(index)) return;
    if (playingRef.current !== null) return; // single-voice ledger

    playingRef.current = index;
    setPlayingIndex(index);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(master.input); // NEVER ctx.destination directly
    src.onended = () => {
      if (playSrcRef.current === src) playSrcRef.current = null;
      // completion → permanent void, recorded in the in-memory ledger
      const set = spentSetFor(activeIdRef.current);
      set.add(index);
      spentRef.current = set;
      setSpent(new Set(set));
      playingRef.current = null;
      setPlayingIndex(null);
    };
    playSrcRef.current = src;
    void ctx.resume().catch(() => {});
    src.start(ctx.currentTime, slice.offset, slice.dur);
  }, []);

  // Press-and-hold: charge toward the commit threshold; release early = nothing.
  const beginCharge = useCallback(
    (index: number) => {
      if (playingRef.current !== null) return; // single voice
      if (spentRef.current.has(index)) return;
      if (chargeIndexRef.current === index) return; // ignore key-repeat
      chargeIndexRef.current = index;
      chargeStartRef.current = performance.now();
      const tick = () => {
        const idx = chargeIndexRef.current;
        if (idx === null) return;
        const p = Math.min(
          1,
          (performance.now() - chargeStartRef.current) / COMMIT_MS,
        );
        setChargeUI({ index: idx, p });
        if (p >= 1) {
          chargeIndexRef.current = null;
          setChargeUI(null);
          commitSpend(idx);
          return;
        }
        chargeRafRef.current = requestAnimationFrame(tick);
      };
      chargeRafRef.current = requestAnimationFrame(tick);
    },
    [commitSpend],
  );

  // ── load + slice one real track (AudioContext built INSIDE the gesture) ─────
  const load = useCallback(
    async (id: string) => {
      stopPlayback();
      endCharge();
      setActiveId(id);
      setPhase("loading");
      setSlices([]);

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
        bufferDurRef.current = audio.buffer.duration;
        setTitle(audio.title);
        setKeyName(
          analysis?.key_signature ?? analysis?.summary?.key_center ?? "",
        );

        const chords: TrackChord[] = analysis?.chords ?? [];
        const built = computeSlices(audio.buffer.duration, chords);
        slicesRef.current = built.slices;
        setSlices(built.slices);
        setFallback(built.fallback);

        // restore this track's in-memory spent-set (persists across switches)
        const set = spentSetFor(id);
        spentRef.current = set;
        setSpent(new Set(set));

        setPhase("ready");
      } catch {
        setPhase("error");
      }
    },
    [stopPlayback, endCharge],
  );

  const handleBegin = useCallback(() => {
    if (typeof window === "undefined") return;
    setStarted(true);
    void load(activeId);
  }, [activeId, load]);

  // full teardown
  useEffect(
    () => () => {
      cancelAnimationFrame(chargeRafRef.current);
      const s = playSrcRef.current;
      if (s) {
        try {
          s.onended = null;
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      masterRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );

  // ── Canvas2D timeline: contiguous segments; spent = tears; playing pulses ───
  const drawTimeline = useCallback((c2d: CanvasRenderingContext2D, rms: number) => {
    const canvas = c2d.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 64;
    const needW = Math.round(cssW * dpr);
    const needH = Math.round(cssH * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    const W = canvas.width;
    const H = canvas.height;
    c2d.clearRect(0, 0, W, H);

    const total = bufferDurRef.current || 1;
    const list = slicesRef.current;
    const spentSet = spentRef.current;
    const playing = playingRef.current;

    const root = getComputedStyle(document.documentElement);
    const ink = root.getPropertyValue("--muted-foreground").trim() || "#888";
    const inkBright = root.getPropertyValue("--foreground").trim() || "#eee";
    const red = root.getPropertyValue("--destructive").trim() || "#e5484d";

    const midY = H / 2;
    const baseH = H * 0.42;

    for (const s of list) {
      if (spentSet.has(s.index)) continue; // torn out — a gap where it was
      const x0 = (s.offset / total) * W;
      const x1 = ((s.offset + s.dur) / total) * W;
      const gap = Math.min(1.5 * dpr, (x1 - x0) * 0.12);
      const w = Math.max(1, x1 - x0 - gap);
      if (s.index === playing) {
        const pulse = 1 + rms * 1.4;
        const h = Math.min(H, baseH * pulse);
        c2d.fillStyle = red;
        c2d.fillRect(x0, midY - h / 2, w, h);
      } else {
        c2d.fillStyle = s.index % 2 === 0 ? ink : inkBright;
        c2d.globalAlpha = 0.85;
        c2d.fillRect(x0, midY - baseH / 2, w, baseH);
        c2d.globalAlpha = 1;
      }
    }
  }, []);

  // draw loop (rAF) or static redraw under reduced motion
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
    if (!c2d) return; // no 2D context → DOM ledger still works

    const master = masterRef.current;
    const timeBuf = master
      ? new Uint8Array(master.analyser.fftSize)
      : new Uint8Array(0);

    const readRms = () => {
      if (!master) return 0;
      master.analyser.getByteTimeDomainData(timeBuf);
      let sum = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        sum += v * v;
      }
      return Math.sqrt(sum / timeBuf.length);
    };

    if (reducedMotion) {
      drawTimeline(c2d, 0);
      return;
    }
    let raf = 0;
    const loop = () => {
      drawTimeline(c2d!, readRms());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, reducedMotion, drawTimeline, slices, spent, playingIndex]);

  // ── readouts ────────────────────────────────────────────────────────────────
  const total = slices.length;
  const remainCount = total - spent.size;
  const remainSecs = slices.reduce(
    (acc, s) => (spent.has(s.index) ? acc : acc + s.dur),
    0,
  );
  const fullySpent = started && total > 0 && remainCount === 0;

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-dvh w-full bg-background text-foreground">
      {/* pre-start gate */}
      {!started && (
        <div className="flex min-h-dvh items-center justify-center px-6">
          <div className="max-w-lg text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Subtractive listening · a finite ledger
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              The Toll
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              One of Karel&rsquo;s recordings, cut into a finite ledger of
              phrases. At rest it is silent — you are not owed it. To hear a
              phrase you must <span className="text-foreground">spend</span> it:
              it plays exactly once, then is struck out forever. There is no
              reset.
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
                onClick={handleBegin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open the ledger
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

      {/* the ledger */}
      {started && (
        <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 pb-24 pt-8 sm:px-6">
          {/* header */}
          <header className="flex flex-col gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Subtractive listening
            </p>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {keyName ? `${keyName} · ` : ""}Karel Barnoski
              </span>
            </div>
          </header>

          {/* timeline */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Timeline
              </span>
              {fallback && (
                <span className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  even-window fallback (no harmonic analysis)
                </span>
              )}
            </div>
            <canvas
              ref={canvasRef}
              className="h-16 w-full rounded-md border border-border bg-background/40"
              aria-hidden="true"
            />
          </section>

          {/* running readout */}
          <section className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span
              className={`font-mono text-xs uppercase tracking-[0.18em] ${
                fullySpent ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {phase === "loading"
                ? "loading"
                : phase === "error"
                  ? "load failed"
                  : `${remainCount} of ${total} phrases remain`}
            </span>
            {phase === "ready" && !fullySpent && (
              <span className="font-mono text-xs tracking-[0.14em] text-muted-foreground">
                {remainSecs.toFixed(1)}s of audio remaining
              </span>
            )}
          </section>

          {phase === "error" && (
            <p className="text-base text-destructive">
              Couldn&rsquo;t load that recording. Pick another track below.
            </p>
          )}

          {/* fully-spent terminal state */}
          {fullySpent ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="text-8xl font-semibold tabular-nums text-destructive">
                0
              </div>
              <p className="text-base text-muted-foreground">
                Nothing remains. You spent the whole recording.
              </p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                reload to be given it again
              </p>
            </div>
          ) : (
            phase === "ready" && (
              <>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Press and hold a cell to spend it. Hold past the threshold to
                  commit — a tap does nothing. Each phrase plays{" "}
                  <span className="text-foreground">once</span>, then becomes a
                  void.
                </p>
                {/* the grid ledger */}
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(88px, 1fr))",
                  }}
                >
                  {slices.map((s) => {
                    const isSpent = spent.has(s.index);
                    const isPlaying = playingIndex === s.index;
                    const charging =
                      chargeUI && chargeUI.index === s.index
                        ? chargeUI.p
                        : 0;

                    if (isSpent) {
                      return (
                        <div
                          key={s.index}
                          aria-label={`Phrase ${s.index + 1}, spent`}
                          className="flex aspect-[4/3] select-none items-center justify-center rounded-md border border-border/40 text-2xl text-muted-foreground/30"
                        >
                          &mdash;
                        </div>
                      );
                    }

                    return (
                      <button
                        key={s.index}
                        type="button"
                        aria-label={`Phrase ${s.index + 1}, ${s.dur.toFixed(
                          1,
                        )} seconds — press and hold to spend`}
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture?.(e.pointerId);
                          beginCharge(s.index);
                        }}
                        onPointerUp={endCharge}
                        onPointerLeave={endCharge}
                        onPointerCancel={endCharge}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            beginCharge(s.index);
                          }
                        }}
                        onKeyUp={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            endCharge();
                          }
                        }}
                        disabled={playingIndex !== null && !isPlaying}
                        className={`relative flex aspect-[4/3] touch-none select-none flex-col items-center justify-center overflow-hidden rounded-md border text-center transition-colors ${
                          isPlaying
                            ? "border-destructive bg-destructive text-foreground"
                            : "border-border bg-background/60 text-foreground hover:bg-accent hover:text-foreground"
                        } focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive`}
                      >
                        {/* charging fill (rises from the base toward commit) */}
                        {charging > 0 && !reducedMotion && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 bottom-0 bg-destructive/70"
                            style={{ height: `${charging * 100}%` }}
                          />
                        )}
                        {charging > 0 && reducedMotion && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 bg-destructive/40"
                          />
                        )}
                        <span className="relative z-10 font-mono text-sm tabular-nums">
                          {s.index + 1}
                        </span>
                        <span className="relative z-10 font-mono text-[10px] uppercase tracking-[0.12em] opacity-70">
                          {s.dur.toFixed(1)}s
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )
          )}

          {/* honest persistence line + controls */}
          <div className="mt-auto flex flex-col gap-4 pt-4">
            <p className="font-mono text-[11px] leading-relaxed tracking-[0.06em] text-muted-foreground">
              Reload to be given the recording again — but within a sitting, what
              you spend is spent.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="sr-only" htmlFor="track-live">
                Track
              </label>
              <select
                id="track-live"
                value={activeId}
                onChange={(e) => void load(e.target.value)}
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
          </div>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">The Toll</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every other piece in this lab is <em>additive</em>: press play
                and the recording is given to you, intact, as many times as you
                like. The Toll inverts that. The recording is finite and{" "}
                <em>consumable</em>. At rest the page is silent — you are not
                owed it.
              </p>
              <p>
                The track is cut into a ledger of phrases along its{" "}
                <strong>harmonic boundaries</strong>: each chord onset from the
                analysis becomes a cut point, so every spendable unit is a
                cadence-shaped phrase rather than an arbitrary fragment. Short
                slices merge into their neighbors and the whole is clamped to
                roughly 24–52 cells. With no harmonic analysis, the ledger falls
                back to even windows (badged as such).
              </p>
              <p>
                To hear a phrase you must <strong>spend</strong> it: press and
                hold a cell past a commit threshold. It burns red, plays exactly
                once through the shared ear-safety master, and on completion
                becomes a permanent void — struck from the grid, torn out of the
                timeline. A tap that releases early does nothing; spending is a
                deliberate, committed act. There is no reset button by design.
              </p>
              <p>
                Spent state is held in memory per track for the length of a
                sitting — never written to storage. A reload restores the whole
                recording, which keeps the piece reviewable while keeping the
                cost real: within one sitting, what you spend is spent.
              </p>
              <p className="text-xs">
                References: ephemeral / decay-through-listening sound art (works
                that are consumed by the act of hearing them, 2026); Yoko Ono,{" "}
                <em>Cut Piece</em> (1964), where the audience subtracts the work
                piece by piece and it cannot be made whole again; and
                phrase-boundary detection in music information retrieval, where
                harmonic cadence points segment a performance into musical
                units.
              </p>
              <p className="font-mono text-xs">
                input: catalog playback · output: DOM ledger + Canvas2D timeline
                · technique: cadence-sliced subtractive listening · palette:
                achromatic + destructive-red
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
        slugs={["15344-toll", "15328-bloomwork", "15312-transcript", "15248-coherence"]}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// cadence-shaped slicing
//
// Preferred: cut on chord onsets so each slice spans one harmonic region. If
// chords are too sparse/absent, fall back to even windows derived from the
// buffer duration. Either way, merge sub-0.9s slivers, group down past 52, and
// subdivide up past 24, landing in ~24–52 phrases of roughly 1–6s.
// ─────────────────────────────────────────────────────────────────────────────
function computeSlices(
  duration: number,
  chords: TrackChord[],
): { slices: Slice[]; fallback: boolean } {
  const usable = chords.filter((c) => c.time > 0.05 && c.time < duration - 0.05);
  if (usable.length >= 12) {
    // cut points from chord onsets, bracketed by track start/end
    const cutsSet = new Set<number>([0, duration]);
    for (const c of usable) cutsSet.add(c.time);
    const cuts = Array.from(cutsSet).sort((a, b) => a - b);
    let segs = cutsToSegments(cuts);
    segs = mergeShort(segs);
    segs = clampCount(segs);
    return { slices: indexed(segs), fallback: false };
  }
  return { slices: indexed(evenWindows(duration)), fallback: true };
}

function cutsToSegments(cuts: number[]): [number, number][] {
  const segs: [number, number][] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a > 0.001) segs.push([a, b]);
  }
  return segs;
}

// merge any segment shorter than MIN_SLICE into its shorter neighbor
function mergeShort(segs: [number, number][]): [number, number][] {
  let out = segs.slice();
  let guard = 0;
  while (out.length > 1 && guard++ < 5000) {
    let idx = -1;
    for (let i = 0; i < out.length; i++) {
      if (out[i][1] - out[i][0] < MIN_SLICE) {
        idx = i;
        break;
      }
    }
    if (idx === -1) break;
    out = mergeAt(out, idx);
  }
  return out;
}

// merge segment idx into the adjacent segment that is shorter
function mergeAt(segs: [number, number][], idx: number): [number, number][] {
  const out = segs.slice();
  const durOf = (s: [number, number]) => s[1] - s[0];
  let target: number;
  if (idx === 0) target = 1;
  else if (idx === out.length - 1) target = idx - 1;
  else target = durOf(out[idx - 1]) <= durOf(out[idx + 1]) ? idx - 1 : idx + 1;
  const a = Math.min(out[idx][0], out[target][0]);
  const b = Math.max(out[idx][1], out[target][1]);
  const lo = Math.min(idx, target);
  const hi = Math.max(idx, target);
  out.splice(lo, hi - lo + 1, [a, b]);
  return out;
}

// group down to <=52, subdivide up to >=24
function clampCount(segs: [number, number][]): [number, number][] {
  let out = segs.slice();
  let guard = 0;
  // group: repeatedly merge the globally shortest segment
  while (out.length > MAX_SLICES && guard++ < 5000) {
    let shortest = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i][1] - out[i][0] < out[shortest][1] - out[shortest][0]) {
        shortest = i;
      }
    }
    out = mergeAt(out, shortest);
  }
  guard = 0;
  // subdivide: split the longest segment in half
  while (out.length < MIN_SLICES && guard++ < 5000) {
    let longest = 0;
    for (let i = 1; i < out.length; i++) {
      if (out[i][1] - out[i][0] > out[longest][1] - out[longest][0]) {
        longest = i;
      }
    }
    const [a, b] = out[longest];
    if (b - a < MIN_SLICE * 2) break; // can't split further without slivers
    const mid = (a + b) / 2;
    out.splice(longest, 1, [a, mid], [mid, b]);
  }
  return out;
}

function evenWindows(duration: number): [number, number][] {
  let count = Math.max(MIN_SLICES, Math.min(MAX_SLICES, Math.round(duration / 3)));
  while (count > MIN_SLICES && duration / count < MIN_SLICE) count--;
  const dur = duration / count;
  const segs: [number, number][] = [];
  for (let i = 0; i < count; i++) segs.push([i * dur, (i + 1) * dur]);
  return segs;
}

function indexed(segs: [number, number][]): Slice[] {
  return segs.map(([a, b], i) => ({ index: i, offset: a, dur: b - a }));
}
