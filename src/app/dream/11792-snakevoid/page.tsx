"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11792-snakevoid — A FIELD OF LIGHT THAT IS NOT MOVING, YET BREATHES AND TURNS.
//
//   The peripheral drift illusion (Faubert & Herbert 1999; Akiyoshi Kitaoka's
//   "Rotating Snakes"). Concentric rings of a repeated 4-step ASYMMETRIC
//   luminance sawtooth — black → dark-gray → white → light-gray — that the visual
//   system reads as continuous self-motion while the pixels are essentially
//   STATIC. No flashing. The stillness is the whole point, and the safety win.
//
//   A self-driving generative drone bed swells; its real output spectrum
//   modulates the ring contrast and a SUB-THRESHOLD real drift, so the illusory
//   rotation appears to speed, slow, and reverse with the sound. An optional mic
//   lets the room push the same swell. Muted-phone contract: from mount, with NO
//   audio and NO mic, a seeded deterministic driver already breathes the field.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeFlicker,
  prefersReducedMotion,
  type SafeFlicker,
} from "../_shared/visionary/safeFlicker";
import { makeFieldRenderer, type FieldRenderer } from "./gl";
import { SnakeAudio } from "./audio";
import { BreathDriver } from "./demo";
import { SEED, clamp } from "./prng";

const RING_WIDTH = 0.044; // normalized ring radial width (fraction of short axis)

interface LoopState {
  driftA: number; // accumulated angular drift phase (element units, sub-threshold)
  driftR: number; // accumulated radial drift phase (ring units, sub-threshold)
  drive: number; // smoothed swell 0..1
}

export default function SnakeVoidPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<SnakeAudio | null>(null);
  const driverRef = useRef<BreathDriver | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const rafRef = useRef<number>(0);
  const startClockRef = useRef<number>(0);
  const lastNowRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const micOnRef = useRef<boolean>(false);
  const stateRef = useRef<LoopState>({ driftA: 0, driftR: 0, drive: 0.3 });

  const [webglOk, setWebglOk] = useState(true);
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── mount: renderer + always-on draw loop (self-demo needs no audio) ────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeFieldRenderer(canvas);
    if (!renderer || !renderer.ok) {
      renderer?.dispose();
      setWebglOk(false);
      return;
    }
    rendererRef.current = renderer;
    driverRef.current = new BreathDriver(SEED);
    reducedRef.current = prefersReducedMotion();
    // The ONLY real luminance oscillation in the piece: a soft ≤3 Hz sine drift
    // from the shared engine, with a high floor. Never a strobe.
    flickerRef.current = createSafeFlicker({ maxHz: 3, defaultHz: 0.12, floor: 0.66 });
    flickerRef.current.enable();

    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
      const age = (now - startClockRef.current) / 1000;
      const dt = clamp((now - lastNowRef.current) / 1000, 0, 0.05);
      lastNowRef.current = now;
      const reduced = reducedRef.current;
      const st = stateRef.current;

      // ── the swell: self-driving driver, or the real audio spectrum + mic ──
      const env = driverRef.current!.env(age);
      const audio = audioRef.current;
      let drive = env;
      if (audio) {
        audio.setDrive(env); // the bed itself swells with the driver
        let d = audio.getSwell(); // read the REAL output spectrum back
        if (micOnRef.current) d = clamp(d + audio.getMicEnergy() * 0.6, 0, 1);
        drive = clamp(0.12 + 0.9 * d, 0, 1);
      }
      st.drive += (drive - st.drive) * 0.05; // extra smoothing — a slow tide
      const dv = st.drive;

      // ── sub-threshold real drift (frozen when reduced-motion) ─────────────
      const motion = reduced ? 0 : 1;
      // angular drift reverses sign as the swell crosses its midpoint, so the
      // illusory rotation speeds, stalls, and reverses with the sound.
      const driftRateA = motion * (dv - 0.5) * 0.24; // ≤ ±0.12 element-units/s
      const driftRateR = motion * ((dv - 0.5) * 0.05 + Math.sin(age * 0.11) * 0.02);
      st.driftA += dt * driftRateA;
      st.driftR += dt * driftRateR;

      // ── contrast swell + safe breath multiplier ───────────────────────────
      const flicker = flickerRef.current!;
      flicker.setHz(reduced ? 0.08 : 0.1 + dv * 0.35); // still ≤3 Hz, engine-capped
      const breath = flicker.value(age);
      const contrast = clamp(0.5 + 0.46 * dv, 0, 1);

      rendererRef.current?.render({
        ringWidth: RING_WIDTH,
        contrast,
        breath,
        driftA: st.driftA,
        driftR: st.driftR,
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
      driverRef.current = null;
      flickerRef.current = null;
    };
  }, []);

  const onBegin = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const audio = new SnakeAudio();
      await audio.resume();
      audioRef.current = audio;
      setStarted(true);
      setError(null);
    } catch {
      setError("This browser blocked audio. The field keeps drifting silently.");
    }
  }, []);

  const onToggleMic = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (micOnRef.current) return; // one-way for this demo; teardown on unmount
    const ok = await audio.startMic();
    if (ok) {
      micOnRef.current = true;
      setMicOn(true);
      setMicNote(null);
    } else {
      setMicNote("Microphone denied — the self-driving bed keeps the field breathing.");
    }
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      {webglOk ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        // Graceful degrade: an on-brand static CSS ring field.
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, #0a0d1c 0%, #05060f 100%), repeating-radial-gradient(circle at 50% 50%, #05060f 0px, #05060f 9px, #3b4055 11px, #f4f2e6 14px, #8a8ea6 17px, #05060f 19px)",
            backgroundBlendMode: "screen",
          }}
        />
      )}

      {/* Header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 11792-snakevoid
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Snake Void
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            A field of light that is not actually moving — yet it breathes and
            slowly turns. The peripheral drift illusion: static rings of an
            asymmetric luminance sawtooth that your visual system reads as motion.
            The generative drone&apos;s swell speeds, slows, and reverses the
            illusory rotation.
          </p>
          {!webglOk ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">
              This browser has no WebGL2, so the live illusion field can&apos;t
              render — a static ring fallback is shown. Try a recent desktop
              Chrome, Firefox, or Safari.
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">{error}</p>
          ) : null}
          {micNote ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">{micNote}</p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={onBegin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin · sound the field
            </button>
          ) : (
            <>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {micOn ? "Listening · room drives the drift" : "Drone · self-driving swell"}
              </span>
              {!micOn ? (
                <button
                  type="button"
                  onClick={onToggleMic}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Let the room drive it
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Design notes button */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Motion from a still field
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is the peripheral drift illusion — Akiyoshi Kitaoka&apos;s
                &ldquo;Rotating Snakes,&rdquo; formalized by Faubert &amp; Herbert
                (1999). Each ring is tiled with a repeated four-step luminance
                sawtooth in the asymmetric order black → dark-gray → white →
                light-gray, then a sharp drop back to black. The human motion
                system reads that gradual-ramp / sharp-edge polarity as continuous
                self-motion, so the field appears to rotate and breathe while the
                pixels are essentially static. Look straight at any one ring and it
                stalls; let it sit in your periphery and it turns.
              </p>
              <p>
                A self-driving generative drone (a just-intonation bed through a
                cavernous convolution void) swells slowly. Its real output spectrum
                is read back and modulates two things: the ring contrast, and a
                sub-threshold real drift that nudges the illusory speed — so the
                rotation appears to accelerate, stall, and reverse with the music.
                Optionally the microphone lets the room push the same swell.
              </p>
              <p>
                Safety: the illusion is static — there is no flashing, and that is
                the entire point. The only real temporal luminance change is a soft
                sine breath from the shared SafeFlicker engine, hard-capped at 3 Hz
                with a high floor, plus a sub-threshold drift far too slow to read
                as flicker. Reduced-motion freezes all real drift and slows the
                breath to a sub-perceptual crawl.
              </p>
              <p>
                Determinism: nothing uses Math.random or the wall clock. Ring
                offsets and the self-driving breath come from a seeded mulberry32;
                time comes from the animation clock. Every visit — and the muted
                phone at 06:30 — sees the same field breathing within a second.
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

      <PrototypeNav slugs={["11792-snakevoid"]} />
    </main>
  );
}
