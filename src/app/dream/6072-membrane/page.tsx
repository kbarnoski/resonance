"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MembraneGPU } from "./gpu";
import { FallbackRenderer } from "./fallback";
import { MembraneAudio, BAND_COUNT } from "./audio";
import {
  makeOrbits,
  updateMetaballs,
  perspective,
  lookAt,
  METABALL_COUNT,
} from "./mat";
import { makeRng, SEED } from "./prng";

type Mode = "init" | "webgpu" | "canvas";
type MicState = "off" | "on" | "denied";

const FOVY = (55 * Math.PI) / 180;

export default function MembranePage() {
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const gpuRef = useRef<MembraneGPU | null>(null);
  const fbRef = useRef<FallbackRenderer | null>(null);
  const fbCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const audioRef = useRef<MembraneAudio | null>(null);

  const orbitsRef = useRef(makeOrbits());
  const metaballsRef = useRef(new Float32Array(METABALL_COUNT * 4));
  const bandsRef = useRef(new Float32Array(BAND_COUNT));
  const synthRef = useRef<{ speed: number; phase: number }[]>([]);
  const animTimeRef = useRef(0);
  const reducedRef = useRef(false);

  const [mode, setMode] = useState<Mode>("init");
  const [audioOn, setAudioOn] = useState(false);
  const [micState, setMicState] = useState<MicState>("off");
  const [showNotes, setShowNotes] = useState(false);

  // Seeded per-band LFOs for the "alive on load" silent drift.
  if (synthRef.current.length === 0) {
    const rng = makeRng(SEED ^ 0x2f10);
    for (let b = 0; b < BAND_COUNT; b++) {
      synthRef.current.push({
        speed: 0.15 + rng() * 0.6,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  // ── Renderer setup + animation loop ──────────────────────────────────────
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let cancelled = false;
    let last = performance.now();

    const sizeCanvas = (c: HTMLCanvasElement | null) => {
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(c.offsetWidth * dpr));
      const h = Math.max(1, Math.round(c.offsetHeight * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    };

    const resize = () => {
      sizeCanvas(gpuCanvasRef.current);
      sizeCanvas(fbCanvasRef.current);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (gpuCanvasRef.current) ro.observe(gpuCanvasRef.current);
    if (fbCanvasRef.current) ro.observe(fbCanvasRef.current);

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      animTimeRef.current += dt * (reducedRef.current ? 0.35 : 1);
      const t = animTimeRef.current;

      // Bands: real audio if playing, else the seeded silent drift.
      const bands = bandsRef.current;
      const engine = audioRef.current;
      if (engine && engine.active) {
        bands.set(engine.update());
      } else {
        for (let b = 0; b < BAND_COUNT; b++) {
          const s = synthRef.current[b];
          bands[b] = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        }
      }

      let low = 0;
      let mid = 0;
      let high = 0;
      for (let b = 0; b < BAND_COUNT; b++) {
        if (b < 3) low += bands[b];
        else if (b < 5) mid += bands[b];
        else high += bands[b];
      }
      low /= 3;
      mid /= 2;
      high /= 3;
      const overall = (low + mid + high) / 3;

      updateMetaballs(metaballsRef.current, orbitsRef.current, t, bands);
      // surface "breathes" — lower iso on bass swells the whole skin
      const iso = Math.max(0.6, 1.0 - low * 0.3);
      const paletteRot = t * 0.02 + overall * 0.05;

      const yaw = t * 0.06;
      const pitch = 0.25 * Math.sin(t * 0.028);

      const gpu = gpuRef.current;
      const fb = fbRef.current;

      if (gpu) {
        const c = gpuCanvasRef.current;
        if (c) {
          const w = c.width;
          const h = c.height;
          const dist = 3.4;
          const eye: [number, number, number] = [
            Math.sin(yaw) * Math.cos(pitch) * dist,
            Math.sin(pitch) * dist,
            Math.cos(yaw) * Math.cos(pitch) * dist,
          ];
          const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
          const proj = perspective(FOVY, w / h, 0.1, 100);
          const focal = (0.5 * h) / Math.tan(FOVY / 2);
          gpu.frame({
            view,
            proj,
            metaballs: metaballsRef.current,
            time: t,
            focal,
            iso,
            dt,
            width: w,
            height: h,
            paletteRot,
            audioLow: low,
            audioMid: mid,
            audioHigh: high,
            audioOverall: overall,
          });
        }
      } else if (fb) {
        const c = fbCanvasRef.current;
        if (c) {
          if (!fbCtxRef.current) fbCtxRef.current = c.getContext("2d");
          const ctx = fbCtxRef.current;
          if (ctx) {
            fb.frame(
              ctx,
              metaballsRef.current,
              t,
              yaw,
              pitch,
              paletteRot,
              overall,
              high,
              c.width,
              c.height,
            );
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    // Choose renderer, then start the loop (alive before any click).
    (async () => {
      const gpuCanvas = gpuCanvasRef.current;
      let ok = false;
      if (gpuCanvas) {
        try {
          gpuRef.current = await MembraneGPU.create(gpuCanvas);
          ok = true;
          if (!cancelled) setMode("webgpu");
        } catch {
          gpuRef.current = null;
        }
      }
      if (!ok) {
        fbRef.current = new FallbackRenderer();
        if (!cancelled) setMode("canvas");
      }
      resize();
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      gpuRef.current?.destroy();
      gpuRef.current = null;
      fbRef.current = null;
      fbCtxRef.current = null;
    };
  }, []);

  // ── Audio teardown on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const grow = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new MembraneAudio();
    await audioRef.current.start();
    setAudioOn(true);
  }, []);

  const toggleMic = useCallback(async () => {
    const engine = audioRef.current;
    if (!engine || !engine.active) return;
    const ok = await engine.enableMic();
    setMicState(ok ? "on" : "denied");
  }, []);

  const hush = useCallback(() => {
    audioRef.current?.stop();
    audioRef.current = null;
    setAudioOn(false);
    setMicState("off");
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden bg-background"
      style={{ height: "calc(100vh - 3rem)" }}
    >
      {/* Two stacked canvases — only the active renderer is drawn to. */}
      <canvas
        ref={gpuCanvasRef}
        className="absolute inset-0 h-full w-full"
        style={{
          opacity: mode === "webgpu" ? 1 : 0,
          transition: "opacity 600ms ease",
        }}
      />
      <canvas
        ref={fbCanvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: mode === "canvas" ? 1 : 0 }}
      />

      {/* Title + primary action — fades once the membrane is singing. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center px-6 pt-[14vh] text-center transition-opacity duration-700"
        style={{ opacity: audioOn ? 0 : 1 }}
      >
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 6072
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Membrane
        </h1>
        <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
          A luminous living skin of thousands of gaussian splats, blooming and
          budding across a breathing sound-sculpted surface.
        </p>
        <div className="pointer-events-auto mt-8">
          <button
            onClick={grow}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Grow the membrane
          </button>
        </div>
        {mode === "canvas" && (
          <p className="mt-6 max-w-xs rounded-md border border-border bg-background/60 px-4 py-2 text-sm leading-relaxed text-muted-foreground">
            WebGPU unavailable — showing a reduced Canvas fallback.
          </p>
        )}
      </div>

      {/* Live controls, once the audio is running. */}
      {audioOn && (
        <div className="absolute right-4 top-4 flex flex-col items-end gap-2 select-none">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {mode === "webgpu" ? "gaussian skin · live" : "canvas skin · live"}
          </span>
          <div className="flex gap-2">
            <button
              onClick={toggleMic}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {micState === "on"
                ? "Mic on"
                : micState === "denied"
                  ? "Mic denied"
                  : "Use mic"}
            </button>
            <button
              onClick={hush}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Hush
            </button>
          </div>
        </div>
      )}

      {/* Corner links. */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4">
        <Link
          href="/dream"
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream
        </Link>
      </div>
      <button
        onClick={() => setShowNotes(true)}
        className="absolute bottom-4 right-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* Design-notes modal. */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Membrane — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The one question: can a crowd of gaussian splats stop being a
                frozen sculpture and become a single organism — a skin that
                blooms, buds and melts with the harmony?
              </p>
              <p>
                Six to eight metaballs drift on seeded orbits whose radius and
                speed are driven by the music — low bands swell big slow lobes,
                high bands send fast small buds that make the surface tear.
                Their blobby field defines an implicit iso-surface. Every frame
                a WebGPU compute pass relaxes each gaussian onto that surface by
                stepping along the analytic field gradient, then flattens its
                covariance tangent to the skin (a thin disc oriented by the
                surface normal — the &ldquo;true 3DGS surface&rdquo; look) and
                tints it from curvature and a slowly rotating iridescent palette.
              </p>
              <p>
                The 3D covariance is projected to a 2D screen-space gaussian
                (EWA-style Jacobian) and rasterized as camera-facing quads,
                composited <em>additively</em> — a deliberate simplification
                that glows and needs no per-frame depth sort. Without a WebGPU
                adapter, a Canvas2D pass relaxes ~900 soft sprites onto the same
                metaball field so the felt idea still lands.
              </p>
              <p>
                References: Kerbl, Kopanas, Leimkühler &amp; Drettakis,
                &ldquo;3D Gaussian Splatting for Real-Time Radiance Field
                Rendering&rdquo; (SIGGRAPH 2023); the 2026 WebGPU compute-
                splatting moment (SuperSplat streamed LOD; GSCache radiance
                caching, arXiv Jul 2026); Refik Anadol&rsquo;s latent clouds.
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
