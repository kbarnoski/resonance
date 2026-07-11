"use client";

// **For**: kids (4+)
//
// Star Bowl — tilt a tablet like a bowl of glowing stars. Pool them in the
// calm center for a warm, resolved chord; tilt them out to the spiky rim and
// the harmony tenses (soft dissonance + shimmer); tilt home and it resolves.
// A real harmonic decision, made with the body.

import { useCallback, useEffect, useRef, useState } from "react";
import { makeMarbles, runStep, clusterRadius, Marble } from "./physics";
import { makeScene, StarScene } from "./scene";
import { makeAudio, StarBowlAudio } from "./audio";

const MARBLE_COUNT = 48;

type Phase = "idle" | "running";

type DOEPerm = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<PermissionState>;
};

export default function KidsStarBowl() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sim + render state in refs (RAF loop must avoid stale closures).
  const marblesRef = useRef<Marble[]>([]);
  const sceneRef = useRef<StarScene | null>(null);
  const audioRef = useRef<StarBowlAudio | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  // Tilt gravity vector (smoothed). Set by orientation OR pointer OR drift.
  const gxRef = useRef(0);
  const gyRef = useRef(0);
  const targetGxRef = useRef(0);
  const targetGyRef = useRef(0);
  const hasOrientRef = useRef(false);
  const lastOrientMsRef = useRef(0);
  const pointerDownRef = useRef(false);

  // Tension tracking for resolution detection / bloom reward.
  const tensionRef = useRef(0);
  const wasHighRef = useRef(false);
  const lastRimPingRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [tiltUnavailable, setTiltUnavailable] = useState(false);
  const [noWebGL, setNoWebGL] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [tensionPct, setTensionPct] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  // ── Main loop ──────────────────────────────────────────────────────────
  const loop = useCallback((ts: number) => {
    const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 1 / 60;
    lastTsRef.current = ts;

    // Auto-drift: if no real tilt and no pointer for ~2s, gently swirl so an
    // untouched device keeps rolling and sounding.
    const sinceOrient = ts - lastOrientMsRef.current;
    const idle =
      !pointerDownRef.current && (!hasOrientRef.current || sinceOrient > 1800);
    if (idle) {
      const a = ts * 0.00035;
      targetGxRef.current = Math.cos(a) * 0.42;
      targetGyRef.current = Math.sin(a * 1.3) * 0.42;
    }

    // Smooth the gravity vector toward its target (syrupy, calm).
    gxRef.current += (targetGxRef.current - gxRef.current) * 0.06;
    gyRef.current += (targetGyRef.current - gyRef.current) * 0.06;

    runStep(marblesRef.current, {
      gx: gxRef.current,
      gy: gyRef.current,
      dt,
    });

    const tension = clusterRadius(marblesRef.current);
    tensionRef.current = tension;

    // Drive audio harmony.
    const audio = audioRef.current;
    if (audio) {
      audio.setTension(tension);
      // Soft rim ping when the cluster is way out (rate-limited).
      if (tension > 0.78 && ts - lastRimPingRef.current > 700) {
        audio.pluck(tension);
        lastRimPingRef.current = ts;
      }
      // Resolution reward: was tense, now back home -> bloom.
      if (tension > 0.6) wasHighRef.current = true;
      if (wasHighRef.current && tension < 0.28) {
        audio.resolveBloom();
        wasHighRef.current = false;
      }
    }

    sceneRef.current?.render(marblesRef.current, tension, ts);

    // Throttle React state updates (visual meter only).
    if (Math.abs(tension * 100 - tensionPct) > 1.5) {
      setTensionPct(Math.round(tension * 100));
    }

    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Orientation handler ──────────────────────────────────────────────────
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      hasOrientRef.current = true;
      lastOrientMsRef.current = performance.now();
      // gamma = left/right tilt -> gx ; beta = front/back tilt -> gy.
      const gx = Math.max(-45, Math.min(45, e.gamma)) / 45;
      const gy = Math.max(-45, Math.min(45, e.beta - 35)) / 45; // ~holding angle
      targetGxRef.current = gx;
      targetGyRef.current = gy;
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, []);

  // ── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const c = canvasRef.current;
      if (!c || !sceneRef.current) return;
      sceneRef.current.resize(c.clientWidth, c.clientHeight);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Teardown on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      void audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  // ── Pointer drag-to-tilt fallback ────────────────────────────────────────
  function pointerToTilt(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    targetGxRef.current = Math.max(-1, Math.min(1, nx * 2));
    targetGyRef.current = Math.max(-1, Math.min(1, ny * 2));
    lastOrientMsRef.current = performance.now(); // suppress auto-drift while dragging
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (phaseRef.current !== "running") return;
    pointerDownRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    pointerToTilt(e);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointerDownRef.current) return;
    pointerToTilt(e);
  }
  function onPointerUp() {
    pointerDownRef.current = false;
  }

  // ── Start (single user gesture: audio + iOS permission) ──────────────────
  async function start() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Audio (must be inside the gesture).
    const audio = makeAudio();
    if (!audio) {
      setNoAudio(true);
    } else {
      audioRef.current = audio;
      if (audio.ctx.state === "suspended") {
        try {
          await audio.ctx.resume();
        } catch {
          /* ignore */
        }
      }
    }

    // iOS 13+ orientation permission (must be inside the gesture).
    const DOE = DeviceOrientationEvent as DOEPerm;
    if (typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        hasOrientRef.current = res === "granted";
        if (res !== "granted") setTiltUnavailable(true);
      } catch {
        setTiltUnavailable(true);
      }
    } else if (typeof DeviceOrientationEvent === "undefined") {
      setTiltUnavailable(true);
    }
    // On Android/Chrome hasOrientRef flips true on first event; if no event
    // arrives we still drift + allow drag, and surface the notice shortly.
    setTimeout(() => {
      if (!hasOrientRef.current) setTiltUnavailable(true);
    }, 1500);

    // Scene.
    marblesRef.current = makeMarbles(MARBLE_COUNT);
    const sc = makeScene(canvas, MARBLE_COUNT);
    if (!sc) {
      setNoWebGL(true);
    } else {
      sceneRef.current = sc;
      sc.resize(canvas.clientWidth, canvas.clientHeight);
    }

    phaseRef.current = "running";
    setPhase("running");
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }

  return (
    <div
      className="relative w-full overflow-hidden bg-[#0b1830]"
      style={{ height: "calc(100vh - 3rem)", touchAction: "none" }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Start screen */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-6 text-center">
          <div className="text-6xl" aria-hidden>
            ✨🥣✨
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Star Bowl
          </h1>
          <p className="mx-auto max-w-xs text-base leading-relaxed text-muted-foreground">
            Tilt to roll the glowing stars. Keep them in the calm middle for a
            cozy sound — or tip them out to the wobbly edge, then bring them
            home to make it sweet again.
          </p>
          <button
            onClick={start}
            className="rounded-full bg-violet-500 font-bold text-foreground shadow-xl shadow-violet-500/30 transition-all hover:bg-violet-400 active:scale-95"
            style={{ minWidth: 200, minHeight: 72, padding: "0 2.5rem", fontSize: 24 }}
          >
            ▶ Start
          </button>
          <p className="text-base text-muted-foreground">
            On a computer? Drag the stars around instead.
          </p>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <>
          {/* Calm <-> Wobbly meter */}
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 text-center">
            <div className="mb-1 flex items-center gap-2 text-base text-muted-foreground">
              <span>calm</span>
              <div className="h-2.5 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-150"
                  style={{
                    width: `${tensionPct}%`,
                    background:
                      "linear-gradient(90deg,#7da7ff,#9fb8ff,#b48bff)",
                  }}
                />
              </div>
              <span>wobbly</span>
            </div>
          </div>

          {/* Fallback / error notices */}
          <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1">
            {tiltUnavailable && (
              <p className="text-base text-violet-300">
                Tilt not available — drag to tilt.
              </p>
            )}
            {noWebGL && (
              <p className="text-base text-violet-300">
                3D not available on this device — sound is still playing.
              </p>
            )}
            {noAudio && (
              <p className="text-base text-violet-300">
                Sound not available — the stars still roll.
              </p>
            )}
          </div>
        </>
      )}

      {/* Design notes */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-3 top-3 rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground transition-colors hover:bg-accent"
        style={{ minHeight: 44 }}
      >
        {showNotes ? "✕" : "?"}
      </button>
      {showNotes && (
        <div className="absolute right-3 top-16 max-w-xs rounded-2xl bg-[#0b1830]/95 p-4 text-base text-muted-foreground shadow-2xl ring-1 ring-border">
          <h2 className="mb-2 text-xl font-bold text-foreground">Design notes</h2>
          <p className="mb-2">
            Tilt-gravity rolls ~48 star-marbles in a bowl. Where the cluster
            sits maps to harmony: center = warm consonant chord; rim = soft
            dissonance with shimmer; tilting home{" "}
            <span className="text-foreground">resolves</span> it — a real
            tension→release decision made by the body.
          </p>
          <p className="text-muted-foreground">
            Built on the &ldquo;dissonance resolves to consonance&rdquo;
            tension-and-release pedagogy and an Eno-style calm bedtime drone.
            Tags: tilt input · three.js GPU · tilt-gravity harmony.
          </p>
        </div>
      )}
    </div>
  );
}
