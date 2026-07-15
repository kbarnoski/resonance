"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DissolveAudio } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 1752-dissolve
//   state: dissociative ego-dissolution (k-hole descent+return) · pole:
//   cosmic-ambient / dissociative.
//
//   "What if Resonance could dissolve your sense of self with sound ALONE —
//    no screen?"
//
//   The screen-bias TEST: the visual is DELIBERATELY near-absent — a near-black
//   presence field, one slow-breathing violet glow, one instruction line, and a
//   single hairline that fills left→right as the descent deepens then empties on
//   the return. Sound does all the work. Headphones + eyes closed.
// ─────────────────────────────────────────────────────────────────────────────

const ARC_SECONDS = 150; // descend ~75s + return ~75s
const HALF = ARC_SECONDS / 2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// depth 0→1→0 triangle over the arc; 0 (idle single point) once the arc ends.
function arcDepth(elapsed: number): number {
  if (elapsed <= 0) return 0;
  if (elapsed >= ARC_SECONDS) return 0;
  return elapsed < HALF ? elapsed / HALF : (ARC_SECONDS - elapsed) / HALF;
}

function phaseLabel(depth: number, arcDone: boolean): string {
  if (arcDone) return "returned · a single point, in front";
  if (depth < 0.15) return "a single point of tone · directly in front";
  if (depth < 0.45) return "the point is coming loose";
  if (depth < 0.75) return "front and back are blurring";
  if (depth < 0.9) return "the edges of you are dissolving";
  return "no center · no edge · no self";
}

export default function Page() {
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headSteer, setHeadSteer] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [phase, setPhase] = useState("");

  const audioRef = useRef<DissolveAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const teardownRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);

  const glowRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    setRunning(false);
    setPhase("");
    if (fillRef.current) fillRef.current.style.width = "0%";
    if (glowRef.current) glowRef.current.style.opacity = "0.12";
  }, []);

  useEffect(() => () => stop(), [stop]);

  const descendAgain = useCallback(() => {
    if (!audioRef.current) return;
    // restart the arc from the current audio clock
    startTimeRef.current =
      // read the live audio clock without exposing the ctx
      performance.now() / 1000;
  }, []);

  const start = useCallback(async () => {
    if (running) return;
    setError(null);
    const reduced = prefersReducedMotion();

    // ── gesture-gated AudioContext (never autoplay) ──────────────────────────
    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      setError("This browser blocked the audio engine — spatial audio is unavailable.");
      return;
    }

    let audio: DissolveAudio;
    try {
      audio = new DissolveAudio(ctx);
      audio.setMuted(mutedRef.current);
      audio.start();
    } catch {
      setError("Could not build the spatial-audio scene on this device.");
      void ctx.close();
      return;
    }
    audioRef.current = audio;
    setRunning(true);
    startTimeRef.current = performance.now() / 1000;

    // ── OPTIONAL DeviceOrientation head-steer (gracefully skipped) ────────────
    let orientHandler: ((e: DeviceOrientationEvent) => void) | null = null;
    let alpha0: number | null = null;
    try {
      const DOE = window.DeviceOrientationEvent as
        | (typeof DeviceOrientationEvent & {
            requestPermission?: () => Promise<"granted" | "denied">;
          })
        | undefined;
      if (DOE) {
        let permitted = true;
        if (typeof DOE.requestPermission === "function") {
          const res = await DOE.requestPermission();
          permitted = res === "granted";
        }
        if (permitted) {
          orientHandler = (e: DeviceOrientationEvent) => {
            if (e.alpha == null) return;
            if (alpha0 == null) alpha0 = e.alpha;
            const deltaDeg = e.alpha - alpha0;
            const yaw = (deltaDeg * Math.PI) / 180;
            audioRef.current?.setYaw(yaw);
            setHeadSteer(true);
          };
          window.addEventListener("deviceorientation", orientHandler);
        }
      }
    } catch {
      orientHandler = null; // no sensor / denied → silently skip, piece still works
    }

    // ── render loop: drive the depth arc + the near-absent visual ────────────
    const loop = () => {
      const eng = audioRef.current;
      if (!eng) return;
      const nowSec = performance.now() / 1000;
      const elapsed = nowSec - startTimeRef.current;
      const depth = arcDepth(elapsed);
      const arcDone = elapsed >= ARC_SECONDS;

      eng.step(nowSec, depth);

      // hairline fills L→R with the descent, empties on the return
      if (fillRef.current) fillRef.current.style.width = `${clamp01(depth) * 100}%`;

      // one dim, slow-breathing radial glow (< 0.3 Hz luminance drift only)
      if (glowRef.current) {
        const breath = reduced ? 0 : 0.5 + 0.5 * Math.sin(nowSec * 0.08 * Math.PI * 2);
        const lum = 0.1 + depth * 0.16 + breath * 0.05; // stays dim
        glowRef.current.style.opacity = lum.toFixed(3);
      }

      setPhase(phaseLabel(depth, arcDone));
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    teardownRef.current = () => {
      if (orientHandler) window.removeEventListener("deviceorientation", orientHandler);
      setHeadSteer(false);
      void ctx.close();
    };
  }, [running]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* near-absent presence field: one dim, slow-breathing violet glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div
          ref={glowRef}
          style={{
            width: "70vmin",
            height: "70vmin",
            opacity: 0.12,
            background:
              "radial-gradient(circle, rgba(139,92,246,0.55) 0%, rgba(91,60,180,0.22) 38%, rgba(20,14,40,0) 70%)",
            transition: "opacity 120ms linear",
          }}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            dissociative ego-dissolution · cosmic-ambient
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Dissolve</h1>
          <p className="text-base text-muted-foreground">
            A drug-free ego-dissolution descent and return, rendered entirely in
            spatialized sound. A single point of tone in front of you comes loose,
            orbits, decorrelates and diffuses until front, back, self and not-self
            are no longer distinguishable — then slowly re-coheres.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          {error && <p className="text-base text-destructive">{error}</p>}

          {running && (
            <div className="max-w-md space-y-3">
              {/* the single hairline — fills L→R on descent, empties on return */}
              <div className="h-px w-full overflow-hidden bg-border">
                <div
                  ref={fillRef}
                  className="h-px bg-primary/70"
                  style={{ width: "0%", transition: "width 200ms linear" }}
                />
              </div>
              <p className="text-base text-muted-foreground">{phase}</p>
              {headSteer && (
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  head-steer active · turn to move the field
                </p>
              )}
            </div>
          )}

          {!running && (
            <p className="text-base text-foreground">Headphones on. Close your eyes.</p>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin descent
              </button>
            ) : (
              <>
                <button
                  onClick={descendAgain}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Descend again
                </button>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  End
                </button>
                <button
                  onClick={() => setMuted((v) => !v)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
              </>
            )}
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-4 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The one question: <em>what if Resonance could dissolve your sense
                of self with sound alone — no screen?</em> This piece is the
                screen-bias test. The visual is deliberately near-absent; every
                dissociative effect lives in the spatial audio.
              </p>
              <p>
                Four voices form a single coherent point of tone directly in front
                of the head, each rendered through its own HRTF{" "}
                <code>PannerNode</code>. Over ~75 s they de-localize: they crossfade
                from a mono-correlated path onto a per-ear-decorrelated path (two
                independent 5–25 ms delay lines destroy interaural correlation),
                smear via randomized granular delay, and split onto wide Lissajous
                orbits at different radii and speeds so the scene envelops you. A
                code-synthesised <code>ConvolverNode</code> diffuse-field reverb has
                its direct-to-reverb ratio collapse toward a pure wet field at the
                peak. Then the whole arc reverses and re-coheres — the return.
              </p>
              <p>
                The carrier bed is intentionally inharmonic: slightly-stretched pad
                partials plus near-unison voices whose detune fans WIDE at the peak,
                so the k-hole is a beating, unplaced smear — never a pretty
                just-intonation drone.
              </p>
              <p>
                One normalized <code>depth</code> 0→1→0 envelope over 150 s drives
                spread, decorrelation, smear time, wet/dry ratio and detune-beating
                together. Optional device-orientation head-steer rotates the
                listener yaw and is silently skipped where unavailable.
              </p>
              <p>
                Reference: browser spatial-audio maturity 2026 — Google Resonance
                Audio / Omnitone ambisonic + binaural HRTF rendering (&ldquo;Web
                Audio API: Immersive Soundscapes for WebXR 2026&rdquo;).
                Phenomenology: ketamine / NDE ego-dissolution and unity — the loss
                of the self / other boundary. The build inverts the usual goal of
                spatial audio: instead of placing sounds precisely, it un-places
                them until the listener&apos;s spatial self dissolves.
              </p>
              <p>
                Safety: no flicker or strobe — the glow is a slow (&lt; 0.3 Hz)
                luminance drift only, and <code>prefers-reduced-motion</code> holds
                it steady. Master level is capped and compressed.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1752-dissolve"]} />
    </main>
  );
}
