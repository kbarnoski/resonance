"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15200 · Schlieren — see Karel's recording as the air it moves.
//
//   ONE QUESTION
//   What if you could SEE his recording as the air it moves — a shadowgraph of
//   sound?
//
//   INPUT   the live band energies (low / mid / high / RMS + onset) of ONE of his
//           real takes, played through the shared safeMaster ear-safety bus.
//   OUTPUT  a synthetic knife-edge SCHLIEREN image: a WebGL2 damped-wave field of
//           "air" forced by his music, rendered as the signed density gradient
//           projected onto a knife-edge — near-black at rest, luminous grayscale
//           plumes and ripples billowing from unseen sources as he plays.
//   VERB    audio band energy → pressure emitters → 2D damped wave (GPU ping-pong)
//           → central-difference gradient → knife-edge projection → grayscale.
//
//   REFS  Toepler 1864 (schlieren); A.J. Settles, *Schlieren and Shadowgraph
//         Techniques* (2001); the modern synthetic / background-oriented schlieren
//         (BOS) line. Achromatic on purpose — schlieren imaging is monochrome.
//
//   AUDIO Karel's verified catalog ONLY. Zero oscillators, zero synth tones.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  SchlierenField,
  type FieldFailure,
  type FieldDrive,
  type RenderParams,
} from "./schlierenField";
import { AudioEngine } from "./audioEngine";

const DEFAULT_TRACK = "d57cfae6-f234-4d24-85fe-72a8ad93a44a"; // Interplay

const failureNotice: Record<FieldFailure, string> = {
  "no-webgl2":
    "This piece needs WebGL2 to render the air, and this browser doesn't offer it. The recording will still play if you begin.",
  "no-float-render":
    "This device's WebGL2 can't render the floating-point field this piece simulates. The recording will still play if you begin.",
  "gl-error":
    "The graphics field couldn't be initialised on this device. The recording will still play if you begin.",
};

export default function SchlierenPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const fieldRef = useRef<SchlierenField | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const viewRef = useRef<{ w: number; h: number }>({ w: 1, h: 1 });

  // live-tunable refs read inside the loop
  const knifeRef = useRef<number>(0);
  const reducedMotionRef = useRef<boolean>(false);
  const pointerRef = useRef<{ x: number; y: number; amp: number } | null>(null);
  const draggingRef = useRef<boolean>(false);
  const knifeDragRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; knife: number }>({ x: 0, knife: 0 });

  // react state
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TRACK);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glNotice, setGlNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [knifeDeg, setKnifeDeg] = useState(0);
  const [tiltOn, setTiltOn] = useState(false);
  const [tiltAvailable, setTiltAvailable] = useState(false);

  const title =
    REAL_TRACKS.find((t) => t.id === selectedId)?.title ?? "Welcome Home";

  // ── reduced motion ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = () => (reducedMotionRef.current = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── canvas sizing (DPR-aware, square-ish stage) ────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth || 640;
      const h = Math.round(w * 0.62);
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      c.style.height = `${h}px`;
      viewRef.current = { w: c.width, h: c.height };
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── feature-detect device orientation (mobile knife-edge tilt) ─────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      setTiltAvailable(true);
    }
  }, []);

  useEffect(() => {
    if (!tiltOn) return;
    const handler = (e: DeviceOrientationEvent) => {
      if (e.gamma == null) return;
      // gamma is left/right tilt, -90..90 → knife angle
      const a = (e.gamma / 90) * Math.PI;
      knifeRef.current = a;
      setKnifeDeg(Math.round((((a * 180) / Math.PI) % 360 + 360) % 360));
    };
    window.addEventListener("deviceorientation", handler);
    return () => window.removeEventListener("deviceorientation", handler);
  }, [tiltOn]);

  // ── the render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const loop = (ts: number) => {
      const field = fieldRef.current;
      const audio = audioRef.current;
      const reduced = reducedMotionRef.current;

      // throttle to ~30fps under reduced motion, else uncapped rAF
      const minGap = reduced ? 1000 / 30 : 0;
      if (ts - lastTsRef.current < minGap) {
        raf = requestAnimationFrame(loop);
        rafRef.current = raf;
        return;
      }
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000 || 0.016);
      lastTsRef.current = ts;

      if (field && audio) {
        const drive: FieldDrive = audio.read();
        const params: RenderParams = {
          knifeAngle: knifeRef.current,
          sensitivity: 3.2,
          glow: 1.6,
          exposure: 1.7,
          motion: reduced ? 0.4 : 1,
          pointer: pointerRef.current,
          dt,
          time: ts / 1000,
        };
        const substeps = reduced ? 1 : 2;
        const v = viewRef.current;
        field.render(drive, params, v.w, v.h, substeps);
      }
      raf = requestAnimationFrame(loop);
      rafRef.current = raf;
    };
    raf = requestAnimationFrame(loop);
    rafRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, [started]);

  // ── build field + audio for a track ────────────────────────────────────────
  const buildForTrack = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    const safe = safeRef.current;
    if (!ctx || !safe) return;

    const { buffer } = await loadRealTrackBuffer(ctx, id);

    // (re)build the audio engine
    audioRef.current?.stop();
    const audio = new AudioEngine(ctx, safe, buffer);
    audio.start();
    audioRef.current = audio;

    // field can be reset rather than rebuilt; reset for a clean stage
    fieldRef.current?.reset();
  }, []);

  // ── start on first gesture ─────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      // create the GL field first (needs the canvas), independent of audio
      const canvas = canvasRef.current;
      if (canvas && !fieldRef.current) {
        const f = SchlierenField.create(canvas);
        if (typeof f === "string") {
          setGlNotice(failureNotice[f]);
        } else {
          fieldRef.current = f;
          setGlNotice(null);
        }
      }

      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtor();
      await ctx.resume();
      const safe = createSafeMaster(ctx);
      ctxRef.current = ctx;
      safeRef.current = safe;

      await buildForTrack(selectedId);
      lastTsRef.current = performance.now();
      setStarted(true);
    } catch {
      setError(
        "Couldn't load Karel's recording. Check your connection and try again.",
      );
      audioRef.current?.stop();
      safeRef.current?.disconnect();
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
      ctxRef.current = null;
      safeRef.current = null;
      audioRef.current = null;
    } finally {
      setStarting(false);
    }
  }, [starting, selectedId, buildForTrack]);

  // ── track switch after start ───────────────────────────────────────────────
  const onSelectTrack = useCallback(
    async (id: string) => {
      setSelectedId(id);
      if (!started) return;
      setLoadingTrack(true);
      setError(null);
      try {
        await buildForTrack(id);
      } catch {
        setError("Couldn't load that recording. Try another track.");
      } finally {
        setLoadingTrack(false);
      }
    },
    [started, buildForTrack],
  );

  // ── pointer: vertical drag rotates the knife-edge, click injects a plume ────
  const uvFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0.5, y: 0.5 };
    const r = c.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!started) return;
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      knifeDragRef.current = false;
      dragStartRef.current = { x: e.clientX, knife: knifeRef.current };
      const uv = uvFromEvent(e);
      pointerRef.current = { x: uv.x, y: uv.y, amp: 0.9 };
    },
    [started],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      const uv = uvFromEvent(e);
      if (pointerRef.current) {
        pointerRef.current.x = uv.x;
        pointerRef.current.y = uv.y;
      }
      // horizontal travel rotates the knife-edge (a real schlieren control)
      const dx = e.clientX - dragStartRef.current.x;
      if (Math.abs(dx) > 6) knifeDragRef.current = true;
      if (knifeDragRef.current) {
        const c = canvasRef.current;
        const wpx = c?.getBoundingClientRect().width || 640;
        const a = dragStartRef.current.knife + (dx / wpx) * Math.PI * 1.5;
        knifeRef.current = a;
        setKnifeDeg(Math.round(((((a * 180) / Math.PI) % 360) + 360) % 360));
      }
    },
    [],
  );

  const endPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    draggingRef.current = false;
    pointerRef.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  const applyKnifeSlider = useCallback((deg: number) => {
    setKnifeDeg(deg);
    knifeRef.current = (deg * Math.PI) / 180;
  }, []);

  // iOS 13+ gates device orientation behind an explicit permission request
  const toggleTilt = useCallback(async () => {
    if (tiltOn) {
      setTiltOn(false);
      return;
    }
    try {
      const D = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof D?.requestPermission === "function") {
        const res = await D.requestPermission();
        if (res !== "granted") return;
      }
    } catch {
      /* not gated on this platform */
    }
    setTiltOn(true);
  }, [tiltOn]);

  // ── teardown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      fieldRef.current?.dispose();
      safeRef.current?.disconnect();
      const c = ctxRef.current;
      if (c && c.state !== "closed") void c.close();
    };
  }, []);

  const busy = starting || loadingTrack;

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Design notes
      </button>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-8 sm:px-10">
        <header className="max-w-2xl">
          <Link
            href="/dream"
            className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
          >
            ← all prototypes
          </Link>
          <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Shadowgraph of sound
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Schlieren
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            See Karel&apos;s recording as the air it moves — a synthetic
            knife-edge schlieren image of his music, rendered as luminous plumes
            of disturbed density billowing from unseen sources.
          </p>
        </header>

        {/* ── the schlieren stage ── */}
        <div className="relative overflow-hidden rounded-lg border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none select-none"
            style={{ cursor: started ? "crosshair" : "default" }}
            onPointerDown={started ? onPointerDown : undefined}
            onPointerMove={started ? onPointerMove : undefined}
            onPointerUp={started ? endPointer : undefined}
            onPointerCancel={started ? endPointer : undefined}
            aria-label="Knife-edge schlieren image of Karel's recording — drag horizontally to rotate the knife-edge, press to disturb the air"
          />

          {started && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-border bg-background/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
              knife {knifeDeg}°
            </div>
          )}

          {/* pre-start / loading overlay */}
          {(!started || busy) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-6 text-center backdrop-blur-sm">
              {!started && !busy && (
                <>
                  <button
                    type="button"
                    onClick={() => void start()}
                    className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Play
                  </button>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Loads one of Karel&apos;s real recordings and renders the air
                    it moves as a shadowgraph of sound.
                  </p>
                </>
              )}
              {busy && (
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {starting ? "Loading his recording…" : "Switching take…"}
                </p>
              )}
            </div>
          )}
        </div>

        {glNotice && (
          <p className="text-sm text-muted-foreground" role="status">
            {glNotice}
          </p>
        )}
        {error && (
          <p className="text-base text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* ── status line ── */}
        <p className="text-sm text-muted-foreground">
          {started ? (
            <>
              <span className="text-foreground">
                The air is moving to {title}.
              </span>{" "}
              Bright and dark are the density gradient cut by the knife-edge —
              drag across the frame to rotate the knife and reveal ripples in a
              different direction, or press to disturb the air yourself.
            </>
          ) : (
            "A field of simulated air, forced by the low, mid and high energy of his playing, rendered as a classic monochrome knife-edge schlieren image."
          )}
        </p>

        {/* ── controls ── */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* track selector */}
          <section className="space-y-2">
            <label
              htmlFor="sch-track"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              His recording {loadingTrack && "· loading…"}
            </label>
            <select
              id="sch-track"
              value={selectedId}
              onChange={(e) => void onSelectTrack(e.target.value)}
              disabled={busy}
              className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground disabled:opacity-60"
            >
              {REAL_TRACKS.map((tk) => (
                <option key={tk.id} value={tk.id}>
                  {tk.title}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              Every plume and ripple is forced by this take — his own sound made
              visible as air.
            </p>
          </section>

          {/* knife-edge angle */}
          <section className="space-y-2">
            <label
              htmlFor="sch-knife"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              Knife-edge angle · {knifeDeg}°
            </label>
            <input
              id="sch-knife"
              type="range"
              min={0}
              max={359}
              step={1}
              value={knifeDeg}
              onChange={(e) => applyKnifeSlider(Number(e.target.value))}
              disabled={!started}
              className="w-full accent-primary"
            />
            <p className="text-sm text-muted-foreground">
              A real schlieren control: the knife reveals density gradients along
              one axis and hides those perpendicular to it.
            </p>
            {tiltAvailable && (
              <button
                type="button"
                onClick={() => void toggleTilt()}
                disabled={!started}
                className={
                  tiltOn
                    ? "min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    : "min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                }
              >
                {tiltOn ? "Tilt controls the knife-edge" : "Tilt to rotate (optional)"}
              </button>
            )}
          </section>
        </div>
      </div>

      {/* ── design notes overlay ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                could see his recording as the air it moves — a shadowgraph of
                sound?
              </p>
              <p>
                <span className="text-foreground">Schlieren imaging.</span> Since
                Toepler (1864), schlieren optics have made invisible density and
                refractive-index gradients in a transparent medium visible — it is
                how shockwaves, heat plumes and even sound in air are photographed
                (A.J. Settles, <em>Schlieren and Shadowgraph Techniques</em>,
                2001). A point source is collimated through the test region and
                refocused onto a knife-edge; light bent by a gradient toward the
                edge is blocked and reads dark, light bent away passes and reads
                bright. The modern synthetic and background-oriented schlieren
                (BOS) line recreates this computationally — which is exactly what
                this piece does.
              </p>
              <p>
                <span className="text-foreground">The field.</span> A 256×256
                grid of &quot;air&quot; lives in two half-float textures ping-ponged
                on the GPU as a damped 2D wave equation. It ripples and settles;
                clamping and border absorption keep it numerically stable rather
                than blowing up.
              </p>
              <p>
                <span className="text-foreground">His music drives it.</span> The
                live signal is split into low, mid and high band energies plus
                overall RMS and a spectral-flux onset detector. Four fixed emitter
                points are pumped with pressure proportional to those bands — quiet
                passages breathe as meditative plumes, loud onsets fire sharp
                shockwave-like ripples. The only sound is his decoded recording,
                played through the shared safeMaster ear-safety bus. No
                oscillators, no synthesized tones.
              </p>
              <p>
                <span className="text-foreground">The render.</span> A final shader
                takes the field&apos;s spatial gradient by central differences,
                projects it onto a knife-edge direction, and maps that signed
                scalar to grayscale around a near-black rest with a luminous glow on
                the plume edges. It is kept achromatic on purpose — real schlieren
                imaging is monochrome.
              </p>
              <p>
                <span className="text-foreground">Interaction.</span> Dragging
                horizontally rotates the knife-edge, revealing gradients along a
                different axis (a genuine schlieren control); pressing disturbs the
                air with an extra emitter. On a phone you can optionally let tilt
                rotate the knife. The piece works fully untouched.
              </p>
              <p>
                <span className="text-foreground">Honest limits.</span> This is a
                2D scalar wave, not a real Navier–Stokes fluid or a true optical
                ray-trace, and the emitters are stand-ins for where the sound
                &quot;enters&quot; the air — a poetic analogue rather than a
                physical measurement. If WebGL2 or float-render is unavailable the
                recording still plays and an on-brand notice explains why the field
                is dark. Reduced-motion calms and slows the field. Everything is
                torn down on unmount.
              </p>
              <p className="pt-1 font-mono text-xs text-muted-foreground/80">
                medium:air · cut:knife-edge · palette:achromatic
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15200-schlieren"]} />
    </main>
  );
}
