"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { CrystalAudio } from "./audio";
import { CrystalScene } from "./scene";
import { mulberry32, SEED } from "./rng";

/**
 * 2264 · Crystal Bloom — a keyboard that grows a crystalline cathedral of light.
 *
 * PLAY the home row A S D F G H J K L (ascending C-Lydian degrees). Each key
 * sounds a glassy bell AND seeds a self-similar polyhedral cell that recursively
 * buds child cells outward; HOLD a key and its branch keeps proliferating; play
 * chords and several structures grow at once — structure ACCUMULATING into an
 * over-bright plenum. state: DMT / hyperspace · pole: intense / ecstatic-arrival.
 */

const KEY_ROW = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const KEY_LABELS = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
const NOTE_NAMES = ["C", "D", "E", "F♯", "G", "A", "B", "C", "D"];
const VELOCITY = 0.85;
const IDLE_RESUME = 7; // seconds of no input before the autopilot resumes

type Phase = "idle" | "running";

interface AutoEvent {
  t: number;
  type: "on" | "off";
  token: string;
  degree: number;
}

/** Build a deterministic ~15s C-Lydian phrase that builds toward a bright plenum. */
function makeAutopilot(): AutoEvent[] {
  const rand = mulberry32(SEED ^ 0x51ab);
  const events: AutoEvent[] = [];
  let t = 0.8;
  let id = 0;
  for (let i = 0; i < 15; i++) {
    const voices = 1 + Math.floor(rand() * (i > 7 ? 2.99 : 1.99)); // denser later
    const dur = 0.7 + rand() * 1.4 + i * 0.08; // longer holds later → more growth
    for (let v = 0; v < voices; v++) {
      const degree = Math.floor(rand() * 9);
      const token = `auto-${id++}`;
      events.push({ t, type: "on", token, degree });
      events.push({ t: t + dur, type: "off", token, degree });
    }
    t += 0.5 + rand() * 0.5;
  }
  events.sort((a, b) => a.t - b.t);
  return events;
}

export default function CrystalBloomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<CrystalScene | null>(null);
  const audioRef = useRef<CrystalAudio | null>(null);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.4, floor: 0.6 }));
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  // token → audio voice id, for release.
  const voiceRef = useRef<Map<string, number>>(new Map());

  // autopilot state (refs so the RAF loop reads the latest without re-binding).
  const autoEventsRef = useRef<AutoEvent[]>([]);
  const autoActiveRef = useRef(true);
  const autoStartRef = useRef<number | null>(null);
  const autoIdxRef = useRef(0);
  const autoTokensRef = useRef<Set<string>>(new Set());
  const lastInputRef = useRef(0);
  const userHeldRef = useRef<Set<string>>(new Set());
  const frameRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglError, setWebglError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [shimmer, setShimmer] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [density, setDensity] = useState(0);
  const [autoOn, setAutoOn] = useState(true);

  /* ------------------------- shared note plumbing ------------------------- */
  const spawn = useCallback((token: string, degree: number) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const t = performance.now() / 1000;
    scene.noteOn(token, degree, t);
    const audio = audioRef.current;
    if (audio) {
      const freq = audio.freqFor(degree, 0);
      const vid = audio.noteOn(freq, VELOCITY, scene.energy);
      voiceRef.current.set(token, vid);
    }
    setLit((prev) => {
      const next = new Set(prev);
      next.add(degree);
      return next;
    });
  }, []);

  const release = useCallback((token: string, degree: number) => {
    sceneRef.current?.noteOff(token);
    const audio = audioRef.current;
    const vid = voiceRef.current.get(token);
    if (audio && vid != null) audio.noteOff(vid);
    voiceRef.current.delete(token);
    setLit((prev) => {
      const next = new Set(prev);
      next.delete(degree);
      return next;
    });
  }, []);

  /* ----------------------------- autopilot -------------------------------- */
  const cancelAutopilot = useCallback(() => {
    if (!autoActiveRef.current && autoTokensRef.current.size === 0) return;
    autoActiveRef.current = false;
    setAutoOn(false);
    for (const token of autoTokensRef.current) {
      sceneRef.current?.noteOff(token);
      const vid = voiceRef.current.get(token);
      if (vid != null) audioRef.current?.noteOff(vid);
      voiceRef.current.delete(token);
    }
    autoTokensRef.current.clear();
    setLit(new Set());
  }, []);

  const runAutopilot = useCallback(
    (t: number) => {
      if (!autoActiveRef.current) {
        // Resume after the player has been idle for a while.
        if (userHeldRef.current.size === 0 && t - lastInputRef.current > IDLE_RESUME) {
          autoActiveRef.current = true;
          autoStartRef.current = t;
          autoIdxRef.current = 0;
          setAutoOn(true);
        }
        return;
      }
      if (autoStartRef.current == null) autoStartRef.current = t;
      const el = t - autoStartRef.current;
      const evs = autoEventsRef.current;
      while (autoIdxRef.current < evs.length && evs[autoIdxRef.current].t <= el) {
        const e = evs[autoIdxRef.current++];
        if (e.type === "on") {
          autoTokensRef.current.add(e.token);
          spawn(e.token, e.degree);
        } else {
          autoTokensRef.current.delete(e.token);
          release(e.token, e.degree);
        }
      }
      // Loop the phrase after a short breath at the end.
      const last = evs.length ? evs[evs.length - 1].t : 0;
      if (autoIdxRef.current >= evs.length && el > last + 3.5) {
        autoStartRef.current = t;
        autoIdxRef.current = 0;
      }
    },
    [spawn, release],
  );

  /* ------------------------------ RAF loop -------------------------------- */
  const loop = useCallback(() => {
    const scene = sceneRef.current;
    const t = performance.now() / 1000;
    runAutopilot(t);
    const flick = flickerRef.current.value(t);
    audioRef.current?.setBrightness(flick);
    if (scene) {
      scene.update(t, flick, true);
      if ((frameRef.current++ & 15) === 0) setDensity(scene.energy);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [runAutopilot]);

  /* ------------------------------- start ---------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("running");
    try {
      const audio = new CrystalAudio();
      audioRef.current = audio;
      await audio.init();
      await audio.resume();
    } catch {
      audioRef.current = null;
      setAudioError(true); // visuals keep running
    }
  }, []);

  /* ----------------------------- user input ------------------------------- */
  const userStart = useCallback(
    (token: string, degree: number) => {
      cancelAutopilot();
      lastInputRef.current = performance.now() / 1000;
      userHeldRef.current.add(token);
      if (!startedRef.current) void handleStart();
      spawn(token, degree);
    },
    [cancelAutopilot, handleStart, spawn],
  );

  const userEnd = useCallback(
    (token: string, degree: number) => {
      lastInputRef.current = performance.now() / 1000;
      userHeldRef.current.delete(token);
      release(token, degree);
    },
    [release],
  );

  /* --------------------------- keyboard events ---------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const degree = KEY_ROW.indexOf(e.key.toLowerCase());
      if (degree === -1) return;
      e.preventDefault();
      userStart(`key-${degree}`, degree);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const degree = KEY_ROW.indexOf(e.key.toLowerCase());
      if (degree === -1) return;
      userEnd(`key-${degree}`, degree);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [userStart, userEnd]);

  /* --------------------------- scene lifecycle ---------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: CrystalScene;
    try {
      scene = new CrystalScene(canvas);
    } catch {
      setWebglError(true);
      return;
    }
    sceneRef.current = scene;
    autoEventsRef.current = makeAutopilot();
    autoActiveRef.current = true;

    const resize = () => {
      scene.resize(window.innerWidth, window.innerHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      sceneRef.current = null;
      scene.dispose();
      const a = audioRef.current;
      audioRef.current = null;
      if (a) void a.dispose();
      startedRef.current = false;
    };
    // loop is stable (its deps are stable); run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ shimmer --------------------------------- */
  useEffect(() => {
    const f = flickerRef.current;
    if (shimmer) f.enable();
    else f.disable();
  }, [shimmer]);

  /* --------------------- on-screen key pointer handlers ------------------- */
  const onKeyPointerDown = useCallback(
    (degree: number) => userStart(`ptr-${degree}`, degree),
    [userStart],
  );
  const onKeyPointerUp = useCallback(
    (degree: number) => userEnd(`ptr-${degree}`, degree),
    [userEnd],
  );

  const reduced = prefersReducedMotion();

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {webglError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGL / three.js, which is unavailable in this browser.
            The crystalline cathedral cannot be drawn here.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Crystal Bloom
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          Play the keyboard and a crystalline cathedral of light grows around you —
          each note buds a self-similar structure that proliferates outward into an
          over-bright plenum. Hold keys to keep it building; play chords to grow
          several at once.
        </p>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          DMT / hyperspace · intense-ecstatic · density {(density * 100).toFixed(0)}%
        </p>
        {audioError && (
          <p className="mt-2 text-base text-destructive">
            Audio could not start — visuals continue silently.
          </p>
        )}
      </div>

      {/* Idle splash */}
      {phase === "idle" && !webglError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-lg bg-background/40 px-8 py-6 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => void handleStart()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play — press A–L or tap a key
            </button>
            <p className="text-sm text-muted-foreground">
              A demo phrase is already playing. Press any key to take over.
            </p>
          </div>
        </div>
      )}

      {/* Bottom controls + on-screen keyboard */}
      <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {autoOn ? "autopilot — press a key to play" : "playing live"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
            <button
              type="button"
              onClick={() => setShimmer((s) => !s)}
              aria-pressed={shimmer}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                shimmer
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Shimmer {shimmer ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={() => {
                flickerRef.current.kill();
                setShimmer(false);
              }}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Kill
            </button>
          </div>
        </div>

        {/* On-screen keyboard / note legend */}
        <div className="flex justify-center gap-1.5 sm:gap-2">
          {KEY_ROW.map((k, i) => {
            const isDown = lit.has(i);
            return (
              <button
                key={k}
                type="button"
                aria-label={`Key ${KEY_LABELS[i]}, note ${NOTE_NAMES[i]}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onKeyPointerDown(i);
                }}
                onPointerUp={() => onKeyPointerUp(i)}
                onPointerLeave={() => {
                  if (lit.has(i)) onKeyPointerUp(i);
                }}
                onPointerCancel={() => onKeyPointerUp(i)}
                className={`flex h-16 min-w-[44px] flex-1 select-none flex-col items-center justify-center rounded-md border text-sm transition-colors ${
                  isDown
                    ? "border-primary bg-primary/25 text-primary-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="font-mono text-sm">{KEY_LABELS[i]}</span>
                <span className="font-mono text-xs uppercase tracking-[0.18em] opacity-80">
                  {NOTE_NAMES[i]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Design-notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/90 p-6 backdrop-blur">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every key is a scale degree of <span className="text-foreground">C-Lydian</span>{" "}
                (C D E F♯ G A B), a bright modal colour. Pressing it sounds a glassy
                additive/FM bell and seeds a polyhedral <em>cell</em> near a luminous
                core. That cell recursively buds scaled, rotated child cells outward in
                a coherent cone; hold the key and the frontier keeps proliferating, so
                sustained play accretes a self-similar crystalline architecture. The
                cells emit light additively — the more you play, the brighter and denser
                the plenum, running violet → gold → white as recursion deepens.
              </p>
              <p>
                This renders a specific idea from Gallimore &amp; Hoffman,{" "}
                <span className="text-foreground">
                  &ldquo;The Mathematical Architecture of Altered Consciousness&rdquo;
                </span>{" "}
                (Neuroscience News, 2026-06-03): DMT perturbs the perceptual interface
                and <em>expands the accessible region of experience space</em>, so
                normally-imperceptible <span className="text-foreground">structured</span>{" "}
                form proliferates into perceptibility — coherent structure, not noise.
                Here, playing deeper condenses more coherent crystalline structure. It
                echoes the DMT-realm phenomenology where geometry proliferates, then
                structure — an ecstatic <em>arrival</em>, not a dissolution into void.
              </p>
              <p className="text-xs">
                Safety: any luminance shimmer is routed through the shared safe-flicker
                engine (≤3 Hz soft drift, off by default
                {reduced ? ", and reduced-motion is honoured" : ""}). Determinism: all
                randomness is a seeded mulberry32 (seed 0x2264).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
