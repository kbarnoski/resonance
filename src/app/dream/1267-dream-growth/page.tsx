"use client";

// ── 1267 · Dream Growth ─────────────────────────────────────────────────────
// "What if the first-person dream-architecture you WALK and PLAY GREW around
//  your playing — every strike accretes new geometry near where and how you
//  played, so by minute five the endless corridors have reconfigured into a
//  space you BUILT, and the architecture itself is a record of your music?"
//
// The cycle-2 deepening of 1264 Dream Cathedral: a MORPHOGENETIC memory layer.
// You still walk (WASD + pointer-lock) a real three.js interior and strike its
// surfaces to ring HRTF-spatialized modal resonators over a JI drone — but now
// every strike GROWS the room: a pillar rises, an arch spans, a chime hangs,
// shaped by your pitch and tempo and biased toward your emerging mode.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GrowthScene } from "./scene";
import { GrowthAudio } from "./audio";
import { DEGREE_NAMES } from "./tuning";

type Phase = "idle" | "entered";
type LookMode = "none" | "pointerlock" | "drag";

const SENS = 0.0022;

export default function DreamGrowthPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [glError, setGlError] = useState(false);
  const [locked, setLocked] = useState(false);
  const [lookMode, setLookMode] = useState<LookMode>("none");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [grownCount, setGrownCount] = useState(0);
  const [emergingDeg, setEmergingDeg] = useState(-1);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GrowthScene | null>(null);
  const audioRef = useRef<GrowthAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const startRef = useRef(0);
  const hudRef = useRef(0);

  const phaseRef = useRef<Phase>("idle");
  const lockedRef = useRef(false);
  const lookModeRef = useRef<LookMode>("none");
  const dragRef = useRef<{ active: boolean; moved: number; x: number; y: number }>(
    { active: false, moved: 0, x: 0, y: 0 },
  );

  const strikeCenter = useCallback(() => {
    const scene = sceneRef.current;
    const audio = audioRef.current;
    if (!scene || !audio) return;
    const elapsed = (performance.now() - startRef.current) / 1000;
    const hit = scene.strikeAt(0, 0, elapsed);
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
    const elapsed = (performance.now() - startRef.current) / 1000;
    const hit = scene.strikeAt(ndcX, ndcY, elapsed);
    if (hit) audio.strike(hit.freq, { x: hit.x, y: hit.y, z: hit.z }, 1);
  }, []);

  // build the scene once on mount; run the self-playing preview drift
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let scene: GrowthScene;
    try {
      scene = new GrowthScene(mount);
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
      // throttled HUD readout
      if (t - hudRef.current > 400) {
        hudRef.current = t;
        setGrownCount(s.grownCount);
        setEmergingDeg(s.emergingDegree);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (document.pointerLockElement) {
        try { document.exitPointerLock(); } catch { /* ignore */ }
      }
      audioRef.current?.stop();
      audioRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // keyboard (movement + Space strike)
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
    const onUp = (e: KeyboardEvent) => sceneRef.current?.setKey(e.code, false);
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

  // mouse look (pointer lock + drag fallback) + strike
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
      if (lockedRef.current) return;
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

  // pointer-lock state
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

  const enter = useCallback(async () => {
    if (glError || phaseRef.current === "entered") return;
    const audio = new GrowthAudio();
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
  const modeLabel = emergingDeg >= 0 ? DEGREE_NAMES[emergingDeg] : "—";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#a9bab7] text-foreground select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {entered && (locked || lookMode === "drag") && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="h-4 w-4 rounded-full border border-border bg-muted" />
        </div>
      )}

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">
            WebGL is unavailable in this browser, so the growing dream-
            architecture can&apos;t render. Try a hardware-accelerated browser to
            walk and build the space.
          </p>
        </div>
      )}

      {!entered && !glError && (
        <div className="pointer-events-none absolute left-0 top-0 p-6 sm:p-9">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)] sm:text-4xl">
            Dream Growth
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.35)]">
            Walk a first-person dream-plaza and play it by striking its surfaces.
            Every strike grows the room — a pillar rises, an arch spans, a chime
            hangs — shaped by how you play. By minute five the empty ground has
            become a cathedral you built, and you can walk back through it to
            replay your own music.
          </p>
        </div>
      )}

      {!entered && !glError && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 sm:items-center sm:pb-0">
          <button
            onClick={enter}
            className="pointer-events-auto min-h-[44px] rounded-full border border-border bg-black/30 px-6 py-3 font-serif text-xl font-medium text-foreground backdrop-blur-md transition-colors hover:bg-black/45"
          >
            Enter and start building ▸
          </button>
        </div>
      )}

      {entered && (
        <div className="pointer-events-none absolute bottom-4 left-4 max-w-xs text-base text-muted-foreground drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
          <p>
            {lookMode === "drag"
              ? "Drag to look · WASD to walk · click a surface or the ground to strike + grow"
              : "Mouse to look · WASD to walk · click a surface or the ground to strike + grow"}
          </p>
        </div>
      )}

      {/* growth readout */}
      {entered && (
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg border border-border bg-black/40 px-4 py-2.5 text-right backdrop-blur-md">
          <p className="text-base font-medium text-foreground">{grownCount} grown</p>
          <p className="text-base text-muted-foreground">emerging mode · {modeLabel}</p>
        </div>
      )}

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

      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-foreground backdrop-blur-md transition-colors hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-4 w-[min(92vw,32rem)] rounded-xl border border-border bg-black/85 p-5 backdrop-blur-md">
          <h2 className="font-serif text-xl font-semibold text-foreground">Design notes</h2>
          <p className="mt-3 text-base leading-relaxed text-foreground">
            A real three.js interior you walk in first person. Each strike is a
            physically-modelled modal resonator (mildly-inharmonic partials, each
            with its own decay) placed in 3D by its own HRTF PannerNode at the
            world position of the strike. On top of that sits a morphogenetic
            memory layer: every strike accretes new instanced geometry near where
            and how you played — low, sparse notes grow a cavernous colonnade;
            high, dense notes grow a thicket of chimes; the middle grows arches
            that span to their neighbours. A running histogram of your degrees
            biases new tuning toward your emerging A-Dorian mode, so the space
            converges on your music. Old growth persists (pools are capped;
            the farthest element retires when full), so you can walk back through
            earlier structure and replay your own performance.
          </p>
          <Link
            href="/dream/1267-dream-growth"
            className="mt-3 inline-block text-base text-violet-300 hover:text-violet-200"
          >
            README →
          </Link>
        </div>
      )}
    </main>
  );
}
