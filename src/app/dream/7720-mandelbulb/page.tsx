"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/visionary/safeFlicker";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { MandelbulbScene, hasWebGL2 } from "./scene";
import { MandelbulbAudio } from "./audio";

// ─────────────────────────────────────────────────────────────────────────────
// 7720-mandelbulb
//   the lab's first raymarched, distance-estimated 3D fractal · pole: visionary bloom
//
// Fall INTO a living, jeweled power-8 Mandelbulb (White & Nylander, 2009) grown
// by your voice: mic loudness pushes the fractal exponent 7 -> 9, opens the
// color, and drives the camera in. No mic? A seeded virtual performer drives the
// whole bloom→settle arc so the page self-demos with zero input.
//
// Determinism: the performer's move-bursts come from mulberry32(0x7720); the
// energy→visual mapping is a pure function of the rAF clock. No Math.random /
// Date.now / new Date anywhere — a headless render of time T is byte-identical.
// ─────────────────────────────────────────────────────────────────────────────

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

// The seeded virtual performer: a deterministic move-burst → settle loop.
// Each event is a percussive "gesture"; bass events bloom the geometry, treble
// events sparkle. Precomputed once so every run drives the identical arc.
const PERFORMER = (() => {
  const rnd = mulberry32(0x7720);
  const events: { t: number; amp: number; bass: boolean }[] = [];
  let t = 1.2;
  for (let i = 0; i < 48; i++) {
    t += 0.5 + rnd() * 2.0;
    events.push({ t, amp: 0.35 + rnd() * 0.6, bass: rnd() < 0.45 });
  }
  return { events, period: t + 4 };
})();

interface EnergyFrame {
  energy: number;
  bass: number;
  treble: number;
}

function performerEnergy(elapsed: number): EnergyFrame {
  const { events, period } = PERFORMER;
  const te = elapsed % period;
  let bass = 0;
  let treble = 0;
  for (const e of events) {
    // sum this cycle + the wrapped tail of the previous cycle → continuous
    for (const off of [0, period]) {
      const dt = te + off - e.t;
      if (dt >= 0 && dt < 8) {
        const env = e.amp * Math.exp(-dt * (e.bass ? 2.4 : 1.5));
        if (e.bass) bass += env;
        else treble += env;
      }
    }
  }
  // slow baseline breathing so even the quiet stretches keep drifting
  const base =
    0.12 + 0.06 * Math.sin(elapsed * 0.22) + 0.04 * Math.sin(elapsed * 0.07);
  return {
    energy: Math.min(1, base + bass * 0.85 + treble * 0.55),
    bass: Math.min(1, base * 0.5 + bass),
    treble: Math.min(1, base * 0.4 + treble * 0.9),
  };
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [entered, setEntered] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micLive, setMicLive] = useState(false);

  const sceneRef = useRef<MandelbulbScene | null>(null);
  const audioRef = useRef<MandelbulbAudio | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, floor: 0.72 }));
  const startTimeRef = useRef(0);
  const smooth = useRef<EnergyFrame>({ energy: 0, bass: 0, treble: 0 });
  const reducedRef = useRef(false);

  const mic = useMicAnalyser({ smoothing: 0.8, gain: 1.6 });
  const getFrameRef = useRef(mic.getFrame);
  useEffect(() => {
    getFrameRef.current = mic.getFrame;
  }, [mic.getFrame]);
  useEffect(() => {
    setMicLive(mic.running);
  }, [mic.running]);

  // Keep the pulse (safe-flicker) engine in sync with the toggle.
  useEffect(() => {
    if (pulse) flickerRef.current.enable();
    else flickerRef.current.disable();
  }, [pulse]);

  useEffect(() => {
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // ── Mount: build the GL scene and start the visual self-demo immediately ───
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    const mount = mountRef.current;
    if (!canvas || !mount) return;

    if (!hasWebGL2()) {
      setWebglFailed(true);
      return;
    }
    let scene: MandelbulbScene;
    try {
      scene = new MandelbulbScene(canvas);
    } catch {
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;

    const runResize = () => {
      const r = mount.getBoundingClientRect();
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      scene.resize(r.width, r.height, dpr);
    };
    runResize();
    window.addEventListener("resize", runResize);

    startTimeRef.current = performance.now();

    const frame = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;

      // Live mic takes over when granted; otherwise the virtual performer.
      const mf = getFrameRef.current();
      let target: EnergyFrame;
      if (mf) {
        const bass = (mf.bands[0] + mf.bands[1]) * 0.5;
        const treble = (mf.bands[4] + mf.bands[5]) * 0.5;
        target = {
          energy: Math.min(1, mf.amplitude * 1.5 + bass * 0.3),
          bass: Math.min(1, bass * 1.3),
          treble: Math.min(1, treble * 1.3),
        };
      } else {
        target = performerEnergy(elapsed);
      }

      // Smooth so the bloom breathes instead of jittering.
      const s = smooth.current;
      const k = 0.12;
      s.energy += (target.energy - s.energy) * k;
      s.bass += (target.bass - s.bass) * k;
      s.treble += (target.treble - s.treble) * k;

      const bright = flickerRef.current.value(elapsed);
      sceneRef.current?.render({
        time: elapsed,
        energy: s.energy,
        bass: s.bass,
        treble: s.treble,
        bright,
        reduced: reducedRef.current,
      });
      audioRef.current?.setEnergy(s.energy, s.bass, s.treble);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", runResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── Full teardown on unmount: audio + mic + context ────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      mic.stop();
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      audioCtxRef.current = null;
    };
    // mic.stop is stable; run teardown once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enter = useCallback(async () => {
    // AudioContext must be created inside the user gesture.
    if (!audioCtxRef.current) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const bed = new MandelbulbAudio(ctx);
      bed.setMuted(muted);
      audioRef.current = bed;
      bed.start();
    }
    void audioCtxRef.current.resume();
    setEntered(true);
    // Attempt the live mic; denial silently falls back to the performer.
    try {
      await mic.start();
    } catch {
      /* mic denied → virtual performer keeps driving the bloom */
    }
  }, [muted, mic]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          style={{ display: webglFailed ? "none" : "block" }}
        />
      </div>

      {/* Top-left chrome: title + one-line description + status badge. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            7720 · mandelbulb · visionary bloom
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Fall into the jewel
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            A raymarched, distance-estimated power-8 Mandelbulb your voice grows
            — louder sound blooms the geometry from a calm drift into a
            hyperdimensional breakthrough.
          </p>
          {webglFailed && (
            <p className="mt-3 text-base text-destructive">
              WebGL2 is unavailable on this device, so the fractal can&apos;t
              render — the drone bed still plays once you enter.
            </p>
          )}
        </div>
      </div>

      {/* Bottom controls. */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        {!entered ? (
          <button
            onClick={enter}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter the bloom
          </button>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {micLive ? "mic · live" : "virtual performer"}
            </span>
            <button
              onClick={() => setMuted((m) => !m)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute drone" : "Mute drone"}
            </button>
            <button
              onClick={() => setPulse((p) => !p)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {pulse ? "Pulse on (≤3 Hz)" : "Pulse off"}
            </button>
          </div>
        )}
      </div>

      {/* Corner: design notes toggle. */}
      <button
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute right-4 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:top-8"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The object is a power-8{" "}
                <span className="text-foreground">Mandelbulb</span> (Daniel White
                &amp; Paul Nylander, 2009), raymarched in a WebGL2 fragment shader
                with the analytic distance estimate{" "}
                <span className="text-foreground">dist = ½·log(r)·r / dr</span>{" "}
                — the running derivative{" "}
                <span className="text-foreground">dr = n·r
                <sup>n-1</sup>·dr + 1</span> gives a safe step every march (after
                Íñigo Quílez&apos;s distance-estimation writeups).
              </p>
              <p>
                Sound grows the geometry: bass pushes the fractal exponent{" "}
                <span className="text-foreground">7 → 9</span> (the bloom),
                overall loudness drives the camera in and lifts saturation, and
                treble adds hue shimmer and jeweled sparkle. Orbit-trap coloring
                — the running minimum distance of the orbit to the origin —
                paints the iridescence.
              </p>
              <p>
                With no mic granted, a seeded{" "}
                <span className="text-foreground">mulberry32(0x7720)</span>{" "}
                virtual performer drives a deterministic burst → settle arc, so
                the whole breakthrough plays untouched. A just-intonation drone
                blooms with the same energy scalar — never a silent page. Any
                luminance pulse is clamped to ≤3 Hz soft sine and off by default.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7720-mandelbulb"]} />
    </main>
  );
}
