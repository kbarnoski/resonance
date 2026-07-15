"use client";

// 1758-boundless-wave — "Boundless Wave".
// What if the mature GPU wave-equation solver — the thing every WebGPU
// water/cloth demo uses to sell REALISM — were pointed at its opposite: a
// boundless, edge-dissolving standing-wave field with no object, no centre, no
// scale, that you shape only with your BREATH? The formless-jhāna "sphere of
// boundless space" (ākāsānañcāyatana), drug-free, made audible.
//
// A WGSL compute shader integrates the discretized 2D wave equation
//   u_next = 2u − u_prev + c²·∇²u  (+ light damping, reflective Neumann edges)
// over a 512×512 amplitude grid via ping-ponged GPU storage buffers. Your
// breath's loudness envelope (mic RMS) drives a slow, wide radial excitation;
// the square's reflecting boundary folds it into a Chladni standing-wave figure.
//
// Refs: ākāsānañcāyatana (the formless jhāna of boundless space); Ernst Chladni
// (1787) — cymatics / nodal figures on a driven plate; d'Alembert's 2D wave
// equation. See README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { BoundlessAudio } from "./audio";
import { initWaveGpu, type WaveBackend } from "./gpu";

type Phase = "intro" | "running" | "nogpu";

export default function BoundlessWavePage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const backendRef = useRef<WaveBackend | null>(null);
  const audioRef = useRef<BoundlessAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // Deterministic clock + breath/field state (refs → the loop stays stable).
  const frameRef = useRef(0);
  const breathRef = useRef(0.15);
  const fieldLevelRef = useRef(0.05);
  const reducedRef = useRef(false);
  reducedRef.current = reducedMotion;

  const mic = useMicAnalyser({ smoothing: 0.86, gain: 1.7 });
  const micGetFrameRef = useRef(mic.getFrame);
  micGetFrameRef.current = mic.getFrame;
  const micRunningRef = useRef(false);
  micRunningRef.current = mic.running;

  // ─── Reduced-motion detection ──────────────────────────────────────────────
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
    setStatusMsg("opening the space…");

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
        const audio = new BoundlessAudio(ctx);
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

    // 3. WebGPU wave solver.
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const backend = await initWaveGpu(canvas);
        backendRef.current = backend;
        if (!backend) {
          setStatusMsg(
            "WebGPU unavailable — this piece needs a Chromium-based browser (Chrome/Edge) or Safari 18+.",
          );
        }
      } catch (e) {
        setStatusMsg(e instanceof Error ? e.message : String(e));
      }
    }

    setPhase(backendRef.current ? "running" : "nogpu");
  }, [phase, mic]);

  // ─── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => backendRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ─── The deterministic drive loop (visual + audio + degrade glow) ──────────
  useEffect(() => {
    if (phase !== "running" && phase !== "nogpu") return;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      frameRef.current += 1;
      const frame = frameRef.current;
      const timeSec = frame / 60;
      const reduced = reducedRef.current;

      // Breath signal: mic low-band RMS if present, else a deterministic
      // ~0.08 Hz ghost breath so the field is always alive (headless review,
      // no mic, no speakers) — the autonomous slow oscillator the brief wants.
      let breathRaw: number;
      const mf = micRunningRef.current ? micGetFrameRef.current() : null;
      if (mf) {
        breathRaw = Math.min(1, ((mf.bands[0] + mf.bands[1]) / 2) * 2.2);
      } else {
        // Fixed-frequency slow breath, plus a slower swell, purely from frame #.
        const a = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.08 * timeSec);
        const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.017 * timeSec);
        breathRaw = 0.12 + 0.7 * a * (0.5 + 0.5 * swell);
      }

      // Smooth the breath envelope (EMA).
      const prev = breathRef.current;
      const breath = prev + (breathRaw - prev) * 0.05;
      breathRef.current = breath;

      // Field-energy proxy for the audio: integrates injected drive with the
      // same slow decay as the PDE damping → "fills to a shimmering
      // equilibrium", thins toward a faint ground in silence.
      const fl = fieldLevelRef.current;
      const nextFl = fl * 0.99 + breath * 0.012;
      fieldLevelRef.current = nextFl;

      // Drive phase drifts deterministically; reduced-motion slows the stir.
      const phaseSpeed = reduced ? 0.06 : 0.11;
      const phase = frame * phaseSpeed;

      // Slow, safe luminance drift (well below any flicker danger band): a
      // ~0.06 Hz sine kept inside [0.82, 1.0]; reduced-motion flattens it.
      const drift = reduced ? 0.06 : 0.09;
      const flick = 1.0 - drift + drift * (0.5 + 0.5 * Math.sin(frame * 0.006));

      backendRef.current?.frame({ breath, phase, flick, reduced });
      audioRef.current?.step(Math.min(1, nextFl * 1.8));

      // No-WebGPU degrade: a DOM radial glow breathing on the same field level.
      const glow = glowRef.current;
      if (glow) {
        const scale = 0.7 + Math.min(1, nextFl * 1.8) * 0.6;
        glow.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        glow.style.opacity = (0.28 + Math.min(1, nextFl * 1.8) * 0.42).toFixed(3);
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
      backendRef.current?.destroy();
      backendRef.current = null;
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
        aria-label="Boundless Wave — a WebGPU 2D wave-equation standing-wave field shaped by your breath"
      />

      {/* No-WebGPU degrade: a minimal DOM radial glow that breathes with the field. */}
      {phase === "nogpu" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            ref={glowRef}
            className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(140,110,220,0.7) 0%, rgba(70,40,150,0.4) 45%, rgba(10,7,25,0) 74%)",
              transform: "translate(-50%, -50%) scale(1)",
              filter: "blur(10px)",
            }}
          />
        </div>
      )}

      {/* Corner: design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Boundless Wave
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            The GPU wave-equation solver every water demo uses for realism,
            pointed at its opposite: a boundless standing-wave field with no
            object, no centre, no scale — the formless-jhāna sphere of infinite
            space, shaped only by the loudness of your breath.
          </p>
          {(phase === "running" || phase === "nogpu") && (
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              state: ākāsānañcāyatana · 512² wave-PDE · Chladni standing field
              {reducedMotion && <> · reduced-motion</>}
            </p>
          )}
          {micDenied && (phase === "running" || phase === "nogpu") && (
            <p className="mt-2 text-sm text-destructive">
              Microphone unavailable — a deterministic ghost breath is shaping
              the field so the piece stays alive.
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
                Sound and microphone start on this click (browsers block
                autoplay). Breathe slowly, long and full, toward the mic — or
                just watch: with no mic the field breathes on its own.
              </p>
              {statusMsg && (
                <p className="font-mono text-xs text-muted-foreground">
                  {statusMsg}
                </p>
              )}
            </>
          )}

          {phase === "nogpu" && (
            <div className="max-w-lg rounded-lg border border-border bg-background/70 p-4">
              <p className="text-base text-foreground">
                WebGPU unavailable — this piece needs a Chromium-based browser
                (Chrome/Edge) or Safari 18+.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The wave field is a GPU compute shader, so there is no full
                fallback — but the audio bed is running and the glow above is
                breathing with the same field-energy signal.
              </p>
              {statusMsg && (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  detail: {statusMsg}
                </p>
              )}
            </div>
          )}
        </section>

        {(phase === "running" || phase === "nogpu") && (
          <footer className="pointer-events-auto max-w-2xl">
            <p className="text-base text-muted-foreground">
              A WGSL compute shader integrates the 2D wave equation over a 512²
              grid every frame; your breath injects a slow, wide radial
              excitation and the plate&apos;s reflecting edges fold it into a
              standing-wave interference — the Chladni figure. Dark filaments are
              the nodal lines; the violet pad brightens as the field fills.
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
          Boundless Wave — design notes
        </h2>

        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">The question.</span>{" "}
            What if the mature GPU wave-equation solver — the thing every WebGPU
            water/cloth demo uses to sell realism — were pointed at the opposite:
            a boundless, edge-dissolving standing-wave field with no object, no
            centre, no scale, that you shape only with your breath?
          </p>
          <p>
            <span className="font-medium text-foreground">The substrate.</span> A
            WGSL <span className="font-mono text-foreground">compute</span> shader
            integrates the discretized 2D wave equation{" "}
            <span className="font-mono text-foreground">
              u_next = 2u − u_prev + c²·∇²u
            </span>{" "}
            over a 512×512 grid of f32 amplitudes, ping-ponging three GPU storage
            buffers (u_prev, u_curr → u_next). The Laplacian is a 5-point stencil;
            light damping bleeds energy so the field settles to a calm
            equilibrium rather than running away. Edges are{" "}
            <span className="font-medium text-foreground">reflective</span>{" "}
            (Neumann, via clamped neighbour indexing) — the wall folds every
            ripple back, and that interference is what makes the standing-wave
            Chladni figure form. c² = 0.24 keeps the Courant number well under the
            0.5 stability wall; it is hardcoded, never derived from a clock.
          </p>
          <p>
            <span className="font-medium text-foreground">The breath.</span> A
            smoothed low-band RMS envelope from the microphone becomes the drive
            amplitude of a slow, wide radial Gaussian excitation injected at a few
            fixed off-centre sites. Louder, steadier breath fills the field toward
            a shimmering equilibrium; silence lets it decay toward a faint
            breathing ground — never fully flat. With no mic (or a denied one) a
            deterministic ~0.08 Hz ghost breath over the integer frame counter
            drives the same field, so the piece is alive and audible unattended.
          </p>
          <p>
            <span className="font-medium text-foreground">The sound.</span> A soft
            pad of detuned, slightly inharmonic partial voices — ratios just off
            the harmonic series so a sustained chord shimmers and beats instead of
            locking — brightens and swells as the field&apos;s energy fills, then
            thins in silence. Routed through a synthesized void reverb and a
            compressor at gain 0.15. The mic is never routed to the output (no
            feedback); only its loudness reaches the field.
          </p>
          <p>
            <span className="font-medium text-foreground">Safety.</span> Brightness
            is hard-clamped ≤ 0.7 in the shader (no white-out); only a slow ~0.06
            Hz luminance drift, well below any photosensitive danger band.{" "}
            <span className="font-mono text-foreground">
              prefers-reduced-motion
            </span>{" "}
            slows the stir and flattens the drift. Determinism: the only
            randomness is a fixed-seed mulberry32 used once to lay out the drive
            sites and (in the shared reverb) the impulse response.
          </p>
          <p>
            <span className="font-medium text-foreground">References.</span>{" "}
            <em>ākāsānañcāyatana</em> — the formless jhāna &quot;sphere of
            boundless/infinite space&quot; (Buddhist Abhidhamma): no object, no
            centre, one continuous medium. <em>Ernst Chladni</em> (1787) — Chladni
            figures / cymatics: standing waves on a driven plate settle into
            nodal-line patterns, which the reflective-boundary wave equation
            reproduces literally. <em>d&apos;Alembert</em> — the 2D wave equation
            being integrated.
          </p>
        </div>
      </div>
    </div>
  );
}
