"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { makeSim, GRID_W, GRID_H, PALETTE, type SandSim } from "./sand";
import { makeAudioEngine, STRING_COUNT, type AudioEngine } from "./audio";
import { makeRenderer, type GLRenderer } from "./gl";

// Where the harp strings sit in the grid (top=0). Spread across the lower 2/3
// so there is room for dunes to grow into them. low(string 0)=highest row.
const STRING_ROWS: number[] = Array.from({ length: STRING_COUNT }, (_, i) =>
  Math.round(GRID_H * (0.34 + (i / (STRING_COUNT - 1)) * 0.56))
);

const PLUCK_REFRACTORY_MS = 80;
const GRAVITY_SMOOTH = 0.08;
const TILT_TIMEOUT_MS = 1600;

type Phase = "idle" | "playing";

export default function KidsSandChoir() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noTilt, setNoTilt] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const rafRef = useRef(0);
  const simRef = useRef<SandSim | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rendererRef = useRef<GLRenderer | null>(null);
  const phaseRef = useRef<Phase>("idle");

  // smoothed + raw gravity vectors (y positive = down)
  const gravXRef = useRef(0);
  const gravYRef = useRef(1);
  const rawGXRef = useRef(0);
  const rawGYRef = useRef(1);

  const hasTiltRef = useRef(false);
  const tiltTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownRef = useRef(false);

  const lastPluckRef = useRef<number[]>(new Array(STRING_COUNT).fill(0));
  const flashRef = useRef<number[]>(new Array(STRING_COUNT).fill(0));
  const frameRef = useRef(0);

  // ── Device tilt → raw gravity vector ──────────────────────────────────────
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma == null && e.beta == null) return;
    hasTiltRef.current = true;
    if (tiltTimeoutRef.current) {
      clearTimeout(tiltTimeoutRef.current);
      tiltTimeoutRef.current = null;
    }
    setNoTilt(false);
    const gamma = (e.gamma ?? 0) / 90; // left/right tilt → x
    const beta = (e.beta ?? 0) / 90; // front/back tilt → y
    rawGXRef.current = Math.max(-1, Math.min(1, gamma * 1.4));
    // keep a downward bias so sand always tends to fall even when flat
    rawGYRef.current = Math.max(-1, Math.min(1, beta * 1.1 + 0.45));
  }, []);

  // ── Pointer-drag fallback: drag tilts the gravity vector ──────────────────
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!pointerDownRef.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    rawGXRef.current = Math.max(-1, Math.min(1, (nx - 0.5) * 2.2));
    rawGYRef.current = Math.max(-1, Math.min(1, (ny - 0.5) * 2.2));
  }, []);

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      pointerDownRef.current = true;
      handlePointerMove(e);
    },
    [handlePointerMove]
  );

  const handlePointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);

  // ── Start (single tap: AudioContext + tilt permission must be in-gesture) ──
  const start = useCallback(async () => {
    if (phaseRef.current === "playing") return;
    phaseRef.current = "playing";
    setPhase("playing");

    // 1. Audio (created inside the gesture for iOS).
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume().catch(() => {});
    const engine = makeAudioEngine(ctx);
    audioRef.current = engine;
    engine.resume();

    // 2. Sim.
    const sim = makeSim(STRING_ROWS);
    simRef.current = sim;

    // 3. Device orientation permission (iOS 13+ requires in-gesture call).
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<PermissionState>;
    };
    if (typeof DeviceOrientationEvent !== "undefined") {
      if (typeof DOE.requestPermission === "function") {
        try {
          const perm = await DOE.requestPermission();
          if (perm === "granted") {
            window.addEventListener("deviceorientation", handleOrientation);
          } else {
            setNoTilt(true);
          }
        } catch {
          setNoTilt(true);
        }
      } else {
        window.addEventListener("deviceorientation", handleOrientation);
      }
    } else {
      setNoTilt(true);
    }

    // If no tilt events arrive shortly, surface the drag/auto-sway fallback.
    tiltTimeoutRef.current = setTimeout(() => {
      if (!hasTiltRef.current) {
        setNoTilt(true);
        window.removeEventListener("deviceorientation", handleOrientation);
      }
    }, TILT_TIMEOUT_MS);

    // 4. Pointer fallback listeners.
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("pointerdown", handlePointerDown);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerup", handlePointerUp);
      canvas.addEventListener("pointerleave", handlePointerUp);
      canvas.addEventListener("pointercancel", handlePointerUp);
    }

    // 5. WebGL2 (audio keeps running even if this fails).
    let renderer: GLRenderer | null = null;
    const gl = canvas?.getContext("webgl2") ?? null;
    if (gl) {
      try {
        renderer = makeRenderer(gl);
        rendererRef.current = renderer;
      } catch {
        setNoWebGL(true);
      }
    } else {
      setNoWebGL(true);
    }

    // 6. Loop.
    const stringY = STRING_ROWS.map((r) => r / GRID_H);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const frame = frameRef.current++;

      // Auto-sway so the piece plays itself hands-free (and adds life to tilt).
      if (!hasTiltRef.current && !pointerDownRef.current) {
        rawGXRef.current = Math.sin(frame * 0.0075) * 0.7;
        rawGYRef.current = 0.7 + Math.cos(frame * 0.011) * 0.25;
      }

      // Smooth the gravity vector.
      gravXRef.current += (rawGXRef.current - gravXRef.current) * GRAVITY_SMOOTH;
      gravYRef.current += (rawGYRef.current - gravYRef.current) * GRAVITY_SMOOTH;

      // Spout: drip warm grains from the top, cycling palette colors.
      const spoutCol =
        (GRID_W >> 1) + Math.round(Math.sin(frame * 0.017) * (GRID_W * 0.3));
      sim.pour(spoutCol, (frame >> 2) % PALETTE.length, 3);

      // CA step → settle events on strings.
      const events = sim.step(gravXRef.current, gravYRef.current);

      const now = performance.now();
      const eng = audioRef.current;
      for (const ev of events) {
        const last = lastPluckRef.current[ev.row];
        if (now - last < PLUCK_REFRACTORY_MS) continue;
        lastPluckRef.current[ev.row] = now;
        const pan = (ev.x / GRID_W) * 2 - 1; // stereo by x
        if (eng) eng.pluck(ev.row, pan, 0.55);
        flashRef.current[ev.row] = 1;
      }

      // Decay string flashes.
      for (let i = 0; i < STRING_COUNT; i++) {
        flashRef.current[i] *= 0.86;
      }

      // Render.
      const c2 = canvasRef.current;
      const rnd = rendererRef.current;
      if (c2 && rnd && gl) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.floor(c2.clientWidth * dpr);
        const H = Math.floor(c2.clientHeight * dpr);
        if (c2.width !== W || c2.height !== H) {
          c2.width = W;
          c2.height = H;
        }
        rnd.draw(sim.tex, GRID_W, GRID_H, stringY, flashRef.current, W, H);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [handleOrientation, handlePointerDown, handlePointerMove, handlePointerUp]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (tiltTimeoutRef.current) clearTimeout(tiltTimeoutRef.current);
      window.removeEventListener("deviceorientation", handleOrientation);
      if (canvas) {
        canvas.removeEventListener("pointerdown", handlePointerDown);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerup", handlePointerUp);
        canvas.removeEventListener("pointerleave", handlePointerUp);
        canvas.removeEventListener("pointercancel", handlePointerUp);
      }
      rendererRef.current?.dispose();
      const ac = audioRef.current?.ctx;
      if (ac) ac.close().catch(() => {});
    };
  }, [handleOrientation, handlePointerDown, handlePointerMove, handlePointerUp]);

  return (
    <main className="relative w-full h-dvh overflow-hidden bg-[#0a0814] touch-none select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: phase === "playing" ? "block" : "none" }}
      />

      {/* Start screen — no reading required, big tap target. */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-6">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white/95 sm:text-4xl">
              Sand Choir
            </h1>
            <p className="text-xl font-light text-white/75">
              Pour glowing sand. Tilt to make dunes.
            </p>
            <p className="text-base text-white/75">
              Every grain that lands on a string sings 🎵
            </p>
          </div>

          <button
            onClick={start}
            aria-label="Start Sand Choir"
            className="flex h-40 w-40 items-center justify-center rounded-full border-4 border-white/20 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-2xl shadow-orange-900/50 transition-transform active:scale-95"
          >
            <span className="text-5xl">▶</span>
          </button>

          <p className="max-w-xs text-center text-base text-white/75">
            Tilt your tablet to pour the sand.
            <br />
            On a computer, drag with the mouse.
          </p>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-full px-4 py-2.5 text-base text-amber-300/90 underline underline-offset-2 transition-opacity hover:opacity-100"
          >
            Read the design notes ↓
          </button>
        </div>
      )}

      {/* Playing overlays */}
      {phase === "playing" && (
        <>
          {noWebGL && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-6">
              <p className="max-w-sm rounded-2xl bg-black/55 px-4 py-2.5 text-center text-base text-rose-300 backdrop-blur-sm">
                WebGL2 is not available here, but the sand choir is still singing.
              </p>
            </div>
          )}
          {noTilt && !noWebGL && (
            <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-6">
              <p className="rounded-full bg-black/50 px-4 py-2.5 text-center text-base text-rose-300 backdrop-blur-sm">
                Drag to tilt — it also sways on its own ✦
              </p>
            </div>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="absolute bottom-4 right-4 min-h-[44px] rounded-full bg-black/40 px-4 py-2.5 text-base text-white/75 backdrop-blur-sm transition-colors hover:text-white/95"
          >
            Design notes
          </button>
        </>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <section className="absolute inset-0 z-10 overflow-y-auto bg-[#0a0814]/97 px-6 py-12 font-mono text-base text-white/75 backdrop-blur-sm">
          <div className="mx-auto max-w-xl space-y-4">
            <h2 className="text-2xl font-bold text-white/95">Design Notes</h2>
            <p>
              <span className="font-semibold text-amber-300">Concept:</span> A
              4-year-old pours streams of glowing colored sand that pile into
              dunes by tilting the tablet. Seven horizontal harp strings cross
              the field; every grain that comes to rest on a string plucks a
              note, so the shape of the dune you build is the song.
            </p>
            <p>
              <span className="font-semibold text-amber-300">
                Falling-sand cellular automaton:
              </span>{" "}
              A {GRID_W}×{GRID_H} grid where each cell is empty or one colored
              grain. Each frame, scanning against gravity, every grain tries to
              move one cell in the gravity direction; if blocked it tries the two
              diagonal-down cells in randomized order — that is what makes sand
              slump into natural slopes. This is the lab&rsquo;s first
              powder-game / Sandspiel piece.
            </p>
            <p>
              <span className="font-semibold text-amber-300">Tilt gravity:</span>{" "}
              <code>deviceorientation</code> β/γ become a 2D gravity vector,
              quantized to a dominant fall direction plus a diagonal bias, so
              tipping the world flows the dunes left / right / down. No sensor →
              pointer-drag fallback plus a gentle auto-sway so it plays itself
              hands-free.
            </p>
            <p>
              <span className="font-semibold text-amber-300">
                D-Dorian sonification:
              </span>{" "}
              The strings are tuned D E F G A B C (D-Dorian), low→high by row. A
              landing grain plucks a soft Karplus-Strong string, pitched by row,
              stereo-panned by x, with an 80ms per-string refractory so an
              avalanche never machine-guns. A soft D+A pad is always on, and the
              whole mix runs through a brick-wall <code>DynamicsCompressor</code>{" "}
              so it can never get loud or harsh.
            </p>
            <p>
              <span className="font-semibold text-amber-300">Render:</span> The
              CA grid is uploaded to an RGBA8 texture each frame and drawn with a
              hand-written GLSL ES 3.00 fragment shader — warm grain colors over a
              deep-indigo field, with matte alpha-over glowing strings (no
              additive bloom, per the lab&rsquo;s anti-glow house style).
            </p>
            <p>
              <span className="font-semibold text-emerald-300/95">
                References:
              </span>{" "}
              Max Bittker, <em>Sandspiel</em>; the Noita / &ldquo;powder
              game&rdquo; falling-sand cellular-automaton tradition; Karplus &amp;
              Strong, &ldquo;Digital Synthesis of Plucked-String and Drum
              Timbres&rdquo; (Computer Music Journal, 1983).
            </p>
            <p>
              <span className="font-semibold text-rose-300">
                Unverified surface:
              </span>{" "}
              Built in a sandbox with no real device tilt and no GPU — the
              deviceorientation mapping, 60fps CA budget, and shader output have
              not been verified on hardware.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-full border border-amber-500/30 bg-amber-600/25 px-4 py-2.5 text-base text-amber-200 transition-colors hover:bg-amber-600/40"
            >
              ← Back
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
