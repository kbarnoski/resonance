"use client";

// ════════════════════════════════════════════════════════════════════════════
// DATAMATICS (1210) — "the image IS the score"
//
// THE ONE QUESTION: "What if you could DRAW a sound as a picture — paint bright
// marks onto a scrolling monochrome spectrogram and hear them resynthesised in
// real time as a bank of pure sine partials, in the stark black-and-white idiom
// of Ryoji Ikeda?"
//
// A Canvas2D spectrogram "score": vertical axis = log-frequency (55 Hz → 7.5 kHz),
// horizontal axis = time. A thin cyan playhead sweeps left→right; the column
// under it is read as ADDITIVE PURE SINES (one oscillator per frequency row).
// Draw brighter = more energy. Hard high-contrast edges fire a filtered-noise
// TICK. Strict monochrome — white marks on true black + one cyan scan-line.
//
// Lineage: Ryoji Ikeda — datamatics / test pattern / data-verse (2026
// data.gram [nº11]); the ANS synthesiser; Iannis Xenakis's UPIC; Phosphor
// (spectral synth, Synthtopia Feb 2026); Tembrica Image-to-Sound (Mar 2026).
//
// SAFETY: no strobe. Motion is smooth continuous drift; the only periodic
// element is a single ~0.09 Hz playhead sweep. Master gain ramps from 0 through
// a brick-wall limiter; dense columns are energy-normalised. Respects
// prefers-reduced-motion. Full teardown on unmount.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { DatamaticsEngine, ROWS, MIN_HZ, MAX_HZ, rowFreq } from "./datamatics-engine";

// ─── Score geometry ───────────────────────────────────────────────────────────
const COLS = 220; // time cells (one full sweep)
const CELLS = COLS * ROWS;
const idx = (col: number, row: number) => col * ROWS + row;

type Phase = "idle" | "running" | "paused";
type Tool = "draw" | "erase";

// A tiny deterministic PRNG so presets are stable.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nearest frequency row for a given Hz (inverse of rowFreq). */
function hzRow(hz: number): number {
  const t = Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
  return Math.round(t * (ROWS - 1));
}

// ─── Presets: each fills a fresh score buffer ─────────────────────────────────
function presetSweep(s: Float32Array) {
  s.fill(0);
  for (let c = 0; c < COLS; c++) {
    const row = Math.floor((c / (COLS - 1)) * (ROWS - 1));
    for (let dr = -1; dr <= 1; dr++) {
      const r = row + dr;
      if (r >= 0 && r < ROWS) s[idx(c, r)] = dr === 0 ? 1 : 0.5;
    }
  }
}

function presetChord(s: Float32Array) {
  s.fill(0);
  // A2 · E3 · A3 · C#4 · E4 · A4 — a clean stack, drawn as full-time bands.
  const chord = [110, 165, 220, 277, 330, 440];
  for (const hz of chord) {
    const row = hzRow(hz);
    for (let c = 0; c < COLS; c++) {
      if (row >= 0 && row < ROWS) s[idx(c, row)] = 0.95;
      if (row + 1 < ROWS) s[idx(c, row + 1)] = 0.4;
    }
  }
}

function presetDots(s: Float32Array) {
  s.fill(0);
  // Sparse Ikeda-ish precise dot field.
  const rnd = mulberry32(0x1210);
  const n = 46;
  for (let i = 0; i < n; i++) {
    const c = Math.floor(rnd() * COLS);
    const r = Math.floor(rnd() * ROWS);
    s[idx(c, r)] = 1;
    // occasional vertical pair for a harder onset
    if (rnd() > 0.6 && r + 1 < ROWS) s[idx(c, r + 1)] = 1;
  }
}

export default function DatamaticsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tool, setTool] = useState<Tool>("draw");
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [readout, setReadout] = useState({ hz: 0, active: 0 });

  // score + audio + loop refs
  const scoreRef = useRef<Float32Array>(new Float32Array(CELLS));
  const rasterRef = useRef<HTMLCanvasElement | null>(null);
  const rasterDirtyRef = useRef(true);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<DatamaticsEngine | null>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  // playhead + timing
  const playRef = useRef(0); // fractional column position
  const lastColRef = useRef(-1);
  const lastTimeRef = useRef(0);
  const driftRef = useRef(0);
  const readoutTRef = useRef(0);
  const colBufRef = useRef<Float32Array>(new Float32Array(ROWS));

  // pointer paint state
  const toolRef = useRef<Tool>("draw");
  const paintingRef = useRef(false);
  const lastPaintRef = useRef<{ c: number; r: number } | null>(null);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // ── energy of a column (sum of brightness) ──
  const colEnergy = useCallback((col: number) => {
    const s = scoreRef.current;
    let e = 0;
    const base = col * ROWS;
    for (let r = 0; r < ROWS; r++) e += s[base + r];
    return e;
  }, []);

  // ── stamp a soft 3×3 brush at a cell (additive draw / subtractive erase) ──
  const stamp = useCallback((c: number, r: number, erase: boolean) => {
    const s = scoreRef.current;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const cc = c + dc;
        const rr = r + dr;
        if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
        const w = dc === 0 && dr === 0 ? 0.5 : 0.22;
        const k = idx(cc, rr);
        const v = erase ? s[k] - (dc === 0 && dr === 0 ? 1 : 0.5) : s[k] + w;
        s[k] = Math.max(0, Math.min(1, v));
      }
    }
    rasterDirtyRef.current = true;
  }, []);

  // ── paint along a line so fast drags don't gap ──
  const paintLine = useCallback(
    (c0: number, r0: number, c1: number, r1: number, erase: boolean) => {
      const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        stamp(Math.round(c0 + (c1 - c0) * t), Math.round(r0 + (r1 - r0) * t), erase);
      }
    },
    [stamp],
  );

  const eventToCell = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height);
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(nx * COLS)));
    // screen top = high frequency
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor((1 - ny) * ROWS)));
    return { c, r };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const cell = eventToCell(e);
      if (!cell) return;
      paintingRef.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const erase = toolRef.current === "erase" || e.shiftKey;
      stamp(cell.c, cell.r, erase);
      lastPaintRef.current = cell;
    },
    [eventToCell, stamp],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!paintingRef.current) return;
      const cell = eventToCell(e);
      if (!cell) return;
      const erase = toolRef.current === "erase" || e.shiftKey;
      const last = lastPaintRef.current;
      if (last) paintLine(last.c, last.r, cell.c, cell.r, erase);
      else stamp(cell.c, cell.r, erase);
      lastPaintRef.current = cell;
    },
    [eventToCell, paintLine, stamp],
  );

  const onPointerUp = useCallback(() => {
    paintingRef.current = false;
    lastPaintRef.current = null;
  }, []);

  // ── render one frame of the Canvas2D score ──
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const pw = Math.floor(cssW * dpr);
    const ph = Math.floor(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const W = canvas.width;
    const Hh = canvas.height;

    // rebuild the low-res raster only when the score changed
    let raster = rasterRef.current;
    if (!raster) {
      raster = document.createElement("canvas");
      raster.width = COLS;
      raster.height = ROWS;
      rasterRef.current = raster;
    }
    if (rasterDirtyRef.current) {
      const rctx = raster.getContext("2d");
      if (rctx) {
        const img = rctx.createImageData(COLS, ROWS);
        const s = scoreRef.current;
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) {
            // raster y is top-down; row 0 (low freq) sits at the bottom
            const y = ROWS - 1 - r;
            const p = (y * COLS + c) * 4;
            const b = s[idx(c, r)];
            const lum = b <= 0.004 ? 0 : Math.round(255 * (0.12 + 0.88 * b));
            img.data[p] = lum;
            img.data[p + 1] = lum;
            img.data[p + 2] = lum;
            img.data[p + 3] = 255;
          }
        }
        rctx.putImageData(img, 0, 0);
      }
      rasterDirtyRef.current = false;
    }

    // true-black ground
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, Hh);

    // crisp, hard-edged data (nearest-neighbour upscale)
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(raster, 0, 0, W, Hh);

    // faint drifting grid — keeps idle from ever being a dead black rectangle
    const drift = (driftRef.current % 1) * (W / COLS) * 8;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (let gx = -1; gx <= COLS / 8 + 1; gx++) {
      const x = Math.round(gx * (W / COLS) * 8 + drift);
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, Hh);
    }
    ctx.stroke();

    // octave frequency guide-lines (brighter, static)
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath();
    for (let hz = 55; hz <= MAX_HZ; hz *= 2) {
      const row = hzRow(hz);
      const y = Math.round((1 - row / (ROWS - 1)) * Hh);
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(W, y + 0.5);
    }
    ctx.stroke();

    // the single accent: a thin cyan playhead scan-line
    if (runningRef.current) {
      const x = (playRef.current / COLS) * W;
      ctx.strokeStyle = "rgba(90,225,255,0.9)";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, Hh);
      ctx.stroke();
    }
  }, []);

  // ── main loop: always drawing (idle grid drift); audio only when running ──
  const frame = useCallback(
    (now: number) => {
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const reduced = reducedRef.current;
      driftRef.current += dt * (reduced ? 0.02 : 0.05);

      if (runningRef.current) {
        const period = reduced ? 20 : 11; // seconds per full sweep (<< 3 Hz)
        playRef.current += (dt / period) * COLS;
        if (playRef.current >= COLS) {
          playRef.current -= COLS;
          lastColRef.current = -1;
        }
        const col = Math.floor(playRef.current);

        // read the active column into the partial bank
        const s = scoreRef.current;
        const buf = colBufRef.current;
        const base = col * ROWS;
        let active = 0;
        for (let r = 0; r < ROWS; r++) {
          buf[r] = s[base + r];
          if (buf[r] > 0.05) active++;
        }
        engineRef.current?.setColumn(buf);

        // hard-edge onset → filtered-noise tick
        if (col !== lastColRef.current) {
          const prev = lastColRef.current < 0 ? col : lastColRef.current;
          const rise = colEnergy(col) - colEnergy(prev);
          if (rise > 1.1) engineRef.current?.triggerClick(Math.min(1, rise / 6));
          lastColRef.current = col;
        }

        // throttled numeric readout (~6 Hz)
        readoutTRef.current += dt;
        if (readoutTRef.current > 0.16) {
          readoutTRef.current = 0;
          // report the brightest partial's frequency
          let bestR = 0;
          let bestV = 0;
          for (let r = 0; r < ROWS; r++) {
            if (buf[r] > bestV) {
              bestV = buf[r];
              bestR = r;
            }
          }
          setReadout({ hz: bestV > 0.05 ? Math.round(rowFreq(bestR)) : 0, active });
        }
      }

      render();
      rafRef.current = requestAnimationFrame(frame);
    },
    [colEnergy, render],
  );

  // start the always-on render loop while mounted
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    // seed with the dot field so the idle screen already reads as a score
    presetDots(scoreRef.current);
    rasterDirtyRef.current = true;
    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [frame]);

  const teardownAudio = useCallback(() => {
    runningRef.current = false;
    engineRef.current?.dispose();
    engineRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  // full teardown on unmount
  useEffect(() => () => teardownAudio(), [teardownAudio]);

  const handleBegin = useCallback(async () => {
    if (runningRef.current) return;
    setAudioError(null);

    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound.");
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Try the button again.");
      return;
    }
    ctxRef.current = ctx;
    const engine = new DatamaticsEngine(ctx);
    engine.start();
    engineRef.current = engine;

    lastColRef.current = -1;
    runningRef.current = true;
    setPhase("running");
  }, []);

  const handlePause = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    engineRef.current?.silence();
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    if (phase !== "paused" || !engineRef.current) return;
    engineRef.current.unsilence();
    lastColRef.current = -1;
    runningRef.current = true;
    setPhase("running");
  }, [phase]);

  const handleStop = useCallback(() => {
    teardownAudio();
    setPhase("idle");
    setReadout({ hz: 0, active: 0 });
  }, [teardownAudio]);

  const loadPreset = useCallback((which: "sweep" | "chord" | "dots" | "clear") => {
    const s = scoreRef.current;
    if (which === "sweep") presetSweep(s);
    else if (which === "chord") presetChord(s);
    else if (which === "dots") presetDots(s);
    else s.fill(0);
    rasterDirtyRef.current = true;
  }, []);

  return (
    <main className="relative min-h-screen w-full touch-none overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden
      />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.25em] text-foreground sm:text-2xl">
          datamatics
        </h1>
        <p className="mt-2 max-w-xl text-base text-muted-foreground">
          The image <span className="text-foreground">is</span> the score. Paint bright
          marks onto the spectrogram; the cyan playhead reads each column as a bank of
          pure sine partials. Vertical = log-frequency, horizontal = time.
        </p>
      </header>

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-5 border border-border bg-black/70 px-8 py-7 text-center backdrop-blur-sm">
            <p className="text-base text-foreground">
              An image-as-score additive resynthesiser in the black-and-white idiom of
              Ryoji Ikeda. Row &rarr; log frequency (55 Hz &ndash; 7.5 kHz), brightness
              &rarr; partial amplitude. Draw a spectrum and hear it.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] min-w-[44px] bg-card px-4 py-2.5 font-mono text-base font-medium uppercase tracking-widest text-black transition-colors hover:bg-accent"
            >
              Begin
            </button>
            <p className="text-base text-muted-foreground">
              Sound + the playhead start on this tap. Then draw anywhere, or load a
              preset below.
            </p>
            {audioError && <p className="text-base text-violet-300">{audioError}</p>}
          </div>
        </div>
      )}

      {/* control dock */}
      <div className="absolute bottom-4 left-1/2 z-10 w-[min(96vw,760px)] -translate-x-1/2">
        <div className="flex flex-wrap items-center gap-2 border border-border bg-black/70 px-4 py-3 backdrop-blur-sm">
          {phase !== "idle" && (
            <div className="mr-2 min-w-[130px] font-mono text-base text-muted-foreground">
              {phase === "paused" ? "paused" : "playing"}
              <span className="text-muted-foreground">
                {" · "}
                {readout.hz > 0 ? `${readout.hz} Hz` : "—"}
                {" · "}
                {readout.active} part
              </span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={() => setTool("draw")}
              className={`min-h-[44px] min-w-[44px] border px-4 py-2.5 font-mono text-base transition-colors ${
                tool === "draw"
                  ? "border-border bg-card text-black"
                  : "border-border text-foreground hover:bg-accent"
              }`}
            >
              draw
            </button>
            <button
              onClick={() => setTool("erase")}
              className={`min-h-[44px] min-w-[44px] border px-4 py-2.5 font-mono text-base transition-colors ${
                tool === "erase"
                  ? "border-border bg-card text-black"
                  : "border-border text-foreground hover:bg-accent"
              }`}
            >
              erase
            </button>
          </div>

          <span className="mx-1 hidden h-6 w-px bg-muted sm:block" />

          <div className="flex flex-wrap items-center gap-1">
            <button
              onClick={() => loadPreset("sweep")}
              className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
            >
              sweep
            </button>
            <button
              onClick={() => loadPreset("chord")}
              className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
            >
              chord
            </button>
            <button
              onClick={() => loadPreset("dots")}
              className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
            >
              dots
            </button>
            <button
              onClick={() => loadPreset("clear")}
              className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
            >
              clear
            </button>
          </div>

          <span className="mx-1 hidden h-6 w-px bg-muted sm:block" />

          <div className="ml-auto flex items-center gap-1">
            {phase === "running" && (
              <button
                onClick={handlePause}
                className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
              >
                pause
              </button>
            )}
            {phase === "paused" && (
              <button
                onClick={handleResume}
                className="min-h-[44px] bg-card px-4 py-2.5 font-mono text-base text-black transition-colors hover:bg-accent"
              >
                resume
              </button>
            )}
            {phase !== "idle" && (
              <button
                onClick={handleStop}
                className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
              >
                stop
              </button>
            )}
          </div>
        </div>
        <p className="mt-2 text-center font-mono text-base text-muted-foreground">
          drag to paint energy · shift-drag or &ldquo;erase&rdquo; to clear · brighter =
          louder partial
        </p>
      </div>

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] border border-border bg-black/50 px-4 py-2.5 font-mono text-base text-foreground backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        design notes
      </button>
      {showNotes && (
        <div className="absolute right-4 top-20 z-30 w-[min(92vw,460px)] border border-border bg-black/85 p-5 text-base text-foreground backdrop-blur-sm">
          <p className="mb-2 font-mono text-xl uppercase tracking-widest text-foreground">
            the image is the score
          </p>
          <p className="mb-2">
            The spectrogram is not an analysis of a sound — it <em>is</em> the sound.
            Each of {ROWS} vertical rows is one pure sine oscillator pinned to a clean
            log-frequency grid ({MIN_HZ} Hz at the bottom, {(MAX_HZ / 1000).toFixed(1)}{" "}
            kHz at the top). The cyan playhead reads the column beneath it; a cell&rsquo;s
            brightness becomes that partial&rsquo;s amplitude, so the timbre morphs to
            match what you draw. Hard high-contrast edges fire a short band-passed noise
            tick, so onsets read as precise.
          </p>
          <p className="mb-2 text-muted-foreground">
            Clinical Ikeda register: pure sines + noise clicks, no warmth, no FM, no
            grain. Dense columns are energy-normalised across partials and the whole bus
            runs through a brick-wall limiter, so a fully-painted column can never spike.
            No strobe — the only periodic motion is a single ~0.09 Hz sweep; respects
            prefers-reduced-motion.
          </p>
          <p className="text-muted-foreground">
            Refs: Ryoji Ikeda &mdash; <em>datamatics</em> / <em>test pattern</em> /{" "}
            <em>data-verse</em> (2026 <em>data.gram [n&ordm;11]</em>); the ANS
            synthesiser; Iannis Xenakis, <em>UPIC</em>; <em>Phosphor</em> (spectral
            synth, Synthtopia Feb 2026); Tembrica Image-to-Sound (Mar 2026).
          </p>
          <div className="mt-3">
            <Link href="/dream" className="font-mono text-foreground underline hover:text-foreground">
              &larr; back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
