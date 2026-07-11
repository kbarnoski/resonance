"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BiomeScene, hasWebGL, type FocusInfo } from "./scene";
import { startAudio, type BiomeAudio } from "./audio";
import {
  loadQuakes,
  makeFallbackQuakes,
  refreshQuakes,
  type QuakeSource,
} from "./data";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

type Phase = "idle" | "starting" | "running" | "error";

// Slowly re-fetch the live field so a long session keeps drifting with Earth.
const REFRESH_MS = 150_000;

export default function BiomeFieldPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<BiomeScene | null>(null);
  const audioRef = useRef<BiomeAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const refreshRef = useRef<number>(0);
  const pointerDownRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<QuakeSource | null>(null);
  const [count, setCount] = useState(0);
  const [audioOnly, setAudioOnly] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    if (refreshRef.current) {
      clearInterval(refreshRef.current);
      refreshRef.current = 0;
    }
    sceneRef.current?.dispose();
    sceneRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      // Let the void reverb ring out before closing.
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 1100);
    }
  }, []);

  // Full teardown on unmount.
  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);

    const reduced = prefersReducedMotion();
    const webgl = hasWebGL();

    // ── Visuals (optional — degrade to audio-only if WebGL is missing) ────────
    const container = containerRef.current;
    if (webgl && container) {
      try {
        const scene = new BiomeScene(container, {
          reduced,
          onFocus: (f: FocusInfo | null) => audioRef.current?.setFocus(f),
        });
        sceneRef.current = scene;
      } catch {
        sceneRef.current = null;
      }
    }
    if (!sceneRef.current) setAudioOnly(true);

    // ── Audio (must start from the user gesture) ─────────────────────────────
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device.");
      return;
    }
    ctxRef.current = ctx;
    audioRef.current = startAudio(ctx, { reduced });

    // ── Alive immediately on the BUNDLED snapshot, then swap in live data ─────
    const fallback = makeFallbackQuakes();
    sceneRef.current?.setQuakes(fallback);
    audioRef.current?.setQuakes(fallback);
    setCount(fallback.length);

    sceneRef.current?.start();
    setPhase("running");

    const result = await loadQuakes();
    if (!ctxRef.current) return; // unmounted mid-fetch
    setSource(result.source);
    sceneRef.current?.setQuakes(result.quakes);
    audioRef.current?.setQuakes(result.quakes);
    setCount(result.quakes.length);

    // Slow refresh loop so the field keeps changing as Earth's data changes.
    if (result.source === "live") {
      refreshRef.current = window.setInterval(async () => {
        try {
          const fresh = await refreshQuakes();
          sceneRef.current?.setQuakes(fresh);
          audioRef.current?.setQuakes(fresh);
          setCount(fresh.length);
        } catch {
          /* transient failure — keep the current field, retry next tick */
        }
      }, REFRESH_MS);
    }
  }, [phase]);

  // Keep the renderer sized to the window.
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Pointer: drag to orbit, hover to "listen in" on a region ───────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    sceneRef.current?.handlePointer(e.clientX, e.clientY, true);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    sceneRef.current?.handlePointer(e.clientX, e.clientY, pointerDownRef.current);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    sceneRef.current?.endPointer();
  }, []);
  const onPointerLeave = useCallback(() => {
    pointerDownRef.current = false;
    sceneRef.current?.endPointer();
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#04060d] text-foreground">
      {/* Full-screen three.js canvas mounts here, behind the UI. */}
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        aria-hidden
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />

      {/* Soft vignette so UI text stays legible over the void. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_38%,rgba(4,6,13,0.72)_100%)]" />

      {/* ── Idle / start panel ─────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl rounded-2xl bg-black/55 p-8 ring-1 ring-border backdrop-blur-md">
            <h1 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
              Biome Field
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              A living data-field composed by the planet itself. The last day of
              global earthquakes — fetched live from the USGS the moment you
              begin — is grown into a breathing shell of light around a dark
              Earth and sounded as a slow, inharmonic drone. It looks and sounds
              different right now than it did an hour ago, because Earth&apos;s
              data changed.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-card px-4 py-2.5 text-base font-medium text-black transition hover:bg-accent disabled:opacity-60"
            >
              {phase === "starting" ? "Growing the field…" : "Begin · enter the field"}
            </button>

            {errorMsg && <p className="mt-4 text-base text-violet-300">{errorMsg}</p>}

            <p className="mt-4 text-base text-muted-foreground">
              Use headphones. Drag to orbit the planet; hover to &ldquo;listen
              in&rdquo; on a region and draw the shimmer toward it. Live data
              from the USGS; if the network is blocked it plays a bundled
              snapshot so the field is always alive.
            </p>
          </div>
        </div>
      )}

      {/* ── Running HUD ────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-6 top-6 select-none">
          <h1 className="font-serif text-2xl text-foreground">Biome Field</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {source === "live" && (
              <span className="rounded-full bg-violet-500/15 px-3 py-1 font-mono text-base text-violet-300 ring-1 ring-violet-400/30">
                live · USGS
              </span>
            )}
            {source === "fallback" && (
              <span className="rounded-full bg-violet-500/15 px-3 py-1 font-mono text-base text-violet-300 ring-1 ring-violet-400/30">
                bundled snapshot
              </span>
            )}
            {source === null && (
              <span className="font-mono text-base text-muted-foreground">
                reaching for Earth…
              </span>
            )}
            <span className="font-mono text-base text-muted-foreground">
              {count} quakes · last 24h
            </span>
          </div>
          {audioOnly && (
            <p className="mt-2 max-w-xs text-base text-violet-300">
              WebGL is unavailable, so the field is playing audio-only.
            </p>
          )}
        </div>
      )}

      {/* ── Design-notes toggle ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-6 top-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-black/55 px-4 py-2.5 text-base text-foreground ring-1 ring-border backdrop-blur-md transition hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/75 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl text-foreground">
            <h2 className="font-serif text-2xl text-foreground">Design notes</h2>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The question.</span> What if a
              real, live planetary dataset were the composer — a living
              data-field you can walk into, that sounds and looks different right
              now than it did an hour ago, because Earth&apos;s data changed?
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The data.</span> On the Begin
              gesture the browser fetches the USGS{" "}
              <span className="font-mono">all_day</span> GeoJSON feed (public, no
              key, read-only GET). Each feature gives longitude, latitude, depth,
              magnitude and time. It renders instantly on a bundled ~30-quake
              snapshot, then swaps in the live field, and re-fetches every ~2.5
              minutes so the field keeps drifting with the planet.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The mapping.</span> One point per
              quake on a shell around a dark Earth. Magnitude sets size and
              brightness; depth sets colour (shallow warm-gold → deep violet) and
              radial height, so the field reads as a 3-D data-terrain; recency
              sets a slow shimmer. The whole shell breathes; every point drifts —
              a living field, not a chart.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">The sound.</span> The largest,
              freshest quakes each seed a low sustained drone voice — fundamental
              falls as magnitude rises, and depth stretches an INHARMONIC upper
              partial, so the cluster is spectral and faintly uneasy rather than
              a consonant chord. The running texture of small events becomes a
              granular shimmer whose pitch is a continuous function of each
              quake&apos;s magnitude and depth, panned by longitude. Hovering
              &ldquo;listens in&rdquo; on a region: it draws the grains toward the
              quakes there and lifts their rate.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">References.</span> Refik
              Anadol&apos;s DATALAND — &ldquo;Machine Dreams: Rainforest,&rdquo;
              which opened June 20, 2026 in Los Angeles: a living data field that
              continuously evolves from real-time ecological data and visitor
              presence, &ldquo;never truly finished.&rdquo; Biome Field is the
              browser-scale echo of that idea, driven by a live planetary
              dataset. It also draws on the seismic-sonification lineage —
              audification and parameter-mapping of seismic signals to make the
              Earth audible.
            </p>
            <p className="mt-4 text-base leading-relaxed">
              <span className="text-foreground">Safety.</span> All luminance
              changes are slow soft drifts well under 3 Hz — no strobing — and
              reduced-motion is honoured. Audio starts only from your gesture,
              ramps from silence, and is limited.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
