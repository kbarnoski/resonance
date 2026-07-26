"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectPitch } from "./pitch";
import { HarmonyEngine } from "./harmony";
import { Synth } from "./audio";
import { VirtualImproviser } from "./rng";
import {
  makeAurora,
  makeAuroraFallback,
  type AuroraHandle,
  type AuroraUniforms,
} from "./viz";

// ─────────────────────────────────────────────────────────────────────────────
// 2928 · FREE HARMONY
// A live accompanist that follows your HARMONY with no reference score. You sing
// (or hum, or play) anything freely; in real time it finds your key via
// Krumhansl–Schmuckler key-finding on a decaying pitch-class histogram, and lays
// the right chord under your voice — re-harmonizing a beat or two after you
// modulate. The deterministic music-theory cousin of ReaLchords.
//
// INPUT: mic / live voice.   OUTPUT: WebGL2 fragment-shader "harmony aurora".
// TECHNIQUE: Krumhansl–Schmuckler key-finding → functional harmony w/ voice-
// leading + hysteresis.   VIBE: cosmic / harmonic-aurora, immersive.
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "auto" | "mic";

export default function FreeHarmonyPage() {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("auto");
  const [keyName, setKeyName] = useState("—");
  const [chordName, setChordName] = useState("—");
  const [micError, setMicError] = useState<string | null>(null);
  const [vizFallback, setVizFallback] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<Synth | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const engineRef = useRef<HarmonyEngine>(new HarmonyEngine());
  const improviserRef = useRef<VirtualImproviser>(new VirtualImproviser());
  const auroraRef = useRef<AuroraHandle | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastReadoutRef = useRef<number>(0);
  const lastChordNameRef = useRef<string>("");
  const modeRef = useRef<Mode>("auto");

  // ── Set up the aurora on mount (WebGL2, else Canvas2D fallback). ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let handle = makeAurora(canvas);
    if (!handle) {
      handle = makeAuroraFallback(canvas);
      setVizFallback(true);
    }
    auroraRef.current = handle;
    const onResize = () => auroraRef.current?.resize();
    window.addEventListener("resize", onResize);

    // Idle render so the page is never static, even before Start.
    let idleRaf = 0;
    const t0 = performance.now();
    const idle = () => {
      const u: AuroraUniforms = {
        time: (performance.now() - t0) / 1000,
        tonic: 0.5,
        pulse: 0,
        pitch: 0.3,
        stability: 0.4,
      };
      auroraRef.current?.render(u);
      if (!rafRef.current) idleRaf = requestAnimationFrame(idle);
    };
    idleRaf = requestAnimationFrame(idle);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(idleRaf);
      auroraRef.current?.dispose();
      auroraRef.current = null;
    };
  }, []);

  const frame = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    if (dt <= 0 || dt > 0.1) dt = 0.016; // clamp hitches
    const engine = engineRef.current;
    const synth = synthRef.current;

    let voiced = false;
    if (modeRef.current === "mic" && analyserRef.current && timeBufRef.current) {
      analyserRef.current.getFloatTimeDomainData(timeBufRef.current);
      const sr = ctxRef.current?.sampleRate ?? 44100;
      const res = detectPitch(timeBufRef.current, sr);
      if (res && res.confidence > 0.35) {
        engine.feed(res.midi, res.confidence, dt);
        voiced = true;
      }
      synth?.setLead(0, false);
    } else if (modeRef.current === "auto") {
      const v = improviserRef.current.step(dt);
      synth?.setLead(v.midi, v.confidence > 0.2);
      if (v.confidence > 0.35) {
        engine.feed(v.midi, v.confidence, dt);
        voiced = true;
      }
    }
    if (!voiced) engine.decayOnly(dt);

    engine.tick(dt);

    // Push chord to the synth only when it actually changes.
    if (engine.chord && engine.chord.name !== lastChordNameRef.current) {
      lastChordNameRef.current = engine.chord.name;
      synth?.setChord(engine.chord.notes, engine.chord.bass);
    }
    synth?.tickArp(dt);

    // Render aurora.
    auroraRef.current?.render({
      time: now / 1000,
      tonic: engine.circleOfFifthsPosition(),
      pulse: engine.chordChangePulse,
      pitch: engine.pitchHeight(),
      stability: engine.stability,
    });

    // Throttle React readout updates.
    if (now - lastReadoutRef.current > 150) {
      lastReadoutRef.current = now;
      setKeyName(engine.key.name);
      setChordName(engine.chord ? engine.chord.name : "—");
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
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setRunning(false);
  }, []);

  const start = useCallback(
    async (requested: Mode) => {
      // Fresh audio graph each start.
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      await ctx.resume().catch(() => {});

      const synth = new Synth(ctx);
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
            "Microphone unavailable — falling back to the virtual improviser.",
          );
          activeMode = "auto";
        }
      }

      setMode(activeMode);
      modeRef.current = activeMode;
      lastTimeRef.current = performance.now();
      lastChordNameRef.current = "";
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
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const toggleMode = useCallback(
    (next: Mode) => {
      if (next === modeRef.current && running) return;
      if (running) {
        stop();
        // brief tick so the old context fully tears down before the new one
        window.setTimeout(() => void start(next), 80);
      } else {
        setMode(next);
        modeRef.current = next;
      }
    },
    [running, start, stop],
  );

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Foreground UI */}
      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-10">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Resonance · Dream 2928
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
            Free Harmony
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            A live accompanist that follows your harmony with no reference score.
            Sing, hum, or play anything freely — it finds your key and lays the
            right chord under your voice, re-harmonizing a beat or two after you
            modulate.
          </p>
        </header>

        {/* Live readout */}
        <div className="pointer-events-none flex flex-col items-start gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Detected key · chord
          </span>
          <span className="font-mono text-3xl font-medium text-foreground sm:text-5xl">
            {keyName} <span className="text-primary">·</span> {chordName}
          </span>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          {micError && (
            <p className="text-base text-destructive">{micError}</p>
          )}
          {vizFallback && (
            <p className="text-base text-muted-foreground">
              WebGL2 unavailable — showing the Canvas2D fallback aurora.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={() => void start(mode)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {mode === "mic" ? "Start singing" : "Start (virtual improviser)"}
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
                Auto (virtual improviser)
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
              A <span className="text-foreground">scoreless</span> free
              harmonizer — the opposite of a click track. You own the melody
              moment-to-moment; the agent can be wrong.
            </p>
            <ul className="mt-4 space-y-2 text-base text-muted-foreground">
              <li>
                A <span className="text-foreground">YIN</span> pitch tracker reads
                the mic and emits a continuous MIDI pitch — never snapped to a
                scale.
              </li>
              <li>
                Confident pitches feed a{" "}
                <span className="text-foreground">
                  12-bin pitch-class histogram
                </span>{" "}
                that decays with a ~2.4 s half-life.
              </li>
              <li>
                Every ~200 ms,{" "}
                <span className="text-foreground">
                  Krumhansl–Schmuckler
                </span>{" "}
                key-finding correlates the histogram against all 24 Krumhansl–
                Kessler profiles to name the key.
              </li>
              <li>
                A diatonic triad is chosen by functional preference (I/IV/V/vi)
                with <span className="text-foreground">voice-leading</span> and{" "}
                <span className="text-foreground">hysteresis</span>, so it
                modulates a beat or two after you do.
              </li>
              <li>
                The aurora&apos;s hue tracks the tonic around the circle of
                fifths (biased to the Resonance violet arc); bloom pulses on
                chord changes.
              </li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Kin to <span className="text-foreground">ReaLchords</span>{" "}
              (arXiv:2506.14723); the deterministic music-theory cousin.
            </p>
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
