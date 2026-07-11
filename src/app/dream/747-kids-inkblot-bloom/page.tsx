"use client";

// 747 · Inkblot Bloom — "What if a 4-year-old could hum and watch living,
// mirror-symmetric INKBLOTS bloom and unfold like a butterfly — and hear each
// fold sing?"
//
// Near-dark calm screen. Child HUMS/BLOWS into the mic; soft ink blooms outward
// from the centre and unfolds in kaleidoscopic mirror symmetry (a living
// Rorschach butterfly). The ink is a Gray-Scott reaction-diffusion field run on
// WebGPU compute (primary) with a Canvas2D CPU fallback. Spreading fronts ring
// soft consonant bells; each hum seeds a fresh drop of ink.
//
// All browser APIs live inside effects/handlers — module top level is SSR-safe.

import { useCallback, useEffect, useRef, useState } from "react";
import { InkAudio } from "./audio";
import { buildWebGPURenderer, type InkRenderer, type InkSeed } from "./gpu";
import { buildCpuRenderer, type CpuRenderer } from "./cpu";

type AnyRenderer = InkRenderer | CpuRenderer;

// Ghost auto-demo: a gentle scripted "hum" that seeds + sings hands-free.
const GHOST_IDLE_MS = 2500;

export default function Page() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"webgpu" | "canvas2d" | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<InkAudio | null>(null);
  const rendererRef = useRef<AnyRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // Loop state (refs so the rAF callback never needs re-creation).
  const lastHumAtRef = useRef(0);
  const ghostPhaseRef = useRef(0);
  const liftRef = useRef(0);
  const breathRef = useRef(0);
  const startedAtRef = useRef(0);
  // micOk + ghost cadence readable inside the loop without re-creating it.
  const micOkRef = useRef<boolean | null>(null);
  const lastGhostKRef = useRef(-1);

  // ── Render + sound loop ─────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const renderer = rendererRef.current;
    const audio = audioRef.current;
    if (!renderer || !audio) return;

    const nowMs = performance.now();
    const t = (nowMs - startedAtRef.current) / 1000;

    // Read the mic (analysis only). breath -> ink amount; pitch -> lift.
    let breath = 0;
    const mic = audio.readMic();
    if (mic) {
      breath = mic.rms;
    }
    // Smooth breath + carry lift from the audio engine's pitch tracker.
    breathRef.current += (breath - breathRef.current) * 0.25;
    liftRef.current = audio.lift;

    const seeds: InkSeed[] = [];
    let bloomedThisFrame = false;

    // A real hum/blow: enough breath energy crosses the threshold -> seed ink.
    if (breathRef.current > 0.12 && nowMs - lastHumAtRef.current > 140) {
      lastHumAtRef.current = nowMs;
      const strength = Math.min(1, breathRef.current * 1.6);
      // Higher hum lifts the drop off-centre (radius); blooms ring accordingly.
      const radius = 0.04 + liftRef.current * 0.32;
      const ang = Math.random() * Math.PI * 2;
      seeds.push({
        x: 0.5 + Math.cos(ang) * radius * 0.5,
        y: 0.5 + Math.sin(ang) * radius * 0.5,
        r: 4 + strength * 9,
        amount: 0.45 + strength * 0.4,
      });
      audio.ringBloom({ radius: radius + 0.15, strength });
      bloomedThisFrame = true;
    }

    // Ghost auto-demo: if mic denied OR idle, a scripted hum keeps it alive.
    const idle = nowMs - lastHumAtRef.current > GHOST_IDLE_MS;
    if ((micOkRef.current === false || idle) && !bloomedThisFrame) {
      ghostPhaseRef.current += 1 / 60;
      const ph = ghostPhaseRef.current;
      // A slow breathing cadence ~ every 1.3s, with drifting pitch.
      const cadence = 1.3;
      const k = Math.floor(ph / cadence);
      const frac = ph - k * cadence;
      if (frac < 0.02 && lastGhostKRef.current !== k) {
        lastGhostKRef.current = k;
        const lift = 0.3 + 0.35 * (0.5 + 0.5 * Math.sin(k * 1.7));
        liftRef.current = liftRef.current * 0.6 + lift * 0.4;
        const strength = 0.45 + 0.3 * (0.5 + 0.5 * Math.sin(k * 0.9 + 1));
        const radius = 0.04 + lift * 0.3;
        const ang = k * 2.399963; // golden-angle drift
        seeds.push({
          x: 0.5 + Math.cos(ang) * radius * 0.5,
          y: 0.5 + Math.sin(ang) * radius * 0.5,
          r: 5 + strength * 8,
          amount: 0.5 + strength * 0.35,
        });
        audio.ringBloom({ radius: radius + 0.18, strength });
      }
    }

    if (seeds.length) renderer.seed(seeds);

    // Kaleidoscope folds breathe slowly between 2 and 5 (butterfly..flower).
    const folds = 2 + Math.round(1.5 + 1.5 * Math.sin(t * 0.13));
    renderer.frame(folds, liftRef.current, t);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    micOkRef.current = micOk;
  }, [micOk]);

  // ── Start (first user gesture) ──────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the drawing buffer to the element.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    canvas.height = Math.max(2, Math.floor(rect.height * dpr));

    // Audio first (inside the gesture for iOS).
    const audio = new InkAudio();
    audioRef.current = audio;
    await audio.start();

    // Mic — analysis only. Created inside the gesture.
    const ok = await audio.openMic();
    setMicOk(ok);
    micOkRef.current = ok;
    lastHumAtRef.current = performance.now();

    // Renderer: WebGPU primary, Canvas2D fallback.
    let renderer: AnyRenderer;
    try {
      renderer = await buildWebGPURenderer(canvas);
      setMode("webgpu");
    } catch {
      try {
        renderer = buildCpuRenderer(canvas);
        setMode("canvas2d");
      } catch {
        // Last-ditch: still show audio-only is not acceptable, but avoid crash.
        return;
      }
    }
    rendererRef.current = renderer;

    startedAtRef.current = performance.now();
    setStarted(true);
    rafRef.current = requestAnimationFrame(loop);
  }, [started, loop]);

  // ── Teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      rendererRef.current?.destroy();
      rendererRef.current = null;
      void audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#07070c] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* Calm title, fades once started */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-6 pt-8 text-center transition-opacity duration-1000 ${
          started ? "opacity-0" : "opacity-100"
        }`}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Inkblot Bloom
        </h1>
        <p className="mt-2 max-w-md text-base text-muted-foreground">
          Hum or blow softly. Watch the ink open like a butterfly, and hear each
          fold sing.
        </p>
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            onClick={handleStart}
            className="flex min-h-[96px] min-w-[96px] items-center justify-center rounded-full border border-border bg-muted px-10 py-6 text-xl font-medium text-foreground backdrop-blur-md transition-colors hover:bg-accent active:bg-muted"
          >
            Tap to begin
          </button>
        </div>
      )}

      {/* Lite-mode + mic notices */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-1 px-6 text-center">
          {mode === "canvas2d" && (
            <p className="text-base text-violet-300">
              Lite mode — your device has no WebGPU, so the ink runs gently on the
              CPU. It still blooms and sings.
            </p>
          )}
          {micOk === false && (
            <p className="text-base text-violet-300">
              No microphone — a soft ghost hum is keeping the ink blooming for
              you.
            </p>
          )}
        </div>
      )}

      {/* Design-notes affordance */}
      {started && (
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="absolute bottom-4 right-4 z-30 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
        >
          {showNotes ? "Close" : "Design notes"}
        </button>
      )}

      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0c0c14] p-6 text-base leading-relaxed text-foreground">
            <h2 className="mb-3 text-xl font-semibold text-foreground">
              Inkblot Bloom — design notes
            </h2>
            <p className="mb-3">
              A near-dark, calm screen for a 4-year-old. Hum or blow into the mic
              and soft ink blooms outward from the centre, unfolding in
              kaleidoscopic mirror symmetry — a living Rorschach butterfly. Each
              hum seeds a fresh drop of ink; spreading fronts ring soft consonant
              bells in C-major pentatonic, so there is never a wrong note.
            </p>
            <p className="mb-3 text-muted-foreground">
              The ink is a <strong>Gray-Scott reaction-diffusion</strong> field
              (Pearson 1993 / Turing 1952), run as a WebGPU compute shader on a
              256&times;256 ping-pong buffer, then folded with mirror symmetry to
              a full-screen quad. Where WebGPU is missing, the same model runs on
              a 96&times;96 CPU grid drawn mirror-symmetrically to Canvas2D.
            </p>
            <p className="mb-3 text-muted-foreground">
              Visual lineage: Bileam Tschepe (elekktronaut) feedback/inkblot
              TouchDesigner work, and Entagma&apos;s &ldquo;Easy Houdini:
              Inkblots — Steal from TouchDesigner&rdquo; (2026).
            </p>
            <p className="text-muted-foreground">
              The microphone is live-analysis only — never recorded, never sent,
              never wired to the speakers. An always-on drone pad and a ghost
              auto-demo keep the piece alive even in silence.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Back to the ink
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
