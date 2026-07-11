"use client";

// 909-resonant-field-volume — "Resonant Field".
// Sing, hum, speak, or play — your sound is captured and scattered back around
// you as a 3D cloud of HRTF-panned grains AND blooms as a GPU raymarched
// volumetric nebula. Both are shaped by TIMBRE (brightness, noisiness,
// loudness, change) — never by pitch. Pitch is held deliberately dumb: a single
// fixed drone holds harmony flat so the piece lives entirely in timbre × space.
//
// Subsystems:
//   (1) features.ts — pitch-free timbre extractor (RMS, centroid, flatness,
//       flux, 8-band silhouette). No autocorrelation, no notes.
//   (2) audio.ts — spatial granular re-synth (per-grain HRTF PannerNode placed
//       by timbre) + dumb drone bed + synthetic auto-demo source.
//   (3) scene.ts — three.js fullscreen raymarched volumetric cloud with a uAge
//       memory accumulator; Canvas2D glow fallback on no-WebGL.

import { useCallback, useEffect, useRef, useState } from "react";
import { ResonantFieldAudio } from "./audio";
import { FeatureExtractor, Features } from "./features";
import { createCanvas2DScene, createGpuScene, FieldScene } from "./scene";

type Status = "idle" | "mic" | "demo" | "denied";

export default function ResonantFieldPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ResonantFieldAudio | null>(null);
  const sceneRef = useRef<FieldScene | null>(null);
  const extractorRef = useRef<FeatureExtractor | null>(null);
  const rafRef = useRef<number>(0);
  const ageRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<Status>("idle");
  const [webglOk, setWebglOk] = useState<boolean>(true);
  const [audioOk, setAudioOk] = useState<boolean>(true);
  const [started, setStarted] = useState<boolean>(false);

  // ---- render + feature loop (runs once a scene exists) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Build the visual scene up front so the page is never blank.
    let scene = createGpuScene(canvas);
    if (!scene) {
      setWebglOk(false);
      scene = createCanvas2DScene(canvas);
    }
    sceneRef.current = scene;

    const resize = () => {
      const s = sceneRef.current;
      if (!s) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      s.resize(w, h, window.devicePixelRatio || 1);
    };
    resize();
    window.addEventListener("resize", resize);

    // Idle features so the nebula breathes faintly before "Start".
    let idle: Features = {
      rms: 0,
      centroid: 0.3,
      flatness: 0.5,
      flux: 0,
      bands: new Array(8).fill(0.04),
      active: false,
    };
    let idlePhase = 0;

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;

      const audio = audioRef.current;
      const extractor = extractorRef.current;
      const s = sceneRef.current;
      if (!s) return;

      let f: Features;
      if (audio && extractor) {
        audio.pumpCapture();
        f = extractor.read();

        // Auto-demo arbitration: ~2.5 s of near-silence with a live mic ->
        // start the synthetic demo so the field never dies. When the demo is
        // running, the demo itself feeds the analyser, so we detect renewed
        // *real* input only when a mic stream exists and the demo is stopped.
        const silence = extractor.silenceSeconds(dt);
        if (audio.mode === "mic" && silence > 2.5) {
          audio.startDemo();
          setStatus("demo");
        }

        audio.scheduleGrains(f);

        // MEMORY: uAge rises while sound is present, slowly cools in silence.
        const target = f.active ? 1.0 : 0.0;
        const rate = f.active ? 0.6 : 0.06; // fast warm, slow cool
        ageRef.current += (target - ageRef.current) * rate * dt * 3;
      } else {
        // Pre-start idle shimmer.
        idlePhase += dt;
        idle = {
          ...idle,
          rms: 0.04 + 0.03 * (0.5 + 0.5 * Math.sin(idlePhase * 0.7)),
          centroid: 0.3 + 0.1 * Math.sin(idlePhase * 0.3),
          flatness: 0.5 + 0.2 * Math.sin(idlePhase * 0.21),
        };
        f = idle;
        ageRef.current += (0.18 - ageRef.current) * 0.02 * dt * 3;
      }

      s.update(f, ageRef.current, dt);
      s.render();
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ---- teardown audio on unmount ----
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
      extractorRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    const audio = new ResonantFieldAudio();
    const ok = await audio.init(); // creates + resumes context inside gesture
    if (!ok || !audio.available) {
      setAudioOk(false);
      return;
    }
    audioRef.current = audio;

    const an = audio.getAnalyser();
    if (an && audio.ctx) {
      extractorRef.current = new FeatureExtractor(an, audio.ctx.sampleRate);
    }

    // Try mic; on denial fall back to the synthetic auto-demo.
    const micOk = await audio.startMic();
    if (micOk) {
      setStatus("mic");
    } else {
      audio.startDemo();
      setStatus("denied");
    }

    // Always kick the demo briefly if there's no immediate input so the field
    // blooms within ~1 s even with a granted-but-silent mic.
    if (micOk) {
      window.setTimeout(() => {
        const a = audioRef.current;
        const ex = extractorRef.current;
        if (a && ex && a.mode === "mic" && ex.silenceSeconds(1 / 60) > 0.8) {
          a.startDemo();
          setStatus("demo");
        }
      }, 1200);
    }
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04050a] text-foreground">
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {/* Foreground UI */}
      <div className="relative z-10 flex min-h-screen flex-col justify-between p-5 sm:p-8">
        <header className="max-w-xl">
          <h1 className="font-serif text-2xl tracking-tight text-foreground sm:text-3xl">
            Resonant Field
          </h1>
          <p className="mt-2 text-base text-foreground">
            Sing, and your voice blooms as a volume of light and grains — shaped
            in space by its timbre, not its pitch.
          </p>

          {!started && (
            <button
              type="button"
              onClick={handleStart}
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-muted px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent active:bg-muted"
            >
              Start mic
            </button>
          )}

          {started && status === "mic" && (
            <p className="mt-5 font-mono text-sm text-muted-foreground">
              Listening — make a sound and watch the field bloom.
            </p>
          )}
          {started && status === "demo" && (
            <p className="mt-5 font-mono text-sm text-muted-foreground">
              Auto-demo running (silence detected) — sing to take over.
            </p>
          )}
          {started && status === "denied" && (
            <p className="mt-5 font-mono text-sm text-violet-300">
              Mic unavailable — running the synthetic auto-demo instead.
            </p>
          )}
          {!audioOk && (
            <p className="mt-5 font-mono text-sm text-violet-300">
              Web Audio is unavailable in this browser — the visual field is
              still alive above.
            </p>
          )}
          {!webglOk && (
            <p className="mt-2 font-mono text-sm text-violet-300">
              WebGL unavailable — showing the Canvas2D glow fallback.
            </p>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            Best with headphones — the grains are placed in 3D around your head.
          </p>
        </header>

        <footer className="flex items-end justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            909 · timbre × space
          </span>
          <a
            href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/909-resonant-field-volume/README.md"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
          >
            Read the design notes
          </a>
        </footer>
      </div>
    </main>
  );
}
