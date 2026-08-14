"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11712-attractorveil — a vast breathing cloud of light-points streaming along a
// strange attractor: a cosmic nebula that is genuinely DIFFERENT at minute 5 than
// at minute 1.
//
//   ~80,000 GPU points (gl.ts, WebGL2 transform feedback) trace a PETER DE JONG
//   attractor flow field. A bank of VOSS–McCARTNEY 1/f generators (evolution.ts)
//   slowly walks the attractor's shape, density, palette, and the drone's harmony
//   over minutes — long-form, no loop, deterministic from the seed. A self-driving
//   ambient pad (audio.ts) evolves with the same process; its amplitude + spectral
//   brightness feed back into the veil's glow and flow speed.
//
//   Muted-06:30-phone contract: on load, with NO audio, the nebula is already
//   flowing and evolving — the visuals run off the seeded 1/f swell against a
//   zero audio envelope. Starting sound only un-mutes the pad.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { makeVeilRenderer, type VeilRenderer } from "./gl";
import { VeilAudio } from "./audio";
import { Evolution, type Features } from "./evolution";
import { mulberry32, SEED, clamp } from "./prng";

export default function AttractorVeilPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<VeilRenderer | null>(null);
  const audioRef = useRef<VeilAudio | null>(null);
  const evoRef = useRef<Evolution | null>(null);
  const rafRef = useRef<number>(0);
  const startClockRef = useRef<number>(0);
  const lastNowRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  const [webglOk, setWebglOk] = useState(true);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── mount: renderer + always-on evolving loop (self-demo needs no audio) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // deterministic buffer seeding (never Math.random)
    const seedRandom = mulberry32(SEED ^ 0xc10d);
    const renderer = makeVeilRenderer(canvas, seedRandom);
    if (!renderer || !renderer.ok) {
      renderer?.dispose();
      setWebglOk(false);
      return;
    }
    rendererRef.current = renderer;
    evoRef.current = new Evolution();
    reducedRef.current = prefersReducedMotion();

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      rendererRef.current?.resize(w, h, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    startClockRef.current = performance.now();
    lastNowRef.current = startClockRef.current;

    const loop = (now: number) => {
      const age = (now - startClockRef.current) / 1000;
      const dt = clamp((now - lastNowRef.current) / 1000, 0, 0.05);
      lastNowRef.current = now;
      const reduced = reducedRef.current;

      const evo = evoRef.current!.update(age);

      const audio = audioRef.current;
      if (audio) audio.update(evo);

      // Features come from the LIVE analyser once audio runs; before that, from
      // the seeded 1/f swell (the muted-phone motion) with a silent centroid.
      const raw: Features = audio
        ? audio.readFeatures()
        : { amp: evo.swell, centroid: 0.4 };
      const amp = clamp(Math.max(raw.amp, 0.12), 0, 1);

      // flow speed: attractor-drift × audio × reduced-motion. Reduced motion
      // slows the stream and removes fast brightness change (cosmic register).
      const flowBase = reduced ? 1.5 : 3.0;
      const flow = flowBase * (0.5 + 0.9 * evo.flow) * (0.55 + 0.85 * amp);

      // palette balance nudged a touch by spectral brightness when audio is on
      const hue = clamp(evo.hue + (raw.centroid - 0.4) * 0.3, 0, 1);

      rendererRef.current?.render({
        a: evo.a,
        b: evo.b,
        c: evo.c,
        d: evo.d,
        age,
        dt,
        flow,
        amp,
        hue,
        density: evo.density,
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
      evoRef.current = null;
    };
  }, []);

  const onStart = useCallback(async () => {
    if (audioRef.current || !evoRef.current) return;
    try {
      const audio = new VeilAudio();
      await audio.resume();
      audio.start(evoRef.current.update((performance.now() - startClockRef.current) / 1000));
      audioRef.current = audio;
      setStarted(true);
      setError(null);
    } catch {
      setError("This browser blocked audio. The nebula keeps evolving silently.");
    }
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 11712-attractorveil
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Attractor Veil
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            A vast breathing cloud of light-points streaming along a strange
            attractor — a cosmic nebula that is genuinely different at minute five
            than at minute one, slowly reshaped by a self-driving drone.
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
            This browser has no WebGL2 transform feedback, so the GPU particle
            nebula can&apos;t render here. Try a recent desktop Chrome, Firefox, or
            Safari.
          </p>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={onStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Sound the nebula
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Evolving drone · streaming
              </span>
            )}
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
              A nebula that never returns
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Around eighty thousand light-points live entirely on the GPU. Each
                frame a WebGL2 vertex shader advances every point one step along a
                Peter de Jong strange-attractor flow field, writing the new
                positions straight into a second vertex buffer via transform
                feedback; the buffers ping-pong, so the cloud accumulates on the
                GPU and the CPU never touches a particle after upload.
              </p>
              <p>
                A bank of Voss–McCartney 1/f (pink-noise) generators slowly walks
                the attractor&apos;s four parameters, the veil&apos;s density and
                palette, and the drone&apos;s harmony over minutes. Pink noise is
                dominated by low frequencies, so everything drifts slowly and
                organically — and, being a random walk, never returns to the same
                state. The nebula at minute five is a different shape, density,
                colour balance, and chord than at minute one.
              </p>
              <p>
                The sound is self-driving: a bank of continuous oscillator voices
                whose frequencies glide toward the wandering chord — a boundless,
                meditative pad, never a loop. Its amplitude and spectral brightness
                feed back into the points&apos; glow and flow speed, so louder,
                brighter passages quicken and ignite the streams.
              </p>
              <p>
                On load, with no sound, the nebula is already flowing and evolving
                off the seeded 1/f swell — the muted-phone contract. Nothing uses
                Math.random or the wall clock; the whole evolution is a pure
                function of the age clock, identical every visit. No strobe —
                luminance drifts slowly, and reduced-motion slows the stream.
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

      <PrototypeNav slugs={["11712-attractorveil"]} />
    </main>
  );
}
