"use client";

// 1234-almanac — a slow ALMANAC OF THE HOURS built from Karel's short piano
// recording. The recording is a grain corpus; a granular time-stretch engine
// crawls through it while a long-form arc state machine walks a slow "day"
// through eight canonical hours (Matins → Compline). Density, transposition,
// layering, register and brightness evolve continuously, so the texture at
// minute 5 is genuinely not the texture at minute 1 — and it keeps going, drift-
// varying each new day, with no hard loop point. The page itself is a turning
// pastel day-dial you watch shift from dawn to dusk.
//
// Resurrects the long-standing ⭐ idea 1162-loom-of-hours.
// References: the canonical hours / Liturgy of the Hours; granular time-
// stretching — Curtis Roads, "Microsound" (2001).

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPianoBuffer, renderFallbackBuffer } from "./audio";
import { ArcController } from "./arc";
import { GranularEngine } from "./engine";
import { AlmanacViz } from "./viz";

type Source = "piano" | "fallback" | null;

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const vizRef = useRef<AlmanacViz | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<GranularEngine | null>(null);
  const arcRef = useRef<ArcController>(new ArcController());
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);
  const loadingRef = useRef<boolean>(false);
  const deepenRef = useRef<number>(0);
  const uiTickRef = useRef<number>(0);
  const draggingRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<Source>(null);
  const [hourName, setHourName] = useState("Matins");
  const [caption, setCaption] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [day, setDay] = useState(0);
  const [deepen, setDeepen] = useState(0);

  // Mount: build the dial and run a resting render loop immediately so the page
  // is never blank. The arc + audio only advance once "Begin the day" is pressed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viz = new AlmanacViz(canvas);
    vizRef.current = viz;

    const onResize = () => viz.resize();
    window.addEventListener("resize", onResize);

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;
      const v = vizRef.current;
      if (!v) return;

      if (runningRef.current) {
        const state = arcRef.current.advance(dt);
        const engine = engineRef.current;
        if (engine) {
          engine.setParams(state);
          engine.tick(dt);
          if (state.hourChanged) engine.ringHour(state.register);
        }
        const level = engine ? engine.level() : 0;
        v.render(state, level, dt);

        uiTickRef.current += dt;
        if (uiTickRef.current > 0.2) {
          uiTickRef.current = 0;
          setHourName(state.hourName);
          setCaption(state.caption);
          setElapsed(state.elapsed);
          setDay(state.day);
        }
      } else {
        // Idle: draw the dawn dial without advancing time.
        const state = arcRef.current.advance(0);
        v.render(state, 0, dt);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      engineRef.current?.dispose();
      engineRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      vizRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (runningRef.current || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      loadingRef.current = false;
      setLoading(false);
      return;
    }
    const ctx = new Ctor();
    ctxRef.current = ctx;
    await ctx.resume().catch(() => {});

    let buffer = await fetchPianoBuffer(ctx);
    let src: Source = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer();
      src = "fallback";
    }

    const engine = new GranularEngine(ctx, buffer);
    engineRef.current = engine;
    arcRef.current.reset();
    arcRef.current.deepen = deepenRef.current;
    engine.start();

    runningRef.current = true;
    loadingRef.current = false;
    setLoading(false);
    setStarted(true);
    setSource(src);
  }, []);

  // Drag the sun around the dial to skip to an hour.
  const seekFromPointer = useCallback((clientX: number, clientY: number) => {
    const viz = vizRef.current;
    const canvas = canvasRef.current;
    if (!viz || !canvas || !runningRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const dx = clientX - rect.left - viz.center.x;
    const dy = clientY - rect.top - viz.center.y;
    const ang = Math.atan2(dy, dx);
    const fraction = (((ang + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
    arcRef.current.seek(fraction);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      draggingRef.current = true;
      seekFromPointer(e.clientX, e.clientY);
    },
    [started, seekFromPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!started || !draggingRef.current) return;
      seekFromPointer(e.clientX, e.clientY);
    },
    [started, seekFromPointer],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const onDeepen = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setDeepen(v);
    deepenRef.current = v / 100;
    arcRef.current.deepen = v / 100;
  }, []);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#efe9f2] text-slate-800">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 w-full p-6 sm:p-8">
        <h1 className="font-serif text-3xl italic text-slate-800 sm:text-4xl">
          Almanac
        </h1>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-700">
          Karel&rsquo;s short piano becomes a slow almanac of the hours — one
          granular day drifting from Matins to Compline, genuinely different at
          minute five than at minute one.
        </p>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 w-full p-6 sm:p-8">
        {!started ? (
          <button
            onClick={begin}
            disabled={loading}
            className="pointer-events-auto min-h-[44px] rounded-full border border-slate-400/60 bg-white/70 px-4 py-2.5 text-base font-medium text-slate-800 shadow-sm backdrop-blur transition hover:bg-white/90 disabled:opacity-60"
          >
            {loading ? "loading Karel's piano…" : "Begin the day"}
          </button>
        ) : (
          <div className="pointer-events-auto flex max-w-xl flex-col gap-3">
            <div className="text-base text-slate-800">
              <span className="font-serif text-lg italic">{hourName}</span>
              <span className="text-slate-600">
                {"  ·  "}
                {mm}:{ss.toString().padStart(2, "0")}
                {"  ·  day "}
                {day + 1}
                {"  ·  "}
                <span
                  className={
                    source === "piano" ? "text-emerald-700" : "text-amber-700"
                  }
                >
                  {source === "piano" ? "Karel's piano" : "fallback tone"}
                </span>
              </span>
            </div>
            <p className="max-w-lg text-base leading-relaxed text-slate-700">
              {caption}
            </p>
            <label className="flex flex-col gap-1 text-base text-slate-700">
              <span>
                lighten{" "}
                <span className="text-slate-500">
                  ← the day&rsquo;s weight →
                </span>{" "}
                deepen
              </span>
              <input
                type="range"
                min={-100}
                max={100}
                value={deepen}
                onChange={onDeepen}
                className="h-2 w-full max-w-xs cursor-pointer accent-slate-600"
              />
            </label>
            <p className="text-base text-slate-500">
              Drag the sun around the dial to skip to another hour.
            </p>
          </div>
        )}
      </div>

      {/* Design notes */}
      <details className="pointer-events-auto absolute right-4 top-4 max-w-sm rounded-md border border-slate-300/70 bg-white/70 p-3 text-slate-700 backdrop-blur">
        <summary className="cursor-pointer text-base text-slate-700">
          Design notes
        </summary>
        <p className="mt-2 text-base leading-relaxed text-slate-700">
          Karel&rsquo;s recording is a grain corpus. A granular time-stretch
          engine crawls a read-head slowly through it (well under real time) and
          sprays short, transposed grains; a long-form arc state machine walks a
          slow day through the eight canonical hours, continuously changing
          granular density, transposition spread, layering, register and
          brightness — so it evolves for many minutes with no hard loop, drift-
          varying each new day. Resurrects the ⭐ idea 1162-loom-of-hours. See the
          folder README for the full mechanism and references (Liturgy of the
          Hours; Curtis Roads, <em>Microsound</em>, 2001).
        </p>
      </details>
    </main>
  );
}
