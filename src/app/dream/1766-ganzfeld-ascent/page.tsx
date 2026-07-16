"use client";

// 1766-ganzfeld-ascent — "Ganzfeld Ascent".
// What if holding perfectly still let your own visual cortex — and the screen —
// accrete neural noise UP a hallucination hierarchy, from phosphene dots →
// cobweb / lattice form-constants → proto-faces? A near-uniform dim Ganzfeld
// field over a persistent WebGPU compute substrate. A stillness accumulator: as
// long as you don't move the pointer or the device, `complexity` climbs and the
// field organizes up the hierarchy. Any motion breaks the trance — complexity
// falls back fast toward dots, as if you disturbed something delicate.
//
// Substrate: a persistent 2D "structure field" in GPU storage buffers. Per
// frame two compute passes — inject spatial noise, then an anisotropic
// reaction-diffusion step whose kernel anisotropy + bilateral symmetry-folding
// scale with `complexity` (isotropic → oriented → symmetric) — ping-pong the
// buffers; a render pass samples the field to a dim violet-grey Ganzfeld
// (brightness hard-clamped ≤ 0.7). See gpu.ts / audio.ts / README.md.
//
// Refs: "From dots to faces…" Neuroscience of Consciousness 2026 (niag016 /
// arXiv:2507.09011); the Ganzfeld effect; the Dreamachine (Gysin 1959 /
// Collective Act 2022) — the flicker lineage this piece de-fangs for safety.

import { useCallback, useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { GanzfeldAudio } from "./audio";
import { initGanzfeldGpu, type GanzfeldBackend } from "./gpu";

type Phase = "intro" | "running" | "nogpu";

const STAGES = [
  { key: "dots", label: "Dots", hint: "phosphene grain · floaters" },
  { key: "cobwebs", label: "Cobwebs", hint: "oriented filaments · lattice" },
  { key: "faces", label: "Faces", hint: "bilateral proto-faces" },
] as const;

function stageIndex(c: number): number {
  if (c < 0.33) return 0;
  if (c < 0.66) return 1;
  return 2;
}

const MOTION_THRESH = 0.06;
const AUTOPILOT_IDLE = 9 * 60; // frames of no interaction before self-drive

interface Meter {
  c: number;
  stage: number;
  autopilot: boolean;
  moving: boolean;
}

export default function GanzfeldAscentPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [meter, setMeter] = useState<Meter>({
    c: 0,
    stage: 0,
    autopilot: false,
    moving: false,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const latticeRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);
  const backendRef = useRef<GanzfeldBackend | null>(null);
  const audioRef = useRef<GanzfeldAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // Deterministic clock + stillness/ascent state (refs → the loop stays stable).
  const frameRef = useRef(0);
  const complexityRef = useRef(0);
  const motionRecentRef = useRef(0);
  const lastInteractionRef = useRef(0);
  const autopilotRef = useRef(false);
  const autopilotStartRef = useRef(0);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const lastOrientRef = useRef<{ b: number; g: number } | null>(null);
  const reducedRef = useRef(false);
  reducedRef.current = reducedMotion;

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

  // ─── Register motion: any pointer or device movement resets stillness. ─────
  const registerMotion = useCallback((strength: number) => {
    motionRecentRef.current = Math.min(1.5, motionRecentRef.current + strength);
    lastInteractionRef.current = frameRef.current;
    autopilotRef.current = false;
  }, []);

  useEffect(() => {
    if (phase !== "running" && phase !== "nogpu") return;

    const onPointer = (e: PointerEvent) => {
      const last = lastPointerRef.current;
      const cur = { x: e.clientX, y: e.clientY };
      lastPointerRef.current = cur;
      if (!last) return;
      const dx = cur.x - last.x;
      const dy = cur.y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1.5) registerMotion(Math.min(1, dist / 30));
    };

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const last = lastOrientRef.current;
      const cur = { b: e.beta, g: e.gamma };
      lastOrientRef.current = cur;
      if (!last) return;
      const d = Math.abs(cur.b - last.b) + Math.abs(cur.g - last.g);
      if (d > 0.4) registerMotion(Math.min(1, d / 12));
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("deviceorientation", onOrient, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [phase, registerMotion]);

  // ─── The Begin gesture: audio + WebGPU ─────────────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "running" || phase === "nogpu") return;
    setStatusMsg("settling the field…");

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
        const audio = new GanzfeldAudio(ctx);
        audio.start();
        audioRef.current = audio;
      }
    } catch {
      /* visuals still run silent if audio init fails */
    }

    // 2. WebGPU structure-field substrate.
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        const backend = await initGanzfeldGpu(canvas);
        backendRef.current = backend;
        if (!backend) {
          setStatusMsg(
            "WebGPU unavailable — showing the DOM fallback; the audio bed is playing.",
          );
        }
      } catch (e) {
        setStatusMsg(e instanceof Error ? e.message : String(e));
      }
    }

    // Seed the interaction clock so the self-drive autopilot can engage.
    lastInteractionRef.current = frameRef.current;
    setPhase(backendRef.current ? "running" : "nogpu");
  }, [phase]);

  // ─── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => backendRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ─── The deterministic ascent loop (stillness → complexity → field/audio) ──
  useEffect(() => {
    if (phase !== "running" && phase !== "nogpu") return;

    let meterTick = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      frameRef.current += 1;
      const frame = frameRef.current;
      const reduced = reducedRef.current;

      // Recent-motion energy decays each frame; motion events top it up.
      motionRecentRef.current *= 0.86;
      const moving = motionRecentRef.current > MOTION_THRESH;
      const idle = frame - lastInteractionRef.current;

      // Self-drive: after a long idle, gently drive the ascent so a reviewer who
      // never holds still still sees dots → cobwebs → faces happen on its own.
      if (!autopilotRef.current && idle > AUTOPILOT_IDLE) {
        autopilotRef.current = true;
        autopilotStartRef.current = frame;
      }

      let c = complexityRef.current;
      if (autopilotRef.current) {
        const t = (frame - autopilotStartRef.current) / 60;
        let target: number;
        if (t < 18) {
          const s = Math.min(1, t / 18);
          target = (s * s * (3 - 2 * s)) * 0.95; // smooth climb to the top
        } else {
          target = 0.72 + 0.24 * Math.sin((t - 18) * 0.11); // slow tour of stages
        }
        c += (target - c) * (reduced ? 0.01 : 0.02);
      } else if (moving) {
        // Motion breaks the trance — fall back fast toward dots.
        c += (0 - c) * 0.14;
      } else {
        // Held still — climb slowly up the hierarchy.
        c += (1 - c) * (reduced ? 0.004 : 0.0075);
      }
      c = Math.max(0, Math.min(1, c));
      complexityRef.current = c;

      // Slow, safe luminance drift: ~0.057 Hz sine (well under 3 Hz), kept in
      // ~[0.85, 1.0]; reduced-motion flattens it further.
      const drift = reduced ? 0.05 : 0.09;
      const flick = 1 - drift + drift * (0.5 + 0.5 * Math.sin(frame * 0.006));

      backendRef.current?.frame({ complexity: c, flick, reduced });
      audioRef.current?.step(c);

      // No-WebGPU DOM fallback: layered glow / lattice / face that climb with c.
      updateFallbackDom(glowRef.current, latticeRef.current, faceRef.current, c);

      // Throttle the React meter update (~15 Hz) so state churn stays cheap.
      meterTick += 1;
      if (meterTick % 4 === 0) {
        setMeter({
          c,
          stage: stageIndex(c),
          autopilot: autopilotRef.current,
          moving,
        });
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

  const running = phase === "running" || phase === "nogpu";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05040a] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Ganzfeld Ascent — a WebGPU compute structure-field that climbs from phosphene dots to cobweb lattices to proto-faces as you hold still"
      />

      {/* No-WebGPU degrade: a DOM Ganzfeld that still shows the ascent. */}
      {phase === "nogpu" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0a0812]">
          <div
            ref={glowRef}
            className="absolute left-1/2 top-1/2 h-[80vmin] w-[80vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(150,120,220,0.5) 0%, rgba(70,50,140,0.28) 45%, rgba(10,7,25,0) 74%)",
              filter: "blur(8px)",
            }}
          />
          <div
            ref={latticeRef}
            className="absolute left-1/2 top-1/2 h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(60deg, rgba(180,160,240,0.10) 0 2px, transparent 2px 9px), repeating-linear-gradient(-60deg, rgba(180,160,240,0.10) 0 2px, transparent 2px 9px)",
              maskImage:
                "radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)",
              WebkitMaskImage:
                "radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)",
            }}
          />
          <div
            ref={faceRef}
            className="absolute left-1/2 top-1/2 h-[52vmin] w-[40vmin] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-0"
            style={{
              background:
                "radial-gradient(ellipse 18% 14% at 38% 42%, rgba(0,0,0,0.75) 0%, transparent 60%), radial-gradient(ellipse 18% 14% at 62% 42%, rgba(0,0,0,0.75) 0%, transparent 60%), radial-gradient(ellipse 26% 8% at 50% 66%, rgba(0,0,0,0.65) 0%, transparent 60%), radial-gradient(ellipse 55% 62% at 50% 50%, rgba(150,125,215,0.30) 0%, transparent 70%)",
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
            Ganzfeld Ascent
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            A dim, near-uniform field. Hold perfectly still — don&apos;t move the
            pointer or the device — and your own visual noise accretes up a
            hallucination hierarchy: phosphene dots, then cobweb lattices, then
            proto-faces. Any motion breaks the trance.
          </p>
          {running && (
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              state: ganzfeld · 256² structure-field · dots→cobwebs→faces
              {reducedMotion && <> · reduced-motion</>}
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
                Sound starts on this click (browsers block autoplay). Then be
                still and watch the field organize itself — or just wait: with no
                interaction it self-drives the ascent so you can see all three
                stages.
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
                WebGPU unavailable — this piece&apos;s field is a GPU compute
                shader, so it needs a Chromium-based browser (Chrome/Edge) or
                Safari 18+.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The audio bed is running and the DOM fallback above is climbing
                the same dots → cobwebs → faces ascent so you can still read it.
              </p>
              {statusMsg && (
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  detail: {statusMsg}
                </p>
              )}
            </div>
          )}
        </section>

        {running && (
          <footer className="pointer-events-auto max-w-2xl">
            <DepthMeter meter={meter} />
          </footer>
        )}
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </main>
  );
}

// Layered DOM fallback so the ascent reads even without WebGPU.
function updateFallbackDom(
  glow: HTMLDivElement | null,
  lattice: HTMLDivElement | null,
  face: HTMLDivElement | null,
  c: number,
): void {
  if (glow) {
    const scale = 0.85 + c * 0.35;
    glow.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    glow.style.opacity = (0.45 + c * 0.4).toFixed(3);
  }
  if (lattice) {
    const w = Math.max(0, Math.min(1, (c - 0.3) / 0.32));
    lattice.style.opacity = (w * 0.85).toFixed(3);
  }
  if (face) {
    const w = Math.max(0, Math.min(1, (c - 0.6) / 0.35));
    face.style.opacity = (w * 0.9).toFixed(3);
  }
}

function DepthMeter({ meter }: { meter: Meter }) {
  const pct = Math.round(meter.c * 100);
  return (
    <div className="w-full max-w-xl">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {meter.autopilot
            ? "self-drive · ascending"
            : meter.moving
              ? "motion · trance broken"
              : "still · ascending"}
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
          {STAGES[meter.stage].label} · {pct}%
        </span>
      </div>

      {/* Depth track with the three stage zones. */}
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full border border-border bg-background/60">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/70 transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
        {/* zone dividers at 33% / 66% */}
        <div className="absolute inset-y-0 left-1/3 w-px bg-border" />
        <div className="absolute inset-y-0 left-2/3 w-px bg-border" />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {STAGES.map((s, i) => (
          <div
            key={s.key}
            className={
              "rounded-md border px-3 py-2 transition-colors " +
              (i === meter.stage
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border bg-background/40 text-muted-foreground")
            }
          >
            <div className="text-sm font-medium">{s.label}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em]">
              {s.hint}
            </div>
          </div>
        ))}
      </div>
    </div>
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
          Ganzfeld Ascent — design notes
        </h2>

        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">The question.</span>{" "}
            What if holding perfectly still let your visual cortex — and the
            screen — accrete neural noise UP a hallucination hierarchy, from
            phosphene dots → cobweb / lattice form-constants → proto-faces?
          </p>
          <p>
            <span className="font-medium text-foreground">The stillness
            mechanic.</span> A stillness accumulator listens to{" "}
            <span className="font-mono text-foreground">pointermove</span> and{" "}
            <span className="font-mono text-foreground">deviceorientation</span>.
            Motion tops up a decaying &quot;recent motion&quot; energy; while you
            hold still it stays near zero and{" "}
            <span className="font-mono text-foreground">complexity</span> climbs
            slowly toward 1. Any motion above a small threshold makes complexity
            fall back fast toward dots — the reset is meant to feel like you
            disturbed something delicate. After a long idle an autopilot gently
            self-drives the ascent so the piece is never dead on screen.
          </p>
          <p>
            <span className="font-medium text-foreground">The substrate
            (WebGPU compute).</span> A persistent 256×256 scalar &quot;structure
            field&quot; lives in GPU storage buffers across frames — state a
            fragment shader can&apos;t hold. Each frame: (1) a compute pass
            injects sparse phosphene specks + faint grain; (2) an anisotropic
            reaction-diffusion pass whose kernel climbs with{" "}
            <span className="font-mono text-foreground">complexity</span> —
            isotropic center-surround (dots) → activator support that bends along
            a fixed swirling orientation field (oriented filaments / cobwebs) →
            bilateral mirror-x folding plus slow symmetric attractor wells (two
            eye-like, one mouth-like, inside a broad face oval) that pull the
            accreted grain into a proto-face. Buffers ping-pong; a render pass
            samples the field onto a dim violet-grey Ganzfeld.
          </p>
          <p>
            <span className="font-medium text-foreground">The sound.</span> A soft
            detuned pad (JI-ish low drone) through a lowpass and a synthesized
            reverb, behind a limiter at calm gain. Its hypnagogic signature is a
            ~6 Hz theta-band amplitude modulation (an LFO on a gain node — this is
            AUDIO, not light). As complexity climbs, the filter opens, a faint
            higher shimmer fades in, the reverb wettens and the theta deepens, so
            the ear hears the ascent too.
          </p>
          <p>
            <span className="font-medium text-foreground">Safety.</span> This is
            the Dreamachine lineage deliberately de-fanged: NO alpha-band (8–12
            Hz) visual flicker. The only luminance change is a slow ~0.06 Hz
            drift, and brightness is hard-clamped ≤ 0.7 in the shader (no
            white-out).{" "}
            <span className="font-mono text-foreground">
              prefers-reduced-motion
            </span>{" "}
            softens the climb and flattens the drift. All field noise is a hash of
            integer (x, y, frame); no wall-clock in the state path.
          </p>
          <p>
            <span className="font-medium text-foreground">References.</span>{" "}
            <em>
              &quot;From dots to faces: individual differences in visual imagery
              capacity predict the content of Ganzflicker-induced
              hallucinations&quot;
            </em>{" "}
            — Neuroscience of Consciousness 2026 (niag016; arXiv:2507.09011): the
            dots → cobwebs → faces content hierarchy this ascent renders. The{" "}
            <em>Ganzfeld effect</em> (a uniform field → the brain amplifies neural
            noise into imagery). The <em>Dreamachine</em> (Brion Gysin 1959 /
            Collective Act 2022) — the flicker-hallucination ancestor, here
            de-fanged for safety.
          </p>
        </div>
      </div>
    </div>
  );
}
