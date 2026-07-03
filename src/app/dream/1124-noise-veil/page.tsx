"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { FogScene, hasWebGL } from "./scene";
import { NoiseVeilAudio } from "./audio";
import { computeField } from "./field";
import { mulberry32, slopeToLabel } from "./noise";

type Phase = "idle" | "running" | "error";

const SEED = 0x0511_1124;

// Fallback field palette (mirrors scene.ts base anchors) as [r,g,b] 0..255.
const FB_WHITE = [158, 163, 174];
const FB_PINK = [128, 92, 92];
const FB_BROWN = [23, 66, 74];

function lerp3(a: number[], b: number[], t: number): number[] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function slopeFallbackCss(slope: number, drive: number): string {
  const s = Math.min(1, Math.max(0, slope));
  const base =
    s <= 0.5
      ? lerp3(FB_WHITE, FB_PINK, s / 0.5)
      : lerp3(FB_PINK, FB_BROWN, (s - 0.5) / 0.5);
  const lift = 0.9 + 0.25 * drive;
  const b = base.map((c) => Math.min(255, Math.round(c * lift)));
  const glow = base.map((c) => Math.min(255, Math.round(c * 1.4)));
  return `radial-gradient(120% 120% at 50% 45%, rgb(${glow[0]},${glow[1]},${glow[2]}) 0%, rgb(${b[0]},${b[1]},${b[2]}) 70%)`;
}

export default function NoiseVeilPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<FogScene | null>(null);
  const audioRef = useRef<NoiseVeilAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const slopeRef = useRef(0.75); // start near brown — the study's signature
  const intensityRef = useRef(0.65);
  const reducedRef = useRef(false);
  const startTimeRef = useRef(0);
  const audioAccumRef = useRef(0);
  const readoutAccumRef = useRef(0);
  const noWebGLRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [slope, setSlope] = useState(0.75);
  const [intensity, setIntensity] = useState(0.65);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [driveReadout, setDriveReadout] = useState(0);

  const resize = useCallback(() => {
    sceneRef.current?.resize();
  }, []);

  // ── the field loop — runs immediately on mount, before any audio ──
  const loop = useCallback(() => {
    const now = performance.now() / 1000;
    const t = now - startTimeRef.current;
    const f = computeField(
      t,
      slopeRef.current,
      intensityRef.current,
      reducedRef.current,
    );

    sceneRef.current?.setField(f);

    // fallback CSS field (only present when WebGL is unavailable)
    const fb = fallbackRef.current;
    if (fb) fb.style.background = slopeFallbackCss(f.slope, f.drive);

    // push to audio at ~20 Hz
    audioAccumRef.current += 1;
    if (audioAccumRef.current >= 3) {
      audioAccumRef.current = 0;
      audioRef.current?.applyField(f);
    }

    // readout at ~6 Hz
    readoutAccumRef.current += 1;
    if (readoutAccumRef.current >= 10) {
      readoutAccumRef.current = 0;
      setDriveReadout(f.drive);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── mount: build the visual field and start it hands-free ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    startTimeRef.current = performance.now() / 1000;

    const container = containerRef.current;
    if (container && hasWebGL()) {
      try {
        const rand = mulberry32(SEED);
        const scene = new FogScene(container, rand);
        sceneRef.current = scene;
        scene.start();
      } catch {
        noWebGLRef.current = true;
        setNotice(
          "3D fog is unavailable on this device — showing a soft gradient field instead. The noise bath still plays.",
        );
      }
    } else {
      noWebGLRef.current = true;
      setNotice(
        "WebGL is unavailable on this device — showing a soft gradient field instead. The noise bath still plays.",
      );
    }

    rafRef.current = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => {
          if (ctx.state !== "closed") void ctx.close();
        }, 700);
      }
      ctxRef.current = null;
    };
  }, [loop, resize]);

  const handleBegin = useCallback(async () => {
    if (phase === "running") return;
    try {
      const AC =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx: AudioContext = new AC();
      await ctx.resume();
      ctxRef.current = ctx;
      const audio = new NoiseVeilAudio(ctx, SEED);
      audio.start();
      // seed the graph with the current field immediately
      audio.applyField(
        computeField(
          performance.now() / 1000 - startTimeRef.current,
          slopeRef.current,
          intensityRef.current,
          reducedRef.current,
        ),
      );
      audioRef.current = audio;
      setPhase("running");
    } catch {
      setNotice(
        "Audio could not start on this device — the visual field continues silently.",
      );
      setPhase("error");
    }
  }, [phase]);

  const onSlope = useCallback((v: number) => {
    const s = Math.min(1, Math.max(0, v));
    slopeRef.current = s;
    setSlope(s);
  }, []);

  const onIntensity = useCallback((v: number) => {
    const i = Math.min(1, Math.max(0, v));
    intensityRef.current = i;
    setIntensity(i);
  }, []);

  // keyboard steering: ←/→ spectrum, ↑/↓ intensity
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onSlope(slopeRef.current - 0.05);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onSlope(slopeRef.current + 0.05);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onIntensity(intensityRef.current + 0.05);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onIntensity(intensityRef.current - 0.05);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSlope, onIntensity]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#3a4a52] text-white">
      {/* volumetric fog canvas mounts here */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {/* CSS gradient fallback field (only when WebGL is unavailable) */}
      {noWebGLRef.current && (
        <div
          ref={fallbackRef}
          className="absolute inset-0 h-full w-full"
          aria-hidden
        />
      )}

      {/* product panel */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4 sm:p-6">
        <div className="pointer-events-auto max-w-xl rounded-2xl border border-white/15 bg-black/55 p-4 shadow-xl backdrop-blur-md sm:p-5">
          <h1 className="font-serif text-2xl text-white sm:text-3xl">
            Noise Veil
          </h1>
          <p className="mt-1.5 text-base leading-relaxed text-white/85">
            Rest your gaze in a soft, uniform fog and let the sound compose the
            vision. Slide the noise from{" "}
            <span className="text-white/95">white</span> through{" "}
            <span className="text-white/95">pink</span> to{" "}
            <span className="text-white/95">brown</span> — its spectral slope
            steers what imagery your own brain manufactures.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {phase !== "running" && (
              <button
                onClick={handleBegin}
                className="min-h-[44px] rounded-full bg-teal-300/95 px-4 py-2.5 text-base font-medium text-teal-950 transition-colors hover:bg-teal-200"
              >
                {phase === "error" ? "Retry audio" : "Begin the noise bath"}
              </button>
            )}
            {phase === "running" && (
              <span className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base font-medium text-white/90">
                bath playing · hands-free
              </span>
            )}
          </div>

          {/* spectrum morph — the instrument */}
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="flex items-center justify-between text-base text-white/80">
                <span>spectrum</span>
                <span className="text-teal-200">{slopeToLabel(slope)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={slope}
                onChange={(e) => onSlope(parseFloat(e.target.value))}
                aria-label="noise spectrum: white to pink to brown"
                className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-slate-200 via-rose-300 to-teal-800 accent-teal-300"
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between text-base text-white/80">
                <span>intensity</span>
                <span className="text-teal-200">
                  {Math.round(intensity * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={intensity}
                onChange={(e) => onIntensity(parseFloat(e.target.value))}
                aria-label="bath intensity"
                className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-teal-300"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-white/75">
            <span>
              swell{" "}
              <span className="text-teal-200">{driveReadout.toFixed(2)}</span>
            </span>
            <span className="text-white/60">
              ←/→ spectrum · ↑/↓ intensity · no flicker
            </span>
          </div>

          {notice && (
            <p className="mt-3 text-base text-rose-300">{notice}</p>
          )}
        </div>
      </div>

      {/* design-notes panel */}
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex max-w-[calc(100%-2rem)] flex-col items-end gap-2">
        {showNotes && (
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-white/15 bg-black/70 p-4 text-base leading-relaxed text-white/85 shadow-xl backdrop-blur-md">
            <p className="mb-2 text-white/95">
              A Ganzfeld pairs a uniform visual field with auditory noise; sensory
              homogeneity lets the brain start manufacturing imagery. The finding
              this piece is built on (Pistolas, Smets &amp; Wagemans,{" "}
              <span className="italic">i-Perception</span> 2025) is that the
              noise&rsquo;s <span className="text-teal-200">spectral slope</span>{" "}
              shapes the <em>content</em>: brown noise pushed viewers toward
              water/fluid themes vs white.
            </p>
            <p className="mb-2 text-white/80">
              So the slope is the instrument. Three seeded noise buffers
              (white/pink/brown) equal-power crossfade, spread across five HRTF
              panners that slowly orbit you in a &ldquo;wave after wave&rdquo;
              swell, driving a three.js volumetric fog whose palette and current
              track the spectrum: white → bright even, pink → warm glow, brown →
              deep teal oceanic drift.
            </p>
            <p className="text-white/70">
              No health claim. Ganzfeld imagery is a normal product of sensory
              homogeneity — viewer- and hardware-dependent, not a fixed effect.
              This induces the conditions; it does not cause an experience. Full
              notes in <span className="font-mono">README.md</span>.
            </p>
          </div>
        )}
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="pointer-events-auto min-h-[44px] rounded-full border border-white/15 bg-black/60 px-4 py-2.5 text-base font-medium text-white/95 shadow-lg backdrop-blur-md transition-colors hover:bg-black/75"
        >
          {showNotes ? "Hide notes" : "Read the design notes"}
        </button>
      </div>

      <PrototypeNav slugs={["1124-noise-veil"]} />
    </main>
  );
}
