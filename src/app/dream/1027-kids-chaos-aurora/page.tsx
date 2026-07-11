"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  DEFAULT_PARAMS,
  PendulumState,
  stepRK4,
  lowerBobPos,
  lowerBobSpeed,
  applyFlick,
  isSettled,
} from "./physics";
import {
  PROGRESSION,
  chordIndexAt,
  snapToChord,
} from "./harmony";
import { createAudioEngine, AudioEngine } from "./audio";
import {
  drawScene,
  lowerBobScreen,
  TrailPoint,
  Bloom,
} from "./render";

// ════════════════════════════════════════════════════════════════════════════
// Kids Chaos Aurora (1027)
//
// THE ONE QUESTION: "What if a 4-year-old could flick a glowing DOUBLE PENDULUM
// and watch it dance a never-the-same-twice aurora ribbon, singing a real chord
// progression that never exactly repeats?"
//
// A genuine double pendulum (RK4-integrated Lagrangian, light damping) is the
// generative engine. Its chaotic lower-bob path draws a fading aurora trail and,
// snapped to the live chord of a slow I–vi–IV–V progression, sings warm glass
// chimes over an always-on drone pad. Tap/flick to add energy; auto-demo
// re-flicks after idle so a hands-free glance always sees & hears it dancing.
//
// THREE+ SUBSYSTEMS: (1) chaotic double-pendulum physics; (2) functional-harmony
// snapping synth + drone; (3) Canvas2D additive-glow aurora renderer.
// NAMED REFERENCE: the double pendulum / deterministic chaos (Lagrangian
// mechanics; sensitive dependence on initial conditions). See README.
// ════════════════════════════════════════════════════════════════════════════

const FIXED_DT = 1 / 240; // physics step
const MAX_SUBSTEPS = 8;
const IDLE_BEFORE_DEMO = 2.0; // seconds of low energy before auto-demo re-flicks

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiltOn, setTiltOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Mutable engine state lives in refs (no re-render churn).
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<PendulumState>({ t1: 2.3, t2: 1.0, w1: 0, w2: 0 });
  const trailRef = useRef<TrailPoint[]>([]);
  const bloomsRef = useRef<Bloom[]>([]);
  const lastTimeRef = useRef<number>(0);
  const accRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const idleTimerRef = useRef<number>(0);
  const lastYSignRef = useRef<number>(0); // for zero-crossing note onsets
  const gAngleRef = useRef<number>(0); // tilt-adjusted gravity direction
  const lastChordRef = useRef<number>(-1);
  const noteCooldownRef = useRef<number>(0);

  // ── Flick / impulse ─────────────────────────────────────────────────────────
  const flick = useCallback((strength: number) => {
    stateRef.current = applyFlick(stateRef.current, strength);
    idleTimerRef.current = 0;
    // Immediate chime so every tap responds in <50ms.
    const eng = engineRef.current;
    if (eng) {
      const tEl = (performance.now() - startWallRef.current) / 1000;
      const chord = PROGRESSION[chordIndexAt(tEl)];
      const f = snapToChord(0.6, chord, 0);
      eng.playChime(f, 0.5, eng.ctx.currentTime + 0.001);
    }
  }, []);

  // ── Animation loop ──────────────────────────────────────────────────────────
  const runFrame = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      const eng = engineRef.current;
      if (!canvas || !eng) {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const W = cssW;
      const H = cssH;

      // Fixed-step physics with accumulator.
      let frameDt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      if (!Number.isFinite(frameDt) || frameDt < 0) frameDt = 0;
      frameDt = Math.min(frameDt, 0.05);
      accRef.current += frameDt;

      let steps = 0;
      while (accRef.current >= FIXED_DT && steps < MAX_SUBSTEPS) {
        const next = stepRK4(
          stateRef.current,
          DEFAULT_PARAMS,
          FIXED_DT,
          gAngleRef.current,
        );

        // Zero-crossing of the lower bob's horizontal position = clean onset.
        const nextX = lowerBobPos(next, DEFAULT_PARAMS).x;
        const sign = nextX >= 0 ? 1 : -1;
        if (
          sign !== lastYSignRef.current &&
          lastYSignRef.current !== 0 &&
          noteCooldownRef.current <= 0
        ) {
          triggerNote(eng, next, W, H);
          noteCooldownRef.current = 0.07; // small debounce
        }
        lastYSignRef.current = sign;
        noteCooldownRef.current -= FIXED_DT;

        stateRef.current = next;
        accRef.current -= FIXED_DT;
        steps++;
      }

      // Advance the drone chord on the slow clock.
      const tEl = (now - startWallRef.current) / 1000;
      const ci = chordIndexAt(tEl);
      if (ci !== lastChordRef.current) {
        lastChordRef.current = ci;
        eng.setDrone(PROGRESSION[ci]);
      }

      // Trail update from the lower bob math position.
      const pos = lowerBobPos(stateRef.current, DEFAULT_PARAMS);
      const speed = lowerBobSpeed(stateRef.current, DEFAULT_PARAMS);
      const speedNorm = Math.max(0, Math.min(1, speed / 8));
      trailRef.current.push({ x: pos.x, y: pos.y, speed: speedNorm, life: 1 });
      for (const tp of trailRef.current) tp.life -= 0.012;
      while (trailRef.current.length > 0 && trailRef.current[0].life <= 0) {
        trailRef.current.shift();
      }
      if (trailRef.current.length > 600) trailRef.current.shift();

      // Blooms fade.
      for (const b of bloomsRef.current) {
        b.life -= 0.03;
        b.r += 1.4;
      }
      bloomsRef.current = bloomsRef.current.filter((b) => b.life > 0);

      // Auto-demo: if settled too long, re-flick so it always dances.
      if (isSettled(stateRef.current)) {
        idleTimerRef.current += frameDt;
        if (idleTimerRef.current >= IDLE_BEFORE_DEMO) {
          idleTimerRef.current = 0;
          const k = 2.5 + Math.sin(now * 0.0013) * 1.8; // varying gentle re-flick
          stateRef.current = applyFlick(stateRef.current, k);
        }
      } else {
        idleTimerRef.current = 0;
      }

      drawScene(ctx, {
        state: stateRef.current,
        params: DEFAULT_PARAMS,
        trail: trailRef.current,
        blooms: bloomsRef.current,
        speedNorm,
        width: W,
        height: H,
      });

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [],
  );

  // Trigger a snapped chime + bloom on a swing zero-crossing.
  function triggerNote(
    eng: AudioEngine,
    s: PendulumState,
    W: number,
    H: number,
  ) {
    const tEl = (performance.now() - startWallRef.current) / 1000;
    const chord = PROGRESSION[chordIndexAt(tEl)];
    const pos = lowerBobPos(s, DEFAULT_PARAMS);
    // Height: bob low (y large) → low pitch; bob high (y small/neg) → high pitch.
    const reach = DEFAULT_PARAMS.l1 + DEFAULT_PARAMS.l2;
    const h = 1 - (pos.y + reach) / (2 * reach); // ~[0,1]
    const speed = lowerBobSpeed(s, DEFAULT_PARAMS);
    const speedNorm = Math.max(0, Math.min(1, speed / 8));
    const octaveBias = speedNorm > 0.6 ? 1 : 0; // energy → octave up
    const freq = snapToChord(h, chord, octaveBias);
    eng.playChime(freq, 0.35 + speedNorm * 0.6, eng.ctx.currentTime + 0.001);

    const sp = lowerBobScreen(s, DEFAULT_PARAMS, W, H);
    bloomsRef.current.push({ x: sp.x, y: sp.y, r: 18, life: 1 });
  }

  // ── Tilt (optional) ─────────────────────────────────────────────────────────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    // gamma: left/right tilt in degrees → small gravity-direction nudge.
    const gamma = e.gamma ?? 0;
    gAngleRef.current = Math.max(-0.6, Math.min(0.6, (gamma / 90) * 0.6));
    setTiltOn(true);
  }, []);

  // ── Start (gesture-gated audio) ─────────────────────────────────────────────
  const start = useCallback(async () => {
    try {
      const eng = createAudioEngine();
      if (eng.ctx.state === "suspended") await eng.ctx.resume();
      engineRef.current = eng;
      eng.setDrone(PROGRESSION[0]);
      lastChordRef.current = 0;

      // iOS tilt permission must be requested inside this same tap.
      const doe = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof doe.requestPermission === "function") {
        try {
          const res = await doe.requestPermission();
          if (res === "granted") {
            window.addEventListener("deviceorientation", onOrient);
          }
        } catch {
          /* tilt is optional — ignore */
        }
      } else if ("DeviceOrientationEvent" in window) {
        window.addEventListener("deviceorientation", onOrient);
      }

      startWallRef.current = performance.now();
      lastTimeRef.current = performance.now();
      stateRef.current = applyFlick(stateRef.current, 3.5); // an opening dance
      setStarted(true);
      rafRef.current = requestAnimationFrame(runFrame);
    } catch (err) {
      setError(
        "Sound could not start on this device. Try tapping Start again.",
      );
      console.error(err);
    }
  }, [onOrient, runFrame]);

  // ── Pointer input ───────────────────────────────────────────────────────────
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(
    null,
  );
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, []);
  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!d) {
        flick(2.5);
        return;
      }
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const dt = Math.max(1, performance.now() - d.t);
      const speed = (Math.hypot(dx, dy) / dt) * 1000; // px/s
      const strength = 1.5 + Math.min(5, speed / 250);
      flick(strength);
    },
    [flick],
  );

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      const eng = engineRef.current;
      if (eng) void eng.close();
      engineRef.current = null;
    };
  }, [onOrient]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#060a16] text-foreground select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={started ? onPointerDown : undefined}
        onPointerUp={started ? onPointerUp : undefined}
      />

      {/* Title + secondary line */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 p-5">
        <h1 className="text-xl font-semibold text-foreground drop-shadow">
          Aurora Pendulum
        </h1>
        <p className="text-base text-muted-foreground">
          Flick the glowing dancer. Listen to it sing.
        </p>
        {started && tiltOn && (
          <p className="text-base text-muted-foreground">Tilt to bend the sky.</p>
        )}
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/40 backdrop-blur-sm">
          <button
            onClick={start}
            className="flex h-[88px] min-w-[220px] items-center justify-center rounded-full bg-gradient-to-r from-violet-400 via-violet-400 to-violet-300 px-10 text-2xl font-bold text-[#0a0f1f] shadow-2xl active:scale-95"
            style={{ minHeight: 72 }}
          >
            ▶ Start
          </button>
          <p className="max-w-xs px-6 text-center text-base text-muted-foreground">
            Tap Start, then flick the glowing pendulum to make it dance and sing.
          </p>
          {error && (
            <p className="px-6 text-center text-base text-violet-300">{error}</p>
          )}
        </div>
      )}

      {started && error && (
        <div className="absolute bottom-20 left-0 right-0 px-6 text-center text-base text-violet-300">
          {error}
        </div>
      )}

      {/* Big flick target hint while playing (also tappable area is whole canvas) */}
      {started && (
        <button
          onClick={() => flick(3)}
          aria-label="flick"
          className="absolute bottom-6 left-1/2 h-[72px] min-w-[160px] -translate-x-1/2 rounded-full bg-muted px-8 text-lg font-semibold text-foreground backdrop-blur active:scale-95"
        >
          ✦ Flick
        </button>
      )}

      {/* Design notes link */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-3 right-3 text-base text-muted-foreground underline decoration-dotted"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-x-4 bottom-16 max-h-[60vh] overflow-auto rounded-2xl bg-[#0a1024]/95 p-5 text-base text-muted-foreground shadow-2xl">
          <h2 className="mb-2 text-lg font-semibold text-foreground">
            Design notes
          </h2>
          <p className="mb-2">
            A real <strong>double pendulum</strong> — two rods, two bobs —
            integrated with a fixed-step RK4 solver from the Lagrangian equations
            of motion, with light damping. Its motion is{" "}
            <em>deterministic chaos</em>: fully determined by physics yet so
            sensitive to starting conditions that it never exactly repeats.
          </p>
          <p className="mb-2">
            The lower bob&apos;s path draws the glowing aurora trail. Its height
            picks a note, snapped to the live chord of a slow{" "}
            <strong>I–vi–IV–V</strong> progression in C major — so the chaotic
            tune is always in key but never loops. A soft drone pad keeps it from
            ever going silent. Speed brightens the color and the chime.
          </p>
          <p>
            Reference: the double pendulum and deterministic chaos (Lagrangian
            mechanics; sensitive dependence on initial conditions) — a kin to
            artificial life&apos;s idea of open-ended novelty from simple
            deterministic rules.
          </p>
        </div>
      )}
    </main>
  );
}
