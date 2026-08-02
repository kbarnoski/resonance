"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createField,
  stepField,
  applyMicSensory,
  applySyntheticSensory,
  FIELD_W,
  FIELD_H,
  type Field,
} from "./field";
import { createRenderer, drawField, type Renderer } from "./render";
import { makeRebusAudio, type RebusAudio } from "./audio";

const SEED = 0x5272;
const ARC_PERIOD = 32; // seconds for one sober → peak → return cycle

/** The auto "dose" arc: gating g glides 1 (sober) → ~0.03 (peak) → 1. */
function runArc(tSec: number): number {
  const phase = (tSec % ARC_PERIOD) / ARC_PERIOD; // 0..1
  const dip = 0.5 + 0.5 * Math.cos(phase * Math.PI * 2); // 1 at ends, 0 at mid
  return 0.03 + 0.97 * dip;
}

function clamp01(a: number): number {
  return a < 0.02 ? 0.02 : a > 1 ? 1 : a;
}

export default function RebusPage() {
  const [started, setStarted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [auto, setAuto] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  const fieldRef = useRef<Field | null>(null);
  const rendRef = useRef<Renderer | null>(null);
  const sensoryRef = useRef<Float32Array>(new Float32Array(FIELD_W * FIELD_H));

  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<RebusAudio | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const rafRef = useRef<number>(0);
  const startMsRef = useRef<number>(0);

  const autoRef = useRef(true);
  const manualGRef = useRef(1);
  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }, []);

  // ── the render loop: runs from mount (visual self-demo, no audio yet) ──
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const rend = rendRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !field || !rend || !ctx) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const nowMs = performance.now();
    const tSec = (nowMs - startMsRef.current) / 1000;

    // Bottom-up sensory layer: live mic if we have it, else seeded synthetic.
    const analyser = analyserRef.current;
    const freq = freqRef.current;
    let voiceEnergy = 0.25;
    if (analyser && freq) {
      analyser.getByteFrequencyData(freq);
      applyMicSensory(field, freq, sensoryRef.current);
      let s = 0;
      for (let i = 0; i < freq.length; i++) s += freq[i];
      voiceEnergy = s / (freq.length * 255);
    } else {
      applySyntheticSensory(field, tSec, sensoryRef.current);
      voiceEnergy = 0.28 + 0.14 * Math.sin(tSec * 0.8);
    }

    // Gating g: auto dose-arc (nudged louder-voice-lower), or manual scrub.
    const arcG = runArc(tSec);
    const g = autoRef.current
      ? clamp01(arcG - voiceEnergy * 0.45)
      : manualGRef.current;

    if (autoRef.current && sliderRef.current) {
      sliderRef.current.value = String(g);
    }

    const m = stepField(field, sensoryRef.current, g);
    drawField(rend, ctx, field.disp, g, nowMs);

    const bloom = 1 - g;
    audioRef.current?.update(
      bloom,
      m.coherence,
      m.activity,
      m.bell,
      voiceEnergy,
      nowMs,
    );

    if (readoutRef.current) {
      const phase =
        bloom < 0.25 ? "sober" : bloom < 0.7 ? "bloom" : "peak hallucination";
      readoutRef.current.textContent = `g ${g.toFixed(2)} · ${phase}`;
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── mount: build field + renderer, start painting immediately ─────────
  useEffect(() => {
    fieldRef.current = createField(SEED);
    rendRef.current = createRenderer();
    resize();
    startMsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [loop, resize]);

  // ── full teardown on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 1600);
      }
      acRef.current = null;
    };
  }, []);

  // ── Begin: create audio inside the gesture, then try the mic ──────────
  const handleBegin = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    audioRef.current = makeRebusAudio(ac, 0.18);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      src.connect(analyser);
      analyserRef.current = analyser;
      freqRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // Denied / unavailable — the seeded synthetic sensory stream carries on.
      setMicDenied(true);
    }
  }, [started]);

  const onScrub = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    manualGRef.current = Number(e.currentTarget.value);
    setAuto(false);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {/* corner UI */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          REBUS · relaxed beliefs under psychedelics
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          The Anarchic Field
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Watch reality dissolve into structured hallucination the way the
          brain does it: a two-layer predictive-coding loop where a single{" "}
          <span className="text-foreground">gating</span> knob relaxes, and
          top-down prediction floods the sensory field until geometry blooms
          out of noise.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {!started && (
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Begin
            </button>
          )}
          {!auto && (
            <button
              onClick={() => setAuto(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Resume auto-arc
            </button>
          )}
        </div>

        {/* gating / dose scrubber */}
        <div className="mt-5 max-w-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              gating · dose
            </span>
            <span
              ref={readoutRef}
              className="font-mono text-xs text-muted-foreground"
            >
              g 1.00 · sober
            </span>
          </div>
          {/* value IS g: left end = peak (g→0.02), right end = sober (g=1) */}
          <input
            ref={sliderRef}
            type="range"
            min={0.02}
            max={1}
            step={0.001}
            defaultValue={1}
            onInput={onScrub}
            aria-label="gating dose"
            className="mt-2 w-full accent-primary"
          />
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {auto ? "auto · self-demoing" : "manual scrub"} · left peak · right
            sober
          </p>
        </div>

        {!started && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            painting the arc now · press Begin for sound + your voice as the
            sensory stream
          </p>
        )}
        {micDenied && (
          <p className="mt-3 text-sm text-destructive">
            Mic unavailable — running on the seeded synthetic sensory signal.
            The story still plays; grant the microphone to feed it your own
            room.
          </p>
        )}
      </div>

      {/* design notes button */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-3 right-3 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This literalises the{" "}
                <span className="text-foreground">REBUS</span> model of
                psychedelic action (Carhart-Harris &amp; Friston, 2019). In
                predictive coding the cortex holds high-level priors in check
                with precise bottom-up sensory error. Psychedelics relax the
                precision of that gating, so top-down predictions overwhelm the
                noisy input and structured imagery blooms.
              </p>
              <p>
                Two layers share one lattice. The{" "}
                <span className="text-foreground">sensory</span> layer is your
                mic spectrum (or a seeded synthetic spectrum) painted into the
                field. The <span className="text-foreground">prediction</span>{" "}
                layer is a Gray-Scott reaction-diffusion field that self-
                organises. Each frame:{" "}
                <span className="text-foreground">
                  prediction += rate · g · (sensory − prediction)
                </span>
                , and the image is the precision-weighted blend{" "}
                <span className="text-foreground">
                  g·sensory + (1−g)·prediction
                </span>
                . As the gating <span className="text-foreground">g</span> drops
                along the dose-arc, the correction fades and the prior takes
                over — the crossover you are watching.
              </p>
              <p>
                The drone tracks the field&apos;s coherence: thin and mildly
                dissonant when sober, gliding onto a just-intoned chord with
                shimmer-bells on emergent features at the peak. No strobing —
                brightness only drifts slowly, well under 3&nbsp;Hz.
              </p>
              <p className="text-xs">
                Refs: Carhart-Harris &amp; Friston (2019) &ldquo;REBUS and the
                Anarchic Brain&rdquo;, Pharmacological Reviews · &ldquo;Neural
                mechanisms of psychedelic visual imagery&rdquo; (2024),
                Molecular Psychiatry · Friston, free-energy / predictive coding.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
