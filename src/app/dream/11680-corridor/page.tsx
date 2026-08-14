"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11680-corridor — the near-death tunnel of light, taken literally: a glowing
// corridor of cloud you fly down the throat of, toward the light at the end,
// faster on every beat.
//
//   Deepens 11600-cloudveil (which drifted through an OPEN cloud toward a distant
//   sun) into navigable geometry. The WebGL2 fragment raymarcher (gl.ts) shapes
//   the density field into a TUBE-SHELL around a gently curving flight-path axis,
//   lights the corridor walls from inside with multi-octave Henyey-Greenstein
//   multiple scattering, and burns a bone-white sun at the vanishing point. Your
//   dropped audio — or, silent-by-default, a seeded piano-ish chorale — drives
//   the wall density, the end-light, its tint, and a BEAT-LOCKED flythrough
//   surge that pulls you down the tunnel on the music's hits.
//
//   Muted-06:30-phone contract: on load with NO audio you are already flying
//   slowly down the corridor and surging on a deterministic seeded beat
//   (demo.ts silentEnvelope), until the visitor starts sound.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { makeCorridorRenderer, type CorridorRenderer } from "./gl";
import { CorridorAudio } from "./audio";
import { silentEnvelope, type Features } from "./demo";
import { clamp } from "./prng";

export default function CorridorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CorridorRenderer | null>(null);
  const audioRef = useRef<CorridorAudio | null>(null);
  const rafRef = useRef<number>(0);
  const startClockRef = useRef<number>(0);
  const lastNowRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reducedRef = useRef<boolean>(false);

  // flythrough state: camera z along the axis + its (surging) forward velocity
  const camZRef = useRef<number>(0);
  const velRef = useRef<number>(1.4);
  const surgeRef = useRef<number>(0);

  const [webglOk, setWebglOk] = useState(true);
  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<"chorale" | "file">("chorale");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── mount: renderer + always-on flythrough loop (self-demo needs no audio) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeCorridorRenderer(canvas);
    if (!renderer) {
      setWebglOk(false);
      return;
    }
    rendererRef.current = renderer;
    reducedRef.current = prefersReducedMotion();

    const dpr = Math.min(1.25, window.devicePixelRatio || 1);
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      rendererRef.current?.resize(w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    startClockRef.current = performance.now();
    lastNowRef.current = startClockRef.current;

    const loop = (now: number) => {
      const t = (now - startClockRef.current) / 1000;
      const dt = clamp((now - lastNowRef.current) / 1000, 0, 0.05);
      lastNowRef.current = now;
      const reduced = reducedRef.current;

      const audio = audioRef.current;
      if (audio) audio.update();

      // Features come from the LIVE analyser once audio runs; from the
      // deterministic silent envelope before that (the muted-phone motion).
      const raw: Features = audio ? audio.readFeatures() : silentEnvelope(t);
      const energy = clamp(Math.max(raw.energy, 0.16), 0, 1);
      const low = clamp(Math.max(raw.low, 0.14), 0, 1);
      const high = clamp(raw.high, 0, 1);
      const centroid = clamp(raw.centroid, 0, 1);

      // ── beat-locked flythrough surge ──────────────────────────────────────
      // A fast-attack / slow-release envelope on the onset level: the camera
      // lunges forward on a hit, then eases back to a slow baseline drift.
      // Reduced motion caps top speed and damps the surge hard (safety: fast
      // forward motion must never read as a jarring flash).
      const surgeMax = reduced ? 1.6 : 4.6;
      const baseVel = (reduced ? 0.85 : 1.35) * (1 + 0.4 * energy);
      const target = raw.onset * surgeMax;
      // attack toward a rising target quickly; release slowly when it falls
      const rising = target > surgeRef.current;
      const rate = rising ? (reduced ? 0.35 : 0.55) : (reduced ? 0.06 : 0.045);
      surgeRef.current += (target - surgeRef.current) * rate;
      const maxVel = reduced ? 2.6 : 6.4;
      velRef.current = Math.min(maxVel, baseVel + surgeRef.current);
      camZRef.current += velRef.current * dt;

      // forward-scatter anisotropy g sharpens with high-band content
      const g = 0.34 + 0.5 * high;
      // slow, photosensitive-safe luminance drift (well under 3 Hz)
      const drift = reduced ? 0.05 : 0.1;
      const luma = 0.9 + drift * Math.sin(t * 0.16);

      rendererRef.current?.render({
        time: t,
        camZ: camZRef.current,
        energy,
        low,
        high,
        centroid,
        g,
        luma,
        reduced: reduced ? 1 : 0,
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  /** Create + resume the AudioContext (this IS the required user gesture). */
  const ensureAudio = useCallback(async (): Promise<CorridorAudio | null> => {
    if (audioRef.current) return audioRef.current;
    try {
      const audio = new CorridorAudio();
      await audio.resume();
      audioRef.current = audio;
      return audio;
    } catch {
      setError("This browser blocked audio. The flythrough continues silently.");
      return null;
    }
  }, []);

  const onStart = useCallback(async () => {
    const audio = await ensureAudio();
    if (!audio) return;
    audio.startChorale();
    setSource("chorale");
    setStarted(true);
  }, [ensureAudio]);

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const audio = await ensureAudio();
      if (!audio) return;
      setStarted(true);
      setError(null);
      try {
        const data = await file.arrayBuffer();
        await audio.playFile(data);
        setSource("file");
      } catch {
        setError("Couldn't decode that file. Flying on the seeded chorale instead.");
        audio.startChorale();
        setSource("chorale");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [ensureAudio],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 11680-corridor
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Corridor
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            The tunnel of light, made real geometry — you fly down the throat of a
            glowing corridor of cloud toward the sun at its end, faster on every beat.
          </p>
          {error ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">{error}</p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        {!webglOk ? (
          <p className="max-w-md text-center text-sm leading-relaxed text-destructive">
            This browser has no WebGL2, so the volumetric corridor can&apos;t render
            here. Try a recent desktop Chrome, Firefox, or Safari.
          </p>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={onStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the tunnel
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {source === "file" ? "Your recording" : "Seeded chorale"} · flying
              </span>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Drop in your own audio
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={onPickFile}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Design notes button */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              A tunnel you can fly down
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Cloudveil drifted through an open cloud toward a distant sun. This
                deepens it into navigable geometry: the fragment shader shapes the
                density field into a TUBE — highest in a cylindrical shell around a
                gently curving flight-path axis, near-zero on the axis — so you fly
                straight down a clear throat with the walls swirling past.
              </p>
              <p>
                Beer-Lambert absorption fades the walls with depth; a short secondary
                march down-tunnel gives each sample its self-shadow. The walls glow
                from deep inside via multi-octave Henyey-Greenstein multiple
                scattering — Sébastien Hillaire&apos;s approximation, three octaves
                scaling extinction, contribution, and phase eccentricity by ~½ each —
                all biased forward toward the bone-white sun at the vanishing point.
              </p>
              <p>
                A beat-locked surge accelerates the flythrough on the music: gated
                spectral-flux onsets add an impulse to a forward velocity that eases
                back to a slow baseline, so you get pulled down the throat on the
                hits. Loudness thickens the walls, the low band swells the end-light,
                and the spectral centroid tints it candle-amber ↔ dawn-gold — so a
                different recording paints a different light.
              </p>
              <p>
                Nothing here uses Math.random or the wall clock; every flythrough
                replays identically. No strobe — luminance drifts far below the
                photosensitive band, and reduced-motion caps the top speed and damps
                the surge.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["11680-corridor"]} />
    </main>
  );
}
