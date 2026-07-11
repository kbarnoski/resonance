"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ARCS,
  ArcId,
  JourneyEngine,
  PlacedChord,
  arcById,
  sampleArc,
  noteName,
  DEFAULT_SEED,
} from "./engine";
import { TensionAudio } from "./audio";
import { RibbonRenderer } from "./canvas2d";

// ── piece-level constants (documented) ───────────────────────────────────
const TICK_MS = 25; // scheduler wakeup
const LOOKAHEAD_S = 0.1; // schedule this far ahead (100ms)
const ARC_SAMPLES = 240; // resolution of the drawn target guide

const TEMPO_OPTIONS = [1.6, 2.0, 2.6, 3.4]; // seconds per chord (slow->fast feel)
const LENGTH_OPTIONS = [
  { label: "4 min", chords: 90 },
  { label: "4.5 min", chords: 110 },
  { label: "5 min", chords: 130 },
];

const TONICS = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

export default function TensionJourneyPage() {
  const [running, setRunning] = useState(false);
  const [arc, setArc] = useState<ArcId>("arch");
  const [tonic, setTonic] = useState(0); // C
  const [minor, setMinor] = useState(false);
  const [tempoIdx, setTempoIdx] = useState(1);
  const [lengthIdx, setLengthIdx] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [liveChord, setLiveChord] = useState<PlacedChord | null>(null);
  const [audioOk, setAudioOk] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  // refs read by loops without re-render
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<RibbonRenderer | null>(null);
  const audioRef = useRef<TensionAudio | null>(null);
  const engineRef = useRef<JourneyEngine | null>(null);
  const plannedRef = useRef<PlacedChord[]>([]);
  const targetSamplesRef = useRef<number[]>(sampleArc("arch", ARC_SAMPLES));
  const schedulerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0); // audio time of piece start
  const nextChordTimeRef = useRef(0);
  const chordCursorRef = useRef(0); // next chord index to schedule
  const liveIndexRef = useRef(0);
  const secPerChordRef = useRef(TEMPO_OPTIONS[1]);
  const totalChordsRef = useRef(LENGTH_OPTIONS[1].chords);
  const runningRef = useRef(false);

  // re-plan the whole piece deterministically from current settings
  const replan = useCallback(
    (a: ArcId, t: number, isMinor: boolean, total: number) => {
      const engine = new JourneyEngine({
        arc: a,
        keyTonic: t,
        keyMinor: isMinor,
        totalChords: total,
        beam: 3,
        seed: DEFAULT_SEED,
      });
      engine.planAll();
      engineRef.current = engine;
      plannedRef.current = engine.chords;
      targetSamplesRef.current = sampleArc(a, ARC_SAMPLES);
    },
    [],
  );

  // (re)plan whenever the musical settings change; smooth-forward by
  // keeping the playhead position when already running.
  useEffect(() => {
    totalChordsRef.current = LENGTH_OPTIONS[lengthIdx].chords;
    secPerChordRef.current = TEMPO_OPTIONS[tempoIdx];
    replan(arc, tonic, minor, LENGTH_OPTIONS[lengthIdx].chords);
    // if running, re-aim the scheduler cursor at the current playhead so
    // the new plan continues forward rather than restarting audibly.
    if (runningRef.current && audioRef.current) {
      const sec = secPerChordRef.current;
      const now = audioRef.current.currentTime;
      const idx = Math.max(
        0,
        Math.min(
          plannedRef.current.length - 1,
          Math.floor((now - startTimeRef.current) / sec),
        ),
      );
      chordCursorRef.current = idx;
      nextChordTimeRef.current = startTimeRef.current + idx * sec;
    }
  }, [arc, tonic, minor, tempoIdx, lengthIdx, replan]);

  // ── the look-ahead scheduler ──
  const runScheduler = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sec = secPerChordRef.current;
    const horizon = audio.currentTime + LOOKAHEAD_S;
    const planned = plannedRef.current;
    while (
      chordCursorRef.current < planned.length &&
      nextChordTimeRef.current < horizon
    ) {
      const chord = planned[chordCursorRef.current];
      audio.scheduleChord(chord, nextChordTimeRef.current, sec);
      nextChordTimeRef.current += sec;
      chordCursorRef.current++;
    }
    if (chordCursorRef.current >= planned.length) {
      // piece complete — stop scheduling, let last chord ring, then mark
      if (schedulerRef.current) {
        window.clearInterval(schedulerRef.current);
        schedulerRef.current = null;
      }
    }
  }, []);

  // ── rAF render + UI sync ──
  const renderLoop = useCallback(() => {
    const renderer = rendererRef.current;
    const audio = audioRef.current;
    const planned = plannedRef.current;
    const sec = secPerChordRef.current;
    if (renderer) {
      let playhead = 0;
      let liveIdx = 0;
      if (audio && runningRef.current) {
        const t = audio.currentTime - startTimeRef.current;
        playhead = Math.max(0, Math.min(1, t / (sec * planned.length)));
        liveIdx = Math.max(
          0,
          Math.min(planned.length - 1, Math.floor(t / sec)),
        );
      } else {
        liveIdx = liveIndexRef.current;
      }
      liveIndexRef.current = liveIdx;
      const live = planned[liveIdx];
      const measures = live
        ? {
            diameter: live.achieved.diameter,
            momentum: live.achieved.momentum,
            strain: live.achieved.strain,
            tension: live.achieved.tension,
          }
        : { diameter: 0, momentum: 0, strain: 0, tension: 0 };
      const keyLabel = live
        ? `${noteName(live.keyTonic)} ${live.keyMinor ? "min" : "maj"}`
        : `${TONICS[tonic]} ${minor ? "min" : "maj"}`;
      renderer.draw({
        chords: planned,
        targetSamples: targetSamplesRef.current,
        playhead,
        liveIndex: liveIdx,
        keyLabel,
        arcLabel: arcById(arc).label,
        measures,
      });

      // throttle React state updates
      if (live && live !== liveChord) setLiveChord(live);
      if (audio && runningRef.current) {
        const el = audio.currentTime - startTimeRef.current;
        setElapsed(el);
        if (el >= sec * planned.length + 0.5 && !finished) {
          setFinished(true);
          runningRef.current = false;
          setRunning(false);
        }
      }
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [arc, tonic, minor, liveChord, finished]);

  // start rAF + renderer once mounted (renders the planned arc even before
  // audio starts — graceful degradation)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      rendererRef.current = new RibbonRenderer(canvas);
    } catch {
      return;
    }
    rafRef.current = requestAnimationFrame(renderLoop);
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [renderLoop]);

  // ── start / stop ──
  const start = useCallback(async () => {
    setFinished(false);
    setNotice(null);
    // create audio in the gesture (iOS-safe)
    if (!audioRef.current) {
      try {
        audioRef.current = new TensionAudio();
        await audioRef.current.resume();
        setAudioOk(true);
      } catch {
        setAudioOk(false);
        setNotice(
          "No audio device — showing the composed arc visually only.",
        );
        return;
      }
    } else {
      await audioRef.current.resume();
    }
    const audio = audioRef.current;
    replan(arc, tonic, minor, totalChordsRef.current);
    startTimeRef.current = audio.currentTime + 0.12;
    nextChordTimeRef.current = startTimeRef.current;
    chordCursorRef.current = 0;
    liveIndexRef.current = 0;
    runningRef.current = true;
    setRunning(true);
    if (schedulerRef.current) window.clearInterval(schedulerRef.current);
    schedulerRef.current = window.setInterval(runScheduler, TICK_MS);
    runScheduler();
  }, [arc, tonic, minor, replan, runScheduler]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (schedulerRef.current) {
      window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
  }, []);

  // teardown audio + scheduler on unmount
  useEffect(() => {
    return () => {
      if (schedulerRef.current) window.clearInterval(schedulerRef.current);
      schedulerRef.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  // ── auto-start (hands-free glance) ~1.2s after mount ──
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!runningRef.current) void start();
    }, 1200);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── keyboard controls ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      // 1..5 pick arc shape
      if (k >= "1" && k <= "5") {
        const i = Number(k) - 1;
        if (ARCS[i]) setArc(ARCS[i].id);
        return;
      }
      switch (k) {
        case " ":
          e.preventDefault();
          if (runningRef.current) stop();
          else void start();
          break;
        case "arrowup":
          e.preventDefault();
          setTonic((t) => (t + 7) % 12); // transpose up a fifth
          break;
        case "arrowdown":
          e.preventDefault();
          setTonic((t) => (t + 5) % 12); // transpose down a fifth
          break;
        case "arrowright":
          e.preventDefault();
          setTempoIdx((i) => Math.max(0, i - 1)); // faster (fewer sec/chord)
          break;
        case "arrowleft":
          e.preventDefault();
          setTempoIdx((i) => Math.min(TEMPO_OPTIONS.length - 1, i + 1));
          break;
        case "m":
          setMinor((v) => !v);
          break;
        case "[":
          setLengthIdx((i) => Math.max(0, i - 1));
          break;
        case "]":
          setLengthIdx((i) => Math.min(LENGTH_OPTIONS.length - 1, i + 1));
          break;
        case "p":
          // seed a perturbation: nudge the key chromatically then restore
          setTonic((t) => (t + 1) % 12);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start, stop]);

  const mm = String(Math.floor(elapsed / 60)).padStart(1, "0");
  const ss = String(Math.floor(elapsed % 60)).padStart(2, "0");

  return (
    <main className="relative min-h-screen w-full bg-[#14130f] text-foreground">
      {/* header */}
      <div className="mx-auto max-w-6xl px-5 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-semibold text-3xl text-foreground">
              Tension Journey
            </h1>
            <p className="mt-1 max-w-2xl text-base text-muted-foreground">
              Pick an emotional tension <span className="text-violet-300/95">arc</span>; a
              transparent engine searches harmony with Chew&apos;s Spiral
              Array so the music&apos;s <em>measured</em> tonal tension
              tracks that exact curve — every chord chosen for a numeric reason.
            </p>
          </div>
          <a
            href="/dream/983-tension-journey/README.md"
            className="shrink-0 text-sm text-violet-300 underline decoration-violet-300/40 underline-offset-4 hover:text-violet-200"
          >
            Read the design notes ↗
          </a>
        </div>
      </div>

      {/* canvas */}
      <div className="mx-auto mt-4 max-w-6xl px-5">
        <div className="relative h-[460px] w-full overflow-hidden rounded-lg border border-border bg-[#14130f]">
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>
      </div>

      {/* controls */}
      <div className="mx-auto mt-4 max-w-6xl px-5 pb-28">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => (running ? stop() : void start())}
            className={`min-h-[44px] rounded-md px-5 py-2.5 text-base font-semibold transition-colors ${
              running
                ? "bg-violet-500/20 text-violet-200 hover:bg-violet-500/30"
                : "bg-violet-400/90 text-[#14130f] hover:bg-violet-300"
            }`}
          >
            {running ? "Pause" : finished ? "Replay" : "Start"}
          </button>
          <span className="font-mono text-base text-foreground">
            {mm}:{ss}
          </span>
          {finished && (
            <span className="text-sm text-violet-300/95">
              arc complete — minute 5 ≠ minute 1
            </span>
          )}
        </div>

        {/* arc presets */}
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted-foreground">
            Target arc shape{" "}
            <span className="font-mono text-muted-foreground">(keys 1–5)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {ARCS.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setArc(a.id)}
                title={a.hint}
                className={`min-h-[44px] rounded-md px-4 py-2.5 text-sm transition-colors ${
                  arc === a.id
                    ? "bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/50"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                <span className="font-mono text-muted-foreground">{i + 1}</span>{" "}
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* legend / status row */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-border bg-muted p-3">
            <p className="text-sm text-muted-foreground">Key</p>
            <p className="mt-1 font-mono text-base text-foreground">
              {TONICS[tonic]} {minor ? "minor" : "major"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              ↑ / ↓ transpose by fifths · <span className="font-mono">m</span>{" "}
              toggle mode · <span className="font-mono">p</span> perturb
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted p-3">
            <p className="text-sm text-muted-foreground">Tempo (sec / chord)</p>
            <p className="mt-1 font-mono text-base text-foreground">
              {TEMPO_OPTIONS[tempoIdx].toFixed(1)}s
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              ← slower · → faster
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted p-3">
            <p className="text-sm text-muted-foreground">Length</p>
            <p className="mt-1 font-mono text-base text-foreground">
              {LENGTH_OPTIONS[lengthIdx].label} ·{" "}
              {LENGTH_OPTIONS[lengthIdx].chords} chords
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono">[</span> shorter ·{" "}
              <span className="font-mono">]</span> longer ·{" "}
              <span className="font-mono">space</span> play/pause
            </p>
          </div>
        </div>

        {/* live "why" readout */}
        {liveChord && (
          <div className="mt-4 rounded-md border border-border bg-muted p-3">
            <p className="text-sm text-muted-foreground">
              Now playing — the engine&apos;s justification
            </p>
            <p className="mt-1 text-base text-foreground">
              <span className="font-semibold text-violet-300/95">
                {liveChord.name}
              </span>{" "}
              <span className="font-mono text-violet-300">
                {liveChord.roman}
              </span>{" "}
              <span className="text-muted-foreground">— {liveChord.why}</span>
            </p>
            <p className="mt-1 font-mono text-sm text-muted-foreground">
              target {liveChord.target.toFixed(2)} · achieved{" "}
              {liveChord.achieved.tension.toFixed(2)}
              {liveChord.modulated ? " · ↳ modulated key" : ""}
            </p>
          </div>
        )}

        {notice && (
          <p className="mt-3 text-sm text-violet-300">{notice}</p>
        )}
        {!audioOk && (
          <p className="mt-2 text-sm text-muted-foreground">
            (Visual-only mode: the planned tension ribbon still renders.)
          </p>
        )}
      </div>
    </main>
  );
}
