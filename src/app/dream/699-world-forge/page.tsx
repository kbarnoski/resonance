"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ForgeAudio } from "./audio";
import { createFallback, type FallbackHandle } from "./fallback";
import { lonFor, startFeed, type FeedHandle, type ForgeEvent } from "./feed";
import { createGlobe, type GlobeHandle } from "./globe";

type FeedStatus = "synthetic" | "live" | "error";

const TYPE_LABEL: Record<string, string> = {
  PushEvent: "push",
  WatchEvent: "star",
  PullRequestEvent: "pull request",
  IssuesEvent: "issue",
  IssueCommentEvent: "comment",
  ForkEvent: "fork",
  CreateEvent: "create",
};

export default function WorldForgePage() {
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<FeedStatus>("synthetic");
  const [renderMode, setRenderMode] = useState<"webgl" | "canvas" | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [rate, setRate] = useState(0);
  const [lastEvent, setLastEvent] = useState<ForgeEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const audioRef = useRef<ForgeAudio | null>(null);
  const feedRef = useRef<FeedHandle | null>(null);
  const globeRef = useRef<GlobeHandle | null>(null);
  const fallbackRef = useRef<FallbackHandle | null>(null);

  // rolling rate window: timestamps (ms) of recent events
  const stampsRef = useRef<number[]>([]);
  const intensityRef = useRef(0);

  // ── teardown ───────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    feedRef.current?.stop();
    feedRef.current = null;
    globeRef.current?.dispose();
    globeRef.current = null;
    fallbackRef.current?.dispose();
    fallbackRef.current = null;
    audioRef.current?.close();
    audioRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // ── rolling-rate aggregator → intensity (drives audio + visuals) ─────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const WINDOW = 12_000; // 12s rolling window
    const tick = () => {
      const now = performance.now();
      const arr = stampsRef.current;
      while (arr.length && now - arr[0] > WINDOW) arr.shift();
      // events-per-12s → normalised. A busy world ~ 30+/12s.
      const target = Math.min(1, arr.length / 28);
      // smooth
      intensityRef.current += (target - intensityRef.current) * 0.05;
      const x = intensityRef.current;
      audioRef.current?.setIntensity(x);
      globeRef.current?.setIntensity(x);
      fallbackRef.current?.setIntensity(x);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // surface a readable rate roughly twice a second
    const id = window.setInterval(() => {
      const now = performance.now();
      const arr = stampsRef.current;
      const recent = arr.filter((s) => now - s < WINDOW).length;
      setRate(recent);
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, [started]);

  const handleEvent = useCallback((e: ForgeEvent) => {
    stampsRef.current.push(performance.now());
    setLastEvent(e);
    setEventCount((c) => c + 1);
    // pan on the same longitude the globe/fallback use to place the bloom
    audioRef.current?.play(e, lonFor(e));
    globeRef.current?.spawn(e);
    fallbackRef.current?.spawn(e);
  }, []);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // Audio must be created/resumed inside the gesture (iOS/Safari unlock).
    let audio: ForgeAudio | null = null;
    try {
      audio = new ForgeAudio();
      await audio.resume();
      audioRef.current = audio;
    } catch {
      audioRef.current = null;
    }

    // Visuals: try three.js/WebGL, else Canvas2D fallback.
    let mode: "webgl" | "canvas" = "canvas";
    try {
      if (mountRef.current) {
        const THREE = await import("three");
        globeRef.current = await createGlobe(mountRef.current, THREE);
        mode = "webgl";
      }
    } catch {
      globeRef.current = null;
      mode = "canvas";
    }
    if (mode === "canvas" && canvasRef.current) {
      try {
        fallbackRef.current = createFallback(canvasRef.current);
      } catch {
        fallbackRef.current = null;
      }
    }
    setRenderMode(mode);

    // Feed: synthetic immediately, upgrades to live on first success.
    feedRef.current = startFeed(handleEvent, (s) => setStatus(s));
  }, [started, handleEvent]);

  const statusLine =
    status === "live"
      ? "live — the planet's real public-events firehose"
      : status === "error"
        ? "live feed unavailable — playing a synthetic world"
        : "warming up — synthetic world (live feed connecting)";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#03060f] text-foreground">
      {/* visual layer */}
      <div ref={mountRef} className="absolute inset-0 z-0" aria-hidden />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-0 h-full w-full ${
          renderMode === "canvas" ? "block" : "hidden"
        }`}
        aria-hidden
      />

      {/* subtle vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, transparent 40%, rgba(3,6,15,0.85) 100%)",
        }}
        aria-hidden
      />

      {/* ── start overlay ───────────────────────────────────────────── */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.35em] text-violet-300">
            Resonance · 699
          </p>
          <h1 className="font-semibold text-4xl text-foreground sm:text-5xl">
            World Forge
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground">
            Hear and see the whole planet making things right now — every code
            push, star, and merge on Earth as a spark of light and a grain of
            sound, blooming at its place on a slowly turning globe.
          </p>
          <button
            onClick={begin}
            className="mt-8 min-h-[44px] rounded-full border border-violet-300/40 bg-violet-300/10 px-8 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-300/20"
          >
            Begin
          </button>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            sound + visuals · headphones invite the texture in
          </p>
        </div>
      )}

      {/* ── live HUD ─────────────────────────────────────────────────── */}
      {started && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex flex-col gap-2 p-5">
          <h1 className="font-semibold text-2xl text-foreground">World Forge</h1>
          <p
            className={`font-mono text-sm ${
              status === "live"
                ? "text-violet-300/95"
                : status === "error"
                  ? "text-violet-300/95"
                  : "text-muted-foreground"
            }`}
          >
            {statusLine}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {rate} events in the last 12s · {eventCount} sparks so far
            {lastEvent
              ? ` · latest: ${TYPE_LABEL[lastEvent.type] ?? lastEvent.type} · ${lastEvent.repo}`
              : ""}
          </p>
        </div>
      )}

      {/* ── design notes toggle ──────────────────────────────────────── */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-16 right-4 z-30 min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 font-mono text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      >
        {showNotes ? "close notes" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-x-4 bottom-28 z-30 mx-auto max-w-2xl rounded-2xl border border-border bg-black/85 p-6 backdrop-blur-md">
          <h2 className="font-semibold text-xl text-foreground">Design notes</h2>
          <p className="mt-3 text-base leading-relaxed text-foreground">
            World Forge sonifies the live global creation firehose — GitHub&apos;s
            unauthenticated public-events stream. Each event is one grain: its
            type chooses a timbre (a push is a soft bell, a star a bright
            shimmer, a fork a low bloom), and a stable hash of the repository
            picks a pitch within a drifting D-Dorian mode, so the same repo
            tends to ring the same note. A rolling rate window swells an
            ambient drone and brightens the planet&apos;s glow. Events are
            placed at a deterministic pseudo geo-location and panned by
            longitude — texture, not accuracy.
          </p>
          <p className="mt-3 text-base leading-relaxed text-foreground">
            A synthetic world starts the instant you press Begin, with zero
            network, and the piece upgrades to live data on the first
            successful poll (at most once per ~78s to respect the keyless
            rate limit). Any error falls back to synthetic, so it plays
            forever.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Lineage: Hatnote&apos;s &ldquo;Listen to Wikipedia&rdquo; (Stephen
            LaPorte &amp; Mahmoud Hashemi), github.audio, Brian Foo&apos;s
            Data-Driven DJ, and Refik Anadol&apos;s planetary data-as-light.
          </p>
          <p className="mt-3 font-mono text-xs text-violet-300/95">
            render: {renderMode === "webgl"
              ? "three.js / WebGL globe"
              : renderMode === "canvas"
                ? "Canvas2D fallback"
                : "starting…"}
          </p>
        </div>
      )}
    </main>
  );
}
