"use client";

// 1974-threshold-loom — "Threshold Loom".
//
// What if falling asleep were an instrument — what if the RHYTHM of your typing
// (not the letters) paced a hypnagogic sleep-onset field that dissolves you
// toward the threshold of sleep? You type; the letters are ignored; only the
// CADENCE — the timing between keystrokes — is read. Slow, steady, drowsy typing
// deepens the state; frantic typing pulls it back toward waking. As DEPTH climbs
// a full-viewport Ganzfeld field takes over, phosphene form-constants bloom and
// fade at each keystroke, and a Shepard–Risset glissando descends forever toward
// sleep. A deterministic, seeded "phantom typist" drives it when nobody types
// (critical for the headless review) and yields to the real keyboard.
//
// INPUT keyboard-CADENCE (inter-keystroke timing, NOT letters) · OUTPUT Canvas2D
// only · TECHNIQUE keystroke-rhythm state integrator → Ganzfeld luminance field
// + phosphene form-constant blooms + descending Shepard–Risset glissando.
//
// See field.ts (Canvas2D), audio.ts (Web Audio), README.md. Refs: Wackermann/
// Pütz/Allefeld (Cortex 2002, PMID 12433389); Ganzfeld thalamo-cortical
// decoupling (PMC7596232); Shepard (1964) / Risset; the Tetris effect.

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";
import { ThresholdField, mulberry32 } from "./field";
import { ThresholdAudio } from "./audio";
import { README } from "./readme-text";

type Phase = "intro" | "running" | "unsupported";

// Cadence mapping (seconds). An interval at/above IKI_DROWSY reads as fully
// drowsy; at/below IKI_FRANTIC as fully frantic.
const IKI_FRANTIC = 0.35;
const IKI_DROWSY = 1.9;
// How hard each keystroke nudges depth toward its drowsiness reading.
const DEPTH_NUDGE = 0.16;
// Passive drift toward sleep when no keys arrive (very slow).
const PASSIVE_DRIFT = 0.006; // depth units / sec
// Re-arm the phantom typist after this long with no human key (seconds).
const PHANTOM_REARM = 16;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function stateLabel(depth: number): string {
  if (depth < 0.2) return "awake";
  if (depth < 0.45) return "drowsy";
  if (depth < 0.7) return "hypnagogic";
  if (depth < 0.9) return "sinking";
  return "at the threshold";
}

interface Meter {
  depth: number;
  label: string;
  phantom: boolean;
}

export default function ThresholdLoomPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [showNotes, setShowNotes] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [meter, setMeter] = useState<Meter>({
    depth: 0,
    label: "awake",
    phantom: true,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fieldRef = useRef<ThresholdField | null>(null);
  const audioRef = useRef<ThresholdAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // Deterministic clock + state (refs so the loop stays referentially stable).
  const clockRef = useRef(0); // seconds, accumulated from rAF dt (allowed)
  const lastTsRef = useRef<number | null>(null);
  const depthRef = useRef(0);
  const lastKeyRef = useRef<number | null>(null);
  const ikiMeanRef = useRef(1.0);
  const humanActiveRef = useRef(false);
  const lastHumanRef = useRef(-1000);
  const phantomNextRef = useRef(0);
  const phantomRnd = useRef<() => number>(mulberry32(0x105e1eaf));
  const reducedRef = useRef(false);
  const runningRef = useRef(false);
  const frameRef = useRef(0);

  // ── keystroke → cadence integrator ──────────────────────────────────────
  const registerKeystroke = useCallback((isHuman: boolean) => {
    const now = clockRef.current;
    const last = lastKeyRef.current;
    lastKeyRef.current = now;

    let drowsy = 0.5;
    if (last !== null) {
      const iki = now - last;
      // EMA of interval → steadiness (an even rhythm sinks faster).
      const mean = ikiMeanRef.current;
      const steadiness = clamp01(1 - Math.abs(iki - mean) / Math.max(0.25, mean));
      ikiMeanRef.current = mean + (iki - mean) * 0.35;
      const base = clamp01((iki - IKI_FRANTIC) / (IKI_DROWSY - IKI_FRANTIC));
      drowsy = clamp01(base * (0.62 + 0.38 * steadiness));
      // Nudge depth toward this keystroke's drowsiness reading.
      const dep = depthRef.current;
      depthRef.current = clamp01(dep + DEPTH_NUDGE * (drowsy - dep));
    }

    fieldRef.current?.spawn(depthRef.current, drowsy);
    audioRef.current?.chime(depthRef.current, drowsy);

    if (isHuman) {
      humanActiveRef.current = true;
      lastHumanRef.current = now;
    }
  }, []);

  // ── keyboard listener (cadence only — the key VALUE is never read) ────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!runningRef.current || reducedRef.current) return;
      // Ignore pure modifier presses and browser shortcuts.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Tab" || e.key === "Escape") return;
      registerKeystroke(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registerKeystroke]);

  // ── prefers-reduced-motion ────────────────────────────────────────────────
  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    reducedRef.current = r;
    if (r) depthRef.current = 0.5; // a calm, settled still field
  }, []);

  // ── canvas sizing + 2D support check ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setPhase("unsupported");
      return;
    }
    fieldRef.current = new ThresholdField(0x7104b00d);

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const c = canvas.getContext("2d");
      if (c) c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Draw one calm still frame immediately so the intro isn't black.
    const c = canvas.getContext("2d");
    if (c) fieldRef.current.draw(c, window.innerWidth, window.innerHeight, reducedRef.current ? 0.5 : 0.08, 0, true);

    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── the render + audio loop ───────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;

    const frame = (ts: number) => {
      const ctx = canvas.getContext("2d");
      const dtRaw = lastTsRef.current === null ? 0 : (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      const dt = Math.min(0.05, Math.max(0, dtRaw)); // clamp long gaps
      clockRef.current += dt;
      frameRef.current += 1;
      const now = clockRef.current;
      const red = reducedRef.current;

      if (!red) {
        // Phantom typist — deterministic, seeded, drowsy cadence. Active until
        // a human types; re-arms after a long stretch of stillness.
        const phantomOn =
          !humanActiveRef.current || now - lastHumanRef.current > PHANTOM_REARM;
        if (phantomOn) {
          if (humanActiveRef.current) {
            humanActiveRef.current = false; // reclaim; forget the human's clock
            lastKeyRef.current = null;
          }
          if (now >= phantomNextRef.current) {
            registerKeystroke(false);
            // Next drowsy interval: slower as the sleeper sinks deeper.
            const r = phantomRnd.current();
            const longPause = phantomRnd.current() < 0.18 ? 1.4 : 0;
            const interval = 1.1 + r * 0.9 + depthRef.current * 0.7 + longPause;
            phantomNextRef.current = now + interval;
          }
        }

        // Passive drift toward sleep when nothing is arriving.
        depthRef.current = clamp01(depthRef.current + PASSIVE_DRIFT * dt);

        field.update(dt);
      }

      const depth = depthRef.current;
      audioRef.current?.setDepth(depth);
      audioRef.current?.step(dt);

      if (ctx) {
        field.draw(ctx, window.innerWidth, window.innerHeight, depth, now, red);
      }

      // Throttle React state updates for the HUD.
      if (frameRef.current % 12 === 0) {
        setMeter({
          depth,
          label: stateLabel(depth),
          phantom: !humanActiveRef.current || now - lastHumanRef.current > PHANTOM_REARM,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [registerKeystroke]);

  // ── Begin: create/resume AudioContext (user gesture), start everything ────
  const handleBegin = useCallback(async () => {
    if (runningRef.current) return;
    type ACtor = typeof AudioContext;
    const w = window as unknown as {
      AudioContext?: ACtor;
      webkitAudioContext?: ACtor;
    };
    const AC = w.AudioContext ?? w.webkitAudioContext;
    if (!AC) {
      setPhase("unsupported");
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      const audio = new ThresholdAudio(ctx);
      audio.start();
      ctxRef.current = ctx;
      audioRef.current = audio;
    } catch {
      setPhase("unsupported");
      return;
    }
    // Seed the phantom to fire shortly after Begin.
    phantomNextRef.current = clockRef.current + 0.6;
    runningRef.current = true;
    setPhase("running");
    startLoop();
  }, [startLoop]);

  // ── full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  if (phase === "unsupported") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Threshold Loom
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            This piece needs a 2D canvas and the Web Audio API, and your browser
            doesn&apos;t seem to offer them. Try a recent desktop or mobile
            browser.
          </p>
        </div>
        <PrototypeNav slugs={["1974-threshold-loom"]} />
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Intro / gesture gate */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Threshold Loom
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Falling asleep, as an instrument. Type — but the letters don&apos;t
              matter. Only the <span className="text-primary">rhythm</span> of
              your typing does. Type slow and steady to sink toward the threshold
              of sleep; type frantically to pull yourself back. If you stop, a
              drowsy phantom keeps typing for you.
            </p>
            {reduced && (
              <p className="mt-3 text-sm text-muted-foreground">
                Reduced-motion is on — the field will hold to a calm still state.
              </p>
            )}
            <button
              onClick={handleBegin}
              className="mt-7 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="mt-4 text-sm text-muted-foreground">
              Sound on, low volume. Best in a dim room.
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5">
          <div className="max-w-xs">
            <div className="text-base font-medium text-foreground">
              {meter.label}
            </div>
            <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-foreground/15">
              <div
                className="h-full rounded-full bg-primary/80 transition-[width] duration-500"
                style={{ width: `${Math.round(meter.depth * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {reduced
                ? "still field (reduced motion)"
                : meter.phantom
                  ? "phantom typist — type to take over"
                  : "your cadence is pacing the field"}
            </div>
          </div>
        </div>
      )}

      {/* Design-notes link */}
      {phase !== "intro" && (
        <button
          onClick={() => setShowNotes(true)}
          className="absolute bottom-4 left-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      )}

      {/* Design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Threshold Loom — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted-foreground">
              {README}
            </pre>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1974-threshold-loom"]} />
    </main>
  );
}
