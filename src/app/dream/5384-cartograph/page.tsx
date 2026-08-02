"use client";

// ════════════════════════════════════════════════════════════════════════════
// 5384 — Cartograph
//
// THE QUESTION: "What if you could SEE the hidden architecture of a piece of
// music — where it repeats, where it turns, where its sections begin — as a
// self-similarity heat-map, and click any point to hear that moment?"
//
// This flips Resonance's verb on music from "paint it" to "understand its form".
// A real Music-Structure-Analysis pipeline (Foote self-similarity + novelty
// segmentation), hand-written, Canvas2D only, no npm deps. See README.md.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { analyze, type AnalysisResult } from "./analysis";
import { renderDemo } from "./demo";
import { PlaybackEngine } from "./audio";
import {
  buildHeatmap,
  computeLayout,
  drawScene,
  hitTest,
  type Layout,
} from "./render";

const MAX_WIDTH = 560;
const PATH_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

type Status = "rendering" | "ready" | "error";

interface Meta {
  duration: number;
  sections: number;
  boundaries: number;
  n: number;
}

export default function CartographPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const resultRef = useRef<AnalysisResult | null>(null);
  const heatmapRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const rafRef = useRef<number>(0);
  const virtualStartRef = useRef<number>(0); // performance.now() anchor for the auto sweep
  const lastPlayTimeRef = useRef<number>(0);
  const crossedRef = useRef<Set<number>>(new Set());

  const [status, setStatus] = useState<Status>("rendering");
  const [playing, setPlaying] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pathNote, setPathNote] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [source, setSource] = useState<string>("built-in demo");

  // draw one frame at the current (audio or swept) playhead
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const result = resultRef.current;
    const heatmap = heatmapRef.current;
    const layout = layoutRef.current;
    const engine = engineRef.current;
    if (!canvas || !result || !heatmap || !layout) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const audioPos = engine?.position() ?? null;
    let playTime: number;
    if (audioPos != null) {
      playTime = audioPos;
    } else {
      // seeded auto sweep so a silent, no-interaction review is never blank
      const elapsed = (performance.now() - virtualStartRef.current) / 1000;
      playTime = result.duration > 0 ? elapsed % result.duration : 0;
    }

    // boundary-crossing blip (only meaningful once audio is running)
    if (engine?.isPlaying) {
      const last = lastPlayTimeRef.current;
      for (const b of result.boundaries) {
        const bt = result.frameTimes[b] ?? 0;
        if (last < bt && playTime >= bt && !crossedRef.current.has(b)) {
          engine.blip();
          crossedRef.current.add(b);
        }
      }
      if (playTime < last) crossedRef.current.clear(); // wrapped / re-seeked
    }
    lastPlayTimeRef.current = playTime;

    drawScene(ctx, layout, result, heatmap, playTime);
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  const applyBuffer = useCallback(
    (buffer: AudioBuffer, label: string) => {
      const result = analyze(buffer);
      resultRef.current = result;
      heatmapRef.current = buildHeatmap(result);
      engineRef.current?.setBuffer(buffer);
      crossedRef.current.clear();
      lastPlayTimeRef.current = 0;
      virtualStartRef.current = performance.now();
      setMeta({
        duration: result.duration,
        sections: result.segments.length,
        boundaries: result.boundaries.length,
        n: result.n,
      });
      setSource(label);
      setStatus("ready");
    },
    [],
  );

  // size the canvas to its container (with device-pixel-ratio crispness)
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const cssW = Math.min(MAX_WIDTH, container.clientWidth || MAX_WIDTH);
    const layout = computeLayout(cssW);
    layoutRef.current = layout;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(layout.totalH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${layout.totalH}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  // mount: build engine, render + analyze the demo, start the render loop
  useEffect(() => {
    engineRef.current = new PlaybackEngine();
    let cancelled = false;

    resize();
    const ro = new ResizeObserver(() => resize());
    if (containerRef.current) ro.observe(containerRef.current);

    (async () => {
      try {
        const buffer = await renderDemo();
        if (cancelled) return;
        applyBuffer(buffer, "built-in demo");
      } catch {
        if (!cancelled) {
          setErrorMsg("Could not render the demo audio in this browser.");
          setStatus("error");
        }
      }
    })();

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [applyBuffer, drawFrame, resize]);

  const handleStart = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !resultRef.current) return;
    if (playing) {
      engine.pause();
      setPlaying(false);
    } else {
      const from = lastPlayTimeRef.current || 0;
      crossedRef.current.clear();
      engine.seek(from >= resultRef.current.duration - 0.05 ? 0 : from);
      setPlaying(true);
    }
  }, [playing]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const layout = layoutRef.current;
      const result = resultRef.current;
      const engine = engineRef.current;
      if (!canvas || !layout || !result || !engine) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const t = hitTest(layout, x, y, result);
      if (t == null) return;
      crossedRef.current.clear();
      engine.seek(t);
      setPlaying(true);
    },
    [],
  );

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setErrorMsg(null);
      setPathNote(null);
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const tmp = new Ctor();
        const arr = await file.arrayBuffer();
        const decoded = await tmp.decodeAudioData(arr.slice(0));
        void tmp.close();
        applyBuffer(decoded, file.name);
      } catch {
        setErrorMsg("Could not decode that file — keeping the current map.");
      }
      e.target.value = "";
    },
    [applyBuffer],
  );

  const handlePathRecording = useCallback(async () => {
    setPathNote("Fetching a Path recording…");
    setErrorMsg(null);
    try {
      const metaRes = await fetch(`/api/audio/${PATH_RECORDING_ID}`);
      if (!metaRes.ok) throw new Error("meta");
      const info = (await metaRes.json()) as { url?: string };
      if (!info.url) throw new Error("url");
      const bufRes = await fetch(info.url);
      const raw = await bufRes.arrayBuffer();
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const tmp = new Ctor();
      const decoded = await tmp.decodeAudioData(raw.slice(0));
      void tmp.close();
      applyBuffer(decoded, "Path recording");
      setPathNote(null);
    } catch {
      setPathNote(null);
      setErrorMsg("Path recording unavailable — keeping the demo.");
    }
  }, [applyBuffer]);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-1 flex items-start justify-between gap-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            5384 · Cartograph
          </p>
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          The hidden architecture of a song
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          A self-similarity heat-map of the music&apos;s harmony — bright
          off-diagonal stripes are repeats, blocks are sections. Click the map or
          the timeline to hear that moment.
        </p>

        <div ref={containerRef} className="mt-6 w-full">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="cursor-pointer rounded-lg border border-border"
            aria-label="Music self-similarity map"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={status !== "ready"}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {playing ? "Pause" : "Start audio"}
          </button>

          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            Drop a file
            <input
              type="file"
              accept="audio/*"
              onChange={handleFile}
              className="sr-only"
            />
          </label>

          <button
            type="button"
            onClick={handlePathRecording}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Try a Path recording
          </button>
        </div>

        {pathNote && (
          <p className="mt-3 text-sm text-muted-foreground">{pathNote}</p>
        )}
        {errorMsg && (
          <p className="mt-3 text-sm text-destructive">{errorMsg}</p>
        )}

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>source · {source}</span>
          {meta && (
            <>
              <span>
                length · {Math.floor(meta.duration / 60)}:
                {String(Math.floor(meta.duration % 60)).padStart(2, "0")}
              </span>
              <span>frames · {meta.n}</span>
              <span>sections · {meta.sections}</span>
              <span>boundaries · {meta.boundaries}</span>
            </>
          )}
          {status === "rendering" && <span>analyzing demo…</span>}
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          The demo&apos;s form is{" "}
          <span className="text-foreground">A A&apos; B A&uarr; C B A</span> —
          the fourth section is A transposed up a fourth. It still matches the
          other A&apos;s because similarity is measured{" "}
          <span className="text-foreground">key-invariantly</span> (max cosine
          over all 12 transpositions), the advance over a naive same-key SSM.
        </p>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what if
                you could see a song&apos;s architecture — where it repeats, where
                it turns, where sections begin — and click to hear any moment?
              </p>
              <p>
                <span className="text-foreground">Pipeline (hand-written, no
                deps):</span>{" "}
                audio &rarr; mono decimate to ~11 kHz &rarr; radix-2 FFT + Hann
                STFT &rarr; 12-bin chroma &rarr; a self-similarity matrix (cosine
                between every pair of frames) &rarr; diagonal smoothing to sharpen
                repeat stripes.
              </p>
              <p>
                <span className="text-foreground">Key-invariant matching:</span>{" "}
                comparing two frames, we take the max cosine over all 12 cyclic
                rotations of one chroma vector (the Optimal Transposition Index).
                A repeat in a different key still lights up — a naive same-key SSM
                would miss it.
              </p>
              <p>
                <span className="text-foreground">Segmentation (Foote 2000):</span>{" "}
                a Gaussian-tapered checkerboard kernel is correlated along the
                diagonal to build a novelty curve; adaptive peak-picking gives the
                section boundaries. Repeated sections are matched (again
                key-invariantly) and share a colour.
              </p>
              <p>
                <span className="text-foreground">References:</span> Foote,
                &ldquo;Visualizing Music and Audio using Self-Similarity&rdquo;
                (ACM MM 1999); Foote, &ldquo;Automatic Audio Segmentation using a
                Measure of Audio Novelty&rdquo; (ICME 2000); Müller,{" "}
                <span className="italic">Fundamentals of Music Processing</span>{" "}
                (chroma, SSM, novelty chapters).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
            <Link
              href="/dream"
              className="ml-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← gallery
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
