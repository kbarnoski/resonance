"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 4904-criticality — page.tsx
//
// "What if your own voice could tip a poised field over the edge — long-range
//  order into scale-free entropy — and the crossing itself felt like the
//  boundary between you and everything dissolving?"
//
// A phase-transition instrument. A 2D field sits poised just below its critical
// point (a bright, coherent "self"). The user's own voice (real Web Audio FFT /
// RMS + a low-band alpha-analogue) is the control parameter: sustained voice
// pushes the field past criticality into scale-free entropic turbulence — the
// self dissolves into a boundless glowing medium — while a consonant additive
// drone loses its harmonic coherence in lockstep. Silence lets the self re-form.
//
// This renders the MECHANISM of a visionary peak (a measurable criticality
// shift), not its content. References:
//   • Carhart-Harris et al., The Entropic Brain (2014);
//     Carhart-Harris & Friston, REBUS (2019).
//
// SAFETY (photosensitive epilepsy): default to slow luminance DRIFT, never a
// strobe. Any motion is gated by a clamped speed so per-pixel luminance stays
// far below the danger band; an always-visible "Calm / Stop" instantly freezes
// motion and silences the drone. prefers-reduced-motion damps everything.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CriticalityField, CriticalityField2D, type FieldUniforms } from "./field";
import { CriticalityCore, demoDrive, phaseName, P_CRIT } from "./criticality";
import { CriticalityDrone } from "./audio";
import { MicDriver } from "./mic";

interface Readout {
  pressure: number;
  order: number;
  entropy: number;
  crit: number;
  phase: string;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function CriticalityPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [audioOn, setAudioOn] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [intensity, setIntensity] = useState(0.25); // 0..1 → motion speed
  const [readout, setReadout] = useState<Readout>({
    pressure: 0.03,
    order: 1,
    entropy: 0,
    crit: 0,
    phase: "coherent · self intact",
  });

  // engine refs (read inside the rAF loop; never trigger re-render)
  const fieldRef = useRef<CriticalityField | null>(null);
  const field2dRef = useRef<CriticalityField2D | null>(null);
  const coreRef = useRef<CriticalityCore | null>(null);
  const droneRef = useRef<CriticalityDrone | null>(null);
  const micRef = useRef<MicDriver | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const uTimeRef = useRef(0);
  const lastTsRef = useRef(0);
  const mountTsRef = useRef(0);
  const micActiveRef = useRef(false);
  const pausedRef = useRef(false);
  const intensityRef = useRef(0.25);
  const reducedRef = useRef(false);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // ── mount: build the field + run the simulation immediately (auto-demo) ────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current = prefersReducedMotion();
    coreRef.current = new CriticalityCore(0x4904);

    // Prefer WebGL2; fall back to Canvas2D so it always paints.
    const gl = CriticalityField.create(canvas);
    if (gl) {
      fieldRef.current = gl;
    } else {
      const c2d = canvas.getContext("2d");
      if (c2d) field2dRef.current = new CriticalityField2D(c2d);
    }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    mountTsRef.current = performance.now();
    lastTsRef.current = mountTsRef.current;
    let uiCounter = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = (now - lastTsRef.current) / 1000;
      lastTsRef.current = now;
      resize();

      const core = coreRef.current;
      if (!core) return;

      if (!pausedRef.current) {
        // Driver: the user's own voice, or the seeded auto-demo before mic.
        const drive = micActiveRef.current
          ? (micRef.current?.getDrive() ?? 0)
          : demoDrive((now - mountTsRef.current) / 1000);
        const snap = core.update(dt, drive);

        // Advance the slow, safety-clamped phase accumulator.
        const reducedMul = reducedRef.current ? 0.4 : 1;
        // Base 0.6 rad/s of phase; intensity adds up to ~1.4 → still well under
        // the photosensitive band for any per-pixel luminance oscillation.
        const speed = (0.6 + intensityRef.current * 1.4) * reducedMul;
        uTimeRef.current += dt * speed;

        const u: FieldUniforms = {
          time: uTimeRef.current,
          order: snap.order,
          crit: snap.crit,
          spread: snap.spread,
        };
        fieldRef.current?.render(canvas.width, canvas.height, u);
        field2dRef.current?.render(canvas.width, canvas.height, u);
        droneRef.current?.update({
          order: snap.order,
          crit: snap.crit,
          entropy: snap.entropy,
          spread: snap.spread,
        });

        if (++uiCounter % 6 === 0) {
          setReadout({
            pressure: snap.pressure,
            order: snap.order,
            entropy: snap.entropy,
            crit: snap.crit,
            phase: phaseName(snap),
          });
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      fieldRef.current?.dispose();
      fieldRef.current = null;
      field2dRef.current?.dispose();
      field2dRef.current = null;
      droneRef.current?.stop();
      droneRef.current = null;
      micRef.current?.stop();
      micRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    };
  }, []);

  // Create the shared AudioContext + drone on first gesture.
  const ensureAudio = useCallback((): boolean => {
    if (ctxRef.current) return true;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      setNoAudio(true);
      return false;
    }
    const ctx = new Ctor();
    ctxRef.current = ctx;
    void ctx.resume();
    droneRef.current = new CriticalityDrone(ctx);
    setAudioOn(true);
    return true;
  }, []);

  // Primary: start with the user's own voice.
  const handleStartMic = useCallback(async () => {
    if (!ensureAudio()) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const mic = new MicDriver();
    const ok = await mic.start(ctx);
    if (ok) {
      micRef.current = mic;
      micActiveRef.current = true;
      setMicActive(true);
      setMicError(null);
    } else {
      setMicError(
        "Microphone unavailable or denied — running the seeded auto-demo instead. Sound still plays.",
      );
    }
  }, [ensureAudio]);

  // Secondary: play with sound but let the auto-demo drive the field.
  const handlePlayDemo = useCallback(() => {
    ensureAudio();
  }, [ensureAudio]);

  // Always-available safety control: freeze motion + silence audio instantly.
  const handleCalm = useCallback(() => {
    setPaused((prev) => {
      const next = !prev;
      if (next) droneRef.current?.calm();
      else droneRef.current?.resume();
      return next;
    });
  }, []);

  const nearCrit = readout.crit > 0.45;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#050307] text-foreground">
      {/* full-frame field */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top-left: title + description */}
      <div className="pointer-events-none absolute left-0 top-0 max-w-xl p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Criticality
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Your voice is the control parameter. Sustain it and a poised, coherent
          &ldquo;self&rdquo; is tipped past its critical point into scale-free
          entropy — the boundary between you and everything dissolving. Fall
          silent and the self re-forms.
        </p>
      </div>

      {/* top-right: nav + notes */}
      <div className="absolute right-0 top-0 flex flex-col items-end gap-2 p-5 sm:p-7">
        <Link
          href="/dream"
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ↑ all prototypes
        </Link>
        <button
          onClick={() => setShowNotes(true)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {/* readout badge */}
      <div className="pointer-events-none absolute left-5 top-32 flex flex-col gap-1 font-mono text-xs uppercase tracking-[0.14em] sm:left-7 sm:top-36">
        <div>
          <span className="text-muted-foreground">phase </span>
          <span className={nearCrit ? "text-primary" : "text-foreground"}>
            {readout.phase}
          </span>
        </div>
        <div className="text-muted-foreground">
          control {readout.pressure.toFixed(2)} · crit {P_CRIT.toFixed(2)}
        </div>
        <div className="text-muted-foreground">
          order {readout.order.toFixed(2)} · entropy {readout.entropy.toFixed(2)}
        </div>
        {micActive && (
          <div className="text-primary">mic live · your voice drives the field</div>
        )}
      </div>

      {/* bottom control bar */}
      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {!audioOn ? (
            <>
              <button
                onClick={handleStartMic}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start mic — cross the edge with your voice
              </button>
              <button
                onClick={handlePlayDemo}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Play without mic
              </button>
            </>
          ) : (
            <>
              {!micActive && (
                <button
                  onClick={handleStartMic}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Use my voice
                </button>
              )}
              <label className="flex min-h-[44px] items-center gap-3 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
                <span className="font-mono text-xs uppercase tracking-[0.14em]">
                  intensify
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={intensity}
                  onChange={(e) => setIntensity(parseFloat(e.target.value))}
                  className="w-28 accent-primary"
                  aria-label="motion intensity (capped well below flicker danger band)"
                />
              </label>
            </>
          )}

          {/* always-visible instant calm/stop */}
          <button
            onClick={handleCalm}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-pressed={paused}
          >
            {paused ? "Resume" : "Calm / Stop"}
          </button>
        </div>

        {micError && (
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-destructive">
            {micError}
          </p>
        )}
        {noAudio && (
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-destructive">
            Web Audio is unavailable in this browser — the field still runs, but
            there is no sound.
          </p>
        )}
        {!audioOn && !micError && (
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-muted-foreground">
            The field is already self-playing a seeded demo. Sound joins on your
            first tap. Headphones recommended.
          </p>
        )}
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The crossing is the dissolution
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The field is a 2D system held just below its critical point. Below
                it, a bright standing-wave mandala shows visible{" "}
                <span className="text-primary">long-range order</span> — a
                localised, coherent &ldquo;self&rdquo; with a clear boundary
                against the dark surround. Your voice is the control parameter:
                loudness (RMS) blended with a low-band{" "}
                <span className="text-primary">alpha-analogue</span> proxy raises
                it toward and past the critical value.
              </p>
              <p>
                At the crossing the correlation length diverges (a bloom of
                all-scale &ldquo;critical opalescence&rdquo;), then the long-range
                order shatters into{" "}
                <span className="text-primary">scale-free entropic turbulence</span>{" "}
                that fills the whole frame. No centre, no boundary — a boundless
                glowing medium. The drone dissolves in lockstep: consonant
                harmonic partials detune and spread off the harmonic grid, a
                broadband noise floor rises, and the reverb widens.
              </p>
              <p>
                This renders the <em>mechanism</em> of a visionary peak — a
                measurable criticality shift — not its content. In the
                neuroimaging of visionary states a collapse of posterior alpha
                pushes cortex past its slightly-subcritical operating point, and the size
                of that shift tracks rated ego-dissolution. Framing:
                Carhart-Harris et&nbsp;al., <em>The Entropic Brain</em> (2014);
                Carhart-Harris &amp; Friston, REBUS (2019). It is a metaphor made
                literal, not a claim that the brain is this exact system.
              </p>
              <p>
                <span className="text-primary">Safety.</span> Motion defaults to
                slow luminance drift, never a strobe. The phase advances at a
                clamped speed so per-pixel luminance stays far below the
                photosensitive danger band; <em>Intensify</em> stays under ~3&nbsp;Hz.{" "}
                <em>Calm / Stop</em> freezes all motion and silences the drone the
                same frame. <span className="font-mono">prefers-reduced-motion</span>{" "}
                damps everything.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
