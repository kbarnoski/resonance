"use client";

// ════════════════════════════════════════════════════════════════════════════
// 11240-datamatics — "your music as raw information"
//
// THE ONE QUESTION: "What if your music were stripped to pure data — rendered as
// a strict 1-bit black/white/red scanning bitmap and test-pattern grid, the way
// Ryoji Ikeda turns sound into raw information?"
//
// A seeded, self-playing synth pattern (or a dropped audio file) is analysed with
// an FFT. The spectral magnitude field is quantized to ONE BIT via 8×8 ordered
// (Bayer) dithering and painted as a hard black-and-white raster that scrolls
// right→left like a data tape. Spectral-flux onsets punch sparse pure-RED index
// marks into the margins; the strongest onsets fire an Ikeda test-pattern
// barcode band. High-contrast, clinical, information-as-aesthetic.
//
// SUBSYSTEMS: (a) seeded step-sequencer synth + audio-file decode path,
// (b) FFT analyser + spectral-flux onset detector, (c) ordered-dither 1-bit
// rasterizer, (d) test-pattern / red-index sequencer synced to onsets.
//
// STROBE SAFETY: the scan is a spatial SCROLL, never a full-field flash. The
// whole canvas is never inverted or flashed. The test-pattern band is a small
// area, rate-limited to ≤ ~2 Hz. Under prefers-reduced-motion the tape freezes
// to a slow crawl and all bar-flash is disabled. Full teardown on unmount.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { DatamaticsAudio, mulberry32 } from "./synth";
import { rasterizeTape, drawTestBars } from "./dither";

// ─── Raster geometry (backing store; CSS scales it up, pixelated) ─────────────
const W = 384; // tape columns
const H = 216; // spectral rows
const SEED = 0x11240;

type Phase = "idle" | "running";

// Per-frame mutable engine state, kept out of React so rAF never re-renders.
interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  audio: DatamaticsAudio;
  analyser: AnalyserNode;
  freq: Uint8Array<ArrayBuffer>;
  prevFreq: Float32Array;
  rowBin: Int32Array; // row → FFT bin (log-frequency, low at bottom)
  colMag: Float32Array; // W*H ring buffer of magnitudes
  redFlags: Uint8Array; // W ring buffer of red-index marks
  head: number;
  colAcc: number; // fractional column accumulator for tape speed
  fluxAvg: number;
  lastOnset: number;
  lastBeat: number;
  redPending: boolean;
  // test-pattern band
  barCells: Uint8Array;
  barActive: boolean;
  barRed: boolean;
  barExpire: number;
  barY0: number;
  barY1: number;
  raf: number;
  objectUrl: string | null;
  reduced: boolean;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("seeded pattern");
  const [showNotes, setShowNotes] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ─── Render loop ────────────────────────────────────────────────────────────
  const runFrame = useCallback((imgData: ImageData, now: number) => {
    const e = engineRef.current;
    const canvas = canvasRef.current;
    if (!e || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const t = e.ctx.currentTime;
    e.analyser.getByteFrequencyData(e.freq);

    // (b) spectral-flux onset detector — positive spectral change over time.
    let flux = 0;
    let lowFlux = 0;
    for (let i = 0; i < e.freq.length; i++) {
      const cur = e.freq[i] / 255;
      const d = cur - e.prevFreq[i];
      if (d > 0) {
        flux += d;
        if (i < 24) lowFlux += d; // low band → "beat"
      }
      e.prevFreq[i] = cur;
    }
    e.fluxAvg = e.fluxAvg * 0.92 + flux * 0.08;
    const onset = flux > e.fluxAvg * 1.6 + 0.4 && t - e.lastOnset > 0.11;
    if (onset) {
      e.lastOnset = t;
      e.redPending = true;
    }
    // (d) test-pattern band on strong low-band onsets — rate-limited, small area.
    const beat = lowFlux > 0.9 && t - e.lastBeat > 0.42;
    if (beat && !e.reduced) {
      e.lastBeat = t;
      makeBarCells(e, now);
      e.barActive = true;
      e.barRed = lowFlux > 2.2; // only the very strongest beats go red
      e.barExpire = t + 0.34;
    }
    if (e.barActive && t > e.barExpire) e.barActive = false;

    // (c) advance the data tape by whole columns (spatial scroll — safe).
    const dt = 1 / 60;
    const speed = e.reduced ? 7 : 84; // columns / second
    e.colAcc += speed * dt;
    let adds = Math.floor(e.colAcc);
    if (adds > 4) adds = 4; // clamp after tab-away
    e.colAcc -= adds;
    for (let a = 0; a < adds; a++) addColumn(e);

    // (c) rasterize the ring buffer to a strict 1-bit image with red index marks.
    rasterizeTape(imgData, W, H, e.colMag, e.redFlags, e.head);

    // (d) overlay the Ikeda test-pattern barcode band (small area, not full-field).
    if (e.barActive) {
      drawTestBars(imgData, W, e.barY0, e.barY1, e.barCells, e.barRed);
    }

    ctx2d.putImageData(imgData, 0, 0);
    e.raf = requestAnimationFrame((ts) => runFrame(imgData, ts));
  }, []);

  // ─── Start ──────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (engineRef.current) return;
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    void ctx.resume();
    const master = createSafeMaster(ctx, { gain: 0.8 });
    const audio = new DatamaticsAudio(ctx, master.input, SEED);

    // dedicated analyser tapping the source, low smoothing for crisp flux.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.5;
    audio.output.connect(analyser);

    // log-frequency row map (low freq at bottom).
    const bins = analyser.frequencyBinCount; // 512
    const nyquistBin = bins;
    const minHz = 55;
    const maxHz = 12000;
    const hzPerBin = ctx.sampleRate / analyser.fftSize;
    const minBin = Math.max(1, Math.floor(minHz / hzPerBin));
    const maxBin = Math.min(nyquistBin - 1, Math.ceil(maxHz / hzPerBin));
    const rowBin = new Int32Array(H);
    for (let r = 0; r < H; r++) {
      const frac = (H - 1 - r) / (H - 1); // 0 at bottom → low freq
      const bin = Math.round(minBin * Math.pow(maxBin / minBin, frac));
      rowBin[r] = Math.min(maxBin, Math.max(minBin, bin));
    }

    const e: Engine = {
      ctx,
      master,
      audio,
      analyser,
      freq: new Uint8Array(bins),
      prevFreq: new Float32Array(bins),
      rowBin,
      colMag: new Float32Array(W * H),
      redFlags: new Uint8Array(W),
      head: 0,
      colAcc: 0,
      fluxAvg: 0,
      lastOnset: 0,
      lastBeat: 0,
      redPending: false,
      barCells: new Uint8Array(W),
      barActive: false,
      barRed: false,
      barExpire: 0,
      barY0: Math.round(H * 0.4),
      barY1: Math.round(H * 0.4) + Math.round(H * 0.16),
      raf: 0,
      objectUrl: null,
      reduced: prefersReducedMotion(),
    };
    engineRef.current = e;

    audio.startSeeded();
    setSourceLabel("seeded pattern");
    setPhase("running");

    const imgData = new ImageData(W, H);
    e.raf = requestAnimationFrame((ts) => runFrame(imgData, ts));
  }, [runFrame]);

  // ─── Teardown ─────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    cancelAnimationFrame(e.raf);
    e.audio.dispose();
    try {
      e.analyser.disconnect();
    } catch {
      /* closing */
    }
    e.master.disconnect();
    if (e.objectUrl) URL.revokeObjectURL(e.objectUrl);
    void e.ctx.close();
    engineRef.current = null;
  }, []);

  const handleStop = useCallback(() => {
    teardown();
    setPhase("idle");
  }, [teardown]);

  useEffect(() => () => teardown(), [teardown]);

  // ─── Audio-file drop → decode → swap source ──────────────────────────────────
  const loadFile = useCallback(async (file: File) => {
    const e = engineRef.current;
    if (!e) {
      setError("Press Start first, then drop an audio file.");
      return;
    }
    if (!file.type.startsWith("audio/") && !/\.(wav|mp3|ogg|m4a|flac)$/i.test(file.name)) {
      setError(`Not an audio file: ${file.name}. Still running the seeded pattern.`);
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const audioBuf = await e.ctx.decodeAudioData(buf);
      if (e.objectUrl) {
        URL.revokeObjectURL(e.objectUrl);
        e.objectUrl = null;
      }
      e.audio.playBuffer(audioBuf);
      setSourceLabel(file.name);
      setError(null);
    } catch {
      setError(`Could not decode ${file.name}. Still running the seeded pattern.`);
    }
  }, []);

  const onDrop = useCallback(
    (ev: DragEvent) => {
      ev.preventDefault();
      setDragOver(false);
      const file = ev.dataTransfer.files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* the 1-bit raster canvas — pixelated scaling keeps the dither hard-edged */}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated", background: "#000" }}
      />

      {/* idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-background/80 px-6 text-center backdrop-blur-sm">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              datamatics — your music as raw information
            </h1>
            <p className="mt-3 text-base text-muted-foreground">
              An FFT of the sound, quantized to <span className="font-mono">1 bit</span> by
              ordered (Bayer) dithering and scanned as a black/white data tape with sparse
              red index marks — after Ryoji Ikeda&rsquo;s <em>datamatics</em> and{" "}
              <em>test pattern</em>.
            </p>
          </div>
          <button
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* running chrome */}
      {phase === "running" && (
        <div
          className={`absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-end sm:justify-between ${
            dragOver ? "bg-primary/10" : ""
          }`}
          onDragOver={(ev) => {
            ev.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="rounded-md border border-border bg-background/70 px-4 py-3 backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              source
            </p>
            <p className="mt-1 max-w-[60vw] truncate text-base text-foreground">{sourceLabel}</p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              drop a WAV / MP3 here to scan it instead
            </p>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              design notes
            </button>
            <button
              onClick={handleStop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* strobe-safety note — always visible while running */}
      {phase === "running" && (
        <p className="pointer-events-none absolute left-4 top-4 z-10 font-mono text-xs text-muted-foreground">
          motion is strobe-limited: spatial scroll only, no full-field flashing
        </p>
      )}

      {/* design-notes panel */}
      {showNotes && (
        <div className="absolute right-4 top-4 z-30 w-[min(92vw,460px)] rounded-md border border-border bg-background/90 p-5 text-base text-foreground backdrop-blur-md">
          <p className="mb-2 font-mono text-sm uppercase tracking-widest text-muted-foreground">
            information as aesthetic
          </p>
          <p className="mb-2">
            The image is not decoration over the sound — it <em>is</em> the sound&rsquo;s
            spectrum, quantized to a single bit. An FFT gives a magnitude per frequency;
            an 8×8 Bayer matrix fixed in screen space decides, per pixel, black or white.
            New spectral columns push in at the right, so the tape scrolls left as pure
            data.
          </p>
          <p className="mb-2 text-muted-foreground">
            Spectral-flux onsets punch sparse pure-red index marks into the margins; the
            strongest low-band beats fire a hard-edged test-pattern barcode band. Palette
            is strictly #000 / #fff with #f00 index marks — after Ryoji Ikeda&rsquo;s{" "}
            <em>datamatics</em> and <em>test pattern</em>.
          </p>
          <p className="mb-3 text-muted-foreground">
            Strobe-safe by construction: the whole frame is never inverted or flashed; the
            scan is spatial scroll; the barcode band is a small area, rate-limited. Under
            prefers-reduced-motion the tape crawls and all bar-flash is off.
          </p>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              close
            </button>
            <Link href="/dream" className="text-sm text-muted-foreground underline hover:text-foreground">
              back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}

// ─── Engine helpers (never begin with "use") ─────────────────────────────────

/** Push one new spectral column into the ring buffer at a fresh head slot. */
function addColumn(e: Engine): void {
  e.head = (e.head + 1) % W;
  const base = e.head * H;
  for (let r = 0; r < H; r++) {
    let m = e.freq[e.rowBin[r]] / 255;
    m = Math.pow(m, 0.72); // gentle contrast so structure survives 1-bit
    e.colMag[base + r] = m;
  }
  e.redFlags[e.head] = e.redPending ? 1 : 0;
  e.redPending = false;
}

/** Build a hard-edged Ikeda barcode for the test-pattern band. */
function makeBarCells(e: Engine, now: number): void {
  // deterministic-ish per beat but seeded from the global mulberry32 stream so
  // the barcode is stable & reproducible, biased by current spectral energy.
  const rng = mulberry32((SEED ^ Math.floor(now)) >>> 0);
  let x = 0;
  while (x < W) {
    const wbar = 1 + Math.floor(rng() * 6); // 1..6 px bar
    // sample the newest spectral column to decide on/off — data drives the pattern
    const specRow = Math.floor(rng() * H);
    const energetic = e.colMag[e.head * H + specRow] > 0.35;
    const on = energetic ? rng() < 0.72 : rng() < 0.3;
    for (let i = 0; i < wbar && x < W; i++, x++) e.barCells[x] = on ? 1 : 0;
  }
}
