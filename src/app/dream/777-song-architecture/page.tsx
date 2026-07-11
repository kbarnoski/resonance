"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPianoBuffer, makeFallbackBuffer } from "./audio";
import { computeSsm, type SsmResult } from "./ssm";

// Luminous heatmap colormap: deep-violet -> magenta -> amber -> white-hot.
function heat(t: number): [number, number, number] {
  const v = t < 0 ? 0 : t > 1 ? 1 : t;
  // piecewise gradient stops
  const stops: Array<[number, number, number, number]> = [
    [0.0, 12, 6, 28], // near-black violet
    [0.25, 78, 18, 110], // deep violet
    [0.5, 196, 36, 138], // magenta
    [0.72, 248, 132, 52], // amber
    [0.9, 255, 214, 120], // gold
    [1.0, 255, 255, 250], // white hot
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, r0, g0, b0] = stops[i];
    const [p1, r1, g1, b1] = stops[i + 1];
    if (v >= p0 && v <= p1) {
      const f = (v - p0) / (p1 - p0 || 1);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  return [255, 255, 250];
}

type Status =
  | "idle"
  | "loading"
  | "analyzing"
  | "ready"
  | "playing"
  | "error";

interface Engine {
  ctx: AudioContext;
  buffer: AudioBuffer;
  ssm: SsmResult;
  isFallback: boolean;
}

export default function SongArchitecturePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [isFallback, setIsFallback] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hover, setHover] = useState<{ i: number; j: number; s: number } | null>(
    null
  );
  const [compareMsg, setCompareMsg] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const compareSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number>(0); // ctx.currentTime when playback began
  const playheadRef = useRef<number>(-1); // current frame index, -1 = none
  const baseImageRef = useRef<ImageData | null>(null);

  // ----- rendering ----------------------------------------------------------

  const drawBase = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx = ctx2d as CanvasRenderingContext2D;
    const N = engine.ssm.size;
    const px = canvas.width;
    // Build the heatmap into an offscreen ImageData at matrix resolution,
    // then scale-blit it for crisp, fast redraws.
    const img = ctx.createImageData(N, N);
    const m = engine.ssm.matrix;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        let v = m[i * N + j];
        // gentle gamma to make off-diagonal stripes pop
        v = Math.pow(v, 1.6);
        const [r, g, b] = heat(v);
        const o = (i * N + j) * 4;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    baseImageRef.current = img;
    // blit scaled
    const tmp = document.createElement("canvas");
    tmp.width = N;
    tmp.height = N;
    const tctx = tmp.getContext("2d");
    if (!tctx) return;
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(tmp, 0, 0, px, px);

    drawNovelty(ctx, engine.ssm, px);
    drawAxisLabels(ctx, engine.ssm, px);
  }, []);

  const drawNovelty = (
    ctx: CanvasRenderingContext2D,
    ssm: SsmResult,
    px: number
  ) => {
    const N = ssm.size;
    const cell = px / N;
    const band = 26;
    // bottom edge novelty curve
    ctx.save();
    ctx.strokeStyle = "rgba(110, 231, 183, 0.95)"; // emerald
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let c = 0; c < N; c++) {
      const x = c * cell + cell / 2;
      const y = px - 4 - ssm.novelty[c] * (band - 6);
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // peak ticks (likely section boundaries)
    ctx.fillStyle = "rgba(110, 231, 183, 0.9)";
    for (let c = 1; c < N - 1; c++) {
      if (
        ssm.novelty[c] > 0.5 &&
        ssm.novelty[c] >= ssm.novelty[c - 1] &&
        ssm.novelty[c] > ssm.novelty[c + 1]
      ) {
        const x = c * cell + cell / 2;
        ctx.fillRect(x - 1, px - band, 2, band);
      }
    }
    ctx.restore();
  };

  const drawAxisLabels = (
    ctx: CanvasRenderingContext2D,
    ssm: SsmResult,
    px: number
  ) => {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "11px ui-monospace, monospace";
    const total = (ssm.size * ssm.frameSec).toFixed(0);
    ctx.fillText("0s", 4, 14);
    ctx.fillText(`${total}s`, px - 30, 14);
    ctx.fillText("time →", px - 56, px - 32);
    ctx.restore();
  };

  const drawFrame = useCallback(() => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx = ctx2d as CanvasRenderingContext2D;
    const N = engine.ssm.size;
    const px = canvas.width;
    const cell = px / N;

    // redraw base from cached scaled bitmap
    const img = baseImageRef.current;
    if (img) {
      const tmp = document.createElement("canvas");
      tmp.width = N;
      tmp.height = N;
      const tctx = tmp.getContext("2d");
      if (tctx) {
        tctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, px, px);
      }
    }
    drawNovelty(ctx, engine.ssm, px);
    drawAxisLabels(ctx, engine.ssm, px);

    // playhead crosshair
    let frame = playheadRef.current;
    if (status === "playing" && sourceRef.current) {
      const elapsed = engine.ctx.currentTime - playStartRef.current;
      frame = Math.floor(elapsed / engine.ssm.frameSec);
      if (frame >= N) {
        frame = -1;
      }
      playheadRef.current = frame;
    }
    if (frame >= 0 && frame < N) {
      const cx = frame * cell;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.fillRect(cx, 0, cell, px); // column
      ctx.fillRect(0, cx, px, cell); // row
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx, cx, cell, cell); // self-similarity diagonal cell
      ctx.restore();
    }

    // hover highlight
    if (hover) {
      ctx.save();
      ctx.strokeStyle = "rgba(110,231,183,0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(hover.j * cell, hover.i * cell, cell, cell);
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [status, hover]);

  // keep rAF loop alive while ready/playing
  useEffect(() => {
    if (status === "ready" || status === "playing") {
      rafRef.current = requestAnimationFrame(drawFrame);
      return () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      };
    }
  }, [status, drawFrame]);

  // ----- audio control ------------------------------------------------------

  const stopAllCompare = () => {
    for (const s of compareSourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    compareSourcesRef.current = [];
  };

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
    playheadRef.current = -1;
  }, []);

  const startPlayback = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    stopPlayback();
    stopAllCompare();
    setCompareMsg(null);
    const src = engine.ctx.createBufferSource();
    src.buffer = engine.buffer;
    src.connect(engine.ctx.destination);
    src.onended = () => {
      if (sourceRef.current === src) {
        sourceRef.current = null;
        playheadRef.current = -1;
        setStatus("ready");
      }
    };
    playStartRef.current = engine.ctx.currentTime;
    playheadRef.current = 0;
    src.start();
    sourceRef.current = src;
    setStatus("playing");
  }, [stopPlayback]);

  const loadAndAnalyze = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (engineRef.current) {
      // already loaded — just (re)start playback
      startPlayback();
      return;
    }
    setStatus("loading");
    setCompareMsg(null);
    type WindowAC = typeof AudioContext;
    const ACtor: WindowAC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: WindowAC })
        .webkitAudioContext;
    const ctx = new ACtor();
    try {
      await ctx.resume();
    } catch {
      /* noop */
    }

    let buffer = await fetchPianoBuffer(ctx);
    let fallback = false;
    if (!buffer) {
      fallback = true;
      const OfflineCtor: typeof OfflineAudioContext =
        window.OfflineAudioContext ||
        (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
          .webkitOfflineAudioContext;
      try {
        buffer = await makeFallbackBuffer(OfflineCtor);
      } catch {
        setStatus("error");
        return;
      }
    }
    setIsFallback(fallback);

    setStatus("analyzing");
    // yield a frame so the "analyzing" label paints
    await new Promise((r) => setTimeout(r, 30));
    const ssm = computeSsm(buffer, 96);

    engineRef.current = { ctx, buffer, ssm, isFallback: fallback };
    setStatus("ready");
    // draw base after the canvas is sized
    requestAnimationFrame(() => {
      drawBase();
      startPlayback();
    });
  }, [drawBase, startPlayback]);

  // Click an off-diagonal cell -> play frame i (~2s) then frame j (~2s).
  const playComparison = useCallback((i: number, j: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    stopPlayback();
    stopAllCompare();
    setStatus("ready");
    const { ctx, buffer, ssm } = engine;
    const seg = Math.min(2.0, ssm.frameSec * 2);
    const tiOff = i * ssm.frameSec;
    const tjOff = j * ssm.frameSec;
    const now = ctx.currentTime + 0.05;

    const mk = (offset: number, at: number) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      const g = ctx.createGain();
      // tiny fades to avoid clicks
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.04);
      g.gain.setValueAtTime(1, at + seg - 0.06);
      g.gain.linearRampToValueAtTime(0, at + seg);
      s.connect(g).connect(ctx.destination);
      s.start(at, Math.min(offset, Math.max(0, buffer.duration - seg)), seg);
      compareSourcesRef.current.push(s);
    };
    mk(tiOff, now);
    mk(tjOff, now + seg + 0.12);
    const sim = (ssm.matrix[i * ssm.size + j] * 100).toFixed(0);
    setCompareMsg(
      `Comparing ${tiOff.toFixed(1)}s ↔ ${tjOff.toFixed(1)}s  (similarity ${sim}%) — listen: same phrase?`
    );
  }, [stopPlayback]);

  // ----- canvas pointer events ---------------------------------------------

  const cellFromEvent = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const N = engine.ssm.size;
    const x = ((e.clientX - rect.left) / rect.width) * N;
    const y = ((e.clientY - rect.top) / rect.height) * N;
    const j = Math.floor(x);
    const i = Math.floor(y);
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return { i, j, s: engine.ssm.matrix[i * N + j] };
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = cellFromEvent(e);
    setHover(c);
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = cellFromEvent(e);
    if (!c) return;
    // require a reasonably similar, non-trivial off-diagonal cell
    if (Math.abs(c.i - c.j) < 2) {
      setCompareMsg("That's on the diagonal (a frame vs itself). Click a bright off-diagonal cell.");
      return;
    }
    if (c.s < 0.4) {
      setCompareMsg("Those two moments aren't very similar. Aim for a brighter cell.");
      return;
    }
    playComparison(c.i, c.j);
  };

  // ----- cleanup ------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopAllCompare();
      const engine = engineRef.current;
      if (sourceRef.current) {
        try {
          sourceRef.current.stop();
        } catch {
          /* noop */
        }
      }
      if (engine) {
        try {
          void engine.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // ----- UI -----------------------------------------------------------------

  const busy = status === "loading" || status === "analyzing";
  const btnLabel =
    status === "idle"
      ? "Play his recording"
      : status === "loading"
        ? "Loading recording…"
        : status === "analyzing"
          ? "Computing the matrix…"
          : status === "playing"
            ? "Restart from the top"
            : "Play again";

  return (
    <main className="min-h-screen bg-[#0a0712] text-foreground px-6 py-10 flex flex-col items-center font-sans">
      <div className="w-full max-w-3xl">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Song Architecture
          </h1>
          <p className="mt-2 text-base text-muted-foreground max-w-2xl">
            A self-similarity matrix of Karel&apos;s &ldquo;Welcome Home&rdquo;
            piano recording — the hidden form drawn as a luminous heatmap.
            Bright off-diagonal stripes are where a phrase{" "}
            <span className="text-violet-300">recurs</span>.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={loadAndAnalyze}
            disabled={busy}
            className="min-h-[44px] px-4 py-2.5 rounded-md bg-violet-500/90 hover:bg-violet-400 disabled:opacity-60 disabled:cursor-wait text-foreground font-medium text-base transition-colors"
          >
            {btnLabel}
          </button>
          {status === "playing" && (
            <button
              onClick={stopPlayback}
              className="min-h-[44px] px-4 py-2.5 rounded-md bg-muted hover:bg-accent text-foreground text-base transition-colors"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] px-4 py-2.5 rounded-md bg-transparent border border-border hover:border-border text-muted-foreground text-base ml-auto transition-colors"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </div>

        {isFallback && (
          <p className="mb-3 text-base text-violet-300/95">
            Using a synthesized stand-in (his recording unavailable here) — it
            still has a clear A&middot;B&middot;A form, so the recurrence stripes
            are real.
          </p>
        )}
        {status === "error" && (
          <p className="mb-3 text-base text-violet-300">
            Could not start audio. Try the button again after a click.
          </p>
        )}

        <div className="relative rounded-lg overflow-hidden border border-border bg-black/40">
          <canvas
            ref={canvasRef}
            width={640}
            height={640}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onClick={onClick}
            className="block w-full aspect-square cursor-crosshair"
            style={{ touchAction: "none" }}
          />
          {status === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center text-center px-8 pointer-events-none">
              <p className="text-base text-muted-foreground">
                Press play. The piece plays whole while its structure is
                computed in your browser and drawn here.
              </p>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-base text-violet-300 animate-pulse">
                {status === "loading"
                  ? "Fetching audio…"
                  : "Slicing frames · chroma · N×N cosine…"}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 min-h-[44px] text-base">
          {compareMsg ? (
            <span className="text-violet-300">{compareMsg}</span>
          ) : hover && engineRef.current ? (
            <span className="text-muted-foreground font-mono text-sm">
              cell ({hover.i},{hover.j}) ={" "}
              {(hover.s * 100).toFixed(0)}% similar &nbsp;·&nbsp;{" "}
              {(hover.i * (engineRef.current.ssm.frameSec)).toFixed(1)}s vs{" "}
              {(hover.j * engineRef.current.ssm.frameSec).toFixed(1)}s
              {Math.abs(hover.i - hover.j) >= 2 && hover.s >= 0.4 ? (
                <span className="text-violet-300"> — click to hear both</span>
              ) : null}
            </span>
          ) : status === "playing" ? (
            <span className="text-muted-foreground">
              The crosshair sweeps the diagonal in time with the music.
            </span>
          ) : status === "ready" ? (
            <span className="text-muted-foreground">
              Hover the heatmap; click a bright off-diagonal cell to hear two
              similar moments back-to-back.
            </span>
          ) : null}
        </div>

        {showNotes && (
          <section className="mt-5 rounded-lg border border-border bg-black/30 p-5 text-base text-muted-foreground leading-relaxed space-y-3">
            <h2 className="text-xl font-semibold text-foreground">
              Design notes
            </h2>
            <p>
              This is a <span className="text-violet-300">Foote
              self-similarity matrix</span>. The audio is sliced into ~1-second
              frames; each frame becomes a 12-bin{" "}
              <span className="text-violet-300">chroma</span> vector (FFT
              magnitudes folded into pitch classes), and cell{" "}
              <span className="font-mono">(i,j)</span> is the cosine similarity
              between frame i and frame j.
            </p>
            <p>
              The diagonal is white-hot (every frame matches itself). The
              payoff is the <span className="text-violet-300">off-diagonal
              stripes</span>: parallel lines mean a passage returns. The{" "}
              <span className="text-violet-300">emerald novelty curve</span>{" "}
              along the bottom is a checkerboard-kernel correlation whose peaks
              mark likely section boundaries.
            </p>
            <p>
              Click a bright off-diagonal cell to{" "}
              <span className="text-violet-300">resynthesize</span> the two
              moments back-to-back from the decoded buffer — the visual claims a
              repeat; your ears confirm it.
            </p>
            <p className="text-muted-foreground">
              Reference: Jonathan Foote, <em>&ldquo;Visualizing Music and Audio
              using Self-Similarity&rdquo;</em> (ACM Multimedia, 1999). See also
              SSM-Net and &ldquo;Generating Music with Structure Using
              Self-Similarity as Attention&rdquo; (arXiv, 2024).
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
