"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SingularityScene, hasWebGL, type FallState } from "./scene";
import { startAudio, type FallAudio } from "./audio";
import {
  startInput,
  requestTiltPermission,
  type SteerInput,
  type InputMode,
} from "./input";
import { createSafeFlicker } from "@/app/dream/_shared/psych/safeFlicker";

type Phase = "idle" | "running" | "error";

// ── The long-form arc (~3 min). Progress 0..1 threads all subsystems. ──
//   0.00–0.30  distant approach — faint lens, slow spiral, quiet drone
//   0.30–0.60  lensing intensifies — Einstein ring tightens, red-shift begins
//   0.60–0.82  disk roar — Doppler-beamed disk blazes, swallow sub rises
//   0.82–0.92  horizon crossing — shadow fills view, photon-ring BELL
//   0.92–1.00  white-out (smooth luminance ramp) → reset to a new approach
const ARC_SECONDS = 180;

export default function SingularityFallPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SingularityScene | null>(null);
  const audioRef = useRef<FallAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const inputRef = useRef<SteerInput | null>(null);
  const rafRef = useRef<number>(0);
  const startedRef = useRef<number>(0);
  const bellFiredRef = useRef<boolean>(false);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 2, floor: 0.7 }));

  const [phase, setPhase] = useState<Phase>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("auto");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    inputRef.current?.stop();
    inputRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
    sceneRef.current?.dispose();
    sceneRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const loop = useCallback(() => {
    const scene = sceneRef.current;
    const input = inputRef.current;
    if (!scene) return;

    const now = performance.now();
    const elapsed = (now - startedRef.current) / 1000;
    // Cyclic arc: progress ramps 0→1 over ARC_SECONDS, then resets.
    const cyc = (elapsed % ARC_SECONDS) / ARC_SECONDS;
    // ease so the horizon rushes at the end.
    const progress = cyc;

    // Autonomous spiral when there is no live input.
    let sx = input?.x ?? 0;
    let sy = input?.y ?? 0;
    const mode = input?.mode ?? "auto";
    if (mode === "auto") {
      sx = Math.sin(elapsed * 0.35) * 0.5;
      sy = Math.cos(elapsed * 0.27) * 0.4;
    }
    if (mode !== inputMode) setInputMode(mode);

    // Photon-ring bell + white-out live in the last stretch of the arc.
    const flick = flickerRef.current;
    let luma = 1;
    if (cyc > 0.9) {
      // Smooth luminance RAMP toward white (peak ~1.85), safeFlicker-bounded so
      // it can never become a strobe. Ramps up then back down before reset.
      const w = (cyc - 0.9) / 0.1; // 0..1 across the final 10%
      const bell = Math.sin(w * Math.PI); // rise then fall
      luma = 1 + bell * 0.85 * flick.value(elapsed);
    } else {
      bellFiredRef.current = false;
    }
    // Ring the bell once, right at horizon crossing.
    if (cyc > 0.9 && !bellFiredRef.current) {
      bellFiredRef.current = true;
      audioRef.current?.ringBell();
    }

    audioRef.current?.setProgress(progress);

    const state: FallState = { steerX: sx, steerY: sy, progress };
    scene.render(elapsed, state, luma);

    rafRef.current = requestAnimationFrame(loop);
  }, [inputMode]);

  const start = useCallback(async () => {
    if (phase === "running") return;
    if (!hasWebGL()) {
      setErrorMsg("This scene needs WebGL, which your browser or device is not providing.");
      setPhase("error");
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    // Audio must start from this user gesture.
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = startAudio(ctx);
    } catch {
      // audio is best-effort; keep going without it.
    }

    // Ask for tilt permission (iOS) from within the gesture, then start input.
    let allowTilt = false;
    try {
      allowTilt = await requestTiltPermission();
    } catch {
      allowTilt = false;
    }
    inputRef.current = startInput(allowTilt);

    try {
      sceneRef.current = new SingularityScene(container);
    } catch {
      setErrorMsg("Failed to initialize the WebGL scene.");
      setPhase("error");
      teardown();
      return;
    }

    startedRef.current = performance.now();
    bellFiredRef.current = false;
    setPhase("running");
    rafRef.current = requestAnimationFrame(loop);
  }, [phase, loop, teardown]);

  // Keep the renderer sized to the viewport.
  useEffect(() => {
    const onResize = () => {
      const c = containerRef.current;
      if (c && sceneRef.current) sceneRef.current.resize(c.clientWidth, c.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const inputNotice =
    inputMode === "tilt"
      ? "Tilt to steer your infall."
      : inputMode === "keyboard"
        ? "Arrow keys / WASD steer your infall."
        : "No sensor detected — falling on an autonomous spiral. Arrow keys / WASD steer.";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {phase !== "running" && (
        <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <h1 className="font-serif text-2xl sm:text-4xl text-foreground">Singularity Fall</h1>
          <p className="mt-4 max-w-xl text-base text-foreground">
            Fall toward a black hole — light bending around it, your own sound red-shifting —
            until you cross the horizon and the universe swallows itself.
          </p>

          {phase === "error" ? (
            <p className="mt-6 max-w-md text-base text-violet-300">{errorMsg}</p>
          ) : (
            <button
              type="button"
              onClick={start}
              className="mt-8 min-h-[44px] rounded-md border border-violet-400/40 bg-violet-500/20 px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-violet-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              Fall ▸
            </button>
          )}

          <p className="mt-6 max-w-md font-mono text-sm text-muted-foreground">
            Tilt your phone to steer. Desktop: arrow keys / WASD. Sound on.
          </p>
        </div>
      )}

      {phase === "running" && (
        <>
          <p className="pointer-events-none absolute left-4 top-4 z-10 max-w-xs font-mono text-base text-violet-300/95">
            {inputNotice}
          </p>

          <button
            type="button"
            onClick={() => {
              teardown();
              setPhase("idle");
            }}
            className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-black/50 px-4 py-2.5 font-mono text-base text-foreground hover:bg-black/70"
          >
            End ▸
          </button>
        </>
      )}

      {/* Design notes reveal */}
      <div className="absolute bottom-4 left-4 z-10 max-w-md">
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-md border border-border bg-black/50 px-4 py-2.5 font-mono text-base text-foreground hover:bg-black/70"
        >
          {showNotes ? "Hide design notes" : "Design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 rounded-md border border-border bg-black/70 p-4 font-mono text-sm text-foreground backdrop-blur">
            <p className="text-base text-foreground">Singularity Fall</p>
            <p className="mt-2">
              A real-time browser approximation of gravitational lensing around a Schwarzschild
              black hole — screen rays bent toward the shadow by a deflection ∝ 1/impact-parameter,
              an Einstein ring, a Doppler-beamed accretion disk, and a swarm of infalling GPU
              particles that red-shift and vanish at the horizon.
            </p>
            <p className="mt-2 text-muted-foreground">
              Reference: the <span className="text-violet-300">Interstellar</span> &quot;Gargantua&quot;
              DNGR renderer (James, von Tunzelmann, Franklin, Thorne, 2015) and 2026 Three.js/WebGPU
              &quot;Singularity&quot; raymarch pieces. Not a full geodesic integrator.
            </p>
            <p className="mt-2 text-muted-foreground">
              Arc (~3 min): distant approach → lensing intensifies → disk roar → horizon crossing
              (photon-ring bell + smooth white-out) → reset. The white-out is a slow luminance ramp
              (≤2 Hz, floored), never a strobe.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
