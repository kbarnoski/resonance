"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buildGpu, makeViewProj, packCam, packSim, type GpuCtx } from "./gpu";
import { makeAudio, type AudioEngine } from "./audio";
import { runFallback, type CouplingState } from "./fallback";

const SEED = 0x5912;

type Phase = "init" | "gpu" | "fallback" | "unsupported";

export default function HomecomingPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("init");
  const [begun, setBegun] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const audioRef = useRef<AudioEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let raf = 0;
    let gpu: GpuCtx | null = null;
    let fallbackStop: (() => void) | null = null;

    const audio = makeAudio(SEED ^ 0x2c9a);
    audioRef.current = audio;

    const pointerTarget = { x: 0, y: 0 };
    const coupling: CouplingState = {
      breath: 0.5,
      deepen: 0,
      coreGlow: 0.4,
      pointerX: 0,
      pointerY: 0,
    };

    function onPointer(e: PointerEvent) {
      pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("pointermove", onPointer);

    const start = performance.now();

    function stepCoupling(now: number) {
      const t = (now - start) / 1000;
      const breath = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 42); // ~42s inhale/exhale
      let deepen = 1 - Math.exp(-t / 90); // piece deepens over ~2–3 min
      deepen += 0.08 * Math.sin((2 * Math.PI * t) / 210); // slow living drift
      deepen = Math.min(1.05, Math.max(0, deepen));
      const coreGlow = Math.min(1.2, 0.4 + 0.4 * breath + 0.4 * deepen);
      coupling.pointerX += (pointerTarget.x - coupling.pointerX) * 0.04;
      coupling.pointerY += (pointerTarget.y - coupling.pointerY) * 0.04;
      coupling.breath = breath;
      coupling.deepen = deepen;
      coupling.coreGlow = coreGlow;
      return { t, breath, deepen, coreGlow };
    }

    function resize(c: HTMLCanvasElement) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(c.clientWidth * dpr);
      const h = Math.floor(c.clientHeight * dpr);
      if (c.width !== w || c.height !== h) {
        c.width = Math.max(1, w);
        c.height = Math.max(1, h);
      }
    }

    function runGpuLoop(g: GpuCtx, c: HTMLCanvasElement) {
      let last = start;
      const rim = 11;
      const core = 0.9;
      function loop(now: number) {
        if (disposed) return;
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        resize(c);
        const cpl = stepCoupling(now);
        const { breath, deepen, coreGlow } = cpl;
        const aspect = c.width / Math.max(1, c.height);

        const sim = packSim({
          dt,
          time: cpl.t,
          fieldScale: 0.15 * (0.85 + 0.3 * breath),
          flowStrength: 2.6 * (0.8 + 0.4 * breath),
          inwardPull: 1.4 * (0.5 + 0.6 * breath) * (0.7 + 0.5 * deepen),
          coreRadius: core,
          rimRadius: rim,
          swirl: 2.2 * (0.7 + 0.6 * breath),
          breath,
          deepen,
          pointerX: coupling.pointerX,
          pointerY: coupling.pointerY,
          seed: SEED,
          count: g.count,
        });
        g.device.queue.writeBuffer(g.simUniBuf, 0, sim);

        const camDist = 22 - 3 * deepen;
        const vp = makeViewProj(cpl.t, aspect, coupling.pointerX, coupling.pointerY, camDist);
        const cam = packCam(vp, {
          pointSize: 0.010 * (1 + 0.35 * deepen),
          brightness: 0.55 + 0.35 * deepen + 0.2 * breath,
          time: cpl.t,
          coreGlow,
          aspect,
          coreRadius: core,
          rimRadius: rim,
        });
        g.device.queue.writeBuffer(g.camUniBuf, 0, cam);

        const enc = g.device.createCommandEncoder();
        const cp = enc.beginComputePass();
        cp.setPipeline(g.computePipeline);
        cp.setBindGroup(0, g.computeBG);
        cp.dispatchWorkgroups(g.dispatch);
        cp.end();

        const view = g.ctx.getCurrentTexture().createView();
        const rp = enc.beginRenderPass({
          colorAttachments: [
            {
              view,
              clearValue: { r: 0.018, g: 0.01, b: 0.04, a: 1 },
              loadOp: "clear",
              storeOp: "store",
            },
          ],
        });
        rp.setPipeline(g.renderPipeline);
        rp.setBindGroup(0, g.renderBG);
        rp.draw(6, g.count);
        rp.end();

        g.device.queue.submit([enc.finish()]);

        if (audio.running()) audio.update(breath, deepen, coreGlow);
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
    }

    (async () => {
      try {
        const g = await buildGpu(canvas, SEED);
        if (disposed) {
          g.destroy();
          return;
        }
        gpu = g;
        setPhase("gpu");
        runGpuLoop(g, canvas);
      } catch {
        if (disposed) return;
        // graceful degradation: reduced Canvas2D nebula (still audio-visual)
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) {
          setPhase("unsupported");
          return;
        }
        resize(canvas);
        // keep the fallback coupling breathing via a light ticker
        const tick = () => {
          if (disposed) return;
          resize(canvas);
          stepCoupling(performance.now());
          if (audio.running()) {
            audio.update(coupling.breath, coupling.deepen, coupling.coreGlow);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        const fb = runFallback(canvas, () => coupling);
        fallbackStop = fb.stop;
        setPhase("fallback");
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      if (fallbackStop) fallbackStop();
      audio.stop();
      if (gpu) gpu.destroy();
    };
  }, []);

  async function onBegin() {
    if (begun) return;
    setBegun(true);
    const a = audioRef.current;
    if (a) await a.start();
  }

  const ready = phase === "gpu" || phase === "fallback";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {/* Fading chrome — a title and a single Begin affordance. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-8 transition-opacity duration-[2200ms] ease-out"
        style={{ opacity: begun ? 0 : 1 }}
      >
        <h1 className="text-center text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Homecoming
        </h1>
        {ready && (
          <button
            type="button"
            onClick={onBegin}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        )}
        {phase === "init" && (
          <p className="text-base text-muted-foreground">Opening the field…</p>
        )}
      </div>

      {/* Unavailable / fallback notice — on-brand, non-blocking. */}
      {phase === "unsupported" && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGPU (or a 2D canvas) to render its nebula, and
            neither is available in this browser.
          </p>
        </div>
      )}
      {phase === "fallback" && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-center text-base text-destructive/80">
          WebGPU unavailable — showing a reduced nebula.
        </p>
      )}

      {/* Unobtrusive design-notes toggle. */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute bottom-4 right-4 z-20 text-base text-muted-foreground transition-colors hover:text-foreground"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-16 right-4 z-20 max-h-[70dvh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-border bg-card/95 p-5 text-card-foreground backdrop-blur">
          <h2 className="text-xl font-semibold tracking-tight">Cosmic Homecoming</h2>
          <p className="mt-3 text-base text-muted-foreground">
            You fall inward through a living nebula of light that breathes with a
            wordless just-intonation drone. Up to hundreds of thousands of
            particles are advected entirely on the GPU along the curl of a 3D
            noise field — divergence-free swirling flow — with a slow
            gravitational drift toward a warm central bloom. Reach the core and
            you respawn at the rim: a continuous homecoming.
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            A ~42-second breath modulates the flow scale and inward pull, and the
            whole field deepens over two to three minutes, so minute three differs
            from second zero. The drone&apos;s brightness and level swell with the
            same breath.
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            References: Refik Anadol, <em>Latent City</em> (BRUSK, Bruges 2026) and{" "}
            <em>Machine Hallucinations</em> — data-nebula immersion; curl-noise
            after Bridson et al., &ldquo;Curl-Noise for Procedural Fluid
            Flow&rdquo; (2007). Renders end-to-end in WebGPU;
            degrades to a reduced Canvas2D nebula, then to an on-brand notice.
          </p>
          <Link
            href="/dream"
            className="mt-4 inline-block text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Back to the lab
          </Link>
        </div>
      )}
    </main>
  );
}
