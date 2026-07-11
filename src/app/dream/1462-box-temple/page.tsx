"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { makeRig, type Rig } from "./shader";
import {
  sampleMandelbox,
  mandelboxDE,
  mandelboxNormal,
  type MandelboxParams,
} from "./mandelbox";
import { makeTempleAudio, type TempleAudio } from "./audio";

type Phase = "preface" | "running" | "nogl";

const MIN_R2 = 0.25;
const FIXED_R2 = 1.0;
const WALL_EPS = 0.03;
const MAX_R = 3.5;
const PEAK = 0.2;

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// depth 0..1 → fold scale (negative = temple look) and iteration count
function depthToScale(depth: number): number {
  return -1.6 - depth * 0.75; // -1.6 .. -2.35
}
function depthToIter(depth: number): number {
  return 10 + Math.round(depth * 4); // 10 .. 14
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("preface");
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ depth: 0, folds: 0, near: 0 });

  // engine state (kept out of React render)
  const rigRef = useRef<Rig | null>(null);
  const glReadyRef = useRef(false);
  const audioRef = useRef<TempleAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  // camera
  const posRef = useRef<[number, number, number]>([0.6, -0.3, -3.0]);
  const yawRef = useRef(-0.12);
  const pitchRef = useRef(0.06);

  // fold depth control
  const depthRef = useRef(0.15);
  const depthTargetRef = useRef(0.15);
  const holdRef = useRef<0 | 1 | -1>(0); // button hold: descend / rise

  // timing + audio bookkeeping
  const elapsedRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const prevFoldsRef = useRef(0);
  const pingCooldownRef = useRef(0);
  const normalTmp = useRef<[number, number, number]>([0, 0, 0]);

  // pointer
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef(0);

  const params = useCallback((): MandelboxParams => {
    const depth = depthRef.current;
    return {
      scale: depthToScale(depth),
      iterations: depthToIter(depth),
      minRadius2: MIN_R2,
      fixedRadius2: FIXED_R2,
    };
  }, []);

  // ── the frame loop: drift the camera, sample the field, render + sonify ──
  const runFrame = useCallback(
    (ts: number) => {
      if (!runningRef.current) {
        rafRef.current = requestAnimationFrame(runFrame);
        return;
      }
      if (lastTsRef.current == null) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.1) dt = 0.1;
      elapsedRef.current += dt;
      const reduced = reducedRef.current;

      // ease fold depth toward its target (+ any button hold)
      if (holdRef.current !== 0) {
        depthTargetRef.current = clamp(
          depthTargetRef.current + holdRef.current * dt * 0.5,
          0,
          1,
        );
      }
      depthRef.current += (depthTargetRef.current - depthRef.current) * Math.min(1, dt * 3);
      const mp = params();

      const pos = posRef.current;

      // gentle autonomous heading drift so the temple keeps evolving when idle
      const driftRate = reduced ? 0.02 : 0.06;
      yawRef.current += dt * driftRate * Math.sin(elapsedRef.current * 0.11);
      pitchRef.current += dt * driftRate * 0.4 * Math.sin(elapsedRef.current * 0.07 + 1.3);
      pitchRef.current = clamp(pitchRef.current, -1.4, 1.4);

      // heading → forward vector + orthonormal basis
      const cy = Math.cos(yawRef.current);
      const sy = Math.sin(yawRef.current);
      const cp = Math.cos(pitchRef.current);
      const sp = Math.sin(pitchRef.current);
      let fx = sy * cp;
      let fy = sp;
      let fz = cy * cp;

      // steer back toward the structure if we drift out toward the void
      const rad = Math.hypot(pos[0], pos[1], pos[2]);
      if (rad > MAX_R) {
        const inv = 1 / (rad || 1);
        const tx = -pos[0] * inv;
        const ty = -pos[1] * inv;
        const tz = -pos[2] * inv;
        const k = clamp((rad - MAX_R) * 0.6, 0, 1) * Math.min(1, dt * 2);
        fx += (tx - fx) * k;
        fy += (ty - fy) * k;
        fz += (tz - fz) * k;
        const fl = Math.hypot(fx, fy, fz) || 1;
        fx /= fl;
        fy /= fl;
        fz /= fl;
        yawRef.current = Math.atan2(fx, fz);
        pitchRef.current = Math.asin(clamp(fy, -1, 1));
      }

      // forward drift — slows near walls, so it glides through corridors
      const de0 = mandelboxDE(pos[0], pos[1], pos[2], mp);
      const speedBase = reduced ? 0.055 : 0.16;
      const speed = speedBase * clamp(de0 * 7, 0.22, 1.2);
      pos[0] += fx * speed * dt;
      pos[1] += fy * speed * dt;
      pos[2] += fz * speed * dt;

      // collision: never penetrate a wall — push out along the field gradient
      const de1 = mandelboxDE(pos[0], pos[1], pos[2], mp);
      if (de1 < WALL_EPS) {
        mandelboxNormal(pos[0], pos[1], pos[2], mp, normalTmp.current);
        const push = WALL_EPS - de1 + 0.004;
        pos[0] += normalTmp.current[0] * push;
        pos[1] += normalTmp.current[1] * push;
        pos[2] += normalTmp.current[2] * push;
      }

      // basis vectors for the shader: right = cross(worldUp, fwd) = (fz, 0, -fx)
      let rx = fz;
      let ry = 0;
      let rz = -fx;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx /= rl;
      ry /= rl;
      rz /= rl;
      // up = cross(right, fwd)
      let ux = ry * fz - rz * fy;
      let uy = rz * fx - rx * fz;
      let uz = rx * fy - ry * fx;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul;
      uy /= ul;
      uz /= ul;

      // ── sonify: sample the SAME fold at the camera ──
      const sample = sampleMandelbox(pos[0], pos[1], pos[2], mp);
      const audio = audioRef.current;
      if (audio) {
        audio.update(sample, depthRef.current);
        // ping on fold-boundary crossings
        pingCooldownRef.current -= dt;
        const total = sample.boxFolds + sample.sphereFolds;
        const delta = total - prevFoldsRef.current;
        if (delta !== 0 && pingCooldownRef.current <= 0) {
          audio.pulse(Math.abs(total) % 8, clamp(Math.abs(delta) * 0.4, 0.2, 1.2));
          pingCooldownRef.current = 0.09;
        }
        prevFoldsRef.current = total;
      }

      // ── render ──
      const rig = rigRef.current;
      if (rig) {
        rig.render({
          camPos: [pos[0], pos[1], pos[2]],
          camFwd: [fx, fy, fz],
          camRight: [rx, ry, rz],
          camUp: [ux, uy, uz],
          scale: mp.scale,
          iterations: mp.iterations,
          minRadius2: MIN_R2,
          fixedRadius2: FIXED_R2,
          time: elapsedRef.current,
          drive: depthRef.current,
          reduced: reduced ? 1 : 0,
        });
      }

      // throttled readout (~5/s)
      if (
        Math.floor(elapsedRef.current * 5) !==
        Math.floor((elapsedRef.current - dt) * 5)
      ) {
        setReadout({
          depth: Math.round(depthRef.current * 100),
          folds: sample.boxFolds + sample.sphereFolds,
          near: Math.round(clamp(1 - de1 / 0.12, 0, 1) * 100),
        });
      }

      rafRef.current = requestAnimationFrame(runFrame);
    },
    [params],
  );

  const applyResize = useCallback(() => {
    const rig = rigRef.current;
    const canvas = canvasRef.current;
    if (!rig || !canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    rig.resize(parent.clientWidth, parent.clientHeight, dpr);
  }, []);

  // ── mount: build GL + start the flythrough immediately (audio waits) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (canvas) {
      const rig = makeRig(canvas);
      if (rig) {
        rigRef.current = rig;
        glReadyRef.current = true;
        applyResize();
      } else {
        setPhase("nogl");
      }
    }
    runningRef.current = true;
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      if (ctxRef.current) {
        const c = ctxRef.current;
        ctxRef.current = null;
        setTimeout(() => {
          c.close().catch(() => {});
        }, 700);
      }
      if (rigRef.current) {
        rigRef.current.dispose();
        rigRef.current = null;
      }
    };
  }, [applyResize, runFrame]);

  useEffect(() => {
    const onResize = () => applyResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyResize]);

  // ── gesture: create the AudioContext and start the temple singing ──
  const enter = useCallback(() => {
    if (audioRef.current) {
      setPhase("running");
      return;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      ctxRef.current = ctx;
      audioRef.current = makeTempleAudio(ctx, PEAK);
    } catch {
      audioRef.current = null;
    }
    setPhase("running");
  }, []);

  // ── pointer: drag steers heading; two-finger pinch folds deeper ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const map = pointersRef.current;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (map.size === 2) {
      const pts = [...map.values()];
      pinchDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const map = pointersRef.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (map.size >= 2) {
      const pts = [...map.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const dd = d - pinchDistRef.current;
      pinchDistRef.current = d;
      depthTargetRef.current = clamp(depthTargetRef.current + dd * 0.004, 0, 1);
      return;
    }
    // single-pointer steer
    yawRef.current += dx * 0.005;
    pitchRef.current = clamp(pitchRef.current - dy * 0.004, -1.4, 1.4);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    depthTargetRef.current = clamp(
      depthTargetRef.current + (e.deltaY > 0 ? 0.06 : -0.06),
      0,
      1,
    );
  }, []);

  const holdStart = useCallback((dir: 1 | -1) => {
    holdRef.current = dir;
  }, []);
  const holdStop = useCallback(() => {
    holdRef.current = 0;
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#04040a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-black/75 via-black/60 to-black/85 px-6">
          <div className="max-w-xl text-center">
            <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">
              Box Temple
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Fall forward through an endless folded-architecture fractal — a
              cathedral of impossible corridors and boxes-within-boxes whose own
              folding structure resonates as sound. Travelling through it plays it.
            </p>
            {phase === "nogl" && (
              <p className="mt-6 text-base text-violet-300">
                This device could not open a WebGL2 context, so the temple cannot
                be drawn — but you can still enter and hear it resonate.
              </p>
            )}
            <button
              type="button"
              onClick={enter}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-black transition-colors hover:bg-violet-400"
            >
              Enter the temple
            </button>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="mt-4 block w-full text-base text-violet-300/95 underline-offset-4 hover:underline"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
            {showNotes && (
              <div className="mt-4 max-h-[40vh] overflow-y-auto rounded-2xl border border-border bg-black/50 p-5 text-left text-base leading-relaxed text-muted-foreground">
                <p>
                  A single WebGL2 fragment shader raymarches a{" "}
                  <span className="text-violet-300/95">Mandelbox</span> distance
                  estimator (Tom Lowe / &ldquo;Tglad&rdquo;, 2010; sphere-tracing
                  per I&ntilde;igo Qu&iacute;lez). Each iteration box-folds and
                  sphere-folds space; a negative scale gives the rigid, hyperbolic
                  temple look.
                </p>
                <p className="mt-3">
                  The <span className="text-violet-300/95">same fold</span> is run on
                  the CPU at the camera each frame. Every iteration that folds lights
                  one resonant band-pass voice, pitched{" "}
                  <span className="text-violet-300/95">continuously</span> by that
                  iteration&rsquo;s radius — the temple&rsquo;s own dimensions, not
                  any musical scale, so the chords are alien on purpose. Nearness to
                  a wall makes the sound present and dry; open chambers turn it
                  distant and reverberant. Folding deeper multiplies the corridors.
                </p>
                <p className="mt-3 text-muted-foreground">
                  All motion is slow luminance drift — no strobing. With reduced
                  motion the flythrough slows and brightness swings are damped.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 select-none">
            <div className="font-semibold text-2xl text-foreground">Box Temple</div>
            <div className="mt-1 text-base text-muted-foreground">
              fold depth <span className="text-violet-300/95">{readout.depth}%</span>{" "}
              · folds <span className="text-violet-300/95">{readout.folds}</span>
            </div>
            <div className="text-base text-muted-foreground">
              wall proximity{" "}
              <span className="text-violet-300">{readout.near}%</span>
            </div>
          </div>

          <div className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
            <button
              type="button"
              onPointerDown={() => holdStart(1)}
              onPointerUp={holdStop}
              onPointerLeave={holdStop}
              onPointerCancel={holdStop}
              className="min-h-[44px] rounded-full border border-border bg-black/70 px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
            >
              Fold deeper
            </button>
            <button
              type="button"
              onPointerDown={() => holdStart(-1)}
              onPointerUp={holdStop}
              onPointerLeave={holdStop}
              onPointerCancel={holdStop}
              className="min-h-[44px] rounded-full border border-border bg-black/70 px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
            >
              Rise
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2 select-none px-4 text-center">
            <p className="text-base text-muted-foreground">
              drag to steer · wheel / pinch / buttons to fold deeper and descend
            </p>
          </div>
        </>
      )}

      <PrototypeNav
        slugs={["1458-room-of-you", "1450-supershape-bloom", "1444-troxler-void"]}
      />
    </main>
  );
}
