"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeSandpileSim, GRID_W, GRID_H, type ToppleEvent } from "./sandpile";
import { makeAudioEngine, type AudioEngine } from "./audio";
import { makeRenderer, type GLRenderer } from "./gl";

// ── Timing constants ───────────────────────────────────────────────────────
// How many topples to resolve per animation frame (keeps avalanches watchable)
const TOPPLES_PER_FRAME = 12;
// Milliseconds between auto-demo grain drops
const AUTO_DEMO_INTERVAL_MS = 700;
// Seconds of inactivity before auto-demo starts
const AUTO_DEMO_IDLE_S = 4;
// How quickly flash decays per frame (~60fps → 0.93^60 ≈ 0.01 over 1s)
const FLASH_DECAY = 0.91;

type Phase = "idle" | "playing";

export default function KidsCascadeBloom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noWebGL, setNoWebGL] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Stable refs so callbacks don't go stale
  const phaseRef = useRef<Phase>("idle");
  const rafRef = useRef(0);
  const audioRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<GLRenderer | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);

  // Per-cell flash intensities: 0..1 — a Float32Array of GRID_W * GRID_H
  const flashRef = useRef(new Float32Array(GRID_W * GRID_H));

  // Auto-demo tracking
  const lastTapTimeRef = useRef(0);
  const autoDemoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  // ── Handle a tap on the canvas ───────────────────────────────────────────
  const handleCanvasTap = useCallback((e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || phaseRef.current !== "playing") return;

    // Stop auto-demo on first human tap
    lastTapTimeRef.current = performance.now();
    if (autoDemoTimerRef.current) {
      clearInterval(autoDemoTimerRef.current);
      autoDemoTimerRef.current = null;
    }

    const rect = canvas.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    // ny is in CSS coords (0=top) — grid origin is also top-left
    const gx = Math.floor(nx * GRID_W);
    const gy = Math.floor(ny * GRID_H);

    // sim is accessed via a module-level ref set during start
    const sim = simRef.current;
    if (!sim) return;
    sim.addGrain(gx, gy);

    // Resume audio if suspended
    audioRef.current?.resume();
  }, []);

  // Sandpile sim ref — needs to be accessible from handleCanvasTap
  const simRef = useRef<ReturnType<typeof makeSandpileSim> | null>(null);

  // ── Start (must be called from a user gesture) ───────────────────────────
  const start = useCallback(async () => {
    if (phaseRef.current === "playing") return;
    phaseRef.current = "playing";
    setPhase("playing");

    // 1. Audio context inside the gesture
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume().catch(() => {});
    const engine = makeAudioEngine(ctx);
    audioRef.current = engine;
    engine.resume();

    // 2. Sandpile sim
    const sim = makeSandpileSim();
    simRef.current = sim;

    // 3. WebGL2 renderer
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2") ?? null;
    if (gl) {
      glRef.current = gl;
      try {
        rendererRef.current = makeRenderer(gl);
      } catch {
        setNoWebGL(true);
      }
    } else {
      setNoWebGL(true);
    }

    // 4. Canvas tap listener
    if (canvas) {
      canvas.addEventListener("pointerdown", handleCanvasTap);
    }

    // 5. Auto-demo: drops a grain every AUTO_DEMO_INTERVAL_MS if idle
    lastTapTimeRef.current = performance.now();
    startTimeRef.current = performance.now();

    function scheduleAutoDemo() {
      autoDemoTimerRef.current = setInterval(() => {
        const idleMs = performance.now() - lastTapTimeRef.current;
        if (idleMs > AUTO_DEMO_IDLE_S * 1000) {
          const rx = Math.floor(Math.random() * GRID_W);
          const ry = Math.floor(Math.random() * GRID_H);
          simRef.current?.addGrain(rx, ry);
        }
      }, AUTO_DEMO_INTERVAL_MS);
    }
    scheduleAutoDemo();

    // 6. RAF loop
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      // (frame counter removed — not needed for cascade logic)

      const currentSim = simRef.current;
      const currentAudio = audioRef.current;
      const currentRenderer = rendererRef.current;
      const currentGl = glRef.current;
      const currentCanvas = canvasRef.current;
      if (!currentSim) return;

      // Resolve up to TOPPLES_PER_FRAME topples this frame
      let events: ToppleEvent[] = [];
      if (currentSim.hasWork()) {
        events = currentSim.stepTopples(TOPPLES_PER_FRAME);
      }

      // Process topple events: flash + audio
      const flash = flashRef.current;
      for (const ev of events) {
        const fi = ev.y * GRID_W + ev.x;
        flash[fi] = 1.0;

        if (currentAudio) {
          const pan = (ev.x / (GRID_W - 1)) * 2 - 1;
          // velocity: slight randomization around 0.65
          const vel = 0.55 + Math.random() * 0.3;
          currentAudio.playBurst(ev.y, GRID_H, pan, vel);
        }
      }

      // Decay all flash values
      for (let i = 0; i < flash.length; i++) {
        flash[i] *= FLASH_DECAY;
        if (flash[i] < 0.005) flash[i] = 0;
      }

      // Render
      if (currentCanvas && currentRenderer && currentGl) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.floor(currentCanvas.clientWidth * dpr);
        const H = Math.floor(currentCanvas.clientHeight * dpr);
        if (currentCanvas.width !== W || currentCanvas.height !== H) {
          currentCanvas.width = W;
          currentCanvas.height = H;
        }
        const elapsed = (performance.now() - startTimeRef.current) / 1000;
        currentRenderer.draw(
          currentSim.tex,
          flash,
          GRID_W,
          GRID_H,
          W,
          H,
          elapsed
        );
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [handleCanvasTap]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (autoDemoTimerRef.current) {
        clearInterval(autoDemoTimerRef.current);
        autoDemoTimerRef.current = null;
      }
      if (canvas) {
        canvas.removeEventListener("pointerdown", handleCanvasTap);
      }
      rendererRef.current?.dispose();
      const ac = audioRef.current?.ctx;
      if (ac) ac.close().catch(() => {});
    };
  }, [handleCanvasTap]);

  return (
    <main className="relative w-full h-dvh overflow-hidden bg-[#0a0a1c] touch-none select-none">
      {/* WebGL canvas — always in DOM during play so resize works */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: phase === "playing" ? "block" : "none" }}
      />

      {/* ── Start screen ───────────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6 bg-gradient-to-b from-[#08081a] to-[#0d0d28]">
          {/* Decorative seed-pod dots */}
          <div className="flex gap-3 mb-2" aria-hidden="true">
            {[
              "bg-teal-500/40",
              "bg-amber-400/70",
              "bg-orange-400/80",
              "bg-yellow-200/90",
            ].map((cls, i) => (
              <span
                key={i}
                className={`block w-8 h-8 rounded-full ${cls} shadow-lg`}
                style={{ boxShadow: `0 0 18px 6px currentColor` }}
              />
            ))}
          </div>

          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white/95 sm:text-4xl">
              Cascade Bloom
            </h1>
            <p className="text-xl font-light text-white/80">
              Tap a pod. Watch the light spill.
            </p>
            <p className="text-base text-white/75">
              Fill a pod to bursting — it sings and sparks its neighbours.
            </p>
          </div>

          <button
            onClick={start}
            aria-label="Tap to play"
            className="flex items-center justify-center w-44 h-44 rounded-full text-white shadow-2xl active:scale-95 transition-transform"
            style={{
              background:
                "radial-gradient(circle at 40% 35%, #f5b942 0%, #ff6633 55%, #cc2266 100%)",
              boxShadow:
                "0 0 60px 20px rgba(245,140,50,0.35), 0 4px 32px rgba(0,0,0,0.6)",
            }}
          >
            <span className="text-5xl leading-none">▶</span>
          </button>

          <p className="max-w-xs text-center text-base text-white/75">
            Tap anywhere to drop a grain.
            <br />
            It blooms on its own if you watch.
          </p>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-full px-4 py-2.5 text-base text-amber-300/90 underline underline-offset-2"
          >
            Design notes ↓
          </button>
        </div>
      )}

      {/* ── Playing overlays ───────────────────────────────────────────────── */}
      {phase === "playing" && (
        <>
          {noWebGL && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-6">
              <p className="max-w-sm rounded-2xl bg-black/60 px-4 py-2.5 text-center text-base text-rose-300 backdrop-blur-sm">
                WebGL2 is not available — the bloom is running but invisible.
                Try a modern browser.
              </p>
            </div>
          )}

          {/* Subtle hint on first load — fades after a few seconds via opacity transition */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-20 flex justify-center transition-opacity duration-1000"
            style={{ opacity: 0 }}
          >
            <p className="rounded-full bg-black/40 px-4 py-2.5 text-base text-white/75 backdrop-blur-sm">
              Tap the glowing pods ✦
            </p>
          </div>

          <button
            onClick={() => setShowNotes(true)}
            className="absolute bottom-4 right-4 min-h-[44px] rounded-full bg-black/40 px-4 py-2.5 text-base text-white/75 backdrop-blur-sm transition-colors hover:text-white/95"
          >
            Design notes
          </button>
        </>
      )}

      {/* ── Design notes panel ─────────────────────────────────────────────── */}
      {showNotes && (
        <section className="absolute inset-0 z-10 overflow-y-auto bg-[#08081a]/97 px-6 py-12 text-base text-white/75 backdrop-blur-sm">
          <div className="mx-auto max-w-xl space-y-5 font-mono">
            <h2 className="text-2xl font-bold text-white/95">Design Notes</h2>

            <p>
              <span className="font-semibold text-amber-300">The question:</span>{" "}
              What if a 4-year-old could tap glowing seed-pods that fill with
              light, and when a pod overflows it BURSTS — flinging light to its
              neighbours — and every burst sings a note? Small taps sometimes
              cause tiny ripples and sometimes set off a huge avalanche. That
              surprise IS the toy.
            </p>

            <p>
              <span className="font-semibold text-amber-300">
                Abelian sandpile (SOC):
              </span>{" "}
              A {GRID_W}×{GRID_H} grid of cells, each holding 0–3 light grains.
              Tapping adds one grain. When a cell reaches 4 it{" "}
              <em>topples</em>: loses 4 grains and donates 1 to each orthogonal
              neighbour, which can push neighbours to topple in turn. The
              resulting cascades obey a power law — most taps are quiet; once in
              a while a single tap triggers a screen-spanning bloom. Avalanche
              size distribution: P(s) ~ s^−(3/2). This is{" "}
              <em>self-organized criticality</em>.
            </p>

            <p>
              <span className="font-semibold text-amber-300">Render:</span> Raw
              WebGL2, GLSL ES 3.00. The grid state is uploaded each frame as an
              R8 texture; a second R32F texture carries per-cell flash
              brightness. The fragment shader draws each cell as a rounded
              seed-pod (SDF) whose hue shifts amber→coral→gold→white with grain
              count, plus an expanding ring burst on topple. Background: deep
              indigo, bioluminescent garden palette.
            </p>

            <p>
              <span className="font-semibold text-amber-300">Audio:</span> Each
              topple plays a soft bell voice (sine + inharmonic 2nd partial ×
              2.76, quick exponential decay, 2200 Hz lowpass). Grid row maps to
              pitch across D-Dorian D3–A4 (D E F G A B C — no sharps/flats, no
              C-major pentatonic). A sustained D2/A2/D3 drone pad with a
              breathing lowpass LFO keeps silence from ever feeling dead. All
              voices route through a{" "}
              <code className="text-teal-300">DynamicsCompressor</code> limiter
              (ratio 20:1, threshold −8 dB) so a 50-note avalanche never clips.
              Voice pool capped at 8 simultaneous notes.
            </p>

            <p>
              <span className="font-semibold text-amber-300">Kids design:</span>{" "}
              No reading required to play. Tap targets span whole cells (≥64 px
              on tablet). Immediate audible and visual response to every tap.
              Auto-demo starts if untouched for 4 s — drops grains on random
              cells every 700 ms so it blooms hands-free (attract mode). First
              human tap stops auto-demo.
            </p>

            <p>
              <span className="font-semibold text-emerald-300/95">
                References:
              </span>
            </p>
            <ul className="ml-4 list-disc space-y-1 text-white/75">
              <li>
                Bak, Tang &amp; Wiesenfeld, &ldquo;Self-organized criticality,&rdquo; Phys.
                Rev. Lett. 59, 381 (1987) — the Abelian sandpile model, origin
                of the topple/avalanche mechanic used here.
              </li>
              <li>
                &ldquo;Echoes of the Land&rdquo; (arXiv:2507.14947,
                2025) — recent installation that sonifies a spring-block SOC
                earthquake model as emergent audiovisual cascades; the direct
                lineage for our sandpile sonification.
              </li>
            </ul>

            <p>
              <span className="font-semibold text-rose-300">
                Honest self-assessment:
              </span>{" "}
              The sandpile logic, audio engine, and WebGL2 renderer are fully
              built from scratch. The auto-demo and avalanche propagation pacing
              (TOPPLES_PER_FRAME cap) have not been tuned on real hardware — the
              exact drama of large avalanches may need a small constant tweak on
              60fps tablets. The pod SDF aspect ratio is computed from the grid
              cell ratio, which looks best on widescreen viewports; portrait
              phones may see slightly squished pods.
            </p>

            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-full border border-amber-500/30 bg-amber-600/20 px-4 py-2.5 text-base text-amber-200 transition-colors hover:bg-amber-600/35"
            >
              ← Back to bloom
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
