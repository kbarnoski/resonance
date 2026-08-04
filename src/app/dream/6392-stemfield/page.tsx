"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 6392-stemfield — fly INSIDE your own recording, pulled apart into its voices.
//
//   Drop an audio file (piano / acoustic works best) and it is separated LIVE in
//   the browser — no ML model — into four perceptual stems using Harmonic /
//   Percussive Source Separation (median filtering, Fitzgerald 2010) plus a
//   harmonic band-split. Each stem becomes a glowing 3D body you orbit, fly
//   through, and remix by tapping (solo), muting, and pushing its level. Muting
//   genuinely removes a stem from playback — the mix is resynthesized from the
//   separated streams, so the interaction is real.
//
//   Alive on load with zero interaction: a seeded synthetic four-stem musical
//   bed plays through the SAME per-stem path until (and unless) you drop a file.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { StemAudio } from "./audio";
import { StemScene } from "./scene";
import { separateStems, STEM_NAMES } from "./hpss";

const SEED = 0x6392;

const STEM_LABEL: Record<string, string> = {
  percussive: "Percussive",
  bass: "Bass",
  body: "Harmonic body",
  air: "Air",
};

interface UiStem {
  level: number;
  muted: boolean;
}

export default function StemfieldPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioRef = useRef<StemAudio | null>(null);
  const sceneRef = useRef<StemScene | null>(null);
  const rafRef = useRef<number>(0);

  const [webglOk, setWebglOk] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ v: number; label: string } | null>(null);
  const [soloIndex, setSoloIndex] = useState<number | null>(null);
  const [stems, setStems] = useState<UiStem[]>(
    STEM_NAMES.map(() => ({ level: 1, muted: false })),
  );

  // ── mount: build audio + scene + rAF loop ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL capability probe
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") || probe.getContext("webgl");
    if (!gl) setWebglOk(false);

    let audio: StemAudio;
    try {
      audio = new StemAudio();
    } catch {
      setError("This browser blocked audio. Try a click, or a different browser.");
      return;
    }
    audioRef.current = audio;
    setNeedsTap(audio.suspended);

    let scene: StemScene | null = null;
    if (gl) {
      try {
        scene = new StemScene(canvas, SEED);
        scene.onPick((i) => runToggleSolo(i));
        sceneRef.current = scene;
      } catch {
        setWebglOk(false);
      }
    }

    const onResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      sceneRef.current?.resize(w, h);
    };
    window.addEventListener("resize", onResize);

    let prev = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      audio.sampleLevels();
      sceneRef.current?.setLevels(audio.levels, audio.soloIndex);
      sceneRef.current?.render(dt);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const wake = () => {
      audioRef.current?.resume();
      setNeedsTap(false);
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── mixer actions ───────────────────────────────────────────────────────────
  const runToggleSolo = useCallback((i: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.resume();
    audio.toggleSolo(i);
    setSoloIndex(audio.soloIndex);
  }, []);

  const runToggleMute = useCallback((i: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.resume();
    audio.toggleMute(i);
    setStems((s) => s.map((st, k) => (k === i ? { ...st, muted: audio.muted[i] } : st)));
  }, []);

  const runSetLevel = useCallback((i: number, v: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setLevel(i, v);
    setStems((s) => s.map((st, k) => (k === i ? { ...st, level: v } : st)));
  }, []);

  // ── file → separation ───────────────────────────────────────────────────────
  const runSeparate = useCallback(async (file: File) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.resume();
    setError(null);
    setProgress({ v: 0, label: "reading file" });
    try {
      const data = await file.arrayBuffer();
      const { mono, sampleRate } = await audio.decodeMono(data);
      // cap analysis to first ~35s to keep it responsive
      const cap = Math.floor(35 * sampleRate);
      const clip = mono.length > cap ? mono.subarray(0, cap) : mono;
      const result = await separateStems(clip, sampleRate, (v, label) =>
        setProgress({ v, label }),
      );
      audio.loadStems(result);
      setIsLive(true);
      // reset mixer UI to full
      audio.soloIndex = null;
      setSoloIndex(null);
      setStems(STEM_NAMES.map(() => ({ level: 1, muted: false })));
    } catch {
      setError("Couldn't decode or separate that file. The current bed keeps playing.");
    } finally {
      setProgress(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) void runSeparate(file);
    },
    [runSeparate],
  );

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void runSeparate(file);
    },
    [runSeparate],
  );

  return (
    <main
      ref={containerRef}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative h-dvh w-screen overflow-hidden bg-background"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {!webglOk && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 px-4">
          <p className="rounded-md border border-border bg-background/70 px-4 py-2 text-center text-base text-destructive">
            WebGL isn&apos;t available, so the 3D field can&apos;t render — but the
            audio still plays. Tap to start the sound.
          </p>
        </div>
      )}

      {/* header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-5">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Stemfield
          </h1>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            Fly inside a recording pulled apart into its separate voices, and remix
            it by moving through and touching them.
          </p>
          <div className="pointer-events-auto mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Drop / choose an audio file
            </button>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {isLive ? "your recording · live" : "synthetic bed"}
            </span>
          </div>
          {error && (
            <p className="mt-2 max-w-md text-base text-destructive">{error}</p>
          )}
        </div>
      </div>

      {/* per-stem mixer */}
      <div className="absolute bottom-5 left-5 right-5 flex justify-center">
        <div className="pointer-events-auto w-full max-w-2xl rounded-md border border-border bg-background/60 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              spatial mixer
            </span>
            <span className="text-xs text-muted-foreground">
              tap a body to solo · use the faders to push each voice
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {STEM_NAMES.map((name, i) => {
              const st = stems[i];
              const soloed = soloIndex === i;
              return (
                <div
                  key={name}
                  className="flex items-center gap-3 rounded-md border border-border bg-background/40 px-3 py-2"
                >
                  <span className="w-28 shrink-0 text-sm text-foreground">
                    {STEM_LABEL[name]}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={st.level}
                    onChange={(e) => runSetLevel(i, parseFloat(e.target.value))}
                    aria-label={`${STEM_LABEL[name]} level`}
                    className="h-1 flex-1 cursor-pointer accent-primary"
                  />
                  <button
                    type="button"
                    onClick={() => runToggleSolo(i)}
                    aria-pressed={soloed}
                    className={`min-h-[44px] rounded-md border px-3 text-xs transition-colors ${
                      soloed
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    Solo
                  </button>
                  <button
                    type="button"
                    onClick={() => runToggleMute(i)}
                    aria-pressed={st.muted}
                    className={`min-h-[44px] rounded-md border px-3 text-xs transition-colors ${
                      st.muted
                        ? "border-destructive text-destructive"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    Mute
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* read-the-design-notes affordance */}
      <div className="absolute right-5 top-5">
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {needsTap && (
        <div className="pointer-events-none absolute left-1/2 top-40 -translate-x-1/2">
          <span className="rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground">
            tap anywhere to wake the sound
          </span>
        </div>
      )}

      {/* separation progress */}
      {progress && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-6">
          <div className="w-full max-w-sm rounded-md border border-border bg-background p-6">
            <p className="text-base text-foreground">Separating your recording…</p>
            <p className="mt-1 text-sm text-muted-foreground">{progress.label}</p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-md bg-accent">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${Math.round(progress.v * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={onPick}
        className="hidden"
      />

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-6"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-md border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Stemfield — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A dropped recording is decoded to mono and run through a
                Short-Time Fourier Transform (Hann, 2048 window / 512 hop) using a
                hand-written radix-2 FFT — no npm audio library, no ML model.
              </p>
              <p>
                <strong className="text-foreground">Harmonic / Percussive
                Separation</strong> follows Derry Fitzgerald&apos;s median-filtering
                method: the magnitude spectrogram is median-filtered along{" "}
                <em>time</em> (sustained tones survive → harmonic estimate H) and
                along <em>frequency</em> (transients survive → percussive estimate
                P). Soft Wiener masks{" "}
                <span className="font-mono">Mh = H²/(H²+P²)</span>,{" "}
                <span className="font-mono">Mp = 1−Mh</span> are applied to the
                complex spectrogram and inverse-STFT&apos;d back to two streams that
                sum to the original — so muting a stem is a genuine removal.
              </p>
              <p>
                The harmonic stream is then band-split by crossover biquads into{" "}
                <strong className="text-foreground">bass</strong> (&lt;250 Hz),{" "}
                <strong className="text-foreground">air</strong> (&gt;2.6 kHz) and{" "}
                <strong className="text-foreground">harmonic body</strong> (the
                remainder), giving four stems that each become a 3D body driven by
                its own live analyser level.
              </p>
              <p>
                Tap a body to solo it, mute or push its level with the faders, and
                drag to look around — the camera auto-orbits on load. With no file,
                a seeded synthetic four-stem bed plays through the identical path.
              </p>
              <p className="text-xs">
                References: Derry Fitzgerald, &ldquo;Harmonic/Percussive Separation
                using Median Filtering,&rdquo; DAFx 2010. Reframed against the
                2026 real-time music-source-separation frontier (arXiv 2511.13146,
                &ldquo;Towards Practical Real-Time Low-Latency Music Source
                Separation&rdquo;; arXiv 2607.23395, MSST) as the no-ML, in-browser
                classic-DSP counterpart.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
