"use client";

// ════════════════════════════════════════════════════════════════════════════
// GENDY (1203)
//
// THE ONE QUESTION: "What if the waveform itself were alive — a jagged polygon
// whose every corner drifts by a random walk, and you could tune how much order
// vs. chaos it holds?"
//
// VOICE: Iannis Xenakis's Dynamic Stochastic Synthesis (GENDYN). The waveform is
// a set of breakpoints (duration, amplitude); each completed cycle every
// breakpoint is nudged by a bounded random walk (elastic mirror barriers). Small
// steps + tight barriers => a nearly periodic pitched tone; large steps => a
// gritty living roar. Runs in an AudioWorklet, with a ScriptProcessor fallback so
// it always sings. New-to-lab synthesis voice (never used stochastic waveforms).
//
// INPUT: drag the field — up/right tightens toward a pure tone and raises the
// pitch region, down/left dissolves it into stochastic roughness.
//
// OUTPUT: WebGL2 oscilloscope — the living breakpoint polygon as a glowing
// filament over a fading afterimage field, deep-teal ground, electric-violet →
// amber by chaos. Canvas2D fallback. See README.md.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { GendyEngine, type WaveSnapshot } from "./gendy-core";
import { GendyRenderer, type RendererMode } from "./gendy-renderer";
import { WORKLET_SOURCE } from "./worklet-source";

type Phase = "idle" | "running" | "paused";

const N_BREAK = 12;
const SEED = 20260705;
const MULTS = [0.5, 1.0, 2.0];
const GAINS = [0.5, 0.7, 0.34];

/** base pitch (Hz) from a 0..1 horizontal position: ~40 → ~197 Hz */
function pitchFromX(nx: number): number {
  return 40 * Math.pow(2, nx * 2.3);
}

export default function GendyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rendererMode, setRendererMode] = useState<RendererMode | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ chaos: 35, hz: 55 });

  const rendererRef = useRef<GendyRenderer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptRef = useRef<ScriptProcessorNode | null>(null);
  const engineRef = useRef<GendyEngine | null>(null);

  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const autoTRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  // live wave snapshot for the visuals
  const waveRef = useRef<WaveSnapshot>({
    amp: new Float32Array(N_BREAK),
    dur: new Float32Array(N_BREAK).fill(1),
    level: 0,
    chaos: 0.35,
  });

  // input / control state
  const pointerRef = useRef<{ nx: number; ny: number; active: boolean }>({
    nx: 0.5,
    ny: 0.5,
    active: false,
  });
  const tgtChaosRef = useRef<number>(0.35);
  const tgtBaseRef = useRef<number>(55);
  const smChaosRef = useRef<number>(0.35);
  const smBaseRef = useRef<number>(55);
  const sentChaosRef = useRef<number>(-1);
  const sentBaseRef = useRef<number>(-1);
  const readoutTRef = useRef<number>(0);

  // resolve a pointer event into normalised canvas coordinates
  const setPointerFromEvent = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height)));
    pointerRef.current.nx = nx;
    pointerRef.current.ny = ny;
    // horizontal → pitch region; diagonal (up + right) → order (low chaos)
    tgtBaseRef.current = pitchFromX(nx);
    const order = 0.5 * (1 - ny) + 0.5 * nx;
    let chaos = 1 - order;
    if (reducedRef.current) chaos = Math.min(0.5, chaos);
    tgtChaosRef.current = Math.max(0, Math.min(1, chaos));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!runningRef.current) return;
      pointerRef.current.active = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setPointerFromEvent(e);
    },
    [setPointerFromEvent],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointerRef.current.active) return;
      setPointerFromEvent(e);
    },
    [setPointerFromEvent],
  );
  const onPointerUp = useCallback(() => {
    pointerRef.current.active = false;
  }, []);

  const sendControls = useCallback((chaos: number, base: number) => {
    const node = nodeRef.current;
    if (node) node.port.postMessage({ type: "ctrl", chaos, base });
    const engine = engineRef.current;
    if (engine) {
      engine.setChaos(chaos);
      engine.setBase(base);
    }
  }, []);

  const stopEverything = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const node = nodeRef.current;
    if (node) {
      node.port.onmessage = null;
      try {
        node.disconnect();
      } catch {
        /* already gone */
      }
    }
    nodeRef.current = null;
    const script = scriptRef.current;
    if (script) {
      script.onaudioprocess = null;
      try {
        script.disconnect();
      } catch {
        /* already gone */
      }
    }
    scriptRef.current = null;
    engineRef.current = null;
    const master = masterRef.current;
    if (master) {
      try {
        master.disconnect();
      } catch {
        /* already gone */
      }
    }
    masterRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  // keep the canvas sized and guard against WebGL context loss
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    const canvas = canvasRef.current;
    const onLost = (e: Event) => e.preventDefault();
    canvas?.addEventListener("webglcontextlost", onLost);
    return () => {
      window.removeEventListener("resize", onResize);
      canvas?.removeEventListener("webglcontextlost", onLost);
    };
  }, []);

  // full teardown on unmount
  useEffect(() => {
    return () => stopEverything();
  }, [stopEverything]);

  const runFrame = useCallback(
    (now: number) => {
      if (!runningRef.current) return;
      const dt = Math.min(0.05, (now - lastRef.current) / 1000);
      lastRef.current = now;
      const speed = reducedRef.current ? 0.5 : 1;
      autoTRef.current += dt * speed;

      // resolve targets: active drag overrides, otherwise the field breathes
      if (!pointerRef.current.active) {
        const t = autoTRef.current;
        const breathe = reducedRef.current ? 0.09 : 0.16;
        tgtChaosRef.current = 0.36 + breathe * Math.sin(t * 0.33);
        tgtBaseRef.current = smBaseRef.current * (1 + 0.03 * Math.sin(t * 0.21));
      }

      // smooth the control stream so nothing clicks
      smChaosRef.current += (tgtChaosRef.current - smChaosRef.current) * 0.06;
      smBaseRef.current += (tgtBaseRef.current - smBaseRef.current) * 0.05;

      // push to the sound engine only on meaningful change
      if (
        Math.abs(smChaosRef.current - sentChaosRef.current) > 0.002 ||
        Math.abs(smBaseRef.current - sentBaseRef.current) > 0.15
      ) {
        sendControls(smChaosRef.current, smBaseRef.current);
        sentChaosRef.current = smChaosRef.current;
        sentBaseRef.current = smBaseRef.current;
      }

      // in fallback mode the visuals read straight from the engine
      const engine = engineRef.current;
      if (engine) waveRef.current = engine.snapshot();

      // draw the living waveform (live chaos drives colour so it stays responsive)
      const renderer = rendererRef.current;
      if (renderer) {
        const w = waveRef.current;
        renderer.setWave({
          amp: w.amp,
          dur: w.dur,
          level: w.level,
          chaos: smChaosRef.current,
        });
        renderer.frame();
      }

      // throttle the numeric readout to ~6 Hz
      readoutTRef.current += dt;
      if (readoutTRef.current > 0.16) {
        readoutTRef.current = 0;
        setReadout({
          chaos: Math.round(smChaosRef.current * 100),
          hz: Math.round(smBaseRef.current),
        });
      }

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [sendControls],
  );

  const handleBegin = useCallback(async () => {
    if (runningRef.current) return;
    setAudioError(null);
    setUsingFallback(false);

    reducedRef.current =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound.");
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Try the button again.");
      return;
    }
    ctxRef.current = ctx;

    // master chain: gain (ramped from 0) → lowpass → compressor/limiter → out
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.24, ctx.currentTime + 1.4);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 8200;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 6;
    comp.ratio.value = 12;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(lp).connect(comp).connect(ctx.destination);
    masterRef.current = master;

    const base = tgtBaseRef.current;
    const hasWorklet =
      typeof ctx.audioWorklet !== "undefined" &&
      typeof AudioWorkletNode !== "undefined";

    let workldone = false;
    if (hasWorklet) {
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      try {
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, "gendy-processor", {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: { n: N_BREAK, base, seed: SEED, mults: MULTS, gains: GAINS },
        });
        node.port.onmessage = (e) => {
          const d = e.data;
          if (d && d.type === "wave") {
            waveRef.current = {
              amp: d.amp as Float32Array,
              dur: d.dur as Float32Array,
              level: d.level as number,
              chaos: d.chaos as number,
            };
          }
        };
        node.connect(master);
        nodeRef.current = node;
        workldone = true;
      } catch {
        workldone = false;
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    if (!workldone) {
      // ── ScriptProcessor fallback so it always makes sound ──
      setUsingFallback(true);
      const engine = new GendyEngine(ctx.sampleRate, N_BREAK, base, SEED, MULTS, GAINS);
      engineRef.current = engine;
      const script = ctx.createScriptProcessor(1024, 1, 2);
      script.onaudioprocess = (e) => {
        const out = e.outputBuffer;
        const l = out.getChannelData(0);
        engine.render(l);
        if (out.numberOfChannels > 1) out.getChannelData(1).set(l);
      };
      script.connect(master);
      scriptRef.current = script;
    }

    // renderer
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = new GendyRenderer(canvas);
      rendererRef.current = renderer;
      setRendererMode(renderer.mode);
    }

    // prime the controls
    sentChaosRef.current = -1;
    sentBaseRef.current = -1;
    sendControls(smChaosRef.current, smBaseRef.current);

    runningRef.current = true;
    setPhase("running");
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame, sendControls]);

  const handlePause = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    const master = masterRef.current;
    const ctx = ctxRef.current;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    }
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    if (runningRef.current || phase !== "paused") return;
    const master = masterRef.current;
    const ctx = ctxRef.current;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.24, ctx.currentTime, 0.2);
    }
    runningRef.current = true;
    setPhase("running");
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [phase, runFrame]);

  const handleStop = useCallback(() => {
    stopEverything();
    setPhase("idle");
    setRendererMode(null);
  }, [stopEverything]);

  return (
    <main className="relative min-h-screen w-full touch-none overflow-hidden bg-[#06131a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden
      />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)] sm:text-3xl">
          Gendy
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
          A waveform that is alive — a jagged polygon whose every corner drifts by
          a random walk. Hold it, and calm it to a pure tone or unleash it into
          stochastic grit.
        </p>
      </header>

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-black/45 px-8 py-7 text-center backdrop-blur-md">
            <p className="max-w-md text-base text-foreground">
              Iannis Xenakis&rsquo;s dynamic stochastic synthesis: the sound is
              drawn directly by a set of breakpoints that random-walk between
              elastic barriers. Drag up/right to tighten toward a pitched tone,
              down/left to let it dissolve.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] rounded-full bg-violet-300/90 px-4 py-2.5 text-base font-medium text-[#1a0a1a] shadow-lg transition-colors hover:bg-violet-200"
            >
              Begin
            </button>
            <p className="text-base text-muted-foreground">
              Sound + motion start on this tap. Then drag anywhere on the field.
            </p>
            {audioError && (
              <p className="max-w-sm text-base text-violet-300">{audioError}</p>
            )}
          </div>
        </div>
      )}

      {/* running / paused controls */}
      {phase !== "idle" && (
        <div className="absolute bottom-16 left-1/2 z-10 w-[min(94vw,640px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-black/50 px-5 py-4 backdrop-blur-md">
            <div className="min-w-[200px] flex-1">
              <div className="text-base font-medium text-foreground">
                {phase === "paused" ? "Paused" : "Holding the living wave"}
              </div>
              <div className="mt-1 font-mono text-base text-muted-foreground">
                chaos {readout.chaos}% · {readout.hz} Hz
                {rendererMode === "canvas2d" ? " · canvas2d" : ""}
                {usingFallback ? " · scriptnode" : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {phase === "running" ? (
                <button
                  onClick={handlePause}
                  className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={handleResume}
                  className="min-h-[44px] rounded-full bg-violet-300/90 px-4 py-2.5 text-base font-medium text-[#1a0a1a] transition-colors hover:bg-violet-200"
                >
                  Resume
                </button>
              )}
              <button
                onClick={handleStop}
                className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                Stop
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-base text-muted-foreground">
            drag the field · up/right = order, down/left = chaos · left↔right = pitch
          </p>
        </div>
      )}

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base font-medium text-foreground backdrop-blur-md transition-colors hover:bg-black/60"
      >
        Read the design notes
      </button>
      {showNotes && (
        <div className="absolute right-4 top-20 z-30 w-[min(92vw,440px)] rounded-2xl border border-border bg-black/70 p-5 text-base text-foreground backdrop-blur-md">
          <p className="mb-2 font-serif text-xl text-foreground">A waveform that walks</p>
          <p className="mb-2">
            The tone is not sampled or oscillated — it is <em>drawn</em>. A dozen
            breakpoints define one cycle; after every cycle each breakpoint&rsquo;s
            amplitude and duration take a random step, reflecting off elastic
            mirror barriers so the shape stays bounded but never repeats. Tiny
            steps &amp; tight barriers give a nearly periodic pitched tone; wide
            ones give Xenakis&rsquo;s gritty stochastic roar.
          </p>
          <p className="mb-2 text-muted-foreground">
            Three voices at different registers add body. The glowing filament is
            the actual current waveform; the fading afterimage field is the walk
            itself, made visible. Colour tracks chaos: cool violet when calm, hot
            amber when unleashed. Master limiter, gain ramped from zero, hard
            amplitude clamp — no strobe, slow luminance only.
          </p>
          <p className="text-muted-foreground">
            Refs: Iannis Xenakis, <em>GENDY3</em> (1991) &amp; <em>Formalized
            Music</em>; Peter Hoffmann&rsquo;s analysis of GENDYN; Nick Collins /
            Andrew Brown realtime implementations; the GendyJS Web Audio proof of
            concept. New-to-lab: GENDYN as a waveform voice has not been built
            here before.
          </p>
          <div className="mt-3">
            <Link href="/dream" className="text-violet-300 underline hover:text-violet-200">
              ← back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
