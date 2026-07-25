"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CORPUS_CAP, MusaicEngine, type EngineStatus } from "./audio";
import { drawScene } from "./viz";

// ─── musaic-room ─────────────────────────────────────────────────────────────
// THE ROOM PLAYS ITSELF BACK. The microphone is the only input. Every ~93 ms of
// sound becomes a grain with three real features (loudness, brightness, and
// noisiness). Those grains accrue into a growing corpus, and each *new* moment
// is reconstructed by finding — and playing — its nearest match from the past.
// Classic concatenative musaicing, in the browser, with no machine learning.
// ─────────────────────────────────────────────────────────────────────────────

export default function MusaicRoomPage() {
  const [status, setStatus] = useState<EngineStatus>({
    running: false,
    source: null,
    error: null,
  });
  const [showNotes, setShowNotes] = useState(false);
  const [grainCount, setGrainCount] = useState(0);

  const engineRef = useRef<MusaicEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statusRef = useRef(status);
  const frameRef = useRef(0);

  // Mirror status into a ref so the draw loop doesn't re-subscribe.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Lazily construct the engine on the client.
  const getEngine = useCallback((): MusaicEngine => {
    if (!engineRef.current) {
      engineRef.current = new MusaicEngine((s) => setStatus(s));
    }
    return engineRef.current;
  }, []);

  const beginMic = useCallback(() => {
    void getEngine().startMic();
  }, [getEngine]);

  const beginDemo = useCallback(() => {
    getEngine().startDemo();
  }, [getEngine]);

  const stopAll = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  // Teardown on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Single render loop — reads the engine snapshot every frame.
  useEffect(() => {
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 640;
      const cssH = canvas.clientHeight || 380;
      if (canvas.width !== Math.floor(cssW * dpr)) {
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const engine = engineRef.current;
      const snap = engine?.snapshot() ?? {
        corpus: [],
        query: null,
        match: null,
        source: null,
      };
      drawScene(ctx, cssW, cssH, {
        corpus: snap.corpus,
        corpusCap: CORPUS_CAP,
        query: snap.query,
        match: snap.match,
        nowMs: performance.now(),
        running: statusRef.current.running,
        source: snap.source,
      });

      // Cheap throttled UI counter (once every ~15 frames).
      frameRef.current++;
      if (frameRef.current % 15 === 0) setGrainCount(snap.corpus.length);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { running, source, error } = status;

  return (
    <div className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Musaic Room · concatenative musaicing
            </p>
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[32px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            The room plays itself back.
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            The microphone is the only input. Every sound the room hears is
            remembered as a grain, and each new moment is rebuilt from the
            nearest match in that growing memory — sparse and literal at first,
            dense and uncanny as the corpus fills.
          </p>
        </header>

        {/* Instrument display */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Feature map · brightness × loudness
            </p>
            <span
              className={`font-mono text-xs ${
                source === "demo"
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {source === "demo"
                ? "Demo source — no mic"
                : source === "mic"
                  ? "Live mic"
                  : "Idle"}
            </span>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <canvas
              ref={canvasRef}
              className="block h-[360px] w-full sm:h-[420px]"
            />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each dot is one remembered grain, placed by its real spectral
            centroid (x) and RMS loudness (y), fading from violet as it ages.
            The bright dot is the present moment; the line points to the past
            grain being played in its place, ring pulsing on the match.
          </p>
        </section>

        {/* Controls */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={beginMic}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin listening
              </button>
            ) : (
              <button
                onClick={stopAll}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Stop
              </button>
            )}
            <button
              onClick={beginDemo}
              disabled={running}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              Use demo source
            </button>
            <span className="font-mono text-xs text-muted-foreground">
              {grainCount} / {CORPUS_CAP} grains
            </span>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!running && !error && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Give it a minute of talking, humming, or ambient noise — the
              reconstruction thickens as the room accumulates more of itself to
              draw from. No microphone? Use the internal demo source.
            </p>
          )}
        </section>

        <Link
          href="/dream"
          className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          ← back to the lab
        </Link>
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              How Musaic Room works
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The one question.</strong>{" "}
                If a room could only ever play back what it has already heard,
                what music would it compose out of its own past?
              </p>
              <p>
                <strong className="text-foreground">Grains + features.</strong>{" "}
                A ScriptProcessor captures the live signal in ~93 ms grains. For
                each, three <em>real</em> features are computed from the PCM: RMS
                loudness, spectral centroid (via a hand-rolled Hann-windowed FFT)
                for brightness, and zero-crossing rate for noisiness.
              </p>
              <p>
                <strong className="text-foreground">A growing corpus.</strong>{" "}
                Every grain&apos;s samples + feature vector are stored, capped at{" "}
                {CORPUS_CAP} grains (oldest evicted) so it stays real-time and
                long-form. Each new query grain finds its nearest neighbour by
                weighted feature distance — excluding the last second so the room
                can&apos;t just echo itself — and that <em>past</em> grain is
                played back through short fade windows instead of the live sound.
              </p>
              <p>
                <strong className="text-foreground">No pitch safety net.</strong>{" "}
                Grains are the raw recorded material; nothing is quantized or
                snapped to a scale. It is free to sound rough and uncanny.
              </p>
              <p>
                <strong className="text-foreground">Real vs faked.</strong> The
                grains, features, matching, and playback are all real DSP on the
                live input. The only synthesized element is the fallback{" "}
                <em>demo source</em> (a deterministic tones-and-noise buffer,
                mulberry32-seeded) used when no mic is available — and even that
                is fed through the identical mosaicing pipeline.
              </p>
              <p>
                <strong className="text-foreground">Lineage.</strong> Diemo
                Schwarz&apos;s CataRT / corpus-based concatenative synthesis;
                Zils &amp; Pachet, &ldquo;Musical Mosaicing&rdquo; (2001); and the
                2026 frontier — &ldquo;The Concatenator&rdquo; (arXiv:2411.04366)
                and &ldquo;Latent Granular Resynthesis using Neural Audio
                Codecs&rdquo; (arXiv:2507.19202). This is the no-ML browser
                cousin.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[40px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
