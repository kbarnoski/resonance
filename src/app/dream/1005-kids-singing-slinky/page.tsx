"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  makeSlinky,
  stepSlinky,
  flickSlinky,
  modeAmplitudes,
  chainEnergy,
  type SlinkyState,
} from "./spring";
import { makeRenderer, type Renderer } from "./render";
import { buildAudio, snapPentatonic, type SlinkyAudio } from "./audio";

// ─────────────────────────────────────────────────────────────────────────────
// 1005 · KIDS SINGING SLINKY
// Flick a glowing rainbow slinky in true 3D and watch a bright COMPRESSION pulse
// race down the coil, bounce off the far end, and settle into a humming STANDING
// WAVE you both SEE (bunched/stretched bands) and HEAR (the spring's pitch).
//
// INPUT: pointer drag-to-flick + tap-to-pluck + ~2s-idle hands-free auto-demo.
// OUTPUT: hand-written true-3D WebGL2 (own perspective/lookAt) -> Canvas2D side
//         fallback. TECHNIQUE: 1D longitudinal mass-spring chain (CPU) -> its
//         standing-wave modes ARE the harmonic series -> additive synthesis.
// VIBE: bright, playful, glowing rainbow slinky on a clean dark playground.
// ─────────────────────────────────────────────────────────────────────────────

const N = 128; // coils — smooth on a mid phone
const N_MODES = 8;
const DT = 1 / 480;
const SUBSTEPS = 8;
const HELIX_TURNS = 9;
const HELIX_RADIUS = 1.5;
const AXIS_LEN = 6.0; // total length along the helix axis (x)

export default function SingingSlinkyPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [fallback, setFallback] = useState(false);

  // refs that survive re-renders for the animation loop
  const slinkyRef = useRef<SlinkyState | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const audioRef = useRef<SlinkyAudio | null>(null);
  const rafRef = useRef<number>(0);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);

  // interaction state
  const grabRef = useRef<{ index: number; u: number } | null>(null);
  const lastInputRef = useRef<number>(0);
  const camAngleRef = useRef<number>(0.7);

  // reusable scratch arrays
  const positionsRef = useRef<Float32Array>(new Float32Array(N * 3));
  const huesRef = useRef<Float32Array>(new Float32Array(N));
  const glowsRef = useRef<Float32Array>(new Float32Array(N));
  const modesRef = useRef<Float32Array>(new Float32Array(N_MODES));

  // Convert a pointer x (0..1 across canvas) to a coil index to grab.
  const pickIndex = useCallback((nx: number): number => {
    const i = Math.round(nx * (N - 1));
    return Math.min(N - 2, Math.max(1, i));
  }, []);

  const handleStart = useCallback(() => {
    // create/resume AudioContext inside the tap handler (iOS requirement)
    const audio = buildAudio();
    if (audio) {
      audioRef.current = audio;
      if (audio.ctx.state === "suspended") {
        audio.ctx.resume().catch(() => {});
      }
    }
    setStarted(true);
  }, []);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const slinky = makeSlinky(N);
    slinkyRef.current = slinky;
    lastInputRef.current = performance.now();

    // ── set up WebGL2, fall back to Canvas2D ──
    let useGL = false;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      const renderer = makeRenderer(gl);
      if (renderer) {
        glRef.current = gl;
        rendererRef.current = renderer;
        useGL = true;
      }
    }
    if (!useGL) {
      const c2d = canvas.getContext("2d");
      ctx2dRef.current = c2d;
      setFallback(true);
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      if (glRef.current) {
        glRef.current.viewport(0, 0, canvas.width, canvas.height);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    // ── pointer handlers: grab/drag/release ──
    const toNorm = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return {
        nx: (clientX - r.left) / r.width,
        ny: (clientY - r.top) / r.height,
      };
    };

    const onDown = (clientX: number, clientY: number) => {
      lastInputRef.current = performance.now();
      const { nx } = toNorm(clientX, clientY);
      const index = pickIndex(nx);
      grabRef.current = { index, u: 0 };
      // grab height picks the fundamental pitch (snapped to pentatonic)
      const audio = audioRef.current;
      if (audio) audio.setFundamental(snapPentatonic(1 - nx));
    };

    const onMove = (clientX: number, clientY: number) => {
      if (!grabRef.current) return;
      lastInputRef.current = performance.now();
      const { ny } = toNorm(clientX, clientY);
      // vertical drag compresses/stretches the held coil along the axis
      grabRef.current.u = (0.5 - ny) * 1.6;
    };

    const onUp = () => {
      const g = grabRef.current;
      if (g) {
        // release -> flick: strength from how far it was pulled (clamped)
        const strength = Math.min(0.9, Math.abs(g.u) + 0.25);
        flickSlinky(slinky, g.u >= 0 ? strength : -strength);
        grabRef.current = null;
      }
      lastInputRef.current = performance.now();
    };

    const pd = (e: PointerEvent) => {
      e.preventDefault();
      onDown(e.clientX, e.clientY);
    };
    const pm = (e: PointerEvent) => onMove(e.clientX, e.clientY);
    const pu = () => onUp();

    canvas.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    window.addEventListener("pointercancel", pu);

    // ── auto-demo: if idle ~2s, flick it ourselves so it's never static ──
    let demoPhase = 0;
    const maybeAutoDemo = (now: number) => {
      if (grabRef.current) return;
      if (now - lastInputRef.current > 2000) {
        const audio = audioRef.current;
        if (audio) audio.setFundamental(snapPentatonic((demoPhase % 5) / 4));
        const dir = demoPhase % 2 === 0 ? 1 : -1;
        flickSlinky(slinky, dir * (0.45 + 0.25 * Math.random()));
        demoPhase++;
        lastInputRef.current = now + 1600; // space out the auto flicks
      }
    };

    // ── helix layout: build 3D positions from displacements ──
    const layout = () => {
      const pos = positionsRef.current;
      const hues = huesRef.current;
      const glows = glowsRef.current;
      const u = slinky.u;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        // base axial position + longitudinal displacement (compression!)
        const axial = t * AXIS_LEN - AXIS_LEN / 2 + u[i];
        const theta = t * HELIX_TURNS * Math.PI * 2;
        pos[i * 3 + 0] = axial; // axis along x
        pos[i * 3 + 1] = Math.sin(theta) * HELIX_RADIUS;
        pos[i * 3 + 2] = Math.cos(theta) * HELIX_RADIUS;
        hues[i] = t * 0.85; // rainbow along the coil
        // local compression = how bunched this coil is vs its neighbour
        const du = i > 0 ? u[i] - u[i - 1] : 0;
        glows[i] = Math.min(1, Math.abs(du) * 8 + Math.abs(u[i]) * 1.5);
      }
    };

    // ── Canvas2D fallback: side view of the coil + compression coloring ──
    const drawFallback = () => {
      const c2d = ctx2dRef.current;
      if (!c2d) return;
      const w = canvas.width;
      const h = canvas.height;
      c2d.fillStyle = "#0a0d17";
      c2d.fillRect(0, 0, w, h);
      const pos = positionsRef.current;
      const glows = glowsRef.current;
      const hues = huesRef.current;
      const sx = w / (AXIS_LEN + 2);
      const cx = w / 2;
      const cy = h / 2;
      for (let i = 0; i < N; i++) {
        const x = cx + pos[i * 3 + 0] * sx * 0.9;
        const y = cy + pos[i * 3 + 1] * sx * 0.5;
        const g = glows[i];
        const hue = hues[i] * 360;
        const rad = 3 + g * 7;
        c2d.beginPath();
        c2d.fillStyle = `hsl(${hue}, 95%, ${55 + g * 35}%)`;
        c2d.globalAlpha = 0.85;
        c2d.arc(x, y, rad, 0, Math.PI * 2);
        c2d.fill();
      }
      c2d.globalAlpha = 1;
    };

    // ── main loop ──
    let prev = performance.now();
    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dtReal = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      maybeAutoDemo(now);

      // slow camera orbit so it always reads as 3D
      camAngleRef.current += dtReal * 0.22;

      // physics: fixed substeps scaled to real time
      const g = grabRef.current;
      const stepsThisFrame = Math.max(1, Math.round((dtReal / DT)));
      const total = Math.min(stepsThisFrame, 24);
      stepSlinky(
        slinky,
        DT,
        Math.max(SUBSTEPS, total),
        g ? g.index : -1,
        g ? g.u : 0,
      );

      layout();

      // audio: project onto modes, swell from energy
      const audio = audioRef.current;
      if (audio) {
        modeAmplitudes(slinky, N_MODES, modesRef.current);
        const energy = chainEnergy(slinky);
        const swell = Math.min(1, energy * 0.12 + (g ? 0.4 : 0));
        audio.setModes(modesRef.current, swell);
      }

      // render
      const renderer = rendererRef.current;
      if (renderer) {
        const aspect = canvas.width / Math.max(1, canvas.height);
        renderer.draw(
          positionsRef.current,
          huesRef.current,
          glowsRef.current,
          N,
          camAngleRef.current,
          1.8,
          aspect,
        );
      } else {
        drawFallback();
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── full teardown ──
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointercancel", pu);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      const lostGl = glRef.current;
      if (lostGl) {
        lostGl.getExtension("WEBGL_lose_context")?.loseContext();
        glRef.current = null;
      }
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, [started, pickIndex]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0a0d17] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />

      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur hover:bg-accent"
      >
        ← dream
      </Link>

      {started && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/35 px-5 py-2.5 text-center text-base text-foreground backdrop-blur">
          drag the rainbow up or down, then let go to flick it ✨
          {fallback && (
            <span className="ml-2 text-violet-300">(simple view)</span>
          )}
        </div>
      )}

      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#0a0d17] to-[#10162a] px-6 text-center">
          <div className="space-y-3">
            <h1 className="text-4xl font-bold text-foreground drop-shadow">
              Singing Slinky
            </h1>
            <p className="mx-auto max-w-md text-lg text-muted-foreground">
              Flick the glowing rainbow spring and watch a wave race down,
              bounce, and hum. It plays itself if you wait.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-full bg-gradient-to-r from-violet-500 via-violet-400 to-violet-400 px-10 py-5 text-2xl font-bold text-black shadow-lg shadow-violet-500/30 active:scale-95"
          >
            ▶ Start
          </button>
        </div>
      )}
    </main>
  );
}
