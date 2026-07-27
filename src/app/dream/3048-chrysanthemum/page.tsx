"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FORM_LABEL } from "../_shared/psych/logpolar";
import {
  AutoVoice,
  VoiceSynth,
  VoiceTracker,
  detectPitch,
  formNameFromPitch,
  mapVoiceToVisual,
  rmsToLoud,
} from "./voice";
import { makeBloom, makeBloomFallback, type BloomHandle } from "./bloom-gl";

// ─────────────────────────────────────────────────────────────────────────────
// 3048 · CHRYSANTHEMUM
// Sing the DMT chrysanthemum into being. Sustain a hummed tone and the classic
// serotonergic-psychedelic form-constants (tunnels, spirals, spokes, honeycombs)
// bloom, unfold and saturate in exact response to your voice — then collapse to
// a faint threshold the instant you fall silent.
//
// INPUT: microphone (sustained voice — pitch + loudness).
// OUTPUT: WebGL2 fragment shader — kaleidoscope + log-polar form-constant engine
//         + ping-pong feedback trails + chromatic aberration + thin-film iridescence.
// The geometry is silent and still until YOU sound. Not a self-playing screensaver.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "mic" | "auto";

export default function ChrysanthemumPage() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("mic");
  const [micError, setMicError] = useState<string | null>(null);
  const [vizFallback, setVizFallback] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [formName, setFormName] = useState("—");
  const [bloomPct, setBloomPct] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<VoiceSynth | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const trackerRef = useRef<VoiceTracker>(new VoiceTracker());
  const autoRef = useRef<AutoVoice>(new AutoVoice(0x3048));
  const bloomRef = useRef<BloomHandle | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const clockRef = useRef(0); // reduced-motion-scaled visual clock
  const lastReadoutRef = useRef(0);
  const modeRef = useRef<Mode>("mic");
  const reducedRef = useRef(false);

  // ── Set up the bloom engine on mount (WebGL2, else Canvas2D). ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    let handle = makeBloom(canvas);
    if (!handle) {
      handle = makeBloomFallback(canvas);
      setVizFallback(true);
    }
    bloomRef.current = handle;
    const onResize = () => bloomRef.current?.resize();
    window.addEventListener("resize", onResize);

    // Idle render: a faint, nearly-still threshold pattern so the page is never
    // blank — the flower waiting to be sung into being.
    let idleRaf = 0;
    let last = performance.now();
    let clock = 0;
    const idle = () => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt <= 0 || dt > 0.1) dt = 0.016;
      clock += dt * (reducedRef.current ? 0.25 : 0.5); // very slow at rest
      const v = mapVoiceToVisual(0, 55, reducedRef.current ? 0.4 : 1);
      bloomRef.current?.render({ time: clock, ...v });
      if (!rafRef.current) idleRaf = requestAnimationFrame(idle);
    };
    idleRaf = requestAnimationFrame(idle);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(idleRaf);
      bloomRef.current?.dispose();
      bloomRef.current = null;
    };
  }, []);

  const frame = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    if (dt <= 0 || dt > 0.1) dt = 0.016;

    const tracker = trackerRef.current;
    const reduced = reducedRef.current;

    // Gather a raw voice measurement from mic or the seeded autopilot.
    if (modeRef.current === "mic" && analyserRef.current && timeBufRef.current) {
      analyserRef.current.getFloatTimeDomainData(timeBufRef.current);
      const sr = audioCtxRef.current?.sampleRate ?? 44100;
      const res = detectPitch(timeBufRef.current, sr);
      const loud = rmsToLoud(res.rms);
      tracker.update(loud, res.confidence > 0.3 ? res.midi : null, dt);
    } else {
      const v = autoRef.current.step(dt);
      tracker.update(v.loud, v.confidence > 0.3 ? v.midi : null, dt);
    }

    // Halo synth tracks the sung pitch, gated by loudness.
    synthRef.current?.set(tracker.midi, tracker.loud);

    // Advance the reduced-motion-scaled visual clock.
    clockRef.current += dt * (reduced ? 0.4 : 1);

    // Map voice → geometry and render the bloom.
    const vis = mapVoiceToVisual(tracker.loud, tracker.midi, reduced ? 0.4 : 1);
    bloomRef.current?.render({ time: clockRef.current, ...vis });

    // Throttle React readouts.
    if (now - lastReadoutRef.current > 140) {
      lastReadoutRef.current = now;
      setBloomPct(Math.round(tracker.loud * 100));
      setFormName(
        tracker.loud > 0.04 ? FORM_LABEL[formNameFromPitch(tracker.midi)] : "threshold",
      );
    }

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    synthRef.current?.dispose();
    synthRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    timeBufRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setRunning(false);
    setFormName("—");
    setBloomPct(0);
  }, []);

  const start = useCallback(
    async (requested: Mode) => {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      await ctx.resume().catch(() => {});

      const synth = new VoiceSynth(ctx);
      synth.start();
      synthRef.current = synth;

      let activeMode: Mode = requested;
      if (requested === "mic") {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          streamRef.current = stream;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser); // NOT connected to destination (no feedback)
          analyserRef.current = analyser;
          timeBufRef.current = new Float32Array(analyser.fftSize);
          setMicError(null);
        } catch {
          setMicError(
            "Microphone unavailable — falling back to a seeded autopilot voice. Grant mic access and press Start to sing it yourself.",
          );
          activeMode = "auto";
        }
      }

      setMode(activeMode);
      modeRef.current = activeMode;
      lastTimeRef.current = performance.now();
      setRunning(true);
      rafRef.current = requestAnimationFrame(frame);
    },
    [frame],
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      synthRef.current?.dispose();
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  const toggleMode = useCallback(
    (next: Mode) => {
      if (next === modeRef.current && running) return;
      if (running) {
        stop();
        window.setTimeout(() => void start(next), 80);
      } else {
        setMode(next);
        modeRef.current = next;
      }
    },
    [running, start, stop],
  );

  return (
    <main className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Foreground UI */}
      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-10">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · Dream 3048
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
            Chrysanthemum
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Sing the chrysanthemum into being. Sustain a hummed tone and the
            classic psychedelic form-constants — tunnels, spirals, spokes,
            honeycombs — bloom, unfold and saturate in exact response to your
            voice, then collapse to a faint threshold the instant you fall
            silent. Pitch chooses the form; loudness drives the bloom.
          </p>
        </header>

        {/* Live readout */}
        <div className="pointer-events-none flex flex-col items-start gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Form constant · bloom
          </span>
          <span className="font-mono text-2xl font-medium text-foreground sm:text-4xl">
            {formName} <span className="text-primary">·</span> {bloomPct}%
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          {micError && <p className="text-base text-destructive">{micError}</p>}
          {vizFallback && (
            <p className="text-base text-muted-foreground">
              WebGL2 unavailable — showing the Canvas2D threshold fallback.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={() => void start(mode)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {mode === "mic" ? "Start singing" : "Start (autopilot voice)"}
              </button>
            ) : (
              <button
                onClick={stop}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Stop
              </button>
            )}

            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                onClick={() => toggleMode("mic")}
                className={`min-h-[44px] px-4 text-sm transition-colors ${
                  mode === "mic"
                    ? "bg-accent text-foreground"
                    : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Sing (mic)
              </button>
              <button
                onClick={() => toggleMode("auto")}
                className={`min-h-[44px] px-4 text-sm transition-colors ${
                  mode === "auto"
                    ? "bg-accent text-foreground"
                    : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                Autopilot voice
              </button>
            </div>

            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </div>
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              A drug-free altered-states instrument. The{" "}
              <span className="text-foreground">chrysanthemum</span> is the dense
              unfolding fractal flower of the DMT come-up — and here{" "}
              <span className="text-foreground">you</span> are responsible for it,
              moment to moment.
            </p>
            <ul className="mt-4 space-y-2 text-base text-muted-foreground">
              <li>
                A lightweight <span className="text-foreground">YIN</span> tracker
                reads your mic&apos;s pitch and loudness every frame, one-pole
                smoothed (fast attack, gentle release).
              </li>
              <li>
                All psychedelic geometry is one stripe/hex pattern seen through a{" "}
                <span className="text-foreground">log-polar warp</span>{" "}
                (Bressloff–Cowan, on Klüver&apos;s four{" "}
                <span className="text-foreground">form constants</span>). This
                piece composes the shared{" "}
                <span className="text-foreground">logpolar.ts</span> engine.
              </li>
              <li>
                <span className="text-foreground">Pitch</span> selects the
                constant + spatial frequency (low → wide tunnels, up through
                spirals and spokes, to fine honeycombs) and rotates the hue.
              </li>
              <li>
                <span className="text-foreground">Loudness / sustain</span> drives
                bloom depth: kaleidoscope folds, warp amplitude, fractal detail,
                saturation, feedback trails and chromatic aberration. Silence
                collapses it to a faint threshold.
              </li>
              <li>
                Photosensitive-safe: intensity is expressed as slow luminance{" "}
                <span className="text-foreground">drift</span>, saturation and
                warp — never full-field strobing. Honors{" "}
                <span className="text-foreground">prefers-reduced-motion</span>.
              </li>
              <li>
                No mic? A deterministic seeded{" "}
                <span className="text-foreground">autopilot voice</span> hums slow
                sustained tones so the piece self-demos; a subtle overtone halo
                always sings your pitch back.
              </li>
            </ul>
            <button
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
