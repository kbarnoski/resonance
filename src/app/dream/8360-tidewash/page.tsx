"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { flowColor, type Splat, type VisualFluid } from "./shared";
import { makeShadowField, makeCpuFluid, type ShadowField } from "./cpu-fluid";
import { makeGpuFluid } from "./gpu-fluid";
import { makeGlFluid } from "./gl-fluid";
import { makeCamera, type Camera, type MotionSample } from "./camera";
import { makeConductor, type Conductor } from "./conductor";
import {
  makeGranularEngine,
  type GranularEngine,
  type PointEnergy,
} from "./audio";

const SEED = 0x7a1de;
const FIELD_N = 80;
const MOTION_HANDOVER = 0.014;

// Constellation of listening points: bottom = low & warm, top = bright & high.
// Each samples the flow field to drive its grains; x sets stereo pan.
const POINTS: { x: number; y: number; freq: number }[] = [
  { x: 0.2, y: 0.82, freq: 110 },
  { x: 0.5, y: 0.86, freq: 146.83 },
  { x: 0.8, y: 0.78, freq: 164.81 },
  { x: 0.32, y: 0.5, freq: 220 },
  { x: 0.68, y: 0.46, freq: 246.94 },
  { x: 0.45, y: 0.25, freq: 329.63 },
  { x: 0.66, y: 0.2, freq: 440 },
];

type Tier = "webgpu" | "webgl2" | "cpu";
type CamStatus = "off" | "requesting" | "live" | "denied";

function newCanvas(container: HTMLElement): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement("canvas");
  const w = Math.max(1, container.clientWidth);
  const h = Math.max(1, container.clientHeight);
  c.width = Math.floor(w * dpr);
  c.height = Math.floor(h * dpr);
  c.style.width = "100%";
  c.style.height = "100%";
  c.style.display = "block";
  container.appendChild(c);
  return c;
}

async function pickTier(): Promise<Tier> {
  if (typeof navigator !== "undefined" && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) return "webgpu";
    } catch {
      /* fall through */
    }
  }
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2");
    if (gl && gl.getExtension("EXT_color_buffer_float")) return "webgl2";
  } catch {
    /* fall through */
  }
  return "cpu";
}

// Probe first, then create exactly one real canvas for the winning tier so we
// never leave orphaned canvases behind (a canvas can hold only one context
// type). On a late build failure we drop to CPU on a fresh canvas.
async function buildVisual(
  container: HTMLElement,
  field: ShadowField,
): Promise<VisualFluid> {
  const tier = await pickTier();
  const canvas = newCanvas(container);
  try {
    if (tier === "webgpu") return await makeGpuFluid(canvas);
    if (tier === "webgl2") return makeGlFluid(canvas);
  } catch {
    canvas.remove();
    return makeCpuFluid(newCanvas(container), field);
  }
  return makeCpuFluid(canvas, field);
}

export default function TidewashPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const visualRef = useRef<VisualFluid | null>(null);
  const fieldRef = useRef<ShadowField | null>(null);
  const conductorRef = useRef<Conductor | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const audioRef = useRef<GranularEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const handoverRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  // mutable mirror of camera-live state readable inside the rAF closure
  const camStatusLive = useRef(false);

  const [tier, setTier] = useState<Tier | null>(null);
  const [started, setStarted] = useState(false);
  const [camStatus, setCamStatus] = useState<CamStatus>("off");
  const [conducting, setConducting] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── visual + conductor loop (runs on mount, before any audio) ──────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const field = makeShadowField(FIELD_N, reducedRef.current);
    fieldRef.current = field;
    conductorRef.current = makeConductor(SEED);
    startRef.current = performance.now();
    lastRef.current = startRef.current;

    buildVisual(container, field).then((vis) => {
      if (cancelled) {
        // this effect was already torn down (e.g. StrictMode remount) — drop
        // the just-built sim and any canvas it appended after cleanup ran
        vis.destroy();
        while (container.firstChild) container.removeChild(container.firstChild);
        return;
      }
      visualRef.current = vis;
      setTier(vis.kind);
    });

    const loop = (now: number): void => {
      rafRef.current = requestAnimationFrame(loop);
      const vis = visualRef.current;
      const fld = fieldRef.current;
      if (!fld) return;

      const dt = Math.min(0.05, Math.max(0, (now - lastRef.current) / 1000));
      lastRef.current = now;
      const t = (now - startRef.current) / 1000;
      const reduced = reducedRef.current;

      // gather stir events from the player (camera) or the seeded conductor
      let samples: MotionSample[] = [];
      const cam = cameraRef.current;
      if (cam && camStatusLive.current) {
        const r = cam.poll();
        if (r.motion > MOTION_HANDOVER && !handoverRef.current) {
          handoverRef.current = true;
          setConducting(true);
        }
        if (handoverRef.current) samples = r.samples;
      }
      if (!handoverRef.current && conductorRef.current) {
        samples = conductorRef.current.sample(t, reduced);
      }

      const force = reduced ? 1.5 : 3.0;
      for (const s of samples) {
        const speed = Math.hypot(s.vx, s.vy);
        const col = flowColor(Math.min(1, speed * 2.6));
        const bright = 0.4 + s.strength;
        const splat: Splat = {
          x: s.x,
          y: s.y,
          vx: s.vx * force,
          vy: s.vy * force,
          r: col[0] * bright,
          g: col[1] * bright,
          b: col[2] * bright,
          radius: 0.11,
        };
        fld.splat(splat);
        if (vis) vis.splat(splat);
      }

      fld.step(dt);
      if (vis) vis.frame(dt);

      // couple the flow field into the granular engine
      const eng = audioRef.current;
      if (eng) {
        const pe: PointEnergy[] = POINTS.map((p) => {
          const f = fld.sample(p.x, p.y);
          return {
            pan: p.x * 2 - 1,
            freq: p.freq,
            speed: f.speed,
            vort: f.vort,
            energy: f.energy,
          };
        });
        eng.update(pe);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      visualRef.current?.destroy();
      visualRef.current = null;
      fieldRef.current = null;
      // remove any canvas we appended
      while (container.firstChild) container.removeChild(container.firstChild);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    camStatusLive.current = camStatus === "live";
  }, [camStatus]);

  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // audio requires a user gesture — build + resume here
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;
    const eng = makeGranularEngine(ctx, SEED, reducedRef.current);
    eng.start();
    audioRef.current = eng;

    // try the webcam; graceful fallback to the seeded conductor on denial
    setCamStatus("requesting");
    try {
      const cam = makeCamera();
      await cam.start();
      cameraRef.current = cam;
      const preview = previewRef.current;
      if (preview) {
        cam.video.style.width = "100%";
        cam.video.style.height = "100%";
        cam.video.style.objectFit = "cover";
        cam.video.style.transform = "scaleX(-1)";
        preview.appendChild(cam.video);
      }
      setCamStatus("live");
    } catch {
      setCamStatus("denied");
    }
  }, [started]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      cameraRef.current?.stop();
      cameraRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
      ctxRef.current = null;
      visualRef.current?.destroy();
      visualRef.current = null;
    };
  }, []);

  const readoutTier = tier ? tier.toUpperCase() : "…";
  const readoutInput =
    camStatus === "live"
      ? conducting
        ? "HANDS"
        : "HANDS · WAITING"
      : camStatus === "denied"
        ? "CONDUCTOR (NO CAM)"
        : "CONDUCTOR";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* fluid art layer */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
        <header className="max-w-md">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Tidewash
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Conduct a luminous fluid with your bare hands — the vorticity you
            stir granulates a warm pad into a living cosmic wash.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>
              tier · <span className="text-primary">{readoutTier}</span>
            </span>
            <span>
              input · <span className="text-primary">{readoutInput}</span>
            </span>
          </div>
          {camStatus === "denied" && (
            <p className="mt-2 text-sm text-destructive">
              No camera — the seeded conductor is stirring the tide for you.
            </p>
          )}
        </header>

        <footer className="pointer-events-auto flex items-center gap-3">
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
          {started && camStatus === "live" && !conducting && (
            <span className="text-sm text-muted-foreground">
              Wave a hand to take the tide.
            </span>
          )}
        </footer>
      </div>

      {/* camera preview */}
      <div
        ref={previewRef}
        className={`absolute bottom-16 right-4 h-24 w-32 overflow-hidden rounded-md border border-border bg-background/40 ${
          camStatus === "live" ? "opacity-70" : "hidden"
        }`}
      />

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Enter the tide
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A real-time fluid field is already flowing behind this card,
              stirred by a seeded conductor. Start audio and grant your camera
              to conduct it with your hands — motion injects force and dye, and
              wherever the fluid swirls fast, grains of a warm pad fire denser
              and brighter. Calm pools go quiet and deep. Sound needs a tap to
              begin.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Enter the tide
              </button>
              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The gesture.</span> Your
                webcam frames are diffed frame-to-frame and turned into a coarse
                optical-flow field — no ML, just brightness deltas and
                gradients. The strongest-moving cells become force and dye
                splats, so your hand literally stirs the flow.
              </p>
              <p>
                <span className="text-foreground">The fluid.</span> A Stam-style
                stable-fluids solver (advect → vorticity confinement → pressure
                projection → dye) runs on WebGPU where available, WebGL2 next,
                and a CPU grid last — whichever your device can drive, shown in
                the tier readout.
              </p>
              <p>
                <span className="text-foreground">The sound.</span> Seven
                listening points sample the flow. Local speed sets grain
                density and brightness; vorticity opens a bandpass; a detuned
                bed keeps calm from becoming silence. The pad is synthesized in
                the browser — the piece always sounds, offline.
              </p>
              <p className="text-xs text-muted-foreground/70">
                After ASTRODITHER (Robert Borghesi, 2026), Jos Stam&rsquo;s
                Stable Fluids (1999), and Refik Anadol&rsquo;s fluid
                data-paintings.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8360-tidewash"]} />
    </main>
  );
}
