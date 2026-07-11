"use client";

// ─────────────────────────────────────────────────────────────────────────
// Kids' Breath Flute — blow or hum into the tablet and a glowing air-column
// actually SINGS, by genuine physical modeling (a jet-drive digital-waveguide
// flute), not a sample. Tap the big glowing holes to pick a note.
//
// INPUT  : mic breath (RMS envelope) drives the bore pressure.
// OUTPUT : a glowing aurora air-column (WebGL2, Canvas2D fallback).
// MODEL  : Cook/Smith STK "Flute" jet-drive waveguide (see flute.ts + README).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SCALE_MIDI, SCALE_NAMES, midiToHz } from "./flute";
import { createFluteEngine, type FluteEngine } from "./worklet";
import { createColumnRenderer, type ColumnRenderer } from "./render";

// Hole colours: a calm teal→violet→gold sweep across the scale.
const HOLE_COLORS = [
  "#1ad9c7",
  "#27c9d6",
  "#5aa8e6",
  "#8c6ce0",
  "#a85fd6",
  "#c77ad0",
  "#e6a44e",
  "#ffcd52",
];

type MicState = "idle" | "asking" | "on" | "denied";

export default function BreathFlutePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const engineRef = useRef<FluteEngine | null>(null);
  const rendererRef = useRef<ColumnRenderer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micBufRef = useRef<Float32Array | null>(null);

  const rafRef = useRef(0);
  const breathRef = useRef(0); // smoothed breath envelope 0..1
  const tapPuffRef = useRef(0); // decaying tap-puff impulse 0..1
  const levelRef = useRef(0); // smoothed audio output level 0..1
  const brightRef = useRef(0); // smoothed brightness 0..1
  const lastInteractRef = useRef(0); // ms of last child interaction
  const demoStepRef = useRef(0);
  const demoNextAtRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [usingWorklet, setUsingWorklet] = useState(true);
  const [usingWebGL, setUsingWebGL] = useState(true);
  const [activeHole, setActiveHole] = useState(0); // index into SCALE
  const [autoDemo, setAutoDemo] = useState(true);

  const activeHoleRef = useRef(0);
  useEffect(() => {
    activeHoleRef.current = activeHole;
  }, [activeHole]);

  // In development, run the headless waveguide self-test once and log it —
  // proves the bore is tuned (each scale note within ±60 cents). See flute.test.ts.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      void import("./flute.test").then(({ selfTest }) => {
        const r = selfTest();
        // eslint-disable-next-line no-console
        console.log("[breath-flute] " + r.summary);
      });
    }
  }, []);

  // A short, gentle phrase for the idle auto-demo (indices into the scale).
  const DEMO_PHRASE = [0, 2, 4, 2, 0, 4, 7, 4];

  const noteInteraction = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  // ── Pick a hole (set the bore pitch) ─────────────────────────────────
  const selectHole = useCallback((i: number) => {
    activeHoleRef.current = i;
    setActiveHole(i);
    engineRef.current?.setMidi(SCALE_MIDI[i]);
  }, []);

  // ── Tap-puff: tapping a hole gives a soft breath impulse ─────────────
  const tapPuff = useCallback(
    (i: number) => {
      noteInteraction();
      selectHole(i);
      // Soft puff: ramps up the breath envelope briefly.
      tapPuffRef.current = Math.max(tapPuffRef.current, 0.85);
    },
    [noteInteraction, selectHole]
  );

  // ── Start audio + visuals (from a user gesture) ──────────────────────
  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const Ctx: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const engine = await createFluteEngine(ctx, master);
    engineRef.current = engine;
    setUsingWorklet(engine.usingWorklet);
    engine.setMidi(SCALE_MIDI[activeHoleRef.current]);
    engine.onLevel((rms, bright) => {
      // light smoothing into refs the rAF loop reads
      levelRef.current += (Math.min(1, rms * 12) - levelRef.current) * 0.4;
      brightRef.current += (Math.min(1, bright * 6) - brightRef.current) * 0.2;
    });

    // Renderer.
    if (canvasRef.current) {
      const r = createColumnRenderer(canvasRef.current);
      rendererRef.current = r;
      setUsingWebGL(r.usingWebGL);
      sizeCanvas();
    }

    lastInteractRef.current = performance.now();
    demoNextAtRef.current = performance.now() + 2000;
    startLoop();
    // Try the mic (non-blocking — the prototype works without it).
    void enableMic(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ── Mic: open stream, build an analyser to read the breath RMS ───────
  const enableMic = useCallback(async (ctx: AudioContext) => {
    setMicState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      src.connect(analyser);
      micAnalyserRef.current = analyser;
      micBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4)
      );
      setMicState("on");
    } catch {
      setMicState("denied");
    }
  }, []);

  // ── Canvas sizing ────────────────────────────────────────────────────
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const r = rendererRef.current;
    if (!canvas || !r) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    r.resize(rect.width, rect.height, dpr);
  }, []);

  useEffect(() => {
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sizeCanvas]);

  // ── Main animation + control loop ────────────────────────────────────
  const startLoop = useCallback(() => {
    const loop = () => {
      const now = performance.now();
      const t = now / 1000;

      // 1. Read breath from the mic (RMS of the raw waveform).
      let micBreath = 0;
      const analyser = micAnalyserRef.current;
      const buf = micBufRef.current;
      if (analyser && buf) {
        analyser.getFloatTimeDomainData(
          buf as unknown as Float32Array<ArrayBuffer>
        );
        let s = 0;
        for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length);
        // Map mic RMS into a usable breath range. Soft floor removes hum.
        micBreath = Math.min(1, Math.max(0, (rms - 0.012) * 9));
      }

      // 2. Tap-puff impulse decays away.
      tapPuffRef.current *= 0.965;
      const puff = tapPuffRef.current;

      // 3. Auto-demo breath (only when idle and enabled).
      let demoBreath = 0;
      const idle = now - lastInteractRef.current > 2000;
      if (autoDemo && idle) {
        if (now >= demoNextAtRef.current) {
          // advance to the next note of the phrase
          const step = demoStepRef.current % DEMO_PHRASE.length;
          selectHole(DEMO_PHRASE[step]);
          demoStepRef.current = step + 1;
          demoNextAtRef.current = now + 620;
        }
        // a gentle breath bump that fades within each note
        const into = 1 - (demoNextAtRef.current - now) / 620;
        demoBreath = 0.55 * Math.sin(Math.min(1, into) * Math.PI) ** 0.7;
      }

      // 4. Combine inputs (mic OR tap OR demo — take the strongest).
      const target = Math.max(micBreath, puff, demoBreath);
      // Smooth the breath envelope so taps and demo don't click.
      breathRef.current += (target - breathRef.current) * 0.25;
      engineRef.current?.setBreath(breathRef.current);

      // 5. Drive the visuals. If no audio-level callback yet, fall back to
      //    the breath envelope so the column always responds.
      const lvl = Math.max(levelRef.current, breathRef.current * 0.8);
      const bright = Math.max(brightRef.current, breathRef.current * 0.5);
      const pitch =
        (SCALE_MIDI[activeHoleRef.current] - SCALE_MIDI[0]) /
        (SCALE_MIDI[SCALE_MIDI.length - 1] - SCALE_MIDI[0]);
      rendererRef.current?.draw({ level: lvl, bright, pitch }, t);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDemo, selectHole]);

  // ── Cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.stop();
      rendererRef.current?.dispose();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      void ctxRef.current?.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05070d] text-foreground">
      {/* Glowing air-column canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-start justify-between gap-4 p-5">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Breath Flute
          </h1>
          <p className="mt-1 text-base text-foreground">
            Blow or hum into the tablet — the glowing air sings a real flute.
            Tap a big circle to pick a note.
          </p>
        </div>
        <Link
          href="/dream"
          className="shrink-0 rounded-full bg-muted px-4 py-2 text-base text-foreground hover:bg-accent"
        >
          ← back
        </Link>
      </div>

      {/* Status line */}
      <div className="relative z-10 px-5">
        {micState === "denied" && (
          <p className="text-base text-violet-300">
            No microphone — that&apos;s okay! Tap the holes to puff the flute,
            or just watch it play by itself.
          </p>
        )}
        {micState === "on" && (
          <p className="text-base text-muted-foreground">
            Listening… blow softly for a mellow note, harder for a brighter one.
          </p>
        )}
        {micState === "asking" && (
          <p className="text-base text-muted-foreground">Asking for the microphone…</p>
        )}
        {(micState === "idle" || !started) && started && (
          <p className="text-base text-muted-foreground">Tap a hole to play.</p>
        )}
      </div>

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-black/40 px-6 text-center backdrop-blur-sm">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Let me hear you
          </h2>
          <p className="max-w-md text-base text-foreground">
            Tap to wake the flute. Then blow or hum into the tablet, or tap the
            glowing holes.
          </p>
          <button
            onClick={start}
            className="min-h-[64px] min-w-[64px] rounded-full bg-gradient-to-r from-violet-400 to-violet-300 px-10 py-5 text-2xl font-semibold text-black shadow-lg transition hover:brightness-110 active:scale-95"
          >
            ▶ Start
          </button>
        </div>
      )}

      {/* Recorder-holes row */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 p-5">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-end justify-center gap-3 sm:gap-4">
          {SCALE_MIDI.map((midi, i) => {
            const isActive = activeHole === i;
            const size = 76 + (isActive ? 12 : 0);
            return (
              <button
                key={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  tapPuff(i);
                }}
                onPointerEnter={(e) => {
                  // dragging a finger across holes re-pitches while sounding
                  if (e.buttons > 0) {
                    noteInteraction();
                    selectHole(i);
                  }
                }}
                aria-label={`Note ${SCALE_NAMES[i]}`}
                className="flex select-none flex-col items-center justify-center rounded-full font-semibold text-black transition-[transform,box-shadow] active:scale-90"
                style={{
                  width: size,
                  height: size,
                  minWidth: 64,
                  minHeight: 64,
                  background: `radial-gradient(circle at 35% 30%, #ffffff 0%, ${HOLE_COLORS[i]} 55%, ${HOLE_COLORS[i]} 100%)`,
                  boxShadow: isActive
                    ? `0 0 28px 8px ${HOLE_COLORS[i]}`
                    : `0 0 14px 2px ${HOLE_COLORS[i]}55`,
                }}
              >
                <span className="text-xl">{SCALE_NAMES[i]}</span>
              </button>
            );
          })}
        </div>

        {/* Controls */}
        <div className="pointer-events-auto flex items-center gap-3 text-base text-muted-foreground">
          <button
            onClick={() => {
              noteInteraction();
              setAutoDemo((v) => !v);
            }}
            className="min-h-[44px] rounded-full bg-muted px-4 py-2 text-base text-foreground hover:bg-accent"
          >
            {autoDemo ? "Auto-play: on" : "Auto-play: off"}
          </button>
          <span className="hidden sm:inline">
            {started
              ? `${usingWorklet ? "worklet" : "fallback"} · ${
                  usingWebGL ? "webgl" : "canvas"
                } · ${Math.round(midiToHz(SCALE_MIDI[activeHole]))} Hz`
              : "G-Mixolydian flute"}
          </span>
        </div>
      </div>
    </main>
  );
}
