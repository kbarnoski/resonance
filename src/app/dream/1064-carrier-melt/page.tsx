"use client";

// 1064-carrier-melt — "Carrier Melt".
// Karel's REAL solo-piano recording is the carrier wave that melts the visual
// field — and YOU sculpt the melt with your hand. His recording plays as the
// structural spine (FFT-analysed → drives a log-polar / form-constant domain
// warp + Canvas2D feedback trails). Your pointer/touch is the instrument:
// position moves the warp focus, SPEED raises warp gain + saturation. The music
// guides the journey; the hand decides intensity and where the melt focuses.
//
// Refs: Kaelen, "The hidden therapist" (Imperial 2018) — music as the carrier
// wave in psychedelic therapy; Bressloff–Cowan / Klüver form-constants log-polar
// warp. See README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioSourceKind,
  CarrierGraph,
  fetchPianoBuffer,
  readEnergy,
  renderFallbackBuffer,
  startCarrier,
} from "./audio";
import { createMeltRenderer, MeltRenderer } from "./render";

type Phase = "idle" | "loading" | "ready" | "error";

// Pointer state held in a ref so the render loop reads it without re-rendering.
interface PointerState {
  x: number; // [0,1]
  y: number; // [0,1]
  speed: number; // smoothed pointer speed [0,1]
  lastX: number;
  lastY: number;
  lastT: number;
  active: boolean; // pointer currently down / present
}

export default function CarrierMeltPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceKind, setSourceKind] = useState<AudioSourceKind | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [playing, setPlaying] = useState(false);
  // ~8fps mirror of the live drivers, for the on-screen meter.
  const [meter, setMeter] = useState({ bass: 0, mid: 0, high: 0, warp: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MeltRenderer | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const carrierRef = useRef<CarrierGraph | null>(null);
  const rafRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  const pointerRef = useRef<PointerState>({
    x: 0.5,
    y: 0.5,
    speed: 0,
    lastX: 0.5,
    lastY: 0.5,
    lastT: 0,
    active: false,
  });

  // ─── Reduced-motion preference ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ─── Renderer init — field is alive immediately on mount ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: MeltRenderer;
    try {
      renderer = createMeltRenderer(canvas);
    } catch (e) {
      setStatusMsg("Visual backend failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }
    rendererRef.current = renderer;
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ─── Pointer / touch = the instrument ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const update = (clientX: number, clientY: number, active: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const p = pointerRef.current;
      const now = performance.now();
      const dt = Math.max(1, now - p.lastT);
      const dist = Math.hypot(x - p.lastX, y - p.lastY);
      // Speed in canvas-fractions/ms → normalized; smoothed.
      const instSpeed = Math.min(1, (dist / dt) * 220);
      p.speed += (instSpeed - p.speed) * 0.25;
      p.x = x;
      p.y = y;
      p.lastX = x;
      p.lastY = y;
      p.lastT = now;
      p.active = active;
    };

    const onMove = (e: PointerEvent) => {
      update(e.clientX, e.clientY, e.pointerType !== "mouse" ? e.pressure > 0 : true);
    };
    const onDown = (e: PointerEvent) => update(e.clientX, e.clientY, true);
    const onUp = () => {
      pointerRef.current.active = false;
    };

    canvas.addEventListener("pointermove", onMove, { passive: true });
    canvas.addEventListener("pointerdown", onDown, { passive: true });
    canvas.addEventListener("pointerup", onUp, { passive: true });
    canvas.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ─── The draw loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const start = performance.now();
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const renderer = rendererRef.current;
      if (!renderer) return;
      const p = pointerRef.current;
      const now = performance.now();
      const timeSec = (now - start) / 1000;

      // Pointer speed bleeds off when still so a calm hand = calm drift.
      if (now - p.lastT > 90) p.speed += (0 - p.speed) * 0.12;

      const carrier = carrierRef.current;
      const energy = carrier
        ? readEnergy(carrier)
        : { bass: 0, mid: 0, high: 0, loudness: 0 };

      // Warp gain: pointer speed is the dominant term (the instrument), with a
      // floor from loudness so loud passages always show some melt.
      const warpGain = Math.min(1, p.speed * 0.85 + energy.loudness * 0.3 + 0.05);
      const saturation = Math.min(1, p.speed * 0.7 + energy.loudness * 0.6);

      renderer.render({
        energy,
        focusX: p.x,
        focusY: p.y,
        warpGain,
        saturation,
        timeSec,
        reducedMotion,
      });

      // Throttled meter readout (~8fps).
      if (Math.floor(timeSec * 8) !== Math.floor((timeSec - 0.016) * 8)) {
        setMeter({ bass: energy.bass, mid: energy.mid, high: energy.high, warp: warpGain });
      }
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [reducedMotion]);

  // ─── Begin: open AudioContext on the gesture, load carrier, play ───────────
  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "ready") return;
    setPhase("loading");
    setStatusMsg("opening audio context");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) {
      setPhase("error");
      setStatusMsg("Web Audio API is unavailable in this browser.");
      return;
    }
    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* gesture should cover this */
      }
    }

    // 1. Try Karel's real recording; else synthesize the fallback drone.
    let buffer: AudioBuffer | null = null;
    let kind: AudioSourceKind = "fallback";
    setStatusMsg("fetching Karel's recording");
    try {
      buffer = await fetchPianoBuffer(ctx);
      if (buffer) kind = "piano";
    } catch {
      buffer = null;
    }
    if (!buffer) {
      setStatusMsg("recording unavailable — synthesizing fallback drone");
      try {
        buffer = await renderFallbackBuffer(ctx.sampleRate);
        kind = "fallback";
      } catch {
        setPhase("error");
        setStatusMsg("Audio synthesis failed — your browser may not support OfflineAudioContext.");
        return;
      }
    }

    try {
      carrierRef.current = startCarrier(ctx, buffer, kind);
    } catch (e) {
      setPhase("error");
      setStatusMsg("Playback failed: " + (e instanceof Error ? e.message : String(e)));
      return;
    }

    setSourceKind(kind);
    setStatusMsg(null);
    setPlaying(true);
    setPhase("ready");
  }, [phase]);

  // ─── Play / pause (suspend the context; visuals keep drifting) ─────────────
  const togglePlay = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (ctx.state === "running") {
      void ctx.suspend();
      setPlaying(false);
    } else {
      void ctx.resume();
      setPlaying(true);
    }
  }, []);

  const sourceLabel =
    sourceKind === "piano"
      ? "Karel's piano (real recording)"
      : "fallback drone (recording unavailable)";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060a] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Carrier Melt visual field — drag to sculpt the melt"
      />

      {/* Design-notes corner link */}
      <a
        href="/dream/1064-carrier-melt/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute right-4 top-4 z-20 font-mono text-sm text-white/75 underline decoration-white/40 underline-offset-4 hover:text-white"
      >
        Read the design notes ↗
      </a>

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        {/* Header */}
        <header className="pointer-events-auto max-w-2xl">
          <h1 className="font-serif text-2xl tracking-tight text-white md:text-4xl">
            Carrier Melt
          </h1>
          <p className="mt-2 text-base text-white/75">
            Karel&apos;s real piano is the carrier wave that melts the field. The
            music guides the journey; <span className="text-violet-300">your hand</span> decides
            the intensity — drag across the field to move the melt focus, and drag{" "}
            <em>faster</em> to melt harder.
          </p>

          {sourceKind && (
            <p className="mt-2 font-mono text-sm">
              source:{" "}
              <span className={sourceKind === "piano" ? "text-emerald-300" : "text-amber-300"}>
                {sourceLabel}
              </span>
            </p>
          )}
          {statusMsg && phase !== "error" && (
            <p className="mt-2 text-base text-violet-300">{statusMsg}</p>
          )}
          {phase === "error" && statusMsg && (
            <p className="mt-2 text-base text-rose-300">{statusMsg}</p>
          )}
          {reducedMotion && (
            <p className="mt-2 text-base text-white/75">
              reduced-motion respected — the melt drifts gently.
            </p>
          )}
        </header>

        {/* Center: Begin / loading */}
        <section className="pointer-events-auto flex flex-col items-start gap-3">
          {phase === "idle" && (
            <button
              onClick={() => void begin()}
              className="min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-100 hover:bg-violet-500/30"
            >
              Begin · let the piano melt the field
            </button>
          )}
          {phase === "loading" && (
            <p className="font-mono text-sm text-violet-300">
              {statusMsg ?? "loading"}…
            </p>
          )}
          {phase === "error" && (
            <button
              onClick={() => {
                setPhase("idle");
                setStatusMsg(null);
              }}
              className="min-h-[44px] rounded-md border border-rose-400/40 bg-rose-500/20 px-4 py-2.5 text-base font-medium text-rose-100 hover:bg-rose-500/30"
            >
              Try again
            </button>
          )}
        </section>

        {/* Footer: live readout + transport */}
        {phase === "ready" && (
          <footer className="pointer-events-auto flex flex-col gap-3">
            <p className="max-w-2xl text-base text-white/75">
              Hold still for calm cosmic drift; drag fast and frantic for peak
              melt. Bass swells the flow, mids sharpen the trails, highs spark the
              fine ripples — your speed sets the gain.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={togglePlay}
                className="min-h-[44px] rounded-md bg-white/10 px-4 py-2.5 text-base text-white/95 hover:bg-white/15"
              >
                {playing ? "pause" : "play"}
              </button>
              {/* Live driver meters */}
              <div className="flex items-center gap-3 font-mono text-sm text-white/75">
                <Meter label="bass" v={meter.bass} hue="text-rose-300" />
                <Meter label="mid" v={meter.mid} hue="text-emerald-300" />
                <Meter label="high" v={meter.high} hue="text-sky-300" />
                <Meter label="warp" v={meter.warp} hue="text-violet-300" />
              </div>
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}

function Meter({ label, v, hue }: { label: string; v: number; hue: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={hue}>{label}</span>
      <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-white/70"
          style={{ width: `${Math.round(Math.min(1, v) * 100)}%` }}
        />
      </span>
    </span>
  );
}
