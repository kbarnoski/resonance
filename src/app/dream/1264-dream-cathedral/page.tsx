"use client";

// ── 1264 · Dream Cathedral ──────────────────────────────────────────────────
// "What if Resonance were a SPACE you are INSIDE — a first-person hypnagogic
//  dream-cathedral you WALK through and PLAY by striking its surfaces, each
//  strike spatialized (HRTF) to where it happened?"
//
// INPUT  : WASD + pointer-lock mouselook (drag-to-look fallback) + click-to-strike
// OUTPUT : a real three.js scene-graph interior — a nave of plaster pillars,
//          arches, hanging chime-slabs and inlaid floor tiles you move through
// CORE   : struck modal resonators, each placed by its own HRTF PannerNode at
//          the world position of the strike — an instrument you PLAY, not a
//          readout — over a just-intonation drone in a cathedral reverb.
// VIBE   : de Chirico metaphysical architecture (bone plaster, cold teal light,
//          long shadows) meeting the endless corridors of sleep-onset.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CathedralScene } from "./scene";
import { CathedralAudio } from "./audio";

type Phase = "idle" | "entered";
type LookMode = "none" | "pointerlock" | "drag";

const SENS = 0.0022;

export default function DreamCathedralPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [glError, setGlError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lookMode, setLookMode] = useState<LookMode>("none");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CathedralScene | null>(null);
  const audioRef = useRef<CathedralAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const startRef = useRef(0);

  const phaseRef = useRef<Phase>("idle");
  const lockedRef = useRef(false);
  const lookModeRef = useRef<LookMode>("none");
  const dragRef = useRef<{ active: boolean; moved: number; x: number; y: number }>(
    { active: false, moved: 0, x: 0, y: 0 },
  );

  // ── strike helpers ──
  const strikeCenter = useCallback(() => {
    const scene = sceneRef.current;
    const audio = audioRef.current;
    if (!scene || !audio) return;
    const hit = scene.strikeAt(0, 0);
    if (hit) audio.strike(hit.freq, { x: hit.x, y: hit.y, z: hit.z }, 1);
  }, []);

  const strikeAtClient = useCallback((clientX: number, clientY: number) => {
    const scene = sceneRef.current;
    const audio = audioRef.current;
    const canvas = scene?.renderer.domElement;
    if (!scene || !audio || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = -(((clientY - r.top) / r.height) * 2 - 1);
    const hit = scene.strikeAt(ndcX, ndcY);
    if (hit) audio.strike(hit.freq, { x: hit.x, y: hit.y, z: hit.z }, 1);
  }, []);

  // ── build the scene once on mount; run a self-playing preview drift ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let scene: CathedralScene;
    try {
      scene = new CathedralScene(mount);
    } catch {
      setGlError(true);
      return;
    }
    sceneRef.current = scene;
    startRef.current = performance.now();
    lastRef.current = startRef.current;

    const loop = (t: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = Math.min(0.05, Math.max(0, (t - lastRef.current) / 1000));
      lastRef.current = t;
      const elapsed = (t - startRef.current) / 1000;
      const s = sceneRef.current;
      if (!s) return;
      s.update(dt, elapsed);
      const a = audioRef.current;
      if (a) {
        a.tick(dt);
        a.setListenerPose(s.getListenerPose());
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ── keyboard (movement) ──
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== "entered") return;
      const codes = [
        "KeyW", "KeyA", "KeyS", "KeyD",
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space",
      ];
      if (codes.includes(e.code)) e.preventDefault();
      if (e.code === "Space") {
        strikeCenter();
        return;
      }
      sceneRef.current?.setKey(e.code, true);
    };
    const onUp = (e: KeyboardEvent) => {
      sceneRef.current?.setKey(e.code, false);
    };
    const onBlur = () => sceneRef.current?.clearKeys();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [strikeCenter]);

  // ── mouse look (pointer lock movement + drag fallback) + strike ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (lockedRef.current) {
        sceneRef.current?.applyLook(e.movementX * SENS, e.movementY * SENS);
      } else if (dragRef.current.active) {
        sceneRef.current?.applyLook(e.movementX * SENS, e.movementY * SENS);
        dragRef.current.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (phaseRef.current !== "entered") return;
      if (lockedRef.current) return; // click handled on click event
      // drag-to-look fallback: begin a drag, decide strike vs look on mouseup
      dragRef.current = { active: true, moved: 0, x: e.clientX, y: e.clientY };
    };
    const onUp = (e: MouseEvent) => {
      const d = dragRef.current;
      if (d.active) {
        d.active = false;
        if (d.moved < 6) strikeAtClient(e.clientX, e.clientY);
      }
    };
    const onClick = () => {
      if (phaseRef.current !== "entered") return;
      if (lockedRef.current) strikeCenter();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("click", onClick);
    };
  }, [strikeCenter, strikeAtClient]);

  // ── pointer-lock state ──
  useEffect(() => {
    const onChange = () => {
      const canvas = sceneRef.current?.renderer.domElement;
      const isLocked = !!canvas && document.pointerLockElement === canvas;
      lockedRef.current = isLocked;
      setLocked(isLocked);
      if (!isLocked) sceneRef.current?.clearKeys();
    };
    const onErr = () => {
      lookModeRef.current = "drag";
      setLookMode("drag");
      setNotice("Pointer lock was blocked — drag anywhere to look around instead.");
    };
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onErr);
    return () => {
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onErr);
    };
  }, []);

  const requestLock = useCallback(() => {
    const canvas = sceneRef.current?.renderer.domElement;
    if (!canvas) return;
    if (typeof canvas.requestPointerLock !== "function") {
      lookModeRef.current = "drag";
      setLookMode("drag");
      return;
    }
    try {
      const maybe = canvas.requestPointerLock() as unknown as Promise<void> | void;
      if (maybe && typeof (maybe as Promise<void>).catch === "function") {
        (maybe as Promise<void>).catch(() => {
          lookModeRef.current = "drag";
          setLookMode("drag");
        });
      }
    } catch {
      lookModeRef.current = "drag";
      setLookMode("drag");
    }
  }, []);

  // ── enter: start audio inside the gesture, engage controls ──
  const enter = useCallback(async () => {
    if (glError || phaseRef.current === "entered") return;
    const audio = new CathedralAudio();
    audioRef.current = audio;
    await audio.resume();
    phaseRef.current = "entered";
    setPhase("entered");
    sceneRef.current?.setPreview(false);
    lookModeRef.current = "pointerlock";
    setLookMode("pointerlock");
    requestLock();
  }, [glError, requestLock]);

  const resume = useCallback(() => {
    if (lookModeRef.current === "drag") return;
    requestLock();
  }, [requestLock]);

  const entered = phase === "entered";
  const showResume = entered && lookMode === "pointerlock" && !locked;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#a9bab7] text-foreground select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {/* crosshair (only while actively looking) */}
      {entered && (locked || lookMode === "drag") && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-4 w-4 rounded-full border border-border bg-muted" />
        </div>
      )}

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            WebGL is unavailable in this browser, so the dream cathedral
            can&apos;t render. Try a hardware-accelerated browser to walk the
            nave.
          </p>
        </div>
      )}

      {/* title + brief (idle) */}
      {!entered && !glError && (
        <div className="pointer-events-none absolute left-0 top-0 p-6 sm:p-9">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)] sm:text-4xl">
            Dream Cathedral
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
            Step inside a first-person dream-architecture you walk with WASD and
            play by striking its surfaces. Each strike is spatialized to where
            it happened — the pillar you hit rings from the pillar.
          </p>
        </div>
      )}

      {/* Enter */}
      {!entered && !glError && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 sm:items-center sm:pb-0">
          <button
            onClick={enter}
            className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-black/30 px-6 py-3 font-serif text-xl font-medium text-foreground backdrop-blur-md transition-colors hover:bg-black/45"
          >
            Enter the cathedral ▸
          </button>
        </div>
      )}

      {/* HUD while inside */}
      {entered && (
        <div className="pointer-events-none absolute bottom-4 left-4 max-w-xs text-base text-muted-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
          <p>
            {lookMode === "drag"
              ? "Drag to look · WASD to walk · click a surface to strike it"
              : "Mouse to look · WASD to walk · click a surface to strike it"}
          </p>
        </div>
      )}

      {/* resume overlay when pointer lock drops (Esc) */}
      {showResume && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
          <button
            onClick={resume}
            className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-black/40 px-6 py-3 font-serif text-xl text-foreground transition-colors hover:bg-black/55"
          >
            Click to keep walking
          </button>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 w-[min(90vw,40rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-violet-300 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
            {notice}
          </p>
        </div>
      )}

      {/* design notes */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-4 w-[min(92vw,32rem)] rounded-xl border border-border bg-black/85 p-5 backdrop-blur-md">
          <h2 className="font-serif text-xl font-semibold text-foreground">
            Design notes
          </h2>
          <p className="mt-3 text-base leading-relaxed text-foreground">
            A real three.js scene-graph you walk in first person. Every surface
            you strike is a physically-modelled modal resonator (a small bank of
            mildly-inharmonic partials, each with its own decay) placed in 3D by
            its own HRTF PannerNode at the world position of the strike — so the
            sound arrives from where you hit it. Pillars, arches, chime-slabs and
            floor tiles are tuned to just-intonation A Dorian, so walking the
            nave and striking builds real modal harmony over a slow drone in a
            cathedral reverb. The colonnade recycles endlessly and the low sun
            crawls, so the long de Chirico shadows never stop reconfiguring.
          </p>
          <Link
            href="/dream/1264-dream-cathedral"
            className="mt-3 inline-block text-base text-violet-300 hover:text-violet-200"
          >
            README →
          </Link>
        </div>
      )}
    </main>
  );
}
