"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeEngine,
  makeScheduler,
  applyFlockGain,
  runChirp,
  startPad,
  type AudioEngine,
  type CanonState,
} from "./audio";
import {
  makeRenderer,
  birdHue,
  type Renderer,
  type SceneState,
  type BirdView,
} from "./gl";
import {
  applyPitchHz,
  applyPitchSnap,
  makeMelodyFromDrag,
  makeDefaultMelody,
  SCALE_LEN,
  type MelodyNote,
  type DragSample,
} from "./melody";

const MAX_BIRDS = 4;

export default function KidsBirdRound() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [birdCount, setBirdCount] = useState(1);
  const [hasMelody, setHasMelody] = useState(false);

  // engine + scheduler refs (live across renders)
  const engineRef = useRef<AudioEngine | null>(null);
  const schedRef = useRef<ReturnType<typeof makeScheduler> | null>(null);
  const stopPadRef = useRef<(() => void) | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  // shared canon state (mutated, read by scheduler each tick)
  const canonRef = useRef<CanonState>({ melody: makeDefaultMelody(), voices: 1 });

  // live drag capture
  const dragRef = useRef<{
    active: boolean;
    pointerId: number | null;
    samples: DragSample[];
    pitch01: number;
    lastChirp: number;
  }>({ active: false, pointerId: null, samples: [], pitch01: 0.5, lastChirp: 0 });

  // last interaction time (for idle auto-demo)
  const lastInteractRef = useRef<number>(0);
  const autoDoneRef = useRef<boolean>(false);

  // bird visual state, persisted across frames for smooth glow/trails
  const birdsRef = useRef<BirdView[]>([
    { x: 0.5, y: 0.5, hue: 0.25, glow: 0, trail: [] },
  ]);

  // keep canon voices in sync with React state
  useEffect(() => {
    canonRef.current.voices = birdCount;
    const eng = engineRef.current;
    if (eng) applyFlockGain(eng, birdCount);
    // ensure a bird view exists per voice
    const views = birdsRef.current;
    while (views.length < birdCount) {
      const v = views.length;
      views.push({
        x: 0.22 + v * 0.2,
        y: 0.5,
        hue: 0.22,
        glow: 0,
        trail: [],
      });
    }
    views.length = birdCount;
  }, [birdCount]);

  const commitMelody = useCallback((melody: MelodyNote[]) => {
    canonRef.current.melody = melody;
    setHasMelody(true);
  }, []);

  // ---- start / teardown -----------------------------------------------------
  const start = useCallback(() => {
    if (started) return;
    const eng = makeEngine();
    if (!eng) {
      // No audio available — still show the scene; just flag started.
      setStarted(true);
      return;
    }
    if (eng.ctx.state === "suspended") void eng.ctx.resume();
    engineRef.current = eng;
    stopPadRef.current = startPad(eng);
    applyFlockGain(eng, 1);
    schedRef.current = makeScheduler(eng, () => canonRef.current);
    lastInteractRef.current = performance.now();
    setStarted(true);
  }, [started]);

  // teardown on unmount
  useEffect(() => {
    return () => {
      schedRef.current?.stop();
      stopPadRef.current?.();
      rendererRef.current?.dispose();
      const eng = engineRef.current;
      if (eng && eng.ctx.state !== "closed") {
        void eng.ctx.close().catch(() => {});
      }
      engineRef.current = null;
    };
  }, []);

  // ---- pointer handlers (drag the bird) -------------------------------------
  const pointToPitch01 = useCallback((clientY: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0.5;
    const r = canvas.getBoundingClientRect();
    const yy = (clientY - r.top) / r.height; // 0 top .. 1 bottom
    return Math.max(0, Math.min(1, 1 - yy)); // invert: up = high
  }, []);

  const pointToX01 = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0.5;
    const r = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      autoDoneRef.current = true; // any touch cancels future auto-demo
      lastInteractRef.current = performance.now();
      const d = dragRef.current;
      d.active = true;
      d.pointerId = e.pointerId;
      d.samples = [];
      d.pitch01 = pointToPitch01(e.clientY);
      d.lastChirp = 0;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      // move lead bird to finger x
      birdsRef.current[0].x = pointToX01(e.clientX);
    },
    [started, pointToPitch01, pointToX01],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      lastInteractRef.current = performance.now();
      const p = pointToPitch01(e.clientY);
      d.pitch01 = p;
      d.samples.push({ t: performance.now(), pitch01: p });
      birdsRef.current[0].x = pointToX01(e.clientX);
      birdsRef.current[0].y = p;

      // live chirp under finger, throttled, snapped to scale
      const eng = engineRef.current;
      if (eng) {
        const now = eng.ctx.currentTime;
        if (now - d.lastChirp > 0.12) {
          runChirp(eng, applyPitchHz(p), now, 0.85);
          d.lastChirp = now;
          birdsRef.current[0].hue = birdHue(applyPitchSnap(p), SCALE_LEN);
          birdsRef.current[0].glow = 1;
        }
      }
    },
    [pointToPitch01, pointToX01],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      d.active = false;
      d.pointerId = null;
      lastInteractRef.current = performance.now();
      const melody = makeMelodyFromDrag(d.samples);
      commitMelody(melody);
    },
    [commitMelody],
  );

  const addBird = useCallback(() => {
    autoDoneRef.current = true;
    lastInteractRef.current = performance.now();
    setBirdCount((c) => Math.min(MAX_BIRDS, c + 1));
  }, []);

  const resetFlock = useCallback(() => {
    lastInteractRef.current = performance.now();
    setBirdCount(1);
  }, []);

  // ---- render + auto-demo loop ----------------------------------------------
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeRenderer(canvas);
    rendererRef.current = renderer;

    let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      renderer?.resize(canvas.clientWidth, canvas.clientHeight, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const t0 = performance.now();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const nowMs = performance.now();
      const eng = engineRef.current;

      // idle auto-demo: ~2s after start with no touch, sing default + add a bird
      if (
        !autoDoneRef.current &&
        nowMs - lastInteractRef.current > 2000 &&
        eng
      ) {
        autoDoneRef.current = true;
        commitMelody(makeDefaultMelody());
        setBirdCount((c) => Math.max(2, c));
      }

      // decay glows; advance trails
      const views = birdsRef.current;
      for (const b of views) {
        b.glow *= 0.92;
        // small horizontal drift so the flock feels alive
        b.trail.push({ x: b.x, y: b.y, a: 1 });
        if (b.trail.length > 10) b.trail.shift();
        for (const t of b.trail) t.a *= 0.86;
      }

      // pulse birds that sang since last frame (read scheduler pulses)
      if (eng) {
        const acNow = eng.ctx.currentTime;
        for (const p of eng.pulses) {
          if (p.at <= acNow && p.at > acNow - 0.08) {
            const b = views[p.bird];
            if (b) {
              b.glow = 1;
              b.hue = birdHue(p.scaleIdx, SCALE_LEN);
              // map the singing note to a vertical position so the bird bobs
              const targetY = 0.15 + (p.scaleIdx / (SCALE_LEN - 1)) * 0.7;
              b.y += (targetY - b.y) * 0.5;
            }
          }
        }
      }

      const drag = dragRef.current;
      const scene: SceneState = {
        birds: views,
        dragging: drag.active
          ? {
              x: views[0].x,
              y: drag.pitch01,
              hue: birdHue(applyPitchSnap(drag.pitch01), SCALE_LEN),
              glow: Math.max(0.6, views[0].glow),
            }
          : null,
        time: (nowMs - t0) / 1000,
      };
      renderer?.draw(scene);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, [started, commitMelody]);

  // ---------------------------------------------------------------------------
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#102018] select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      {/* Title + hint */}
      {started && (
        <div className="pointer-events-none absolute left-1/2 top-5 z-10 -translate-x-1/2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white/95 drop-shadow sm:text-3xl">
            🐦 Bird Round
          </h1>
          <p className="mt-1 text-base text-white/75 drop-shadow">
            {hasMelody
              ? "Add a bird to sing a round 🎶"
              : "Drag the bird up & down to sing 🎶"}
          </p>
        </div>
      )}

      {/* Big controls */}
      {started && (
        <div className="absolute inset-x-0 bottom-8 z-10 flex items-center justify-center gap-4 px-4">
          <button
            type="button"
            onClick={addBird}
            disabled={birdCount >= MAX_BIRDS}
            aria-label="Add a bird"
            className="flex min-h-[72px] min-w-[72px] flex-col items-center justify-center rounded-3xl bg-amber-300/90 px-6 py-3 text-2xl font-bold text-emerald-950 shadow-lg backdrop-blur transition active:scale-95 disabled:opacity-40"
          >
            <span className="text-3xl leading-none">🐦➕</span>
            <span className="mt-1 text-base">{birdCount}/4</span>
          </button>
          <button
            type="button"
            onClick={resetFlock}
            aria-label="Reset to one bird"
            className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-3xl bg-white/15 px-5 py-3 text-2xl text-white/90 shadow-lg backdrop-blur transition active:scale-95"
          >
            🔄
          </button>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#1a3326] to-[#0d1a13] px-6 text-center">
          <h1 className="text-3xl font-bold text-white/95 sm:text-4xl">
            🐦 Bird Round
          </h1>
          <p className="max-w-md text-base text-white/75">
            Teach a bird a little tune, then hear a whole flock sing it back as
            a round.
          </p>
          <button
            type="button"
            onClick={start}
            aria-label="Start"
            className="flex min-h-[96px] min-w-[96px] items-center justify-center rounded-full bg-amber-300 text-5xl text-emerald-950 shadow-2xl transition active:scale-95"
          >
            ▶️
          </button>
        </div>
      )}

      {/* design notes link */}
      <div className="absolute bottom-2 right-3 z-10">
        <Link
          href="/dream/946-kids-bird-round/README.md"
          className="text-xs text-white/55 underline-offset-2 hover:text-white/80 hover:underline"
        >
          Read the design notes
        </Link>
      </div>
    </main>
  );
}
