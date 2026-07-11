"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1188-welcome-sky — Karel's piano paints the sky it belongs under.
//
//   A bright volumetric raymarched cloudscape that evolves over the WHOLE
//   duration of the piece: dawn when it begins → midday → golden dusk when it
//   ends. The elapsed fraction moves the sun across the sky (the long-form
//   state); the live audio features (RMS, spectral flux, centroid) move the
//   weather. Audio is gesture-gated; a limiter guards the master; brightness
//   only ever drifts — no strobe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Analysis,
  PIANO_RECORDING_ID,
  type AudioSourceKind,
  decodeFileBuffer,
  fetchRecordingBuffer,
  makeReverbImpulse,
  renderFallbackBuffer,
} from "./audio";
import {
  SkyRenderer,
  drawFallbackSky,
  hasWebGL2,
  resetFallback,
  type SkyState,
} from "./sky";

type Phase = "idle" | "loading" | "running";

const SOURCE_CHIP: Record<AudioSourceKind, { label: string; cls: string }> = {
  recording: {
    label: "♪ Karel's Welcome Home piano",
    cls: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
  },
  file: {
    label: "♪ your file",
    cls: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
  },
  fallback: {
    label: "♪ synth piano (couldn't reach recording)",
    cls: "bg-violet-500/15 text-violet-200 ring-violet-400/30",
  },
};

export default function WelcomeSkyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // audio graph refs (so teardown can reach them)
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analysisRef = useRef<Analysis | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  // renderer refs
  const glRef = useRef<SkyRenderer | null>(null);
  const useGLRef = useRef<boolean>(true);

  // smoothed day clock + drift base
  const t0Ref = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const featRef = useRef<SkyState>({
    time: 0,
    progress: 0,
    energy: 0,
    centroid: 0.4,
    flux: 0,
    drift: 1,
  });
  const pendingFileRef = useRef<File | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [glOk, setGlOk] = useState<boolean>(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── idle drift loop: sky renders immediately on mount, before audio ─────────
  const frame = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(frame);
      return;
    }
    if (t0Ref.current === 0) t0Ref.current = now;
    const time = (now - t0Ref.current) / 1000;

    const st = featRef.current;
    st.time = time;
    st.drift = reducedRef.current ? 0.35 : 1;

    const analysis = analysisRef.current;
    if (analysis && ctxRef.current) {
      const elapsed = ctxRef.current.currentTime - startedAtRef.current;
      const dur = durationRef.current || 1;
      const progress = dur > 0 ? elapsed / dur : 0;
      const f = analysis.read(progress);
      st.progress = f.progress;
      st.energy = f.energy;
      st.centroid = f.centroid;
      st.flux = f.flux;
    } else {
      // idle: a slow imaginary dawn creep + a breathing "energy" so it lives
      st.progress = (0.06 + time * 0.004) % 1;
      st.energy = 0.28 + Math.sin(time * 0.18) * 0.12;
      st.centroid = 0.45 + Math.sin(time * 0.09) * 0.1;
      st.flux *= 0.94;
    }

    if (useGLRef.current && glRef.current) {
      glRef.current.render(st);
    } else {
      drawFallbackSky(canvas, st);
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── mount: pick renderer, size, start the drift loop ────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const gl2 = hasWebGL2();
    setGlOk(gl2);
    useGLRef.current = gl2;

    if (gl2) {
      try {
        const r = new SkyRenderer(canvas);
        r.resize(canvas.clientWidth, canvas.clientHeight);
        glRef.current = r;
      } catch {
        useGLRef.current = false;
        setGlOk(false);
      }
    }

    const onResize = () => {
      if (!canvasRef.current) return;
      if (useGLRef.current && glRef.current) {
        glRef.current.resize(
          canvasRef.current.clientWidth,
          canvasRef.current.clientHeight,
        );
      }
    };
    window.addEventListener("resize", onResize);
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafRef.current);
      glRef.current?.dispose();
      glRef.current = null;
      resetFallback();
    };
  }, [frame]);

  // ── full audio teardown ─────────────────────────────────────────────────────
  const teardownAudio = useCallback(() => {
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    try {
      srcRef.current?.disconnect();
      masterRef.current?.disconnect();
      analysisRef.current?.node.disconnect();
    } catch {
      /* ignore */
    }
    srcRef.current = null;
    masterRef.current = null;
    analysisRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }, []);

  useEffect(() => () => teardownAudio(), [teardownAudio]);

  // ── Begin: resolve the 3-tier source, build the graph, play ─────────────────
  const begin = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("loading");

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;

    // Resolve the source buffer through the 3 tiers.
    let buffer: AudioBuffer | null = null;
    let kind: AudioSourceKind = "fallback";

    const dropped = pendingFileRef.current;
    if (dropped) {
      buffer = await decodeFileBuffer(ctx, dropped);
      if (buffer) kind = "file";
    }
    if (!buffer) {
      buffer = await fetchRecordingBuffer(ctx, PIANO_RECORDING_ID);
      if (buffer) kind = "recording";
    }
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      kind = "fallback";
    }

    // Build the graph: source → reverb → limiter → master(~0.2) → dest
    //                  source → analyser
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const convolver = ctx.createConvolver();
    convolver.buffer = makeReverbImpulse(ctx, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    const dry = ctx.createGain();
    dry.gain.value = 0.9;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;

    const master = ctx.createGain();
    master.gain.value = 0.0001;

    const analysis = new Analysis(ctx);

    src.connect(dry).connect(limiter);
    src.connect(convolver).connect(wet).connect(limiter);
    limiter.connect(master).connect(ctx.destination);
    src.connect(analysis.node);

    // Conservative master, ramped only (no clicks, no jumps).
    master.gain.setTargetAtTime(0.2, ctx.currentTime, 0.4);

    src.start();
    startedAtRef.current = ctx.currentTime;
    durationRef.current = buffer.duration;

    srcRef.current = src;
    masterRef.current = master;
    analysisRef.current = analysis;

    setSource(kind);
    setPhase("running");
  }, [phase]);

  // ── file drop / pick ────────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("audio")) pendingFileRef.current = file;
  }, []);

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) pendingFileRef.current = file;
  }, []);

  const chip = source ? SOURCE_CHIP[source] : null;

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden bg-neutral-950 text-foreground"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* the bright daylight canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* chrome overlay (dark Resonance theme) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        <header className="max-w-2xl">
          <div className="pointer-events-auto inline-block rounded-2xl bg-black/35 px-5 py-4 backdrop-blur-md ring-1 ring-border">
            <h1 className="font-semibold text-2xl sm:text-3xl text-foreground">
              Welcome Sky
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Karel&rsquo;s piano paints the sky it belongs under — dawn when it
              begins, golden dusk when it ends.
            </p>
            {chip && (
              <span
                className={`mt-3 inline-block rounded-full px-3 py-1 text-sm ring-1 ${chip.cls}`}
              >
                {chip.label}
              </span>
            )}
            {!glOk && (
              <p className="mt-2 text-sm text-violet-200">
                WebGL2 unavailable — simplified sky.
              </p>
            )}
          </div>
        </header>

        {/* bottom controls */}
        <div className="pointer-events-auto flex flex-wrap items-end gap-3">
          {phase !== "running" && (
            <button
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground shadow-lg ring-1 ring-violet-300/40 transition hover:bg-violet-500 disabled:opacity-60"
            >
              {phase === "loading" ? "Waking the sky…" : "Begin"}
            </button>
          )}

          {phase !== "running" && (
            <label className="min-h-[44px] cursor-pointer rounded-xl bg-black/40 px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground">
              Use my audio
              <input
                type="file"
                accept="audio/*"
                onChange={onPick}
                className="hidden"
              />
            </label>
          )}

          {phase === "running" && (
            <div className="rounded-xl bg-black/35 px-4 py-2.5 text-sm text-muted-foreground backdrop-blur-md ring-1 ring-border">
              The sun crosses the sky as the piece plays. Louder passages thicken
              the clouds; brighter notes lift them into wisps.
            </div>
          )}
        </div>
      </div>

      {/* drag affordance */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-4 rounded-3xl ring-2 ring-dashed ring-violet-300/60" />
      )}

      {/* design-notes link + panel */}
      <div className="absolute right-6 top-6 sm:right-8 sm:top-8">
        <button
          onClick={() => setNotesOpen((v) => !v)}
          className="pointer-events-auto min-h-[44px] rounded-xl bg-black/40 px-3 py-2 text-sm text-violet-300 ring-1 ring-border backdrop-blur-md transition hover:text-violet-200"
        >
          Read the design notes
        </button>
      </div>
      {notesOpen && (
        <aside className="absolute right-6 top-20 z-10 max-w-sm rounded-2xl bg-black/70 p-5 text-sm text-foreground ring-1 ring-border backdrop-blur-lg sm:right-8">
          <p className="text-base text-foreground">A piece of music with a time of day.</p>
          <p className="mt-2">
            A single global day-phase advances with playback position, sweeping
            the sun on a full arc: low &amp; rose at dawn, high &amp; white at
            midday, deep gold at dusk. The live piano bends the weather —
            loudness thickens and lights the clouds, brightness makes them wispy
            and cool, onsets add soft light shafts.
          </p>
          <p className="mt-2 text-muted-foreground">
            Full notes:{" "}
            <a
              href="./README.md"
              className="text-violet-300 underline decoration-dotted underline-offset-2 hover:text-violet-200"
            >
              README
            </a>
            . After Turner &amp; Constable&rsquo;s cloud studies and Eno&rsquo;s
            ever-different generative light.
          </p>
        </aside>
      )}
    </main>
  );
}
