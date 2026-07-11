"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  createEngine,
  screenToField,
  MAX_SEEDS,
  type Engine,
} from "./gl";
import { startAudio, type CrystalAudio, type SeedAudioState } from "./audio";

// Deterministic PRNG — Math.random()/Date are banned in the dream zone.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fract = (v: number) => v - Math.floor(v);

/** Toroidal distance between two field coords in [0,1]². */
function toroDist(ax: number, ay: number, bx: number, by: number): number {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  dx = Math.min(dx, 1 - dx);
  dy = Math.min(dy, 1 - dy);
  return Math.hypot(dx, dy);
}

type Phase = "idle" | "running" | "error";

export default function CrystalCortex() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const audioRef = useRef<CrystalAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Seed field coords, laid out [x0,y0,x1,y1,…]; the display-space upload buffer.
  const seedsRef = useRef<Float32Array>(new Float32Array(MAX_SEEDS * 2));
  const uploadRef = useRef<Float32Array>(new Float32Array(MAX_SEEDS * 2));
  // pointerId → seed index currently being dragged.
  const grabbedRef = useRef<Map<number, number>>(new Map());
  // live warp params, so pointer picking agrees with the shader each frame.
  const warpRef = useRef({ u: 0, v: 0, aspect: 1 });
  const reducedRef = useRef(false);
  const startMsRef = useRef(0);
  const lastTRef = useRef(0);
  const audioAccRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [usesFloat, setUsesFloat] = useState(true);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    warpRef.current.aspect = w / h;
  }, []);

  const pointerField = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const canvas = canvasRef.current;
      if (!canvas) return [0, 0];
      const rect = canvas.getBoundingClientRect();
      const uvx = (clientX - rect.left) / rect.width;
      const uvy = 1 - (clientY - rect.top) / rect.height;
      const w = warpRef.current;
      return screenToField(uvx, uvy, w.aspect, w.u, w.v);
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phase !== "running") return;
      const [fx, fy] = pointerField(e.clientX, e.clientY);
      const seeds = seedsRef.current;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < MAX_SEEDS; i++) {
        const d = toroDist(fx, fy, seeds[i * 2], seeds[i * 2 + 1]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      grabbedRef.current.set(e.pointerId, best);
      seeds[best * 2] = fx;
      seeds[best * 2 + 1] = fy;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported */
      }
    },
    [phase, pointerField],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const idx = grabbedRef.current.get(e.pointerId);
      if (idx === undefined) return;
      const [fx, fy] = pointerField(e.clientX, e.clientY);
      const seeds = seedsRef.current;
      seeds[idx * 2] = fx;
      seeds[idx * 2 + 1] = fy;
    },
    [pointerField],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    grabbedRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }, []);

  const frame = useCallback((nowMs: number) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;

    const reduced = reducedRef.current;
    const t = (nowMs - startMsRef.current) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - lastTRef.current));
    lastTRef.current = t;

    // ── drift the un-grabbed seeds (idle self-demo) ────────────────────────────
    const seeds = seedsRef.current;
    const grabbedSet = new Set(grabbedRef.current.values());
    const dScale = reduced ? 0.25 : 1;
    for (let i = 0; i < MAX_SEEDS; i++) {
      if (grabbedSet.has(i)) continue;
      const vx =
        0.045 * Math.sin(t * 0.19 + i * 1.7) + 0.03 * Math.cos(t * 0.11 + i * 2.9);
      const vy =
        0.045 * Math.cos(t * 0.23 + i * 2.1) + 0.03 * Math.sin(t * 0.13 + i * 1.3);
      seeds[i * 2] = fract(seeds[i * 2] + vx * dScale * dt);
      seeds[i * 2 + 1] = fract(seeds[i * 2 + 1] + vy * dScale * dt);
    }

    // upload copy, clamped away from the (0,0) "invalid" sentinel
    const up = uploadRef.current;
    for (let i = 0; i < MAX_SEEDS * 2; i++) {
      up[i] = Math.min(0.9975, Math.max(0.0025, seeds[i]));
    }

    // warp params (slow inward tunnel drift + gentle rotation)
    const driftU = t * (reduced ? 0.006 : 0.02);
    const driftV = t * (reduced ? 0.002 : 0.006);
    warpRef.current.u = driftU;
    warpRef.current.v = driftV;

    resize();
    engine.runJFA(up, MAX_SEEDS);

    const bright = reduced ? 0.92 : 0.86 + 0.14 * Math.sin(2 * Math.PI * 0.15 * t);
    engine.draw(canvas.width, canvas.height, {
      aspect: warpRef.current.aspect,
      time: t,
      driftU,
      driftV,
      saturation: reduced ? 0.62 : 0.9,
      bright,
    });

    // ── audio state, throttled to ~30 Hz ───────────────────────────────────────
    audioAccRef.current += dt;
    const audio = audioRef.current;
    if (audio && audioAccRef.current >= 0.033) {
      audioAccRef.current = 0;
      const states: SeedAudioState[] = [];
      for (let i = 0; i < MAX_SEEDS; i++) {
        const ax = seeds[i * 2];
        const ay = seeds[i * 2 + 1];
        let nearest = Infinity;
        let neighbours = 0;
        for (let j = 0; j < MAX_SEEDS; j++) {
          if (j === i) continue;
          const d = toroDist(ax, ay, seeds[j * 2], seeds[j * 2 + 1]);
          if (d < nearest) nearest = d;
          if (d < 0.2) neighbours++;
        }
        states.push({ depth: ax, size: nearest, neighbours });
      }
      audio.update(states);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [resize]);

  const start = useCallback(() => {
    if (phase === "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current = prefersReducedMotion();
    resize();

    const engine = createEngine(canvas);
    if (!engine) {
      setPhase("error");
      return;
    }
    engineRef.current = engine;
    setUsesFloat(engine.usesFloat);

    // seed layout — deterministic spread
    const rng = mulberry32(0x1464c0de);
    const seeds = seedsRef.current;
    for (let i = 0; i < MAX_SEEDS; i++) {
      seeds[i * 2] = 0.06 + rng() * 0.88;
      seeds[i * 2 + 1] = 0.06 + rng() * 0.88;
    }

    // AudioContext ONLY from this gesture.
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      void ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = startAudio(ctx, MAX_SEEDS);
    } catch {
      // audio optional-failure shouldn't kill the visual; but sound is mandatory
      // so we surface it silently and keep the visuals running.
      audioRef.current = null;
    }

    startMsRef.current = performance.now();
    lastTRef.current = 0;
    setPhase("running");
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, resize, frame]);

  // teardown on unmount
  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
      ctxRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [resize]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Idle / start overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="max-w-xl text-center">
            <h1 className="font-serif text-3xl text-white sm:text-4xl">
              Crystal Cortex
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/80">
              The DMT &ldquo;jewelled honeycomb&rdquo; as a living Voronoi lattice
              you play by dragging its cells — a GPU jump-flood partition warped
              into an infinite stained-glass tunnel, where every cell sings a
              continuous tone.
            </p>
            {phase === "error" ? (
              <p className="mt-6 text-base text-rose-300">
                WebGL2 is unavailable in this browser, so the lattice can&rsquo;t
                run. Try a recent Chrome, Firefox, Safari, or Edge.
              </p>
            ) : (
              <button
                type="button"
                onClick={start}
                className="mt-8 min-h-[44px] rounded-full border border-violet-300/40 bg-violet-300/10 px-6 py-2.5 text-base font-medium text-violet-300 transition-colors hover:bg-violet-300/20"
              >
                Enter the lattice
              </button>
            )}
            <p className="mt-6 text-sm text-white/55">
              Drag cells with mouse or several fingers at once. Sound starts on
              tap. No strobe — all motion is slow drift.
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xs">
          <h2 className="font-serif text-xl text-white/95">Crystal Cortex</h2>
          <p className="mt-1 text-sm text-white/75">
            Drag a cell to bend the honeycomb and glide its voice.
          </p>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="pointer-events-auto mt-3 min-h-[44px] rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/80 transition-colors hover:bg-white/10"
          >
            {showNotes ? "Hide design notes" : "Design notes"}
          </button>
          {showNotes && (
            <div className="pointer-events-auto mt-3 rounded-lg border border-white/10 bg-black/70 p-4 text-sm leading-relaxed text-white/75 backdrop-blur">
              <p>
                The cell partition is a real{" "}
                <span className="text-emerald-300/95">Jump Flooding</span> Voronoi
                diagram (Rong &amp; Tan 2006), computed on the GPU in ping-pong
                framebuffers over ~9 passes, then sampled through an inverse{" "}
                <span className="text-amber-300/95">log-polar</span> warp — the
                retina&rarr;V1 cortical map behind Kl&uuml;ver&rsquo;s honeycomb
                form-constant.
              </p>
              <p className="mt-2">
                Each cell is a continuous voice: tunnel-depth &rarr; pitch, cell
                area &rarr; loudness, crowding &rarr; brightness.
              </p>
              <p className="mt-2 text-white/55">
                Field storage: {usesFloat ? "RGBA16F (float)" : "RGBA8 16-bit packed (fallback)"}.
              </p>
            </div>
          )}
        </div>
      )}

      <PrototypeNav slugs={["1462-box-temple", "1464-crystal-cortex", "1466-boltzmann-bloom"]} />
    </main>
  );
}
