"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10440 · Escapement — a clock's swinging pendulum is a percussion instrument.
// Its pallets alternately CATCH and RELEASE a toothed escape wheel — the tick
// and the tock, the downbeat and the off-beat — while secondary hammers driven
// off the advancing wheel add interlocking coprime subdivisions.
//
//   ONE QUESTION
//   What if a clock's ESCAPEMENT — the swinging pendulum whose pallets
//   alternately catch and release an escape wheel — were a percussion
//   instrument, its tick and tock the downbeat and off-beat, with secondary
//   hammers driven off the wheel adding interlocking subdivisions?
//
//   INPUT   device-tilt (DeviceOrientation): beta → effective GRAVITY on the
//           pendulum → its swing period → the TEMPO; gamma → a swing BIAS that
//           limps the tick/tock groove. Drag on the canvas is the fallback.
//   OUTPUT  WebGL2 — the visible mechanism (wheel, anchor, pallets, pendulum,
//           hammers, strike-flashes) rendered as SDFs in brass/steel/graphite.
//   VERB    catch → release → step the wheel → drive the coprime hammers.
//   SOUND   percussion only — a wood knock for tick vs tock, inharmonic
//           metallic pings for the hammers. NO sustained drone.
//
//   Sonic continuum: a SLOW pendulum gives spacious, countable tick-tock; a
//   FAST one crowds the strikes toward a continuous mechanical buzz — the same
//   events crossing from discrete rhythm into texture. Because 3, 5 and 7 are
//   coprime, the subdivisions phase-drift: minute 5 sounds unlike minute 1.
//
//   Named reference: the PENDULUM CLOCK ESCAPEMENT — Christiaan Huygens, 1657 —
//   and the verge/anchor escapement; mechanical rhythm from escapement geometry.
//
//   Degrade ladder: tilt → pointer drag → a SEEDED auto-conductor (mulberry32,
//   seed 0x10440) that gently varies gravity so the mechanism swings and ticks
//   within ~1s of load, SILENTLY (audio waits for the first real gesture per
//   autoplay policy). Seed 0x10440; time from performance.now(); no Math.random
//   / Date.now anywhere (see rng.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mulberry32, ESCAPEMENT_SEED } from "./rng";
import { makeSceneBackend, LAYOUT, MAX_FLASH, type SceneBackend } from "./webgl";
import { EscapementAudio } from "./audio";

// ── tuning ───────────────────────────────────────────────────────────────────
const GHOST_DELAY = 1.0; // s with no input before the auto-conductor takes over
const OMEGA_MIN = 2.2; // rad/s — slow, spacious tick-tock (~0.7 events/s)
const OMEGA_MAX = 48.0; // rad/s — fast, crowded mechanical buzz (~15 events/s)
const DEFAULT_GRAVITY = 0.42; // pleasant mid tempo the instant Start is pressed
const WHEEL_SNAP = 22; // how fast the wheel visibly steps to its next tooth
const HAMMER_DECAY = 6.0; // strike-animation fade per second
const FLASH_DECAY = 5.5; // strike-flash fade per second
const MAX_EVENTS_PER_FRAME = 40; // guard against buzz + a stalled tab

interface Flash {
  x: number;
  y: number;
  inten: number;
  kind: number; // 0 tick, 1 tock, 2 hammer
}

type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function EscapementPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [auto, setAuto] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tempoLabel, setTempoLabel] = useState("—");

  // ── loop-owned refs (never read React state inside rAF) ──────────────────
  const backendRef = useRef<SceneBackend | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<EscapementAudio | null>(null);
  const rafRef = useRef(0);
  const rngRef = useRef<() => number>(mulberry32(ESCAPEMENT_SEED));

  // mechanism state
  const swingPhaseRef = useRef(0); // pendulum phase accumulator (rad)
  const prevHalfRef = useRef(0); // floor(phase / PI) last frame
  const gravityRef = useRef(DEFAULT_GRAVITY); // smoothed 0..1
  const biasRef = useRef(0); // swing bias -1..1 (from gamma / drag x)
  const toothRef = useRef(0); // escape-wheel tooth counter
  const wheelRotRef = useRef(0);
  const wheelTargetRef = useRef(0);
  const hamHitRef = useRef<[number, number, number]>([0, 0, 0]);
  const flashesRef = useRef<Flash[]>([]);
  const flashBufRef = useRef<Float32Array>(new Float32Array(MAX_FLASH * 4));

  // input
  const tiltRef = useRef<{ beta: number; gamma: number } | null>(null);
  const lastInputAtRef = useRef(0); // sec of last real input
  const neutralBetaRef = useRef<number | null>(null);
  const userDroveRef = useRef(false);
  const gateOpenRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  // seeded auto-conductor params
  const ghostRef = useRef({ f1: 0.5, f2: 0.9, f3: 0.35, p1: 0, p2: 1.6, p3: 3 });

  const lastTsRef = useRef(0);
  const startedAtRef = useRef(0);

  // cheap React mirror — only setState on change
  const mirror = useRef({ auto: true, tempo: "—" });
  const setMirrors = useCallback((a: boolean, tempo: string) => {
    const m = mirror.current;
    if (m.auto !== a) {
      m.auto = a;
      setAuto(a);
    }
    if (m.tempo !== tempo) {
      m.tempo = tempo;
      setTempoLabel(tempo);
    }
  }, []);

  const pushFlash = useCallback((x: number, y: number, kind: number) => {
    const f = flashesRef.current;
    f.push({ x, y, inten: 1, kind });
    if (f.length > MAX_FLASH) f.shift();
  }, []);

  // ── one escape event: step the wheel, strike, fire the coprime hammers ────
  const escapeEvent = useCallback(
    (isTick: boolean, ampScale: number) => {
      const tooth = (toothRef.current += 1);
      wheelTargetRef.current += (2 * Math.PI) / LAYOUT.teeth;

      const audio = audioRef.current;
      if (isTick) {
        pushFlash(LAYOUT.palletL[0], LAYOUT.palletL[1], 0);
        audio?.tick(0.95 * ampScale);
      } else {
        pushFlash(LAYOUT.palletR[0], LAYOUT.palletR[1], 1);
        audio?.tock(0.9 * ampScale);
      }

      // secondary hammers on coprime divisions of the tooth stream
      const divs = [3, 5, 7];
      for (let i = 0; i < 3; i++) {
        if (tooth % divs[i] === 0) {
          hamHitRef.current[i] = 1;
          pushFlash(LAYOUT.hamPlate[i][0], LAYOUT.hamPlate[i][1], 2);
          audio?.hammer(i, 0.85 * ampScale);
        }
      }
    },
    [pushFlash],
  );

  const frame = useCallback(() => {
    rafRef.current = requestAnimationFrame(frame);
    const nowSec = performance.now() / 1000;
    let dt = nowSec - lastTsRef.current;
    lastTsRef.current = nowSec;
    if (!(dt > 0) || dt > 0.1) dt = 0.016; // guard tab-switch spikes

    // ── decide the drive: real tilt, pointer drag, or seeded auto-conductor ──
    const sinceInput = nowSec - lastInputAtRef.current;
    let gravityTarget = gravityRef.current;
    let biasTarget = biasRef.current;
    let autoActive = false;

    if (dragRef.current) {
      // drag: vertical = gravity/tempo (down = faster), horizontal = bias
      gravityTarget = Math.min(1, Math.max(0, dragRef.current.y));
      biasTarget = Math.min(1, Math.max(-1, dragRef.current.x));
    } else if (tiltRef.current && sinceInput < 0.6) {
      const t = tiltRef.current;
      if (neutralBetaRef.current === null) neutralBetaRef.current = t.beta;
      const gb = t.beta - (neutralBetaRef.current ?? 0);
      // forward tilt speeds the pendulum up; back slows it down
      gravityTarget = Math.min(1, Math.max(0, 0.42 + gb / 55));
      biasTarget = Math.min(1, Math.max(-1, t.gamma / 40));
    } else if (nowSec - startedAtRef.current > GHOST_DELAY) {
      // seeded auto-conductor gently sweeps spacious ↔ busy
      autoActive = true;
      const g = ghostRef.current;
      const tt = nowSec - startedAtRef.current;
      gravityTarget =
        0.48 +
        0.34 * Math.sin(tt * g.f1 + g.p1) +
        0.12 * Math.sin(tt * g.f2 + g.p2);
      gravityTarget = Math.min(0.92, Math.max(0.14, gravityTarget));
      biasTarget = 0.28 * Math.sin(tt * g.f3 + g.p3);
    }

    // smooth toward target (a heavy pendulum bob changes tempo gradually)
    const k = Math.min(1, dt * 2.5);
    gravityRef.current += (gravityTarget - gravityRef.current) * k;
    biasRef.current += (biasTarget - biasRef.current) * Math.min(1, dt * 4);
    const gravity = gravityRef.current;
    const bias = biasRef.current;

    // ── advance the pendulum ────────────────────────────────────────────────
    const omega = OMEGA_MIN + gravity * gravity * (OMEGA_MAX - OMEGA_MIN);
    // intra-swing modulation → uneven half-periods → a limping groove
    const swirl = 1 + bias * 0.4 * Math.cos(swingPhaseRef.current);
    swingPhaseRef.current += omega * dt * Math.max(0.2, swirl);
    const ph = swingPhaseRef.current;

    // density: as the buzz crowds, soften each strike so events melt to texture
    const ampScale = 1 / (1 + omega / 16);

    // ── escape events at each center crossing (phase = k·π) ──────────────────
    const half = Math.floor(ph / Math.PI);
    let events = half - prevHalfRef.current;
    prevHalfRef.current = half;
    if (events > MAX_EVENTS_PER_FRAME) events = MAX_EVENTS_PER_FRAME;
    for (let e = 0; e < events; e++) {
      // tick on one crossing direction, tock on the other
      const isTick = (toothRef.current & 1) === 0;
      escapeEvent(isTick, ampScale);
    }

    // pendulum + anchor geometry
    const theta = LAYOUT.amp * Math.sin(ph) + bias * 0.1;
    const anchorAngle = -theta * 0.9;

    // wheel visibly steps toward its target tooth (the classic "tick" motion)
    wheelRotRef.current +=
      (wheelTargetRef.current - wheelRotRef.current) * Math.min(1, dt * WHEEL_SNAP);

    // decay hammer strike-animations
    const hh = hamHitRef.current;
    for (let i = 0; i < 3; i++) {
      hh[i] = Math.max(0, hh[i] - dt * HAMMER_DECAY);
    }

    // decay + upload flashes
    const flashes = flashesRef.current;
    for (let i = flashes.length - 1; i >= 0; i--) {
      flashes[i].inten -= dt * FLASH_DECAY;
      if (flashes[i].inten <= 0) flashes.splice(i, 1);
    }
    const fbuf = flashBufRef.current;
    const fCount = Math.min(flashes.length, MAX_FLASH);
    for (let i = 0; i < fCount; i++) {
      const f = flashes[i];
      fbuf[i * 4] = f.x;
      fbuf[i * 4 + 1] = f.y;
      fbuf[i * 4 + 2] = Math.max(0, f.inten);
      fbuf[i * 4 + 3] = f.kind;
    }

    // open the audio gate on the first real gesture (auto stays silent)
    const audio = audioRef.current;
    if (audio && userDroveRef.current && !gateOpenRef.current) {
      gateOpenRef.current = true;
      audio.setGate(true);
    }

    // render
    const backend = backendRef.current;
    if (backend && backend.ok) {
      backend.render({
        time: nowSec - startedAtRef.current,
        theta,
        anchorAngle,
        wheelRot: wheelRotRef.current,
        hamHit: hh,
        gravity,
        flashes: fbuf,
        flashCount: fCount,
      });
    }

    // tempo readout (events/s ≈ omega/π)
    const eps = omega / Math.PI;
    const tempo =
      eps < 1.2
        ? "spacious"
        : eps < 3.5
          ? "countable"
          : eps < 8
            ? "driving"
            : "buzzing";
    setMirrors(autoActive, tempo);
  }, [escapeEvent, setMirrors]);

  // ── canvas sizing ────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const backend = backendRef.current;
    if (!canvas || !backend) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    backend.resize(w, h);
  }, []);

  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resize]);

  // ── orientation listener ─────────────────────────────────────────────────
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return;
      tiltRef.current = { beta: e.beta ?? 0, gamma: e.gamma ?? 0 };
      lastInputAtRef.current = performance.now() / 1000;
      if (
        !userDroveRef.current &&
        (Math.abs(e.gamma ?? 0) > 5 || Math.abs(e.beta ?? 0) > 5)
      ) {
        userDroveRef.current = true;
      }
    };
    window.addEventListener("deviceorientation", onOrient as EventListener);
    return () =>
      window.removeEventListener("deviceorientation", onOrient as EventListener);
  }, []);

  // seed the auto-conductor once
  useEffect(() => {
    const r = rngRef.current;
    ghostRef.current = {
      f1: 0.28 + r() * 0.4,
      f2: 0.6 + r() * 0.7,
      f3: 0.2 + r() * 0.4,
      p1: r() * Math.PI * 2,
      p2: r() * Math.PI * 2,
      p3: r() * Math.PI * 2,
    };
  }, []);

  // ── pointer drag on the canvas (fallback drive) ──────────────────────────
  const readPointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width; // 0..1
    const ny = (clientY - rect.top) / rect.height; // 0..1 (top = 0)
    dragRef.current = { x: nx * 2 - 1, y: ny }; // x: -1..1, y: 0(top)..1(bottom)
    lastInputAtRef.current = performance.now() / 1000;
    userDroveRef.current = true;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      readPointer(e.clientX, e.clientY);
    },
    [readPointer],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (dragRef.current) readPointer(e.clientX, e.clientY);
    },
    [readPointer],
  );
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    dragRef.current = null;
  }, []);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;

    const canvas = canvasRef.current;
    if (canvas) {
      const backend = makeSceneBackend(canvas);
      backendRef.current = backend;
      if (!backend.ok) setWebglFailed(true);
    }
    resize();

    // audio only after the tap (autoplay policy)
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = new EscapementAudio(ctx, rngRef.current);
    } catch {
      setNotice("Audio could not start on this device — visuals only.");
    }

    // iOS 13+ needs permission requested INSIDE this tap
    const Ctor =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as OrientCtor | undefined)
        : undefined;
    if (Ctor?.requestPermission) {
      try {
        const res = await Ctor.requestPermission();
        if (res !== "granted") {
          setNotice("Tilt denied — drag the mechanism, or watch it auto-run.");
        }
      } catch {
        setNotice("Tilt unavailable — drag the mechanism, or watch it auto-run.");
      }
    }

    startedAtRef.current = performance.now() / 1000;
    lastTsRef.current = performance.now() / 1000;
    swingPhaseRef.current = 0;
    prevHalfRef.current = 0;
    toothRef.current = 0;
    wheelRotRef.current = 0;
    wheelTargetRef.current = 0;
    gravityRef.current = DEFAULT_GRAVITY;
    biasRef.current = 0;
    hamHitRef.current = [0, 0, 0];
    flashesRef.current = [];
    userDroveRef.current = false;
    gateOpenRef.current = false;
    neutralBetaRef.current = null;

    setPhase("running");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, resize, frame]);

  // cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.destroy();
      backendRef.current?.destroy();
      const c = ctxRef.current;
      if (c && c.state !== "closed") c.close().catch(() => {});
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Escapement
            </h1>
            {phase === "running" && auto && (
              <span className="rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                auto — tilt or drag to drive
              </span>
            )}
          </div>
          <p className="text-base text-muted-foreground">
            A clock&rsquo;s escapement as a drum. The pendulum&rsquo;s pallets
            catch and release a toothed wheel — the tick and the tock — while
            hammers off every 3rd, 5th and 7th tooth interlock a polyrhythm on
            top. Tilt to change the gravity on the pendulum and the whole
            mechanism runs faster or slower.
          </p>
        </header>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="h-full w-full touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />

          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
              <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
                Press start, then tilt your device — forward runs it fast, back
                slows it down. On iPhone this asks for motion access. No sensor?
                Drag on the mechanism, or watch the seeded auto-conductor run it.
              </p>
              <button
                type="button"
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start
              </button>
            </div>
          )}

          {phase === "running" && webglFailed && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-6">
              <p className="max-w-sm text-center text-base text-destructive">
                WebGL2 is unavailable on this device, so the mechanism
                can&rsquo;t render — but the escapement is still ticking and the
                audio is still running.
              </p>
            </div>
          )}
        </div>

        {phase === "running" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                tempo · {tempoLabel}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                tilt forward/back = tempo · left/right = groove bias
              </span>
            </div>

            {notice && <p className="text-sm text-destructive">{notice}</p>}

            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="self-start text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              {showNotes ? "hide design notes" : "design notes"}
            </button>
            {showNotes && (
              <div className="rounded-md border border-border bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Each time the pendulum swings through center, a pallet releases
                  the escape wheel by one tooth — a hard{" "}
                  <span className="font-mono">tick</span> on the way one direction,
                  a drier <span className="font-mono">tock</span> on the way back:
                  the downbeat and the off-beat. Off the advancing tooth-count,
                  three hammers fire on <em>coprime</em> divisions — every 3rd,
                  5th and 7th tooth — so their strikes interlock and, because
                  3·5·7 only realign every 105 teeth, the groove at minute five is
                  unlike minute one. Tilting changes the effective gravity on the
                  pendulum, so a slow swing gives spacious, countable tick-tock and
                  a fast swing crowds the strikes toward a continuous mechanical
                  buzz — the same events crossing from rhythm into texture. There
                  is no drone: every voice is a click, a knock or a fast-decaying
                  inharmonic ping. Until a real tilt or drag arrives, a seeded
                  auto-conductor runs the mechanism, muted and badged{" "}
                  <span className="font-mono">auto</span>. After Christiaan
                  Huygens&rsquo; pendulum clock escapement (1657).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <PrototypeNav slugs={["10440-escapement"]} />
    </main>
  );
}
