"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  drawVoid,
  makeScene,
  makeVoidField,
  phaseDiff,
  stepVoid,
  type Scene,
  type VoidField,
} from "./return";
import { makeReturnAudio, type ReturnAudio } from "./audio";

/* time dilation: stretch the whole clock slow → weightless, dilated time. */
const TIME_SCALE = 0.6;

type Phase = "idle" | "running";
type InputMode = "drag" | "tilt";

/** Non-standard iOS gate for DeviceOrientation, feature-detected via a typed
 *  cast rather than @ts-ignore. */
interface DeviceOrientationPermissionAPI {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export default function DissolveReturnPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("drag");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<VoidField | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const audioRef = useRef<ReturnAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const lockedRef = useRef<boolean>(false);

  // pointer-drag state (desktop / fallback)
  const draggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    sizeRef.current = { w, h };
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#020308";
      ctx.fillRect(0, 0, w, h);
    }
  }, []);

  /* ── device tilt → raw control stream ──────────────────────────────── */
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const field = fieldRef.current;
    if (!field) return;
    const gx = Math.max(-1, Math.min(1, (e.gamma ?? 0) / 35));
    const gy = Math.max(-1, Math.min(1, ((e.beta ?? 0) - 35) / 35));
    field.control.x = gx;
    field.control.y = gy;
  }, []);

  /* ── pointer drag → raw control stream (desktop / fallback) ────────── */
  const onPointerDown = useCallback((e: PointerEvent) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onPointerMove = useCallback((e: PointerEvent) => {
    const field = fieldRef.current;
    if (!field || !draggingRef.current) return;
    const span = Math.min(window.innerWidth, window.innerHeight) * 0.5;
    const dx = (e.clientX - dragStartRef.current.x) / span;
    const dy = (e.clientY - dragStartRef.current.y) / span;
    field.control.x = Math.max(-1, Math.min(1, dx));
    field.control.y = Math.max(-1, Math.min(1, dy));
  }, []);
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    // releasing = letting the hand rest → stillness rises → coupling climbs.
  }, []);

  /* ── "let it settle": a coupling boost you can trigger by hand ──────── */
  const settle = useCallback(() => {
    const field = fieldRef.current;
    if (field) {
      field.settleAssist = 1;
      field.engaged = true;
    }
  }, []);

  /* ── the single render loop: one clock → Kuramoto → draw + audio ────── */
  const renderLoop = useCallback(() => {
    const field = fieldRef.current;
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    const now = performance.now();
    let dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-away
    const sdt = dt * TIME_SCALE;

    if (field && scene && canvas) {
      stepVoid(field, sdt);
      const ctx = canvas.getContext("2d");
      const { w, h } = sizeRef.current;
      if (ctx && w > 0) drawVoid(ctx, scene, field, w, h, sdt);

      // audio gets the SAME Kuramoto state: coherence r + the AUDIO/CONTROL
      // phase mismatch (drives the audible beat) + the lock bloom.
      const mis = Math.abs(phaseDiff(field.osc.theta[2], field.osc.theta[0]));
      audioRef.current?.update(
        field.control.x,
        field.control.y,
        field.osc.r,
        mis,
        field.osc.lock,
        field.arc.depth,
        TIME_SCALE,
      );

      // surface a small "locked" badge when the void fuses.
      const nowLocked = field.osc.lock > 0.6;
      if (nowLocked !== lockedRef.current) {
        lockedRef.current = nowLocked;
        setLocked(nowLocked);
      }
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  /* ── Start: unlock audio + request tilt permission, all in the gesture ─ */
  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    setError(null);

    fieldRef.current = makeVoidField();
    sceneRef.current = makeScene();
    resize();

    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeReturnAudio(ac, 0.16);
    } catch {
      setError("Audio could not start — the void drifts on, silently.");
    }

    let tilt = false;
    const DOE =
      typeof window !== "undefined"
        ? (window.DeviceOrientationEvent as unknown as
            | DeviceOrientationPermissionAPI
            | undefined)
        : undefined;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
          tilt = true;
        }
      } catch {
        /* denied / unavailable → pointer-drag fallback below */
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      window.addEventListener("deviceorientation", onOrient);
      tilt = true;
    }
    setInputMode(tilt ? "tilt" : "drag");

    lastTickRef.current = performance.now();
    setPhase("running");
  }, [phase, resize, onOrient]);

  /* ── kick the loop + listeners once running ────────────────────────── */
  useEffect(() => {
    if (phase !== "running") return;
    lastTickRef.current = performance.now();
    rafRef.current = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", resize);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [phase, renderLoop, resize, onPointerDown, onPointerMove, onPointerUp]);

  /* ── full teardown on unmount ──────────────────────────────────────── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 2000);
      }
      acRef.current = null;
    };
  }, [onOrient]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <canvas ref={canvasRef} className="fixed inset-0 h-full w-full touch-none" />

      {/* corner UI */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-serif text-2xl tracking-tight text-white/95 sm:text-3xl">
          Dissolve · Return
        </h1>
        <p className="mt-2 text-base leading-relaxed text-white/80">
          Your senses have come un-bound — motion, image and sound gliding out of
          phase. Hold still to <em>pull them back into one</em>, and watch and hear
          the moment they lock.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 backdrop-blur transition hover:bg-violet-500/30"
            >
              Enter the void
            </button>
          )}
          {phase === "running" && (
            <button
              onClick={settle}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 backdrop-blur transition hover:bg-violet-500/30"
            >
              Let it settle
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-full border border-white/20 bg-black/40 px-4 py-2.5 text-base text-white/75 backdrop-blur transition hover:bg-black/60"
          >
            {notesOpen ? "close notes" : "Read the design notes"}
          </button>
        </div>

        {phase === "idle" && (
          <p className="mt-3 text-base text-white/75">
            tap to begin — sound + visuals start together
          </p>
        )}
        {phase === "running" && (
          <p className="mt-3 text-base text-white/75">
            {inputMode === "tilt"
              ? "tilt to steer · hold the phone STILL to let the streams re-bind"
              : "drag to steer · release and be STILL to let the streams re-bind"}
          </p>
        )}
        {locked && (
          <p className="mt-2 text-base font-medium text-violet-300">
            ✦ bound — one coherent, hyper-lucid instant
          </p>
        )}
        {error && <p className="mt-2 text-base text-rose-300">{error}</p>}
      </div>

      {/* design notes panel */}
      {notesOpen && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-white/10 bg-black/90 p-5 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:max-w-md sm:rounded-2xl sm:border">
          <h2 className="text-xl text-white/95">Design notes</h2>
          <p className="mt-2 text-base leading-relaxed text-white/80">
            The three streams — your <em>control</em>, the <em>image</em> and the{" "}
            <em>sound</em> — are three coupled phase oscillators (the{" "}
            <em>Kuramoto model</em>). Early on the global coupling K is near zero,
            so they drift freely out of phase: a faint zero-lag &ldquo;ghost&rdquo;
            doubles beneath the lagged image, and a partial <em>beats</em> against
            the drone.
          </p>
          <p className="mt-3 text-base leading-relaxed text-white/75">
            You re-bind them by <em>settling</em>. Holding still raises the coupling
            K; the three phase-dots (bottom-right ring) converge, the doubling fuses
            to one crisp image, and the beat slows to <em>zero-beat</em> — a bright
            bloom as everything locks. This is binding-by-synchrony: a global
            gamma-band phase-lock as the substrate of one coherent percept.
          </p>
          <p className="mt-3 text-base leading-relaxed text-white/75">
            It deepens <em>1063 · Dissolve · Void</em>: that piece un-bound the
            senses and hid the re-sync in a single scripted flash. Here the
            re-binding is the star — modelled, participatory, and visibly/audibly
            legible.
          </p>
          <p className="mt-3 text-base text-white/55">
            see README.md in this prototype&apos;s folder for full references.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["1082-dissolve-return"]} />
    </main>
  );
}
