"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11600-cloudveil — dissolve into a boundless, glowing cloud of light you drift
// through toward a distant sun.
//
//   A cosmic-ambient near-death-tunnel-of-light experience rendered as REAL
//   volumetric light transport: a WebGL2 fragment shader ray-marches a 3D
//   density field, accumulates light with Beer-Lambert absorption, and biases
//   scattering forward toward the sun with a Henyey-Greenstein phase function
//   (gl.ts). Your dropped audio file — or, silent-by-default, a seeded piano-ish
//   chorale — drives the cloud's density, the sun's intensity, and the
//   forward-scatter anisotropy.
//
//   Muted-06:30-phone contract: the cloud breathes on load with NO audio, from
//   demo.ts's deterministic silentEnvelope, until the visitor starts sound.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { makeCloudRenderer, type CloudRenderer } from "./gl";
import { CloudAudio } from "./audio";
import { silentEnvelope, type Features } from "./demo";
import { clamp } from "./prng";

export default function CloudveilPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CloudRenderer | null>(null);
  const audioRef = useRef<CloudAudio | null>(null);
  const rafRef = useRef<number>(0);
  const startClockRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const reducedRef = useRef<boolean>(false);

  const [webglOk, setWebglOk] = useState(true);
  const [started, setStarted] = useState(false);
  const [source, setSource] = useState<"chorale" | "file">("chorale");
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── mount: renderer + always-on animation loop (self-demo needs no audio) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeCloudRenderer(canvas);
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

    const loop = (now: number) => {
      const t = (now - startClockRef.current) / 1000;
      const reduced = reducedRef.current;

      const audio = audioRef.current;
      if (audio) audio.update();

      // Features come from the LIVE analyser once audio is running; from the
      // deterministic silent envelope before that (the muted-phone motion).
      const raw: Features = audio ? audio.readFeatures() : silentEnvelope(t);
      const energy = clamp(Math.max(raw.energy, 0.16), 0, 1);
      const low = clamp(Math.max(raw.low, 0.14), 0, 1);
      const high = clamp(raw.high, 0, 1);

      // forward-scatter anisotropy g rises with high-band content
      const g = 0.18 + 0.6 * high;
      // slow, photosensitive-safe luminance drift (well under 3 Hz)
      const drift = reduced ? 0.05 : 0.14;
      const luma = 0.85 + drift * Math.sin(t * 0.18);

      rendererRef.current?.render({ time: t, energy, low, high, g, luma, reduced: reduced ? 1 : 0 });
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
  const ensureAudio = useCallback(async (): Promise<CloudAudio | null> => {
    if (audioRef.current) return audioRef.current;
    try {
      const audio = new CloudAudio();
      await audio.resume();
      audioRef.current = audio;
      return audio;
    } catch {
      setError("This browser blocked audio. The cloud keeps drifting silently.");
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
        setError("Couldn't decode that file. Drifting on the seeded chorale instead.");
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
            Dream · 11600-cloudveil
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Cloudveil
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            Your music dissolves you into a boundless glow — real volumetric light,
            scattered forward through a drifting cloud, toward a distant sun.
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
            This browser has no WebGL2, so the volumetric cloud can&apos;t render here.
            Try a recent desktop Chrome, Firefox, or Safari.
          </p>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={onStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin the drift
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {source === "file" ? "Your recording" : "Seeded chorale"} · drifting
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
              Volumetric light, not a surface
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The lab raymarches signed-distance fields into hard surfaces 65 times
                over. This one instead transports light through a participating
                medium: the fragment shader marches a ray through a 3D fbm density
                field and accumulates scattered light along the way.
              </p>
              <p>
                Each step attenuates by Beer-Lambert absorption
                (transmittance ×= exp(−density · absorption · step)), a short
                secondary march toward the sun gives that sample&apos;s self-shadow,
                and a Henyey-Greenstein phase function biases the scattering forward
                — so the cloud rim blooms as you drift into the light.
              </p>
              <p>
                Audio drives it: loudness thickens the veil, the low band swells the
                sun, and the high band sharpens the forward-scatter anisotropy g.
                With no audio, a deterministic seeded envelope keeps the cloud
                breathing — nothing here uses Math.random or the wall clock, so every
                drift replays identically.
              </p>
              <p>
                After Maxime Heckel, &ldquo;Real-time dreamy Cloudscapes with
                Volumetric Raymarching,&rdquo; and the Henyey-Greenstein phase
                function from atmospheric light-scattering.
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

      <PrototypeNav slugs={["11600-cloudveil"]} />
    </main>
  );
}
