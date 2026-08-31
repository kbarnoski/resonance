"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16560 · Spectral Braid — paint which of two DIFFERENT recordings of Karel's
// piano shows through, across the whole time×frequency plane, and hear the two
// takes braided into one impossible performance that is neither.
//
//   "What if you could PAINT which of two different takes shows through, across
//    the whole time–frequency plane — and hear them cross-synthesised into one
//    performance that is neither?"
//
//   Both takes are analysed offline into STFT frames (Hann, 2048-pt, 4× overlap).
//   You brush a mask over a log-frequency spectrogram: copper regions rebuild
//   from take A, verdigris regions from take B, magnitude blending in between.
//   On play, a ScriptProcessor streams the recombined spectrum via overlap-add —
//   Karel's own sound on both sides, never a synth. Fallback: an equal-power
//   crossfade of the two takes driven by the painted mask's average.
//
//   REF: IRCAM ASAP "Spectral Crossing" / spectral cross-synthesis tradition.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  analyzeTake,
  buildBinToRow,
  buildMagGrid,
  toMono,
  ResynthEngine,
  HOP,
  type StftData,
} from "./engine";

const COLS = 120; // time cells
const ROWS = 64; // log-frequency bands
const MAX_FRAMES = 1500; // ~17s analysed span per take (44.1k / 512 hop)

// ART duotone (canvas only): warm copper = take A, cool verdigris = take B.
const COPPER: [number, number, number] = [196, 112, 58]; // #c4703a
const VERDI: [number, number, number] = [143, 179, 173]; // #8fb3ad

type Status = "idle" | "loading" | "analyzing" | "playing" | "error";

export default function SpectralBraidPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [fellBack, setFellBack] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [brush, setBrush] = useState<0 | 1>(0); // 0 = paint A, 1 = paint B
  const [showNotes, setShowNotes] = useState(false);
  const [idA, setIdA] = useState(REAL_TRACKS[0].id);
  const [idB, setIdB] = useState(REAL_TRACKS[12 % REAL_TRACKS.length].id);
  const [titleA, setTitleA] = useState(REAL_TRACKS[0].title);
  const [titleB, setTitleB] = useState(REAL_TRACKS[12 % REAL_TRACKS.length].title);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const scriptRef = useRef<ScriptProcessorNode | null>(null);
  const engineRef = useRef<ResynthEngine | null>(null);
  const rafRef = useRef<number>(0);

  // Persistent, in-place mask read live by the audio engine while painting.
  const maskRef = useRef<Float32Array>(new Float32Array(COLS * ROWS).fill(0.5));
  const magGridARef = useRef<Float32Array | null>(null);
  const magGridBRef = useRef<Float32Array | null>(null);
  const binToRowRef = useRef<Int16Array>(buildBinToRow(ROWS));

  // Fallback crossfade nodes.
  const fbRef = useRef<{
    a: AudioBufferSourceNode;
    b: AudioBufferSourceNode;
    ga: GainNode;
    gb: GainNode;
    start: number;
    dur: number;
  } | null>(null);

  // What we last analysed, to avoid recomputing on replay.
  const analyzedForRef = useRef<string>("");
  const brushRef = useRef<0 | 1>(0);
  brushRef.current = brush;

  // ── drawing ────────────────────────────────────────────────────────────────
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    const magA = magGridARef.current;
    const magB = magGridBRef.current;
    const mask = maskRef.current;

    // Offscreen cell grid → scaled onto the stage for a soft duotone field.
    let off = offscreenRef.current;
    if (!off) {
      off = document.createElement("canvas");
      off.width = COLS;
      off.height = ROWS;
      offscreenRef.current = off;
    }
    const og = off.getContext("2d");
    if (og) {
      const img = og.createImageData(COLS, ROWS);
      const data = img.data;
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < ROWS; r++) {
          const m = mask[c * ROWS + r];
          const ma = magA ? magA[c * ROWS + r] : 0;
          const mb = magB ? magB[c * ROWS + r] : 0;
          const mag = (1 - m) * ma + m * mb;
          const bright = 0.14 + 0.86 * mag;
          const rr = ((1 - m) * COPPER[0] + m * VERDI[0]) * bright;
          const gg = ((1 - m) * COPPER[1] + m * VERDI[1]) * bright;
          const bb = ((1 - m) * COPPER[2] + m * VERDI[2]) * bright;
          // top of canvas = high freq (row ROWS-1)
          const y = ROWS - 1 - r;
          const p = (y * COLS + c) * 4;
          data[p] = rr;
          data[p + 1] = gg;
          data[p + 2] = bb;
          data[p + 3] = 255;
        }
      }
      og.putImageData(img, 0, 0);
    }

    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(off, 0, 0, W, H);

    // Playhead.
    const eng = engineRef.current;
    let t = -1;
    if (eng && status === "playing") {
      t = eng.currentFrame / eng.totalFrames;
    } else if (fbRef.current && status === "playing") {
      const now = ctxRef.current ? ctxRef.current.currentTime : 0;
      const { start, dur } = fbRef.current;
      t = dur > 0 ? ((now - start) % dur) / dur : 0;
    }
    if (t >= 0) {
      const x = t * W;
      g.strokeStyle = "rgba(245,240,235,0.85)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, H);
      g.stroke();
    }

    // Keep fallback crossfade tracking the painted mask.
    if (fbRef.current) {
      let sum = 0;
      for (let i = 0; i < mask.length; i++) sum += mask[i];
      const mean = sum / mask.length;
      const tt = (mean * Math.PI) / 2;
      fbRef.current.ga.gain.value = Math.cos(tt);
      fbRef.current.gb.gain.value = Math.sin(tt);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [status]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawFrame]);

  // ── painting ─────────────────────────────────────────────────────────────
  const paintingRef = useRef(false);

  const paintAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    const cc = fx * COLS;
    const rr = (1 - fy) * ROWS; // invert: top = high freq
    const target = brushRef.current; // 0 or 1
    const mask = maskRef.current;
    const radius = 7; // cells
    const rad2 = radius * radius;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const dc = c + 0.5 - cc;
        const dr = r + 0.5 - rr;
        const d2 = dc * dc + dr * dr;
        if (d2 > rad2) continue;
        const fall = 1 - Math.sqrt(d2) / radius; // 0..1 soft edge
        const strength = 0.35 * fall * fall;
        const i = c * ROWS + r;
        mask[i] += (target - mask[i]) * strength;
      }
    }
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      paintingRef.current = true;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      paintAt(e.clientX, e.clientY);
    },
    [paintAt],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!paintingRef.current) return;
      paintAt(e.clientX, e.clientY);
    },
    [paintAt],
  );
  const onPointerUp = useCallback(() => {
    paintingRef.current = false;
  }, []);

  // ── teardown of live audio (keeps ctx for quick replay) ──────────────────
  const stopAudio = useCallback(() => {
    if (scriptRef.current) {
      scriptRef.current.onaudioprocess = null;
      try {
        scriptRef.current.disconnect();
      } catch {
        /* already gone */
      }
      scriptRef.current = null;
    }
    if (fbRef.current) {
      try {
        fbRef.current.a.stop();
        fbRef.current.b.stop();
      } catch {
        /* already stopped */
      }
      fbRef.current = null;
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (scriptRef.current) {
        scriptRef.current.onaudioprocess = null;
        try {
          scriptRef.current.disconnect();
        } catch {
          /* noop */
        }
      }
      if (fbRef.current) {
        try {
          fbRef.current.a.stop();
          fbRef.current.b.stop();
        } catch {
          /* noop */
        }
      }
      if (masterRef.current) masterRef.current.disconnect();
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
    };
  }, []);

  // ── the braid: load → analyse → resynthesise ─────────────────────────────
  const runFallback = useCallback(
    (ctx: AudioContext, master: SafeMaster, bufA: AudioBuffer, bufB: AudioBuffer) => {
      const a = ctx.createBufferSource();
      const b = ctx.createBufferSource();
      a.buffer = bufA;
      b.buffer = bufB;
      a.loop = true;
      b.loop = true;
      const ga = ctx.createGain();
      const gb = ctx.createGain();
      ga.gain.value = Math.cos(Math.PI / 4);
      gb.gain.value = Math.sin(Math.PI / 4);
      a.connect(ga).connect(master.input);
      b.connect(gb).connect(master.input);
      const start = ctx.currentTime + 0.05;
      a.start(start);
      b.start(start);
      const dur = Math.min(bufA.duration, bufB.duration, (MAX_FRAMES * HOP) / ctx.sampleRate);
      fbRef.current = { a, b, ga, gb, start, dur };
      setFellBack(true);
      setStatus("playing");
    },
    [],
  );

  const runPlay = useCallback(async () => {
    setErrMsg(null);
    setFellBack(false);
    try {
      // Reuse or create the context.
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        ctxRef.current = ctx;
      }
      await ctx.resume();
      if (!masterRef.current) masterRef.current = createSafeMaster(ctx);
      const master = masterRef.current;

      setStatus("loading");
      const [ra, rb] = await Promise.all([
        loadRealTrackBuffer(ctx, idA),
        loadRealTrackBuffer(ctx, idB),
      ]);
      const bufA = ra.buffer;
      const bufB = rb.buffer;
      setTitleA(ra.title);
      setTitleB(rb.title);

      const key = `${idA}|${idB}|${ctx.sampleRate}`;
      let engine = engineRef.current;

      if (analyzedForRef.current !== key || !engine) {
        setStatus("analyzing");
        setProgress(0);
        let dataA: StftData;
        let dataB: StftData;
        try {
          const monoA = toMono(bufA);
          const monoB = toMono(bufB);
          dataA = await analyzeTake(monoA, MAX_FRAMES, (d, tot) =>
            setProgress(Math.round((d / tot) * 50)),
          );
          dataB = await analyzeTake(monoB, MAX_FRAMES, (d, tot) =>
            setProgress(50 + Math.round((d / tot) * 50)),
          );
        } catch (analysisErr) {
          console.warn("[spectralbraid] analysis failed, crossfade fallback", analysisErr);
          runFallback(ctx, master, bufA, bufB);
          return;
        }

        const binToRow = binToRowRef.current;
        magGridARef.current = buildMagGrid(dataA, COLS, ROWS, binToRow);
        magGridBRef.current = buildMagGrid(dataB, COLS, ROWS, binToRow);
        engine = new ResynthEngine(dataA, dataB, maskRef.current, COLS, ROWS, binToRow);
        engineRef.current = engine;
        analyzedForRef.current = key;
      }

      // Stream via ScriptProcessor overlap-add.
      if (typeof ctx.createScriptProcessor !== "function") {
        runFallback(ctx, master, bufA, bufB);
        return;
      }
      const eng = engine;
      if (!eng) {
        runFallback(ctx, master, bufA, bufB);
        return;
      }
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (ev: AudioProcessingEvent) => {
        const out = ev.outputBuffer.getChannelData(0);
        try {
          eng.pull(out);
        } catch {
          out.fill(0);
        }
      };
      node.connect(master.input);
      scriptRef.current = node;
      setStatus("playing");
    } catch (err) {
      console.error("[spectralbraid]", err);
      setErrMsg(
        err instanceof Error ? err.message : "Could not load Karel's takes.",
      );
      setStatus("error");
    }
  }, [idA, idB, runFallback]);

  const onToggle = useCallback(() => {
    if (status === "playing") {
      stopAudio();
      const c = ctxRef.current;
      if (c) void c.suspend();
      setStatus("idle");
    } else {
      void runPlay();
    }
  }, [status, stopAudio, runPlay]);

  const clearMask = useCallback((value: number) => {
    maskRef.current.fill(value);
  }, []);

  const busy = status === "loading" || status === "analyzing";
  const playing = status === "playing";

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-5 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Spectral Braid
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Paint which of two different takes of Karel&apos;s piano shows through
          across the time–frequency plane, and hear them cross-synthesised into
          one performance that is neither.
        </p>
      </header>

      {/* stage */}
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-background">
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          <StageCanvas
            canvasRef={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />

          {/* frequency axis hint */}
          <div className="pointer-events-none absolute left-2 top-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            high ↑ freq
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            low ↓ · time →
          </div>

          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
              <p className="text-base font-medium text-foreground">
                {status === "loading" ? "Loading Karel's takes…" : "Analysing takes…"}
              </p>
              {status === "analyzing" && (
                <div className="h-1.5 w-56 overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* take legend */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2 text-foreground">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: "#c4703a" }}
          />
          A · {titleA}
        </span>
        <span className="flex items-center gap-2 text-foreground">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: "#8fb3ad" }}
          />
          B · {titleB}
        </span>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onToggle}
          disabled={busy}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {playing ? "Stop" : busy ? "Working…" : "Play"}
        </button>

        {/* brush A/B */}
        <div className="flex overflow-hidden rounded-md border border-border">
          <button
            onClick={() => setBrush(0)}
            className={`min-h-[44px] px-4 text-sm transition-colors ${
              brush === 0
                ? "bg-accent text-foreground"
                : "bg-background/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            Brush A · copper
          </button>
          <button
            onClick={() => setBrush(1)}
            className={`min-h-[44px] border-l border-border px-4 text-sm transition-colors ${
              brush === 1
                ? "bg-accent text-foreground"
                : "bg-background/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            Brush B · verdigris
          </button>
        </div>

        <button
          onClick={() => clearMask(0)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Fill A
        </button>
        <button
          onClick={() => clearMask(1)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Fill B
        </button>
        <button
          onClick={() => clearMask(0.5)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Braid 50/50
        </button>

        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* track pickers */}
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Take A
          </span>
          <select
            value={idA}
            onChange={(e) => {
              setIdA(e.target.value);
              analyzedForRef.current = "";
            }}
            className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            {REAL_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Take B
          </span>
          <select
            value={idB}
            onChange={(e) => {
              setIdB(e.target.value);
              analyzedForRef.current = "";
            }}
            className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
          >
            {REAL_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {fellBack && (
        <p className="text-sm text-muted-foreground">
          Streaming resynthesis was unavailable — playing an equal-power crossfade
          of the two takes driven by your painted mask instead.
        </p>
      )}
      {errMsg && <p className="text-sm text-destructive">{errMsg}</p>}

      {showNotes && (
        <DesignNotes
          titleA={titleA}
          titleB={titleB}
          onClose={() => setShowNotes(false)}
        />
      )}
    </main>
  );
}

// ── stage canvas (sizes itself to its container × devicePixelRatio) ──────────
function StageCanvas({
  canvasRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(2, Math.floor(rect.width * dpr));
      canvas.height = Math.max(2, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
    />
  );
}

// ── design-notes modal ───────────────────────────────────────────────────────
function DesignNotes({
  titleA,
  titleB,
  onClose,
}: {
  titleA: string;
  titleB: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Design notes
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Spectral Braid
        </h2>
        <div className="mt-4 flex flex-col gap-3 text-base text-muted-foreground">
          <p>
            One question: what if you could paint which of two different takes of
            Karel&apos;s piano shows through — across the whole time–frequency
            plane — and hear them braided into one impossible performance that is
            neither?
          </p>
          <p>
            Both takes ({titleA} and {titleB}) are analysed offline into STFT
            frames — a Hann-windowed, 2048-point transform at 4× overlap — storing
            magnitude and phase per bin. The canvas is that plane: x is time, y is
            log-frequency. Where you brush copper, each cell rebuilds from take A;
            where verdigris, from take B; magnitude blends linearly between, and
            phase follows whichever take dominates the cell.
          </p>
          <p>
            On play a ScriptProcessor streams the recombined spectrum by inverse
            FFT and overlap-add — Karel&apos;s own sound on both sides, no synth.
            If streaming resynthesis is unavailable it degrades to an equal-power
            crossfade of the two takes driven by the mask&apos;s average.
          </p>
          <p className="text-sm">
            Reference: IRCAM ASAP &ldquo;Spectral Crossing&rdquo; and the spectral
            cross-synthesis tradition.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Close
        </button>
      </div>
    </div>
  );
}
