// render.ts — water surface renderer (WebGPU → Canvas2D fallback)
// Draws a luminous, breathing water horizon synced to swell data.

import type { MarineData } from "./marine";

// ── Shared wave-math ─────────────────────────────────────────────────────────

interface WaveParams {
  swellHeight: number;   // metres → amplitude scale
  swellPeriod: number;   // seconds → visual wavelength / speed
  temperature: number;   // °C → palette warmth
}

// Compute height at x for a sum-of-sines ocean surface (normalised 0..1 canvas)
function computeWaterHeight(
  x: number,
  t: number,
  p: WaveParams,
  canvasWidth: number,
  canvasHeight: number,
): number {
  const amp = Math.min(0.18, 0.04 + (p.swellHeight / 4.0) * 0.14);
  const speed = 0.6 / Math.max(6, p.swellPeriod);
  const waveLen = canvasWidth * (0.28 + p.swellPeriod * 0.018);

  const w1 = amp * Math.sin((x / waveLen) * 2 * Math.PI - t * speed * 2 * Math.PI);
  const w2 = (amp * 0.45) * Math.sin((x / (waveLen * 0.62)) * 2 * Math.PI - t * speed * 1.7 * 2 * Math.PI + 1.1);
  const w3 = (amp * 0.22) * Math.sin((x / (waveLen * 1.4)) * 2 * Math.PI - t * speed * 0.9 * 2 * Math.PI + 2.3);

  // breathPhase lifts the whole surface
  const breathPhase = (Math.sin((t / Math.max(6, p.swellPeriod)) * 2 * Math.PI - Math.PI / 2) + 1) / 2;
  const baseY = 0.52 - breathPhase * 0.06;

  return (baseY + w1 + w2 + w3) * canvasHeight;
}

// Warm dawn/dusk palette influenced by temperature
function makePalette(temp: number): {
  skyTop: string; skyBot: string; waterTop: string; waterBot: string; glowColor: string;
} {
  const t = Math.max(0, Math.min(1, (temp - 8) / 20)); // 0=cold 1=warm
  // Cold: deep blue/teal; Warm: amber/coral/peach
  const r1 = Math.round(10 + t * 60);
  const g1 = Math.round(18 + t * 20);
  const b1 = Math.round(38 - t * 10);
  const r2 = Math.round(6 + t * 40);
  const g2 = Math.round(14 + t * 25);
  const b2 = Math.round(35 - t * 12);
  const wr = Math.round(8 + t * 50);
  const wg = Math.round(22 + t * 30);
  const wb = Math.round(50 - t * 15);
  const gr = Math.round(80 + t * 120);
  const gg = Math.round(130 + t * 60);
  const gb = Math.round(180 - t * 60);
  return {
    skyTop: `rgb(${r1},${g1},${b1})`,
    skyBot: `rgb(${r2},${g2},${b2})`,
    waterTop: `rgb(${wr},${wg},${wb})`,
    waterBot: `rgb(4,12,28)`,
    glowColor: `rgba(${gr},${gg},${gb},`,
  };
}

// ── Canvas2D renderer ────────────────────────────────────────────────────────

export interface RendererHandle {
  setMarine: (d: MarineData) => void;
  stop: () => void;
  mode: "webgpu" | "canvas2d";
}

function runCanvas2D(canvas: HTMLCanvasElement): RendererHandle {
  const ctxMaybe = canvas.getContext("2d");
  if (!ctxMaybe) throw new Error("No 2D context");
  const ctx: CanvasRenderingContext2D = ctxMaybe;

  let params: WaveParams = { swellHeight: 1.2, swellPeriod: 11, temperature: 14 };
  let rafId = 0;
  let alive = true;
  const startTime = performance.now() / 1000;

  function drawFrame() {
    if (!alive) return;
    const W = canvas.width;
    const H = canvas.height;
    const t = performance.now() / 1000 - startTime;
    const pal = makePalette(params.temperature);

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.58);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(1, pal.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Build water polygon from wave height
    const steps = Math.ceil(W / 3);
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const y = computeWaterHeight(x, t, params, W, H);
      pts.push(x, y);
    }

    // Water body gradient
    const waterGrad = ctx.createLinearGradient(0, pts[1], 0, H);
    waterGrad.addColorStop(0, pal.waterTop);
    waterGrad.addColorStop(1, pal.waterBot);

    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.lineTo(pts[0], pts[1]);
      else ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = waterGrad;
    ctx.fill();

    // Horizon glow line
    ctx.save();
    ctx.shadowBlur = 28;
    ctx.shadowColor = pal.glowColor + "0.7)";
    ctx.strokeStyle = pal.glowColor + "0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[0], pts[1]);
      else ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.stroke();
    ctx.restore();

    // Soft surface shimmer — scattered glints
    const breathPhase = (Math.sin((t / Math.max(6, params.swellPeriod)) * 2 * Math.PI - Math.PI / 2) + 1) / 2;
    const glintCount = Math.round(6 + breathPhase * 10);
    for (let k = 0; k < glintCount; k++) {
      // Deterministic per-frame glint positions derived from t+k
      const gx = ((Math.sin(k * 2.39 + t * 0.11) * 0.5 + 0.5)) * W;
      const gy = computeWaterHeight(gx, t, params, W, H) - 2 - k * 1.2 * breathPhase;
      const alpha = 0.08 + breathPhase * 0.15;
      ctx.beginPath();
      ctx.arc(gx, gy, 2.5 + k * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = pal.glowColor + alpha + ")";
      ctx.fill();
    }

    rafId = requestAnimationFrame(drawFrame);
  }

  rafId = requestAnimationFrame(drawFrame);

  return {
    mode: "canvas2d",
    setMarine(d: MarineData) {
      params = {
        swellHeight: d.wave_height,
        swellPeriod: d.swell_wave_period || d.wave_period,
        temperature: d.sea_surface_temperature,
      };
    },
    stop() {
      alive = false;
      cancelAnimationFrame(rafId);
    },
  };
}

// ── WebGPU renderer ──────────────────────────────────────────────────────────

const WGSL_VERT = /* wgsl */ `
struct Vout { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> Vout {
  var xy = array<vec2f, 4>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(1,1));
  let p = xy[i];
  return Vout(vec4f(p, 0.0, 1.0), vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5));
}`;

// Fragment: warm wave water surface
const WGSL_FRAG = /* wgsl */ `
struct Uniforms {
  time: f32,
  swellHeight: f32,
  swellPeriod: f32,
  temperature: f32,
  aspect: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;

fn waveY(x: f32, t: f32, amp: f32, speed: f32, wlen: f32) -> f32 {
  let phase1 = (x / wlen) * 6.2832 - t * speed * 6.2832;
  let phase2 = (x / (wlen * 0.62)) * 6.2832 - t * speed * 1.7 * 6.2832 + 1.1;
  let phase3 = (x / (wlen * 1.4)) * 6.2832 - t * speed * 0.9 * 6.2832 + 2.3;
  return amp * sin(phase1) + amp * 0.45 * sin(phase2) + amp * 0.22 * sin(phase3);
}

@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = u.time;
  let sp = max(6.0, u.swellPeriod);
  let amp = clamp(0.04 + (u.swellHeight / 4.0) * 0.14, 0.0, 0.18);
  let speed = 0.6 / sp;
  let wlen = 0.28 + sp * 0.018;
  let breathPhase = (sin((t / sp) * 6.2832 - 1.5708) + 1.0) * 0.5;
  let baseY = 0.52 - breathPhase * 0.06;
  let surfaceY = baseY + waveY(uv.x, t, amp, speed, wlen);
  let below = uv.y > surfaceY;

  // Temperature-based palette
  let tempN = clamp((u.temperature - 8.0) / 20.0, 0.0, 1.0);

  // Sky
  let skyTop = vec3f(0.04 + tempN * 0.23, 0.07 + tempN * 0.08, 0.15 - tempN * 0.04);
  let skyBot = vec3f(0.02 + tempN * 0.16, 0.05 + tempN * 0.10, 0.14 - tempN * 0.05);
  let sky = mix(skyTop, skyBot, uv.y / surfaceY);

  // Water
  let waterTop = vec3f(0.03 + tempN * 0.20, 0.09 + tempN * 0.12, 0.20 - tempN * 0.06);
  let waterBot = vec3f(0.016, 0.047, 0.11);
  let waterDepth = clamp((uv.y - surfaceY) / (1.0 - surfaceY), 0.0, 1.0);
  let water = mix(waterTop, waterBot, waterDepth);

  // Horizon glow
  let distToSurf = abs(uv.y - surfaceY);
  let glowR = 0.31 + tempN * 0.47;
  let glowG = 0.51 + tempN * 0.24;
  let glowB = 0.71 - tempN * 0.24;
  let glow = vec3f(glowR, glowG, glowB) * (0.25 * breathPhase + 0.12) * exp(-distToSurf * 60.0);

  var col: vec3f;
  if (below) {
    col = water + glow;
  } else {
    col = sky + glow;
  }

  // Surface shimmer
  let shimmer = sin(uv.x * 200.0 + t * 3.0) * 0.5 + 0.5;
  let shimmerMask = exp(-distToSurf * 90.0) * breathPhase * shimmer * 0.09 * (0.5 + tempN * 0.5);
  col = col + vec3f(shimmerMask * glowR, shimmerMask * glowG, shimmerMask * glowB);

  return vec4f(col, 1.0);
}`;

interface GpuHandle {
  device: GPUDevice;
  pipeline: GPURenderPipeline;
  uniformBuf: GPUBuffer;
  bindGroup: GPUBindGroup;
  ctx: GPUCanvasContext;
}

async function initWebGPU(canvas: HTMLCanvasElement): Promise<GpuHandle> {
  if (!navigator.gpu) throw new Error("No WebGPU");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("No adapter");
  const device = await adapter.requestDevice();

  const fmt = navigator.gpu.getPreferredCanvasFormat();
  const ctxRaw = canvas.getContext("webgpu");
  if (!ctxRaw) throw new Error("No WebGPU canvas context");
  const ctx = ctxRaw as GPUCanvasContext;
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: device.createShaderModule({ code: WGSL_VERT }), entryPoint: "vs" },
    fragment: {
      module: device.createShaderModule({ code: WGSL_FRAG }),
      entryPoint: "fs",
      targets: [{ format: fmt }],
    },
    primitive: { topology: "triangle-strip" },
  });

  // Uniform buffer: 8 floats = 32 bytes
  const uniformBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
  });

  return { device, pipeline, uniformBuf, bindGroup, ctx };
}

async function runWebGPU(canvas: HTMLCanvasElement): Promise<RendererHandle> {
  const gpu = await initWebGPU(canvas);
  const { device, pipeline, uniformBuf, bindGroup, ctx } = gpu;

  let params: WaveParams = { swellHeight: 1.2, swellPeriod: 11, temperature: 14 };
  let rafId = 0;
  let alive = true;
  const startTime = performance.now() / 1000;

  function drawFrame() {
    if (!alive) return;
    const t = performance.now() / 1000 - startTime;
    const aspect = canvas.width / Math.max(1, canvas.height);

    const data = new Float32Array([
      t,
      params.swellHeight,
      params.swellPeriod,
      params.temperature,
      aspect,
      0, 0, 0,
    ]);
    device.queue.writeBuffer(uniformBuf, 0, data.buffer as ArrayBuffer);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: ctx.getCurrentTexture().createView(),
        loadOp: "clear" as GPULoadOp,
        storeOp: "store" as GPUStoreOp,
        clearValue: { r: 0.02, g: 0.05, b: 0.1, a: 1 },
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
    device.queue.submit([enc.finish()]);

    rafId = requestAnimationFrame(drawFrame);
  }

  rafId = requestAnimationFrame(drawFrame);

  return {
    mode: "webgpu",
    setMarine(d: MarineData) {
      params = {
        swellHeight: d.wave_height,
        swellPeriod: d.swell_wave_period || d.wave_period,
        temperature: d.sea_surface_temperature,
      };
    },
    stop() {
      alive = false;
      cancelAnimationFrame(rafId);
      device.destroy();
    },
  };
}

// ── Public factory — tries WebGPU, falls back to Canvas2D ────────────────────

export async function startRenderer(canvas: HTMLCanvasElement): Promise<RendererHandle> {
  try {
    return await runWebGPU(canvas);
  } catch {
    return runCanvas2D(canvas);
  }
}
