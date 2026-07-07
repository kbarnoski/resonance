"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loom, setupCanvas } from "./loom";
import {
  WeaveAudio,
  fetchPianoBuffer,
  renderFallbackBuffer,
} from "./audio";

/**
 * 1246 · warp
 *
 * Karel's real solo-piano recording weaves itself into a living textile. A
 * Canvas2D loom lays one vertical weft column per shuttle pass; each of 48
 * horizontal warp threads is a log-frequency band (bass low, treble high).
 * Band energy from a real AnalyserNode sets each pick's colour, weight and
 * weave (plain when quiet, twill when busy), so the cloth records the music's
 * dynamics as denser/brighter regions. The fell line advances rightward and
 * the finished cloth scrolls left — it is never blank.
 *
 * Reference: Carsten Nicolai / Alva Noto × HOSOO, WAVE WEAVE (Kyoto 2025–26) —
 * sound made into fabric so the cloth is an analog recording of the music.
 * This is the live, generative inverse. See also Anni Albers, On Weaving (1965).
 */

const BANDS = 48;
const PICK_W = 11;
const TICK_MS = 110; // one shuttle pass ~ every 110ms

type Phase = "idle" | "loading" | "weaving";
type Source = "recording" | "fallback" | null;

export default function WarpPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const loomRef = useRef<Loom | null>(null);
  const engineRef = useRef<WeaveAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  const energiesRef = useRef<Float32Array>(new Float32Array(BANDS));
  const weavingRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>(null);
  const [paused, setPaused] = useState(false);
  const [picks, setPicks] = useState(0);

  // ── Set up the bare warped loom immediately (never blank before audio) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const cssW = Math.max(320, Math.min(880, Math.floor(wrap.clientWidth)));
    const cssH = Math.round(cssW * 0.6);
    const ctx = setupCanvas(canvas, cssW, cssH);
    if (!ctx) return;
    loomRef.current = new Loom(ctx, cssW, cssH, BANDS, PICK_W);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      void engineRef.current?.dispose();
    };
  }, []);

  const frame = useCallback(() => {
    const now = performance.now();
    const dt = now - lastRef.current;
    lastRef.current = now;

    if (weavingRef.current && loomRef.current && engineRef.current) {
      accRef.current += dt;
      const interval = reducedRef.current ? TICK_MS * 1.8 : TICK_MS;
      // lay at most a couple passes per frame to catch up after stalls
      let passes = 0;
      while (accRef.current >= interval && passes < 3) {
        accRef.current -= interval;
        engineRef.current.getBandEnergies(energiesRef.current);
        loomRef.current.weave(energiesRef.current);
        passes++;
      }
      if (passes > 0) setPicks(loomRef.current.stats().picks);
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "loading" || phase === "weaving") return;
    setPhase("loading");

    const engine = new WeaveAudio();
    engineRef.current = engine;

    // Try Karel's real recording; fall back to a local piano sketch.
    let buffer = await fetchPianoBuffer(engine.ctx);
    if (buffer) {
      setSource("recording");
    } else {
      buffer = await renderFallbackBuffer(engine.ctx.sampleRate);
      setSource("fallback");
    }

    await engine.start(buffer);
    weavingRef.current = true;
    setPaused(false);
    setPhase("weaving");

    lastRef.current = performance.now();
    accRef.current = 0;
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(frame);
  }, [phase, frame]);

  const togglePause = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine || phase !== "weaving") return;
    const nowPaused = await engine.togglePause();
    weavingRef.current = !nowPaused;
    setPaused(nowPaused);
  }, [phase]);

  const statusText =
    phase === "idle"
      ? "the loom is warped and waiting"
      : phase === "loading"
        ? "threading the shuttle…"
        : source === "recording"
          ? "weaving Karel's recording"
          : "network unavailable — weaving a local piano sketch";

  return (
    <main
      className="min-h-screen w-full px-5 py-8 sm:px-8"
      style={{ background: "#d8ccb4" }}
    >
      <div className="mx-auto flex max-w-[920px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            1246 · warp
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-stone-700">
            Karel&rsquo;s piano weaves itself into cloth — each shuttle pass reads
            the live spectrum and lays a row of dyed picks, so the finished
            tapestry is a record of the music&rsquo;s dynamics.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={begin}
            disabled={phase === "loading" || phase === "weaving"}
            className="min-h-[44px] rounded-md bg-stone-900 px-4 py-2.5 text-base font-medium text-[#e9e0cf] transition hover:bg-stone-800 disabled:opacity-45"
          >
            {phase === "weaving"
              ? "weaving"
              : phase === "loading"
                ? "loading…"
                : "Begin weaving"}
          </button>

          <button
            type="button"
            onClick={togglePause}
            disabled={phase !== "weaving"}
            className="min-h-[44px] rounded-md border border-stone-500 px-4 py-2.5 text-base font-medium text-stone-900 transition hover:bg-stone-900/10 disabled:opacity-40"
          >
            {paused ? "Resume" : "Pause"}
          </button>

          <span
            className="text-base text-stone-700"
            role="status"
            aria-live="polite"
          >
            {statusText}
            {phase === "weaving" ? ` · ${picks} picks` : ""}
          </span>
        </div>

        <div
          ref={wrapRef}
          className="w-full overflow-hidden rounded-lg shadow-[0_2px_18px_rgba(60,45,30,0.28)] ring-1 ring-stone-900/15"
        >
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            aria-label="A woven textile generated from the piano recording"
          />
        </div>

        <details className="max-w-2xl text-base text-stone-700">
          <summary className="cursor-pointer font-medium text-stone-900">
            Design notes
          </summary>
          <div className="mt-3 flex flex-col gap-3 leading-relaxed">
            <p>
              <strong>The question.</strong> What if Karel&rsquo;s recording wove
              itself into a living textile — sound as cloth you can watch grow,
              thread by thread?
            </p>
            <p>
              <strong>How it works.</strong> 48 horizontal <em>warp</em> threads
              each hold one log-frequency band (bass at the bottom, treble at the
              top). Every ~110ms a shuttle pass reads
              <code className="rounded bg-stone-900/10 px-1">
                {" "}
                AnalyserNode.getFloatFrequencyData
              </code>{" "}
              and lays a vertical <em>weft</em> column: a loud band weaves a
              thick, saturated pick; a quiet one stays near-linen. Over/under
              interlace is plain weave when a band is calm and tips into a 2/2
              twill (diagonal floats) when it&rsquo;s busy, so dense passages grow
              visible texture. The fell line advances rightward; at the edge the
              cloth scrolls left.
            </p>
            <p>
              <strong>Dyes.</strong> Natural-dye register on unbleached linen —
              walnut, indigo, madder red, weld ochre; warp in dark ink. No neon.
            </p>
            <p>
              <strong>Reference.</strong> Carsten Nicolai / Alva Noto × HOSOO,{" "}
              <em>WAVE WEAVE / Sono Obi Landscape</em> (Kyoto, Nov 2025–Mar 2026),
              where music becomes fabric so &ldquo;the fabric functions as an
              analog recording medium.&rdquo; This is the live, generative
              inverse. See also Anni Albers, <em>On Weaving</em> (1965).
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
