"use client";

// 1740-breath-nebula — "Breath Nebula".
// What if your breath were the tide of a living cosmic nebula — inhale blooms a
// million-point stellar cloud outward into light, exhale lets it collapse back
// into cold filaments? A WGSL compute shader advects a persistent GPU particle
// buffer through a 3-D curl-noise flow field plus a breath radial force; a
// render pipeline draws the same buffer as additive violet→warm-white points.
//
// Refs: Robert Borghesi's ASTRODITHER (WebGPU + TSL audio-reactive, 2026-07-01);
// the KAYAC engineering WebGPU curl-noise 1M-particle compute demo; Refik
// Anadol's data-cloud / Machine Hallucinations aesthetic. See README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { NebulaAudio } from "./audio";
import {
  createNebulaRenderer,
  WebGPUUnsupportedError,
  type NebulaRenderer,
} from "./webgpu";

type Phase = "intro" | "running" | "nogpu" | "error";

export default function BreathNebulaPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [particleCount, setParticleCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<NebulaRenderer | null>(null);
  const audioRef = useRef<NebulaAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // Deterministic clock + breath state (all in refs so the loop is stable).
  const frameRef = useRef(0);
  const breathAmpRef = useRef(0.5);
  const prevBreathRef = useRef(0.5);
  const reducedRef = useRef(false);
  reducedRef.current = reducedMotion;

  const mic = useMicAnalyser({ smoothing: 0.85, gain: 1.6 });
  const micGetFrameRef = useRef(mic.getFrame);
  micGetFrameRef.current = mic.getFrame;
  const micRunningRef = useRef(false);
  micRunningRef.current = mic.running;

  // ─── Feature/preference detection on mount ─────────────────────────────────
  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const on = () => setReducedMotion(mq.matches);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
  }, []);

  // Surface a mic denial without stopping the piece (ghost breath keeps it alive).
  useEffect(() => {
    if (mic.error) setMicDenied(true);
  }, [mic.error]);

  // ─── The Begin gesture: audio + mic + WebGPU ───────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "running" || phase === "nogpu") return;
    setStatusMsg("waking the nebula…");

    // 1. Audio context + engine on the gesture (autoplay policy).
    try {
      const w = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        ctxRef.current = ctx;
        if (ctx.state === "suspended") {
          try {
            await ctx.resume();
          } catch {
            /* the user gesture should cover this */
          }
        }
        const audio = new NebulaAudio(ctx);
        audio.start();
        audioRef.current = audio;
      }
    } catch {
      /* visuals still run silent if audio init fails */
    }

    // 2. Mic (best-effort; denial is non-fatal — ghost breath takes over).
    try {
      await mic.start();
    } catch {
      setMicDenied(true);
    }

    // 3. WebGPU renderer.
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const renderer = await createNebulaRenderer(canvas, {
          reducedMotion: reducedRef.current,
        });
        rendererRef.current = renderer;
        setParticleCount(renderer.count);
      } catch (e) {
        if (e instanceof WebGPUUnsupportedError) {
          setStatusMsg(e.message);
        } else {
          setStatusMsg(e instanceof Error ? e.message : String(e));
        }
      }
    }

    setStatusMsg(null);
    setPhase(rendererRef.current ? "running" : "nogpu");
  }, [phase, mic]);

  // ─── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ─── The deterministic drive loop (visual + audio + glow) ──────────────────
  useEffect(() => {
    if (phase !== "running" && phase !== "nogpu") return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      frameRef.current += 1;
      const frame = frameRef.current;
      const dt = 1 / 60;
      const timeSec = frame / 60;
      const reduced = reducedRef.current;

      // Breath signal: mic low-band RMS, else a deterministic ~0.1 Hz oscillator.
      let breathRaw: number;
      const mf = micRunningRef.current ? micGetFrameRef.current() : null;
      if (mf) {
        breathRaw = Math.min(1, ((mf.bands[0] + mf.bands[1]) / 2) * 2.2);
      } else {
        breathRaw = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.1 * timeSec);
      }

      const prev = breathAmpRef.current;
      const amp = prev + (breathRaw - prev) * 0.06; // EMA
      breathAmpRef.current = amp;
      const breathVel = amp - prevBreathRef.current; // signed per-frame derivative
      prevBreathRef.current = amp;

      // Signed radial force: inhale (rising) outward, exhale (falling) inward,
      // plus a gentle expansion bias at peak inhale.
      const radialForce =
        Math.max(-1.4, Math.min(1.4, breathVel * 200)) + (amp - 0.5) * 0.35;

      const orbitSpeed = reduced ? 0.0009 : 0.0022;
      const orbitAngle = frame * orbitSpeed;

      rendererRef.current?.frame({
        timeSec,
        radialForce,
        breathAmp: amp,
        orbitAngle,
        reduced,
      });

      audioRef.current?.step(dt, amp, breathVel);

      // CSS glow fallback (only present in the no-WebGPU degrade path).
      const glow = glowRef.current;
      if (glow) {
        const scale = 0.7 + amp * 0.6;
        glow.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        glow.style.opacity = (0.35 + amp * 0.5).toFixed(3);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // ─── Teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04030a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Breath Nebula — a WebGPU particle cloud that breathes with your microphone"
      />

      {/* No-WebGPU degrade: a minimal DOM radial glow that pulses with breath. */}
      {phase === "nogpu" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            ref={glowRef}
            className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(167,139,250,0.9) 0%, rgba(91,46,201,0.5) 40%, rgba(10,7,25,0) 72%)",
              transform: "translate(-50%, -50%) scale(1)",
              filter: "blur(8px)",
            }}
          />
        </div>
      )}

      {/* Corner: design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Breath Nebula
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Your breath is the tide of a living cosmic nebula — inhale blooms a
            stellar cloud of hundreds of thousands of GPU points outward into
            light; exhale lets it collapse back into cold violet filaments.
          </p>
          {(phase === "running" || phase === "nogpu") && (
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              state: cosmic-ambient nebula-tide · pole: cosmic-ambient
              {phase === "running" && particleCount > 0 && (
                <> · {Math.round(particleCount / 1000)}k points</>
              )}
              {reducedMotion && <> · reduced-motion</>}
            </p>
          )}
          {micDenied && (phase === "running" || phase === "nogpu") && (
            <p className="mt-2 text-sm text-destructive">
              Microphone unavailable — a deterministic ghost breath is driving the
              tide so the piece stays alive.
            </p>
          )}
        </header>

        <section className="pointer-events-auto flex max-w-2xl flex-col items-start gap-3">
          {phase === "intro" && (
            <>
              <button
                onClick={() => void begin()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
              <p className="text-base text-muted-foreground">
                Sound and microphone start on this click (browsers block autoplay).
                Breathe slowly toward the mic — or just watch: with no mic it
                breathes on its own.
              </p>
              {statusMsg && (
                <p className="font-mono text-xs text-muted-foreground">{statusMsg}</p>
              )}
            </>
          )}

          {phase === "nogpu" && (
            <div className="max-w-lg rounded-lg border border-border bg-background/70 p-4">
              <p className="text-base text-foreground">
                This piece needs WebGPU — try Chrome/Edge or Safari 18+.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The million-point cloud is a GPU compute shader, so there is no
                full fallback — but the audio is running and the glow above is
                breathing with the same signal.
              </p>
              {statusMsg && (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  detail: {statusMsg}
                </p>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="max-w-lg rounded-lg border border-border bg-background/70 p-4">
              <p className="text-base text-foreground">
                Something went wrong starting the nebula.
              </p>
              {statusMsg && (
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {statusMsg}
                </p>
              )}
            </div>
          )}
        </section>

        {(phase === "running" || phase === "nogpu") && (
          <footer className="pointer-events-auto max-w-2xl">
            <p className="text-base text-muted-foreground">
              A WGSL compute shader advects every point through a 3-D curl-noise
              flow field each frame; your breath adds a signed radial force —
              outward on the in-breath, a cold inward collapse on the out-breath.
              The pad swells and a filtered wind rises as you inhale; sparse bells
              ring as you let go.
            </p>
          </footer>
        )}
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </main>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm md:p-10"
      role="dialog"
      aria-modal="true"
      aria-label="Design notes"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Breath Nebula — design notes
        </h2>

        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">The question.</span> What
            if your breath were the tide of a living cosmic nebula — inhale blooming
            a stellar cloud outward into light, exhale letting it collapse back into
            cold filaments?
          </p>
          <p>
            <span className="font-medium text-foreground">The substrate.</span> A
            persistent GPU storage buffer of hundreds of thousands of particles is
            stepped every frame by a WGSL{" "}
            <span className="font-mono text-foreground">compute</span> shader:
            each point is advected through a 3-D{" "}
            <span className="font-mono text-foreground">curl-noise</span> flow field
            (analytic curl of a value-noise vector potential, so the flow is
            near-divergence-free — filaments, not sinks), then pushed by a signed
            breath radial force. Particles age and respawn on a seeded emitter
            shell. A second pipeline reads the same buffer and draws each point as
            an additive quad, sized and coloured by local speed.
          </p>
          <p>
            <span className="font-medium text-foreground">The breath.</span> A
            smoothed low-band RMS envelope from the microphone becomes the breath
            amplitude; its rise/fall sign sets the radial force. With no mic (or a
            denied one) a deterministic ~0.1 Hz oscillator over the integer frame
            counter drives the same tide, so the piece is alive and audible even
            unattended.
          </p>
          <p>
            <span className="font-medium text-foreground">The sound.</span> A soft
            evolving pad of inharmonic partials in detuned pairs (slow beating +
            shimmer), a filtered-noise wind that rises on the in-breath, and sparse
            bell pings on the out-breath — routed through a compressor at gain 0.15.
            Deliberately not a static just-intonation drone.
          </p>
          <p>
            <span className="font-medium text-foreground">Safety.</span> No strobe —
            only slow luminance drift.{" "}
            <span className="font-mono text-foreground">prefers-reduced-motion</span>{" "}
            slows the camera orbit and softens the bloom. Determinism: the only
            randomness is fixed-seed mulberry32 particle seeding.
          </p>
          <p>
            <span className="font-medium text-foreground">References.</span> Robert
            Borghesi&apos;s <em>ASTRODITHER</em> (WebGPU + TSL audio-reactive,
            published 2026-07-01) — a field that is all signal until the music
            pushes it around; the KAYAC engineering WebGPU curl-noise compute demo
            (1M particles on an M1); and Refik Anadol&apos;s data-cloud /{" "}
            <em>Machine Hallucinations</em> aesthetic.
          </p>
        </div>
      </div>
    </div>
  );
}
