"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildCathedralScene, type CathedralScene } from "./scene";
import { createDrone, type DroneEngine } from "./audio";
import {
  createSafeFlicker,
  prefersReducedMotion,
} from "../_shared/psych/safeFlicker";

type Phase = "idle" | "starting" | "flying";

export default function GyroidCathedralPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CathedralScene | null>(null);
  const droneRef = useRef<DroneEngine | null>(null);
  const rafRef = useRef(0);

  // steer state lives in refs so the rAF loop never restarts
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const draggingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [audioNote, setAudioNote] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tris, setTris] = useState(0);

  // ── launch: build scene + drone, start the flight loop ──────────────────────
  const enter = useCallback(async () => {
    if (phase !== "idle") return;
    const mount = mountRef.current;
    if (!mount) return;
    setPhase("starting");

    const reduced = prefersReducedMotion();
    const resolution = reduced ? 24 : 32;

    const scene = buildCathedralScene(mount, {
      resolution,
      morph: 0,
      speed: reduced ? 1.4 : 2.1,
    });
    if (!scene) {
      setWebglOk(false);
      setPhase("idle");
      return;
    }
    sceneRef.current = scene;
    setTris(scene.triangleCount);

    // gesture-gated audio; visuals continue even if it fails
    const drone = createDrone();
    droneRef.current = drone;
    try {
      await drone.start();
    } catch (e) {
      setAudioNote("Audio unavailable — flying in silence. " + String(e));
    }

    // slow global luminance breathing — well under the photosensitive band
    const flicker = createSafeFlicker({ maxHz: 0.2, defaultHz: 0.12, floor: 0.8 });
    flicker.enable();

    setPhase("flying");

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const lum = flicker.value(now / 1000);
      const sample = scene.frame(dt, yawRef.current, pitchRef.current, lum);
      droneRef.current?.update(sample);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase]);

  // ── pointer drag steering ────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      lastX = e.clientX;
      lastY = e.clientY;
      mount.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yawRef.current -= dx * 0.005;
      pitchRef.current = Math.max(
        -1.2,
        Math.min(1.2, pitchRef.current - dy * 0.004),
      );
    };
    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      mount.releasePointerCapture?.(e.pointerId);
    };
    mount.addEventListener("pointerdown", onDown);
    mount.addEventListener("pointermove", onMove);
    mount.addEventListener("pointerup", onUp);
    mount.addEventListener("pointercancel", onUp);
    return () => {
      mount.removeEventListener("pointerdown", onDown);
      mount.removeEventListener("pointermove", onMove);
      mount.removeEventListener("pointerup", onUp);
      mount.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ── resize ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── full teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      droneRef.current?.stop();
      droneRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#04060a] font-mono text-white">
      <div ref={mountRef} className="absolute inset-0 z-0" aria-hidden />

      {/* overlay UI */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Gyroid Cathedral
          </h1>
          <p className="text-base leading-relaxed text-white/75">
            An endless flight through Alan Schoen&apos;s{" "}
            <span className="text-violet-300">gyroid</span> — a single
            triply-periodic minimal surface that fills space into an impossible,
            labyrinthine cathedral. You hear the architecture you pass through.
          </p>

          {!webglOk && (
            <p className="text-base text-rose-300" role="alert">
              Your browser reports no WebGL — the cathedral cannot render here.
            </p>
          )}
          {audioNote && (
            <p className="text-base text-rose-300">{audioNote}</p>
          )}
          {phase === "flying" && (
            <p className="text-base text-white/55">
              Drag to steer your heading · {tris.toLocaleString()} triangles per
              marched chunk, tiled 5×5×5.
            </p>
          )}
        </header>

        <footer className="flex flex-wrap items-end justify-between gap-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {phase !== "flying" ? (
              <button
                onClick={() => void enter()}
                disabled={phase === "starting" || !webglOk}
                className="min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/20 px-5 py-2.5 text-base font-medium text-white transition-colors hover:bg-violet-500/30 disabled:cursor-wait disabled:opacity-60"
              >
                {phase === "starting"
                  ? "Marching the surface…"
                  : "Enter the cathedral"}
              </button>
            ) : (
              <span className="text-base text-white/75">
                Flying — drag anywhere to change course.
              </span>
            )}
          </div>

          <button
            onClick={() => setShowNotes((s) => !s)}
            className="pointer-events-auto min-h-[44px] px-2 py-2.5 text-base text-white/55 underline transition-colors hover:text-white/95"
          >
            {showNotes ? "Hide design notes" : "Design notes"}
          </button>
        </footer>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto border-t border-white/10 bg-black/85 p-6 backdrop-blur sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[28rem] sm:border-l">
          <div className="space-y-4 text-base leading-relaxed text-white/75">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p>
              <span className="text-violet-300">The surface.</span> The gyroid is
              the implicit isosurface{" "}
              <code className="text-white/95">
                sin x·cos y + sin y·cos z + sin z·cos x = 0
              </code>
              . It is triply-periodic (period 2π on every axis) and space-filling,
              so it reads as an infinite, impossible interior.
            </p>
            <p>
              <span className="text-violet-300">Marching cubes.</span> One 2π³
              chunk is polygonized from scratch with the classic 256-entry edge
              and triangle tables — no shader raymarch, no library addon. Vertex
              normals come from the field&apos;s analytic gradient. Because the
              chunk tiles seamlessly, it is instanced across a 5×5×5 lattice
              (125 instances, one draw call) that re-centres on the camera every
              frame, so flight is endless.
            </p>
            <p>
              <span className="text-violet-300">The drone.</span> A
              just-intonation chord over A1 (55 Hz): root, 9/8, 5/4, 3/2, plus a
              sub. The gyroid field and gradient magnitude sampled at the camera
              drive a lowpass cutoff, so the geometry literally opens and closes
              the sound. Rendered through a synthesized convolution reverb for a
              stone-cathedral space, with a limiter on the master.
            </p>
            <p>
              <span className="text-violet-300">References.</span> Alan Schoen
              (gyroid, NASA TN D-5541, 1970); Hermann Schwarz (P/D surfaces);
              gyroid acoustic-crystal topological sound (PMC9951337, 2023);
              Callophrys rubi butterfly-wing gyroid photonics; arXiv 2512.18308
              (2025, chiral gyrating-surface family).
            </p>
            <p className="text-white/55">
              Full write-up in README.md. Safe by design: no strobe — luminance
              only drifts slowly (≤ 0.2 Hz).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
