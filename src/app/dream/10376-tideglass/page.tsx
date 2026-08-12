"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10376 · Tideglass — tilt a luminous drop across a shallow iridescent tide-
// pool, and the pool RECORDS your whole gesture as a standing wake you can
// replay, scrub, and layer a second pass over: a canon of your own hand.
//
//   ONE QUESTION
//   What if you could TILT your device to steer a luminous drop across a shallow
//   iridescent tide-pool, and the pool RECORDED your whole gesture as a standing
//   wake you can REPLAY and LAYER a second pass over — a canon of your own hand's
//   motion?
//
//   INPUT   device-tilt (DeviceOrientation beta/gamma → droplet acceleration).
//   OUTPUT  WebGL2 — a shallow tide-pool whose wake is an analytic ring-field,
//           shaded nacreous oil-on-water (see webgl.ts).
//   VERB    gesture record → deterministic replay → overdub/LAYER a canon.
//   SOUND   inharmonic ripple-bells (1 : 2.41 : 3.83 : 5.17) struck as the drop
//           moves fast or crosses its own wake, over a speed-tracking noise wash.
//
//   Named reference: Golan Levin, *Yellowtail* / Audiovisual Environment Suite
//   (MIT, 2000) — you trace a gesture and it loops back as animated sound-image.
//
//   Degrade ladder: no tilt within ~1s (or permission denied / no sensor) → a
//   SEEDED "ghost hand" traces a slow looping gesture that records + replays
//   itself, MUTED and badged "auto", so the whole verb demos with zero input.
//   No WebGL2 → on-brand notice, audio keeps running. Seed 0x10376; time from
//   performance.now(); no Math.random / Date.now anywhere (see rng.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mulberry32, TIDEGLASS_SEED } from "./rng";
import { makeTideBackend, MAX_STAMPS, MAX_DROPS, type TideBackend } from "./webgl";
import { TideAudio } from "./audio";

// ── tuning ───────────────────────────────────────────────────────────────────
const LOOP_LEN = 12; // seconds per gesture loop
const GHOST_DELAY = 1.0; // s with no tilt before the ghost hand takes over
const ACCEL = 2.6; // tilt → acceleration
const DAMP = 2.2; // velocity damping / sec
const SPEED_NORM = 0.9; // uv/s that maps to "full" speed
const STAMP_DIST = 0.02; // min travel (uv) between shed wake stamps
const FAST_THRESH = 0.34; // normalised speed that strikes a bell
const CROSS_R = 0.032; // proximity to an old wake stamp that strikes a bell
const BELL_CD = 0.16; // per-droplet strike cooldown (s)
const MAX_AGE = 5.0; // stamp lifetime (s)

interface TrajPoint {
  t: number; // 0..LOOP_LEN
  x: number;
  y: number;
  speed: number; // normalised 0..1
}
type Take = TrajPoint[];

interface Stamp {
  x: number;
  y: number;
  birth: number; // seconds (performance.now based)
  strength: number;
}

interface Driver {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastStampX: number;
  lastStampY: number;
  lastBell: number; // sec
}

type OrientCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

function makeDriver(x: number, y: number): Driver {
  return { x, y, vx: 0, vy: 0, lastStampX: x, lastStampY: y, lastBell: 0 };
}

/** Sample a recorded path at loop-time t (seconds), clamped to its span. */
function sampleAt(path: Take, t: number): TrajPoint | null {
  const n = path.length;
  if (n === 0) return null;
  if (t <= path[0].t) return path[0];
  if (t >= path[n - 1].t) return path[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = path[lo];
  const b = path[hi];
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;
  return {
    t,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    speed: a.speed + (b.speed - a.speed) * f,
  };
}

export default function TideglassPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [auto, setAuto] = useState(true);
  const [recording, setRecording] = useState(false);
  const [takesCount, setTakesCount] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── loop-owned refs (never read React state inside rAF) ──────────────────
  const backendRef = useRef<TideBackend | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<TideAudio | null>(null);
  const rafRef = useRef(0);
  const rngRef = useRef<() => number>(mulberry32(TIDEGLASS_SEED));

  const takesRef = useRef<Take[]>([]);
  const currentPathRef = useRef<Take>([]);
  const recordingRef = useRef(false);
  const loopStartRef = useRef(0); // sec
  const prevLoopTRef = useRef(0);

  const liveRef = useRef<Driver>(makeDriver(0.5, 0.5));
  const takeDriversRef = useRef<Driver[]>([]);
  const stampsRef = useRef<Stamp[]>([]);

  // tilt input
  const tiltRef = useRef<{ beta: number; gamma: number } | null>(null);
  const lastTiltAtRef = useRef(0); // sec of last orientation event
  const neutralBetaRef = useRef<number | null>(null);
  const userTiltedRef = useRef(false);
  const gateOpenRef = useRef(false);

  // ghost-hand seeded parameters
  const ghostRef = useRef({ k1: 2, k2: 3, p1: 0, p2: 1.7, ax: 0.32, ay: 0.3 });

  const lastTsRef = useRef(0);
  const startedAtRef = useRef(0);

  // reusable GPU buffers
  const stampBufRef = useRef<Float32Array>(new Float32Array(MAX_STAMPS * 4));
  const dropBufRef = useRef<Float32Array>(new Float32Array(MAX_DROPS * 4));

  // keep React mirrors cheap — only setState on change
  const mirror = useRef({ auto: true, recording: false, takes: 0 });

  const setMirrors = useCallback(
    (a: boolean, rec: boolean, takes: number) => {
      const m = mirror.current;
      if (m.auto !== a) {
        m.auto = a;
        setAuto(a);
      }
      if (m.recording !== rec) {
        m.recording = rec;
        setRecording(rec);
      }
      if (m.takes !== takes) {
        m.takes = takes;
        setTakesCount(takes);
      }
    },
    [],
  );

  // ── shed wake stamps + strike bells for one driver ───────────────────────
  const advanceDriver = useCallback(
    (d: Driver, nowSec: number, isLive: boolean) => {
      const dx = d.x - d.lastStampX;
      const dy = d.y - d.lastStampY;
      const moved = Math.hypot(dx, dy);
      const spd = Math.min(1, Math.hypot(d.vx, d.vy) / SPEED_NORM);

      if (moved >= STAMP_DIST) {
        const stamps = stampsRef.current;
        stamps.push({
          x: d.x,
          y: d.y,
          birth: nowSec,
          strength: 0.5 + spd * 0.9,
        });
        if (stamps.length > MAX_STAMPS) stamps.shift();
        d.lastStampX = d.x;
        d.lastStampY = d.y;
      }

      const audio = audioRef.current;
      if (!audio) return spd;
      if (nowSec - d.lastBell < BELL_CD) return spd;

      // fast-move strike
      if (spd > FAST_THRESH) {
        audio.strike(d.x, spd * (isLive ? 0.95 : 0.7), 0.25);
        d.lastBell = nowSec;
        return spd;
      }
      // crossing an OLD wake strike (self-canon)
      const stamps = stampsRef.current;
      for (let i = 0; i < stamps.length; i++) {
        const s = stamps[i];
        const age = nowSec - s.birth;
        if (age < 0.7) continue;
        if (Math.hypot(s.x - d.x, s.y - d.y) < CROSS_R) {
          audio.strike(d.x, 0.5 * (isLive ? 0.95 : 0.7), 0.9);
          d.lastBell = nowSec;
          break;
        }
      }
      return spd;
    },
    [],
  );

  const frame = useCallback(() => {
    rafRef.current = requestAnimationFrame(frame);
    const nowSec = performance.now() / 1000;
    let dt = nowSec - lastTsRef.current;
    lastTsRef.current = nowSec;
    if (!(dt > 0) || dt > 0.1) dt = 0.016; // guard against tab-switch spikes

    // loop clock
    const loopT = (nowSec - loopStartRef.current) % LOOP_LEN;
    const wrapped = loopT < prevLoopTRef.current;
    prevLoopTRef.current = loopT;

    // finalize a recording pass when the loop wraps
    if (wrapped && recordingRef.current) {
      const path = currentPathRef.current;
      if (path.length > 8) {
        takesRef.current.push(path);
      }
      currentPathRef.current = [];
      recordingRef.current = false;
    }

    // ── decide the live driver's input: real tilt or seeded ghost hand ──────
    const live = liveRef.current;
    const sinceTilt = nowSec - lastTiltAtRef.current;
    const ghostActive =
      !userTiltedRef.current ||
      (tiltRef.current === null && nowSec - startedAtRef.current > GHOST_DELAY);
    const useGhost =
      tiltRef.current === null || sinceTilt > 0.6 ? true : false;

    let ax = 0;
    let ay = 0;
    if (!useGhost && tiltRef.current) {
      const t = tiltRef.current;
      if (neutralBetaRef.current === null) neutralBetaRef.current = t.beta;
      const gb = t.beta - (neutralBetaRef.current ?? 0);
      const gg = t.gamma;
      ax = Math.max(-1, Math.min(1, gg / 40)) * ACCEL;
      ay = Math.max(-1, Math.min(1, gb / 40)) * ACCEL;
    } else {
      // seeded slow looping gesture (loops cleanly within LOOP_LEN)
      const g = ghostRef.current;
      const base = (2 * Math.PI) / LOOP_LEN;
      const tt = nowSec - startedAtRef.current;
      const tx = 0.5 + g.ax * Math.sin(base * g.k1 * tt + g.p1);
      const ty = 0.5 + g.ay * Math.sin(base * g.k2 * tt + g.p2);
      ax = (tx - live.x) * ACCEL * 3.0;
      ay = (ty - live.y) * ACCEL * 3.0;
    }

    // integrate live droplet (marble-in-a-tray)
    live.vx += ax * dt;
    live.vy += ay * dt;
    live.vx -= live.vx * DAMP * dt;
    live.vy -= live.vy * DAMP * dt;
    live.x += live.vx * dt;
    live.y += live.vy * dt;
    // soft walls
    if (live.x < 0.04) { live.x = 0.04; live.vx = Math.abs(live.vx) * 0.4; }
    if (live.x > 0.96) { live.x = 0.96; live.vx = -Math.abs(live.vx) * 0.4; }
    if (live.y < 0.04) { live.y = 0.04; live.vy = Math.abs(live.vy) * 0.4; }
    if (live.y > 0.96) { live.y = 0.96; live.vy = -Math.abs(live.vy) * 0.4; }
    if (!Number.isFinite(live.x)) { live.x = 0.5; live.vx = 0; }
    if (!Number.isFinite(live.y)) { live.y = 0.5; live.vy = 0; }

    // record the live pass, keyed by loop-time
    if (recordingRef.current) {
      const spd = Math.min(1, Math.hypot(live.vx, live.vy) / SPEED_NORM);
      currentPathRef.current.push({ t: loopT, x: live.x, y: live.y, speed: spd });
    }

    let maxSpeed = 0;

    // ── build droplet list: existing takes replay + (if recording) live ─────
    const drops = dropBufRef.current;
    let dropCount = 0;
    const drivers = takeDriversRef.current;
    const takes = takesRef.current;
    for (let i = 0; i < takes.length && dropCount < MAX_DROPS; i++) {
      const p = sampleAt(takes[i], loopT);
      if (!p) continue;
      const d = drivers[i] ?? (drivers[i] = makeDriver(p.x, p.y));
      // velocity implied by motion since last frame
      d.vx = (p.x - d.x) / dt;
      d.vy = (p.y - d.y) / dt;
      d.x = p.x;
      d.y = p.y;
      const spd = advanceDriver(d, nowSec, false);
      maxSpeed = Math.max(maxSpeed, spd);
      const r = 0.018 + spd * 0.03;
      drops[dropCount * 4] = d.x;
      drops[dropCount * 4 + 1] = d.y;
      drops[dropCount * 4 + 2] = r;
      drops[dropCount * 4 + 3] = 0.7;
      dropCount++;
    }
    if (drivers.length > takes.length) drivers.length = takes.length;

    if (recordingRef.current && dropCount < MAX_DROPS) {
      const spd = advanceDriver(live, nowSec, true);
      maxSpeed = Math.max(maxSpeed, spd);
      const r = 0.024 + spd * 0.035;
      drops[dropCount * 4] = live.x;
      drops[dropCount * 4 + 1] = live.y;
      drops[dropCount * 4 + 2] = r;
      drops[dropCount * 4 + 3] = 1.0;
      dropCount++;
    }

    // ── prune + upload stamps ───────────────────────────────────────────────
    const stamps = stampsRef.current;
    while (stamps.length && nowSec - stamps[0].birth > MAX_AGE) stamps.shift();
    const sbuf = stampBufRef.current;
    const sCount = Math.min(stamps.length, MAX_STAMPS);
    for (let i = 0; i < sCount; i++) {
      const s = stamps[i];
      sbuf[i * 4] = s.x;
      sbuf[i * 4 + 1] = s.y;
      sbuf[i * 4 + 2] = nowSec - s.birth;
      sbuf[i * 4 + 3] = s.strength;
    }

    // audio wash + gate
    const audio = audioRef.current;
    if (audio) {
      audio.updateWash(maxSpeed);
      if (userTiltedRef.current && !gateOpenRef.current) {
        gateOpenRef.current = true;
        audio.setGate(true);
      }
    }

    // render
    const backend = backendRef.current;
    if (backend && backend.ok) {
      backend.render({
        stamps: sbuf,
        stampCount: sCount,
        drops,
        dropCount,
        time: nowSec - startedAtRef.current,
      });
    }

    setMirrors(ghostActive, recordingRef.current, takes.length);
  }, [advanceDriver, setMirrors]);

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
      lastTiltAtRef.current = performance.now() / 1000;
      // a genuine, non-trivial tilt counts as the first user gesture
      if (!userTiltedRef.current && (Math.abs(e.gamma ?? 0) > 4 || Math.abs(e.beta ?? 0) > 4)) {
        userTiltedRef.current = true;
      }
    };
    window.addEventListener("deviceorientation", onOrient as EventListener);
    return () =>
      window.removeEventListener("deviceorientation", onOrient as EventListener);
  }, []);

  // seed ghost params once
  useEffect(() => {
    const r = rngRef.current;
    ghostRef.current = {
      k1: 1 + Math.floor(r() * 3),
      k2: 1 + Math.floor(r() * 3),
      p1: r() * Math.PI * 2,
      p2: r() * Math.PI * 2,
      ax: 0.26 + r() * 0.1,
      ay: 0.24 + r() * 0.1,
    };
  }, []);

  const beginPass = useCallback(() => {
    currentPathRef.current = [];
    recordingRef.current = true;
    loopStartRef.current = performance.now() / 1000;
    prevLoopTRef.current = 0;
    liveRef.current = makeDriver(0.5, 0.5);
  }, []);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;

    const canvas = canvasRef.current;
    if (canvas) {
      const backend = makeTideBackend(canvas);
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
      audioRef.current = new TideAudio(ctx);
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
          setNotice("Tilt permission denied — the seeded ghost hand will play.");
        }
      } catch {
        setNotice("Tilt unavailable — the seeded ghost hand will play.");
      }
    }

    startedAtRef.current = performance.now() / 1000;
    lastTsRef.current = performance.now() / 1000;
    stampsRef.current = [];
    takesRef.current = [];
    takeDriversRef.current = [];
    userTiltedRef.current = false;
    gateOpenRef.current = false;
    beginPass();

    setPhase("running");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, resize, frame, beginPass]);

  // controls
  const doReplay = useCallback(() => {
    if (phase !== "running") return;
    recordingRef.current = false;
    loopStartRef.current = performance.now() / 1000;
    prevLoopTRef.current = 0;
    takeDriversRef.current = [];
    stampsRef.current = [];
  }, [phase]);

  const doLayer = useCallback(() => {
    if (phase !== "running") return;
    // overdub: keep existing takes looping underneath, record a fresh pass
    currentPathRef.current = [];
    recordingRef.current = true;
    loopStartRef.current = performance.now() / 1000;
    prevLoopTRef.current = 0;
    liveRef.current = makeDriver(0.5, 0.5);
    // let a real tilt re-open the gate; ghost stays muted
  }, [phase]);

  const doClear = useCallback(() => {
    if (phase !== "running") return;
    takesRef.current = [];
    takeDriversRef.current = [];
    stampsRef.current = [];
    beginPass();
  }, [phase, beginPass]);

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

  const statusLabel = recording
    ? auto
      ? "recording · auto (ghost hand)"
      : "recording your gesture"
    : takesCount > 0
      ? `replaying ${takesCount} pass${takesCount > 1 ? "es" : ""}`
      : "idle";

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Tideglass
            </h1>
            {phase === "running" && auto && (
              <span className="rounded-md border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                auto
              </span>
            )}
          </div>
          <p className="text-base text-muted-foreground">
            Tilt your device to steer a luminous drop across a shallow iridescent
            tide-pool — the pool records your whole gesture as a standing wake you
            can replay and layer a canon of passes over.
          </p>
        </header>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-black">
          <canvas ref={canvasRef} className="h-full w-full" />

          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
              <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
                Press start, then tilt. On iPhone this asks for motion access. No
                sensor? A seeded ghost hand traces and replays a gesture on its
                own.
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
                WebGL2 is unavailable on this device, so the tide-pool can&rsquo;t
                render — but the audio and gesture recorder are still running.
              </p>
            </div>
          )}
        </div>

        {phase === "running" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={doReplay}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Replay
              </button>
              <button
                type="button"
                onClick={doLayer}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Layer
              </button>
              <button
                type="button"
                onClick={doClear}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Clear
              </button>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {statusLabel}
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
              <div className="rounded-md border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                <p>
                  The wake is an analytic field of expanding, decaying ring-waves
                  — one shed each time the drop travels a little. Because the wake
                  is a pure function of your recorded path, <em>Replay</em> redraws
                  the identical wake and re-strikes the identical inharmonic
                  ripple-bells (partials 1 : 2.41 : 3.83 : 5.17). <em>Layer</em>{" "}
                  overdubs a fresh pass on top so your drops answer each other in a
                  canon. Until a real tilt arrives, a seeded ghost hand plays the
                  whole verb, muted and badged <span className="font-mono">auto</span>.
                  After Golan Levin&rsquo;s <em>Yellowtail</em> (MIT, 2000).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <PrototypeNav slugs={["10376-tideglass"]} />
    </main>
  );
}
