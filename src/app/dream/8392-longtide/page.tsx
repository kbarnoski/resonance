"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 8392 · Longtide
// "What if a Resonance piece were a 10-minute JOURNEY with real memory — a
//  flowing cosmic field you SEED and STEER, carried by granulated piano, that
//  at minute 8 plays your own earlier gestures back to you, transformed — so
//  minute 10 is unrecognisable from minute 1?"
//
// Flow-field take: ~22k CPU-advected points ride an analytic curl current;
// the granular piano FORCES the flow; seeds are persistent vortices that
// remember a phrase and, in the Recollection movement, are replayed back to
// you. Core three only + a self-contained Web Audio graph.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { LongtideSim } from "./sim";
import { LongtideAudio } from "./audio";
import { MemoryRing, VirtualTraveller, type Seed } from "./memory";
import {
  MOVEMENT_NAMES,
  MOVEMENT_SEC,
  JOURNEY_SEC,
  movementIndex,
} from "./util";
import { README } from "./readme-text";

const SEED_PITCHES = [0, 3, 5, 7, 10]; // semitone flavours for planted phrases

interface Recollection {
  active: boolean;
  seeds: Seed[];
  idx: number;
  startT: number;
  gap: number;
}

export default function LongtidePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);

  const simRef = useRef<LongtideSim | null>(null);
  const audioRef = useRef<LongtideAudio | null>(null);
  const ringRef = useRef<MemoryRing>(new MemoryRing());
  const travellerRef = useRef<VirtualTraveller>(new VirtualTraveller());
  const recollRef = useRef<Recollection>({
    active: false,
    seeds: [],
    idx: 0,
    startT: 0,
    gap: 4,
  });

  const flickerRef = useRef<ReturnType<typeof createSafeFlicker> | null>(null);
  const rafRef = useRef<number>(0);
  const startMsRef = useRef<number>(0);
  const lastMsRef = useRef<number>(0);
  const movementRef = useRef<number>(-1);
  const draggingRef = useRef<boolean>(false);

  const [glError, setGlError] = useState<string | null>(null);
  const [movementName, setMovementName] = useState<string>(MOVEMENT_NAMES[0]);
  const [showNotes, setShowNotes] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [carrierLabel, setCarrierLabel] = useState<string>("procedural piano");

  // ── plant a seed (memory + vortex + audio phrase capture) ──────────────────
  const plant = useCallback((ndcX: number, ndcY: number) => {
    const audio = audioRef.current;
    const sim = simRef.current;
    if (!audio) return;
    const t = (performance.now() - startMsRef.current) / 1000;
    const win = audio.plantSeed();
    const pitch = SEED_PITCHES[Math.floor(Math.random() * SEED_PITCHES.length)];
    const w = sim ? sim.worldAt(ndcX, ndcY) : { x: ndcX * 16, y: ndcY * 10, z: 0 };
    const seed = ringRef.current.add({
      x: w.x,
      y: w.y,
      z: w.z,
      t,
      intensity: 0.9,
      grainWindow: win,
      pitch,
    });
    sim?.addVortex(seed);
  }, []);

  const takeOver = useCallback(() => {
    travellerRef.current.retire();
    const audio = audioRef.current;
    if (audio && !audio.running) {
      void audio.start().then(() => setSoundOn(audio.running));
    }
  }, []);

  // ── main loop ──────────────────────────────────────────────────────────────
  const frame = useCallback(() => {
    const nowMs = performance.now();
    const dt = Math.min(0.05, (nowMs - lastMsRef.current) / 1000);
    lastMsRef.current = nowMs;
    const t = (nowMs - startMsRef.current) / 1000;

    const audio = audioRef.current;
    const sim = simRef.current;

    const m = movementIndex(t);
    if (m !== movementRef.current) {
      movementRef.current = m;
      setMovementName(MOVEMENT_NAMES[m]);
      audio?.setMovement(m);
      // reset recollection state on movement change
      if (m !== 3) recollRef.current.active = false;
    }

    // virtual traveller drives the arc until a human acts
    travellerRef.current.update(t, {
      plantAt: (x, y) => plant(x, y),
      steer: (x, y, s) => sim?.setSteer(x, y, s),
    });

    // audio scheduling + features
    audio?.tick();
    const feat = audio?.getFeatures() ?? { amp: 0.2, centroid: 0.3 };

    // Recollection: replay earlier seeds, re-lighting each vortex in order
    if (m === 3) {
      const rc = recollRef.current;
      if (!rc.active) {
        const past = ringRef.current.before(t).slice();
        rc.active = true;
        rc.seeds = past;
        rc.idx = 0;
        rc.startT = t;
        rc.gap = Math.min(MOVEMENT_SEC / (past.length + 1), 4);
      }
      if (rc.idx < rc.seeds.length) {
        const due = rc.startT + (rc.idx + 1) * rc.gap;
        if (t >= due) {
          const seed = rc.seeds[rc.idx];
          audio?.recollectSeed(seed);
          sim?.relight(seed.id, 1.3);
          rc.idx++;
        }
      }
    }

    const lum = flickerRef.current ? flickerRef.current.value(t) : 1;
    sim?.step(dt, feat.amp, feat.centroid, m, t, lum);

    // progress line
    if (progressRef.current) {
      progressRef.current.style.width = `${Math.min(100, (t / JOURNEY_SEC) * 100)}%`;
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [plant]);

  // ── mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 0.4, floor: 0.62 });
    flicker.enable(); // slow luminance drift only
    flickerRef.current = flicker;

    // audio runs even if WebGL fails
    const audio = new LongtideAudio(reduced);
    audioRef.current = audio;
    void audio.start().then(() => setSoundOn(audio.running));

    // visuals (degrade gracefully)
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const sim = new LongtideSim(canvas, reduced);
        simRef.current = sim;
        const el = containerRef.current;
        if (el) sim.resize(el.clientWidth, el.clientHeight);
      } catch (err) {
        setGlError(
          "WebGL is unavailable, so the visual field can't render — but the audio journey still plays.",
        );
        console.warn("Longtide sim init failed:", err);
      }
    }

    startMsRef.current = performance.now();
    lastMsRef.current = startMsRef.current;
    rafRef.current = requestAnimationFrame(frame);

    // resume audio on the first gesture anywhere
    const onGesture = () => {
      void audio.start().then(() => setSoundOn(audio.running));
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    window.addEventListener("touchstart", onGesture, { passive: true });

    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el) simRef.current?.resize(el.clientWidth, el.clientHeight);
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
      ro.disconnect();
      simRef.current?.dispose();
      simRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [frame]);

  // ── input handlers ──────────────────────────────────────────────────────────
  const ndcFromEvent = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * 2 - 1,
      y: -(((clientY - r.top) / r.height) * 2 - 1),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    takeOver();
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const n = ndcFromEvent(e.clientX, e.clientY);
    plant(n.x, n.y);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const n = ndcFromEvent(e.clientX, e.clientY);
    simRef.current?.setSteer(n.x, n.y, 0.85);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const jumpMovement = useCallback((i: number) => {
    // shift the whole clock so t lands just inside movement i
    const target = i * MOVEMENT_SEC + 0.5;
    startMsRef.current = performance.now() - target * 1000;
    movementRef.current = -1; // force re-eval next frame
  }, []);

  const reset = useCallback(() => {
    ringRef.current.clear();
    simRef.current?.clearVortices();
    recollRef.current.active = false;
    travellerRef.current = new VirtualTraveller();
    startMsRef.current = performance.now();
    lastMsRef.current = startMsRef.current;
    movementRef.current = -1;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        takeOver();
        plant(0, 0); // reticle = screen centre
      } else if (e.key >= "1" && e.key <= "5") {
        takeOver();
        jumpMovement(Number(e.key) - 1);
      } else if (e.key === "r" || e.key === "R") {
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plant, takeOver, jumpMovement, reset]);

  // ── file-drop carrier ────────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    file.arrayBuffer().then((buf) => {
      audioRef.current
        ?.loadCarrier(buf)
        .then(() => setCarrierLabel(file.name))
        .catch(() => setCarrierLabel("could not decode file"));
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-screen w-screen overflow-hidden bg-background"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* reticle */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <div className="h-5 w-5 rounded-full border border-foreground/20" />
      </div>

      {/* header: movement + progress */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[70vw]">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Longtide · Movement
        </div>
        <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {movementName}
        </div>
        <div className="mt-3 h-px w-56 max-w-[70vw] bg-border">
          <div ref={progressRef} className="h-px bg-primary" style={{ width: "0%" }} />
        </div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          carrier: {carrierLabel}
        </div>
      </div>

      {/* controls hint */}
      <div className="pointer-events-none absolute bottom-16 left-4 z-20 text-base text-muted-foreground">
        <p className="max-w-xs">
          Drag to seed &amp; steer the current · Space plants at the reticle ·
          1–5 jump movement · R resets.
        </p>
      </div>

      {/* right-side actions */}
      <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
        {!soundOn && (
          <button
            onClick={takeOver}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tap for sound
          </button>
        )}
        <div
          className={`rounded-md border px-4 py-2 text-xs transition-colors ${
            dragOver
              ? "border-primary text-foreground"
              : "border-border bg-background/60 text-muted-foreground"
          }`}
        >
          Drop a piano recording (.wav/.mp3/.m4a)
        </div>
      </div>

      {glError && (
        <div className="absolute inset-x-0 top-1/3 z-20 mx-auto max-w-md px-6 text-center text-sm text-destructive">
          {glError}
        </div>
      )}

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Longtide — design notes
            </h2>
            <pre className="mt-4 max-h-[60vh] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
              {README}
            </pre>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8392-longtide"]} />
    </div>
  );
}
