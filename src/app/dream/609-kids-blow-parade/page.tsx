"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 609 — Kids Blow Parade
//
// Brief: a 4-year-old BLOWS into the mic and a parade of silly balloon-creatures
// inflates bigger and bigger, then raspberry-deflates and zooms around when they
// stop. Breath-energy detection (NOT voice) drives inflation; whoopee-cushion
// raspberry synthesis on release. WebGPU (WGSL instanced quads) primary, with a
// full Canvas2D fallback. Kid-safe audio chain. No reading required.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { makeBlowDetector } from "./detect";
import { buildAudioEngine, type AudioEngine } from "./audio";
import { makeParade, step, type ParadeState } from "./scene";
import { drawScene } from "./render2d";
import { initGpuRenderer, type GpuRenderer } from "./rendergpu";

type Backend = "webgpu" | "canvas2d" | "pending";

export default function BlowParadePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [backend, setBackend] = useState<Backend>("pending");
  const [micState, setMicState] = useState<"idle" | "on" | "denied">("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [muted, setMuted] = useState(false);

  // Live blow gauge (0..1) for the wind meter.
  const [gauge, setGauge] = useState(0);

  // ── Refs for the animation loop (avoid re-renders) ───────────────────────
  const engineRef = useRef<AudioEngine | null>(null);
  const gpuRef = useRef<GpuRenderer | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const detectorRef = useRef(makeBlowDetector());
  const paradeRef = useRef<ParadeState>(makeParade(6));
  const rafRef = useRef<number>(0);
  const freqBufRef = useRef<Float32Array | null>(null);

  const holdRef = useRef(false); // button / spacebar manual blow
  const lastTsRef = useRef(0);
  const lastInteractRef = useRef(0); // for idle auto-demo
  const ghostRef = useRef({ active: false, t: 0, phase: 0 });
  const blowingPrevRef = useRef(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // ── Resize handling ──────────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (gpuRef.current) {
      gpuRef.current.resize(rect.width, rect.height, dpr);
    } else {
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  // ── The Start gesture: unlock audio, init renderer, ask for mic ──────────
  const onStart = useCallback(async () => {
    if (started) return;
    setStarted(true);
    lastInteractRef.current = performance.now();

    // Build + resume audio INSIDE the gesture (iOS requirement).
    const engine = buildAudioEngine();
    engineRef.current = engine;
    await engine.resume();
    engine.pop();

    // Renderer: try WebGPU first, else Canvas2D.
    const canvas = canvasRef.current;
    if (canvas) {
      const gpu = await initGpuRenderer(canvas);
      if (gpu) {
        gpuRef.current = gpu;
        setBackend("webgpu");
      } else {
        const c2d = canvas.getContext("2d");
        ctx2dRef.current = c2d;
        setBackend("canvas2d");
      }
      handleResize();
    }

    // Try mic (non-blocking — parade works without it).
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const analyser = engine.attachMic(stream);
      freqBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.frequencyBinCount * 4)
      );
      setMicState("on");
    } catch {
      setMicState("denied");
    }
  }, [started, handleResize]);

  // ── Manual blow controls (button + spacebar) ─────────────────────────────
  const beginHold = useCallback(() => {
    holdRef.current = true;
    lastInteractRef.current = performance.now();
  }, []);
  const endHold = useCallback(() => {
    holdRef.current = false;
    lastInteractRef.current = performance.now();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        if (!started) {
          void onStart();
        } else {
          beginHold();
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        endHold();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started, onStart, beginHold, endHold]);

  // ── Main animation + audio loop ──────────────────────────────────────────
  useEffect(() => {
    if (!started) return;

    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const last = lastTsRef.current || ts;
      let dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switch)

      const engine = engineRef.current;
      const canvas = canvasRef.current;
      if (!engine || !canvas) return;

      // ── Determine blow strength this frame ──────────────────────────────
      let strength = 0;
      let blowing = false;

      // 1. Mic (breath energy).
      const analyser = engine.analyser;
      const buf = freqBufRef.current;
      if (analyser && buf) {
        analyser.getFloatFrequencyData(
          buf as unknown as Float32Array<ArrayBuffer>
        );
        const f = detectorRef.current.update(
          buf,
          engine.ctx.sampleRate,
          analyser.fftSize,
          ts
        );
        if (f.blowing) {
          strength = Math.max(strength, f.strength);
          blowing = true;
        }
      }

      // 2. Manual hold (button / spacebar) — ramps in like a real blow.
      if (holdRef.current) {
        blowing = true;
        strength = Math.max(strength, 0.85);
      }

      // 3. Idle auto-demo: if no interaction for 2.5s, a ghost breath drives
      //    a balloon inflating + raspberry-releasing on a loop.
      const idleFor = ts - lastInteractRef.current;
      const ghost = ghostRef.current;
      if (idleFor > 2500 && !blowing) {
        ghost.active = true;
        ghost.t += dt;
        // 2.2s blow up, then release, then 1.3s pause, repeat.
        const cycle = ghost.t % 3.5;
        if (cycle < 2.2) {
          blowing = true;
          strength = Math.max(strength, 0.45 + 0.4 * Math.min(1, cycle / 1.5));
        }
      } else {
        ghost.active = false;
      }

      setGauge(strength);

      // ── Audio: inflate squeak / raspberry on release ────────────────────
      if (blowing && strength > 0.02) {
        engine.inflate(strength);
      } else if (blowingPrevRef.current) {
        engine.stopInflate();
      }
      blowingPrevRef.current = blowing;

      // ── Physics ─────────────────────────────────────────────────────────
      const rect = canvas.getBoundingClientRect();
      const aspect = rect.width / Math.max(1, rect.height);
      const res = step(paradeRef.current, dt, blowing, strength, aspect);
      if (res.released) {
        engine.raspberry(res.released.size);
        engine.stopInflate();
      }

      // ── Render ──────────────────────────────────────────────────────────
      if (gpuRef.current) {
        gpuRef.current.draw(
          paradeRef.current,
          rect.width,
          rect.height,
          strength
        );
      } else if (ctx2dRef.current) {
        drawScene(
          ctx2dRef.current,
          paradeRef.current,
          canvas.width,
          canvas.height,
          strength
        );
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      gpuRef.current?.dispose();
      engineRef.current?.dispose();
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      engineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0c1024] text-foreground select-none">
      {/* Canvas fills the screen */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* Title — labeling only, not gating */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex flex-col items-center pt-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground drop-shadow">
          Blow Parade
        </h1>
        <p className="mt-0.5 text-base text-muted-foreground">
          Blow to puff up the balloons!
        </p>
      </div>

      {/* Wind / blow gauge — big, colorful, no reading needed */}
      {started && (
        <div className="pointer-events-none absolute left-1/2 top-20 -translate-x-1/2">
          <div className="flex items-center gap-2">
            <span className="text-3xl" aria-hidden>
              {gauge > 0.05 ? "💨" : "🎈"}
            </span>
            <div className="h-4 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-75"
                style={{
                  width: `${Math.round(gauge * 100)}%`,
                  background:
                    "linear-gradient(90deg,#34d399,#fbbf24,#fb7185)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Start overlay (the user gesture that unlocks audio) */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0c1024]/80 backdrop-blur-sm">
          <div className="text-7xl" aria-hidden>
            🎈
          </div>
          <button
            onClick={onStart}
            className="min-h-[44px] rounded-3xl bg-gradient-to-br from-violet-500 to-violet-400 px-12 py-6 text-3xl font-bold text-foreground shadow-xl active:scale-95"
            style={{ minWidth: 200, minHeight: 96 }}
          >
            ▶ Play!
          </button>
          <p className="text-base text-muted-foreground">
            Tap to start, then blow into the mic
          </p>
        </div>
      )}

      {/* Big HOLD-TO-BLOW button — always available fallback (≥64px) */}
      {started && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              beginHold();
            }}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            className="flex items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-violet-500 text-foreground shadow-2xl active:scale-95"
            style={{ width: 128, height: 128 }}
            aria-label="Hold to blow"
          >
            <span className="text-6xl" aria-hidden>
              💨
            </span>
          </button>
        </div>
      )}

      {/* Mute toggle (icon only) */}
      {started && (
        <button
          onClick={toggleMute}
          className="absolute right-4 top-4 z-10 flex items-center justify-center rounded-full bg-muted active:scale-95"
          style={{ width: 64, height: 64 }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          <span className="text-3xl" aria-hidden>
            {muted ? "🔇" : "🔊"}
          </span>
        </button>
      )}

      {/* Mic-denied notice (visible rose) — parade still fully works */}
      {micState === "denied" && started && (
        <div className="absolute left-1/2 top-36 z-10 -translate-x-1/2 rounded-2xl bg-black/40 px-4 py-2.5 text-center">
          <p className="text-base text-violet-300">
            No mic — tap and hold 💨 or press Space to blow!
          </p>
        </div>
      )}

      {/* Backend badge (tiny, monospace accent) */}
      {started && backend !== "pending" && (
        <div className="absolute left-3 top-3 z-10 rounded bg-black/30 px-2 py-1 font-mono text-xs text-muted-foreground">
          {backend === "webgpu" ? "WebGPU" : "Canvas2D"}
        </div>
      )}

      {/* Design notes link (corner, nice-to-have) */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-3 right-3 z-10 rounded px-2 py-1 text-xs text-muted-foreground underline underline-offset-2"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-x-4 bottom-16 z-30 mx-auto max-w-md rounded-2xl bg-[#0c1024]/95 p-4 text-sm text-foreground shadow-2xl ring-1 ring-border">
          <h2 className="mb-2 text-xl font-semibold text-foreground">
            Design notes
          </h2>
          <p className="mb-2">
            Blow into the mic — a parade of googly balloon-creatures puffs up
            bigger and bigger. Stop, and they rip a whoopee-cushion raspberry
            and zoom around. The detector listens for{" "}
            <em>breath</em> (broadband, noise-like) and ignores yells and
            singing (tonal), so shouting won&apos;t inflate them — only blowing.
          </p>
          <p className="mb-2 text-muted-foreground">
            No mic? Hold the big 💨 button or press Space. After ~2.5s of quiet
            it demos itself. Refs: party-blower / whoopee-cushion foley, balloon
            inflate→release physics, Toca Boca toddler interaction patterns.
          </p>
          <button
            onClick={() => setShowNotes(false)}
            className="min-h-[44px] rounded-xl bg-muted px-4 py-2.5 text-base text-foreground active:scale-95"
          >
            Got it
          </button>
        </div>
      )}
    </main>
  );
}
