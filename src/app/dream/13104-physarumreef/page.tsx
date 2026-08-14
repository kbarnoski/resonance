"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioFeatures,
  DemoDriver,
  Physarum,
  type AudioDrive,
} from "./physarum";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { README } from "./readme-text";

const GRID = 512;

type Mode = "demo" | "file" | "mic";

export default function PhysarumReefPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // ── Imperative engine refs (no re-render churn) ──────────────────────────
  const rafRef = useRef<number | null>(null);
  const simRef = useRef<Physarum | null>(null);
  const imgRef = useRef<ImageData | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const demoRef = useRef<DemoDriver | null>(null);
  const modeRef = useRef<Mode>("demo");
  const startMsRef = useRef(0);
  const lastMsRef = useRef(0);

  // ── Audio graph refs ─────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const featuresRef = useRef<AudioFeatures | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setModeBoth = useCallback((m: Mode) => {
    modeRef.current = m;
    setMode(m);
  }, []);

  // Stop any real-audio sources but keep the AudioContext + master alive.
  const stopAudioSources = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      try {
        sourceRef.current.disconnect();
      } catch {
        /* noop */
      }
      sourceRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        /* noop */
      }
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    featuresRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopAudioSources();
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* noop */
      }
      analyserRef.current = null;
    }
    masterRef.current?.disconnect();
    masterRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      void ctx.close();
    }
    simRef.current = null;
    imgRef.current = null;
    ctx2dRef.current = null;
  }, [stopAudioSources]);

  // ── Mount: build the sim, warm it up, and start the seeded silent demo ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
      setError("Canvas 2D is unavailable in this browser.");
      return;
    }
    ctx2dRef.current = ctx2d;

    const sim = new Physarum({ size: GRID, agentCount: 18000, seed: 0x1a2b3c4d });
    simRef.current = sim;
    imgRef.current = ctx2d.createImageData(GRID, GRID);
    demoRef.current = new DemoDriver(0x9e3779b9);

    // Warm-up: a few dozen steps so the first painted frame already shows a
    // nascent vein network — the reef is alive the instant the page mounts.
    const warmDrive: AudioDrive = { loud: 0.55, centroid: 0.5, low: 0.6, onset: 0 };
    for (let i = 0; i < 40; i++) sim.step(warmDrive);

    startMsRef.current = performance.now();
    lastMsRef.current = startMsRef.current;

    const loop = () => {
      const now = performance.now();
      let dt = (now - lastMsRef.current) / 1000;
      lastMsRef.current = now;
      if (dt > 0.05) dt = 0.05; // clamp after a stall
      const elapsed = (now - startMsRef.current) / 1000;

      let drive: AudioDrive;
      if (modeRef.current === "demo" || !featuresRef.current) {
        drive = demoRef.current!.sample(elapsed, dt);
      } else {
        drive = featuresRef.current.sample();
      }

      sim.step(drive);
      sim.render(imgRef.current!);
      ctx2d.putImageData(imgRef.current!, 0, 0);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => teardown();
  }, [teardown]);

  // Lazily create the shared AudioContext + safe master. Returns null on failure.
  const ensureAudio = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      setError("Web Audio is unavailable — the seeded demo keeps growing.");
      return null;
    }
    try {
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      masterRef.current = createSafeMaster(ctx);
      return ctx;
    } catch {
      setError("Could not open an AudioContext — the seeded demo keeps growing.");
      return null;
    }
  }, []);

  // Wire a fresh analyser for whichever source is about to play.
  const makeAnalyser = useCallback((ctx: AudioContext): AnalyserNode => {
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        /* noop */
      }
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    analyserRef.current = analyser;
    featuresRef.current = new AudioFeatures(analyser, ctx.sampleRate);
    return analyser;
  }, []);

  const playFile = useCallback(
    async (file: File) => {
      setError(null);
      const ctx = ensureAudio();
      if (!ctx) return;
      const master = masterRef.current!;
      try {
        if (ctx.state === "suspended") await ctx.resume();
        const buf = await file.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(buf);
        stopAudioSources();

        const analyser = makeAnalyser(ctx);
        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        src.loop = true;
        src.connect(analyser); // analysis tap
        src.connect(master.input); // ALL audio routed through the safe master
        src.onended = () => {
          if (modeRef.current === "file") setModeBoth("demo");
        };
        src.start();
        sourceRef.current = src;
        setFileName(file.name);
        setModeBoth("file");
      } catch {
        setError(`Could not decode "${file.name}" — the seeded demo keeps growing.`);
        setModeBoth("demo");
      }
    },
    [ensureAudio, makeAnalyser, setModeBoth, stopAudioSources],
  );

  const startMic = useCallback(async () => {
    setError(null);
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      stopAudioSources();
      const analyser = makeAnalyser(ctx);
      const micSrc = ctx.createMediaStreamSource(stream);
      micSrc.connect(analyser); // analysis ONLY — never to the speakers (feedback)
      micStreamRef.current = stream;
      micSourceRef.current = micSrc;
      setFileName(null);
      setModeBoth("mic");
    } catch {
      setError("Microphone was blocked — the seeded demo keeps growing.");
      setModeBoth("demo");
    }
  }, [ensureAudio, makeAnalyser, setModeBoth, stopAudioSources]);

  const backToDemo = useCallback(() => {
    stopAudioSources();
    setFileName(null);
    setModeBoth("demo");
  }, [setModeBoth, stopAudioSources]);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void playFile(f);
      e.target.value = "";
    },
    [playFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void playFile(f);
    },
    [playFile],
  );

  const statusText =
    mode === "file"
      ? `Feeding on: ${fileName ?? "your track"}`
      : mode === "mic"
        ? "Feeding on live sound (mic)"
        : "Seeded silent demo — drop a track to feed the reef";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Physarum · agent transport network
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Physarum Reef
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A colony of ~18,000 blind agents lays down a chemical trail, follows
          it, and — through nothing but deposit, diffuse and decay — condenses
          itself into a breathing vein network. Feed it real music and the
          organism grows differently: loudness quickens growth, brightness
          widens its branching, bass thickens the veins, and every onset injects
          a burst of fresh growth.
        </p>
      </header>

      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        className={`relative overflow-hidden rounded-lg border bg-black transition-colors ${
          dragging ? "border-primary" : "border-border"
        }`}
      >
        <canvas
          ref={canvasRef}
          className="block aspect-square w-full"
          style={{ imageRendering: "auto" }}
        />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Drop to feed the reef
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="absolute right-3 top-3 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Drop a track
        </button>
        <button
          type="button"
          onClick={() => void startMic()}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Use microphone
        </button>
        {mode !== "demo" && (
          <button
            type="button"
            onClick={backToDemo}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back to demo
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={onFileInput}
          className="hidden"
        />
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {statusText}
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
              {README}
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
