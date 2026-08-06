"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { TerrainScene } from "./scene";
import {
  analyzeStft,
  buildTerrain,
  buildReconstruction,
  makeDefaultRecording,
  makeDrift,
  driftAt,
  type StftData,
  type Reconstruction,
  type DriftConfig,
} from "./dsp";

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;
const HOP = 512;
const TERRAIN_COLS = 96;
const MAX_ANALYZE_SECONDS = 30; // cap analysis of dropped files for responsiveness
const PITCH_DRIFT_DEPTH = 0.11; // ±~1 semitone via resampling

export default function VocodriftPage() {
  const [started, setStarted] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("internal default phrase");
  const [status, setStatus] = useState("Terrain flying on the internal phrase — press Begin to hear it sing.");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<TerrainScene | null>(null);
  const rafRef = useRef(0);
  const t0Ref = useRef(0);
  const lastTsRef = useRef(0);
  const heightRef = useRef(0); // eased 0..1 terrain relief

  const stftRef = useRef<StftData | null>(null);
  const startedRef = useRef(false);
  const reducedRef = useRef(false);

  // audio graph + reconstruction
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const reconRef = useRef<Reconstruction | null>(null);
  const bufDurRef = useRef(1);
  const bufPosRef = useRef(0); // integrated buffer seconds (drives playhead)
  const pitchDriftRef = useRef<DriftConfig | null>(null);

  // preview playhead (before Begin, no sound)
  const previewHeadRef = useRef(0);

  // ---- analysis: swap in a new recording (default or dropped file) ----
  const applyRecording = useCallback((signal: Float32Array, label: string) => {
    const stft = analyzeStft(signal, SAMPLE_RATE, FFT_SIZE, HOP);
    stftRef.current = stft;
    const field = buildTerrain(stft, TERRAIN_COLS);
    sceneRef.current?.setField(field);
    previewHeadRef.current = 0;
    setSourceLabel(label);
    return stft;
  }, []);

  // ---- (re)build the phase-vocoder reconstruction into an AudioBuffer ----
  const runReconstruction = useCallback((stft: StftData, ctx: AudioContext) => {
    const outSeconds = Math.min(26, Math.max(12, stft.seconds * 2.2));
    // seeded drift; calmer when reduced-motion is requested
    const drift = makeDrift(0x7368 ^ 0x2b, 3);
    if (reducedRef.current) {
      for (let i = 0; i < drift.amps.length; i++) drift.amps[i] *= 0.28;
    }
    const recon = buildReconstruction(stft, drift, outSeconds);
    reconRef.current = recon;

    const buffer = ctx.createBuffer(1, recon.signal.length, recon.sampleRate);
    buffer.getChannelData(0).set(recon.signal);
    bufDurRef.current = buffer.duration;

    // tear down any previous source
    if (srcRef.current) {
      try {
        srcRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current.disconnect();
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gainRef.current!);
    src.start();
    srcRef.current = src;
    bufPosRef.current = 0;
  }, []);

  // ---- Begin: open the live AudioContext + start resonification ----
  const beginAudio = useCallback(async () => {
    if (startedRef.current) return;
    const stft = stftRef.current;
    if (!stft) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor({ sampleRate: SAMPLE_RATE });
      ctxRef.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0.85;
      gain.connect(ctx.destination);
      gainRef.current = gain;
      pitchDriftRef.current = makeDrift(0x7368 ^ 0x9e, 2);
      await ctx.resume();
      runReconstruction(stft, ctx);
      startedRef.current = true;
      setStarted(true);
      setStatus(
        "Reconstructing your recording — a phase vocoder stretches and drifts it in real time.",
      );
    } catch {
      setStatus("Audio could not start in this browser.");
    }
  }, [runReconstruction]);

  // ---- decode a dropped/selected audio file ----
  const loadFile = useCallback(
    async (file: File) => {
      setStatus(`Decoding ${file.name}…`);
      try {
        const buf = await file.arrayBuffer();
        // OfflineAudioContext decodes without a user gesture, at a fixed rate
        const off = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
        const decoded = await off.decodeAudioData(buf);
        const chCount = decoded.numberOfChannels;
        const n = Math.min(
          decoded.length,
          Math.floor(MAX_ANALYZE_SECONDS * decoded.sampleRate),
        );
        // downmix to mono
        const mono = new Float32Array(n);
        for (let c = 0; c < chCount; c++) {
          const d = decoded.getChannelData(c);
          for (let i = 0; i < n; i++) mono[i] += d[i] / chCount;
        }
        // resample naively to SAMPLE_RATE if needed
        let sig = mono;
        if (decoded.sampleRate !== SAMPLE_RATE) {
          const ratio = SAMPLE_RATE / decoded.sampleRate;
          const outN = Math.floor(n * ratio);
          const rs = new Float32Array(outN);
          for (let i = 0; i < outN; i++) {
            const srcPos = i / ratio;
            const i0 = Math.floor(srcPos);
            const f = srcPos - i0;
            rs[i] = (mono[i0] ?? 0) * (1 - f) + (mono[i0 + 1] ?? 0) * f;
          }
          sig = rs;
        }
        const stft = applyRecording(sig, file.name);
        if (startedRef.current && ctxRef.current) {
          runReconstruction(stft, ctxRef.current);
          setStatus(`Reconstructing ${file.name} — stretched and drifting.`);
        } else {
          setStatus(
            `Loaded ${file.name}. Press Begin to hear the vocoder reconstruct it.`,
          );
        }
      } catch {
        setStatus("That file could not be decoded as audio.");
      }
    },
    [applyRecording, runReconstruction],
  );

  // ---- mount: build default terrain + start the render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onMq = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onMq);

    let scene: TerrainScene;
    try {
      scene = new TerrainScene(canvas);
    } catch {
      setWebglError(
        "WebGL could not start on this device, so the terrain cannot render.",
      );
      mq.removeEventListener("change", onMq);
      return;
    }
    sceneRef.current = scene;

    // deterministic internal recording → STFT → terrain (alive on load)
    const seed = makeDefaultRecording(SAMPLE_RATE, 8);
    applyRecording(seed, "internal default phrase");

    const resize = () => {
      const w = wrapRef.current?.clientWidth ?? window.innerWidth;
      const h = wrapRef.current?.clientHeight ?? window.innerHeight;
      scene.resize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    t0Ref.current = performance.now();
    lastTsRef.current = t0Ref.current;

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const s = sceneRef.current;
      const stft = stftRef.current;
      if (!s || !stft) return;
      if (!s.contextValid()) {
        setWebglError("The WebGL context was lost.");
        cancelAnimationFrame(rafRef.current);
        return;
      }
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTsRef.current) / 1000);
      lastTsRef.current = now;
      const tSec = (now - t0Ref.current) / 1000;

      // ease terrain relief in from flat
      heightRef.current += (1 - heightRef.current) * Math.min(1, dt * 1.2);

      let head: number;
      if (startedRef.current && reconRef.current && srcRef.current) {
        // pitch drift via resampling — also advances the buffer read position
        let rate = 1;
        if (!reducedRef.current && pitchDriftRef.current) {
          rate = 1 + driftAt(pitchDriftRef.current, tSec) * PITCH_DRIFT_DEPTH;
        }
        srcRef.current.playbackRate.value = rate;
        bufPosRef.current += dt * rate;
        while (bufPosRef.current >= bufDurRef.current)
          bufPosRef.current -= bufDurRef.current;
        // buffer seconds → synthesis column → analysis-frame head (exact sync)
        const col = Math.floor((bufPosRef.current * stft.sampleRate) / HOP);
        const recon = reconRef.current;
        const cc = Math.max(0, Math.min(recon.synthFrames - 1, col));
        head = recon.frameMap[cc];
      } else {
        // pre-Begin: silent auto fly-over looping through the frames
        const framesPerSec = stft.frames / 18;
        previewHeadRef.current += dt * framesPerSec;
        while (previewHeadRef.current >= stft.frames)
          previewHeadRef.current -= stft.frames;
        head = previewHeadRef.current;
      }

      s.update(head, tSec, reducedRef.current, heightRef.current);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      mq.removeEventListener("change", onMq);
      ro.disconnect();
      if (srcRef.current) {
        try {
          srcRef.current.stop();
        } catch {
          /* already stopped */
        }
        srcRef.current.disconnect();
      }
      gainRef.current?.disconnect();
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        void ctxRef.current.close();
      }
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [applyRecording]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) void loadFile(f);
    },
    [loadFile],
  );

  return (
    <div
      ref={wrapRef}
      className="relative min-h-screen w-full overflow-hidden bg-background"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <PrototypeNav slugs={["7368-vocodrift"]} />

      {/* 3D terrain canvas (full-bleed background) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            {webglError}
          </p>
        </div>
      )}

      {/* overlay content */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            7368 · vocodrift · phase vocoder terrain
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Your recording, as a spectral terrain you fly over
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            A hand-rolled STFT turns sound into a luminous landscape — time runs
            into the distance, frequency across the width, loudness into the
            ridges. A phase vocoder then reconstructs the audio in real time,
            slowly stretching and drifting it, so the terrain you see is exactly
            the sound you hear.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <p className="max-w-xl text-base text-muted-foreground">{status}</p>
          <div className="flex flex-wrap items-center gap-3">
            {!started && (
              <button
                type="button"
                onClick={() => void beginAudio()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin — reconstruct + resonify
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Drop your own recording
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
              }}
            />
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              source: {sourceLabel}
            </span>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            Tip: Karel can drop a Path piano track here — it becomes the terrain
            and the vocoder sings it back, stretched and drifting.
          </p>
        </div>
      </div>

      {/* design-notes button */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-6 top-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              vocodrift
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: what if your own recording became a flowing
                spectral terrain you fly over, while a phase vocoder slowly
                stretches and drifts it — reconstructing the sound so the
                landscape you see is exactly the sound you hear?
              </p>
              <p>
                A dependency-free radix-2 FFT runs a Hann-windowed STFT (2048
                point, 512 hop, mono), keeping magnitude and phase per frame.
                The magnitude becomes a log-frequency, dB-scaled height field
                rendered in three.js as a displaced plane. The phase drives the
                vocoder: each synthesis column advances every bin&apos;s phase
                by its measured instantaneous frequency, then an inverse FFT and
                Hann overlap-add rebuild the signal. A seeded read-head drifts
                the time-stretch; a gentle resampling layer adds pitch drift.
                The playhead is mapped back from the exact synthesis position,
                so picture and sound stay locked.
              </p>
              <p>
                This is the classic, non-ML phase vocoder — Flanagan &amp;
                Golden (1966), Dolson (1986), Laroche &amp; Dolson (1999). The
                research anchor arXiv 2608.03032, &ldquo;DDSynth-RL&rdquo; (Aug
                2026), reconstructs a target sound with discrete diffusion; this
                build is the honest analog signal-processing counterpart, no
                learned model involved.
              </p>
              <p>
                Determinism throughout (mulberry32 seeded from 0x7368, no
                Math.random / clock). Reduced-motion calms the camera and drift;
                luminance changes stay slow and strobe-safe.
              </p>
            </div>
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
    </div>
  );
}
