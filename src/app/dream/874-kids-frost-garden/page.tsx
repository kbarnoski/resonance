"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dla } from "./dla";
import { FrostRenderer } from "./gl";
import { FrostAudio } from "./audio";

const MAX_POINTS = 6000;

export default function KidsFrostGarden() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<FrostAudio | null>(null);
  const [started, setStarted] = useState(false);
  const [glError, setGlError] = useState(false);

  // Mutable refs for the rAF loop without re-renders.
  const dlaRef = useRef<Dla | null>(null);
  const lastTouchRef = useRef<number>(0);

  const plantAtNorm = useCallback((nx: number, ny: number) => {
    const dla = dlaRef.current;
    if (!dla) return;
    dla.plantSeed(nx, ny);
    lastTouchRef.current = performance.now();
  }, []);

  const biasAtNorm = useCallback((nx: number, ny: number) => {
    const dla = dlaRef.current;
    if (!dla) return;
    dla.biasToward(nx, ny);
    lastTouchRef.current = performance.now();
  }, []);

  const start = useCallback(async () => {
    if (started) return;
    // Create + resume AudioContext inside the tap (iOS gesture gate).
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new Ctor();
      if (ac.state === "suspended") await ac.resume();
      acRef.current = ac;
      audioRef.current = new FrostAudio(ac);
    } catch {
      // Audio failed; we still show visuals.
      acRef.current = null;
      audioRef.current = null;
    }
    setStarted(true);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dla = new Dla({ maxTips: MAX_POINTS, walkerCount: 420 });
    dlaRef.current = dla;
    // Initial seed at bottom-center; grows on its own immediately.
    dla.plantSeed(0.5, 0.92);

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        antialias: true,
        alpha: false,
        premultipliedAlpha: false,
      });
    } catch {
      gl = null;
    }

    let renderer: FrostRenderer | null = null;
    if (gl) {
      try {
        renderer = new FrostRenderer(gl, MAX_POINTS);
      } catch {
        renderer = null;
        gl = null;
      }
    }
    if (!gl || !renderer) {
      setGlError(true);
    }

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (renderer) renderer.resize(w, h, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let t0 = performance.now();
    let autoDemoActive = false;
    let nextAutoSeed = 0;
    let idleAccum = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const time = (now - t0) / 1000;
      const sinceTouch = now - lastTouchRef.current;

      // Auto-demo: if untouched ~1.5s after start, plant seeds on its own so a
      // hands-free glance both sees and hears growth within ~1s.
      if (sinceTouch > 1500) {
        autoDemoActive = true;
      } else {
        autoDemoActive = false;
      }
      if (autoDemoActive && now > nextAutoSeed) {
        const nx = 0.18 + Math.random() * 0.64;
        const ny = 0.25 + Math.random() * 0.6;
        dla.plantSeed(nx, ny);
        nextAutoSeed = now + 1400 + Math.random() * 1200;
      }

      // Slow idle drip keeps the garden changing during inactivity.
      idleAccum += 1;
      if (idleAccum % 4 === 0) dla.idleDrip();

      // Advance simulation.
      dla.step(2);

      // Chime freshly-stuck tips (audio rate-limits internally). Pick the most
      // salient (highest) few to keep it gentle.
      const audio = audioRef.current;
      if (audio && dla.freshThisStep.length > 0) {
        const fresh = dla.freshThisStep;
        // Sort indices by height (top tips first) and chime a handful.
        const picks = fresh
          .map((i) => dla.tips[i])
          .filter((t) => t !== undefined)
          .sort((a, b) => a.ny - b.ny) // smaller ny = higher on screen
          .slice(0, 4);
        for (const t of picks) {
          audio.chime(1 - t.ny);
        }
      }

      // Density -> drone fullness.
      const fill = Math.min(1, dla.tipCount / 2800);
      if (audio) audio.setDensity(fill);

      if (renderer) {
        renderer.draw(dla.tips, dla.getWalkers(), time, fill, dpr);
      }
    };
    t0 = performance.now();
    lastTouchRef.current = performance.now();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (renderer) renderer.dispose();
      const audio = audioRef.current;
      if (audio) audio.dispose();
      const ac = acRef.current;
      if (ac) {
        ac.close().catch(() => {
          // ignore
        });
      }
      acRef.current = null;
      audioRef.current = null;
      dlaRef.current = null;
    };
  }, [started]);

  // Pointer handling -> normalized coords (0..1), y flipped so 0 = bottom.
  const pointerActive = useRef(false);

  const toNorm = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const nx = (clientX - r.left) / r.width;
    // ny is the screen-top fraction (0 = top). plantSeed maps it straight to
    // grid-y, and the renderer's flip puts grid-y=0 at screen-top, so the seed
    // lands exactly under the finger.
    const ny = (clientY - r.top) / r.height;
    return { nx: Math.max(0, Math.min(1, nx)), ny: Math.max(0, Math.min(1, ny)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointerActive.current = true;
    const n = toNorm(e.clientX, e.clientY);
    if (n) plantAtNorm(n.nx, n.ny);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointerActive.current) return;
    const n = toNorm(e.clientX, e.clientY);
    if (n) {
      biasAtNorm(n.nx, n.ny);
      // Occasionally plant along the drag for richer coral.
      if (Math.random() < 0.18) plantAtNorm(n.nx, n.ny);
    }
  };
  const onPointerUp = () => {
    pointerActive.current = false;
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06070f] text-foreground">
      {/* Render surface */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: started ? "block" : "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* Header / title overlay */}
      <div className="pointer-events-none relative z-10 px-6 pt-8">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">
          Frost Garden
        </h1>
        <p className="mt-2 max-w-md text-base text-muted-foreground">
          Touch the dark to plant a glowing seed. Luminous coral creeps outward
          on its own, and every new sparkle-tip rings a soft chime.
        </p>
        <p className="mt-1 text-base text-muted-foreground">
          A calm, endless bedtime garden of light.
        </p>
      </div>

      {glError && (
        <div className="pointer-events-none absolute left-6 top-40 z-10 max-w-sm text-base text-violet-300">
          Your device can’t show the glowing garden (WebGL2 unavailable), but
          the chimes and drone are still playing. Tap anywhere to hear new
          tips ring.
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            A growing garden of frost-light. Plant seeds with your finger and
            listen to each branch chime.
          </p>
          <button
            type="button"
            onClick={start}
            className="flex min-h-[72px] min-w-[72px] items-center justify-center rounded-full bg-violet-500/90 px-10 py-5 text-xl font-medium text-foreground shadow-lg shadow-violet-900/40 transition active:scale-95"
          >
            Start the garden
          </button>
        </div>
      )}

      {/* Footer affordance */}
      <div className="pointer-events-none absolute bottom-5 left-6 z-10">
        <span className="pointer-events-auto">
          <Link
            href="#design-notes"
            className="text-base text-violet-300 underline-offset-4 hover:underline"
          >
            Read the design notes
          </Link>
        </span>
        <p id="design-notes" className="mt-1 max-w-md text-base text-muted-foreground">
          Built with diffusion-limited aggregation (Witten &amp; Sander, 1981).
          See README.md for how it grows.
        </p>
      </div>
    </main>
  );
}
