"use client";

// ════════════════════════════════════════════════════════════════════════════
// Tremor Core (1193)
//
// THE ONE QUESTION: "What if you could HEAR the living Earth right now — every
// real, live earthquake on the planet striking a resonant inharmonic metal gong
// — while you WATCH the quakes ring at their true depth inside a glowing cutaway
// of the Earth?"
//
// A live real-world-data sonification. USGS's public past-24h earthquake feed
// drives a bell/gong synth (gong.ts); a WebGL2 fragment-shader Earth cutaway
// (core.ts) rings each quake at its true depth. The past 24h are time-compressed
// into a ~150s chronological loop with a 250ms min inter-onset so it reads as a
// slow bell-choir, not a machine gun.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  fetchQuakes,
  statusLabel,
  type FeedResult,
  type Quake,
} from "./feeds";
import { GongEngine } from "./gong";
import { CoreRenderer } from "./core";

const LOOP_MS = 150_000; // compress the past 24h into ~150s
const MIN_GAP_MS = 250; // min inter-onset so bursts read as a bell-choir

interface ScheduledStrike {
  at: number; // ms offset within the loop
  quake: Quake;
}

interface Schedule {
  events: ScheduledStrike[];
  duration: number; // ms — total loop length
}

// Compress a chronological quake list into a loop, enforcing a minimum gap.
function makeSchedule(quakes: Quake[]): Schedule {
  if (quakes.length === 0) return { events: [], duration: LOOP_MS };
  const sorted = [...quakes].sort((a, b) => a.time - b.time);
  const first = sorted[0].time;
  const last = sorted[sorted.length - 1].time;
  const span = last - first;

  const events: ScheduledStrike[] = [];
  let lastAt = -Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const q = sorted[i];
    let at =
      span > 0
        ? ((q.time - first) / span) * LOOP_MS
        : (i / Math.max(1, sorted.length - 1)) * LOOP_MS;
    if (at < lastAt + MIN_GAP_MS) at = lastAt + MIN_GAP_MS;
    lastAt = at;
    events.push({ at, quake: q });
  }
  const duration = Math.max(LOOP_MS, lastAt + 800);
  return { events, duration };
}

function formatClock(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

type RunState = "idle" | "running";

export default function TremorCorePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runState, setRunState] = useState<RunState>("idle");
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [lastQuake, setLastQuake] = useState<Quake | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [rendererMode, setRendererMode] = useState<"webgl2" | "canvas2d" | null>(
    null,
  );

  const gongRef = useRef<GongEngine | null>(null);
  const rendererRef = useRef<CoreRenderer | null>(null);
  const scheduleRef = useRef<Schedule>({ events: [], duration: LOOP_MS });
  const pendingScheduleRef = useRef<Schedule | null>(null);
  const rafRef = useRef<number>(0);
  const pollRef = useRef<number | null>(null);
  const loopStartRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const cursorRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);

  // ── keep the canvas sized ──
  useEffect(() => {
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const stopEverything = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    gongRef.current?.dispose();
    gongRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
  }, []);

  // teardown on unmount
  useEffect(() => {
    return () => stopEverything();
  }, [stopEverything]);

  const runLoop = useCallback((now: number) => {
    if (!runningRef.current) return;
    const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
    lastFrameRef.current = now;

    const sched = scheduleRef.current;
    const elapsed = now - loopStartRef.current;

    const gong = gongRef.current;
    const renderer = rendererRef.current;

    while (
      cursorRef.current < sched.events.length &&
      sched.events[cursorRef.current].at <= elapsed
    ) {
      const q = sched.events[cursorRef.current].quake;
      gong?.strike(q);
      renderer?.spawn(q);
      setLastQuake(q);
      cursorRef.current++;
    }

    if (elapsed >= sched.duration) {
      // loop; swap in freshly-polled data if any arrived
      loopStartRef.current = now;
      cursorRef.current = 0;
      if (pendingScheduleRef.current) {
        scheduleRef.current = pendingScheduleRef.current;
        pendingScheduleRef.current = null;
      }
    }

    renderer?.frame(dt);
    rafRef.current = requestAnimationFrame(runLoop);
  }, []);

  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    setAudioError(null);

    // 1) gesture-gated AudioContext
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
      setAudioError("Could not start audio. Try again after interacting.");
      return;
    }

    const gong = new GongEngine(ctx);
    gong.start();
    gongRef.current = gong;

    // 2) renderer on the canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = new CoreRenderer(canvas);
      rendererRef.current = renderer;
      setRendererMode(renderer.rendererMode);
    }

    // 3) fetch quakes → schedule
    const result = await fetchQuakes();
    setFeed(result);
    scheduleRef.current = makeSchedule(result.quakes);
    cursorRef.current = 0;

    // 4) re-poll every 60s; stage for the next loop boundary
    pollRef.current = window.setInterval(async () => {
      const next = await fetchQuakes();
      setFeed(next);
      pendingScheduleRef.current = makeSchedule(next.quakes);
    }, 60_000);

    // 5) start the loop
    runningRef.current = true;
    setRunState("running");
    const t0 = performance.now();
    loopStartRef.current = t0;
    lastFrameRef.current = t0;
    rafRef.current = requestAnimationFrame(runLoop);
  }, [runLoop]);

  const handleStop = useCallback(() => {
    stopEverything();
    setRunState("idle");
    setLastQuake(null);
    setRendererMode(null);
  }, [stopEverything]);

  const badge =
    feed &&
    (feed.source === "live" ? (
      <span className="font-mono text-base text-violet-300/95">
        {statusLabel(feed)}
      </span>
    ) : (
      <span className="font-mono text-base text-violet-300/95">
        {statusLabel(feed)}
      </span>
    ));

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0906] text-foreground">
      {/* the BRIGHT Earth cross-section canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* header */}
      <header className="relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-3xl">
          Tremor Core
        </h1>
        <p className="mt-2 max-w-2xl text-base text-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)]">
          Every real, live earthquake on Earth strikes a resonant inharmonic
          gong — ringing at its true depth inside a glowing cutaway of the
          planet.
        </p>
      </header>

      {/* pre-start overlay */}
      {runState === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-black/45 px-8 py-7 text-center backdrop-blur-md">
            <p className="max-w-md text-base text-foreground">
              The past 24 hours of USGS earthquakes, compressed into a slow bell
              choir. Deep quakes ring near the core; shallow ones near the
              crust.
            </p>
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-violet-200/90 px-4 py-2.5 text-base font-medium text-[#20160a] shadow-lg transition-colors hover:bg-violet-100"
            >
              ▶ Listen to the Earth
            </button>
            <p className="text-base text-muted-foreground">
              Audio starts on this click — gesture-gated, with a limiter.
            </p>
            {audioError && (
              <p className="max-w-sm text-base text-violet-300">{audioError}</p>
            )}
          </div>
        </div>
      )}

      {/* live readout panel */}
      {runState === "running" && (
        <div className="absolute bottom-16 left-1/2 z-10 w-[min(94vw,760px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-black/55 px-5 py-4 backdrop-blur-md">
            <div className="min-w-[220px] flex-1">
              {lastQuake ? (
                <div>
                  <div className="text-base font-medium text-foreground">
                    {lastQuake.place}
                  </div>
                  <div className="mt-1 font-mono text-base text-foreground">
                    M {lastQuake.mag.toFixed(1)} · {Math.round(lastQuake.depth)}{" "}
                    km deep · {formatClock(lastQuake.time)}
                  </div>
                </div>
              ) : (
                <div className="text-base text-muted-foreground">
                  Waiting for the first tremor…
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              {badge}
              {rendererMode === "canvas2d" && (
                <span className="font-mono text-base text-violet-300/95">
                  canvas2d fallback
                </span>
              )}
              <button
                onClick={handleStop}
                className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                ■ Stop
              </button>
            </div>
          </div>
          {audioError && (
            <p className="mt-2 text-center text-base text-violet-300">
              {audioError}
            </p>
          )}
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
