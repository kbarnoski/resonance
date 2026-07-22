"use client";

// ════════════════════════════════════════════════════════════════════════════
// 2276 — Oceanic Gather
//
// THE ONE QUESTION: What if an ecstatic OCEANIC UNION were something you PLAY
// with your whole body, eyes closed, in headphones — a 360° sphere of many
// detuned "world-voices" that you TILT to gather inward until they phase-lock,
// their detuning collapses to unison, and they converge into a single fused
// presence at the centre of your skull?
//
// The play gesture is TILT (DeviceOrientation β/γ), with a pointer-distance
// fallback on desktop and a seeded mulberry32 autopilot for a hands-free glance.
// The primary output is audio-only HRTF spatialization; the dim Canvas2D "spatial
// map" is only a secondary aid so a sighted reviewer can SEE the voices converge.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { OceanicAudio } from "./audio";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";

type Mode = "idle" | "running" | "noaudio";
type Input = "tilt" | "pointer" | "autopilot";

// Autopilot U path over ~18s: disperse → gather → UNION → release. Piecewise
// linear keyframes [tSec, U].
const AUTOPILOT: [number, number][] = [
  [0, 0.0],
  [3, 0.08],
  [7, 0.55],
  [11, 0.98],
  [14.5, 1.0],
  [17, 0.35],
  [20, 0.0],
];
const AUTOPILOT_LOOP = 22;
const IDLE_RESUME_S = 7; // resume autopilot after this many idle seconds

function autopilotU(tSec: number): number {
  const t = tSec % AUTOPILOT_LOOP;
  for (let i = 0; i < AUTOPILOT.length - 1; i++) {
    const [t0, u0] = AUTOPILOT[i];
    const [t1, u1] = AUTOPILOT[i + 1];
    if (t >= t0 && t <= t1) {
      const k = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return u0 + (u1 - u0) * k;
    }
  }
  return 0;
}

export default function OceanicGatherPage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [input, setInput] = useState<Input>("autopilot");
  const [hasTilt, setHasTilt] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [uDisplay, setUDisplay] = useState(0);

  const audioRef = useRef<OceanicAudio | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  // Live play state (kept in refs so the rAF loop never restarts).
  const driveRef = useRef(0); // raw target from tilt/pointer 0..1
  const uRef = useRef(0); // slew-limited Union parameter
  const lastInputAtRef = useRef(0); // performance.now() of last live input
  const inputRef = useRef<Input>("autopilot");
  const flickerRef = useRef(createSafeFlicker({ maxHz: 2, defaultHz: 0.15, floor: 0.72 }));
  const reduced = useRef(prefersReducedMotion());
  const uDisplayRef = useRef(0);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // ── INPUT: device tilt ─────────────────────────────────────────────────────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    // Tilt magnitude: how far from flat-in-hand. β around 45° reading pose is
    // neutral; deviation in either axis gathers. Normalize to 0..1.
    const b = (e.beta - 45) / 45; // -1..1-ish around a comfortable hold
    const g = e.gamma / 45;
    const mag = Math.min(1, Math.sqrt(b * b + g * g));
    driveRef.current = mag;
    lastInputAtRef.current = performance.now();
    if (inputRef.current !== "tilt") {
      inputRef.current = "tilt";
      setInput("tilt");
    }
  }, []);

  // ── INPUT: pointer distance from screen centre (desktop fallback) ───────────
  const onPointer = useCallback((e: PointerEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dx = (e.clientX - w / 2) / (w / 2);
    const dy = (e.clientY - h / 2) / (h / 2);
    // Distance from centre → gather. Centre = dispersed, edges = union.
    const mag = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    driveRef.current = mag;
    lastInputAtRef.current = performance.now();
    if (inputRef.current !== "pointer" && !hasTilt) {
      inputRef.current = "pointer";
      setInput("pointer");
    }
  }, [hasTilt]);

  // ── The play loop ───────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;

    const tick = () => {
      const nowMs = performance.now();
      const idleFor = (nowMs - lastInputAtRef.current) / 1000;

      // Decide the drive source. Live tilt/pointer wins; after IDLE_RESUME_S of
      // no live input, autopilot takes over.
      let target: number;
      const elapsed = audio ? audio.elapsed() : nowMs / 1000;
      if (idleFor > IDLE_RESUME_S || lastInputAtRef.current === 0) {
        target = autopilotU(elapsed);
        if (inputRef.current !== "autopilot") {
          inputRef.current = "autopilot";
          setInput("autopilot");
        }
      } else {
        target = driveRef.current;
      }

      // Slew-limited ASYMMETRIC follower: gather fast-ish, disperse slower.
      const u = uRef.current;
      const rising = target > u;
      const rate = rising ? 0.9 : 0.35; // per second
      const dt = 1 / 60;
      const step = rate * dt;
      let next = u;
      if (target > u) next = Math.min(target, u + step);
      else next = Math.max(target, u - step);
      uRef.current = next;

      if (audio) audio.update(next, elapsed);

      // Visual (dim, secondary). Route any luminance through slow safe flicker.
      if (canvas) {
        const lum = flickerRef.current.value(nowMs / 1000);
        const lvl = audio ? audio.level() : 0;
        drawMap(canvas, audio, next, lvl, reduced.current ? 1 : lum);
      }

      // Cheap throttled UI update of the readout.
      if (Math.abs(next - uDisplayRef.current) > 0.01) {
        uDisplayRef.current = next;
        setUDisplay(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // ── Begin (must be inside the user gesture for AudioContext + iOS perms) ─────
  const begin = useCallback(async () => {
    // iOS motion permission — inside the same tap.
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    let tiltOk = "DeviceOrientationEvent" in window;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        tiltOk = res === "granted";
      } catch {
        tiltOk = false;
      }
    }
    if (tiltOk) {
      window.addEventListener("deviceorientation", onOrient);
      setHasTilt(true);
    }
    window.addEventListener("pointermove", onPointer);

    // Gentle sub-perceptual luminance breath (reduced-motion pins it steady).
    if (!reduced.current) flickerRef.current.enable();

    const audio = new OceanicAudio();
    const ok = audio.start();
    audioRef.current = audio;
    if (!ok) {
      setMode("noaudio");
    } else {
      setMode("running");
    }
    // Start hands-free (autopilot) until the first live input.
    lastInputAtRef.current = 0;
    inputRef.current = "autopilot";
    setInput("autopilot");
    runLoop();
  }, [onOrient, onPointer, runLoop]);

  // ── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("pointermove", onPointer);
      const a = audioRef.current;
      if (a) void a.stop();
      audioRef.current = null;
    };
  }, [onOrient, onPointer]);

  const inputLabel =
    input === "tilt" ? "device tilt" : input === "pointer" ? "pointer proxy" : "autopilot";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Canvas art layer (dim, eyes-closed piece — secondary aid only). */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header + controls */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 sm:p-8">
        <header className="max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream 2276 · oceanic union
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Oceanic Gather
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Headphones, eyes closed. A sphere of twelve detuned world-voices
            surrounds your head. Tilt your phone (or, on desktop, move the pointer
            outward from centre) to gather them inward — their detuning collapses to
            a single unison and they fuse into one presence at the centre of your
            skull.
          </p>
        </header>

        {/* Live readout */}
        <div className="pointer-events-none max-w-xl">
          {mode === "running" && (
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Union U · {uDisplay.toFixed(2)} · input {inputLabel}
              </p>
              <div className="h-1 w-full max-w-xs overflow-hidden rounded-md bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-75"
                  style={{ width: `${Math.round(uDisplay * 100)}%` }}
                />
              </div>
            </div>
          )}
          {mode === "noaudio" && (
            <p className="text-sm text-destructive">
              Web Audio is unavailable in this browser — the spatial fusion is
              silent, but the visual map still runs.
            </p>
          )}
        </div>

        {/* Footer controls */}
        <footer className="flex flex-wrap items-center gap-3">
          {mode === "idle" ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {hasTilt
                ? "Tilt to gather · release to let the voices disperse"
                : "Move the pointer outward to gather · autopilot resumes when idle"}
            </p>
          )}
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Close notes" : "Read the design notes"}
          </button>
        </footer>
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/90 p-6 backdrop-blur-sm sm:p-10">
          <div className="w-full max-w-2xl rounded-lg border border-border bg-background p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question.</span> What if an
                ecstatic oceanic union were something you PLAY with your whole body,
                eyes closed, in headphones — a 360° sphere of many detuned world-voices
                that you tilt to gather inward until they phase-lock, their detuning
                collapses to unison, and they spatially converge into a single fused
                presence at the centre of your skull?
              </p>
              <p>
                <span className="text-foreground">How to play.</span> Put on headphones.
                Press Begin. On a phone, grant motion access and tilt to gather the
                voices; hold flat to let them disperse. On desktop, move the pointer
                outward from screen-centre as the tilt proxy. Leave it alone and a
                seeded autopilot walks the whole disperse → gather → union → release arc
                hands-free.
              </p>
              <p>
                <span className="text-foreground">The technique.</span> Twelve HRTF
                PannerNodes sit on a Fibonacci sphere (radius ~4) around the listener.
                A single played Union parameter U∈[0,1] — a slew-limited asymmetric
                follower of tilt magnitude (gather fast, disperse slow) — simultaneously
                lerps every voice toward head-centre (0, 0, 0.2), eases each voice&apos;s
                microtonal detune (±35¢) to a shared unison, glides the twelve
                D-Dorian pitches to one unison D, fades a per-voice beat-lock tremolo,
                and blooms brightness + reverb wet. Many → one. This is the spatial-audio
                source-clustering / downmix technique used as the DSP analogue of the
                union collapse.
              </p>
              <p>
                <span className="text-foreground">Harmony.</span> Voices ride the degrees
                of D-Dorian, each with an independent slow ±35-cent detune at U=0, all
                easing to a shared unison D at U=1. Deliberately not pentatonic, not a
                just-intonation ratio stack, not Bohlen–Pierce — the many-to-one collapse
                is the whole idea.
              </p>
              <p>
                <span className="text-foreground">References.</span> Unterrainer, H-F.,
                &ldquo;Oceanic states of consciousness — an existential-neuroscience
                perspective,&rdquo; Frontiers in Human Neuroscience, 2025-08-11 (the
                OCEANIC scale; DMN-quieting; oceanic unity / timelessness; the embodied
                subject embedded in the world, after Merleau-Ponty). Plus the spatial-audio
                source-clustering / downmix technique — grouping many spatial sources into
                one fused cluster.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> No strobe. The visual is
                a slow (&lt;3 Hz) luminance drift routed through the shared safe-flicker
                engine, and prefers-reduced-motion pins it steady. The master bus runs
                through a compressor so the union swell never becomes a volume jump.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL — dim head-centred spatial map. Each voice = a small violet dot at its
// projected position; converges to a bright central point as U rises. Secondary
// aid for a sighted reviewer; this is an eyes-closed piece, so it stays quiet.
// ─────────────────────────────────────────────────────────────────────────────
function drawMap(
  canvas: HTMLCanvasElement,
  audio: OceanicAudio | null,
  U: number,
  level: number,
  lum: number,
): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.34; // on-screen radius of the sphere plot

  // Faint radius ring (the boundary of the surrounding world).
  ctx.strokeStyle = `rgba(150,130,220,${0.06 * lum})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // Central presence — brightens as voices converge.
  const centerGlow = (0.05 + 0.9 * (U * U)) * lum;
  const cg = ctx.createRadialGradient(cx, cy + R * 0.06, 0, cx, cy + R * 0.06, R * (0.15 + 0.5 * U));
  cg.addColorStop(0, `rgba(190,170,255,${centerGlow})`);
  cg.addColorStop(1, "rgba(190,170,255,0)");
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, w, h);

  if (!audio) return;
  const pos = audio.positions;
  const rad = audio.radius;

  for (let i = 0; i < pos.length; i++) {
    const [x, y, z] = pos[i];
    // Project the 3D seat onto the screen: x→right, y→up, z (front/back) → dot
    // size + brightness so voices "behind" the head still read.
    const sx = cx + (x / rad) * R;
    const sy = cy - (y / rad) * R;
    const depth = (z / rad + 1) / 2; // 0 (behind) .. 1 (front)
    const dotR = (1.6 + 3.2 * depth) * (1 - 0.3 * U);
    const alpha = (0.28 + 0.5 * depth) * lum;
    ctx.fillStyle = `rgba(178,150,246,${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // A subtle level-driven halo so the fused presence "breathes" with the sound.
  if (level > 0.001) {
    ctx.strokeStyle = `rgba(200,180,255,${0.12 * level * lum})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy + R * 0.06, R * (0.1 + 0.35 * U) * (0.9 + level), 0, Math.PI * 2);
    ctx.stroke();
  }
}
