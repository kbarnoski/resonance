"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioEngine,
  buildEngine,
  attachMic,
  estimatePitch,
  startDrone,
  setDroneLevel,
  singNote,
  SCALE_HZ,
} from "./audio";
import {
  MemoryState,
  makeMemory,
  rememberPhrase,
  composeReply,
} from "./memory";
import { Creature, makeCreature, drawCreature } from "./creature";
import { Fallback, makeFallback } from "./fallback";

type Mode = "idle" | "mic" | "ghost";

export default function KidsSongSprout() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [micNote, setMicNote] = useState<string | null>(null); // rose-300 notice
  const [usingFallback, setUsingFallback] = useState(false);
  // visible "stage of life" label so growth is legible
  const [stage, setStage] = useState("a tiny spark");
  const [heard, setHeard] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const fbCanvasRef = useRef<HTMLCanvasElement>(null);

  // refs holding live engine state across the rAF loop
  const engRef = useRef<AudioEngine | null>(null);
  const memRef = useRef<MemoryState>(makeMemory());
  const creatureRef = useRef<Creature | null>(null);
  const fallbackRef = useRef<Fallback | null>(null);
  const modeRef = useRef<Mode>("idle");

  const handleStart = async (withMic: boolean) => {
    if (started) return;
    setStarted(true);
    const eng = buildEngine();
    engRef.current = eng;
    if (eng.ctx.state === "suspended") {
      try {
        await eng.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    startDrone(eng);

    if (withMic) {
      const ok = await attachMic(eng);
      if (ok) {
        setMode("mic");
        modeRef.current = "mic";
      } else {
        setMicNote(
          "No microphone — your sprout will hum to itself. Allow mic access and reload to sing together."
        );
        setMode("ghost");
        modeRef.current = "ghost";
      }
    } else {
      setMode("ghost");
      modeRef.current = "ghost";
    }
  };

  // ── main effect: visuals + audio brain ──────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const eng = engRef.current;
    const container = containerRef.current;
    if (!eng || !container) return;

    // Try three.js; fall back to Canvas2D.
    let creature: Creature | null = null;
    let fallback: Fallback | null = null;
    try {
      creature = makeCreature(container);
      creatureRef.current = creature;
    } catch {
      setUsingFallback(true);
      const cv = fbCanvasRef.current;
      if (cv) {
        fallback = makeFallback(cv);
        fallbackRef.current = fallback;
      }
    }

    const onResize = () => {
      creatureRef.current?.resize();
      fallbackRef.current?.resize();
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const t0 = performance.now();

    // listening / singing visual energies (smoothed)
    let listenEnergy = 0;
    let singEnergy = 0;
    let leanX = 0;

    // phrase capture (from mic)
    let inPhrase = false;
    let phrasePitches: number[] = [];
    let phraseDurs: number[] = [];
    let lastVoiceMs = 0;
    let lastPitchMs = 0;

    // sing-back cadence
    let lastHeardMs = performance.now();
    let lastReplyMs = performance.now();
    let nextReplyGapMs = 5000;

    // active sing-back schedule (so visuals know when it's singing)
    let singUntil = 0; // performance.now() ms

    // ghost demo: a virtual child hums little phrases
    let ghostNextMs = performance.now() + 1500;

    const ghostPhrase = () => {
      // pick a short shapely contour from the scale (a "hummed" phrase)
      const len = 2 + Math.floor(Math.random() * 3);
      const startDeg = 4 + Math.floor(Math.random() * 5);
      const steps = [-2, -1, 1, 2, 0];
      const pitches: number[] = [];
      const durs: number[] = [];
      let d = startDeg;
      for (let i = 0; i < len; i++) {
        d = Math.max(2, Math.min(SCALE_HZ.length - 2, d + steps[Math.floor(Math.random() * steps.length)]));
        pitches.push(SCALE_HZ[d]);
        durs.push(0.25 + Math.random() * 0.3);
      }
      rememberPhrase(memRef.current, pitches, durs);
      // brief listening flash so the creature reacts to its "child"
      listenEnergy = Math.max(listenEnergy, 0.8);
      leanX = (Math.random() - 0.5) * 1.4;
      lastHeardMs = performance.now();
    };

    const performReply = (now: number) => {
      const reply = composeReply(memRef.current);
      const g = memRef.current.growth;
      let when = eng.ctx.currentTime + 0.05;
      let total = 0;
      for (const n of reply) {
        when += n.gap;
        total += n.gap + n.dur;
        singNote(eng, n.hz, when, n.dur, g, 0.9);
        when += n.dur * 0.7; // slight overlap for legato as it matures
      }
      singUntil = now + total * 1000 + 400;
      lastReplyMs = now;
      // older sprouts reply a bit more often & with shorter waits
      nextReplyGapMs = 4200 - g * 1600 + Math.random() * 2500;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const time = (now - t0) / 1000;
      const mem = memRef.current;
      const g = mem.growth;

      // ── MIC PATH: estimate pitch, capture phrases ──
      if (modeRef.current === "mic" && eng.analyser && eng.timeBuf) {
        eng.analyser.getFloatTimeDomainData(
          eng.timeBuf as unknown as Float32Array<ArrayBuffer>
        );
        const { hz, rms } = estimatePitch(eng.timeBuf, eng.sampleRate);
        const voiced = rms > 0.012 && hz > 0;

        if (voiced) {
          listenEnergy = Math.min(1, listenEnergy + 0.15 + rms);
          lastVoiceMs = now;
          lastHeardMs = now;
          leanX += ((Math.log2(hz / 220) * 0.6) - leanX) * 0.1;
          if (!inPhrase) {
            inPhrase = true;
            phrasePitches = [];
            phraseDurs = [];
            lastPitchMs = now;
          }
          // sample pitch at ~ up to 12/sec; accumulate dur
          if (now - lastPitchMs > 90) {
            phrasePitches.push(hz);
            phraseDurs.push(Math.min(0.7, (now - lastPitchMs) / 1000));
            lastPitchMs = now;
          }
        }
        // end phrase after ~700ms silence
        if (inPhrase && now - lastVoiceMs > 700) {
          inPhrase = false;
          if (phrasePitches.length >= 1) {
            rememberPhrase(mem, phrasePitches, phraseDurs);
            setHeard(mem.notesHeard);
          }
        }
      }

      // ── GHOST PATH: virtual child hums on its own ──
      if (modeRef.current === "ghost" && now > ghostNextMs) {
        ghostPhrase();
        setHeard(memRef.current.notesHeard);
        // hum every few seconds, leaving quiet windows for the sprout to reply
        ghostNextMs = now + 3000 + Math.random() * 3500;
      }

      // ── SING-BACK cadence: when child is quiet & enough time passed ──
      const quietFor = now - lastHeardMs;
      if (
        now - lastReplyMs > nextReplyGapMs &&
        quietFor > 900 &&
        now > singUntil
      ) {
        performReply(now);
      }

      // singing energy follows the schedule
      const isSinging = now < singUntil;
      singEnergy += ((isSinging ? 0.9 : 0) - singEnergy) * 0.12;

      // decay listening + lean toward rest
      listenEnergy *= 0.94;
      leanX *= 0.96;

      // drone fills out as it grows
      setDroneLevel(eng, g);

      // ── stage label (legible growth) ──
      const newStage =
        g < 0.12 ? "a tiny spark" :
        g < 0.3 ? "a curious sprout" :
        g < 0.55 ? "growing braver" :
        g < 0.78 ? "a singing friend" :
        "a grown song-being";
      setStage((s) => (s === newStage ? s : newStage));

      // ── render ──
      const cf = {
        time,
        growth: g,
        listening: Math.min(1, listenEnergy),
        singing: Math.min(1, singEnergy),
        leanX: Math.max(-1, Math.min(1, leanX)),
      };
      if (creatureRef.current) drawCreature(creatureRef.current, cf);
      else if (fallbackRef.current) fallbackRef.current.draw(cf);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      creatureRef.current?.dispose();
      creatureRef.current = null;
      fallbackRef.current = null;
      eng.ctx.close().catch(() => undefined);
    };
  }, [started]);

  // ── start screen ──────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#02040a] px-6 text-center text-foreground">
        <div className="text-5xl select-none" aria-hidden="true">🌱</div>
        <h1 className="text-3xl font-semibold text-foreground">Song Sprout</h1>
        <p className="max-w-sm text-base text-muted-foreground">
          A tiny glowing creature that listens to your little songs, remembers
          them, and slowly grows up — singing your own melodies back, made new.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleStart(true)}
            className="min-h-[44px] rounded-2xl border border-violet-400/40 bg-violet-500/25 px-6 py-3 text-lg font-medium text-foreground transition-colors hover:bg-violet-500/40"
          >
            🎤 Sing to your sprout
          </button>
          <button
            onClick={() => handleStart(false)}
            className="min-h-[44px] rounded-2xl border border-border bg-muted px-6 py-3 text-base text-muted-foreground transition-colors hover:bg-accent"
          >
            Just watch it grow (no mic)
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Hum a few notes. Then go quiet — and listen back. For little ones 3+.
        </p>
      </div>
    );
  }

  // ── live screen ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#02040a]">
      {/* three.js mounts here */}
      <div ref={containerRef} className="absolute inset-0" />
      {/* canvas2d fallback (only visible if used) */}
      {usingFallback && (
        <canvas ref={fbCanvasRef} className="absolute inset-0 h-full w-full" />
      )}

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-5 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Song Sprout</h1>
        <p className="text-base text-violet-300">{stage}</p>
        <p className="text-base text-muted-foreground">
          {mode === "ghost"
            ? "watching your sprout hum to itself"
            : "hum a little song, then go quiet and listen"}
        </p>
        {heard > 0 && (
          <p className="text-sm text-muted-foreground">
            it remembers {heard} note{heard === 1 ? "" : "s"} of your songs
          </p>
        )}
      </div>

      {micNote && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 text-center">
          <p className="mx-auto max-w-md text-base text-violet-300">{micNote}</p>
        </div>
      )}
    </div>
  );
}
