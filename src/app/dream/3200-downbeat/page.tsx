"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  makeConductor,
  makeAuto,
  applyTap,
  stepAuto,
  decayConfidence,
  gridTimeOf,
  autoPhaseLabel,
  phaseGap,
  AUTO_CYCLE,
  type Conductor,
  type AutoConductor,
} from "./pll";
import {
  makeScheduler,
  runScheduler,
  type Scheduler,
  type EnsembleNote,
} from "./scheduler";
import { Ensemble } from "./synth";
import { Scene, type FrameData, type LaneNote } from "./wheel";

const SEED = 0x3200;
const LOOKAHEAD = 0.15;
const FUTURE_WINDOW = 4.2; // seconds of grid to draw ahead

type Mode = "demo" | "human";
type Tilt = "unavailable" | "idle" | "on" | "denied";

interface OrientationCtor {
  requestPermission?: () => Promise<"granted" | "denied">;
}

const EMPTY: FrameData = {
  currentTime: 0,
  bpm: 100,
  phaseErrMs: 0,
  confidence: 0,
  ensemblePhase: 0,
  conductorPhase: 0,
  hasConductor: false,
  gapFrac: 0,
  label: "holding steady",
  mode: "demo",
  notes: [],
  taps: [],
  beatTimes: [],
  downbeatFlags: [],
};

export default function DownbeatPage() {
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [mode, setMode] = useState<Mode>("demo");
  const [tilt, setTilt] = useState<Tilt>("unavailable");
  const [frame, setFrame] = useState<FrameData>(EMPTY);

  const ctxRef = useRef<AudioContext | null>(null);
  const ensRef = useRef<Ensemble | null>(null);
  const condRef = useRef<Conductor | null>(null);
  const autoRef = useRef<AutoConductor | null>(null);
  const schedRef = useRef<Scheduler | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const modeRef = useRef<Mode>("demo");
  const notesBufRef = useRef<LaneNote[]>([]);
  const tapsBufRef = useRef<number[]>([]);
  const lastBetaRef = useRef<number | null>(null);
  const lastTiltTapRef = useRef(0);

  // Register one conductor beat + its audible tick, marking the accent beat.
  const beat = useCallback((t: number) => {
    const cond = condRef.current;
    const ens = ensRef.current;
    if (!cond || !ens) return;
    const kAbs =
      Math.round((t - cond.anchorTime) / cond.period) + cond.anchorIndex;
    const accent = (((kAbs % 4) + 4) % 4) === 0;
    applyTap(cond, t);
    ens.tick(t, accent);
    tapsBufRef.current.push(t);
  }, []);

  const handleTap = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (modeRef.current === "demo") {
      modeRef.current = "human";
      setMode("human");
    }
    beat(ctx.currentTime);
  }, [beat]);

  const takeBaton = useCallback(() => {
    modeRef.current = "human";
    setMode("human");
  }, []);

  const toDemo = useCallback(() => {
    const ctx = ctxRef.current;
    modeRef.current = "demo";
    setMode("demo");
    if (ctx) autoRef.current = makeAuto(SEED, ctx.currentTime + 0.2);
  }, []);

  const enableTilt = useCallback(async () => {
    const Ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor })
      .DeviceOrientationEvent;
    if (!Ctor) {
      setTilt("unavailable");
      return;
    }
    try {
      if (typeof Ctor.requestPermission === "function") {
        const res = await Ctor.requestPermission();
        if (res !== "granted") {
          setTilt("denied");
          return;
        }
      }
      setTilt("on");
      modeRef.current = "human";
      setMode("human");
    } catch {
      setTilt("denied");
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(() => {
    if (running) return;

    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
    } catch {
      setAudioFailed(true);
      return;
    }
    void ctx.resume();
    ctxRef.current = ctx;

    const ens = new Ensemble(ctx);
    ens.start();
    ensRef.current = ens;

    const t0 = ctx.currentTime + 0.25;
    const cond = makeConductor(0.6, t0);
    condRef.current = cond;
    autoRef.current = makeAuto(SEED, t0);
    schedRef.current = makeScheduler(0);
    notesBufRef.current = [];
    tapsBufRef.current = [];
    modeRef.current = "demo";
    setMode("demo");
    setRunning(true);

    // Tilt (mobile): a baton down-stroke past a beta threshold = one beat.
    const hasOrientation =
      typeof window !== "undefined" && "DeviceOrientationEvent" in window;
    const orientationCtor = (
      window as unknown as { DeviceOrientationEvent?: OrientationCtor }
    ).DeviceOrientationEvent;
    const needsPermission =
      hasOrientation && typeof orientationCtor?.requestPermission === "function";
    setTilt(hasOrientation ? (needsPermission ? "idle" : "on") : "unavailable");

    const onTilt = (e: DeviceOrientationEvent) => {
      const c = ctxRef.current;
      if (!c || e.beta == null) return;
      const prev = lastBetaRef.current;
      lastBetaRef.current = e.beta;
      if (prev == null) return;
      const now = c.currentTime;
      // Down-stroke: crossing the threshold while accelerating downward.
      if (prev < 14 && e.beta >= 14 && now - lastTiltTapRef.current > 0.17) {
        lastTiltTapRef.current = now;
        if (modeRef.current === "demo") {
          modeRef.current = "human";
          setMode("human");
        }
        beat(now);
      }
    };
    if (hasOrientation && !needsPermission) {
      window.addEventListener("deviceorientation", onTilt);
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        handleTap();
      }
    };
    window.addEventListener("keydown", onKey);

    // ── the render + scheduling loop ─────────────────────────────────────────
    const loop = () => {
      const t = ctx.currentTime;
      const c = condRef.current!;
      const s = schedRef.current!;

      if (modeRef.current === "demo") {
        const auto = autoRef.current!;
        for (const tapTime of stepAuto(auto, t)) beat(tapTime);
      }
      decayConfidence(c, t);

      runScheduler(s, c, t, LOOKAHEAD, (n: EnsembleNote) => {
        ens.playNote(n);
        notesBufRef.current.push({
          time: n.time,
          dur: n.dur,
          voice: n.voice,
          vel: n.vel,
        });
      });

      // prune the visual buffers
      const cutoff = t - 0.7;
      notesBufRef.current = notesBufRef.current.filter((n) => n.time > cutoff);
      tapsBufRef.current = tapsBufRef.current.filter((x) => x > cutoff);

      // ── derive display frame ───────────────────────────────────────────────
      const ensembleBeatFloat =
        (t - c.anchorTime) / c.period + c.anchorIndex;
      const ensemblePhase = ensembleBeatFloat - Math.floor(ensembleBeatFloat);
      const hasConductor = c.lastTapTime >= 0;
      const conductorBeatFloat = hasConductor
        ? (t - c.lastTapTime) / c.instPeriod
        : 0;
      const conductorPhase =
        conductorBeatFloat - Math.floor(conductorBeatFloat);
      const gapFrac = hasConductor
        ? phaseGap(conductorPhase, ensemblePhase)
        : 0;

      let label: string;
      if (modeRef.current === "demo") {
        label = autoPhaseLabel(t - autoRef.current!.startTime);
      } else if (!hasConductor) {
        label = "waiting for your beat";
      } else if (Math.abs(gapFrac) < 0.045) {
        label = "locked in";
      } else if (gapFrac > 0) {
        label = "rushing — ensemble behind";
      } else {
        label = "dragging — ensemble ahead";
      }

      // upcoming grid beat lines
      const beatTimes: number[] = [];
      const downbeatFlags: boolean[] = [];
      const startIdx =
        Math.floor((t - 0.7 - c.anchorTime) / c.period) + c.anchorIndex;
      for (let idx = startIdx; beatTimes.length < 64; idx++) {
        const bt = gridTimeOf(c, idx);
        if (bt > t + FUTURE_WINDOW) break;
        if (bt < cutoff) continue;
        beatTimes.push(bt);
        downbeatFlags.push((((idx % 4) + 4) % 4) === 0);
      }

      setFrame({
        currentTime: t,
        bpm: 60 / c.period,
        phaseErrMs: gapFrac * c.period * 1000,
        confidence: c.confidence,
        ensemblePhase,
        conductorPhase,
        hasConductor,
        gapFrac,
        label,
        mode: modeRef.current,
        notes: notesBufRef.current.slice(),
        taps: tapsBufRef.current.slice(),
        beatTimes,
        downbeatFlags,
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ─────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("deviceorientation", onTilt);
      ens.stop();
      ensRef.current = null;
      const c = ctxRef.current;
      if (c && c.state !== "closed") {
        window.setTimeout(() => {
          if (c.state !== "closed") void c.close();
        }, 400);
      }
      ctxRef.current = null;
      condRef.current = null;
      autoRef.current = null;
      schedRef.current = null;
      lastBetaRef.current = null;
      setFrame(EMPTY);
    };
  }, [running, beat, handleTap]);

  return (
    <div className="relative min-h-[calc(100dvh-3rem)] w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8">
        <header className="max-w-2xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            conductor · tempo PLL · lookahead scheduling
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Downbeat
          </h1>
          <p className="text-base text-muted-foreground">
            Conduct a small ensemble — your beat <em>is</em> the performance. Tap
            the pulse with the space bar (or tilt your phone). Keep clear, even
            time and the players lock into a tight groove; rush and they crowd
            behind you, drag and they run ahead. Your timing is a musical
            decision you can get wrong.
          </p>
        </header>

        {/* transport display */}
        <div className="w-full overflow-x-auto">
          <div className="mx-auto aspect-[1000/520] w-full min-w-[640px] max-w-4xl rounded-lg border border-border bg-background">
            {running ? (
              <Scene frame={frame} />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  press start
                </p>
              </div>
            )}
          </div>
        </div>

        {audioFailed && (
          <p className="max-w-2xl text-base text-destructive">
            Web Audio is unavailable in this browser, so the ensemble can&apos;t
            sound. The technique is described in the design notes.
          </p>
        )}

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <>
              {mode === "demo" ? (
                <button
                  onClick={takeBaton}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Take the baton
                </button>
              ) : (
                <button
                  onClick={toDemo}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Demo
                </button>
              )}
              <button
                onClick={handleTap}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Tap beat
              </button>
              {tilt === "idle" && (
                <button
                  onClick={enableTilt}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Enable tilt
                </button>
              )}
              <button
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {running && (
          <p className="max-w-2xl text-base text-muted-foreground">
            {mode === "demo"
              ? "A seeded auto-conductor is holding steady, then deliberately rushing and dragging so you can hear the ensemble lock and slip. Press Take the baton (or just tap Space) to conduct."
              : "You have the baton — tap Space on every beat. Watch the two markers on the wheel: when they meet, the ensemble is locked to you; when they split, you are fighting the groove."}
            {tilt === "denied" && " Tilt was blocked — the space bar still conducts."}
          </p>
        )}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Downbeat — design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                You give beats; a{" "}
                <strong>phase-locked loop (PLL)</strong> turns them into a live
                tempo. Each tap updates two things with a low gain: the{" "}
                <em>period</em> (seconds per beat, from the inter-tap interval)
                and the <em>phase</em> (the grid is nudged toward where your tap
                actually landed). Because the gains are deliberately gentle, the
                grid <em>smooths</em> — so a sudden rush or drag makes the
                ensemble lag your hand. That lag is the instrument.
              </p>
              <p>
                The ensemble never plays a fixed metronome. A{" "}
                <strong>lookahead scheduler</strong> looks ~{Math.round(
                  LOOKAHEAD * 1000
                )}{" "}
                ms into the future, finds every note in a two-bar A-minor phrase
                (walking bass, chord stabs, a pentatonic melody) whose position
                falls on the conductor&apos;s current grid, and calls{" "}
                <code>osc.start(when)</code> at a precise{" "}
                <code>AudioContext</code> time. Steady conducting → a tight,
                even grid. Rushing → notes flam against your tick.
              </p>
              <p>
                The phase-wheel shows the ensemble&apos;s beat marker (filled)
                and your beat marker (hollow); the arc between them is your
                timing error, and it colours from violet toward magenta as it
                opens. The lanes below scroll your upcoming scheduled notes onto
                the grid at the &quot;now&quot; line, with your taps marked
                above.
              </p>
              <p>
                On load a seeded (mulberry32, 0x3200) auto-conductor holds steady
                for ~9&nbsp;s so the groove locks, then rushes toward ~143&nbsp;bpm
                and drags toward ~71&nbsp;bpm on a {AUTO_CYCLE}s loop, so the
                &quot;getting it wrong&quot; behaviour is audible with no human.
              </p>
              <p>
                Reference: <strong>Max Mathews, “The Radio-Baton and Conductor
                Program” (Stanford CCRMA, ~1989)</strong> — a physical baton
                whose gesture drove the tempo and dynamics of a scored computer
                ensemble. This is the browser descendant: conduct with a keyboard
                tap or a phone tilt instead of a radio baton.
              </p>
              <p>
                Honest limits: the tempo tracker does not fold octaves (tapping
                double-time is read as a real tempo change), tilt onset detection
                is coarse, and the &quot;dynamics&quot; axis of Mathews&apos;
                baton is not modelled — only tempo and phase.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
