"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sampleArc } from "./arc";
import { COMPUTE_WGSL, RENDER_WGSL } from "./shaders";
import { createAudio, type AudioEngine } from "./audio";
import { makeRng, SEED } from "./rng";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { README_TEXT } from "./readme-text";

type Tier = "pending" | "gpu" | "canvas" | "none";

interface VisualRunner {
  dispose: () => void;
}

const GPU_MOTES = 200_000;
const GPU_CLUSTERS = 24;
const CANVAS_MOTES = 3_200;
const CANVAS_CLUSTERS = 12;

// ── seeded field initialisation (shared shape between both tiers) ─────────────
function makeField(count: number, clusters: number) {
  const rng = makeRng(SEED);
  const state = new Float32Array(count * 4); // pos.xy vel.xy
  const params = new Float32Array(count * 4); // home.xy cluster bright
  for (let i = 0; i < count; i++) {
    const hx = (rng() * 2 - 1) * 1.05;
    const hy = (rng() * 2 - 1) * 1.05;
    state[i * 4] = hx;
    state[i * 4 + 1] = hy;
    state[i * 4 + 2] = 0;
    state[i * 4 + 3] = 0;
    params[i * 4] = hx;
    params[i * 4 + 1] = hy;
    params[i * 4 + 2] = Math.floor(rng() * clusters);
    params[i * 4 + 3] = 0.2 + rng() * 0.8;
  }
  const cen = new Float32Array(clusters * 2);
  for (let k = 0; k < clusters; k++) {
    const ang = (k / clusters) * Math.PI * 2 + (rng() - 0.5) * 0.6;
    const rad = 0.32 + rng() * 0.52;
    cen[k * 2] = Math.cos(ang) * rad;
    cen[k * 2 + 1] = Math.sin(ang) * rad * 0.9;
  }
  return { state, params, cen };
}

// slew helper — keeps C moving no faster than `rate` per second (guards loop wrap)
function stepToward(cur: number, target: number, rate: number, dt: number): number {
  const max = rate * dt;
  const d = target - cur;
  if (d > max) return cur + max;
  if (d < -max) return cur - max;
  return target;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — WebGPU compute. All fallible setup happens before the canvas context
// is configured, so any failure falls through to Canvas2D with no blank screen.
// ─────────────────────────────────────────────────────────────────────────────
async function runGpu(
  canvas: HTMLCanvasElement,
  start: number,
  reduced: boolean,
  onPhase: (label: string) => void,
): Promise<VisualRunner | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();

  const { state, params, cen } = makeField(GPU_MOTES, GPU_CLUSTERS);

  // Build every pipeline BEFORE configuring the context; validate via error scope.
  device.pushErrorScope("validation");

  const stateBuf = device.createBuffer({
    size: state.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const paramBuf = device.createBuffer({
    size: params.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const cenBuf = device.createBuffer({
    size: cen.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const simBuf = device.createBuffer({
    size: 32, // 8 × f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const renBuf = device.createBuffer({
    size: 16, // 4 × f32
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const format = navigator.gpu.getPreferredCanvasFormat();
  const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
  const renderModule = device.createShaderModule({ code: RENDER_WGSL });

  const computePipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module: computeModule, entryPoint: "main" },
  });

  const renderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: renderModule, entryPoint: "vs" },
    fragment: {
      module: renderModule,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const validationError = await device.popErrorScope();
  if (validationError) {
    device.destroy();
    return null;
  }

  device.queue.writeBuffer(stateBuf, 0, state);
  device.queue.writeBuffer(paramBuf, 0, params);
  device.queue.writeBuffer(cenBuf, 0, cen);

  const computeBind = device.createBindGroup({
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateBuf } },
      { binding: 1, resource: { buffer: paramBuf } },
      { binding: 2, resource: { buffer: simBuf } },
      { binding: 3, resource: { buffer: cenBuf } },
    ],
  });
  const renderBind = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: stateBuf } },
      { binding: 1, resource: { buffer: paramBuf } },
      { binding: 2, resource: { buffer: renBuf } },
    ],
  });

  // Only now do we commit to the canvas — if this throws we've already returned
  // null above on any earlier failure, so Canvas2D can still claim a fresh context.
  const rawCtx = canvas.getContext("webgpu");
  if (!rawCtx) {
    device.destroy();
    return null;
  }
  const ctx: GPUCanvasContext = rawCtx;
  ctx.configure({ device, format, alphaMode: "opaque" });

  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const simArr = new Float32Array(8);
  const renArr = new Float32Array(4);
  const workgroups = Math.ceil(GPU_MOTES / 64);
  const cRate = reduced ? 0.35 : 0.6;
  const swirlReduced = reduced ? 1 : 0;

  let cCur = 0;
  let raf = 0;
  let last = start;
  let labelAt = 0;
  let disposed = false;

  function frame(nowMs: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const t = (nowMs - start) / 1000;
    let dt = (nowMs - last) / 1000;
    last = nowMs;
    if (!(dt > 0) || dt > 0.05) dt = 1 / 60;

    const arc = sampleArc(t);
    cCur = stepToward(cCur, arc.C, cRate, dt);

    const breath = reduced ? 0.02 : 0.05;
    const cx = breath * Math.sin(t * 0.05);
    const cy = breath * Math.cos(t * 0.043);

    simArr[0] = Math.min(0.033, dt); // dt
    simArr[1] = t; // time
    simArr[2] = cCur; // C
    simArr[3] = arc.converge; // converge
    simArr[4] = cx;
    simArr[5] = cy;
    simArr[6] = swirlReduced;
    simArr[7] = 0;
    device.queue.writeBuffer(simBuf, 0, simArr);

    const aspect = Math.max(0.0001, canvas.width / canvas.height);
    renArr[0] = cCur;
    renArr[1] = aspect;
    renArr[2] = reduced ? 0.0055 : 0.006;
    renArr[3] = t;
    device.queue.writeBuffer(renBuf, 0, renArr);

    const enc = device.createCommandEncoder();
    const cpass = enc.beginComputePass();
    cpass.setPipeline(computePipeline);
    cpass.setBindGroup(0, computeBind);
    cpass.dispatchWorkgroups(workgroups);
    cpass.end();

    const view = ctx.getCurrentTexture().createView();
    const rpass = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.015, g: 0.01, b: 0.03, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    rpass.setPipeline(renderPipeline);
    rpass.setBindGroup(0, renderBind);
    rpass.draw(6, GPU_MOTES);
    rpass.end();
    device.queue.submit([enc.finish()]);

    if (nowMs - labelAt > 250) {
      labelAt = nowMs;
      onPhase(arc.label);
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      try {
        device.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — Canvas2D. Same FADING→SURGE→BOUNDLESS→RETURN binding read, ~3k motes.
// ─────────────────────────────────────────────────────────────────────────────
function runCanvas2D(
  canvas: HTMLCanvasElement,
  start: number,
  reduced: boolean,
  onPhase: (label: string) => void,
): VisualRunner | null {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) return null;
  const ctx: CanvasRenderingContext2D = ctx2d;

  const { state, params, cen } = makeField(CANVAS_MOTES, CANVAS_CLUSTERS);
  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

  function resize() {
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const cRate = reduced ? 0.35 : 0.6;
  const swirlAmt = reduced ? 0.16 : 0.45;
  let cCur = 0;
  let raf = 0;
  let last = start;
  let labelAt = 0;
  let disposed = false;

  function frame(nowMs: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const t = (nowMs - start) / 1000;
    let dt = (nowMs - last) / 1000;
    last = nowMs;
    if (!(dt > 0) || dt > 0.05) dt = 1 / 60;
    const sdt = Math.min(0.033, dt);

    const arc = sampleArc(t);
    cCur = stepToward(cCur, arc.C, cRate, dt);
    const C = cCur;
    const converge = arc.converge;

    const w = canvas.width;
    const h = canvas.height;
    const aspect = Math.max(0.0001, w / h);
    const cbx = (reduced ? 0.02 : 0.05) * Math.sin(t * 0.05);
    const cby = (reduced ? 0.02 : 0.05) * Math.cos(t * 0.043);

    // integrate the field
    for (let i = 0; i < CANVAS_MOTES; i++) {
      const si = i * 4;
      let px = state[si];
      let py = state[si + 1];
      let vx = state[si + 2];
      let vy = state[si + 3];
      const hx = params[si];
      const hy = params[si + 1];
      const ci = params[si + 2] | 0;

      let cxn = cen[ci * 2];
      let cyn = cen[ci * 2 + 1];
      cxn = cxn + (cbx - cxn) * converge;
      cyn = cyn + (cby - cyn) * converge;

      let fx = 0;
      let fy = 0;
      const disp = 1 - C;
      fx += (hx - px) * (0.30 * disp);
      fy += (hy - py) * (0.30 * disp);

      const tx = cxn - px;
      const ty = cyn - py;
      const d = Math.hypot(tx, ty) + 1e-4;
      const dx = tx / d;
      const dy = ty / d;
      const pull = C * (1.1 + 0.7 * C) * Math.min(d, 1.4);
      fx += dx * pull;
      fy += dy * pull;
      const sw = C * swirlAmt * Math.min(d, 0.7);
      fx += -dy * sw;
      fy += dx * sw;

      vx += fx * sdt;
      vy += fy * sdt;
      const damp = 0.986 + (0.9 - 0.986) * C;
      vx *= damp;
      vy *= damp;
      const vl = Math.hypot(vx, vy);
      if (vl > 2.2) {
        vx = (vx / vl) * 2.2;
        vy = (vy / vl) * 2.2;
      }
      px += vx * sdt;
      py += vy * sdt;
      if (px > 1.18) { px = 1.18; vx *= -0.3; }
      if (px < -1.18) { px = -1.18; vx *= -0.3; }
      if (py > 1.18) { py = 1.18; vy *= -0.3; }
      if (py < -1.18) { py = -1.18; vy *= -0.3; }

      state[si] = px;
      state[si + 1] = py;
      state[si + 2] = vx;
      state[si + 3] = vy;
    }

    // fade to void (trails), then additive draw
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4, 3, 8, 0.34)";
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = "lighter";
    // colour: violet → gold → white-gold with C
    const cs = Math.min(1, Math.max(0, (C - 0.2) / 0.6));
    const ws = Math.min(1, Math.max(0, (C - 0.75) / 0.25));
    const rr = Math.round((0.42 + (1.0 - 0.42) * cs + (1.0 - (0.42 + 0.58 * cs)) * ws) * 255);
    const gg = Math.round((0.26 + (0.78 - 0.26) * cs + (0.95 - (0.26 + 0.52 * cs)) * ws) * 255);
    const bb = Math.round((0.95 + (0.42 - 0.95) * cs + (0.86 - (0.95 - 0.53 * cs)) * ws) * 255);
    const rad = (reduced ? 1.1 : 1.3) * dpr;
    const baseA = 0.10 + 0.28 * C;

    for (let i = 0; i < CANVAS_MOTES; i++) {
      const si = i * 4;
      const px = state[si];
      const py = state[si + 1];
      const bright = params[si + 3];
      const sx = (px / aspect * 0.5 + 0.5) * w;
      const sy = (py * 0.5 + 0.5) * h;
      ctx.globalAlpha = Math.min(1, baseA * (0.4 + bright));
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    if (nowMs - labelAt > 250) {
      labelAt = nowMs;
      onPhase(arc.label);
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}

export default function LastCoherencePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const startedRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tier, setTier] = useState<Tier>("pending");
  const [phaseLabel, setPhaseLabel] = useState<string>("Fading — the senses withdraw");
  const [hasSample, setHasSample] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  // visuals self-demo from mount (only Begin unlocks audio)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = prefersReducedMotion();
    const start = performance.now();
    let disposed = false;
    let runner: VisualRunner | null = null;
    const onPhase = (label: string) => setPhaseLabel(label);

    (async () => {
      let gpu: VisualRunner | null = null;
      try {
        gpu = await runGpu(canvas, start, reduced, onPhase);
      } catch {
        gpu = null;
      }
      if (disposed) {
        gpu?.dispose();
        return;
      }
      if (gpu) {
        runner = gpu;
        setTier("gpu");
        return;
      }
      const c2d = runCanvas2D(canvas, start, reduced, onPhase);
      if (disposed) {
        c2d?.dispose();
        return;
      }
      if (c2d) {
        runner = c2d;
        setTier("canvas");
      } else {
        setTier("none");
      }
    })();

    return () => {
      disposed = true;
      runner?.dispose();
    };
  }, []);

  // dispose audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const begin = useCallback(async () => {
    if (!audioRef.current) audioRef.current = createAudio();
    try {
      await audioRef.current.resume();
      startedRef.current = true;
      setStarted(true);
    } catch {
      // audio failed but visuals still run — still mark started so overlay clears
      startedRef.current = true;
      setStarted(true);
    }
  }, []);

  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!audioRef.current) audioRef.current = createAudio();
    try {
      await audioRef.current.loadFile(file);
      setHasSample(audioRef.current.hasSample());
      setFileName(file.name);
    } catch {
      setHasSample(false);
      setFileName(null);
    }
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {/* title + description + phase readout */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          The Last Coherence
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          A near-death experience not as a tunnel, but as the dying brain&apos;s
          own memory binding together at once — then releasing into light.
        </p>
        {tier !== "none" && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>{phaseLabel}</span>
            {tier === "canvas" && <span>· canvas2d field</span>}
            {tier === "gpu" && <span>· webgpu · 200k motes</span>}
            {hasSample && fileName && <span>· grain: {fileName}</span>}
          </div>
        )}
      </div>

      {/* notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* drop-a-piano-track (optional) — visible once running */}
      {started && tier !== "none" && (
        <div className="absolute bottom-5 left-5 z-10">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={onPickFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {hasSample ? "Piano track loaded — change" : "Drop a piano track (optional)"}
          </button>
        </div>
      )}

      {/* Tier 3 — nothing renders */}
      {tier === "none" && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive">
          This device can&apos;t render the field (no WebGPU and no Canvas2D). The
          audio still plays on Begin.
        </div>
      )}

      {/* start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/50 backdrop-blur-sm">
          <div className="max-w-md px-6 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              The final simulation
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              A scattered field of memory-motes will drift, then surge into
              brilliant constellations, converge into one boundless light, and
              release. About six minutes, autonomous, looping. Sound begins on
              your click.
            </p>
          </div>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
