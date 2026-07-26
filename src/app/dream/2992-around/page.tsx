"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ChoirEngine } from "./synth";
import { drawScene } from "./viz";
import {
  mulberry32,
  makeDemoOrbs,
  makeOrb,
  poseAt,
  prominence,
  radarGeom,
  radarToPlacement,
  ELEV_MAX,
  type Orb,
  type Pose,
} from "./spatial";

const SEED = 0x2992;
const DEMO_VOICES = 4;
const MAX_VOICES = 9;

type Mode = "place" | "look";

export default function AroundPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [audioLive, setAudioLive] = useState(false);
  const [mode, setMode] = useState<Mode>("place");
  const [elevDeg, setElevDeg] = useState(0);
  const [voiceCount, setVoiceCount] = useState(0);
  const [loudest, setLoudest] = useState<{ hz: number; dist: number } | null>(
    null,
  );
  const [orientationOn, setOrientationOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // Live state shared with the rAF loop.
  const engineRef = useRef<ChoirEngine | null>(null);
  const orbsRef = useRef<Orb[]>([]);
  const randRef = useRef<() => number>(mulberry32(SEED));
  const nextIdRef = useRef(0);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const elevRef = useRef(0);
  const modeRef = useRef<Mode>("place");
  const reduceRef = useRef(false);
  const startTimeRef = useRef(0);
  const loudestIdRef = useRef<number | null>(null);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const orientRef = useRef<{
    handler: ((e: DeviceOrientationEvent) => void) | null;
    base: number | null;
  }>({ handler: null, base: null });

  useEffect(() => {
    modeRef.current = mode;
    dragRef.current.active = false;
  }, [mode]);

  useEffect(() => {
    elevRef.current = (elevDeg / 60) * ELEV_MAX;
  }, [elevDeg]);

  // Add a voice to both the model and (if running) the audio graph.
  const spawnOrb = useCallback((azimuth: number, distance: number) => {
    const t = (performance.now() - startTimeRef.current) / 1000;
    const orb = makeOrb(
      nextIdRef.current++,
      azimuth,
      distance,
      elevRef.current,
      randRef.current,
      reduceRef.current ? 0.28 : 1,
    );
    const next = [...orbsRef.current, orb];
    // Cap the choir — retire the oldest voice if we overflow.
    while (next.length > MAX_VOICES) {
      const gone = next.shift()!;
      engineRef.current?.removeVoice(gone.id);
    }
    orbsRef.current = next;
    setVoiceCount(next.length);
    engineRef.current?.addVoice(poseAt(orb, t));
  }, []);

  const clearOrbs = useCallback(() => {
    for (const o of orbsRef.current) engineRef.current?.removeVoice(o.id);
    orbsRef.current = [];
    setVoiceCount(0);
    setLoudest(null);
    loudestIdRef.current = null;
  }, []);

  // --- Start audio (must be inside a user gesture) ----------------------
  const startAudio = useCallback(async () => {
    if (engineRef.current) return;
    try {
      const engine = new ChoirEngine();
      engineRef.current = engine;
      const t = (performance.now() - startTimeRef.current) / 1000;
      for (const o of orbsRef.current) engine.addVoice(poseAt(o, t));
      await engine.resume();
      setAudioLive(true);
    } catch {
      setError(
        "Web Audio would not open here — the orrery still turns on screen, in silence.",
      );
    }
  }, []);

  // --- Device orientation (bonus) ---------------------------------------
  const enableOrientation = useCallback(async () => {
    const DOE = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<PermissionState>;
        })
      | undefined;
    if (!DOE) {
      setError("This device exposes no orientation sensor — use drag to look.");
      return;
    }
    try {
      if (typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res !== "granted") {
          setError("Orientation permission declined — drag to look instead.");
          return;
        }
      }
    } catch {
      setError("Orientation permission declined — drag to look instead.");
      return;
    }
    const handler = (e: DeviceOrientationEvent) => {
      if (e.alpha == null) return;
      const alpha = (e.alpha * Math.PI) / 180;
      if (orientRef.current.base == null) orientRef.current.base = alpha;
      yawRef.current = -(alpha - orientRef.current.base);
      const beta = ((e.beta ?? 0) * Math.PI) / 180;
      pitchRef.current = Math.max(-0.7, Math.min(0.7, beta - Math.PI / 2 + 0.3));
    };
    orientRef.current.handler = handler;
    window.addEventListener("deviceorientation", handler);
    setOrientationOn(true);
  }, []);

  // --- Pointer interaction ----------------------------------------------
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (modeRef.current === "look") {
        dragRef.current = { active: true, lastX: px, lastY: py };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      const g = radarGeom(rect.width, rect.height);
      const { azimuth, distance } = radarToPlacement(px, py, g);
      spawnOrb(azimuth, distance);
    },
    [spawnOrb],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current.active) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const dx = px - dragRef.current.lastX;
      const dy = py - dragRef.current.lastY;
      dragRef.current.lastX = px;
      dragRef.current.lastY = py;
      yawRef.current += dx * 0.006;
      pitchRef.current = Math.max(
        -0.7,
        Math.min(0.7, pitchRef.current - dy * 0.004),
      );
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      dragRef.current.active = false;
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
    },
    [],
  );

  // --- Setup: seed demo, size canvas, run the render loop ---------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("This browser will not open a 2-D canvas.");
      return;
    }

    reduceRef.current =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    startTimeRef.current = performance.now();

    // Seed the deterministic demo choir.
    randRef.current = mulberry32(SEED);
    const demo = makeDemoOrbs(
      randRef.current,
      DEMO_VOICES,
      reduceRef.current ? 0.28 : 1,
    );
    orbsRef.current = demo;
    nextIdRef.current = demo.length;
    setVoiceCount(demo.length);

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = wrap.clientWidth;
      cssH = Math.round(Math.min(620, Math.max(420, cssW * 0.82)));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Alias the orientation ref so the cleanup reads it via a local binding.
    const orient = orientRef;

    let raf = 0;
    let frame = 0;
    const loop = (now: number) => {
      const t = (now - startTimeRef.current) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = radarGeom(cssW, cssH);

      const poses: Pose[] = orbsRef.current.map((o) => poseAt(o, t));
      const engine = engineRef.current;
      if (engine) {
        engine.setListener(yawRef.current, pitchRef.current);
        for (const p of poses) engine.updateVoice(p);
      }

      // Loudest / nearest voice.
      let best: Pose | null = null;
      let bestScore = -Infinity;
      for (const p of poses) {
        const s = prominence(p, yawRef.current);
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      loudestIdRef.current = best ? best.id : null;

      drawScene({
        ctx,
        w: cssW,
        h: cssH,
        g,
        poses,
        yaw: yawRef.current,
        loudestId: loudestIdRef.current,
        t,
        audioLive: !!engine,
        reduce: reduceRef.current,
      });

      // Throttle the React label update.
      if (frame % 12 === 0) {
        setLoudest(
          best ? { hz: best.freq, dist: best.distance } : null,
        );
      }
      frame++;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (orient.current.handler) {
        window.removeEventListener(
          "deviceorientation",
          orient.current.handler,
        );
        orient.current.handler = null;
      }
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-5 pb-24 pt-10 text-foreground">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream 2992 · binaural sound-sculpture
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Around
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Sculpt a living choir in the space around your head. Place sustained
          voices at real 3-D positions and hear them orbit you in true binaural
          space. Headphones strongly recommended — HRTF spatialisation is what
          makes a voice sweep past your left ear.
        </p>

        {/* Controls */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!audioLive ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start the choir
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              ● audio live
            </span>
          )}

          <div className="flex overflow-hidden rounded-md border border-border">
            {(["place", "look"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`min-h-[44px] px-4 text-sm transition-colors ${
                  mode === m
                    ? "bg-accent text-foreground"
                    : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {m === "place" ? "Place" : "Look"}
              </button>
            ))}
          </div>

          <button
            onClick={clearOrbs}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>

          <button
            onClick={enableOrientation}
            disabled={orientationOn}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {orientationOn ? "Head-tracking on" : "Use device tilt"}
          </button>

          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* Elevation slider */}
        <div className="mt-4 flex items-center gap-3">
          <label
            htmlFor="elev"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
          >
            Placement elevation
          </label>
          <input
            id="elev"
            type="range"
            min={-60}
            max={60}
            value={elevDeg}
            onChange={(e) => setElevDeg(Number(e.target.value))}
            className="h-1 w-48 cursor-pointer accent-primary"
          />
          <span className="w-16 text-sm text-muted-foreground">
            {elevDeg > 0 ? "+" : ""}
            {elevDeg}°
          </span>
        </div>

        {/* Canvas */}
        <div ref={wrapRef} className="mt-6 w-full">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-full touch-none rounded-lg border border-border"
            style={{ cursor: mode === "place" ? "crosshair" : "grab" }}
          />
        </div>

        {/* Status line */}
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span>
            Voices: <span className="text-foreground">{voiceCount}</span> /{" "}
            {MAX_VOICES}
          </span>
          <span>
            Loudest:{" "}
            <span className="text-foreground">
              {loudest
                ? `${loudest.hz.toFixed(1)} Hz · ${loudest.dist.toFixed(1)} m`
                : "—"}
            </span>
          </span>
          <span>
            Mode:{" "}
            <span className="text-foreground">
              {mode === "place" ? "click to place a voice" : "drag to look around"}
            </span>
          </span>
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Around — design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              A binaural sound-sculpture room. You sit at the origin; each
              voice you place is a sustained additive drone at a continuous
              pitch (never snapped to a scale), rendered through its own HRTF
              PannerNode so it lives at a genuine 3-D position and orbits you.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">How to use:</span> press Start,
              then in Place mode click the radar — angle from centre sets
              azimuth, distance from centre sets how far the voice sits, and the
              elevation slider lifts it above or below your ears. Switch to Look
              mode (or enable device tilt) to turn your head and hear the whole
              field rotate.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">References:</span> Web Audio
              HRTF PannerNode &amp; AudioListener; Jens Blauert,{" "}
              <span className="italic">Spatial Hearing</span> (HRTF localization
              cues); and the 2026 spatial-audio frontier — AudioMiXR 6-DoF
              spatial audio object manipulation (arXiv:2502.02929).
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              <span className="text-foreground">Limitations:</span> HRTF is
              generic, so front/back and elevation cues vary by listener and are
              weak on speakers; the pitch↔position map is one interpretation,
              not physics; the radar shows a top-down world frame while the
              horizon band is facing-relative, which takes a moment to read.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2992-around"]} />
    </main>
  );
}
