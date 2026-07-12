"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 1506-theta-tide — the psychedelic "breathing surfaces", rebuilt from its
// cortical mechanism.
//
// A lattice of coupled phase oscillators lives in cortical (u,v) space and is
// swept by traveling plane-wave sources. Under the inverse log-polar warp
// (r = exp(u)) a cortical plane wave reads out as the classic expanding /
// contracting concentric rings of an LSD "breathing tunnel". Each wavefront that
// crosses a listening ring rings an inharmonic tone — the visible wavefront IS the
// audible sweep. A ~7-minute REBUS arc raises coupling, noise and the number of
// interfering sources, then settles: minute 6 never equals minute 1.
//
// WebGPU compute (instanced points) with a mandatory CPU / Canvas2D fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { GpuField, requestGpu, type StepArgs, type RenderArgs } from "./gpu";
import { FallbackField } from "./fallback";
import { makeThetaAudio } from "./audio";
import { WaveEngine, mulberry32, GX, GV, NSRC_MAX, DURATION } from "./sim";

type Backend = "init" | "webgpu" | "canvas2d";

interface Field {
  step(a: StepArgs, substeps: number): void;
  render(a: RenderArgs): void;
  dispose(): void;
}

const HUE_BASE = 0.74; // violet-forward

export default function ThetaTidePage() {
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [backend, setBackend] = useState<Backend>("init");
  const [note, setNote] = useState("");
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [progress, setProgress] = useState(0);

  const beginRef = useRef<() => void>(() => {});

  useEffect(() => {
    const gpuCanvas = gpuCanvasRef.current;
    const fbCanvas = fbCanvasRef.current;
    if (!gpuCanvas || !fbCanvas) return;

    const reduced = prefersReducedMotion();
    const seed = 0x51106a1d;
    const previewSpeed = reduced ? 3 : 6;

    let disposed = false;
    let raf = 0;
    let field: Field | null = null;
    let engine = new WaveEngine(seed, reduced);
    const srcBuf = new Float32Array(NSRC_MAX * 4);
    const speedRef = { v: previewSpeed };
    const runningRef = { v: false };

    const audio = makeThetaAudio();

    beginRef.current = () => {
      engine = new WaveEngine(seed, reduced);
      speedRef.v = 1;
      runningRef.v = true;
      setRunning(true);
      audio.resume().catch(() => {});
    };

    const substeps = reduced ? 2 : 3;

    const frame = (last: number) => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      const effDt = dt * speedRef.v;

      const arc = engine.step(effDt);
      const n = engine.packSources(srcBuf);

      if (field) {
        field.step(
          {
            coupling: arc.coupling,
            forcing: arc.forcing,
            noise: arc.noise,
            dt: 0.016,
            nSrc: n,
            src: srcBuf,
          },
          substeps,
        );
        field.render({
          breath: arc.breath,
          bright: reduced ? 0.82 : 0.98,
          hueBase: HUE_BASE + 0.05 * Math.sin(engine.t * 0.03),
          satMul: reduced ? 0.5 * arc.drive : arc.drive,
        });
      }

      if (runningRef.v && audio.running()) {
        const strikes = engine.collectStrikes(arc.drive);
        for (const ev of strikes) audio.strike(ev);
        audio.setDrive(arc.drive, arc.dir);
        audio.step(effDt);
      }

      setProgress(Math.min(1, engine.t / DURATION));
      raf = requestAnimationFrame(() => frame(now));
    };

    const boot = async () => {
      const seedArr = new Float32Array(GX * GV);
      const r = mulberry32(seed ^ 0x1234);
      for (let i = 0; i < seedArr.length; i++) seedArr[i] = r() * Math.PI * 2;

      let init: Awaited<ReturnType<typeof requestGpu>> = null;
      try {
        init = await requestGpu(gpuCanvas);
      } catch {
        init = null;
      }
      if (disposed) {
        init?.device.destroy();
        return;
      }
      if (init) {
        try {
          field = new GpuField(init, gpuCanvas, seedArr);
          setBackend("webgpu");
        } catch (err) {
          init.device.destroy();
          field = new FallbackField(fbCanvas, seed);
          setBackend("canvas2d");
          setNote(
            "WebGPU init failed — running CPU fallback. " +
              (err instanceof Error ? err.message : ""),
          );
        }
      } else {
        field = new FallbackField(fbCanvas, seed);
        setBackend("canvas2d");
        setNote("WebGPU unavailable — running CPU fallback.");
      }
      raf = requestAnimationFrame(() => frame(performance.now()));
    };

    boot();

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      field?.dispose();
      audio.dispose();
    };
  }, []);

  const pct = Math.round(progress * 100);

  return (
    <div className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas
        ref={gpuCanvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: backend === "canvas2d" ? "none" : "block" }}
      />
      <canvas
        ref={fbCanvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: backend === "canvas2d" ? "block" : "none" }}
      />

      {/* title + description */}
      <div className="pointer-events-none absolute left-4 top-4 max-w-md">
        <a
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream
        </a>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Theta Tide
        </h1>
        <p className="mt-1 text-base text-muted-foreground">
          A cortical traveling wave breathes concentric rings across visual cortex,
          and every wavefront you see is the tone you hear.
        </p>
        {note && <p className="mt-2 text-base text-destructive">{note}</p>}
      </div>

      {/* design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm font-medium text-foreground backdrop-blur transition-colors hover:bg-accent"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* controls */}
      <div className="absolute bottom-6 left-1/2 z-20 w-[min(92vw,520px)] -translate-x-1/2 rounded-lg border border-border bg-background/60 px-5 py-4 backdrop-blur">
        {!running ? (
          <button
            type="button"
            onClick={() => beginRef.current()}
            className="min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              REBUS arc
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{pct}%</span>
          </div>
        )}
        <p className="mt-3 text-base text-muted-foreground">
          {running
            ? "The wave evolves on its own over ~7 minutes — calm onset, an interfering peak, then a settle."
            : "A fast silent preview is already running. Press Begin to start the real, slow, audible arc from the top."}
        </p>
      </div>

      {/* notes modal */}
      {showNotes && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-background/90 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-2xl text-foreground">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <p className="mt-4 text-base">
              The psychedelic hallucination of <span className="text-primary">breathing surfaces</span>{" "}
              is rebuilt here from its likely cortical mechanism. A ~5-Hz traveling
              wave sweeps across a model of visual cortex — a lattice of coupled
              phase oscillators living in cortical (u,&nbsp;v) coordinates. Because
              the retina→V1 map is approximately a complex logarithm, the inverse
              warp r&nbsp;=&nbsp;exp(u) turns a cortical plane wave into the classic
              expanding / contracting concentric rings of an LSD trip.
            </p>
            <p className="mt-4 text-base">
              <span className="text-primary">See&nbsp;==&nbsp;hear:</span> the lattice
              is <em>forced</em> by the same traveling-wave sources that drive the
              audio, so the two share one clock. The instant a wavefront&apos;s
              cortical phase crosses a listening ring — the same instant the bright
              ring visibly reaches that radius — an inharmonic struck-bell cluster
              rings, panned to the front&apos;s screen angle. The visible sweep and
              the audible sweep are the same event.
            </p>
            <p className="mt-4 text-base">
              <span className="text-primary">Safety:</span> 5&nbsp;Hz sits above the
              3-Hz photosensitive-flicker ceiling, so the wave is rendered as a{" "}
              <em>spatial</em> ripple — a moving ring plus smooth local colour drift
              — and its temporal rate is slowed into the theta band (~1–1.8&nbsp;Hz),
              never a full-field luminance flash. No strobe anywhere; reduced-motion
              slows and de-saturates everything further.
            </p>
            <p className="mt-4 text-base">
              A REBUS / entropic-brain arc raises coupling strength, noise and the
              number of interfering sources over ~7 minutes: one calm wave at the
              cosmic onset, multiple interfering wavefronts and spirals at the melt,
              then a gentle settle. Seeded accumulators mean it never loops.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              Research anchor: a 5-HT2A agonist amplifies ~5-Hz oscillations in V1
              and retrosplenial cortex that propagate as cortical traveling waves
              (Communications Biology, 12 Jan 2026 — ~6 months old, not fresh).
              Also: Bressloff &amp; Cowan (2001) on the log-polar cortical map and
              Klüver&apos;s form constants; Carhart-Harris&apos; REBUS / entropic
              brain; Kuramoto&apos;s coupled-oscillator model.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-muted px-6 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
