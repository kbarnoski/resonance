"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1786-dissolve-boundless
//
// THE ONE QUESTION: What if slowing your breath could literally dissolve the
// boundary of your "self" — a tight luminous sphere of half-a-million GPU
// particles unravelling into a boundless, all-filling glow (drug-free
// ego-dissolution / meditative boundlessness), then re-cohering the moment you
// move?
//
// Mic RMS (stillness) drives a single `cohesion` scalar 1→0 as the room goes
// quiet and steady; a WebGPU compute shader turns that scalar into a
// cohesion↔diffusion field over the swarm; the shared Shepard + drone engines
// track the same scalar so the sound widens as the self dissolves.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  createDissolveRenderer,
  type DissolveRenderer,
  PARTICLE_COUNT,
} from "./compute";
import { startDissolveAudio, type DissolveAudio } from "./audio";

type GpuStatus = "checking" | "ok" | "unsupported";

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export default function DissolveBoundlessPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);

  const rendererRef = useRef<DissolveRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<DissolveAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tdBufRef = useRef<Float32Array | null>(null);

  // Mutable state read inside the rAF loop (refs avoid stale closures).
  const cohesionRef = useRef(1); // start as the tight, coherent ego sphere
  const ghostTRef = useRef(0);
  const rotYRef = useRef(0);
  const timeRef = useRef(0);
  const lastTsRef = useRef(0);
  const micActiveRef = useRef(false);

  const [began, setBegan] = useState(false);
  const [gpuStatus, setGpuStatus] = useState<GpuStatus>("checking");
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [coherencePct, setCoherencePct] = useState(100);

  // ── renderer + animation loop (mount once) ─────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = prefersReducedMotion();
    let cancelled = false;

    const updateFallback = (coh: number) => {
      const wash = washRef.current;
      const core = coreRef.current;
      if (wash) wash.style.opacity = String(0.05 + 0.4 * (1 - coh));
      if (core) {
        const size = 24 + 66 * (1 - coh); // vmin — tight when coherent, vast when dissolved
        const blur = 10 + 66 * (1 - coh); // px
        core.style.width = `${size}vmin`;
        core.style.height = `${size}vmin`;
        core.style.filter = `blur(${blur}px)`;
        core.style.opacity = String(0.32 + 0.6 * coh);
      }
    };

    let frame = 0;
    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const last = lastTsRef.current || ts;
      let dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      if (!isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(0.05, dt);
      timeRef.current += dt;

      // ── derive a target cohesion ──
      let target: number;
      const an = analyserRef.current;
      const buf = tdBufRef.current;
      if (micActiveRef.current && an && buf) {
        an.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // quiet & still → 0 (dissolve); loud / movement → 1 (ego re-forms)
        target = smoothstep(0.01, 0.075, rms);
      } else {
        // Autonomous ghost breath: long troughs in boundlessness, brief returns.
        ghostTRef.current += dt;
        const base = 0.5 + 0.5 * Math.cos((2 * Math.PI * ghostTRef.current) / 46);
        target = Math.pow(base, 2.6);
      }

      // Asymmetric approach: dissolving is SLOW (you must hold stillness),
      // re-cohering is FAST (any movement snaps the self back).
      const cur = cohesionRef.current;
      const rate = target > cur ? 2.6 : 0.16;
      cohesionRef.current = cur + (target - cur) * (1 - Math.exp(-rate * dt));
      const coh = cohesionRef.current;

      // slow tumble + a gentle luminance breath (≤3 Hz — 0.08 Hz here)
      rotYRef.current += dt * (reduced ? 0.02 : 0.06);
      const breath = 0.9 + 0.1 * Math.sin(2 * Math.PI * 0.08 * timeRef.current);
      const brightness = 0.03 * (0.7 + 0.6 * coh) * breath;

      const r = rendererRef.current;
      if (r) {
        r.step({
          cohesion: coh,
          timeSec: timeRef.current,
          dt,
          brightness,
          rotY: rotYRef.current,
        });
      } else {
        updateFallback(coh);
      }

      audioRef.current?.update(coh, dt);

      // throttled UI readout (~5 Hz)
      if ((frame++ & 15) === 0) setCoherencePct(Math.round(coh * 100));
    };

    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const r = await createDissolveRenderer(canvas);
        if (cancelled) {
          r.dispose();
          return;
        }
        rendererRef.current = r;
        setGpuStatus("ok");
        ro = new ResizeObserver(() => r.resize());
        ro.observe(canvas);
      } catch {
        if (!cancelled) setGpuStatus("unsupported");
      }
      if (!cancelled) rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro?.disconnect();
      audioRef.current?.stop();
      audioRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      void audioCtxRef.current?.close();
      audioCtxRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // ── mic (best-effort; audio + ghost cycle run regardless) ──────────────────
  const enableMic = useCallback(async (ctx: AudioContext) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.5;
      src.connect(an); // NOT connected to destination — no feedback
      analyserRef.current = an;
      tdBufRef.current = new Float32Array(new ArrayBuffer(an.fftSize * 4));
      micActiveRef.current = true;
      setMicActive(true);
      setMicError(null);
    } catch (e) {
      micActiveRef.current = false;
      setMicActive(false);
      setMicError(
        e instanceof Error && e.message
          ? "No microphone — running the autonomous breath cycle instead."
          : "No microphone — running the autonomous breath cycle instead.",
      );
    }
  }, []);

  const onBegin = useCallback(async () => {
    if (began) return;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      await ctx.resume().catch(() => {});
      audioRef.current = startDissolveAudio(ctx, ctx.destination);
      setBegan(true);
      void enableMic(ctx); // async; audio + visuals already running
    } catch {
      // Even if audio init fails, the visual ghost cycle keeps going.
      setBegan(true);
    }
  }, [began, enableMic]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ── art layer ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
      />

      {/* ── CSS/DOM fallback bloom (only when WebGPU is unavailable) ── */}
      {gpuStatus === "unsupported" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden bg-black">
          <div
            ref={washRef}
            className="absolute inset-0"
            style={{
              opacity: 0.1,
              background:
                "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.5), rgba(99,102,241,0.18) 45%, rgba(6,4,16,0) 75%)",
            }}
          />
          <div
            ref={coreRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "24vmin",
              height: "24vmin",
              filter: "blur(12px)",
              background:
                "radial-gradient(circle at 50% 50%, rgba(230,225,255,0.95), rgba(167,139,250,0.7) 40%, rgba(91,46,201,0.15) 75%, rgba(6,4,16,0) 100%)",
            }}
          />
        </div>
      )}

      {/* ── chrome ── */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-8">
        {/* top row */}
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              ego-dissolution · cosmic-ambient
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Dissolve / Boundless
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Slow your breath and hold still — a half-million-particle sphere of
              &ldquo;self&rdquo; unravels into a boundless glow, and re-forms the
              instant you move.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto shrink-0 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* bottom row */}
        <div className="flex flex-col gap-4">
          {!began ? (
            <div className="pointer-events-auto flex flex-col gap-3">
              <button
                type="button"
                onClick={onBegin}
                className="min-h-[44px] w-fit rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
              <p className="max-w-md text-sm text-muted-foreground">
                Sound starts on tap. If you allow the mic, stillness deepens the
                dissolution; otherwise it breathes on its own.
              </p>
            </div>
          ) : (
            <div className="pointer-events-auto flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                coherence {coherencePct}%
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                {coherencePct > 55
                  ? "self · cohered"
                  : coherencePct > 20
                    ? "boundary · thinning"
                    : "boundless"}
              </span>
              {micActive ? (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  mic · listening for stillness
                </span>
              ) : micError ? (
                <span className="text-sm text-destructive">{micError}</span>
              ) : (
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  requesting mic…
                </span>
              )}
            </div>
          )}

          {gpuStatus === "unsupported" && (
            <p className="pointer-events-auto max-w-md text-sm text-destructive">
              WebGPU is unavailable in this browser, so the GPU particle
              simulation can&apos;t run. Showing a lightweight glow fallback — the
              sound and the dissolution still respond.
            </p>
          )}
        </div>
      </div>

      {/* ── design-notes overlay ── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Dissolving the boundary of self
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {PARTICLE_COUNT.toLocaleString()} particles live in WebGPU storage
                buffers, ping-ponged through a WGSL compute shader every frame.
                Each one feels a single field: a spring toward a shared
                sphere-shell scaled by <em>cohesion</em>, plus a curl-noise
                diffusion scaled by <em>(1 − cohesion)</em>. A toroidal wrap lets
                the diffused swarm fill space evenly.
              </p>
              <p>
                An <code>AnalyserNode</code> reads ambient loudness (RMS). Quiet,
                steady stillness drives cohesion 1→0 <em>slowly</em> — you have to
                hold it — collapsing the bright sphere into a vast, even glow.
                Movement or sound snaps cohesion back <em>fast</em>, and the self
                re-coheres. With no mic, an autonomous breath cycle stands in.
              </p>
              <p>
                The sound tracks the same scalar: a just-intonation drone opens
                and detunes wider as the self dissolves, under an endless
                Shepard–Risset drift — the felt widening with no edge.
              </p>
              <p>
                After Nour, Evans, Nutt &amp; Carhart-Harris, &ldquo;Ego-Dissolution
                Inventory (EDI)&rdquo; (Frontiers in Human Neuroscience, 2016), and
                Millière / Letheby on drug-free ego-dissolution: the dissolving of
                the felt boundary between self and world.
              </p>
              <p className="text-muted-foreground/70">
                No alpha-band flicker; luminance drifts at ~0.08 Hz. Honors
                prefers-reduced-motion.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1786-dissolve-boundless"]} />
    </main>
  );
}
