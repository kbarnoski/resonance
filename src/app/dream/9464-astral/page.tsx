"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 9464 · Astral — fall into his music as a nebula of quantized light
//
// THE ONE QUESTION: What if you could fall INTO Karel's piano as a nebula of
// quantized light?
//
// Karel's real "Welcome Home" recording drives a WebGPU-compute particle
// system: onsets (spectral flux) spawn ~90k drifting star-agents that advect
// through a curl-noise flow field; their density is bloomed and laid under an
// ordered (Bayer 8x8) dither so the cloud reads as a shifting veil of light-
// grains. Over ~3.5 minutes a "convergence" parameter biases the field inward,
// gathering the scattered swarm from a diffuse cloud into a tunnel-to-light.
// Loudness (RMS) modulates spawn rate and brightness. WebGPU is the substrate;
// a Canvas2D nebula stands in where WebGPU is unavailable.
//
// Reference: Robert Borghesi's ASTRODITHER (audio-reactive WebGPU + ordered
// dithering + bloom) and Brian Eno's long-form generative ambient. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import {
  CONVERGENCE_SECONDS,
  type NebulaEngine,
  phaseFor,
  type StepArgs,
} from "./nebula";
import { createGpuNebula } from "./gpu";
import { createCanvasNebula } from "./fallback";
import {
  DEFAULT_UUID,
  loadPianoAudio,
  makeSpectralReader,
  type AudioMode,
  type LoadedAudio,
  type SpectralReader,
  type SynthEngine,
} from "./audio";

type Status = "idle" | "loading" | "running" | "error";

interface Engine {
  ctx: AudioContext;
  master: SafeMaster;
  source: AudioBufferSourceNode | null;
  synth: SynthEngine | null;
  reader: SpectralReader;
  nebula: NebulaEngine;
  raf: number;
  startedAt: number;
  lastFrame: number;
  fluxAvg: number;
  rmsSmooth: number;
}

interface Readout {
  elapsed: number;
  convergence: number;
  phase: string;
}

export default function AstralPage() {
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nudgeRef = useRef(0);
  const readoutTickRef = useRef(0);

  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<AudioMode>("real");
  const [backend, setBackend] = useState<"GPU" | "Canvas2D" | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [uuid, setUuid] = useState(DEFAULT_UUID);
  const [nudge, setNudge] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Readout>({ elapsed: 0, convergence: 0, phase: "Drift" });

  // ── teardown (idempotent) ──────────────────────────────────────────────────
  const teardown = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const eng = engineRef.current;
    if (!eng) return;
    engineRef.current = null;
    cancelAnimationFrame(eng.raf);
    try {
      eng.source?.stop();
    } catch {
      /* already stopped */
    }
    eng.synth?.stop();
    try {
      eng.nebula.destroy();
    } catch {
      /* ok */
    }
    try {
      eng.master.disconnect();
    } catch {
      /* ok */
    }
    if (eng.ctx.state !== "closed") eng.ctx.close().catch(() => {});
  }, []);

  useEffect(() => teardown, [teardown]);

  // ── render loop ─────────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - eng.lastFrame) / 1000 || 0.016);
    eng.lastFrame = now;
    const time = (now - eng.startedAt) / 1000;
    const reduced = prefersReducedMotion();

    const { flux, rms } = eng.reader.read();

    // onset detection against a slow running mean of the flux
    eng.fluxAvg = eng.fluxAvg * 0.95 + flux * 0.05;
    const onset = Math.max(0, flux - eng.fluxAvg * 1.4);
    eng.rmsSmooth = eng.rmsSmooth * 0.85 + rms * 0.15;

    // long-form convergence: auto-ramp, with the manual slider as a floor
    const auto = Math.min(1, time / CONVERGENCE_SECONDS);
    const convergence = Math.max(auto, nudgeRef.current);

    // loudness → spawn rate + exposure (smooth; never a strobe)
    const swing = reduced ? 0.8 : 2.2;
    const brightness = Math.max(0.4, Math.min(2.4, 0.6 + eng.rmsSmooth * swing));
    const baseline = 120 + eng.rmsSmooth * 400;
    const burst = Math.min(2500, onset * 60000 + flux * 8000);
    const spawn = Math.min(3500, baseline + burst);

    const args: StepArgs = { dt, time, convergence, brightness, spawn, reduced };
    eng.nebula.step(args);

    // throttle the on-screen readout to ~6/s
    readoutTickRef.current += dt;
    if (readoutTickRef.current > 0.16) {
      readoutTickRef.current = 0;
      setReadout({ elapsed: time, convergence, phase: phaseFor(convergence).name });
    }

    eng.raf = requestAnimationFrame(runLoop);
  }, []);

  // ── start (user gesture) ────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (status === "loading" || status === "running") return;
    setStatus("loading");
    setErrorMsg("");
    setStatusMsg("Loading Karel's recording…");

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();

    const master = createSafeMaster(ctx, { gain: 0.18 });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let loaded: LoadedAudio;
    try {
      loaded = await loadPianoAudio(ctx, master, uuid.trim() || DEFAULT_UUID, ctrl.signal);
    } catch (e) {
      // AbortError here means a genuine unmount — bail quietly.
      if ((e as Error)?.name !== "AbortError") {
        setStatus("error");
        setErrorMsg("Audio could not start.");
      }
      ctx.close().catch(() => {});
      return;
    }

    // build the visual substrate: WebGPU first, Canvas2D fallback
    const gpuCanvas = gpuCanvasRef.current;
    const cpuCanvas = cpuCanvasRef.current;
    if (!gpuCanvas || !cpuCanvas) {
      setStatus("error");
      setErrorMsg("Canvas unavailable.");
      ctx.close().catch(() => {});
      return;
    }

    let nebula: NebulaEngine;
    let usedGpu = false;
    try {
      nebula = await createGpuNebula(gpuCanvas);
      usedGpu = true;
    } catch {
      nebula = createCanvasNebula(cpuCanvas);
    }
    setBackend(nebula.backend);
    gpuCanvas.style.display = usedGpu ? "block" : "none";
    cpuCanvas.style.display = usedGpu ? "none" : "block";

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const active = usedGpu ? gpuCanvas : cpuCanvas;
    const rect = active.getBoundingClientRect();
    nebula.resize(rect.width, rect.height, dpr);

    const reader = makeSpectralReader(loaded.analyser);
    const now = performance.now();
    engineRef.current = {
      ctx,
      master,
      source: loaded.source,
      synth: loaded.synth,
      reader,
      nebula,
      raf: 0,
      startedAt: now,
      lastFrame: now,
      fluxAvg: 0,
      rmsSmooth: 0,
    };

    setMode(loaded.mode);
    setStatusMsg(loaded.statusMsg);
    setErrorMsg(loaded.errorMsg);
    setStatus("running");
    engineRef.current.raf = requestAnimationFrame(runLoop);
  }, [status, uuid, runLoop]);

  // ── resize while running ────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "running") return;
    const onResize = () => {
      const eng = engineRef.current;
      if (!eng) return;
      const active = eng.nebula.backend === "GPU" ? gpuCanvasRef.current : cpuCanvasRef.current;
      if (!active) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = active.getBoundingClientRect();
      eng.nebula.resize(rect.width, rect.height, dpr);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [status]);

  const running = status === "running";

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Full-bleed art — two stacked canvases, only the active backend shown */}
      <canvas
        ref={gpuCanvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: "none" }}
      />
      <canvas
        ref={cpuCanvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ display: "none" }}
      />

      {/* Elapsed / phase readout (top-right), only while running */}
      {running && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 text-right">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {formatTime(readout.elapsed)}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">{readout.phase}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            convergence {(readout.convergence * 100).toFixed(0)}%
          </div>
        </div>
      )}

      {/* Design-notes corner link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute left-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* Chrome */}
      <div
        className={`relative z-10 mx-auto flex max-w-2xl flex-col gap-5 px-6 ${
          running ? "pt-16" : "min-h-[calc(100vh-3rem)] justify-center py-16"
        }`}
      >
        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            9464 · Astral
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Fall into his music as a nebula of quantized light
          </h1>
          {!running && (
            <p className="text-base leading-relaxed text-foreground">
              Karel&apos;s real piano becomes a boundless light-field. Every note
              onset spawns drifting star-grains into a GPU particle nebula, laid
              under an ordered dither veil. Over a few minutes the scattered
              cloud gathers itself into a converging tunnel-to-light — the piece
              at minute four is nothing like minute zero.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={() => void start()}
              disabled={status === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {status === "loading" ? "Loading…" : "Begin the fall"}
            </button>
          ) : (
            <button
              onClick={teardown}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop
            </button>
          )}

          {running && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${
                mode === "real"
                  ? "border-primary/50 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  mode === "real" ? "bg-primary" : "bg-muted-foreground"
                }`}
              />
              {mode === "real" ? "real recording" : "offline demo (synth)"}
            </span>
          )}

          {running && backend && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {backend === "GPU" ? "WebGPU compute" : "Canvas2D fallback"}
            </span>
          )}
        </div>

        {/* Convergence nudge — pull the tunnel forward by hand */}
        {running && (
          <label className="flex max-w-sm flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Convergence nudge
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={nudge}
              onChange={(e) => {
                const v = Number(e.target.value);
                setNudge(v);
                nudgeRef.current = v;
              }}
              className="accent-primary"
            />
          </label>
        )}

        {/* Audio UUID */}
        {!running && (
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Audio UUID
            </span>
            <input
              type="text"
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              spellCheck={false}
              placeholder={DEFAULT_UUID}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
        )}

        {statusMsg && !errorMsg && (
          <p className="text-sm leading-relaxed text-muted-foreground">{statusMsg}</p>
        )}
        {errorMsg && <p className="text-sm leading-relaxed text-destructive">{errorMsg}</p>}
      </div>

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The mechanism.</span> A running
                spectral-flux detector reads Karel&apos;s piano and, on every
                onset, emits fresh star-agents into a ~90k-particle storage
                buffer. A WebGPU compute pass advects them through a
                divergence-free curl-noise flow field each frame.
              </p>
              <p>
                <span className="text-foreground">The veil.</span> The particle
                density is accumulated into an HDR texture, softly bloomed, then
                composited under a Bayer 8×8 ordered dither — the quantized
                light-grain look after Robert Borghesi&apos;s{" "}
                <em>ASTRODITHER</em>. Palette runs deep indigo → violet →
                white-hot core.
              </p>
              <p>
                <span className="text-foreground">The long form.</span> A
                convergence parameter ramps over ~3.5 minutes (Brian Eno&apos;s
                long-form generative ambient), biasing the flow inward so the
                diffuse swarm gathers into a rotating tunnel-to-light. Loudness
                drives spawn rate and exposure. The slider lets you pull the
                tunnel forward by hand.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> No strobing —
                all motion is smooth luminance drift, and reduced-motion is
                honored by slowing the field and taming the swings.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["9464-astral"]} />
    </div>
  );
}

// module-level helper (never named use*)
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
