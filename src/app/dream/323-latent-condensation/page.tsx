"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Latent Condensation — a WebGPU compute-shader particle piece driven by Karel's
// own "Welcome Home" recording (the lab has used WebGPU compute before; the
// novelty here is the application, not the technique).
//
// THE ONE QUESTION: what if Karel's own "Welcome Home" piano could pull a cloud
// of GPU particles out of pure turbulent chaos — condensing into a coherent
// flowing FORM on each musical phrase, then dissolving back into noise in the
// rests — the whole simulation living on the GPU and conditioned by the live
// spectrum of his real piano?
//
// ~120k particles are integrated every frame by a WGSL COMPUTE shader (curl-noise
// flow field blended against an attraction-to-target term). A live AnalyserNode
// drives a phrase state machine (chaos → condense → form → release) whose output
// is the "condensation" coupling read by the GPU each frame.
//
// Degrades gracefully: no WebGPU → readable rose notice + a DOM level-meter that
// still pulses to the audio. Audio fails → synthesized A-minor piano bed.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { Analysis, type Phase } from "./analysis";
import { resolveSource, type SourceResult } from "./audio";
import { initGpu, type GpuSim, type FrameParams } from "./gpu";

type Status = "idle" | "loading" | "running" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  chaos: "chaos — pure turbulent flow",
  condense: "condensing toward the form",
  form: "form held",
  release: "releasing back to noise",
};

const README = `Latent Condensation maps Karel's live piano spectrum onto a 120k-particle
WebGPU compute simulation. Rising musical energy condenses the cloud onto a
slowly morphing target shape (sphere → torus → lissajous ribbon); rests dissolve
it back into curl-noise chaos. Low bands widen the flow; treble adds sparkle.
References: nibi by monoton-music (WebGPU/TSL particle music engine,
github.com/monoton-music/nibi) and Refik Anadol's latent-flow point clouds.`;

export default function LatentCondensationPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [source, setSource] = useState<SourceResult | null>(null);
  const [gpuOk, setGpuOk] = useState<boolean | null>(null); // null until decided
  const [gpuNotice, setGpuNotice] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("chaos");
  const [condensation, setCondensation] = useState(0);
  const [amplitude, setAmplitude] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const simRef = useRef<GpuSim | null>(null);
  const rafRef = useRef<number | null>(null);
  const analysisRef = useRef<Analysis | null>(null);
  const lastTRef = useRef<number>(0);
  const morphRef = useRef<number>(0);
  // mirror live values into refs so the rAF loop never closes over stale state
  const meterRef = useRef<{ amp: number; cond: number; low: number; high: number }>({
    amp: 0,
    cond: 0,
    low: 0,
    high: 0,
  });
  const meterBarRef = useRef<HTMLDivElement | null>(null);
  const meterGlowRef = useRef<HTMLDivElement | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (simRef.current) {
      simRef.current.destroy();
      simRef.current = null;
    }
    if (srcNodeRef.current) {
      try { srcNodeRef.current.stop(); } catch { /* already stopped */ }
      try { srcNodeRef.current.disconnect(); } catch { /* ignore */ }
      srcNodeRef.current = null;
    }
    if (ctxRef.current) {
      const c = ctxRef.current;
      ctxRef.current = null;
      c.close().catch(() => { /* ignore */ });
    }
    analysisRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  // size the canvas to its container (and the DOM meter fallback canvas too)
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (w === 0 || h === 0) return;
    if (simRef.current) {
      simRef.current.resize(w, h);
    } else {
      canvas.width = w;
      canvas.height = h;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  }, [sizeCanvas]);

  const start = useCallback(async () => {
    if (status === "loading" || status === "running") return;
    setStatus("loading");

    // 1) AudioContext on the user gesture
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    try { await ctx.resume(); } catch { /* ignore */ }

    // 2) resolve audio (real → fallback synth)
    let src: SourceResult;
    try {
      src = await resolveSource(ctx);
    } catch {
      setStatus("error");
      return;
    }
    setSource(src);

    // 3) wire graph: buffer → analyser → destination
    const node = ctx.createBufferSource();
    node.buffer = src.buffer;
    node.loop = true;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    node.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    node.start();
    srcNodeRef.current = node;
    analysisRef.current = new Analysis(analyser);

    // 4) try WebGPU; on failure fall through to the DOM meter placeholder
    sizeCanvas();
    let sim: GpuSim | null = null;
    if (canvasRef.current && typeof navigator !== "undefined" && navigator.gpu) {
      try {
        sim = await initGpu(canvasRef.current);
        simRef.current = sim;
        sizeCanvas();
        setGpuOk(true);
      } catch (e) {
        sim = null;
        simRef.current = null;
        setGpuOk(false);
        setGpuNotice(e instanceof Error ? e.message : "WebGPU init failed");
      }
    } else {
      setGpuOk(false);
      setGpuNotice("navigator.gpu is unavailable in this browser.");
    }

    setStatus("running");
    lastTRef.current = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTRef.current) / 1000) || 0.016;
      lastTRef.current = now;

      const a = analysisRef.current;
      if (a) {
        const f = a.read(dt);
        meterRef.current = { amp: f.amplitude, cond: f.condensation, low: f.low, high: f.high };

        // morph the target form slowly, a touch faster while condensed
        morphRef.current += dt * (0.012 + f.condensation * 0.03);

        if (simRef.current) {
          const params: FrameParams = {
            time: now / 1000,
            condensation: f.condensation,
            low: f.low,
            high: f.high,
            amplitude: f.amplitude,
            morph: morphRef.current,
            bands: f.bands,
          };
          simRef.current.frame(params, dt);
        } else {
          // DOM placeholder: pulse the level meter bars
          const bar = meterBarRef.current;
          const glow = meterGlowRef.current;
          if (bar) bar.style.transform = `scaleX(${0.05 + f.amplitude * 0.95})`;
          if (glow) {
            glow.style.opacity = String(0.15 + f.condensation * 0.7);
            glow.style.transform = `scale(${0.6 + f.condensation * 0.9})`;
          }
        }

        // throttle React state updates to keep the loop cheap (~6 Hz)
        if ((now | 0) % 160 < 18) {
          setPhase(f.phase);
          setCondensation(f.condensation);
          setAmplitude(f.amplitude);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [status, sizeCanvas]);

  const sourceBadge = source
    ? source.real
      ? { text: `♪ Welcome Home — Karel's recording`, cls: "text-violet-300/95 border-violet-400/30 bg-violet-400/5" }
      : { text: `♪ ${source.title} (synth fallback)`, cls: "text-violet-300/95 border-violet-400/30 bg-violet-400/5" }
    : null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06060c] text-foreground">
      {/* GPU canvas (also the backdrop) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: gpuOk === false ? "none" : "block" }}
      />

      {/* DOM placeholder visual when WebGPU is unavailable */}
      {gpuOk === false && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex h-64 w-64 items-center justify-center">
            <div
              ref={meterGlowRef}
              className="absolute h-48 w-48 rounded-full bg-violet-500/30 blur-2xl transition-none"
              style={{ opacity: 0.2 }}
            />
            <div className="absolute h-40 w-40 rounded-full border border-violet-400/30" />
            <div className="z-10 h-3 w-48 overflow-hidden rounded-full bg-muted">
              <div
                ref={meterBarRef}
                className="h-full w-full origin-left rounded-full bg-gradient-to-r from-violet-400 to-violet-300"
                style={{ transform: "scaleX(0.05)" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Overlay UI ─────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-8">
        <header className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Latent Condensation
          </h1>
          <p className="mt-2 text-base leading-relaxed text-foreground">
            Karel&apos;s live piano spectrum pulls{" "}
            <span className="text-violet-300">120,000 GPU particles</span> out of
            turbulent chaos — condensing into a flowing form on each phrase, then
            dissolving back into noise in the rests. The whole simulation runs in a
            WebGPU compute shader.
          </p>
          {sourceBadge && (
            <div
              className={`mt-3 inline-block rounded-full border px-3 py-1 text-base ${sourceBadge.cls}`}
            >
              {sourceBadge.text}
            </div>
          )}
          {gpuOk === false && (
            <p className="mt-3 max-w-xl text-base leading-relaxed text-violet-300">
              WebGPU is required for the particle simulation and is unavailable
              here{gpuNotice ? ` (${gpuNotice})` : ""}. The audio still plays and the
              meter below tracks the phrase envelope. Try a recent Chrome, Edge, or
              Safari with WebGPU enabled.
            </p>
          )}
        </header>

        {/* footer status + controls */}
        <footer className="flex flex-col gap-4">
          {status === "running" && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-base text-muted-foreground">
              <span>
                phase:{" "}
                <span className="text-violet-300">{PHASE_LABEL[phase]}</span>
              </span>
              <span className="text-muted-foreground">
                condensation {(condensation * 100).toFixed(0)}%
              </span>
              <span className="text-muted-foreground">
                level {(amplitude * 100).toFixed(0)}%
              </span>
            </div>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {status !== "running" && (
              <button
                onClick={start}
                disabled={status === "loading"}
                className="min-h-[44px] rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400 disabled:opacity-60"
              >
                {status === "loading" ? "Summoning the cloud…" : "Play Karel's piano"}
              </button>
            )}
            {status === "running" && (
              <button
                onClick={() => {
                  teardown();
                  setStatus("idle");
                  setSource(null);
                  setGpuOk(null);
                }}
                className="min-h-[44px] rounded-xl border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-accent"
              >
                Stop
              </button>
            )}
            {status === "error" && (
              <span className="text-base text-violet-300">
                Could not start audio. Reload and try again.
              </span>
            )}
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-xl px-4 py-2.5 text-base text-muted-foreground transition hover:text-foreground"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </div>
        </footer>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-4 bottom-24 mx-auto max-w-xl rounded-2xl border border-border bg-black/70 p-5 backdrop-blur sm:inset-x-auto sm:right-8">
          <h2 className="text-xl font-medium text-foreground">Design notes</h2>
          <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-muted-foreground">
            {README}
          </p>
        </div>
      )}
    </main>
  );
}
