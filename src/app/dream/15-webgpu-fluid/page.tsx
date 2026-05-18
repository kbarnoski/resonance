"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Constants ──────────────────────────────────────────────────────────────────

const SIM = 512;
const JACOBI = 25;
const SIM_FMT = "rgba16float" as GPUTextureFormat;

// ── WGSL ───────────────────────────────────────────────────────────────────────

// Full-screen quad: clip coords, UV (0,0)=bottom-left to match mouse convention
const VERT = `
struct V { @builtin(position) p: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2f,4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let xy = c[i];
  return V(vec4f(xy,0,1), vec2f(xy.x*.5+.5, .5-xy.y*.5));
}`;

// Advect: backward-trace through velocity field
// group1 uniform: vec4f(dt, dissipation, 0, 0)
const ADVECT_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(1) @binding(0) var<uniform> u: vec4f;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let v = textureSample(vel, smp, uv).xy;
  let back = clamp(uv - u.x * v, vec2f(0), vec2f(1));
  return u.y * textureSample(src, smp, back);
}`;

// Finite-difference divergence of velocity
const DIV_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var vel: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(vel, 0));
  let L = textureSample(vel, smp, uv-vec2f(ts.x,0)).x;
  let R = textureSample(vel, smp, uv+vec2f(ts.x,0)).x;
  let B = textureSample(vel, smp, uv-vec2f(0,ts.y)).y;
  let T = textureSample(vel, smp, uv+vec2f(0,ts.y)).y;
  return vec4f((R-L+T-B)*.5, 0, 0, 1);
}`;

// Jacobi pressure iteration — one step, call JACOBI times
const PRES_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var pres: texture_2d<f32>;
@group(0) @binding(2) var divTex: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(pres, 0));
  let L = textureSample(pres, smp, uv-vec2f(ts.x,0)).x;
  let R = textureSample(pres, smp, uv+vec2f(ts.x,0)).x;
  let B = textureSample(pres, smp, uv-vec2f(0,ts.y)).x;
  let T = textureSample(pres, smp, uv+vec2f(0,ts.y)).x;
  let d = textureSample(divTex, smp, uv).x;
  return vec4f((L+R+B+T-d)*.25, 0, 0, 1);
}`;

// Subtract pressure gradient → divergence-free velocity
const GRAD_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var pres: texture_2d<f32>;
@group(0) @binding(2) var vel: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(pres, 0));
  let L = textureSample(pres, smp, uv-vec2f(ts.x,0)).x;
  let R = textureSample(pres, smp, uv+vec2f(ts.x,0)).x;
  let B = textureSample(pres, smp, uv-vec2f(0,ts.y)).x;
  let T = textureSample(pres, smp, uv+vec2f(0,ts.y)).x;
  let v = textureSample(vel, smp, uv).xy;
  return vec4f(v - .5*vec2f(R-L,T-B), 0, 1);
}`;

// Gaussian splat onto a texture
// group1: vec4f(posX, posY, radius, aspectRatio), vec4f(colR, colG, colB, 0)
const SPLAT_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var src: texture_2d<f32>;
struct SU { posRad: vec4f, col: vec4f }
@group(1) @binding(0) var<uniform> su: SU;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var d = uv - su.posRad.xy;
  d.x *= su.posRad.w;
  let g = exp(-dot(d,d) / su.posRad.z);
  return textureSample(src, smp, uv) + vec4f(g * su.col.xyz, 0);
}`;

// Filmic tone-map + gamma for display
const DISPLAY_FS = `
@group(0) @binding(0) var smp: sampler;
@group(0) @binding(1) var dye: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSample(dye, smp, uv).rgb;
  c = c / (1.0 + dot(c, vec3f(.299,.587,.114)));
  return vec4f(pow(max(c, vec3f(0)), vec3f(.45)), 1);
}`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface GpuSim {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  canvasFmt: GPUTextureFormat;
  sampler: GPUSampler;
  // Ping-pong texture pairs: [read, write]
  vel: [GPUTexture, GPUTexture];
  pres: [GPUTexture, GPUTexture];
  div: GPUTexture;
  dye: [GPUTexture, GPUTexture];
  // Read index (write = 1 - read)
  vR: 0 | 1;
  pR: 0 | 1;
  dR: 0 | 1;
  // Pipelines
  advectPl: GPURenderPipeline;
  divPl: GPURenderPipeline;
  presPl: GPURenderPipeline;
  gradPl: GPURenderPipeline;
  splatPl: GPURenderPipeline;
  displayPl: GPURenderPipeline;
  // Uniform buffers (16 bytes each)
  advVelUni: GPUBuffer; // {dt, velDiss=0.9, 0, 0}
  advDyeUni: GPUBuffer; // {dt, dyeDiss=0.985, 0, 0}
  splatVelUni: GPUBuffer; // splat vel params
  splatDyeUni: GPUBuffer; // splat dye params
}

// ── WebGPU init ───────────────────────────────────────────────────────────────

async function buildSim(canvas: HTMLCanvasElement): Promise<GpuSim> {
  if (!navigator.gpu) throw new Error("WebGPU not supported in this browser.");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No WebGPU adapter available.");
  const device = await adapter.requestDevice();

  const canvasFmt = navigator.gpu.getPreferredCanvasFormat();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("Could not get WebGPU canvas context.");
  ctx.configure({ device, format: canvasFmt, alphaMode: "opaque" });

  const mkTex = (): GPUTexture =>
    device.createTexture({
      size: [SIM, SIM],
      format: SIM_FMT,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

  const sampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const mkUni = (values: number[]): GPUBuffer => {
    const buf = device.createBuffer({
      size: 32, // max 8 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buf, 0, f32buf(...values));
    return buf;
  };

  const mkPipeline = (fsSrc: string, fmt: GPUTextureFormat = SIM_FMT): GPURenderPipeline => {
    const vs = device.createShaderModule({ code: VERT });
    const fs = device.createShaderModule({ code: fsSrc });
    return device.createRenderPipeline({
      layout: "auto",
      vertex: { module: vs, entryPoint: "vs" },
      fragment: { module: fs, entryPoint: "fs", targets: [{ format: fmt }] },
      primitive: { topology: "triangle-strip" },
    });
  };

  return {
    device,
    ctx,
    canvasFmt,
    sampler,
    vel: [mkTex(), mkTex()],
    pres: [mkTex(), mkTex()],
    div: mkTex(),
    dye: [mkTex(), mkTex()],
    vR: 0, pR: 0, dR: 0,
    advectPl: mkPipeline(ADVECT_FS),
    divPl: mkPipeline(DIV_FS),
    presPl: mkPipeline(PRES_FS),
    gradPl: mkPipeline(GRAD_FS),
    splatPl: mkPipeline(SPLAT_FS),
    displayPl: mkPipeline(DISPLAY_FS, canvasFmt),
    advVelUni: mkUni([0, 0.9, 0, 0]),
    advDyeUni: mkUni([0, 0.985, 0, 0]),
    splatVelUni: mkUni([0, 0, 0, 0, 0, 0, 0, 0]),
    splatDyeUni: mkUni([0, 0, 0, 0, 0, 0, 0, 0]),
  };
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderTo(
  enc: GPUCommandEncoder,
  pipeline: GPURenderPipeline,
  groups: GPUBindGroup[],
  target: GPUTextureView,
): void {
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: target,
      loadOp: "clear" as GPULoadOp,
      storeOp: "store" as GPUStoreOp,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    }],
  });
  pass.setPipeline(pipeline);
  for (let i = 0; i < groups.length; i++) pass.setBindGroup(i, groups[i]);
  pass.draw(4);
  pass.end();
}

function makeBg(
  pl: GPURenderPipeline,
  grp: number,
  entries: GPUBindGroupEntry[],
  device: GPUDevice,
): GPUBindGroup {
  return device.createBindGroup({ layout: pl.getBindGroupLayout(grp), entries });
}

// ── Per-frame simulation ───────────────────────────────────────────────────────

function applySimSplat(
  g: GpuSim,
  x: number, y: number,
  vx: number, vy: number,
  cr: number, cg: number, cb: number,
  velRad = 0.012,
  dyeRad = 0.005,
): void {
  const { device, sampler, splatPl, vel, dye } = g;
  // Write vel params: posRad(x,y,velRad,1), col(vx,vy,0,0)
  device.queue.writeBuffer(g.splatVelUni, 0, f32buf(x, y, velRad, 1.0, vx, vy, 0, 0));
  // Write dye params: posRad(x,y,dyeRad,1), col(cr,cg,cb,0)
  device.queue.writeBuffer(g.splatDyeUni, 0, f32buf(x, y, dyeRad, 1.0, cr, cg, cb, 0));

  const vW = (1 - g.vR) as 0 | 1;
  const dW = (1 - g.dR) as 0 | 1;

  const enc = device.createCommandEncoder();

  const velBg0 = makeBg(splatPl, 0, [
    { binding: 0, resource: sampler },
    { binding: 1, resource: vel[g.vR].createView() },
  ], device);
  const velBg1 = makeBg(splatPl, 1, [{ binding: 0, resource: { buffer: g.splatVelUni } }], device);
  renderTo(enc, splatPl, [velBg0, velBg1], vel[vW].createView());

  const dyeBg0 = makeBg(splatPl, 0, [
    { binding: 0, resource: sampler },
    { binding: 1, resource: dye[g.dR].createView() },
  ], device);
  const dyeBg1 = makeBg(splatPl, 1, [{ binding: 0, resource: { buffer: g.splatDyeUni } }], device);
  renderTo(enc, splatPl, [dyeBg0, dyeBg1], dye[dW].createView());

  device.queue.submit([enc.finish()]);
  g.vR = vW;
  g.dR = dW;
}

function stepFluid(g: GpuSim, dt: number): void {
  const { device, sampler, advectPl, divPl, presPl, gradPl } = g;

  // Update dt in both advect uniform buffers (diss stays constant)
  device.queue.writeBuffer(g.advVelUni, 0, f32buf(dt, 0.9, 0, 0));
  device.queue.writeBuffer(g.advDyeUni, 0, f32buf(dt, 0.985, 0, 0));

  const enc = device.createCommandEncoder();
  const vR = g.vR;
  const vW = (1 - vR) as 0 | 1;

  // 1. Advect velocity (self)
  renderTo(enc, advectPl, [
    makeBg(advectPl, 0, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: g.vel[vR].createView() },
      { binding: 2, resource: g.vel[vR].createView() },
    ], device),
    makeBg(advectPl, 1, [{ binding: 0, resource: { buffer: g.advVelUni } }], device),
  ], g.vel[vW].createView());
  g.vR = vW;

  // 2. Divergence of velocity
  renderTo(enc, divPl, [
    makeBg(divPl, 0, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: g.vel[g.vR].createView() },
    ], device),
  ], g.div.createView());

  // 3. Pressure Jacobi iterations
  for (let i = 0; i < JACOBI; i++) {
    const pr = g.pR, pw = (1 - pr) as 0 | 1;
    renderTo(enc, presPl, [
      makeBg(presPl, 0, [
        { binding: 0, resource: sampler },
        { binding: 1, resource: g.pres[pr].createView() },
        { binding: 2, resource: g.div.createView() },
      ], device),
    ], g.pres[pw].createView());
    g.pR = pw;
  }

  // 4. Gradient subtract → divergence-free velocity
  {
    const vr = g.vR, vw = (1 - vr) as 0 | 1;
    renderTo(enc, gradPl, [
      makeBg(gradPl, 0, [
        { binding: 0, resource: sampler },
        { binding: 1, resource: g.pres[g.pR].createView() },
        { binding: 2, resource: g.vel[vr].createView() },
      ], device),
    ], g.vel[vw].createView());
    g.vR = vw;
  }

  // 5. Advect dye through corrected velocity
  {
    const dr = g.dR, dw = (1 - dr) as 0 | 1;
    renderTo(enc, advectPl, [
      makeBg(advectPl, 0, [
        { binding: 0, resource: sampler },
        { binding: 1, resource: g.vel[g.vR].createView() },
        { binding: 2, resource: g.dye[dr].createView() },
      ], device),
      makeBg(advectPl, 1, [{ binding: 0, resource: { buffer: g.advDyeUni } }], device),
    ], g.dye[dw].createView());
    g.dR = dw;
  }

  device.queue.submit([enc.finish()]);
  // Restore ping-pong indices to consistent state
  // (g.vR, g.pR, g.dR were mutated above; they now point to the freshly-written textures)
}

function renderDisplay(g: GpuSim): void {
  const { device, sampler, displayPl, dye, dR, ctx } = g;
  const enc = device.createCommandEncoder();
  const canvasTex = ctx.getCurrentTexture();
  renderTo(enc, displayPl, [
    makeBg(displayPl, 0, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: dye[dR].createView() },
    ], device),
  ], canvasTex.createView());
  device.queue.submit([enc.finish()]);
}

// ── Typed-array helper (avoids ArrayBufferLike vs ArrayBuffer TS mismatch) ───

function f32buf(...vals: number[]): ArrayBuffer {
  return new Float32Array(vals).buffer as ArrayBuffer;
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function centroidColor(hz: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (hz - 80) / 4000));
  if (t < 0.33) {
    const s = t / 0.33;
    return [0.05 + s * 0.1, 0.3 + s * 0.2, 1.0 - s * 0.1];
  } else if (t < 0.66) {
    const s = (t - 0.33) / 0.33;
    return [0.1 + s * 0.5, 0.8 - s * 0.2, 0.9 - s * 0.7];
  } else {
    const s = (t - 0.66) / 0.34;
    return [0.6 + s * 0.4, 0.5 - s * 0.4, 0.2 - s * 0.2];
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

type Mode = "idle" | "mic" | "demo";

export default function WgpuFluidPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0.5, y: 0.5, lx: 0.5, ly: 0.5, down: false });
  const ambPhaseRef = useRef(0);
  const ambTimerRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [gpuError, setGpuError] = useState<string | null>(null);

  const { running, error: micError, start: startMic, stop: stopMic, getFrame, gain, setGain } =
    useMicAnalyser({ smoothing: 0.78, gain: 2.2, onsetThreshold: 1.55 });

  const useMic = mode === "mic";

  // ── Canvas pointer events ─────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const toUV = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      return { x: (cx - r.left) / r.width, y: 1 - (cy - r.top) / r.height };
    };
    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const { x, y } = toUV(e.clientX, e.clientY);
      mouseRef.current = { x, y, lx: x, ly: y, down: true };
    };
    const onMove = (e: PointerEvent) => {
      if (!mouseRef.current.down) return;
      const { x, y } = toUV(e.clientX, e.clientY);
      mouseRef.current.x = x;
      mouseRef.current.y = y;
    };
    const onUp = () => { mouseRef.current.down = false; };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // ── Main loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gpu: GpuSim | null = null;
    let raf = 0;
    let cancelled = false;
    let lastT = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    buildSim(canvas).then(g => {
      if (cancelled) { g.device.destroy(); return; }
      gpu = g;

      const tick = (now: number) => {
        if (!gpu) return;
        const dt = Math.min((now - lastT) / 1000, 1 / 20);
        lastT = now;
        const m = mouseRef.current;

        // Mouse drag splat
        if (m.down) {
          const dvx = Math.max(-3, Math.min(3, (m.x - m.lx) / dt));
          const dvy = Math.max(-3, Math.min(3, (m.y - m.ly) / dt));
          if (Math.hypot(dvx, dvy) > 0.01) {
            applySimSplat(gpu, m.x, m.y, dvx * 0.6, dvy * 0.6, 0.25, 0.55, 1.0, 0.016, 0.008);
          }
          mouseRef.current.lx = m.x;
          mouseRef.current.ly = m.y;
        }

        // Audio splats
        if (useMic && running) {
          const frame = getFrame();
          if (frame) {
            const bass = frame.bands[0] * 0.4 + frame.bands[1] * 0.6;
            const treble = frame.bands[4] * 0.5 + frame.bands[5] * 0.5;
            const [cr, cg, cb] = centroidColor(frame.centroid);

            if (bass > 0.04) {
              const a = Math.random() * Math.PI * 2;
              const d = 0.05 + Math.random() * 0.08;
              applySimSplat(gpu,
                0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d,
                Math.cos(a) * bass * 1.4, Math.sin(a) * bass * 1.4,
                cr * bass * 1.5, cg * bass, cb * bass * 0.8, 0.018, 0.008);
            }
            if (treble > 0.06) {
              const a = Math.random() * Math.PI * 2;
              applySimSplat(gpu,
                0.25 + Math.random() * 0.5, 0.25 + Math.random() * 0.5,
                Math.cos(a) * treble * 0.7, Math.sin(a) * treble * 0.7,
                cr * 0.4, cg * 0.3, cb * treble, 0.008, 0.003);
            }
            if (frame.onset) {
              const a = Math.random() * Math.PI * 2;
              applySimSplat(gpu,
                0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6,
                Math.cos(a) * 2.0, Math.sin(a) * 2.0,
                cr, cg * 0.9, cb, 0.022, 0.01);
            }
          }
        }

        // Ambient drift (demo mode or fallback)
        if (!useMic || !running) {
          ambTimerRef.current += dt;
          ambPhaseRef.current += dt * 0.18;
          const p = ambPhaseRef.current;
          if (ambTimerRef.current > 0.7) {
            ambTimerRef.current = 0;
            const a = p * 2.3;
            const hue = (p * 0.5) % 1.0;
            const r = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2);
            const g2 = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2 + 2.094);
            const b2 = 0.5 + 0.5 * Math.sin(hue * Math.PI * 2 + 4.189);
            applySimSplat(gpu,
              0.5 + Math.cos(p * 1.3) * 0.28, 0.5 + Math.sin(p * 0.97) * 0.28,
              Math.cos(a) * 0.5, Math.sin(a) * 0.5,
              r, g2, b2, 0.014, 0.007);
          }
        }

        stepFluid(gpu, dt);
        renderDisplay(gpu);
        raf = requestAnimationFrame(tick);
      };

      raf = requestAnimationFrame(tick);
    }).catch(e => {
      if (!cancelled) {
        setGpuError(e instanceof Error ? e.message : "WebGPU init failed");
        setMode("idle");
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      gpu?.device.destroy();
    };
  }, [mode, useMic, running, getFrame]);

  const startMode = useCallback((m: Mode) => {
    setMode(m);
    if (m === "mic") startMic();
  }, [startMic]);

  const stopMode = useCallback(() => {
    setMode("idle");
    if (useMic) stopMic();
  }, [useMic, stopMic]);

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#000", cursor: mode !== "idle" ? "crosshair" : "default", touchAction: "none" }}
      />

      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-2 tracking-tight">Fluid <span className="text-white/30 text-lg">WebGPU</span></h1>
          <p className="text-sm text-white/55 max-w-sm mb-2 leading-relaxed">
            Navier-Stokes ink-in-water at 512×512 — 16× the resolution of the WebGL2 version.
            Bass pulses the center, treble stirs turbulence, pitch shifts color. Drag to stir.
          </p>
          <p className="text-xs text-white/30 max-w-xs mb-8 leading-relaxed">
            Requires WebGPU (Chrome, Edge, Firefox, Safari 26+). Falls back to an error message on older browsers.
          </p>

          {gpuError && (
            <p className="mb-5 text-xs text-rose-300/70 max-w-xs leading-relaxed border border-rose-400/20 rounded px-4 py-2">
              {gpuError}
            </p>
          )}

          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() => startMode("mic")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition"
            >
              Start mic
            </button>
            <button
              onClick={() => startMode("demo")}
              className="px-5 py-2.5 text-sm tracking-wider uppercase border border-white/20 rounded hover:bg-white/5 hover:border-white/40 transition text-white/55"
            >
              Ambient drift
            </button>
          </div>

          {micError && (
            <p className="mt-4 text-xs text-rose-300/70 max-w-xs">{micError}</p>
          )}

          <Link href="/dream" className="mt-12 text-[11px] text-white/30 hover:text-white/60">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {mode !== "idle" && (
        <div className="absolute top-4 right-4 flex flex-col items-end gap-2 select-none">
          <span className="text-[10px] tracking-widest text-white/35 uppercase">
            {useMic ? (running ? "● mic — 512²" : "starting…") : "demo — 512²"}
          </span>
          {useMic && running && (
            <>
              <label className="text-[9px] text-white/35 tracking-wider">GAIN {gain.toFixed(1)}</label>
              <input
                type="range" min="0.5" max="4" step="0.1"
                value={gain}
                onChange={e => setGain(parseFloat(e.target.value))}
                className="w-28 accent-white"
              />
            </>
          )}
          <button
            onClick={stopMode}
            className="text-[10px] uppercase tracking-wider text-white/45 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1 rounded transition"
          >
            stop
          </button>
          <Link href="/dream" className="text-[10px] text-white/30 hover:text-white/60">← back</Link>
          <a
            href="/dream/15-webgpu-fluid/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-[9px] text-white/20 hover:text-white/50 transition"
          >
            design notes ↗
          </a>
        </div>
      )}

      {mode !== "idle" && (
        <p className="absolute bottom-4 left-4 text-[9px] text-white/20 pointer-events-none select-none tracking-wider">
          drag to stir · WebGPU 512×512
        </p>
      )}
    </div>
  );
}
