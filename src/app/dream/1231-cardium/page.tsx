"use client";

// 1231-cardium — a self-composing excitable medium wrapped on a sphere.
//
// FitzHugh–Nagumo (Barkley reduction) excitable tissue lives on a geodesic
// icosphere. Depolarisation waves sweep the curved surface; an internal clock
// slowly varies refractoriness over minutes so the piece organises itself
// through phases — calm heartbeat -> a reentrant rotor wrapping the globe ->
// fibrillation-like multi-wavelet chaos -> self-termination back to calm — then
// re-seeds with fresh orientation so it never loops identically. Listening
// regions turn each passing wavefront into a rhythmic pulse whose tempo IS the
// composition. You are a gentle conductor, not a trigger-presser.
//
// References: FitzHugh (1961); Nagumo, Arimoto & Yoshizawa (1962); Barkley
// (1991); cardiac reentry & spiral waves — Arthur Winfree.

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { makeIcoSphere, nearestVertex, type IcoSphere } from "./mesh";
import { FhnMedium } from "./fhn";
import { ArcController, type Phase } from "./arc";
import { CardiumViz } from "./viz";
import { PulseEngine } from "./audio";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

// A random orthonormal (axis, grad) pair for seeding a fresh rotor each cycle.
function makeSeedFrame(): {
  axis: [number, number, number];
  grad: [number, number, number];
} {
  const rand = () => Math.random() * 2 - 1;
  const ra: [number, number, number] = [rand(), rand(), rand()];
  const la = Math.hypot(ra[0], ra[1], ra[2]) || 1;
  const axis: [number, number, number] = [ra[0] / la, ra[1] / la, ra[2] / la];
  const rg: [number, number, number] = [rand(), rand(), rand()];
  // Gram–Schmidt: remove the component of rg along axis.
  const dot = rg[0] * axis[0] + rg[1] * axis[1] + rg[2] * axis[2];
  const pg: [number, number, number] = [
    rg[0] - dot * axis[0],
    rg[1] - dot * axis[1],
    rg[2] - dot * axis[2],
  ];
  const lg = Math.hypot(pg[0], pg[1], pg[2]) || 1;
  const grad: [number, number, number] = [pg[0] / lg, pg[1] / lg, pg[2] / lg];
  return { axis, grad };
}

const PHASE_LABEL: Record<Phase, string> = {
  calm: "calm — single sweeping pulses",
  onset: "onset — a rotor takes hold",
  fibrillation: "fibrillation — multi-wavelet chaos",
  dissolution: "dissolution — waves collide and fade",
};

export default function Page() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const meshRef = useRef<IcoSphere | null>(null);
  const vizRef = useRef<CardiumViz | null>(null);
  const medRef = useRef<FhnMedium | null>(null);
  const arcRef = useRef<ArcController>(new ArcController());
  const audioRef = useRef<PulseEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const runningRef = useRef<boolean>(false);
  const paceVertexRef = useRef<number>(0);
  const listenRef = useRef<number[]>([]);
  const pointerDownRef = useRef<boolean>(false);
  const lastDepositRef = useRef<number>(0);
  const uiTickRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [phase, setPhase] = useState<Phase>("calm");
  const [elapsed, setElapsed] = useState(0);
  const [refractory, setRefractory] = useState(50); // slider 0..100

  // Build mesh + visuals on mount; run a resting render loop immediately so the
  // page is never blank. Simulation + audio begin on the Begin gesture.
  useEffect(() => {
    const ok = hasWebGL();
    setWebglOk(ok);
    if (!ok || !hostRef.current) return;

    const mesh = makeIcoSphere(4);
    meshRef.current = mesh;
    const med = new FhnMedium(mesh);
    medRef.current = med;
    const viz = new CardiumViz(hostRef.current, mesh);
    vizRef.current = viz;

    // Pace node at the north pole; three listening regions spread around.
    paceVertexRef.current = nearestVertex(mesh, [0, 1, 0]);
    const listen = [
      nearestVertex(mesh, [0, 0, 1]),
      nearestVertex(mesh, [0, -0.4, -1]),
      nearestVertex(mesh, [1, 0.2, 0]),
    ];
    listenRef.current = listen;

    const dir = (i: number) =>
      new THREE.Vector3(
        mesh.positions[i * 3],
        mesh.positions[i * 3 + 1],
        mesh.positions[i * 3 + 2],
      );
    viz.setNodes(
      [dir(paceVertexRef.current), dir(listen[0]), dir(listen[1]), dir(listen[2])],
      [0xe8b04b, 0x7fd4c8, 0x7fd4c8, 0x7fd4c8],
    );

    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      const m = medRef.current;
      const v = vizRef.current;
      if (!m || !v) return;

      if (runningRef.current) {
        const { state, event } = arcRef.current.advance(dt);
        m.b = 0.11 - 0.09 * state.drive; // refractoriness: high b calm, low b chaotic

        if (event.clearField) m.clearField();
        if (event.seedRotor) {
          const { axis, grad } = makeSeedFrame();
          m.seedRotor(axis, grad);
        }
        if (event.pace) m.stimulate(paceVertexRef.current, 2, 1);

        m.step(8);

        const eng = audioRef.current;
        if (eng) {
          eng.setActiveRegions(state.activeRegions);
          const ls = listenRef.current;
          eng.update([m.u[ls[0]], m.u[ls[1]], m.u[ls[2]]]);
        }

        // Throttle React state updates to ~4 Hz.
        uiTickRef.current += dt;
        if (uiTickRef.current > 0.25) {
          uiTickRef.current = 0;
          setPhase(state.phase);
          setElapsed(state.elapsed);
        }
      }

      v.render(m.u, m.scar, dt, 0.08);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      vizRef.current?.dispose();
      vizRef.current = null;
      medRef.current = null;
    };
  }, []);

  const begin = useCallback(() => {
    if (runningRef.current) return;
    const mesh = meshRef.current;
    const med = medRef.current;
    if (!mesh || !med) return;

    // Guarded AudioContext creation on the user gesture.
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) {
        try {
          const ctx = new Ctor();
          ctxRef.current = ctx;
          const eng = new PulseEngine(ctx, [58, 78, 98]);
          audioRef.current = eng;
          eng.start();
        } catch {
          ctxRef.current = null;
        }
      }
    }
    ctxRef.current?.resume().catch(() => {});

    arcRef.current.reset();
    arcRef.current.userBias = (refractory - 50) / 100;
    med.clearField();
    // Kick the tissue immediately so it is never silent/blank.
    med.stimulate(paceVertexRef.current, 2, 1);
    runningRef.current = true;
    setStarted(true);
  }, [refractory]);

  // Deposit an excitation at the raycast point (paces a beat / seeds reentry).
  const depositAt = useCallback((clientX: number, clientY: number) => {
    const viz = vizRef.current;
    const mesh = meshRef.current;
    const med = medRef.current;
    const host = hostRef.current;
    if (!viz || !mesh || !med || !host) return;
    const rect = host.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
    const dir = viz.pick(ndcX, ndcY);
    if (!dir) return;
    const vtx = nearestVertex(mesh, [dir.x, dir.y, dir.z]);
    med.stimulate(vtx, 2, 1);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      pointerDownRef.current = true;
      lastDepositRef.current = performance.now();
      depositAt(e.clientX, e.clientY);
    },
    [started, depositAt],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!started || !pointerDownRef.current) return;
      const now = performance.now();
      if (now - lastDepositRef.current < 120) return; // throttle the beat
      lastDepositRef.current = now;
      depositAt(e.clientX, e.clientY);
    },
    [started, depositAt],
  );
  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);

  const onSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setRefractory(val);
    arcRef.current.userBias = (val - 50) / 100;
  }, []);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05090c] text-white">
      <div
        ref={hostRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            This piece needs WebGL to render the excitable sphere, and your
            browser or device does not appear to support it. Try a recent
            desktop browser with hardware acceleration enabled.
          </p>
        </div>
      )}

      {/* Header / intro */}
      <div className="pointer-events-none absolute left-0 top-0 w-full p-6 sm:p-8">
        <h1 className="font-serif text-2xl text-white sm:text-3xl">cardium</h1>
        <p className="mt-2 max-w-xl text-base text-white/75">
          A living sheet of excitable tissue wrapped on a sphere that composes
          itself over minutes — from a calm heartbeat, through a spiral rotor,
          into fibrillation, and back.
        </p>
      </div>

      {/* Controls */}
      {webglOk && (
        <div className="absolute bottom-0 left-0 w-full p-6 sm:p-8">
          {!started ? (
            <button
              onClick={begin}
              className="pointer-events-auto min-h-[44px] rounded-md border border-white/20 bg-rose-900/60 px-4 py-2.5 text-base text-white transition hover:bg-rose-800/70"
            >
              Begin — let the tissue wake
            </button>
          ) : (
            <div className="pointer-events-auto flex max-w-xl flex-col gap-3">
              <div className="font-mono text-base text-white/75">
                <span className="text-white/95">{PHASE_LABEL[phase]}</span>
                <span className="text-white/55">
                  {"  ·  "}
                  {mm}:{ss.toString().padStart(2, "0")}
                </span>
              </div>
              <label className="flex flex-col gap-1 text-base text-white/75">
                <span>
                  refractory period{" "}
                  <span className="text-white/55">
                    (calm heartbeat ↔ fibrillation)
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={refractory}
                  onChange={onSlider}
                  className="h-2 w-full cursor-pointer accent-rose-500"
                />
              </label>
              <p className="text-base text-white/55">
                Drag on the sphere to pace a beat or drop an excitation — it can
                seed its own reentry.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Design notes */}
      <details className="pointer-events-auto absolute right-4 top-4 max-w-sm rounded-md border border-white/15 bg-black/50 p-3 font-mono text-white/75 backdrop-blur">
        <summary className="cursor-pointer text-base text-white/75">
          Design notes
        </summary>
        <p className="mt-2 text-base text-white/75">
          FitzHugh–Nagumo (Barkley reduction) excitable medium on a geodesic
          icosphere. Per vertex: excitation + recovery, diffusively coupled along
          mesh edges. An internal clock slowly varies refractoriness so waves
          self-organise: calm → rotor → fibrillation → self-termination, then
          re-seed. Listening regions convert passing wavefronts into a rhythmic
          pulse whose tempo tracks the local wave period. See the folder README
          for full mechanism and references (FitzHugh 1961; Nagumo 1962; Barkley
          1991; reentry &amp; spiral waves — Winfree).
        </p>
      </details>
    </main>
  );
}
