"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { Sandpile } from "./sandpile";
import { createDropScene, type DropSceneHandle } from "./scene";
import { makeDropAudio, type DropAudio } from "./audio";

type Phase = "preface" | "running" | "nogl";

const GRID = 80;
const SEED = 0x0d20;
const PEAK = 0.2;

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("preface");
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({
    tension: 0,
    activity: 0,
    last: 0,
    biggest: 0,
  });

  // engine state (kept out of React render)
  const pileRef = useRef<Sandpile | null>(null);
  const sceneRef = useRef<DropSceneHandle | null>(null);
  const audioRef = useRef<DropAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  const lastTsRef = useRef<number | null>(null);
  const flashRef = useRef(0);
  const biggestRef = useRef(0);
  const lastDropRef = useRef(0);
  const readoutClockRef = useRef(0);

  // pointer pour
  const pourActiveRef = useRef(false);
  const pourThrottleRef = useRef(0);

  // desktop arrow-key tilt
  const keyTiltRef = useRef({ x: 0, y: 0 });
  const gyroActiveRef = useRef(false);

  // ── the frame loop: step the pile, redraw the terrain, sonify ──
  const runFrame = useCallback((ts: number) => {
    if (!runningRef.current) return;
    if (lastTsRef.current == null) lastTsRef.current = ts;
    let dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.1) dt = 0.1;
    const reduced = reducedRef.current;

    const pile = pileRef.current;
    const audio = audioRef.current;

    if (pile) {
      // apply tilt (gyro overrides key tilt when live)
      if (!gyroActiveRef.current) {
        pile.tiltX = keyTiltRef.current.x;
        pile.tiltY = keyTiltRef.current.y;
      }

      const res = pile.step();

      // ── sonify ──
      if (audio) {
        audio.updateTension(res.load, res.topples, dt);
        let tickBudget = 5;
        for (const ev of res.events) {
          if (ev.size < 6) {
            if (tickBudget <= 0) continue;
            tickBudget--;
          }
          const mag = audio.drop(ev);
          if (mag > flashRef.current) flashRef.current = mag;
        }
      } else {
        // silent flash still legible before audio starts
        for (const ev of res.events) {
          const f =
            ev.size >= 2600
              ? 0.9
              : ev.size >= 500
                ? 0.5
                : ev.size >= 40
                  ? 0.25
                  : 0;
          if (f > flashRef.current) flashRef.current = f;
        }
      }

      // bookkeeping for HUD
      for (const ev of res.events) {
        if (ev.size > biggestRef.current) biggestRef.current = ev.size;
        if (ev.size >= 6) lastDropRef.current = ev.size;
      }

      readoutClockRef.current += dt;
      if (readoutClockRef.current >= 0.2) {
        readoutClockRef.current = 0;
        setReadout({
          tension: Math.round(res.load * 100),
          activity: res.topples,
          last: lastDropRef.current,
          biggest: biggestRef.current,
        });
      }
    }

    // flash decays smoothly (a luminance drift, never a hard flicker)
    flashRef.current *= reduced ? 0.95 : 0.9;
    if (flashRef.current < 0.002) flashRef.current = 0;

    const scene = sceneRef.current;
    if (scene) scene.update(dt, ts / 1000, reduced, flashRef.current);

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  const applyResize = useCallback(() => {
    sceneRef.current?.resize();
  }, []);

  // ── mount: build the pile + terrain, start the loop (audio waits) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();

    const pile = new Sandpile({ n: GRID, seed: SEED });
    pile.prime(600); // warm to near-critical so it is alive on frame 1
    pileRef.current = pile;

    const mount = mountRef.current;
    if (mount) {
      const scene = createDropScene(mount, GRID, pile.h, pile.heat);
      if (scene) {
        sceneRef.current = scene;
      } else {
        setPhase((p) => (p === "running" ? p : "nogl"));
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
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      pileRef.current = null;
    };
  }, [runFrame]);

  useEffect(() => {
    const onResize = () => applyResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyResize]);

  // ── keyboard: Space = seismic shock; arrows = tilt gravity (desktop) ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        pileRef.current?.shock();
      } else if (e.code === "ArrowLeft") keyTiltRef.current.x = -0.7;
      else if (e.code === "ArrowRight") keyTiltRef.current.x = 0.7;
      else if (e.code === "ArrowUp") keyTiltRef.current.y = -0.7;
      else if (e.code === "ArrowDown") keyTiltRef.current.y = 0.7;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "ArrowRight")
        keyTiltRef.current.x = 0;
      else if (e.code === "ArrowUp" || e.code === "ArrowDown")
        keyTiltRef.current.y = 0;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── device tilt: gyro biases gravity so avalanches drift downhill ──
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      gyroActiveRef.current = true;
      const pile = pileRef.current;
      if (!pile) return;
      pile.tiltX = Math.max(-1, Math.min(1, e.gamma / 30));
      pile.tiltY = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);

  // ── pointer: pour grains where you point ──
  const pourAt = useCallback((clientX: number, clientY: number) => {
    const mount = mountRef.current;
    const scene = sceneRef.current;
    const pile = pileRef.current;
    if (!mount || !scene || !pile) return;
    const rect = mount.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const g = scene.pickGrid(ndcX, ndcY);
    if (g) pile.pour(g.gx, g.gy, 3);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      pourActiveRef.current = true;
      pourAt(e.clientX, e.clientY);
    },
    [pourAt],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pourActiveRef.current) return;
      pourThrottleRef.current++;
      if (pourThrottleRef.current % 2 !== 0) return;
      pourAt(e.clientX, e.clientY);
    },
    [pourAt],
  );
  const onPointerUp = useCallback(() => {
    pourActiveRef.current = false;
  }, []);

  // ── gesture: open the AudioContext and start the instrument ──
  const begin = useCallback(() => {
    if (!audioRef.current) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AC();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        ctxRef.current = ctx;
        audioRef.current = makeDropAudio(ctx, PEAK);
      } catch {
        audioRef.current = null;
      }
    }
    // best-effort gyro permission on iOS (needs a user gesture)
    const dm = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (dm && typeof dm.requestPermission === "function") {
      dm.requestPermission().catch(() => {});
    }
    setPhase((p) => (p === "nogl" ? p : "running"));
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0a0503] text-white">
      <div
        ref={mountRef}
        className="absolute inset-0 block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/55 to-black/85 px-6">
          <div className="max-w-xl text-center">
            <h1 className="font-mono text-3xl text-white sm:text-4xl">
              The Drop
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-white/80">
              Grains rain onto a landscape. Slopes steepen invisibly to a
              critical angle, then <span className="text-amber-300/95">topple</span>{" "}
              in scale-free avalanches — and the avalanches <em>are</em> the music:
              mostly tiny ticks, the rare big one a full-spectrum drop. A real
              self-organized-critical sandpile that composes itself and never loops.
            </p>
            {phase === "nogl" && (
              <p className="mt-6 text-base text-rose-300">
                This device could not open a WebGL context, so the terrain cannot be
                drawn — but you can still press Begin and hear the pile play.
              </p>
            )}
            <button
              type="button"
              onClick={begin}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-full bg-amber-500/90 px-6 py-2.5 text-base font-medium text-black transition-colors hover:bg-amber-400"
            >
              Begin
            </button>
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="mt-4 block w-full text-base text-amber-300/95 underline-offset-4 hover:underline"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
            {showNotes && (
              <div className="mt-4 max-h-[42vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-5 text-left text-base leading-relaxed text-white/80">
                <p>
                  A CPU <span className="text-amber-300/95">abelian sandpile</span>{" "}
                  (Bak&ndash;Tang&ndash;Wiesenfeld, <em>Self-Organized Criticality</em>,
                  1987) runs on an 80&times;80 grid. A cell with 4+ grains topples,
                  shedding one to each neighbour; grains off the edge are lost. The
                  pile is driven slowly, so avalanche sizes follow a{" "}
                  <span className="text-amber-300/95">power law</span> &mdash; mostly
                  tiny, rarely enormous.
                </p>
                <p className="mt-3">
                  Each column is one instance in a three.js{" "}
                  <span className="text-amber-300/95">InstancedMesh</span>; its height
                  is its grain count and it glows white-hot as it topples, so an
                  avalanche is a wave of light. Tension (how loaded the pile is toward
                  critical) drives a riser; each avalanche&rsquo;s size drives the
                  release &mdash; ticks, swells, or a full-spectrum drop. Pitch is
                  continuous and inharmonic, mapped from the cascade&rsquo;s centroid,
                  never a scale.
                </p>
                <p className="mt-3 text-white/75">
                  Tap/drag to pour grains. Space = a seismic shock. Arrow keys (or
                  device tilt on a phone) lean gravity so avalanches drift. It plays
                  itself with no input. All motion is slow luminance drift &mdash; no
                  strobe; reduced-motion freezes the camera.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 select-none">
            <div className="font-mono text-2xl text-white/95">The Drop</div>
            <div className="mt-1 text-base text-white/80">
              tension{" "}
              <span className="text-amber-300/95">{readout.tension}%</span> · topples/f{" "}
              <span className="text-amber-300/95">{readout.activity}</span>
            </div>
            <div className="text-base text-white/75">
              last drop <span className="text-orange-300">{readout.last}</span> ·
              biggest <span className="text-orange-300">{readout.biggest}</span>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 select-none px-4 text-center">
            <p className="text-base text-white/75">
              tap / drag to pour · space = seismic shock · arrows / tilt lean gravity
            </p>
          </div>
        </>
      )}

      <PrototypeNav slugs={["1464-crystal-cortex", "1470-the-drop"]} />
    </main>
  );
}
