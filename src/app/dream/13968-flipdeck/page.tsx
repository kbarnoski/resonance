"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 13968 · Flip-Deck — a beat-locked DJ deck for Karel's own piano.
//
//   Take ONE of his real solo-piano recordings, detect its tempo / beats /
//   downbeats offline (beatEngine.ts), draw the whole waveform as a WebGL2 ribbon
//   with the beat grid on it (waveGL.ts), and let the visitor RE-COMPOSE it into a
//   new groove — scrub, set hot-cue loop regions, reverse, half-time, stutter —
//   everything quantised to his bars over a steady lookahead clock so it always
//   stays in time. The ONLY sound is regions of his real recording. No synth.
//
//   Determinism: no Math.random / Date.now / new Date; timing from ctx.currentTime.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  COLLECTIONS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  analyzeTrack,
  regrid,
  buildPeaks,
  reverseBuffer,
  nearestIndex,
  type BeatAnalysis,
  type GridCache,
} from "./beatEngine";
import { createWaveRenderer, type WaveRenderer } from "./waveGL";

const DEFAULT_ID = "1f0a541e-df60-44a9-b839-5dc69a007d9f"; // "2019"
const PEAK_BINS = 2400;
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TIMER_MS = 25;
const ATTACK = 0.004;
const RELEASE = 0.006;

type Phase = "idle" | "loading" | "ready" | "error";

interface Segment {
  ctxStart: number;
  ctxEnd: number;
  a: number; // original-time start of audible region
  b: number; // original-time end
  reverse: boolean;
}

interface FlipEngine {
  loopActive: boolean;
  reverse: boolean;
  halfTime: boolean;
  stutter: boolean;
  soloStraight: boolean;
  loopStartSec: number;
  loopEndSec: number;
  playCursor: number; // original-time position for play-through
  nextTime: number; // ctx time of next segment to schedule
  segments: Segment[];
  barLen: number; // seconds per bar (4 beats)
  stutterLen: number; // seconds of the stutter slice
}

export default function FlipDeckPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(DEFAULT_ID);
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState(0);
  const [loopBars, setLoopBars] = useState(2);

  // mirrored flip flags (for button styling)
  const [ui, setUi] = useState({
    loopActive: false,
    reverse: false,
    halfTime: false,
    stutter: false,
    soloStraight: false,
  });
  const [demoActive, setDemoActive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [glDown, setGlDown] = useState(false);

  // ── refs (imperative audio/graphics that must survive renders) ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const revBufferRef = useRef<AudioBuffer | null>(null);
  const analysisRef = useRef<BeatAnalysis | null>(null);
  const cacheRef = useRef<GridCache | null>(null);
  const rendererRef = useRef<WaveRenderer | null>(null);
  const engRef = useRef<FlipEngine | null>(null);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const selRef = useRef<{ a: number | null; b: number | null }>({ a: null, b: null });
  const draggingRef = useRef(false);
  const lastPh01Ref = useRef(0);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const durationRef = useRef(0);

  // keep UI flags in sync with the engine
  const syncUi = useCallback(() => {
    const e = engRef.current;
    if (!e) return;
    setUi({
      loopActive: e.loopActive,
      reverse: e.reverse,
      halfTime: e.halfTime,
      stutter: e.stutter,
      soloStraight: e.soloStraight,
    });
  }, []);

  const cancelDemo = useCallback(() => {
    if (demoTimerRef.current != null) {
      window.clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setDemoActive(false);
  }, []);

  // ── the lookahead scheduler ──
  const scheduleSegment = useCallback((when: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const eng = engRef.current;
    const buffer = bufferRef.current;
    const revBuf = revBufferRef.current;
    if (!ctx || !master || !eng || !buffer) return;
    const duration = durationRef.current;

    const straight = eng.soloStraight;
    const reverse = straight ? false : eng.reverse;
    const rate = straight ? 1 : eng.halfTime ? 0.5 : 1;
    const stutter = straight ? false : eng.stutter;
    const loopActive = eng.loopActive && !straight;

    let a: number;
    let b: number;
    if (loopActive) {
      a = eng.loopStartSec;
      b = eng.loopEndSec;
      if (stutter) {
        // machine-gun a short slice at the loop head
        b = Math.min(eng.loopEndSec, eng.loopStartSec + eng.stutterLen);
      }
    } else {
      // play-through: one bar from the cursor, wrapping at the end
      a = eng.playCursor;
      b = Math.min(duration, a + eng.barLen);
      if (b <= a + 0.03) {
        a = 0;
        b = Math.min(duration, eng.barLen);
      }
    }
    const srcDur = Math.max(0.02, b - a);
    const realDur = srcDur / rate;

    const buf = reverse ? revBuf : buffer;
    if (!buf) return;
    const offset = reverse ? Math.max(0, duration - b) : a;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const vg = ctx.createGain();
    // click-free envelope per voice
    vg.gain.setValueAtTime(0, when);
    vg.gain.linearRampToValueAtTime(1, when + Math.min(ATTACK, realDur * 0.4));
    const relStart = when + realDur - Math.min(RELEASE, realDur * 0.4);
    vg.gain.setValueAtTime(1, Math.max(when + ATTACK, relStart));
    vg.gain.linearRampToValueAtTime(0, when + realDur);
    src.connect(vg);
    vg.connect(master.input);
    src.start(when, offset, srcDur);
    src.stop(when + realDur + 0.03);

    sourcesRef.current.add(src);
    src.onended = () => {
      sourcesRef.current.delete(src);
      try {
        vg.disconnect();
      } catch {
        /* closing */
      }
    };

    eng.segments.push({ ctxStart: when, ctxEnd: when + realDur, a, b, reverse });
    eng.nextTime = when + realDur;
    if (!loopActive) {
      eng.playCursor = b >= duration ? 0 : b;
    }
  }, []);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    const eng = engRef.current;
    if (!ctx || !eng) return;
    const now = ctx.currentTime;
    let guard = 0;
    while (eng.nextTime < now + LOOKAHEAD && guard < 64) {
      scheduleSegment(eng.nextTime);
      guard++;
    }
    eng.segments = eng.segments.filter((s) => s.ctxEnd > now - 0.5);
  }, [scheduleSegment]);

  // ── the render loop ──
  const frame = useCallback(() => {
    const ctx = ctxRef.current;
    const eng = engRef.current;
    const r = rendererRef.current;
    const master = masterRef.current;
    const duration = durationRef.current;
    if (ctx && eng && r && duration > 0) {
      // spectrum glow
      let glow = 0;
      if (master && freqBufRef.current) {
        master.analyser.getByteFrequencyData(freqBufRef.current);
        const f = freqBufRef.current;
        let s = 0;
        for (let i = 0; i < f.length; i++) s += f[i];
        glow = Math.min(1, s / (f.length * 180));
      }
      // playhead from the currently-sounding segment
      const now = ctx.currentTime;
      let ph01 = eng.playCursor / duration;
      for (let i = eng.segments.length - 1; i >= 0; i--) {
        const s = eng.segments[i];
        if (now >= s.ctxStart && now < s.ctxEnd) {
          const frac = (now - s.ctxStart) / (s.ctxEnd - s.ctxStart);
          const orig = s.reverse ? s.b - frac * (s.b - s.a) : s.a + frac * (s.b - s.a);
          ph01 = orig / duration;
          break;
        }
      }
      lastPh01Ref.current = ph01;
      r.draw({
        playhead01: ph01,
        loopStart01: eng.loopStartSec / duration,
        loopEnd01: eng.loopEndSec / duration,
        loopActive: eng.loopActive && !eng.soloStraight,
        selStart01: selRef.current.a,
        selEnd01: selRef.current.b,
        glow,
      });
    }
    rafRef.current = window.requestAnimationFrame(frame);
  }, []);

  // ── full teardown ──
  const teardown = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (demoTimerRef.current != null) {
      window.clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    sourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    sourcesRef.current.clear();
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }
    if (masterRef.current) {
      masterRef.current.disconnect();
      masterRef.current = null;
    }
    if (ctxRef.current) {
      const c = ctxRef.current;
      ctxRef.current = null;
      c.close().catch(() => {});
    }
    engRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ── start: create ctx on the gesture, load + analyse, wire everything ──
  const start = useCallback(
    async (id: string) => {
      cancelDemo();
      setError(null);
      setPhase("loading");
      // tear down any prior run (track switch)
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      sourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* noop */
        }
      });
      sourcesRef.current.clear();
      if (rendererRef.current) {
        rendererRef.current.destroy();
        rendererRef.current = null;
      }
      if (masterRef.current) {
        masterRef.current.disconnect();
        masterRef.current = null;
      }
      if (ctxRef.current) {
        await ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }

      try {
        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const master = createSafeMaster(ctx);
        masterRef.current = master;
        freqBufRef.current = new Uint8Array(master.analyser.frequencyBinCount);

        setProgress("Loading Karel's recording…");
        const loaded = await loadRealTrackBuffer(ctx, id);
        if (ctxRef.current !== ctx) return; // superseded by another start
        bufferRef.current = loaded.buffer;
        durationRef.current = loaded.buffer.duration;
        setTitle(loaded.title);

        setProgress("Reversing buffer for backspins…");
        await new Promise((r) => window.setTimeout(r, 0));
        revBufferRef.current = reverseBuffer(ctx, loaded.buffer);

        setProgress("Analysing tempo, beats & downbeats…");
        await new Promise((r) => window.setTimeout(r, 0));
        const { analysis, cache } = analyzeTrack(loaded.buffer);
        if (ctxRef.current !== ctx) return;
        analysisRef.current = analysis;
        cacheRef.current = cache;
        setBpm(analysis.bpm);

        setProgress("Building the ribbon…");
        const peaks = buildPeaks(loaded.buffer, PEAK_BINS);

        // renderer
        const canvas = canvasRef.current;
        if (canvas) {
          const r = createWaveRenderer(canvas);
          if (!r) {
            setGlDown(true);
          } else {
            rendererRef.current = r;
            r.setWaveform(peaks.min, peaks.max);
            r.setGrid(analysis.beatTimes, analysis.barTimes, analysis.duration);
          }
        }

        // flip engine
        const beatLen = 60 / analysis.bpm;
        const eng: FlipEngine = {
          loopActive: false,
          reverse: false,
          halfTime: false,
          stutter: false,
          soloStraight: false,
          loopStartSec: 0,
          loopEndSec: 0,
          playCursor: 0,
          nextTime: ctx.currentTime + 0.15,
          segments: [],
          barLen: beatLen * 4,
          stutterLen: beatLen / 2,
        };
        engRef.current = eng;

        // seed the self-demo: a 2-bar loop about a quarter into the track
        const bars = analysis.barTimes;
        if (bars.length >= 4) {
          const anchor = Math.min(
            bars.length - 3,
            Math.max(1, Math.round(bars.length * 0.25)),
          );
          eng.loopStartSec = bars[anchor];
          eng.loopEndSec = bars[anchor + 2];
          eng.loopActive = true;
          setLoopBars(2);
          setDemoActive(true);
          demoTimerRef.current = window.setTimeout(() => {
            const e = engRef.current;
            if (e) {
              // hand over: keep playing but drop out of the demo loop
              e.loopActive = false;
              e.playCursor = e.loopEndSec;
              syncUi();
            }
            setDemoActive(false);
            demoTimerRef.current = null;
          }, 8000);
        }

        setPhase("ready");
        syncUi();
        timerRef.current = window.setInterval(tick, TIMER_MS);
        rafRef.current = window.requestAnimationFrame(frame);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("error");
      }
    },
    [cancelDemo, frame, tick, syncUi],
  );

  // ── pointer interaction on the ribbon ──
  const xToT01 = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = useCallback(
    (ev: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "ready") return;
      cancelDemo();
      draggingRef.current = true;
      const t = xToT01(ev.clientX);
      selRef.current = { a: t, b: t };
      ev.currentTarget.setPointerCapture(ev.pointerId);
    },
    [phase, xToT01, cancelDemo],
  );

  const onPointerMove = useCallback(
    (ev: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      selRef.current.b = xToT01(ev.clientX);
    },
    [xToT01],
  );

  const onPointerUp = useCallback(
    (ev: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const eng = engRef.current;
      const analysis = analysisRef.current;
      const duration = durationRef.current;
      const sel = selRef.current;
      selRef.current = { a: null, b: null };
      try {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      } catch {
        /* noop */
      }
      if (!eng || !analysis || sel.a == null || sel.b == null) return;

      const t0 = Math.min(sel.a, sel.b) * duration;
      const t1 = Math.max(sel.a, sel.b) * duration;
      const spanSmall = t1 - t0 < 0.18;

      if (spanSmall) {
        // scrub → snap to nearest beat, play through from there
        const bi = nearestIndex(analysis.beatTimes, sel.a! * duration);
        const t = bi >= 0 ? analysis.beatTimes[bi] : sel.a! * duration;
        eng.loopActive = false;
        eng.playCursor = t;
        eng.nextTime = (ctxRef.current?.currentTime ?? 0) + 0.06;
        eng.segments = [];
      } else {
        // set a loop, snapping both ends to bars
        const bars = analysis.barTimes;
        if (bars.length >= 2) {
          let i0 = nearestIndex(bars, t0);
          let i1 = nearestIndex(bars, t1);
          if (i1 <= i0) i1 = Math.min(bars.length - 1, i0 + 1);
          if (i0 >= i1) i0 = Math.max(0, i1 - 1);
          eng.loopStartSec = bars[i0];
          eng.loopEndSec = bars[i1];
          eng.loopActive = true;
          setLoopBars(i1 - i0);
        }
      }
      syncUi();
    },
    [syncUi],
  );

  // ── control actions ──
  const setLoopLength = useCallback(
    (barsWanted: number) => {
      const eng = engRef.current;
      const analysis = analysisRef.current;
      const duration = durationRef.current;
      if (!eng || !analysis) return;
      cancelDemo();
      const bars = analysis.barTimes;
      if (bars.length < 2) return;
      const anchorTime = lastPh01Ref.current * duration;
      let i0 = nearestIndex(bars, anchorTime);
      let i1 = i0 + barsWanted;
      if (i1 > bars.length - 1) {
        i1 = bars.length - 1;
        i0 = Math.max(0, i1 - barsWanted);
      }
      if (i1 <= i0) i1 = Math.min(bars.length - 1, i0 + 1);
      eng.loopStartSec = bars[i0];
      eng.loopEndSec = bars[i1];
      eng.loopActive = true;
      eng.nextTime = (ctxRef.current?.currentTime ?? 0) + 0.06;
      eng.segments = [];
      setLoopBars(i1 - i0);
      syncUi();
    },
    [cancelDemo, syncUi],
  );

  const toggle = useCallback(
    (key: "reverse" | "halfTime" | "stutter" | "soloStraight") => {
      const eng = engRef.current;
      if (!eng) return;
      cancelDemo();
      eng[key] = !eng[key];
      syncUi();
    },
    [cancelDemo, syncUi],
  );

  const exitLoop = useCallback(() => {
    const eng = engRef.current;
    const duration = durationRef.current;
    if (!eng) return;
    cancelDemo();
    eng.loopActive = false;
    eng.playCursor = lastPh01Ref.current * duration;
    eng.nextTime = (ctxRef.current?.currentTime ?? 0) + 0.06;
    eng.segments = [];
    syncUi();
  }, [cancelDemo, syncUi]);

  const nudgeBpm = useCallback(
    (delta: number) => {
      const eng = engRef.current;
      const cache = cacheRef.current;
      const r = rendererRef.current;
      if (!eng || !cache) return;
      cancelDemo();
      const next = Math.round((bpm + delta) * 10) / 10;
      if (next < 40 || next > 220) return;
      const analysis = regrid(cache, next);
      analysisRef.current = analysis;
      setBpm(next);
      const beatLen = 60 / next;
      eng.barLen = beatLen * 4;
      eng.stutterLen = beatLen / 2;
      if (r) r.setGrid(analysis.beatTimes, analysis.barTimes, analysis.duration);
    },
    [bpm, cancelDemo],
  );

  // ── styling helpers ──
  const primaryBtn =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40";
  const ghostBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";
  const activeBtn =
    "min-h-[44px] rounded-md border border-primary bg-primary/15 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary/25";
  const label =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  const flip = (on: boolean) => (on ? activeBtn : ghostBtn);

  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Flip-Deck</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Flip your own record — cut and re-loop Karel&apos;s real piano bars
              into a new groove, always locked to his beat.
            </p>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </button>
        </header>

        {/* track selector */}
        <section className="flex flex-col gap-2">
          <span className={label}>Choose a recording</span>
          <div className="flex flex-wrap gap-2">
            {COLLECTIONS.map((col) =>
              col.tracks.map((tr) => {
                const on = tr.id === selectedId;
                return (
                  <button
                    key={tr.id}
                    onClick={() => {
                      setSelectedId(tr.id);
                      if (phase === "ready" || phase === "error") start(tr.id);
                    }}
                    className={`min-h-[44px] rounded-md border px-3 text-sm transition-colors ${
                      on
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                    title={col.name}
                  >
                    {tr.title}
                  </button>
                );
              }),
            )}
          </div>
        </section>

        {/* start / status */}
        {phase === "idle" && (
          <button onClick={() => start(selectedId)} className={`${primaryBtn} self-start`}>
            Start the deck
          </button>
        )}
        {phase === "loading" && (
          <p className="text-base text-muted-foreground" aria-live="polite">
            {progress || "Working…"}
          </p>
        )}
        {phase === "error" && (
          <div className="flex flex-col gap-3">
            <p className="text-base text-destructive">
              Could not start: {error}
            </p>
            <button onClick={() => start(selectedId)} className={`${primaryBtn} self-start`}>
              Try again
            </button>
          </div>
        )}

        {glDown && (
          <p className="text-base text-destructive">
            WebGL2 is unavailable in this browser — the ribbon renderer needs it.
            A simplified control strip is shown below.
          </p>
        )}

        {/* the ribbon */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={label}>
              {phase === "ready" ? `Now flipping · ${title}` : "The ribbon"}
            </span>
            {phase === "ready" && (
              <span className="text-sm text-muted-foreground">
                Drag across bars to set a loop · click a beat to scrub
              </span>
            )}
          </div>
          <div className="relative">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="h-48 w-full touch-none rounded-lg border border-border bg-[#090c14] sm:h-56"
              style={{ cursor: phase === "ready" ? "text" : "default" }}
            />
            {demoActive && (
              <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-primary/20 px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
                auto — grab the ribbon to take over
              </span>
            )}
          </div>
        </section>

        {/* transport / flip controls */}
        {phase === "ready" && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={label}>Tempo</span>
                <button onClick={() => nudgeBpm(-1)} className={ghostBtn} aria-label="slower">
                  −
                </button>
                <span className="min-w-[5.5rem] text-center text-base tabular-nums text-foreground">
                  {bpm.toFixed(1)} BPM
                </span>
                <button onClick={() => nudgeBpm(1)} className={ghostBtn} aria-label="faster">
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={label}>Loop length</span>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setLoopLength(n)}
                    className={
                      ui.loopActive && loopBars === n && !ui.soloStraight
                        ? activeBtn
                        : ghostBtn
                    }
                  >
                    {n}-bar loop
                  </button>
                ))}
                <button onClick={exitLoop} className={ui.loopActive ? ghostBtn : activeBtn}>
                  Exit loop (play through)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className={label}>Turntable moves</span>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => toggle("reverse")} className={flip(ui.reverse)}>
                  Reverse
                </button>
                <button onClick={() => toggle("halfTime")} className={flip(ui.halfTime)}>
                  Half-time
                </button>
                <button onClick={() => toggle("stutter")} className={flip(ui.stutter)}>
                  Beat-repeat / stutter
                </button>
                <button
                  onClick={() => toggle("soloStraight")}
                  className={flip(ui.soloStraight)}
                >
                  Solo original (play straight)
                </button>
              </div>
              {ui.halfTime && (
                <p className="text-sm text-muted-foreground">
                  Half-time plays the tape at 0.5× — the pitch drops an octave, the
                  same as slowing a real turntable. That&apos;s the intended move.
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground">Flip your own record.</span> The
                deck decodes one of Karel&apos;s solo-piano takes and, offline,
                estimates its tempo, beats and downbeats with a hand-rolled MIR
                pipeline: spectral-flux onsets from a 2048/512 Hann STFT, tempo by
                autocorrelation over 60–180 BPM, then a 4/4 grid phase-aligned to
                the onset novelty with downbeats picked by low-band accent.
              </p>
              <p>
                The whole waveform is a WebGL2 ribbon (a triangle-strip from
                min/max peaks) with the beat grid baked in; the loop region and
                playhead are re-uploaded each frame. Every sound you hear is a
                region of his actual recording, scheduled a hair ahead of time on a
                25 ms lookahead clock so loops stay gapless and in time — reverse
                plays a pre-built reversed buffer, half-time is 0.5× playback.
              </p>
              <p>
                <span className="text-foreground">Honest limits.</span> Solo piano
                is deeply rubato, so the grid is an approximation — nudge the BPM if
                a loop drifts. Half-time drops the pitch an octave (a real turntable
                move, not a bug). Classic references: Bello et al. 2005
                (spectral-flux onsets); D. Ellis, &ldquo;Beat Tracking by Dynamic
                Programming&rdquo; (2007); Heydari et al., BeatNet+ (TISMIR). Framing
                nods to the 2026 real-time interactive-remix turn (Live Music
                Diffusion, arXiv:2605.22717).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className={`${ghostBtn} mt-5`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["13968-flipdeck"]} />
    </main>
  );
}
