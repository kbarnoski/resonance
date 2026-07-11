"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SeanceAudio, type Descriptor } from "./audio";
import { buildSpectrogram, COLS, type Spectrogram } from "./resonify";
import { dreamImage, describeWords, type DreamResult } from "./dream";
import { createRenderer, type Renderer } from "./render";

/* ──────────────────────────────────────────────────────────────────────────
   Spectral Séance
   A closed audio→image→audio loop. An inharmonic generative bed is reduced to
   a spectral descriptor; the descriptor dreams an austere data-image; the
   image is RE-SONIFIED column-by-column as a spectrogram (image-as-instrument)
   while a cyan scan-line sweeps it in lock-step. The re-sonified spectrum then
   feeds the next descriptor. Runs forever with zero network via a procedural
   fallback. Extends 689-dream-chapters (which was one-way) into a true round
   trip — Ryoji Ikeda / Xenakis UPIC / ANS synthesizer lineage.
   ────────────────────────────────────────────────────────────────────────── */

const STEP_MS = 75; // one spectrogram column step (~9.6s per 128-col sweep)
const DREAM_THROTTLE_MS = 45000; // ≥45s between real flux calls

export default function SpectralSeancePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<SeanceAudio | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const specRef = useRef<Spectrogram | null>(null);
  const colRef = useRef(0);
  const stepTimerRef = useRef<number | null>(null);
  const descTimerRef = useRef<number | null>(null);
  const lastDreamRef = useRef(0);
  const dreamingRef = useRef(false);
  const autoStartRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [source, setSource] = useState<"flux" | "procedural">("procedural");
  const [desc, setDesc] = useState<Descriptor | null>(null);
  const [prompt, setPrompt] = useState("");
  const [scanPct, setScanPct] = useState(0);

  // Pull a fresh descriptor, dream an image (throttled), re-sonify it.
  const dreamNext = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || dreamingRef.current) return;
    const now = performance.now();
    if (now - lastDreamRef.current < DREAM_THROTTLE_MS && specRef.current) {
      return; // respect throttle once we already have an image playing
    }
    dreamingRef.current = true;
    lastDreamRef.current = now;

    const d = audio.readDescriptor();
    setDesc(d);

    let result: DreamResult;
    try {
      result = await dreamImage(d);
    } catch {
      // dreamImage never throws, but stay defensive
      dreamingRef.current = false;
      return;
    }

    setSource(result.source);
    setPrompt(result.prompt);

    // RETURN TRIP: image → spectrogram → drives the oscillator bank
    const spec = buildSpectrogram(result.canvas);
    audio.hushBank();
    specRef.current = spec;
    colRef.current = 0;
    rendererRef.current?.setCurrent(result.canvas);

    dreamingRef.current = false;
  }, []);

  const begin = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    if (autoStartRef.current !== null) {
      window.clearTimeout(autoStartRef.current);
      autoStartRef.current = null;
    }

    // audio (must be inside the gesture for iOS)
    const audio = new SeanceAudio();
    audioRef.current = audio;
    await audio.resume();
    audio.fadeIn();
    audio.startBedMorph();

    // first dream right away
    void dreamNext();

    // column stepper — drives the bank one column per STEP_MS, sweeps scan-line
    const step = () => {
      const spec = specRef.current;
      const a = audioRef.current;
      if (spec && a) {
        const c = colRef.current;
        a.setColumn(spec.amps[c]);
        const pct = c / (COLS - 1);
        rendererRef.current?.setScan(pct);
        setScanPct(pct);
        colRef.current = (c + 1) % COLS;
        // when the scan completes a pass, try to dream the next image
        if (colRef.current === 0) void dreamNext();
      }
      stepTimerRef.current = window.setTimeout(step, STEP_MS);
    };
    stepTimerRef.current = window.setTimeout(step, STEP_MS);

    // refresh the displayed descriptor a couple times a second
    descTimerRef.current = window.setInterval(() => {
      const a = audioRef.current;
      if (a) setDesc(a.readDescriptor());
    }, 500);
  }, [dreamNext]);

  // set up the WebGL2 renderer immediately so visuals animate before audio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = createRenderer(canvas);
    if (!r) {
      setWebglOk(false);
    } else {
      rendererRef.current = r;
    }
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // auto-start ~2.5s after mount if untouched (audio still waits for gesture
  // on locked browsers, but on most desktops resume() succeeds here)
  useEffect(() => {
    autoStartRef.current = window.setTimeout(() => {
      if (!startedRef.current) void begin();
    }, 2500);
    return () => {
      if (autoStartRef.current !== null) window.clearTimeout(autoStartRef.current);
    };
  }, [begin]);

  // full teardown
  useEffect(() => {
    return () => {
      if (stepTimerRef.current !== null) window.clearTimeout(stepTimerRef.current);
      if (descTimerRef.current !== null) window.clearInterval(descTimerRef.current);
      void audioRef.current?.stop();
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const words = desc ? describeWords(desc) : null;
  const sourceLabel =
    source === "flux" ? (
      <span className="text-violet-300/95">dreaming live (flux)</span>
    ) : (
      <span className="text-violet-300/95">dreaming (procedural)</span>
    );

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* WebGL2 raster output */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Dreamed image re-sonified as a spectrogram with a sweeping scan-line"
      />

      {webglOk ? null : (
        <div className="absolute inset-0 flex items-center justify-center bg-black px-6 text-center">
          <p className="max-w-md text-base text-violet-300/95">
            WebGL2 is unavailable on this device, so the visual spectrogram
            can&apos;t render — but the séance is still running: the inharmonic
            bed and the re-sonified image are playing as sound.
          </p>
        </div>
      )}

      {/* heading + HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Spectral Séance
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          A sound dreams a picture — then the picture becomes the next
          instrument you hear. A closed loop where the return trip is literal:
          the dreamed image is played back column-by-column as a spectrogram.
        </p>

        {started && (
          <div className="mt-5 max-w-xl rounded-xl border border-border bg-black/55 p-4 font-mono backdrop-blur-md">
            <div className="flex items-center justify-between text-base">
              <span className="text-foreground">
                {words ? `${words.brightness} · ${words.texture}` : "listening…"}
              </span>
              <span className="text-muted-foreground">
                col {String(Math.round(scanPct * (COLS - 1))).padStart(3, "0")}/
                {COLS}
              </span>
            </div>

            {desc && (
              <div className="mt-3 flex gap-1.5 text-muted-foreground" aria-hidden>
                <Bar label="lo" v={desc.low} />
                <Bar label="mid" v={desc.mid} />
                <Bar label="hi" v={desc.high} />
                <Bar label="brt" v={desc.centroid} />
                <Bar label="rgh" v={desc.flatness} />
                <Bar label="dns" v={desc.density} />
              </div>
            )}

            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              {sourceLabel}
            </p>
            {prompt && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {prompt}
              </p>
            )}
          </div>
        )}
      </div>

      {/* begin overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/85 px-6 text-center backdrop-blur-sm">
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            An inharmonic drone listens to itself, dreams an austere data-image,
            then plays that image back as sound — each column a moment, each row
            a pitch — while a cyan line sweeps across it. The loop closes and
            runs on its own. It starts in a moment; press Begin to unlock audio
            now.
          </p>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-card px-8 py-2.5 text-base font-medium text-black transition-opacity hover:opacity-90"
          >
            Begin
          </button>
          <Link
            href="/dream"
            className="text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← back to the lab
          </Link>
        </div>
      )}

      {/* brand touch */}
      <div className="pointer-events-none absolute bottom-3 right-4 z-10 font-mono text-sm text-violet-300/80">
        704 · spectral séance
      </div>
    </main>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  const h = Math.round(Math.max(0.04, Math.min(1, v)) * 24);
  return (
    <div className="flex w-9 flex-col items-center gap-1">
      <div className="flex h-6 w-full items-end justify-center">
        <div
          className="w-full rounded-sm bg-violet-300/70"
          style={{ height: `${h}px` }}
        />
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
