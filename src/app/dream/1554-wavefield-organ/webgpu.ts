// ─────────────────────────────────────────────────────────────────────────────
// webgpu.ts — the PRIMARY surface: a WGSL transliteration of wave.ts running a
// large plate + a big particle point-field entirely on the GPU.
//
//   Four passes per frame:
//     1. STEP     compute — advance the 2D wave equation (Dirichlet edges).
//     2. FORCE    compute — inject each steerable source's sinusoidal drive.
//     3. PARTICLE compute — walk ~48k points down the gradient of u² so they
//                           pool on the nodal lines (the Chladni figure).
//     4. RENDER   — a full-screen interference wash, then instanced additive
//                   violet point sprites for the particle cloud.
//
//   Point-based GPU wavefields are the technique behind TouchDesigner's POP
//   (Point Operator) wavefield components (2025); this is the same idea built
//   from first principles on the raw wave PDE. If navigator.gpu / the adapter is
//   missing, initWebGpu returns null and page.tsx runs the identical model on
//   the CPU (Canvas-2D fallback) — the piece is fully demoable with no GPU.
// ─────────────────────────────────────────────────────────────────────────────

import type { SourceState } from "./wave";

export const GPU_GRID = 356;
export const GPU_PARTICLES = 48000;
const MAX_SRC = 8;

export interface GpuFrameState {
  sources: SourceState[];
  /** |u| at each source (shared with audio) → source-glow brightness. */
  sourceLum: number[];
  c2: number;
  damping: number;
  chladni: number;
  jitter: number;
  dt: number;
  /** safe-flicker luminance multiplier (≥ floor, ≤ 1). */
  flick: number;
  frame: number;
}

// ── WGSL ─────────────────────────────────────────────────────────────────────

const WGSL_STEP = /* wgsl */ `
struct SP { grid:u32, c2:f32, damping:f32, pad:f32 };
@group(0) @binding(0) var<storage, read> prevB: array<f32>;
@group(0) @binding(1) var<storage, read> currB: array<f32>;
@group(0) @binding(2) var<storage, read_write> nextB: array<f32>;
@group(0) @binding(3) var<uniform> P: SP;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(P.grid);
  let x = i32(gid.x); let y = i32(gid.y);
  if (x >= g || y >= g) { return; }
  let i = y * g + x;
  if (x == 0 || y == 0 || x == g - 1 || y == g - 1) { nextB[i] = 0.0; return; }
  let c = currB[i];
  let lap = currB[i-1] + currB[i+1] + currB[i-g] + currB[i+g] - 4.0 * c;
  nextB[i] = (2.0 * c - prevB[i] + P.c2 * lap) * P.damping;
}`;

const WGSL_FORCE = /* wgsl */ `
struct FP { grid:u32, count:u32, a:u32, b:u32, src: array<vec4<f32>, ${MAX_SRC}> };
@group(0) @binding(0) var<storage, read_write> curr: array<f32>;
@group(0) @binding(1) var<uniform> F: FP;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g = i32(F.grid);
  let x = i32(gid.x); let y = i32(gid.y);
  if (x < 1 || y < 1 || x >= g - 1 || y >= g - 1) { return; }
  var add = 0.0;
  for (var k = 0u; k < F.count; k = k + 1u) {
    let s = F.src[k];               // xy = cell centre, z = radius, w = signed amp
    let d = vec2<f32>(f32(x) - s.x, f32(y) - s.y);
    add = add + s.w * exp(-dot(d, d) / max(s.z * s.z, 1.0));
  }
  if (add != 0.0) { curr[y * g + x] = curr[y * g + x] + add; }
}`;

const WGSL_PARTICLE = /* wgsl */ `
struct PP { grid:u32, count:u32, chladni:f32, jitter:f32, dt:f32, seed:f32, p0:f32, p1:f32 };
@group(0) @binding(0) var<storage, read> field: array<f32>;
@group(0) @binding(1) var<storage, read_write> parts: array<vec4<f32>>;
@group(0) @binding(2) var<uniform> Q: PP;
fn hash(n: f32) -> f32 { return fract(sin(n) * 43758.5453123); }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= Q.count) { return; }
  let g = i32(Q.grid);
  var p = parts[i];
  var pos = p.xy;
  var vel = p.zw;
  let fx = clamp(pos.x, 0.001, 0.999) * f32(g - 1);
  let fy = clamp(pos.y, 0.001, 0.999) * f32(g - 1);
  let cx = clamp(i32(fx), 1, g - 2);
  let cy = clamp(i32(fy), 1, g - 2);
  let idx = cy * g + cx;
  let uc = field[idx];
  // ∇u central difference → force = −2·k·u·∇u (down the u² gradient, to nodes)
  let gx = (field[idx + 1] - field[idx - 1]) * 0.5;
  let gy = (field[idx + g] - field[idx - g]) * 0.5;
  let jx = (hash(f32(i) * 0.017 + Q.seed) - 0.5) * Q.jitter;
  let jy = (hash(f32(i) * 0.031 + Q.seed + 7.0) - 0.5) * Q.jitter;
  vel = vel + vec2<f32>(-2.0 * Q.chladni * uc * gx + jx, -2.0 * Q.chladni * uc * gy + jy);
  vel = vel * 0.82;
  pos = pos + vel * Q.dt;
  if (pos.x < 0.02) { pos.x = 0.02; vel.x = -vel.x * 0.4; }
  if (pos.x > 0.98) { pos.x = 0.98; vel.x = -vel.x * 0.4; }
  if (pos.y < 0.02) { pos.y = 0.02; vel.y = -vel.y * 0.4; }
  if (pos.y > 0.98) { pos.y = 0.98; vel.y = -vel.y * 0.4; }
  parts[i] = vec4<f32>(pos, vel);
}`;

const WGSL_BG = /* wgsl */ `
struct BG { grid:u32, nSrc:u32, a:u32, b:u32, flick:f32, offX:f32, offY:f32, side:f32,
            src: array<vec4<f32>, ${MAX_SRC}> };
@group(0) @binding(0) var<storage, read> field: array<f32>;
@group(0) @binding(1) var<uniform> B: BG;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.,-1.), vec2<f32>(3.,-1.), vec2<f32>(-1.,3.));
  return vec4<f32>(p[i], 0., 1.);
}
@fragment fn fs(@builtin(position) fc: vec4<f32>) -> @location(0) vec4<f32> {
  let plate = vec2<f32>((fc.x - B.offX) / B.side, (fc.y - B.offY) / B.side);
  var col = vec3<f32>(0.018, 0.010, 0.045);
  if (plate.x >= 0.0 && plate.x <= 1.0 && plate.y >= 0.0 && plate.y <= 1.0) {
    let g = i32(B.grid);
    let ix = clamp(i32(plate.x * f32(g - 1)), 0, g - 1);
    let iy = clamp(i32(plate.y * f32(g - 1)), 0, g - 1);
    let amp = abs(field[iy * g + ix]);
    let wash = clamp(amp * 4.0, 0.0, 1.0);
    col = mix(vec3<f32>(0.03, 0.015, 0.07), vec3<f32>(0.17, 0.08, 0.42), wash);
    for (var k = 0u; k < B.nSrc; k = k + 1u) {
      let s = B.src[k];
      let d = plate - s.xy;
      col = col + vec3<f32>(0.52, 0.34, 0.95) * (s.z * exp(-dot(d, d) / 0.0016) * 1.3);
    }
  }
  return vec4<f32>(col * B.flick, 1.0);
}`;

const WGSL_POINTS = /* wgsl */ `
struct PR { grid:u32, count:u32, a:u32, b:u32, offX:f32, offY:f32, side:f32, ptSize:f32,
            resW:f32, resH:f32, flick:f32, p2:f32 };
@group(0) @binding(0) var<storage, read> parts: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> field: array<f32>;
@group(0) @binding(2) var<uniform> R: PR;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) local: vec2<f32>, @location(1) lum: f32 };
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
  var corner = array<vec2<f32>, 6>(
    vec2<f32>(-1.,-1.), vec2<f32>(1.,-1.), vec2<f32>(-1.,1.),
    vec2<f32>(-1.,1.),  vec2<f32>(1.,-1.), vec2<f32>(1.,1.));
  let c = corner[vi];
  let p = parts[ii].xy;
  let g = i32(R.grid);
  let ix = clamp(i32(clamp(p.x,0.,1.) * f32(g - 1)), 0, g - 1);
  let iy = clamp(i32(clamp(p.y,0.,1.) * f32(g - 1)), 0, g - 1);
  let lum = clamp(abs(field[iy * g + ix]) * 6.0, 0.0, 1.0);
  // plate 0..1 → pixel → clip, with letterbox offset and y-flip
  let pixel = vec2<f32>(R.offX + p.x * R.side, R.offY + p.y * R.side)
              + c * R.ptSize;
  let clip = vec2<f32>(pixel.x / R.resW * 2.0 - 1.0, 1.0 - pixel.y / R.resH * 2.0);
  var o: VOut;
  o.pos = vec4<f32>(clip, 0.0, 1.0);
  o.local = c;
  o.lum = lum;
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4<f32> {
  let d = dot(in.local, in.local);
  let fall = exp(-d * 3.2);
  // violet point that warms toward magenta at antinodes (bright), all in-brand
  let base = vec3<f32>(0.34, 0.20, 0.72);
  let hot = vec3<f32>(0.62, 0.30, 0.92);
  let col = mix(base, hot, in.lum) * (0.35 + 0.9 * in.lum);
  return vec4<f32>(col * fall * R.flick, fall);
}`;

// ── backend ──────────────────────────────────────────────────────────────────

export interface GpuBackend {
  frame(state: GpuFrameState): void;
  destroy(): void;
}

export async function initWebGpu(
  canvas: HTMLCanvasElement,
): Promise<GpuBackend | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;

  let device: GPUDevice;
  try {
    device = await adapter.requestDevice();
  } catch {
    return null;
  }
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    device.destroy();
    return null;
  }
  const fmt = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format: fmt, alphaMode: "opaque" });

  const G = GPU_GRID;
  const cells = G * G;
  const mkField = () =>
    device.createBuffer({
      size: cells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  let bPrev = mkField();
  let bCurr = mkField();
  let bNext = mkField();

  // particle buffer (vec4 each) seeded with a deterministic scatter
  const parts = device.createBuffer({
    size: GPU_PARTICLES * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  {
    const seedArr = new Float32Array(GPU_PARTICLES * 4);
    let s = 0x2545f491;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    for (let i = 0; i < GPU_PARTICLES; i++) {
      seedArr[i * 4] = 0.05 + 0.9 * rnd();
      seedArr[i * 4 + 1] = 0.05 + 0.9 * rnd();
    }
    device.queue.writeBuffer(parts, 0, seedArr);
  }

  const stepParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const forceParams = device.createBuffer({ size: 16 + MAX_SRC * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const partParams = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const bgParams = device.createBuffer({ size: 32 + MAX_SRC * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const ptParams = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const mod = (code: string) => device.createShaderModule({ code });
  const stepPipe = device.createComputePipeline({ layout: "auto", compute: { module: mod(WGSL_STEP), entryPoint: "main" } });
  const forcePipe = device.createComputePipeline({ layout: "auto", compute: { module: mod(WGSL_FORCE), entryPoint: "main" } });
  const partPipe = device.createComputePipeline({ layout: "auto", compute: { module: mod(WGSL_PARTICLE), entryPoint: "main" } });

  const bgMod = mod(WGSL_BG);
  const bgPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: bgMod, entryPoint: "vs" },
    fragment: { module: bgMod, entryPoint: "fs", targets: [{ format: fmt }] },
    primitive: { topology: "triangle-list" },
  });
  const ptMod = mod(WGSL_POINTS);
  const ptPipe = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: ptMod, entryPoint: "vs" },
    fragment: {
      module: ptMod,
      entryPoint: "fs",
      targets: [
        {
          format: fmt,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  const dpr = Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);
  let outW = 2;
  let outH = 2;
  const resize = () => {
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (w === outW && h === outH && canvas.width === w) return;
    outW = w;
    outH = h;
    canvas.width = w;
    canvas.height = h;
  };
  resize();

  const stepBuf = new ArrayBuffer(16);
  const forceBuf = new ArrayBuffer(16 + MAX_SRC * 16);
  const partBuf = new ArrayBuffer(32);
  const bgBuf = new ArrayBuffer(32 + MAX_SRC * 16);
  const ptBuf = new ArrayBuffer(48);

  let disposed = false;

  const frame = (st: GpuFrameState) => {
    if (disposed) return;
    resize();
    const side = Math.min(outW, outH);
    const offX = (outW - side) / 2;
    const offY = (outH - side) / 2;

    const enc = device.createCommandEncoder();

    // 1. wave step (a couple of sub-steps for crisp propagation)
    {
      const u32 = new Uint32Array(stepBuf, 0, 1);
      const f32 = new Float32Array(stepBuf, 4, 3);
      u32[0] = G;
      f32[0] = st.c2;
      f32[1] = st.damping;
      device.queue.writeBuffer(stepParams, 0, stepBuf);
    }
    for (let s = 0; s < 2; s++) {
      const bg = device.createBindGroup({
        layout: stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bPrev } },
          { binding: 1, resource: { buffer: bCurr } },
          { binding: 2, resource: { buffer: bNext } },
          { binding: 3, resource: { buffer: stepParams } },
        ],
      });
      const pass = enc.beginComputePass();
      pass.setPipeline(stepPipe);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
      pass.end();
      const t = bPrev; bPrev = bCurr; bCurr = bNext; bNext = t;
    }

    // 2. force sources into curr once per frame (matches the CPU shadow's
    //    single injection so both backends stay bounded and in step).
    {
      const u32 = new Uint32Array(forceBuf, 0, 4);
      const sf = new Float32Array(forceBuf, 16);
      const n = Math.min(MAX_SRC, st.sources.length);
      u32[0] = G;
      u32[1] = n;
      for (let k = 0; k < n; k++) {
        const src = st.sources[k];
        sf[k * 4] = src.x * (G - 1);
        sf[k * 4 + 1] = src.y * (G - 1);
        sf[k * 4 + 2] = Math.max(2, 0.02 * G);
        sf[k * 4 + 3] = src.drive;
      }
      device.queue.writeBuffer(forceParams, 0, forceBuf);
      const fbg = device.createBindGroup({
        layout: forcePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bCurr } },
          { binding: 1, resource: { buffer: forceParams } },
        ],
      });
      const fpass = enc.beginComputePass();
      fpass.setPipeline(forcePipe);
      fpass.setBindGroup(0, fbg);
      fpass.dispatchWorkgroups(Math.ceil(G / 8), Math.ceil(G / 8));
      fpass.end();
    }

    // 3. advect particles toward nodes
    {
      const u32 = new Uint32Array(partBuf, 0, 2);
      const f32 = new Float32Array(partBuf, 8, 6);
      u32[0] = G;
      u32[1] = GPU_PARTICLES;
      f32[0] = st.chladni;
      f32[1] = st.jitter;
      f32[2] = st.dt;
      f32[3] = (st.frame % 997) * 0.1;
      device.queue.writeBuffer(partParams, 0, partBuf);
      const pbg = device.createBindGroup({
        layout: partPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bCurr } },
          { binding: 1, resource: { buffer: parts } },
          { binding: 2, resource: { buffer: partParams } },
        ],
      });
      const ppass = enc.beginComputePass();
      ppass.setPipeline(partPipe);
      ppass.setBindGroup(0, pbg);
      ppass.dispatchWorkgroups(Math.ceil(GPU_PARTICLES / 64));
      ppass.end();
    }

    const view = ctx.getCurrentTexture().createView();

    // 4a. background interference wash + source glows
    {
      const u32 = new Uint32Array(bgBuf, 0, 4);
      const f32 = new Float32Array(bgBuf, 16, 4);
      const sf = new Float32Array(bgBuf, 32);
      const n = Math.min(MAX_SRC, st.sources.length);
      u32[0] = G;
      u32[1] = n;
      f32[0] = st.flick;
      f32[1] = offX;
      f32[2] = offY;
      f32[3] = side;
      for (let k = 0; k < n; k++) {
        sf[k * 4] = st.sources[k].x;
        sf[k * 4 + 1] = st.sources[k].y;
        sf[k * 4 + 2] = st.sourceLum[k] ?? 0;
      }
      device.queue.writeBuffer(bgParams, 0, bgBuf);
      const bbg = device.createBindGroup({
        layout: bgPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: bCurr } },
          { binding: 1, resource: { buffer: bgParams } },
        ],
      });
      const rpass = enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      rpass.setPipeline(bgPipe);
      rpass.setBindGroup(0, bbg);
      rpass.draw(3);
      rpass.end();
    }

    // 4b. additive violet point-field on top
    {
      const u32 = new Uint32Array(ptBuf, 0, 2);
      const f32 = new Float32Array(ptBuf, 16, 7);
      u32[0] = G;
      u32[1] = GPU_PARTICLES;
      f32[0] = offX;
      f32[1] = offY;
      f32[2] = side;
      f32[3] = Math.max(1.2, side * 0.0016 * dpr);
      f32[4] = outW;
      f32[5] = outH;
      f32[6] = st.flick;
      device.queue.writeBuffer(ptParams, 0, ptBuf);
      const pbg = device.createBindGroup({
        layout: ptPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: parts } },
          { binding: 1, resource: { buffer: bCurr } },
          { binding: 2, resource: { buffer: ptParams } },
        ],
      });
      const rpass = enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: "load", storeOp: "store" }],
      });
      rpass.setPipeline(ptPipe);
      rpass.setBindGroup(0, pbg);
      rpass.draw(6, GPU_PARTICLES);
      rpass.end();
    }

    device.queue.submit([enc.finish()]);
  };

  const destroy = () => {
    if (disposed) return;
    disposed = true;
    try {
      bPrev.destroy();
      bCurr.destroy();
      bNext.destroy();
      parts.destroy();
      device.destroy();
    } catch {
      /* ignore */
    }
  };

  return { frame, destroy };
}
