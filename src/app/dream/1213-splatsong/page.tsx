"use client";

// ════════════════════════════════════════════════════════════════════════════
// SPLATSONG (1213) — "What if a cloud-of-light sculpture had a material you
// could hear?"
//
// A procedural "resonant cairn" rendered with TRUE 3D Gaussian splatting
// (anisotropic-covariance EWA rasterization, not loose additive particles).
// ORBIT it by dragging; STRIKE a cluster by tapping it. Each cluster carries an
// INFERRED material (glass / stone / metal bar / wood) derived from its splat
// statistics — SonicGauss-style — and rings a physically-modelled modal impact.
//
// Splat rasterization: splat-gl.ts   ·   Material inference + scene: scene.ts
// Modal impact voices: modal-synth.ts ·   Canvas2D degrade: splat-2d.ts
//
// SAFETY: no strobe. Auto-orbit and idle shimmer are slow continuous drift
// (≪3 Hz); strike flashes are smooth exp ramps, never full-screen flashes.
// Respects prefers-reduced-motion. Audio is gesture-gated behind Begin and the
// master gain ramps from 0. Full teardown on unmount.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mat4Identity, lookAt, perspective, projectToScreen, Mat4, Vec3 } from "./mat";
import { buildScene, Scene, MATERIALS } from "./scene";
import { SplatRenderer } from "./splat-gl";
import { Splat2D } from "./splat-2d";
import { ModalSynth } from "./modal-synth";

const TARGET: Vec3 = [0, 0.42, 0];
const BASE_RADIUS = 4.7;
const FOVY = 0.82;

type Phase = "idle" | "running";
type Mode = "webgl" | "canvas2d" | "none";

interface StrikeInfo {
  label: string;
  hz: number;
  material: string;
}

export default function SplatsongPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [lastStrike, setLastStrike] = useState<StrikeInfo | null>(null);

  // scene + renderers + audio
  const sceneRef = useRef<Scene | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const rendererRef = useRef<SplatRenderer | null>(null);
  const fallbackRef = useRef<Splat2D | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const modeRef = useRef<Mode>("none");
  const synthRef = useRef<ModalSynth | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // camera
  const azRef = useRef(0.6);
  const elRef = useRef(0.32);
  const radiusRef = useRef(BASE_RADIUS);
  const viewRef = useRef<Mat4>(mat4Identity());
  const projRef = useRef<Mat4>(mat4Identity());

  // per-cluster strike flash + idle shimmer
  const flashRef = useRef<Float32Array>(new Float32Array(8));
  const outFlashRef = useRef<Float32Array>(new Float32Array(8));

  // loop + interaction
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const reducedRef = useRef(false);
  const dprRef = useRef(1.75);
  const draggingRef = useRef(false);
  const movedRef = useRef(0);
  const downTimeRef = useRef(0);
  const downXYRef = useRef<[number, number]>([0, 0]);
  const lastXYRef = useRef<[number, number]>([0, 0]);
  const idleTimerRef = useRef(0);
  const interactRef = useRef(0); // seconds since last user interaction

  // ── size the canvas to its box with a DPR cap ──
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    dprRef.current = dpr;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  // ── build camera matrices for the current orbit state ──
  const buildCamera = useCallback((cssW: number, cssH: number) => {
    const az = azRef.current;
    const el = elRef.current;
    const r = radiusRef.current;
    const eye: Vec3 = [
      TARGET[0] + r * Math.cos(el) * Math.sin(az),
      TARGET[1] + r * Math.sin(el),
      TARGET[2] + r * Math.cos(el) * Math.cos(az),
    ];
    lookAt(viewRef.current, eye, TARGET, [0, 1, 0]);
    perspective(projRef.current, FOVY, cssW / Math.max(1, cssH), 0.05, 100);
  }, []);

  // ── pick + strike the cluster nearest a screen point (weighted by depth) ──
  const strikeAt = useCallback((px: number, py: number, cssW: number, cssH: number, velocity: number) => {
    const scene = sceneRef.current;
    if (!scene) return;
    let best = -1;
    let bestScore = Infinity;
    // normalize depth across clusters so nearer ones are slightly preferred
    let minW = Infinity;
    let maxW = -Infinity;
    const projs = scene.clusters.map((c) => projectToScreen(projRef.current, viewRef.current, c.center, cssW, cssH));
    for (const p of projs) {
      if (p.behind) continue;
      if (p.w < minW) minW = p.w;
      if (p.w > maxW) maxW = p.w;
    }
    const span = Math.max(1e-3, maxW - minW);
    for (let i = 0; i < scene.clusters.length; i++) {
      const p = projs[i];
      if (p.behind) continue;
      const dScreen = Math.hypot(p.sx - px, p.sy - py);
      const depthNorm = (p.w - minW) / span; // 0 nearest … 1 farthest
      const score = dScreen + depthNorm * 55; // px penalty for far clusters
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) return;
    const cluster = scene.clusters[best];
    // flash (smooth ramp handled in the loop by decay)
    flashRef.current[best] = Math.min(1, 0.55 + velocity * 0.5);

    const synth = synthRef.current;
    if (synth) {
      const proj = projs[best];
      const pan = Math.max(-1, Math.min(1, ((proj.sx / cssW) * 2 - 1) * 0.7));
      synth.strike(cluster.material, cluster.fundamental, velocity, pan);
    }
    setLastStrike({
      label: MATERIALS[cluster.material].label,
      hz: Math.round(cluster.fundamental),
      material: cluster.material,
    });
  }, []);

  const shimmerAll = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.clusters.forEach((c, i) => {
      window.setTimeout(() => {
        flashRef.current[i] = 0.8;
        const synth = synthRef.current;
        if (synth) synth.strike(c.material, c.fundamental, 0.34, 0);
      }, i * 130);
    });
    interactRef.current = 0;
  }, []);

  // ── pointer handlers ──
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    draggingRef.current = true;
    movedRef.current = 0;
    downTimeRef.current = performance.now();
    downXYRef.current = [x, y];
    lastXYRef.current = [x, y];
    interactRef.current = 0;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [lx, ly] = lastXYRef.current;
    const dx = x - lx;
    const dy = y - ly;
    lastXYRef.current = [x, y];
    movedRef.current += Math.abs(dx) + Math.abs(dy);
    const k = 0.006;
    azRef.current -= dx * k;
    elRef.current = Math.max(-0.5, Math.min(1.15, elRef.current + dy * k));
    interactRef.current = 0;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dur = performance.now() - downTimeRef.current;
    // a tap (little movement, quick) is a STRIKE; a drag was an orbit
    if (movedRef.current < 9 && dur < 600) {
      const vel = Math.max(0.32, Math.min(0.85, 0.42 + (1 - Math.min(1, dur / 320)) * 0.4));
      strikeAt(x, y, rect.width, rect.height, vel);
    }
    interactRef.current = 0;
  }, [strikeAt]);

  // ── main animation loop (always running while mounted) ──
  const frame = useCallback(
    (now: number) => {
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;
      const reduced = reducedRef.current;

      interactRef.current += dt;
      // gentle auto-orbit once the user has left it alone for a moment
      if (interactRef.current > 1.2 && !draggingRef.current) {
        azRef.current += dt * (reduced ? 0.03 : 0.075);
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      buildCamera(cssW, cssH);

      // strike-flash decay + slow idle shimmer, combined into outFlash
      const fl = flashRef.current;
      const out = outFlashRef.current;
      const decay = Math.exp(-dt / 0.34);
      const shimAmp = reduced ? 0.02 : 0.05;
      for (let i = 0; i < 8; i++) {
        fl[i] *= decay;
        const idle = shimAmp * (0.5 + 0.5 * Math.sin(now * 0.00045 + i * 1.7)); // ≪3 Hz
        out[i] = Math.min(1.4, fl[i] + idle);
      }
      const bgShimmer = (reduced ? 0.006 : 0.014) * Math.sin(now * 0.00028);

      // idle audio shimmer: an occasional soft ping if left untouched while running
      if (phase === "running" && !reduced) {
        idleTimerRef.current -= dt;
        if (interactRef.current > 5 && idleTimerRef.current <= 0) {
          idleTimerRef.current = 6 + Math.random() * 6;
          const scene = sceneRef.current;
          const synth = synthRef.current;
          if (scene && synth) {
            const i = Math.floor(Math.random() * scene.clusters.length);
            const c = scene.clusters[i];
            synth.strike(c.material, c.fundamental, 0.12, 0);
            fl[i] = Math.max(fl[i], 0.35);
          }
        }
      }

      const dpr = dprRef.current;
      const H = canvas.height;
      const focal = 0.5 * H / Math.tan(0.5 * FOVY);

      if (modeRef.current === "webgl" && rendererRef.current) {
        rendererRef.current.frame(viewRef.current, projRef.current, [focal, focal], out, bgShimmer, now);
      } else if (modeRef.current === "canvas2d" && fallbackRef.current) {
        fallbackRef.current.frame(viewRef.current, projRef.current, 0.5 * cssH / Math.tan(0.5 * FOVY), out, bgShimmer, cssW, cssH, dpr);
      }

      rafRef.current = requestAnimationFrame(frame);
    },
    [buildCamera, phase],
  );

  // ── mount: build scene, init a renderer, start the loop ──
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    const scene = buildScene();
    sceneRef.current = scene;

    const canvas = canvasRef.current;
    if (!canvas) return;
    resize();

    let contextLostHandler: ((ev: Event) => void) | null = null;
    try {
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        alpha: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      });
      if (gl) {
        glRef.current = gl;
        rendererRef.current = new SplatRenderer(gl, scene);
        modeRef.current = "webgl";
        contextLostHandler = (ev: Event) => {
          ev.preventDefault();
          if (rendererRef.current) rendererRef.current.lost = true;
          setGlNotice("The graphics context was lost — reload the page to restore the sculpture.");
        };
        canvas.addEventListener("webglcontextlost", contextLostHandler as EventListener, false);
      } else {
        throw new Error("no webgl2");
      }
    } catch {
      // Canvas2D degrade path
      const c2d = canvas.getContext("2d");
      if (c2d) {
        ctx2dRef.current = c2d;
        fallbackRef.current = new Splat2D(c2d, scene);
        modeRef.current = "canvas2d";
        setGlNotice("WebGL2 is unavailable — showing a reduced Canvas2D fallback (still strikeable + audible).");
      } else {
        modeRef.current = "none";
        setGlNotice("Neither WebGL2 nor Canvas2D is available in this browser.");
      }
    }

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      window.removeEventListener("resize", onResize);
      if (contextLostHandler) {
        canvas.removeEventListener("webglcontextlost", contextLostHandler as EventListener);
      }
      rendererRef.current?.dispose();
      rendererRef.current = null;
      fallbackRef.current = null;
    };
  }, [frame, resize]);

  const teardownAudio = useCallback(() => {
    synthRef.current?.dispose();
    synthRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, []);

  useEffect(() => () => teardownAudio(), [teardownAudio]);

  const handleBegin = useCallback(async () => {
    if (synthRef.current) return;
    setAudioError(null);
    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound.");
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Try the button again.");
      return;
    }
    audioCtxRef.current = ctx;
    const synth = new ModalSynth(ctx);
    synth.start();
    synthRef.current = synth;
    interactRef.current = 0;
    setPhase("running");
  }, []);

  const handleStop = useCallback(() => {
    teardownAudio();
    setPhase("idle");
    setLastStrike(null);
  }, [teardownAudio]);

  return (
    <main className="relative min-h-screen w-full touch-none overflow-hidden bg-[#232427] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-hidden
      />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.25em] text-foreground sm:text-2xl">
          splatsong
        </h1>
        <p className="mt-2 max-w-xl text-base text-muted-foreground">
          A cloud-of-light cairn of true 3D Gaussian splats with a{" "}
          <span className="text-foreground">material you can hear</span>. Drag to orbit; tap a
          cluster to strike it. Each cluster&rsquo;s material is inferred from its splats and
          rings a modelled modal impact.
        </p>
      </header>

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-5 border border-border bg-black/55 px-8 py-7 text-center backdrop-blur-sm">
            <p className="text-base text-foreground">
              Six splat clusters &mdash; glass, stone, a brass bar, wood &mdash; float as a
              resonant cairn. Orbit by dragging. Tap a cluster and its inferred material sings
              a physically-modelled strike.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] min-w-[44px] bg-card px-4 py-2.5 font-mono text-base font-medium uppercase tracking-widest text-black transition-colors hover:bg-accent"
            >
              Begin
            </button>
            <p className="text-base text-muted-foreground">
              Sound starts on this tap (master gain ramps up from silence). The sculpture is
              already turning behind this panel.
            </p>
            {audioError && <p className="text-base text-violet-300">{audioError}</p>}
            {glNotice && <p className="text-base text-violet-300">{glNotice}</p>}
          </div>
        </div>
      )}

      {/* control dock */}
      {phase === "running" && (
        <div className="absolute bottom-4 left-1/2 z-10 w-[min(96vw,720px)] -translate-x-1/2">
          <div className="flex flex-wrap items-center gap-2 border border-border bg-black/55 px-4 py-3 backdrop-blur-sm">
            <div className="mr-2 min-w-[190px] font-mono text-base text-muted-foreground">
              {lastStrike ? (
                <>
                  struck <span className="text-foreground">{lastStrike.label}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {lastStrike.hz} Hz
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">tap a cluster to strike it</span>
              )}
            </div>

            <button
              onClick={shimmerAll}
              className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
            >
              shimmer all
            </button>

            <span className="mx-1 hidden h-6 w-px bg-muted sm:block" />

            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={handleStop}
                className="min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
              >
                stop
              </button>
            </div>
          </div>
          <p className="mt-2 text-center font-mono text-base text-muted-foreground">
            drag = orbit · tap = strike · quicker tap = harder hit
          </p>
          {glNotice && <p className="mt-1 text-center text-base text-violet-300">{glNotice}</p>}
        </div>
      )}

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] border border-border bg-black/40 px-4 py-2.5 font-mono text-base text-foreground backdrop-blur-sm transition-colors hover:bg-black/60"
      >
        design notes
      </button>
      {showNotes && (
        <div className="absolute right-4 top-20 z-30 max-h-[78vh] w-[min(92vw,470px)] overflow-y-auto border border-border bg-black/85 p-5 text-base text-foreground backdrop-blur-sm">
          <p className="mb-2 font-mono text-xl uppercase tracking-widest text-foreground">
            a material you can hear
          </p>
          <p className="mb-2">
            The sculpture is ~4.5k anisotropic 3D Gaussians. Each has a position, a 3-vector
            scale and a rotation quaternion that build a 3&times;3 covariance &Sigma; = R&middot;S&middot;S&#7488;&middot;R&#7488;.
            Every frame the vertex shader projects &Sigma; to a 2D screen conic through the
            Jacobian of the perspective projection (EWA splatting), emits a camera-facing quad,
            and the fragment shader evaluates the Gaussian falloff. Splats are depth-sorted
            back-to-front on the CPU and composited with premultiplied &ldquo;over&rdquo; alpha
            for the soft volumetric look.
          </p>
          <p className="mb-2 text-muted-foreground">
            Each cluster&rsquo;s <em>material</em> is inferred from its splat statistics, the way
            SonicGauss reads a material off a Gaussian field: tight+small+bright+cool &rArr; glass;
            large+diffuse+dark+desaturated &rArr; stone; elongated+metallic &rArr; a brass bar;
            mid+warm &rArr; wood. Striking excites a bank of 5&ndash;8 exponentially-decaying
            sinusoids (a modal impact model) whose ratios + decay times come from the material, a
            short filtered-noise mallet gives the contact click, pitch comes from cluster size, and
            strike velocity sets loudness + brightness. The bus runs into a limiter and the master
            gain ramps from 0.
          </p>
          <p className="mb-2 text-muted-foreground">
            Palette: a neutral studio light-box, not a dark void &mdash; the colour lives in the
            material (glass aqua, slate stone, brass, umber wood). No strobe: the auto-orbit and
            idle shimmer are slow continuous drift (&#8810;3 Hz) and every strike flash is a smooth
            exponential ramp. Respects prefers-reduced-motion.
          </p>
          <p className="text-muted-foreground">
            Refs: Kerbl et al., <em>3D Gaussian Splatting for Real-Time Radiance Field Rendering</em>,
            SIGGRAPH 2023; WebSplatter (arXiv 2602.03207, Feb 2026); SonicGauss (arXiv 2507.19835).
          </p>
          <div className="mt-3">
            <Link href="/dream" className="font-mono text-foreground underline hover:text-foreground">
              &larr; back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
