"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  drawVoid,
  makeScene,
  makeVoidField,
  stepVoid,
  type Scene,
  type VoidField,
} from "./void";
import { makeVoidAudio, type VoidAudio } from "./audio";

/* time dilation: stretch the whole clock slow → weightless, dilated time. */
const TIME_SCALE = 0.6;

type Phase = "idle" | "running";
type InputMode = "drag" | "tilt";

/** Non-standard iOS gate for DeviceOrientation, feature-detected via a typed
 *  cast rather than @ts-ignore. */
interface DeviceOrientationPermissionAPI {
  requestPermission?: () => Promise<"granted" | "denied">;
}

export default function DissolveVoidPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [inputMode, setInputMode] = useState<InputMode>("drag");
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<VoidField | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const audioRef = useRef<VoidAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

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
    // ease the control back toward centre so the void slowly drifts home
    const field = fieldRef.current;
    if (field) {
      field.control.x *= 0.5;
      field.control.y *= 0.5;
    }
  }, []);

  /* ── the single render loop: one clock → desync engine → draw + audio ─ */
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

      // audio gets the SAME raw control stream + arc state, applies its OWN lag
      audioRef.current?.update(
        field.control.x,
        field.control.y,
        field.arc.depth,
        field.arc.clarity,
        TIME_SCALE,
      );
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

    // audio (best-effort; visuals run regardless)
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeVoidAudio(ac, 0.16);
    } catch {
      setError("Audio could not start — the void drifts on, silently.");
    }

    // device orientation: iOS needs an explicit permission request on tap
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
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {/* corner UI */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="font-mono text-2xl tracking-tight text-foreground sm:text-3xl">
          Dissolve · Void
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          What you do, what you see, and what you hear gently come un-bound — a
          drifting luminous void where the link between motion, image and sound
          dissolves, then snaps clear once before the soft return.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" && (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-black transition hover:bg-card"
            >
              Enter the void
            </button>
          )}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            className="min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 font-mono text-base text-muted-foreground backdrop-blur transition hover:bg-black/60"
          >
            {notesOpen ? "close notes" : "design notes"}
          </button>
        </div>

        {phase === "idle" && (
          <p className="mt-3 font-mono text-base text-muted-foreground">
            tap to begin — sound + visuals start together
          </p>
        )}
        {phase === "running" && (
          <p className="mt-3 font-mono text-base text-muted-foreground">
            {inputMode === "tilt"
              ? "tilt your phone to float — the image and sound trail your hand"
              : "drag anywhere to float — the image and sound trail your hand"}
          </p>
        )}
        {error && (
          <p className="mt-2 font-mono text-base text-violet-300">{error}</p>
        )}
      </div>

      {/* design notes panel */}
      {notesOpen && (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto border-t border-border bg-black/90 p-5 backdrop-blur-md sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-auto sm:max-w-md sm:rounded-2xl sm:border">
          <h2 className="font-mono text-xl text-foreground">Design notes</h2>
          <p className="mt-2 text-base leading-relaxed text-foreground">
            This is the dream lab&apos;s first <em>audio-visual desync engine</em>.
            Normally your motion, the image and the sound are bound together. Here
            they are deliberately un-bound: your tilt/drag is the ground truth, the
            visual camera follows it through a slowly-modulating lag, and the audio
            follows it through a <em>different</em> lag — so cause and effect feel
            unglued.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Across the ~4.5-minute arc the binding loosens toward a peak, then a
            brief <em>clarity snap</em> re-syncs and brightens everything (the
            end-of-arc gamma surge) before a soft return. Five sound motes float
            around you in 3D via HRTF spatial audio.
          </p>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Grounded in Bera, Looger, Proekt &amp; Cichon, &ldquo;Cortical
            Mechanisms Contributing to Ketamine-Induced Dissociation&rdquo; (The
            Neuroscientist, 2026): a defining feature of the dissociated brain
            state is the uncoupling of sensory input from conscious awareness and
            altered sensory-motor coupling (NMDA-receptor blockade →
            thalamocortical disconnection). The desync engine literally enacts that
            finding.
          </p>
          <p className="mt-3 font-mono text-base text-muted-foreground">
            see README.md in this prototype&apos;s folder for full references.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["1063-dissolve-void"]} />
    </main>
  );
}
