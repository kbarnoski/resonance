"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioEngine,
  fetchRecordingBuffer,
  decodeFileBuffer,
  renderFallbackBuffer,
  PIANO_RECORDING_ID,
  type AudioFrame,
  type AudioSourceKind,
} from "./audio";
import { AccretionField, GRID_N } from "./field";
import {
  AccretionRenderer,
  AccretionFallback2D,
  hasWebGL2,
  type RenderParams,
} from "./gl";

type Renderer = AccretionRenderer | AccretionFallback2D;
type Phase = "idle" | "loading" | "playing";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default function LightAccretionPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [recordingId, setRecordingId] = useState(PIANO_RECORDING_ID);
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [minutes, setMinutes] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fieldRef = useRef<AccretionField | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const depAccRef = useRef<number>(0);
  const onsetCdRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  const statAccRef = useRef<number>(0);

  // ── Set up field + renderer + animation loop once, before any gesture ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const field = new AccretionField(GRID_N);
    fieldRef.current = field;

    let renderer: Renderer;
    if (hasWebGL2()) {
      try {
        renderer = new AccretionRenderer(canvas, GRID_N);
      } catch {
        setWebglFailed(true);
        renderer = new AccretionFallback2D(canvas, GRID_N);
      }
    } else {
      setWebglFailed(true);
      renderer = new AccretionFallback2D(canvas, GRID_N);
    }
    rendererRef.current = renderer;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const runResize = () => {
      const r = canvas.getBoundingClientRect();
      rendererRef.current?.resize(r.width, r.height, dpr);
    };
    runResize();
    window.addEventListener("resize", runResize);

    startRef.current = performance.now();
    lastRef.current = startRef.current;

    const rand = mulberryLocal(0x1148f1e1);

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const t = (now - startRef.current) / 1000;
      elapsedRef.current += dt;

      const f = fieldRef.current;
      const rnd = rendererRef.current;
      if (!f || !rnd) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      // Drive signal: real audio analysis once playing, else a gentle
      // deterministic procedural pulse so the cathedral accretes immediately.
      let af: AudioFrame;
      if (playingRef.current && engineRef.current) {
        af = engineRef.current.getFrame();
      } else {
        const e = 0.28 + 0.2 * Math.sin(t * 0.5) + 0.08 * Math.sin(t * 1.9 + 1.0);
        const c = 0.5 + 0.34 * Math.sin(t * 0.21 + 0.7);
        const fl = Math.max(0, 0.42 * Math.sin(t * 1.6 + rand() * 0.2));
        af = { energy: clamp01(e), flux: clamp01(fl), centroid: clamp01(c) };
      }

      // Deposit on a cadence + on strong onsets — accumulate the memory.
      depAccRef.current += dt;
      onsetCdRef.current -= dt;
      const interval = playingRef.current ? 0.07 : 0.12;
      let doDeposit = false;
      if (depAccRef.current >= interval) {
        depAccRef.current = 0;
        doDeposit = true;
      }
      if (af.flux > 0.34 && onsetCdRef.current <= 0) {
        doDeposit = true;
        onsetCdRef.current = 0.05;
      }
      if (doDeposit && af.energy > 0.03) f.deposit(af);

      f.decay(dt);

      const params: RenderParams = {
        time: t,
        elapsed: elapsedRef.current,
        energy: af.energy,
        flux: af.flux,
        centroid: af.centroid,
        reduced: reducedRef.current,
      };
      rnd.render(f, params);

      // Throttled readout of how long the field has been accreting.
      statAccRef.current += dt;
      if (statAccRef.current > 1.0) {
        statAccRef.current = 0;
        setMinutes(elapsedRef.current / 60);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", runResize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      fieldRef.current = null;
      const eng = engineRef.current;
      engineRef.current = null;
      playingRef.current = false;
      if (eng) void eng.dispose();
    };
  }, []);

  // ── Begin: create the audio engine (gesture-gated) and pick a source ──
  const runBegin = useCallback(
    async (file?: File) => {
      if (phase === "loading") return;
      setPhase("loading");
      setNotice(null);

      // Fresh engine each Begin (AudioContext must be born in the gesture).
      if (engineRef.current) {
        playingRef.current = false;
        void engineRef.current.dispose();
        engineRef.current = null;
      }

      let engine: AudioEngine;
      try {
        engine = new AudioEngine();
      } catch {
        setNotice("Web Audio is unavailable in this browser.");
        setPhase("idle");
        return;
      }

      let buffer: AudioBuffer | null = null;
      let kind: AudioSourceKind = "fallback";

      if (file) {
        buffer = await decodeFileBuffer(engine.ctx, file);
        if (buffer) {
          kind = "file";
        } else {
          setNotice(
            "That file could not be decoded — playing the synth demo instead.",
          );
        }
      } else {
        const id = recordingId.trim();
        if (id) {
          buffer = await fetchRecordingBuffer(engine.ctx, id);
          if (buffer) {
            kind = "recording";
          } else {
            setNotice(
              "Could not load that recording (network or access) — playing the synth demo instead.",
            );
          }
        }
      }

      if (!buffer) {
        buffer = await renderFallbackBuffer(engine.ctx.sampleRate);
        kind = "fallback";
      }

      try {
        await engine.start(buffer, true);
      } catch {
        setNotice("Playback could not start.");
        void engine.dispose();
        setPhase("idle");
        return;
      }

      engineRef.current = engine;
      playingRef.current = true;
      setSource(kind);
      setPhase("playing");
    },
    [phase, recordingId],
  );

  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void runBegin(file);
    },
    [runBegin],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void runBegin(file);
    },
    [runBegin],
  );

  const sourceLabel =
    source === "recording"
      ? "Karel's recording"
      : source === "file"
        ? "your file"
        : source === "fallback"
          ? "synth demo"
          : null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04060a] text-foreground">
      {/* Volumetric canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Soft vignette so text stays legible over the light-field */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/70" />

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        {/* Header / hero */}
        <header className="max-w-2xl">
          <p className="mb-2 text-sm uppercase tracking-[0.28em] text-violet-200/80">
            Resonance · Dream Lab
          </p>
          <h1 className="font-semibold text-4xl font-medium leading-tight text-foreground sm:text-5xl">
            Light Accretion
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-foreground">
            A recorded piano slowly accretes a volumetric cathedral of light —
            a 3D field with a real ~75-second memory, so minute five is not
            minute one. Drift inward, down the tunnel, toward the being of
            light.
          </p>
        </header>

        {/* Controls */}
        <section className="mt-8 max-w-xl">
          {phase !== "playing" ? (
            <div className="rounded-2xl border border-border bg-black/45 p-5 backdrop-blur-md">
              <label
                htmlFor="rec-id"
                className="block text-sm font-medium text-muted-foreground"
              >
                Path recording id
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="rec-id"
                  type="text"
                  value={recordingId}
                  onChange={(e) => setRecordingId(e.target.value)}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-black/50 px-3 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-violet-300/60"
                  placeholder="recording id"
                />
                <button
                  type="button"
                  onClick={() => void runBegin()}
                  disabled={phase === "loading"}
                  className="rounded-lg bg-violet-300 px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition-colors hover:bg-violet-200 disabled:opacity-60"
                >
                  {phase === "loading" ? "Loading…" : "Begin"}
                </button>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`mt-3 rounded-lg border border-dashed px-3 py-3 text-sm transition-colors ${
                  dragOver
                    ? "border-violet-300/70 bg-violet-300/10 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                Drop an audio file here, or{" "}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-violet-200 underline underline-offset-2 hover:text-violet-100"
                >
                  choose a file
                </button>
                . No id or file? Begin plays a gentle synth demo.
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={onFilePicked}
                  className="hidden"
                />
              </div>

              {notice && (
                <p className="mt-3 text-sm text-violet-300">{notice}</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-black/40 p-4 backdrop-blur-md">
              <p className="text-base text-foreground">
                Now accreting from{" "}
                <span className="text-violet-200">{sourceLabel}</span>.
                <span className="ml-2 text-muted-foreground">
                  {minutes < 1
                    ? "the cathedral is forming…"
                    : `${minutes.toFixed(1)} min of light remembered`}
                </span>
              </p>
              {source === "fallback" && (
                <p className="mt-1 text-sm text-violet-300">
                  Synth fallback — no recording or file loaded.
                </p>
              )}
              {notice && <p className="mt-2 text-sm text-violet-300">{notice}</p>}
            </div>
          )}

          {webglFailed && (
            <p className="mt-3 text-sm text-violet-300">
              WebGL2 is unavailable — showing a simpler Canvas2D projection of
              the same light-field.
            </p>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
            <Link
              href="/dream"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← all prototypes
            </Link>
          </div>

          {showNotes && (
            <div className="mt-3 max-w-xl rounded-2xl border border-border bg-black/50 p-5 text-sm leading-relaxed text-muted-foreground backdrop-blur-md">
              <p>
                Each onset deposits a soft gaussian blob into a 48³ density
                grid. Brightness (spectral centroid) sets its height; a slowly
                rotating helix places successive notes so the column spirals as
                it grows. The whole grid decays on a ~75-second half-life — old
                light fades but persists, so the structure never loops.
              </p>
              <p className="mt-3">
                The grid is uploaded each frame as a WebGL2{" "}
                <span className="text-violet-200">sampler3D</span> and
                raymarched front-to-back with emission/absorption. The camera
                drifts perpetually inward toward the brightening core — the NDE
                tunnel toward a being of light.
              </p>
              <p className="mt-3 text-muted-foreground">
                References: Refik Anadol (data as luminous pigment); the
                near-death &ldquo;tunnel toward the light&rdquo; phenomenology
                described by
                Raymond Moody, Bruce Greyson, and Pim van Lommel. Warm-gold on
                near-black. Slow luminance drift only — no strobe.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

// Local seeded PRNG for the pre-gesture procedural drive (no Math.random).
function mulberryLocal(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
