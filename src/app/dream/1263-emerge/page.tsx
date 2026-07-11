"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sampleArc, type ArcState } from "./arc";
import { buildRenderer, type Renderer } from "./renderer";
import { createJourneyAudio, type JourneyAudio } from "./audio";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import {
  createSafeFlicker,
  prefersReducedMotion,
  type SafeFlicker,
} from "../_shared/psych/safeFlicker";

// ~6 minutes — a genuine long-form arc, comfortably past the 5-min floor.
const TOTAL = 360;
const POINT_COUNT = 90_000;
// A gentle "forming body" preview so the canvas is beautiful (never blank) on load.
const PREVIEW_T = TOTAL * 0.24;
// Center of the dissolution — where "jump to peak" lands the reviewer.
const PEAK_T = TOTAL * 0.47;

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function EmergePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<JourneyAudio | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);

  const elapsedRef = useRef(0);
  const clockRef = useRef(0);
  const angleRef = useRef(0);
  const startedRef = useRef(false);
  const pausedRef = useRef(false);
  const neuralRef = useRef(0);

  const mic = useMicAnalyser({ smoothing: 0.7, gain: 1.4 });
  const getFrameRef = useRef(mic.getFrame);
  const micRunningRef = useRef(false);
  useEffect(() => {
    getFrameRef.current = mic.getFrame;
  }, [mic.getFrame]);
  useEffect(() => {
    micRunningRef.current = mic.running;
  }, [mic.running]);

  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [breath, setBreath] = useState(false);
  const [glError, setGlError] = useState<string | null>(null);
  const [hud, setHud] = useState<Pick<ArcState, "phaseName" | "journey" | "elapsed">>({
    phaseName: "Onset",
    journey: 0,
    elapsed: 0,
  });

  // Build renderer + run the master loop (always running so load is never blank).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: Renderer;
    try {
      renderer = buildRenderer(canvas, POINT_COUNT);
    } catch (e) {
      setGlError(
        e instanceof Error
          ? e.message
          : "WebGL2 is unavailable — this piece needs a WebGL2-capable browser."
      );
      return;
    }
    rendererRef.current = renderer;
    flickerRef.current = createSafeFlicker({ maxHz: 0.6, defaultHz: 0.3, floor: 0.78 });

    const reduced = prefersReducedMotion();
    let raf = 0;
    let cancelled = false;
    let last = performance.now();
    let hudAccum = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      return dpr;
    };

    const loop = (now: number) => {
      if (cancelled) return;
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(0.05, Math.max(0, dt));

      const motion = reduced ? 0.45 : 1;
      clockRef.current += dt * motion;
      angleRef.current += dt * (reduced ? 0.012 : 0.032);

      if (startedRef.current && !pausedRef.current) {
        elapsedRef.current = Math.min(TOTAL, elapsedRef.current + dt);
      }
      const t = startedRef.current ? elapsedRef.current : PREVIEW_T;

      // Optional mic "neural-gain": louder room deepens the dissolution.
      let target = 0;
      if (micRunningRef.current) {
        const f = getFrameRef.current();
        if (f) target = Math.min(1, f.amplitude * 1.4);
      }
      neuralRef.current += (target - neuralRef.current) * 0.05;

      const state = sampleArc(t, TOTAL, neuralRef.current);
      const flicker = flickerRef.current;
      const lum = flicker ? flicker.value(clockRef.current) : 1;
      const dpr = resize();

      renderer.draw(state, angleRef.current, clockRef.current, lum, dpr);

      const a = audioRef.current;
      if (a) a.update(state.intensity, state.dissolve, dt * motion);

      hudAccum += dt;
      if (hudAccum > 0.25) {
        hudAccum = 0;
        setHud({ phaseName: state.phaseName, journey: state.journey, elapsed: t });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Reflect mute/pause/breath into their subsystems.
  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    const f = flickerRef.current;
    if (!f) return;
    if (breath) f.enable();
    else f.disable();
  }, [breath]);

  // Teardown audio on unmount.
  useEffect(
    () => () => {
      audioRef.current?.close();
      audioRef.current = null;
    },
    []
  );

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        const a = createJourneyAudio();
        await a.resume();
        a.setMuted(muted);
        audioRef.current = a;
      } catch {
        // audio device may be absent (headless) — the visuals still run silently
      }
    }
    elapsedRef.current = 0;
    startedRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    setStarted(true);
  }, [muted]);

  const end = useCallback(() => {
    startedRef.current = false;
    elapsedRef.current = 0;
    audioRef.current?.close();
    audioRef.current = null;
    setStarted(false);
    setPaused(false);
  }, []);

  const jumpToPeak = useCallback(() => {
    if (!startedRef.current) {
      // start silently-armed audio so the peak actually sounds like the peak
      void begin();
    }
    startedRef.current = true;
    setStarted(true);
    elapsedRef.current = PEAK_T;
  }, [begin]);

  const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const frac = Number(e.target.value) / 1000;
    startedRef.current = true;
    setStarted(true);
    elapsedRef.current = frac * TOTAL;
  }, []);

  const toggleMic = useCallback(async () => {
    if (mic.running) mic.stop();
    else await mic.start();
  }, [mic]);

  return (
    <div className="relative w-full bg-black" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ background: "#02060a", touchAction: "none" }}
      />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="max-w-md rounded-lg border border-violet-300/30 bg-black/60 px-5 py-4 text-base text-violet-300">
            {glError}
          </p>
        </div>
      )}

      {/* Intro overlay — canvas already shows a forming luminous body behind it. */}
      {!started && !glError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 px-6 text-center backdrop-blur-[2px]">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.35em] text-violet-200/90">
            Resonance · dream 1263
          </p>
          <h1 className="mb-4 font-semibold text-3xl text-foreground md:text-5xl">Emerge</h1>
          <p className="mb-3 max-w-xl text-base leading-relaxed text-foreground md:text-lg">
            A drug-free psychedelic <em>journey</em> — one six-minute arc from
            stillness, through ego-dissolution, and softly back. A vast cloud of
            ninety thousand GPU particles condenses into a luminous body, then
            dissolves its own boundary into boundless light, then re-condenses.
          </p>
          <p className="mb-8 max-w-lg text-base leading-relaxed text-muted-foreground">
            Press begin and surrender. It runs itself; nothing to do but watch it
            evolve. A Shepard–Risset ascent climbs to the breakthrough. Optionally
            grant the mic for &ldquo;neural-gain&rdquo; — a louder room deepens the
            dissolution.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={begin}
              className="min-h-[44px] rounded-full border border-violet-200/40 bg-violet-200/10 px-8 py-2.5 text-base font-medium text-foreground transition hover:border-violet-200/80 hover:bg-violet-200/20"
            >
              Begin the journey
            </button>
            <button
              onClick={jumpToPeak}
              className="min-h-[44px] rounded-full border border-violet-200/30 px-6 py-2.5 text-base text-foreground transition hover:border-violet-200/70 hover:text-foreground"
            >
              Jump to the peak
            </button>
          </div>

          <a
            href="/dream/1263-emerge/README.md"
            target="_blank"
            rel="noreferrer"
            className="mt-6 text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Read the design notes
          </a>
          <Link href="/dream" className="mt-6 text-base text-muted-foreground hover:text-foreground">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* Running HUD + controls */}
      {started && !glError && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1 select-none">
            <span className="font-semibold text-xl text-foreground">Emerge</span>
            <span className="font-mono text-base text-violet-200/95">{hud.phaseName}</span>
            <span className="font-mono text-base text-muted-foreground">
              {mmss(hud.elapsed)} / {mmss(TOTAL)} · {(hud.journey * 100).toFixed(0)}%
            </span>
            {mic.running && (
              <span className="font-mono text-base text-violet-200/90">
                neural-gain · live
              </span>
            )}
          </div>

          <div className="absolute right-4 top-4 flex flex-col items-end gap-2 select-none">
            <div className="flex gap-2">
              <button
                onClick={() => setPaused((p) => !p)}
                className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition hover:border-border hover:text-foreground"
              >
                {paused ? "resume" : "pause"}
              </button>
              <button
                onClick={() => setMuted((m) => !m)}
                className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition hover:border-border hover:text-foreground"
              >
                {muted ? "unmute" : "mute"}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleMic}
                className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition hover:border-border hover:text-foreground"
              >
                {mic.running ? "mic off" : "neural-gain"}
              </button>
              <button
                onClick={() => setBreath((b) => !b)}
                className="min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition hover:border-border hover:text-foreground"
                title="A gentle, photosensitive-safe luminance breath (≤0.6 Hz, off by default)."
              >
                {breath ? "breath on" : "breath off"}
              </button>
            </div>
            <button
              onClick={end}
              className="min-h-[44px] rounded-full border border-violet-300/30 px-4 py-2.5 text-base text-violet-200/90 transition hover:border-violet-300/70 hover:text-violet-100"
            >
              stop
            </button>
          </div>

          {mic.error && (
            <p className="absolute right-4 top-56 max-w-xs rounded border border-violet-300/30 px-3 py-2 text-base text-violet-300/95">
              {mic.error} — the journey keeps running on its own.
            </p>
          )}

          {/* Phase scrubber — leap anywhere in the arc; default is the full run. */}
          <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-6 select-none">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round((hud.elapsed / TOTAL) * 1000)}
              onChange={onScrub}
              aria-label="Journey scrubber"
              className="h-2 w-full max-w-3xl cursor-pointer appearance-none rounded-full bg-muted accent-violet-300"
            />
            <div className="flex w-full max-w-3xl justify-between font-mono text-base text-muted-foreground">
              <span>onset</span>
              <span>come-up</span>
              <button onClick={jumpToPeak} className="text-violet-200/90 hover:text-violet-100">
                peak ↑
              </button>
              <span>plateau</span>
              <span>return</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
