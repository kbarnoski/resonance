"use client";

// Today's Sky Song — TODAY'S REAL weather writes a child a little song, and the
// child gets to play it. The live weather (Open-Meteo) is the COMPOSER (key, tempo,
// instruments, the slowly-evolving generative pattern); the child is the PERFORMER
// (touch the aurora to add their own glowing voice, always in today's key).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchSky, BAKED_SKY, type Sky } from "./weather";
import { SkySong } from "./audio";
import { SkyRenderer } from "./render";

export default function KidsSkySongPage() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const songRef = useRef<SkySong | null>(null);
  const rendererRef = useRef<SkyRenderer | null>(null);
  const skyRef = useRef<Sky>(BAKED_SKY);

  const [started, setStarted] = useState(false);
  const [sky, setSky] = useState<Sky | null>(null);   // null until first data arrives
  const [usingWebGL, setUsingWebGL] = useState(true);
  const [weatherError, setWeatherError] = useState(false);

  // ── bring the aurora to life immediately (visual before any audio/touch) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new SkyRenderer(canvas, BAKED_SKY);
    rendererRef.current = renderer;
    setUsingWebGL(renderer.usingWebGL);
    renderer.begin();

    const onResize = () => renderer.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── fetch TODAY'S REAL weather; patch it into visuals + (later) audio ─────
  useEffect(() => {
    let alive = true;
    fetchSky().then((s) => {
      if (!alive) return;
      skyRef.current = s;
      setSky(s);
      setWeatherError(!s.real);
      rendererRef.current?.setSky(s);
      songRef.current?.applySky(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── start audio inside the first user gesture (iOS unlock) ────────────────
  const runStart = () => {
    if (started) return;
    const song = new SkySong(skyRef.current);
    songRef.current = song;
    song.start();
    // let the renderer pull audio events each frame so notes bloom in the field
    rendererRef.current?.setSampler(() => ({
      now: song.currentTime,
      events: song.drainEvents(),
    }));
    setStarted(true);
  };

  // ── child performs: touch anywhere on the field = a voice in today's key ──
  const applyTouch = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    // instant visual ripple (<50ms) regardless of audio state
    rendererRef.current?.addTouchRipple(x, y);
    if (!started) {
      runStart();
      return;
    }
    songRef.current?.playTouch(x, y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    applyTouch(e.clientX, e.clientY);
  };

  useEffect(() => {
    return () => {
      songRef.current?.dispose();
      songRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-black font-mono text-foreground select-none">
      {/* the whole field is the instrument */}
      <div
        ref={wrapRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        role="button"
        tabIndex={0}
        aria-label="Touch the sky to add your voice to today's weather song"
      >
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* ── header (outside the play area, top-left) ── */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[70%]">
        <h1 className="font-serif text-2xl text-foreground drop-shadow sm:text-3xl">
          Today&rsquo;s Sky Song
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          {sky ? sky.label : "listening to the sky…"}
        </p>
        {sky && (
          <p className="mt-0.5 text-base text-muted-foreground">
            {Math.round(sky.tempC)}&deg;C &middot; {sky.isDay ? "day" : "night"} &middot;{" "}
            {Math.round(sky.windSpeed)} km/h wind &middot; {Math.round(sky.cloudCover)}% cloud
          </p>
        )}
        {weatherError && (
          <p className="mt-1 text-base text-violet-300">couldn&rsquo;t reach the weather</p>
        )}
        {weatherError && (
          <p className="text-base text-muted-foreground">showing an example sky</p>
        )}
      </div>

      {/* ── WebGL fallback notice ── */}
      {!usingWebGL && (
        <p className="pointer-events-none absolute right-4 top-4 z-10 text-base text-violet-300">
          drawing a simpler sky
        </p>
      )}

      {/* ── tap-to-play affordance (icon, pulsing, secondary; not text-gated) ── */}
      {!started && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center">
          <span className="relative flex h-28 w-28 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-muted" />
            <span className="absolute inline-flex h-20 w-20 rounded-full bg-muted" />
            {/* play glyph */}
            <svg
              viewBox="0 0 24 24"
              className="relative h-12 w-12 text-foreground drop-shadow"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5.5v13a1 1 0 0 0 1.52.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
            </svg>
          </span>
          <p className="mt-4 text-base text-muted-foreground">touch the sky</p>
        </div>
      )}

      {/* ── nav back (outside play area, bottom-left) ── */}
      <Link
        href="/dream"
        className="absolute bottom-4 left-4 z-10 inline-flex min-h-[44px] items-center rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground backdrop-blur transition hover:bg-accent hover:text-foreground"
      >
        &larr; back
      </Link>

      {/* ── credit line (outside play area, bottom-right) ── */}
      <p className="pointer-events-none absolute bottom-4 right-4 z-10 text-base text-muted-foreground">
        the weather is the composer &middot; you are the player
      </p>
    </div>
  );
}
