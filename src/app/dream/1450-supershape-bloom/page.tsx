"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  makeMesh,
  computeMesh,
  cloneParams,
  lerpParams,
  PRESETS,
  type SuperParams,
} from "./superformula";
import {
  makeRig,
  mat4Perspective,
  mat4LookAt,
  mat4Multiply,
  mat4RotateX,
  mat4RotateY,
  mat4Scale,
  type Rig,
  type Vec3,
} from "./renderer";
import { makeShapeAudio, inharmonicity, type ShapeAudio } from "./audio";

const RES_U = 120;
const RES_V = 120;
const IDLE_MS = 2000;

type Phase = "idle" | "running" | "nogl";

// deterministic idle tour through the organism zoo
const TOUR = [0, 4, 2, 6, 1, 3, 7, 5];

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ name: "Starfish", m1: 5, m2: 5, inh: 0 });

  // mutable engine state kept out of React render
  const rigRef = useRef<Rig | null>(null);
  const audioRef = useRef<ShapeAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const paramsRef = useRef<SuperParams>(cloneParams(PRESETS[0].p));
  const tourTargetRef = useRef<SuperParams>(cloneParams(PRESETS[0].p));
  const tourFromRef = useRef<SuperParams>(cloneParams(PRESETS[0].p));
  const nameRef = useRef<string>(PRESETS[0].name);

  const scaleRef = useRef(1);
  const hueRef = useRef(0);
  const yawRef = useRef(0);
  const pitchRef = useRef(0.3);
  const orbitYawRef = useRef(0);
  const orbitPitchRef = useRef(0);
  const glowRef = useRef(0);

  const elapsedRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const lastInteractRef = useRef(0);
  const tourIdxRef = useRef(0);
  const tourPhaseRef = useRef(0); // 0..1 across a morph
  const reducedRef = useRef(false);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const dragModeRef = useRef<"morph" | "orbit" | null>(null);

  const meshRef = useRef(makeMesh(RES_U, RES_V));

  // ── apply a named preset (keyboard convenience) ──────────────────────────
  const applyPreset = useCallback((i: number) => {
    const pr = PRESETS[i % PRESETS.length];
    paramsRef.current = cloneParams(pr.p);
    nameRef.current = pr.name;
    lastInteractRef.current = elapsedRef.current;
  }, []);

  // ── the render / physics loop ────────────────────────────────────────────
  const runFrame = useCallback((ts: number) => {
    if (!runningRef.current) return;
    const rig = rigRef.current;
    if (!rig) return;

    if (lastTsRef.current == null) lastTsRef.current = ts;
    let dt = (ts - lastTsRef.current) / 1000;
    lastTsRef.current = ts;
    if (dt > 0.1) dt = 0.1; // clamp big gaps (tab switch)
    elapsedRef.current += dt;

    const reduced = reducedRef.current;
    const p = paramsRef.current;

    // idle self-demo: slowly morph through the tour after ~2s untouched
    const idle = elapsedRef.current - lastInteractRef.current > IDLE_MS / 1000;
    if (idle && !reduced) {
      tourPhaseRef.current += dt * 0.12;
      if (tourPhaseRef.current >= 1) {
        tourPhaseRef.current = 0;
        tourFromRef.current = cloneParams(tourTargetRef.current);
        tourIdxRef.current = (tourIdxRef.current + 1) % TOUR.length;
        const nxt = PRESETS[TOUR[tourIdxRef.current]];
        tourTargetRef.current = cloneParams(nxt.p);
        nameRef.current = nxt.name;
      }
      const s = tourPhaseRef.current;
      const smooth = s * s * (3 - 2 * s);
      lerpParams(tourFromRef.current, tourTargetRef.current, smooth, p);
    }
    // reduced-motion + idle: hold the current calm bloom, no auto-morph

    // camera: gentle auto-yaw (frozen slow if reduced) + user orbit
    const autoRate = reduced ? 0.03 : 0.12;
    yawRef.current += dt * autoRate;
    hueRef.current = (hueRef.current + dt * (reduced ? 0.004 : 0.012)) % 1;

    // rebuild geometry from the live parameters
    const mesh = meshRef.current;
    const maxExt = computeMesh(mesh, p);
    const targetScale = 1.5 / maxExt;
    scaleRef.current += (targetScale - scaleRef.current) * Math.min(1, dt * 4);
    rig.upload(mesh.positions, mesh.normals);

    // bloom scalar from roundness (higher n = rounder / bloomed)
    const avgN = (p.n1a + p.n2a + p.n3a + p.n1b + p.n2b + p.n3b) / 6;
    const bloom = clamp((avgN - 0.3) / 3, 0, 1);

    // audio follows the shape
    const audio = audioRef.current;
    if (audio) {
      audio.update(p.m1, p.m2, bloom);
      glowRef.current += (audio.level() - glowRef.current) * Math.min(1, dt * 3);
    }

    // matrices
    const canvas = rig.gl.canvas as HTMLCanvasElement;
    const aspect = canvas.width / Math.max(1, canvas.height);
    const proj = mat4Perspective((50 * Math.PI) / 180, aspect, 0.05, 100);
    const eye: Vec3 = [0, 0, 3.4];
    const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
    const rotY = mat4RotateY(yawRef.current + orbitYawRef.current);
    const rotX = mat4RotateX(pitchRef.current + orbitPitchRef.current);
    const model = mat4Multiply(
      mat4Multiply(rotY, rotX),
      mat4Scale(scaleRef.current),
    );

    rig.draw({
      proj,
      view,
      model,
      eye,
      light: [0.5, 0.7, 0.9],
      hue: hueRef.current,
      bloom,
      glow: glowRef.current,
    });

    // throttle React readout updates (~5/s)
    if (Math.floor(elapsedRef.current * 5) !== Math.floor((elapsedRef.current - dt) * 5)) {
      setReadout({
        name: nameRef.current,
        m1: Math.round(p.m1 * 10) / 10,
        m2: Math.round(p.m2 * 10) / 10,
        inh: Math.round(inharmonicity(p.m1) * 100) / 100,
      });
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── resize handling ──────────────────────────────────────────────────────
  const applyResize = useCallback(() => {
    const rig = rigRef.current;
    const canvas = canvasRef.current;
    if (!rig || !canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    rig.resize(w, h, dpr);
  }, []);

  // ── begin (gesture-gated audio + GL) ─────────────────────────────────────
  const begin = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    reducedRef.current = prefersReducedMotion();

    const rig = makeRig(canvas, meshRef.current);
    if (!rig) {
      setPhase("nogl");
      return;
    }
    rigRef.current = rig;

    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      if (ac.state === "suspended") ac.resume().catch(() => {});
      audioRef.current = makeShapeAudio(ac, 0.2);
    } catch {
      audioRef.current = null;
    }

    // seed the idle tour so it is deterministic from the first idle
    tourIdxRef.current = 0;
    tourFromRef.current = cloneParams(PRESETS[TOUR[0]].p);
    tourTargetRef.current = cloneParams(PRESETS[TOUR[1]].p);
    paramsRef.current = cloneParams(PRESETS[TOUR[0]].p);
    nameRef.current = PRESETS[TOUR[0]].name;

    setPhase("running");
    runningRef.current = true;
    lastTsRef.current = null;
    lastInteractRef.current = elapsedRef.current;
    applyResize();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [applyResize, runFrame]);

  // ── teardown ─────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioRef.current) {
      audioRef.current.stop();
      audioRef.current = null;
    }
    if (rigRef.current) {
      rigRef.current.dispose();
      rigRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => applyResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase, applyResize]);

  // ── keyboard: preset jump + space auto-morph ─────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "8") {
        applyPreset(Number(e.key) - 1);
      } else if (e.key === " ") {
        e.preventDefault();
        // nudge idle timer to the past → immediately re-enter the auto tour
        lastInteractRef.current = elapsedRef.current - IDLE_MS / 1000 - 1;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, applyPreset]);

  // ── pointer play surface ─────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const map = pointersRef.current;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (map.size >= 2) dragModeRef.current = "orbit";
    else dragModeRef.current = e.shiftKey ? "orbit" : "morph";
    lastInteractRef.current = elapsedRef.current;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const map = pointersRef.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInteractRef.current = elapsedRef.current;

    const mode = map.size >= 2 ? "orbit" : dragModeRef.current ?? "morph";
    if (mode === "orbit") {
      orbitYawRef.current += dx * 0.006;
      orbitPitchRef.current = clamp(orbitPitchRef.current + dy * 0.006, -1.3, 1.3);
      return;
    }

    // MORPH: horizontal → symmetry (m), vertical → roundness (n pinch↔bloom)
    const p = paramsRef.current;
    const dm = dx * 0.03;
    p.m1 = clamp(p.m1 + dm, 0, 24);
    p.m2 = clamp(p.m2 + dm * 0.6, 0, 24);
    const dn = -dy * 0.012; // drag up = pinch (lower n), drag down = bloom
    p.n1a = clamp(p.n1a + dn, 0.12, 8);
    p.n2a = clamp(p.n2a + dn * 0.8, 0.12, 8);
    p.n3a = clamp(p.n3a + dn * 0.8, 0.12, 8);
    p.n1b = clamp(p.n1b + dn * 0.7, 0.12, 8);
    p.n2b = clamp(p.n2b + dn * 0.6, 0.12, 8);
    p.n3b = clamp(p.n3b + dn * 0.6, 0.12, 8);
    nameRef.current = "You";
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const map = pointersRef.current;
    map.delete(e.pointerId);
    if (map.size === 0) dragModeRef.current = null;
    lastInteractRef.current = elapsedRef.current;
  }, []);

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#050508] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        onPointerDown={phase === "running" ? onPointerDown : undefined}
        onPointerMove={phase === "running" ? onPointerMove : undefined}
        onPointerUp={phase === "running" ? onPointerUp : undefined}
        onPointerCancel={phase === "running" ? onPointerUp : undefined}
      />

      {/* start / notice overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-black/70 via-black/60 to-black/80 px-6">
          <div className="max-w-xl text-center">
            <h1 className="font-semibold text-3xl text-foreground sm:text-4xl">
              Supershape Bloom
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              Reach into the equation behind natural form and play the whole
              morphospace of alien organisms as an instrument. Drag to morph the
              creature; each shape rings its own chord.
            </p>
            {phase === "nogl" ? (
              <p className="mt-6 text-base text-violet-300">
                This device could not open a WebGL2 context, so the supershape
                cannot be drawn. Try a recent desktop or mobile browser.
              </p>
            ) : (
              <button
                type="button"
                onClick={begin}
                className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-400"
              >
                Bloom
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="mt-4 block w-full text-base text-violet-300 underline-offset-4 hover:underline"
            >
              {showNotes ? "Hide design notes" : "Design notes"}
            </button>
            {showNotes && (
              <div className="mt-4 max-h-[38vh] overflow-y-auto rounded-2xl border border-border bg-black/50 p-5 text-left text-base leading-relaxed text-muted-foreground">
                <p>
                  Built on the <span className="text-violet-300/95">Superformula</span>{" "}
                  (Johan Gielis, 2003), extended to a 3D{" "}
                  <span className="text-violet-300/95">supershape</span> as the
                  spherical product of two superformulas (Paul Bourke). A 120×120
                  parametric mesh is recomputed in JavaScript every frame and drawn
                  as a lit two-sided surface with an engraved wireframe sheen —
                  Ernst Haeckel&rsquo;s <em>Kunstformen der Natur</em> coming alive.
                </p>
                <p className="mt-3">
                  <span className="text-violet-300/95">m</span> is symmetry (lobe
                  count); <span className="text-violet-300/95">n1,n2,n3</span> are
                  roundness / pinch. Drag horizontally to change symmetry, vertically
                  to pinch or bloom. The <span className="text-violet-300/95">symmetry
                  number drives the audio spectrum</span>: integer/even m rings a
                  near-harmonic chord, prime or fractional m produces inharmonic,
                  beating partials that sound alien on purpose.
                </p>
                <p className="mt-3 text-muted-foreground">
                  All motion is slow and sub-Hz — no strobing. With reduced-motion
                  enabled the auto-tour freezes to a calm drift.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* live readout + hints while running */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-4 top-4 z-10 select-none">
            <div className="font-semibold text-2xl text-foreground">{readout.name}</div>
            <div className="mt-1 text-base text-muted-foreground">
              symmetry m1 <span className="text-violet-300/95">{readout.m1}</span> ·
              m2 <span className="text-violet-300/95">{readout.m2}</span>
            </div>
            <div className="text-base text-muted-foreground">
              inharmonicity{" "}
              <span className="text-violet-300">{readout.inh.toFixed(2)}</span>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 select-none px-4 text-center">
            <p className="text-base text-muted-foreground">
              drag = morph · two-finger / shift+drag = orbit · keys 1–8 = organisms
              · space = auto-tour
            </p>
          </div>
        </>
      )}

      <PrototypeNav slugs={["1450-supershape-bloom"]} />
    </main>
  );
}
