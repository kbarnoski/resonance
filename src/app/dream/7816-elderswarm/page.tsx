"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";
import { createSwarm, stepSwarm, type SwarmState } from "./swarm";
import { createGLRenderer, type SwarmRenderer } from "./gl";
import { createCanvas2DRenderer } from "./canvas2d";
import { createAudioEngine, type AudioEngine } from "./audio";

// iOS ships a requestPermission gate on the orientation event.
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function Elderswarm() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const swarmRef = useRef<SwarmState | null>(null);
  const rendererRef = useRef<SwarmRenderer | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 1.4, floor: 0.6 }),
  );
  const rafRef = useRef<number | null>(null);
  const lastTRef = useRef<number>(0);
  const prevCohRef = useRef<number>(0);
  const orientRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  // mirror of `reduced` the render loop can read without re-subscribing
  const reducedRef = useRef(false);

  const [began, setBegan] = useState(false);
  const [fellBack, setFellBack] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [flickerOn, setFlickerOn] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [coh, setCoh] = useState(0);

  // ── the render/sim loop (runs silently before audio starts) ────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setReduced(prefersReducedMotion());
    setTiltAvailable(typeof window !== "undefined" && "DeviceOrientationEvent" in window);

    const swarm = createSwarm();
    swarmRef.current = swarm;

    let renderer = createGLRenderer(canvas);
    if (!renderer) {
      renderer = createCanvas2DRenderer(canvas);
      setFellBack(true);
    }
    rendererRef.current = renderer;

    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);

    const flicker = flickerRef.current;
    lastTRef.current = performance.now();
    let cohThrottle = 0;

    const frame = (now: number) => {
      const s = swarmRef.current;
      const r = rendererRef.current;
      if (!s || !r) return;
      let dt = (now - lastTRef.current) / 1000;
      lastTRef.current = now;
      if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 60;
      // reduced-motion users get slowed, drifting motion — no fast strobe figures
      if (reducedRef.current) dt *= 0.5;

      stepSwarm(s, dt);

      // rising edge across the coherence threshold → one "met" voice-swell
      const prev = prevCohRef.current;
      if (prev < 0.5 && s.coherence >= 0.5) {
        audioRef.current?.triggerMet(s.coherence);
      }
      prevCohRef.current = s.coherence;

      audioRef.current?.setCoherence(s.coherence);

      const brightness = flicker.value(now / 1000);
      r.render(s, brightness);

      // surface coherence to the UI readout at ~10 Hz
      cohThrottle += dt;
      if (cohThrottle > 0.1) {
        cohThrottle = 0;
        setCoh(s.coherence);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      if (orientRef.current) {
        window.removeEventListener("deviceorientation", orientRef.current);
        orientRef.current = null;
      }
      rendererRef.current?.dispose();
      rendererRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      swarmRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the loop's reduced-motion read fresh without re-subscribing
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // ── begin: unlock audio on the user gesture ────────────────────────────────
  const handleBegin = useCallback(() => {
    setBegan(true);
    if (audioRef.current) {
      audioRef.current.resume();
      return;
    }
    const engine = createAudioEngine();
    if (!engine) {
      setAudioFailed(true);
      return;
    }
    audioRef.current = engine;
    engine.resume();
  }, []);

  // ── tilt: iOS-gated device-orientation → focus point ───────────────────────
  const attachOrientation = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const s = swarmRef.current;
      if (!s) return;
      const gamma = e.gamma ?? 0; // left/right lean, -90..90
      const beta = e.beta ?? 0; // front/back lean, -180..180
      const nx = 0.5 + Math.max(-1, Math.min(1, gamma / 40)) * 0.28;
      const ny = 0.5 + Math.max(-1, Math.min(1, (beta - 40) / 40)) * 0.28;
      s.tiltX = nx;
      s.tiltY = ny;
    };
    orientRef.current = handler;
    window.addEventListener("deviceorientation", handler);
    setTiltOn(true);
  }, []);

  const handleEnableTilt = useCallback(async () => {
    const Ctor = window.DeviceOrientationEvent as OrientationCtor | undefined;
    if (Ctor && typeof Ctor.requestPermission === "function") {
      try {
        const res = await Ctor.requestPermission();
        if (res === "granted") attachOrientation();
      } catch {
        /* denied / unavailable — seeded drift keeps performing */
      }
    } else {
      attachOrientation();
    }
  }, [attachOrientation]);

  // ── flicker controls ───────────────────────────────────────────────────────
  const toggleFlicker = useCallback(() => {
    const f = flickerRef.current;
    if (f.enabled) {
      f.disable();
      setFlickerOn(false);
    } else {
      f.enable();
      setFlickerOn(true);
    }
  }, []);

  const killFlicker = useCallback(() => {
    flickerRef.current.kill();
    setFlickerOn(false);
  }, []);

  const cohPct = Math.round(coh * 100);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* art layer */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-transparent to-background/80" />

      {/* header / chrome */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-8">
        <header className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · 7816 · renderer A
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
            MET
          </h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Two thousand autonomous beings, each with a forward vision cone, turn
            to face you when you enter their gaze — the drug-free sense of being
            attended to by entities that turn toward you.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!began && (
              <button
                onClick={handleBegin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            )}
            {began && !audioFailed && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                coherence {cohPct}%
              </span>
            )}
            <button
              onClick={() => setNotesOpen(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
            {tiltAvailable && !tiltOn && (
              <button
                onClick={() => {
                  void handleEnableTilt();
                }}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Enable tilt
              </button>
            )}
            <button
              onClick={toggleFlicker}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {flickerOn ? "Flicker on" : "Flicker off"}
            </button>
            {flickerOn && (
              <button
                onClick={killFlicker}
                className="min-h-[44px] rounded-md border border-destructive/50 bg-background/60 px-4 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                Stop flicker
              </button>
            )}
          </div>

          <div className="mt-4 space-y-1">
            {fellBack && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                WebGL2 unavailable — Canvas2D fallback active
              </p>
            )}
            {audioFailed && (
              <p className="text-sm text-destructive">
                Audio could not start on this device. The visuals keep running.
              </p>
            )}
            {reduced && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Reduced motion — slowed drift, no flicker
              </p>
            )}
            {tiltOn && (
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Tilt steering the focus — lean to be seen
              </p>
            )}
          </div>
        </header>

        <footer className="max-w-xl">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {began
              ? "Watch the field gather. Every few seconds a moving focus point enters some beings' cones; they swing to face it and cohere into a mandala with a bright pupil — then let go."
              : "The field is already alive and silent. Press Begin for the drone bed and the voice that swells each time you are met."}
          </p>
        </footer>
      </div>

      {/* design-notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              MET — design notes
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> can the
                DMT-breakthrough sense of being <em>met</em> — attended to by
                autonomous entities that turn to face you — be evoked drug-free,
                on a screen?
              </p>
              <p>
                <span className="text-foreground">The mechanic:</span> each of
                ~2000 agents has a forward vision cone and perceives only the
                neighbours — and the moving focus point — inside it. Steering is
                computed over that visible set, plus a one-way pull toward the
                focus. The asymmetry is the point: the beings attend to you; you
                cannot attend back. A non-reciprocal vision-cone perception swarm
                (Barberis/Peruani-lineage active matter), not isotropic Reynolds
                flocking.
              </p>
              <p>
                <span className="text-foreground">The coupling:</span> one
                coherence scalar — how many beings face the focus and how tightly
                they cluster on it — drives the drone swell, the choir voice, the
                figure brightness, and the mandala fold together. The sound of
                being met and the sight of it are the same event.
              </p>
              <p>
                <span className="text-foreground">Use:</span> it performs itself
                from a seeded drift with no sensors. On a phone, tap Enable tilt
                and lean — your lean becomes the focus the beings turn toward.
              </p>
              <p>
                <span className="text-foreground">Safety:</span> any luminance
                flicker is opt-in, capped at 3 Hz through the shared SafeFlicker,
                soft sine not hard strobe, with an instant stop. Reduced-motion
                is honoured.
              </p>
              <p className="text-xs">
                References: Reynolds 1987 (boids); vision-cone active matter
                arXiv:2412.19297 &amp; 2512.18749; Klüver form constants /
                Bressloff–Cowan cortical geometry.
              </p>
            </div>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7816-elderswarm"]} />
    </main>
  );
}
