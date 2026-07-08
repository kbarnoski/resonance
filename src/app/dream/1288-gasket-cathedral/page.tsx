"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { buildPacking, type Packing } from "./packing";
import { createScene, type SceneHandle, type StrikeEvent } from "./scene";
import { startAudio, type AudioEngine } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1288 · GASKET CATHEDRAL
 *
 * Walk INSIDE the Apollonian gasket. A 3D Soddy / Apollonian sphere packing —
 * four unit spheres in a tetrahedron inside their bounding sphere, then every
 * curvilinear-tetrahedron gap filled by its inscribed tangent sphere via the
 * Soddy–Gosset reflection — becomes a cathedral of nested nacre bells. Each
 * sphere's curvature is its PITCH (big bell = low, tiny deep bell = high),
 * quantised to 5-limit just intonation so every strike harmonises over a low
 * root+fifth drone. Move first-person through the packing (pointer-lock + WASD,
 * drag-look, or gyro); strike the bell under your gaze or as you pass through
 * one. Every ring is a Web Audio HRTF panner at that sphere's world position,
 * with the listener driven by the camera — a bell above-left sounds above-left.
 *
 * The top-rung 3D deepening of 1285-apollonian-gasket (that piece is the 2D
 * tap-to-densify gasket; this one you inhabit and spatialise).
 */

export default function GasketCathedralPage() {
  const mountRef = useRef<HTMLDivElement>(null);

  const packingRef = useRef<Packing | null>(null);
  const sceneRef = useRef<SceneHandle | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [locked, setLocked] = useState(false);
  const [touring, setTouring] = useState(false);
  const [gyroOn, setGyroOn] = useState(false);
  const [lockSupported, setLockSupported] = useState(true);
  const [info, setInfo] = useState<{ spheres: number; err: number } | null>(null);

  // Route a strike into the spatial audio engine.
  const handleStrike = useCallback((e: StrikeEvent) => {
    audioRef.current?.strikeAt(e.bend, e.sizeNorm, e.x, e.y, e.z);
  }, []);

  // ── Build packing + scene + render loop (audio joins on "Enter") ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();

    const packing = buildPacking(6, { minR: 0.028, maxCount: 480, maxDepth: 5 });
    packingRef.current = packing;
    setInfo({ spheres: packing.selfCheck.spheres, err: packing.selfCheck.maxTangencyError });
    // Self-check log (tangency + Soddy–Gosset residual, termination).
    // eslint-disable-next-line no-console
    console.log("[1288 gasket-cathedral] self-check", packing.selfCheck);

    const scene = createScene(mount, {
      spheres: packing.spheres,
      outer: packing.outer,
      reduced,
      onStrike: handleStrike,
      onLockChange: setLocked,
    });
    if (!scene) {
      setWebglFailed(true);
      return;
    }
    sceneRef.current = scene;
    setLockSupported(scene.hasPointerLock());

    let last = performance.now();
    let tourTick = 0;
    let wasTouring = false;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = now / 1000;

      const pose = scene.update(dt, elapsed);
      audioRef.current?.updateListener(
        pose.px,
        pose.py,
        pose.pz,
        pose.fx,
        pose.fy,
        pose.fz,
        pose.ux,
        pose.uy,
        pose.uz,
      );

      tourTick += dt;
      if (tourTick > 0.2) {
        tourTick = 0;
        if (pose.autoTour !== wasTouring) {
          wasTouring = pose.autoTour;
          setTouring(pose.autoTour);
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [handleStrike]);

  // Audio teardown on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const enter = useCallback(async () => {
    setStarted(true);
    // Grab pointer-lock synchronously inside the click gesture (before any
    // await), or browsers reject it — falls back to drag-look silently.
    sceneRef.current?.requestPointerLock();
    if (!audioRef.current) {
      try {
        audioRef.current = await startAudio();
      } catch {
        // Visuals still run without audio; the room is already showing.
      }
    }
  }, []);

  const relock = useCallback(() => {
    sceneRef.current?.requestPointerLock();
  }, []);

  const enableGyro = useCallback(async () => {
    const ok = await sceneRef.current?.enableGyro();
    setGyroOn(!!ok);
  }, []);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#0b0e14]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold text-white">Gasket Cathedral</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-white/75 ring-1 ring-white/15 transition hover:text-white"
            >
              {showNotes ? "close notes" : "read the design notes"}
            </button>
            <Link
              href="/dream"
              className="flex min-h-[44px] items-center px-2 font-mono text-base text-white/60 transition hover:text-white/90"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-base text-white/75">
          Walk inside the Apollonian gasket — a cathedral of nested nacre bells
          where each sphere&apos;s size is its pitch, spatialised around your head.
          Move through the 3D Soddy packing and strike the bells; big shells ring
          low, tiny deep ones ring high, all harmonising over a root-and-fifth
          drone.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl overflow-y-auto rounded-lg bg-black/70 p-4 font-mono text-base text-white/75 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-white/95">The question:</strong> what if you
            could <em>walk inside</em> the Apollonian gasket — a cathedral of
            nested bells where each sphere&apos;s size is its pitch, spatialised
            around your head?
          </p>
          <p className="mb-2">
            <strong className="text-white/95">The packing:</strong> four unit
            spheres at the vertices of a regular tetrahedron, mutually tangent
            inside their common bounding sphere — the 3D{" "}
            <span className="text-cyan-200/90">Soddy configuration</span>. Five
            mutually-tangent spheres obey the{" "}
            <span className="text-cyan-200/90">Soddy–Gosset theorem</span>,
            (Σbᵢ)² = 3·Σbᵢ² (the 3D generalisation of the Descartes Circle
            Theorem). Given four spheres, the two tangent to all four have bends
            summing to Σ(the four), so the &ldquo;other&rdquo; sphere is the
            <em> reflection</em> of the omitted one — recursively filling every
            curvilinear-tetrahedron gap with an ever-smaller inscribed bell.
            Tangency verifies to ~1e-15.
          </p>
          <p className="mb-2">
            <strong className="text-white/95">Curvature → pitch:</strong> a
            sphere&apos;s bend b = 1/r maps to frequency on a 5-limit
            just-intonation pentatonic — big nave bells low, tiny deep bells high,
            every strike consonant over a low root+fifth drone bed.
          </p>
          <p className="mb-2">
            <strong className="text-white/95">Spatialised:</strong> each ring is a
            Web Audio <span className="text-emerald-300/95">PannerNode</span>{" "}
            (HRTF) at the sphere&apos;s 3D world position; the AudioListener is
            driven by the first-person camera, so a bell above-left of you sounds
            above-left. Move with pointer-lock + WASD (or drag-look, or phone
            gyro); strike the bell under your gaze, or pass through one to ring it.
            Idle ~2s and the camera auto-tours the nave hands-free.
          </p>
          <p className="text-white/60">
            Refs: Frederick Soddy, &ldquo;The Kiss Precise,&rdquo; <em>Nature</em>{" "}
            139 (1936); the Soddy–Gosset theorem; the 3D generalisation of the
            Descartes Circle Theorem (Lagarias, Mallows &amp; Wilks, &ldquo;Beyond
            the Descartes Circle Theorem,&rdquo; 2002); Mumford, Series &amp;
            Wright, <em>Indra&apos;s Pearls</em> (2002). The 3D deepening of
            1285-apollonian-gasket. Not verified on a real GPU/ears.
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div ref={mountRef} className="h-full w-full touch-none" style={{ touchAction: "none" }} />

        {/* Fixed crosshair reticle */}
        {started && !webglFailed && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className="h-5 w-5 rounded-full ring-1 ring-white/50" />
          </div>
        )}

        {/* Live readout */}
        {info && !webglFailed && (
          <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/45 px-3 py-2 font-mono text-base text-white/80 ring-1 ring-white/10 backdrop-blur-sm">
            <div className="text-cyan-200/90">
              {info.spheres} tangent bells{" "}
              <span className="text-white/45">· tangency {info.err.toExponential(0)}</span>
            </div>
            <div className="text-white/60">
              {locked
                ? "WASD move · mouse look · click = strike"
                : "drag = look · click bell = strike"}
            </div>
            {touring && <div className="text-emerald-300/90">auto-touring the nave…</div>}
          </div>
        )}

        {webglFailed && (
          <div className="absolute inset-x-4 top-4 z-10 max-w-md rounded bg-black/60 px-4 py-3 font-mono text-base text-rose-300 ring-1 ring-rose-400/25 backdrop-blur-sm">
            WebGL is unavailable in this browser, so the navigable 3D cathedral
            can&apos;t render. The sphere packing and its just-intonation audio
            need a WebGL canvas — try a hardware-accelerated browser.
          </div>
        )}

        {/* Controls row (after entering) */}
        {started && !webglFailed && (
          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            {lockSupported && !locked && (
              <button
                type="button"
                onClick={relock}
                className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 font-mono text-base text-white/90 ring-1 ring-white/25 transition hover:bg-white/20"
              >
                click to lock mouse-look
              </button>
            )}
            <button
              type="button"
              onClick={enableGyro}
              className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
                gyroOn
                  ? "bg-emerald-400/20 text-emerald-300/95 ring-emerald-300/40"
                  : "text-white/60 ring-white/15 hover:text-white/90"
              }`}
            >
              {gyroOn ? "gyro on" : "use gyro (phone)"}
            </button>
          </div>
        )}

        {/* Enter (audio + pointer-lock gate) */}
        {!started && !webglFailed && (
          <div className="absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4">
            <button
              type="button"
              onClick={enter}
              className="min-h-[44px] rounded-full bg-cyan-400/90 px-4 py-2.5 font-mono text-base font-semibold text-black ring-1 ring-cyan-200/40 transition hover:bg-cyan-300"
            >
              ▶ Enter the cathedral
            </button>
            <p className="max-w-md text-center text-base text-white/60">
              Starts the sound and drops you inside the packing. Move with WASD +
              mouse (or drag to look); strike the bells. Leave it idle and it
              tours itself.
            </p>
          </div>
        )}

        {started && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <p className="text-base text-white/55">
              Strike the bell under the reticle, or drift through one to ring it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
